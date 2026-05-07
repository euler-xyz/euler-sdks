import assert from "node:assert/strict";
import { test } from "vitest";
import {
	createPythPlugin,
	PythPluginAdapter,
} from "../src/plugins/pyth/pythPlugin.js";
import {
	encodeFunctionData,
	getAddress,
	type Address,
	type PublicClient,
} from "viem";
import { Account } from "../src/entities/Account.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../src/services/executionService/index.js";
import { flattenBatchEntries } from "../src/services/executionService/index.js";

const GOOD_FEED =
	"0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" as const;
const MISSING_FEED =
	"0x70cd05521e3bdeaee2cadc1360f0d95397f03275f273199be35a029114f53a3b" as const;
const PYTH = getAddress("0x00000000000000000000000000000000000000AA");
const OWNER = getAddress("0x00000000000000000000000000000000000000BB");
const EVC = getAddress("0x00000000000000000000000000000000000000CC");
const CONTROLLER = getAddress("0x00000000000000000000000000000000000000DD");
const COLLATERAL = getAddress("0x00000000000000000000000000000000000000EE");
const ASSET = getAddress("0x00000000000000000000000000000000000000A1");
const UNIT = getAddress("0x00000000000000000000000000000000000000A2");

function getRequestedIds(url: string): string[] {
	return new URL(url).searchParams.getAll("ids[]");
}

test("PythPluginAdapter retries Hermes 404s without missing price ids", async () => {
	const requestedIds: string[][] = [];

	const fetchFn = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		const ids = getRequestedIds(url);
		requestedIds.push(ids);

		if (ids.includes(MISSING_FEED)) {
			return new Response(`Price ids not found: ${MISSING_FEED}`, {
				status: 404,
			});
		}

		return Response.json({
			binary: {
				encoding: "hex",
				data: ["abc123"],
			},
		});
	}) as typeof fetch;

	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		fetchFn,
	);
	const updateData = await adapter.queryPythUpdateData([
		GOOD_FEED,
		MISSING_FEED,
	]);

	assert.deepEqual(updateData, ["0xabc123"]);
	assert.deepEqual(requestedIds, [[GOOD_FEED, MISSING_FEED], [GOOD_FEED]]);
});

test("PythPluginAdapter returns no update data when all Hermes ids are missing", async () => {
	const requestedIds: string[][] = [];

	const fetchFn = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		const ids = getRequestedIds(url);
		requestedIds.push(ids);

		return new Response(`Price ids not found: ${ids.join(", ")}`, {
			status: 404,
		});
	}) as typeof fetch;

	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		fetchFn,
	);
	const updateData = await adapter.queryPythUpdateData([MISSING_FEED]);

	assert.deepEqual(updateData, []);
	assert.deepEqual(requestedIds, [[MISSING_FEED]]);
});

test("Pyth plugin uses final batch controller and collateral state for health checks", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		Response.json({
			binary: {
				encoding: "hex",
				data: ["feedface"],
			},
		})) as typeof fetch;

	try {
		let fetchedAccount = false;
		let fetchedVaultOptions: unknown;
		const provider = {
			readContract: async () => 11n,
		} as unknown as PublicClient;
		const sdk = {
			accountService: {
				fetchAccount: async () => {
					fetchedAccount = true;
					return {
						result: new Account({
							chainId: 1,
							owner: OWNER,
							populated: { vaults: true },
							isLockdownMode: false,
							isPermitDisabledMode: false,
							subAccounts: {},
						}),
						errors: [],
					};
				},
			},
			providerService: {
				getProvider: () => provider,
			},
			vaultMetaService: {
				fetchVaults: async (
					_chainId: number,
					_vaults: Address[],
					options: unknown,
				) => {
					fetchedVaultOptions = options;
					return {
						result: [
							{
								address: CONTROLLER,
								debtPricingOracleAdapters: [],
								collaterals: [
									{
										address: COLLATERAL,
										oracleAdapters: [
											{
												oracle: PYTH,
												name: "PythOracle",
												base: ASSET,
												quote: UNIT,
												pythDetail: {
													pyth: PYTH,
													base: ASSET,
													quote: UNIT,
													feedId: GOOD_FEED,
													maxStaleness: 60n,
													maxConfWidth: 1n,
												},
											},
										],
									},
								],
							},
						],
						errors: [],
					};
				},
			},
		} as never;

		const batchItem = (
			targetContract: Address,
			onBehalfOfAccount: Address,
			data: EVCBatchItem["data"],
		): EVCBatchItem => ({
			targetContract,
			onBehalfOfAccount,
			value: 0n,
			data,
		});

		const plan: TransactionPlan = [
			{
				type: "evcBatch",
				items: [
					batchItem(
						EVC,
						OWNER,
						encodeFunctionData({
							abi: ethereumVaultConnectorAbi,
							functionName: "enableController",
							args: [OWNER, CONTROLLER],
						}),
					),
					batchItem(
						EVC,
						OWNER,
						encodeFunctionData({
							abi: ethereumVaultConnectorAbi,
							functionName: "enableCollateral",
							args: [OWNER, COLLATERAL],
						}),
					),
					batchItem(
						CONTROLLER,
						OWNER,
						encodeFunctionData({
							abi: eVaultAbi,
							functionName: "borrow",
							args: [1n, OWNER],
						}),
					),
				],
			},
		];

		const processed = await createPythPlugin().processPlan?.(plan, OWNER, 1, sdk);
		assert.ok(processed);
		assert.equal(fetchedAccount, true);
		assert.deepEqual(fetchedVaultOptions, {
			populateCollaterals: true,
			populateMarketPrices: false,
			populateRewards: false,
			populateIntrinsicApy: false,
			populateLabels: false,
		});
		const [entry] = processed;
		assert.equal(entry.type, "evcBatch");
		if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
		const items = flattenBatchEntries(entry.items);
		assert.equal(items.length, 4);
		assert.equal(items[0]?.targetContract, PYTH);
		assert.equal(items[0]?.onBehalfOfAccount, OWNER);
		assert.equal(items[0]?.value, 11n);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
