import assert from "node:assert/strict";
import { getAddress } from "viem";
import { afterEach, test, vi } from "vitest";
import {
	Account,
	type IAccount,
	type ISubAccount,
} from "../src/entities/Account.js";
import { AccountDataUnavailableError, buildEulerSDK } from "../src/index.js";
import {
	AccountService,
	type IAccountAdapter,
} from "../src/services/accountService/accountService.js";
import { AccountOnchainAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import { AccountVaultsSubgraphAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import { AccountV3Adapter } from "../src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import { VaultTypeSubgraphAdapter } from "../src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.js";
import { createFallbackAdapter } from "../src/utils/fallbackAdapter.js";
import type { DataIssue } from "../src/utils/entityDiagnostics.js";
import {
	getAddressPrefix,
	getSubAccountAddress,
} from "../src/utils/subAccounts.js";

const account = getAddress("0x1000000000000000000000000000000000000000");
const vault = getAddress("0x2000000000000000000000000000000000000000");
const asset = getAddress("0x3000000000000000000000000000000000000000");
const factory = getAddress("0x4000000000000000000000000000000000000000");
const candidate = getSubAccountAddress(account, 1);
const unavailableError = {
	name: "AccountDataUnavailableError",
	code: "ACCOUNT_DATA_UNAVAILABLE",
};
const selectionOptions = {
	startId: 1,
	endId: 1,
	fetchOptions: { populateVaults: false },
};
const subgraphConfig = {
	subgraphURLs: { 1: "https://example.invalid/subgraph" },
};

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

const onchainSubAccount: ISubAccount = {
	timestamp: 2,
	account,
	owner: account,
	lastAccountStatusCheckTimestamp: 2,
	enabledControllers: [vault],
	enabledCollaterals: [vault],
	positions: [
		{
			account,
			vaultAddress: vault,
			asset,
			shares: 10n,
			assets: 20n,
			borrowed: 5n,
			isController: true,
			isCollateral: true,
			balanceForwarderEnabled: false,
		},
	],
};
const onchainAccount: IAccount = {
	chainId: 1,
	owner: account,
	isLockdownMode: false,
	isPermitDisabledMode: false,
	subAccounts: { [account]: onchainSubAccount },
};

afterEach(() => vi.unstubAllGlobals());

for (const field of ["shares", "assets", "borrowed", "subAccount"] as const) {
	test(`account service rejects unavailable ${field} without fallback`, async () => {
		const adapter = new AccountV3Adapter({
			endpoint: "https://example.invalid",
		});
		adapter.setQueryV3AccountPositions(async () => ({
			data: [{ ...positionRow(), account: candidate, [field]: null }],
		}));
		const service = new AccountService(adapter, {} as never);
		await assert.rejects(
			service.fetchAccount(1, account, { populateVaults: false }),
			unavailableError,
		);
		await assert.rejects(
			service.fetchSubAccount(1, candidate, [], { populateVaults: false }),
			unavailableError,
		);
		for (const borrowVault of [undefined, vault]) {
			await assert.rejects(
				service.resolveNewSubAccount(1, account, {
					...selectionOptions,
					borrowVault,
				}),
				unavailableError,
			);
		}
	});

	for (const method of ["fetchAccount", "fetchSubAccount"] as const) {
		test(`V3 ${method} falls back for unknown ${field} instead of returning a partial snapshot`, async () => {
			const primary = new AccountV3Adapter({
				endpoint: "https://example.invalid",
			});
			primary.setQueryV3AccountPositions(async () => ({
				data: [{ ...positionRow(), [field]: null }],
			}));
			const unavailable = await primary[method](1, account);
			assert.equal(unavailable.result, undefined);
			assert.equal(unavailable.errors[0]?.code, "SOURCE_UNAVAILABLE");

			const secondary: IAccountAdapter = {
				fetchAccount: vi.fn(async () => ({
					result: onchainAccount,
					errors: [],
				})),
				fetchSubAccount: vi.fn(async () => ({
					result: onchainSubAccount,
					errors: [],
				})),
			};
			const fallback = createFallbackAdapter<IAccountAdapter, typeof method>(
				primary,
				secondary,
				{
					methods: [method],
					adapterNames: { primary: "accountV3", secondary: "accountOnchain" },
				},
			);
			const recovered = await fallback[method](1, account);
			assert.equal(
				recovered.result,
				method === "fetchAccount" ? onchainAccount : onchainSubAccount,
			);
			assert.equal(recovered.errors[0]?.code, "FALLBACK_USED");
			assert.equal(vi.mocked(secondary[method]).mock.calls.length, 1);
		});
	}
}

test("V3-only SDK propagates unavailable account data to discovery and portfolio callers", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				data: [{ ...positionRow(), account: candidate, shares: null }],
			}),
		),
	);
	const sdk = await buildEulerSDK({
		config: { accountServiceAdapter: "v3", queryCacheEnabled: false },
		servicesOverrides: {
			deploymentService: {
				getDeploymentChainIds: () => [],
				getDeployment: () => {
					throw new Error("No deployment needed");
				},
				addDeployment: () => {},
			},
		},
	});
	await assert.rejects(
		sdk.accountService.fetchAccount(1, account),
		unavailableError,
	);
	await assert.rejects(
		sdk.accountService.resolveNewSubAccount(1, account, selectionOptions),
		unavailableError,
	);
	await assert.rejects(
		sdk.portfolioService.fetchPortfolio(1, account),
		unavailableError,
	);
});

for (const cachedCandidate of [false, true]) {
	test(`borrow selection rejects failed candidate reads with cached candidate=${cachedCandidate}`, async () => {
		const adapter = new AccountV3Adapter({
			endpoint: "https://example.invalid",
		});
		adapter.setQueryV3AccountPositions(async () => ({
			data: [{ ...positionRow(), account: candidate, shares: null }],
		}));
		const service = new AccountService(adapter, {} as never);
		const snapshot = new Account({
			chainId: 1,
			owner: account,
			subAccounts: cachedCandidate
				? {
						[candidate]: {
							...onchainSubAccount,
							account: candidate,
							positions: [],
						},
					}
				: {},
		});
		await assert.rejects(
			service.resolveNewSubAccount(1, account, {
				...selectionOptions,
				borrowVault: vault,
				account: snapshot,
			}),
			unavailableError,
		);
	});
}

for (const recovery of ["empty", "occupied", "unavailable"] as const) {
	test(`account service handles ${recovery} fallback after unavailable V3 data`, async () => {
		const primary = new AccountV3Adapter({
			endpoint: "https://example.invalid",
		});
		primary.setQueryV3AccountPositions(async () => ({
			data: [{ ...positionRow(), account: candidate, shares: null }],
		}));
		const secondary = new AccountV3Adapter({
			endpoint: "https://example.invalid",
		});
		secondary.setQueryV3AccountPositions(async () => ({
			data:
				recovery === "empty"
					? []
					: [
							{
								...positionRow(),
								account: candidate,
								shares: recovery === "unavailable" ? null : "10",
							},
						],
		}));
		const service = new AccountService(
			createFallbackAdapter<IAccountAdapter, keyof IAccountAdapter>(
				primary,
				secondary,
				{
					methods: ["fetchAccount", "fetchSubAccount"],
					adapterNames: { primary: "accountV3", secondary: "secondary" },
				},
			),
			{} as never,
		);
		if (recovery === "unavailable") {
			await assert.rejects(service.fetchAccount(1, account), unavailableError);
			await assert.rejects(
				service.resolveNewSubAccount(1, account, selectionOptions),
				unavailableError,
			);
			return;
		}
		const fetched = await service.fetchAccount(1, account, {
			populateVaults: false,
		});
		assert.equal(fetched.errors[0]?.code, "FALLBACK_USED");
		assert.equal(
			fetched.result.getSubAccount(candidate)?.positions[0]?.borrowed,
			recovery === "occupied" ? 5n : undefined,
		);
		for (const borrowVault of [undefined, vault]) {
			const selected = await service.resolveNewSubAccount(1, account, {
				...selectionOptions,
				borrowVault,
			});
			assert.equal(
				selected.result,
				recovery === "empty" ? candidate : undefined,
			);
		}
	});
}

test("account service accepts a successful empty V3 discovery without fallback", async () => {
	const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3AccountPositions(async () => ({ data: [] }));
	const service = new AccountService(adapter, {} as never);
	const fetched = await service.fetchAccount(1, account, {
		populateVaults: false,
	});
	assert.deepEqual(fetched.result.subAccounts, {});
	assert.deepEqual(fetched.errors, []);
	for (const borrowVault of [undefined, vault]) {
		assert.deepEqual(
			await service.resolveNewSubAccount(1, account, {
				...selectionOptions,
				borrowVault,
			}),
			{ result: candidate, errors: [] },
		);
	}
});

for (const diagnostic of [
	{ code: "SOURCE_UNAVAILABLE", severity: "warning" },
	{ code: "DECODE_FAILED", severity: "error" },
] as const) {
	test(`missing account snapshots retain ${diagnostic.code} diagnostics on the public error`, async () => {
		const errors: DataIssue[] = [
			{
				...diagnostic,
				message: "Account read failed",
				locations: [
					{
						owner: { kind: "account", chainId: 1, address: account },
						path: "$",
					},
				],
				source: "test",
			},
		];
		const service = new AccountService(
			{
				fetchAccount: async () => ({ result: undefined, errors }),
				fetchSubAccount: async () => ({ result: undefined, errors }),
			},
			{} as never,
		);
		for (const read of [
			() => service.fetchAccount(1, account),
			() => service.fetchSubAccount(1, account),
		]) {
			await assert.rejects(read, (error: unknown) => {
				assert.ok(error instanceof AccountDataUnavailableError);
				assert.equal(error.chainId, 1);
				assert.equal(error.address, account);
				assert.deepEqual(error.errors, errors);
				return true;
			});
		}
	});
}

test("V3 rejects the whole snapshot when a later page has unavailable metadata", async () => {
	const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
	const offsets: number[] = [];
	adapter.setQueryV3AccountPositions(
		async (_endpoint, _chainId, _address, offset = 0) => {
			offsets.push(offset);
			return offset === 0
				? { data: [positionRow()], meta: { hasMore: true } }
				: {
						data: [{ ...positionRow(), subAccount: null }],
						meta: { hasMore: false },
					};
		},
	);
	const fetched = await adapter.fetchAccount(1, account);
	assert.equal(fetched.result, undefined);
	assert.equal(fetched.errors[0]?.code, "SOURCE_UNAVAILABLE");
	assert.deepEqual(offsets, [0, 1]);
});

test("V3 does not drop valid positions when the first row lacks metadata", async () => {
	const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3AccountPositions(async () => ({
		data: [{ ...positionRow(), subAccount: null }, positionRow()],
	}));
	const fetched = await adapter.fetchAccount(1, account);
	assert.equal(fetched.result, undefined);
	assert.equal(fetched.errors[0]?.code, "SOURCE_UNAVAILABLE");
});

test("V3 accepts explicit zero balances and complete empty snapshots", async () => {
	const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3AccountPositions(async () => ({
		data: [{ ...positionRow(), shares: "0", assets: "0", borrowed: "0" }],
	}));
	const fetched = await adapter.fetchAccount(1, account);
	assert.equal(
		fetched.result?.subAccounts[account]?.positions[0]?.borrowed,
		0n,
	);
	assert.deepEqual(fetched.errors, []);
	adapter.setQueryV3AccountPositions(async () => ({ data: [] }));
	assert.deepEqual(await adapter.fetchAccount(1, account), {
		result: undefined,
		errors: [],
	});
});

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
