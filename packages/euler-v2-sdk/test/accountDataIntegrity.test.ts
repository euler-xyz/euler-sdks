import assert from "node:assert/strict";
import { getAddress } from "viem";
import { afterEach, test, vi } from "vitest";
import {
	AccountService,
	type IAccountAdapter,
} from "../src/services/accountService/accountService.js";
import { AccountOnchainAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import { AccountVaultsSubgraphAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import { AccountV3Adapter } from "../src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import { VaultTypeSubgraphAdapter } from "../src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.js";
import { createFallbackAdapter } from "../src/utils/fallbackAdapter.js";
import { getAddressPrefix } from "../src/utils/subAccounts.js";

const account = getAddress("0x1000000000000000000000000000000000000000");
const vault = getAddress("0x2000000000000000000000000000000000000000");
const asset = getAddress("0x3000000000000000000000000000000000000000");
const factory = getAddress("0x4000000000000000000000000000000000000000");
const subgraphConfig = {
	subgraphURLs: { 1: "https://example.invalid/subgraph" },
};

afterEach(() => vi.unstubAllGlobals());

function positionRow() {
	return {
		chainId: 1,
		account,
		vault,
		asset,
		shares: "10",
		assets: "20",
		borrowed: "5",
		isController: true,
		isCollateral: true,
		balanceForwarderEnabled: false,
		subAccount: {
			owner: account,
			timestamp: 1,
			lastAccountStatusCheckTimestamp: 1,
			enabledControllers: [vault],
			enabledCollaterals: [vault],
			isLockdownMode: false,
			isPermitDisabledMode: false,
		},
	};
}

for (const mode of ["v3", "fallback"] as const) {
	for (const field of ["shares", "assets", "borrowed", "subAccount"] as const) {
		test(`${mode} account reads return partial data and warnings for null ${field}`, async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					Response.json({
						data: [{ ...positionRow(), [field]: null }],
					}),
				),
			);
			const primary = new AccountV3Adapter({
				endpoint: "https://example.invalid",
			});
			const secondary = {
				fetchAccount: vi.fn(async () => ({ result: undefined, errors: [] })),
				fetchSubAccount: vi.fn(async () => ({ result: undefined, errors: [] })),
			} satisfies IAccountAdapter;
			const adapter =
				mode === "v3"
					? primary
					: createFallbackAdapter<IAccountAdapter, keyof IAccountAdapter>(
							primary,
							secondary,
							{
								methods: ["fetchAccount", "fetchSubAccount"],
								adapterNames: {
									primary: "accountV3",
									secondary: "accountOnchain",
								},
							},
						);
			const service = new AccountService(adapter, {} as never);
			const fetched = await service.fetchAccount(1, account, {
				populateVaults: false,
			});
			const subAccount = await service.fetchSubAccount(1, account, [], {
				populateVaults: false,
			});
			for (const snapshot of [
				fetched.result.getSubAccount(account),
				subAccount.result,
			]) {
				assert.ok(snapshot);
				if (field !== "subAccount") {
					const position = snapshot.positions[0];
					assert.ok(position);
					assert.equal(position.shares, field === "shares" ? 0n : 10n);
					assert.equal(position.assets, field === "assets" ? 0n : 20n);
					assert.equal(position.borrowed, field === "borrowed" ? 0n : 5n);
				}
			}
			for (const errors of [fetched.errors, subAccount.errors]) {
				assert.equal(errors.length, 1);
				assert.equal(errors[0]?.code, "DEFAULT_APPLIED");
				assert.equal(errors[0]?.severity, "warning");
				assert.equal(errors[0]?.source, "accountV3");
				assert.equal(
					errors[0]?.locations[0]?.path,
					field === "subAccount" ? "$" : `$.${field}`,
				);
			}
			assert.equal(secondary.fetchAccount.mock.calls.length, 0);
			assert.equal(secondary.fetchSubAccount.mock.calls.length, 0);
		});
	}
}

for (const failure of [
	"HTTP 503",
	"GraphQL errors",
	"absent data",
	"non-array data",
	"missing row fields",
] as const) {
	test(`account discovery rejects ${failure} instead of selecting an apparently free subaccount`, async () => {
		const data = {
			trackingActiveAccounts:
				failure === "non-array data"
					? {}
					: failure === "missing row fields"
						? [{ id: getAddressPrefix(account) }]
						: [],
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json(
					failure === "absent data"
						? {}
						: {
								data,
								...(failure === "GraphQL errors"
									? { errors: [{ message: "indexer unavailable" }] }
									: {}),
							},
					{ status: failure === "HTTP 503" ? 503 : 200 },
				),
			),
		);
		const discovery = new AccountVaultsSubgraphAdapter(subgraphConfig);
		const onchain = new AccountOnchainAdapter(
			{} as never,
			{} as never,
			discovery,
		);
		const service = new AccountService(onchain, {} as never);
		await assert.rejects(
			service.resolveNewSubAccount(1, account, {
				fetchOptions: { populateVaults: false },
			}),
		);
	});

	test(`vault-type discovery rejects ${failure} instead of returning unknown`, async () => {
		const data = {
			vaults:
				failure === "non-array data"
					? {}
					: failure === "missing row fields"
						? [{ id: vault }]
						: [],
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json(
					failure === "absent data"
						? {}
						: {
								data,
								...(failure === "GraphQL errors"
									? { errors: [{ message: "indexer unavailable" }] }
									: {}),
							},
					{ status: failure === "HTTP 503" ? 503 : 200 },
				),
			),
		);
		const adapter = new VaultTypeSubgraphAdapter(subgraphConfig);
		await assert.rejects(adapter.fetchVaultType(1, vault));
	});
}

test("valid subgraph discoveries retain positions and vault classifications", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				data: {
					trackingActiveAccounts: [
						{
							id: getAddressPrefix(account),
							deposits: [`${account}${vault.slice(2)}`],
							borrows: [],
						},
					],
					vaults: [{ id: vault, factory }],
				},
			}),
		),
	);
	assert.deepEqual(
		await new AccountVaultsSubgraphAdapter(subgraphConfig).fetchAccountVaults(
			1,
			account,
		),
		{
			[account]: { deposits: [vault], borrows: [] },
		},
	);
	assert.equal(
		await new VaultTypeSubgraphAdapter(subgraphConfig).fetchVaultType(1, vault),
		factory,
	);
});

test("valid empty subgraph responses and missing URLs preserve compatibility", async () => {
	const fetch = vi.fn(async () =>
		Response.json({
			data: { trackingActiveAccounts: [], vaults: [] },
			errors: [],
		}),
	);
	vi.stubGlobal("fetch", fetch);
	assert.deepEqual(
		await new AccountVaultsSubgraphAdapter(subgraphConfig).fetchAccountVaults(
			1,
			account,
		),
		{},
	);
	assert.equal(
		await new VaultTypeSubgraphAdapter(subgraphConfig).fetchVaultType(1, vault),
		undefined,
	);
	assert.deepEqual(
		await new AccountVaultsSubgraphAdapter({
			subgraphURLs: {},
		}).fetchAccountVaults(1, account),
		{},
	);
	assert.equal(
		await new VaultTypeSubgraphAdapter({ subgraphURLs: {} }).fetchVaultType(
			1,
			vault,
		),
		undefined,
	);
	assert.equal(fetch.mock.calls.length, 2);
});
