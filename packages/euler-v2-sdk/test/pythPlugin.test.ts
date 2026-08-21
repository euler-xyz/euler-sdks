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
	type Hex,
	type PublicClient,
} from "viem";
import { Account, SubAccount } from "../src/entities/Account.js";
import { EulerSDK } from "../src/sdk/sdk.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../src/services/executionService/index.js";
import { flattenBatchEntries } from "../src/services/executionService/index.js";
import type { PluginPrefetchData } from "../src/plugins/types.js";

const GOOD_FEED =
	"0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" as const;
const MISSING_FEED =
	"0x70cd05521e3bdeaee2cadc1360f0d95397f03275f273199be35a029114f53a3b" as const;
const OTHER_FEED =
	"0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" as const;
const DEBT_FEED =
	"0xca80ba6dc32e08d43fdb83e2b05dbc5bc907c7dd3f5d1266f998e92fbff3503f" as const;
const PYTH = getAddress("0x4305FB66699C3B2702D4d05CF36551390A4c69C6");
const UNTRUSTED_PYTH = getAddress("0x00000000000000000000000000000000000000AA");
const OWNER = getAddress("0x00000000000000000000000000000000000000BB");
const EVC = getAddress("0x00000000000000000000000000000000000000CC");
const CONTROLLER = getAddress("0x00000000000000000000000000000000000000DD");
const COLLATERAL = getAddress("0x00000000000000000000000000000000000000EE");
const OTHER_COLLATERAL = getAddress(
	"0x00000000000000000000000000000000000000EF",
);
const VIOLATOR = getAddress("0x00000000000000000000000000000000000000F0");
const ASSET = getAddress("0x00000000000000000000000000000000000000A1");
const UNIT = getAddress("0x00000000000000000000000000000000000000A2");

const makePythRoute = (oracle = PYTH, feedId = GOOD_FEED) => ({
	base: ASSET,
	quote: UNIT,
	source: "direct" as const,
	steps: [
		{
			kind: "adapter" as const,
			oracle,
			name: "PythOracle",
			base: ASSET,
			quote: UNIT,
			pythDetail: {
				pyth: oracle,
				base: ASSET,
				quote: UNIT,
				feedId,
				maxStaleness: 60n,
				maxConfWidth: 1n,
			},
		},
	],
});

function getRequestedIds(url: string): string[] {
	return new URL(url).searchParams.getAll("ids[]");
}

const makeLiquidationPlan = (): TransactionPlan => [
	{
		type: "evcBatch",
		items: [
			{
				targetContract: CONTROLLER,
				onBehalfOfAccount: OWNER,
				value: 0n,
				data: encodeFunctionData({
					abi: eVaultAbi,
					functionName: "liquidate",
					args: [VIOLATOR, COLLATERAL, 1n, 0n],
				}),
			},
		],
	},
];

const makeViolatorSubAccount = () =>
	new SubAccount({
		timestamp: 0,
		account: VIOLATOR,
		owner: VIOLATOR,
		lastAccountStatusCheckTimestamp: 0,
		enabledControllers: [CONTROLLER],
		enabledCollaterals: [COLLATERAL, OTHER_COLLATERAL],
		positions: [
			{
				account: VIOLATOR,
				vaultAddress: CONTROLLER,
				vault: { address: CONTROLLER },
				asset: ASSET,
				shares: 0n,
				assets: 0n,
				borrowed: 1n,
				isController: true,
				isCollateral: false,
				balanceForwarderEnabled: false,
			},
			...([COLLATERAL, OTHER_COLLATERAL] as const).map((vaultAddress) => ({
				account: VIOLATOR,
				vaultAddress,
				vault: { address: vaultAddress },
				asset: ASSET,
				shares: 1n,
				assets: 1n,
				borrowed: 0n,
				isController: false,
				isCollateral: true,
				balanceForwarderEnabled: false,
			})),
		],
	});

const makeLiquidationSdk = (
	fetchSubAccount: () => Promise<{
		result: ReturnType<typeof makeViolatorSubAccount> | undefined;
		errors: Array<{ message: string; severity: "info" | "warning" | "error" }>;
	}>,
) => ({
	accountService: {
		fetchAccount: async () => ({
			result: new Account({
				chainId: 1,
				owner: OWNER,
				populated: { vaults: true },
				isLockdownMode: false,
				isPermitDisabledMode: false,
				subAccounts: {},
			}),
			errors: [],
		}),
		fetchSubAccount,
	},
	providerService: {
		getProvider: () =>
			({ readContract: async () => 11n }) as unknown as PublicClient,
	},
	vaultMetaService: {
		fetchVaults: async () => ({
			result: [
				{
					address: CONTROLLER,
					asset: { address: ASSET },
					unitOfAccount: { address: UNIT },
					debtPricingOracleRoute: makePythRoute(PYTH, DEBT_FEED),
					collaterals: [
						{ address: COLLATERAL, oracleRoute: makePythRoute() },
						{
							address: OTHER_COLLATERAL,
							oracleRoute: makePythRoute(PYTH, OTHER_FEED),
						},
					],
				},
			],
			errors: [],
		}),
	},
});

test("PythPluginAdapter rejects Hermes 404s when any requested feed is missing", async () => {
	const requestedIds: string[][] = [];

	const fetchFn = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		const ids = getRequestedIds(url);
		requestedIds.push(ids);

		return new Response(`Price ids not found: ${MISSING_FEED}`, {
			status: 404,
		});
	}) as typeof fetch;

	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		fetchFn,
	);
	await assert.rejects(
		adapter.queryPythUpdateBundle([GOOD_FEED, MISSING_FEED]),
		/Failed to fetch Pyth update data: 404.*Price ids not found/,
	);
	assert.deepEqual(requestedIds, [[MISSING_FEED, GOOD_FEED]]);
});

test("PythPluginAdapter returns feed-aligned publish-time evidence", async () => {
	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		(async (input: RequestInfo | URL) => {
			const url = new URL(input.toString());
			assert.equal(url.searchParams.get("parsed"), "true");
			return Response.json({
				binary: { encoding: "hex", data: ["feedface"] },
				parsed: [
					{ id: OTHER_FEED, price: { publish_time: 1_900_000_002 } },
					{ id: GOOD_FEED, price: { publish_time: 1_900_000_001 } },
				],
			});
		}) as typeof fetch,
	);

	const bundle = await adapter.queryPythUpdateBundle([OTHER_FEED, GOOD_FEED]);
	assert.deepEqual(bundle, {
		feedIds: [GOOD_FEED, OTHER_FEED],
		publishTimes: [1_900_000_001, 1_900_000_002],
		updates: ["0xfeedface"],
	});
});

test("PythPluginAdapter isolates concurrent feed sets and their update fees", async () => {
	const requestedIds: string[][] = [];
	const feePayloads: Hex[][] = [];
	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		(async (input: RequestInfo | URL) => {
			const ids = getRequestedIds(input.toString());
			requestedIds.push(ids);
			const data = ids.length === 1
				? new Map<string, string>([
						[GOOD_FEED, "aaaa"],
						[OTHER_FEED, "bbbb"],
					]).get(ids[0]!) ?? "cccc"
				: "cccc";
			return Response.json({
				binary: { encoding: "hex", data: [data] },
				parsed: ids.map((id) => ({
					id,
					price: {
						publish_time: id === GOOD_FEED ? 1_900_000_001 : 1_900_000_002,
					},
				})),
			});
		}) as typeof fetch,
	);
	const provider = {
		readContract: async ({ args }: { args: readonly [Hex[]] }) => {
			feePayloads.push(args[0]);
			return args[0][0] === "0xaaaa" ? 11n : 22n;
		},
	} as unknown as PublicClient;

	const [goodBundle, otherBundle] = await Promise.all([
		adapter.queryPythUpdateBundle([GOOD_FEED]),
		adapter.queryPythUpdateBundle([OTHER_FEED]),
	]);
	const [goodFee, otherFee] = await Promise.all([
		adapter.queryPythUpdateFee(provider, PYTH, goodBundle.updates),
		adapter.queryPythUpdateFee(provider, PYTH, otherBundle.updates),
	]);

	assert.deepEqual(requestedIds, [[GOOD_FEED], [OTHER_FEED]]);
	assert.deepEqual(goodBundle, {
		feedIds: [GOOD_FEED],
		publishTimes: [1_900_000_001],
		updates: ["0xaaaa"],
	});
	assert.deepEqual(otherBundle, {
		feedIds: [OTHER_FEED],
		publishTimes: [1_900_000_002],
		updates: ["0xbbbb"],
	});
	assert.deepEqual(feePayloads, [["0xaaaa"], ["0xbbbb"]]);
	assert.equal(goodFee, 11n);
	assert.equal(otherFee, 22n);
});

test("PythPluginAdapter coalesces equivalent normalized feed sets", async () => {
	let requests = 0;
	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		(async (input: RequestInfo | URL) => {
			requests += 1;
			const ids = getRequestedIds(input.toString());
			return Response.json({
				binary: { encoding: "hex", data: ["feedface"] },
				parsed: ids.map((id, index) => ({
					id,
					price: { publish_time: 1_900_000_001 + index },
				})),
			});
		}) as typeof fetch,
	);

	const [first, second] = await Promise.all([
		adapter.queryPythUpdateBundle([OTHER_FEED, GOOD_FEED]),
		adapter.queryPythUpdateBundle([GOOD_FEED, OTHER_FEED, GOOD_FEED]),
	]);

	assert.equal(requests, 1);
	assert.deepEqual(first, second);
	assert.deepEqual(first.feedIds, [GOOD_FEED, OTHER_FEED]);
});

test.each(["processPlan", "prefetch"] as const)(
	"Pyth plugin %s includes every violator collateral feed for liquidation",
	async (path) => {
		const requestedIds = new Set<string>();
		const fetchFn = (async (input: RequestInfo | URL) => {
			const ids = getRequestedIds(input.toString());
			for (const id of ids) requestedIds.add(id);
			return Response.json({
				binary: { encoding: "hex", data: ["feedface"] },
				parsed: ids.map((id, index) => ({
					id,
					price: { publish_time: 1_900_000_000 + index },
				})),
			});
		}) as typeof fetch;
		const fetchSubAccount = async () => ({
			result: makeViolatorSubAccount(),
			errors: [],
		});
		const sdk = makeLiquidationSdk(fetchSubAccount) as never;
		const plugin = createPythPlugin({ fetchFn });
		const plan = makeLiquidationPlan();

		if (path === "processPlan") {
			const processed = await plugin.processPlan?.(plan, OWNER, 1, sdk);
			assert.equal(processed?.[0]?.type, "evcBatch");
			if (processed?.[0]?.type !== "evcBatch") {
				throw new Error("expected evcBatch");
			}
			assert.equal(flattenBatchEntries(processed[0].items)[0]?.targetContract, PYTH);
		} else {
			const prefetch = await plugin.prefetch?.(plan, OWNER, 1, sdk);
			assert.equal(prefetch?.entries.length, 1);
			assert.deepEqual(
				new Set(prefetch?.entries[0]?.feedIds),
				new Set([DEBT_FEED, GOOD_FEED, OTHER_FEED]),
			);
			assert.equal(prefetch?.entries[0]?.publishTimes.length, 3);
		}

		assert.deepEqual(
			requestedIds,
			new Set([DEBT_FEED, GOOD_FEED, OTHER_FEED]),
		);
	},
);

test.each(["processPlan", "prefetch"] as const)(
	"Pyth plugin %s fails closed when violator metadata is incomplete",
	async (path) => {
		const sdk = makeLiquidationSdk(async () => ({
			result: undefined,
			errors: [{ message: "violator snapshot incomplete", severity: "error" }],
		})) as never;
		const plugin = createPythPlugin();
		const call = path === "processPlan"
			? plugin.processPlan?.(makeLiquidationPlan(), OWNER, 1, sdk)
			: plugin.prefetch?.(makeLiquidationPlan(), OWNER, 1, sdk);

		await assert.rejects(
			call,
			/Pyth liquidation enrichment could not load complete violator metadata.*violator snapshot incomplete/,
		);
	},
);

test.each(["processPlugins", "prefetchPluginData"] as const)(
	"SDK %s propagates fatal Pyth liquidation metadata failures",
	async (path) => {
		const base = makeLiquidationSdk(async () => ({
			result: undefined,
			errors: [{ message: "violator snapshot incomplete", severity: "error" }],
		}));
		const sdk = Object.assign(Object.create(EulerSDK.prototype), base, {
			plugins: [createPythPlugin()],
		}) as EulerSDK;

		const call = path === "processPlugins"
			? sdk.processPlugins(makeLiquidationPlan(), OWNER, 1)
			: sdk.prefetchPluginData(makeLiquidationPlan(), OWNER, 1);

		await assert.rejects(
			call,
			/Pyth liquidation enrichment could not load complete violator metadata/,
		);
	},
);

test.each(["processPlugins", "prefetchPluginData"] as const)(
	"SDK %s fails closed for every plugin error",
	async (path) => {
		const failure = new Error("required plugin unavailable");
		const plugin = path === "processPlugins"
			? {
					name: "required",
					processPlan: async () => {
						throw failure;
					},
				}
			: {
					name: "required",
					prefetch: async () => {
						throw failure;
					},
				};
		const sdk = Object.assign(Object.create(EulerSDK.prototype), {
			plugins: [plugin],
		}) as EulerSDK;

		const call = path === "processPlugins"
			? sdk.processPlugins([], OWNER, 1)
			: sdk.prefetchPluginData([], OWNER, 1);

		await assert.rejects(call, failure);
	},
);

test("Pyth liquidation enrichment ignores non-blocking controller diagnostics", async () => {
	const fetchSubAccount = async () => ({
		result: makeViolatorSubAccount(),
		errors: [],
	});
	const sdk = makeLiquidationSdk(fetchSubAccount);
	const originalFetchVaults = sdk.vaultMetaService.fetchVaults;
	sdk.vaultMetaService.fetchVaults = async () => ({
		...(await originalFetchVaults()),
		errors: [{ message: "labels unavailable", severity: "warning" }],
	});

	const prefetched = await createPythPlugin({
		fetchFn: (async (input: RequestInfo | URL) => {
			const ids = getRequestedIds(input.toString());
			return Response.json({
				binary: { encoding: "hex", data: ["feedface"] },
				parsed: ids.map((id, index) => ({
					id,
					price: { publish_time: 1_900_000_000 + index },
				})),
			});
		}) as typeof fetch,
	}).prefetch?.(makeLiquidationPlan(), OWNER, 1, sdk as never);

	assert.equal(prefetched?.entries.length, 1);
});

test("Pyth prefetch fails closed when Hermes omits publish-time evidence", async () => {
	const sdk = makeLiquidationSdk(async () => ({
		result: makeViolatorSubAccount(),
		errors: [],
	}));
	const plugin = createPythPlugin({
		fetchFn: (async () => Response.json({
			binary: { encoding: "hex", data: ["feedface"] },
		})) as typeof fetch,
	});

	await assert.rejects(
		plugin.prefetch?.(makeLiquidationPlan(), OWNER, 1, sdk as never),
		/Pyth Hermes response is missing publish-time evidence/,
	);
});

test("Pyth prefetch rejects a partial-feed Hermes 404 without retrying a subset", async () => {
	const requestedIds: string[][] = [];
	const sdk = makeLiquidationSdk(async () => ({
		result: makeViolatorSubAccount(),
		errors: [],
	}));
	const plugin = createPythPlugin({
		fetchFn: (async (input: RequestInfo | URL) => {
			const ids = getRequestedIds(input.toString());
			requestedIds.push(ids);
			if (ids.includes(MISSING_FEED)) {
				throw new Error("test setup requested an unexpected feed");
			}
			return new Response(`Price ids not found: ${OTHER_FEED}`, {
				status: 404,
			});
		}) as typeof fetch,
	});

	await assert.rejects(
		plugin.prefetch?.(makeLiquidationPlan(), OWNER, 1, sdk as never),
		/Failed to fetch Pyth update data: 404.*Price ids not found/,
	);
	assert.equal(requestedIds.length, 1);
	assert.deepEqual(
		new Set(requestedIds[0]),
		new Set([DEBT_FEED, GOOD_FEED, OTHER_FEED]),
	);
});

test("Pyth strict liquidation rejects a missing active-collateral route before deduplicating it", async () => {
	const liquidator = new Account({
		chainId: 1,
		owner: OWNER,
		populated: { vaults: true },
		subAccounts: {
			[OWNER]: {
				timestamp: 0,
				account: OWNER,
				owner: OWNER,
				lastAccountStatusCheckTimestamp: 0,
				enabledControllers: [CONTROLLER],
				enabledCollaterals: [COLLATERAL],
				positions: [],
			},
		},
	});
	const sdk = makeLiquidationSdk(async () => ({
		result: makeViolatorSubAccount(),
		errors: [],
	}));
	sdk.vaultMetaService.fetchVaults = async () => ({
		result: [{
			address: CONTROLLER,
			asset: { address: UNIT },
			unitOfAccount: { address: UNIT },
			debtPricingOracleRoute: undefined,
			collaterals: [{
				address: COLLATERAL,
				currentLiquidationLTV: 0.8,
				oracleRoute: undefined,
			}],
		}],
		errors: [],
	});

	await assert.rejects(
		createPythPlugin().processPlan?.(
			makeLiquidationPlan(),
			liquidator,
			1,
			sdk as never,
		),
		/Pyth liquidation enrichment could not resolve the oracle route for collateral/,
	);
});

test("Pyth strict liquidation ignores enabled vaults with no controller LTV", async () => {
	const sdk = makeLiquidationSdk(async () => ({
		result: makeViolatorSubAccount(),
		errors: [],
	}));
	sdk.vaultMetaService.fetchVaults = async () => ({
		result: [{
			address: CONTROLLER,
			asset: { address: UNIT },
			unitOfAccount: { address: UNIT },
			debtPricingOracleRoute: undefined,
			collaterals: [],
		}],
		errors: [],
	});

	await assert.doesNotReject(
		createPythPlugin().processPlan?.(
			makeLiquidationPlan(),
			new Account({
				chainId: 1,
				owner: OWNER,
				populated: { vaults: true },
				subAccounts: {},
			}),
			1,
			sdk as never,
		),
	);
});

test("Pyth strict liquidation rejects a missing liability route when pricing is required", async () => {
	const sdk = makeLiquidationSdk(async () => ({
		result: makeViolatorSubAccount(),
		errors: [],
	}));
	sdk.vaultMetaService.fetchVaults = async () => ({
		result: [{
			address: CONTROLLER,
			asset: { address: ASSET },
			unitOfAccount: { address: UNIT },
			debtPricingOracleRoute: undefined,
			collaterals: [{
				address: COLLATERAL,
				currentLiquidationLTV: 0.8,
				oracleRoute: makePythRoute(),
			}],
		}],
		errors: [],
	});

	await assert.rejects(
		createPythPlugin().processPlan?.(
			makeLiquidationPlan(),
			new Account({
				chainId: 1,
				owner: OWNER,
				populated: { vaults: true },
				subAccounts: {},
			}),
			1,
			sdk as never,
		),
		/Pyth liquidation enrichment could not resolve the liability oracle route/,
	);
});

test("Pyth strict liquidation rejects a controller without a unit of account", async () => {
	const sdk = makeLiquidationSdk(async () => ({
		result: makeViolatorSubAccount(),
		errors: [],
	}));
	sdk.vaultMetaService.fetchVaults = async () => ({
		result: [{
			address: CONTROLLER,
			asset: { address: ASSET },
			unitOfAccount: undefined,
			debtPricingOracleRoute: makePythRoute(),
			collaterals: [{
				address: COLLATERAL,
				currentLiquidationLTV: 0.8,
				oracleRoute: makePythRoute(),
			}],
		}],
		errors: [],
	});

	await assert.rejects(
		createPythPlugin().processPlan?.(
			makeLiquidationPlan(),
			new Account({
				chainId: 1,
				owner: OWNER,
				populated: { vaults: true },
				subAccounts: {},
			}),
			1,
			sdk as never,
		),
		/Pyth liquidation enrichment could not resolve the unit of account/,
	);
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
								debtPricingOracleRoute: undefined,
								collaterals: [
									{
										address: COLLATERAL,
										oracleRoute: makePythRoute(),
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
					{
						type: "operation",
						name: "borrow",
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
				],
			},
		];

		const processed = await createPythPlugin().processPlan?.(plan, OWNER, 1, sdk);
		assert.ok(processed);
		assert.equal(fetchedAccount, true);
		assert.equal(fetchedVaultOptions, undefined);
		const [entry] = processed;
		assert.equal(entry.type, "evcBatch");
		if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
		assert.equal(entry.items.length, 1);
		assert.equal(entry.items[0]?.type, "operation");
		const items = flattenBatchEntries(entry.items);
		assert.equal(items.length, 4);
		assert.equal(items[0]?.targetContract, PYTH);
		assert.equal(items[0]?.onBehalfOfAccount, OWNER);
		assert.equal(items[0]?.value, 11n);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Pyth plugin caches empty prefetch results as a no-op", async () => {
	const plugin = createPythPlugin();
	let fetchedAccount = false;
	let fetchedVaults = 0;
	const provider = {
		readContract: async () => {
			throw new Error("should not query Pyth fee");
		},
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
			fetchVaults: async () => {
				fetchedVaults += 1;
				return {
					result: [
						{
							address: CONTROLLER,
							debtPricingOracleRoute: undefined,
							collaterals: [{ address: COLLATERAL, oracleRoute: undefined }],
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

	const prefetch = await plugin.prefetch?.(plan, OWNER, 1, sdk);
	assert.deepEqual(prefetch, { entries: [] });
	assert.equal(fetchedAccount, true);
	assert.equal(fetchedVaults, 1);

	const processed = await plugin.processPlan?.(
		plan,
		OWNER,
		1,
		sdk,
		{ pyth: prefetch } as PluginPrefetchData,
	);
	assert.equal(processed, plan);
	assert.equal(fetchedVaults, 1);
});

test("Pyth plugin read prepend honors empty prefetch results", async () => {
	let queriedFee = false;
	const provider = {
		readContract: async () => {
			queriedFee = true;
			return 11n;
		},
	} as unknown as PublicClient;
	const plugin = createPythPlugin();
	const result = await plugin.getReadPrepend?.(
		{
			chainId: 1,
			provider,
			vaults: [
				{
					debtPricingOracleRoute: makePythRoute(),
					collaterals: [],
				} as never,
			],
		},
		{ pyth: { entries: [] } },
	);

	assert.equal(result, null);
	assert.equal(queriedFee, false);
});

test("Pyth plugin skips untrusted Pyth contract addresses", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		Response.json({
			binary: {
				encoding: "hex",
				data: ["feedface"],
			},
		})) as typeof fetch;

	try {
		let queriedFee = false;
		const provider = {
			readContract: async () => {
				queriedFee = true;
				return 11n;
			},
		} as unknown as PublicClient;
		const plugin = createPythPlugin();
		const result = await plugin.getReadPrepend?.({
			chainId: 1,
			provider,
			vaults: [
				{
					debtPricingOracleRoute: makePythRoute(UNTRUSTED_PYTH),
					collaterals: [],
				} as never,
			],
		});

		assert.equal(result, null);
		assert.equal(queriedFee, false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Pyth plugin allows explicitly configured custom Pyth addresses", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		Response.json({
			binary: {
				encoding: "hex",
				data: ["feedface"],
			},
		})) as typeof fetch;

	try {
		const provider = {
			readContract: async () => 11n,
		} as unknown as PublicClient;
		const plugin = createPythPlugin({
			pythAddresses: { 1: UNTRUSTED_PYTH },
		});
		const result = await plugin.getReadPrepend?.({
			chainId: 1,
			provider,
			vaults: [
				{
					debtPricingOracleRoute: makePythRoute(UNTRUSTED_PYTH),
					collaterals: [],
				} as never,
			],
		});

		assert.equal(result?.items.length, 1);
		assert.equal(result?.items[0]?.targetContract, UNTRUSTED_PYTH);
		assert.equal(result?.items[0]?.value, 11n);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Pyth plugin skips update batches above the configured fee cap", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		Response.json({
			binary: {
				encoding: "hex",
				data: ["feedface"],
			},
		})) as typeof fetch;

	try {
		const provider = {
			readContract: async () => 12n,
		} as unknown as PublicClient;
		const plugin = createPythPlugin({ maxUpdateFee: 11n });
		const result = await plugin.getReadPrepend?.({
			chainId: 1,
			provider,
			vaults: [
				{
					debtPricingOracleRoute: makePythRoute(),
					collaterals: [],
				} as never,
			],
		});

		assert.equal(result, null);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
