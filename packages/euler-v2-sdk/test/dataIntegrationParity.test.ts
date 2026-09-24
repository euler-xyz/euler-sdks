import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { getAddress, zeroAddress, type Address } from "viem";
import { EVault } from "../src/entities/EVault.js";
import { EulerEarn } from "../src/entities/EulerEarn.js";
import { ERC4626Vault } from "../src/entities/ERC4626Vault.js";
import { SecuritizeCollateralVault } from "../src/entities/SecuritizeCollateralVault.js";
import { AccountOnchainAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import { AccountVaultsSubgraphAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import { AccountV3Adapter } from "../src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import { Account } from "../src/entities/Account.js";
import { EVaultV3Adapter } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.js";
import { EVaultOnchainAdapter } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import { EVaultService } from "../src/services/vaults/eVaultService/eVaultService.js";
import { EulerEarnService } from "../src/services/vaults/eulerEarnService/eulerEarnService.js";
import { VaultTypeV3Adapter } from "../src/services/vaults/vaultMetaService/adapters/VaultTypeV3Adapter.js";
import { VaultTypeSubgraphAdapter } from "../src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.js";
import { OracleAdapterService } from "../src/services/oracleAdapterService/oracleAdapterService.js";
import { VaultType } from "../src/utils/types.js";
import { convertVaultInfoFullToIEVault } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/vaultInfoConverter.js";
import { makeVaultInfo } from "./helpers/lensFixtures.js";

const address = (id: number): Address => getAddress(`0x${id.toString(16).padStart(40, "0")}`);
const OWNER = address(0x100);
const SUB = address(0x101);
const VAULT = address(0x200);

afterEach(() => vi.unstubAllGlobals());

const failedEnrichment = { queryBatchSimulation: async () => undefined };
const enrichmentPlugin = { getReadPrepend: async () => ({
	items: [{ targetContract: VAULT, onBehalfOfAccount: OWNER, value: 0n, data: "0x" }], totalValue: 0n,
}) };
const deployment = { getDeployment: () => ({ addresses: {
	lensAddrs: { accountLens: VAULT, vaultLens: VAULT }, coreAddrs: { evc: VAULT },
	peripheryAddrs: { escrowedCollateralPerspective: VAULT },
} }) };

test("collateral and strategy hydration resolve identical addresses on each vault's own chain", async () => {
	const meta = {
		fetchVaults: async (chainId: number, addresses: Address[]) => ({ result: addresses.map((address) => ({ address, chainId })), errors: [] }),
		fetchVault: async (chainId: number, address: Address) => ({ result: { address, chainId }, errors: [] }),
	};
	const evaultService = new EVaultService({} as never, deployment as never);
	evaultService.setVaultMetaService(meta as never);
	const evaults = [1, 10].map((chainId) => ({ chainId, address: VAULT, collaterals: [{ address: SUB, vault: undefined as { chainId: number } | undefined }], populated: {} }));
	await evaultService.populateCollaterals(evaults as never);
	assert.deepEqual(evaults.map((vault) => vault.collaterals[0]?.vault?.chainId), [1, 10]);
	const earnService = new EulerEarnService({} as never, deployment as never);
	earnService.setVaultMetaService(meta as never);
	const earns = [1, 10].map((chainId) => ({ chainId, address: VAULT, strategies: [{ address: SUB, vaultType: VaultType.EVault, vault: undefined as { chainId: number } | undefined }], populated: {} }));
	await earnService.populateStrategyVaults(earns as never);
	assert.deepEqual(earns.map((vault) => vault.strategies[0]?.vault?.chainId), [1, 10]);
});

test("failed vault read enrichment keeps initial oracle diagnostics and reports fallback", async () => {
	const adapter = new EVaultOnchainAdapter({ getProvider: () => ({}) } as never, deployment as never);
	const info = makeVaultInfo({ oracle: VAULT, name: "Test oracle", oracleInfo: "0x" });
	adapter.setQueryEVaultInfoFull(async () => ({ ...info,
		liabilityPriceInfo: { ...info.liabilityPriceInfo, queryFailure: true },
	}) as never);
	adapter.setQueryEVaultVerifiedArray(async () => []);
	adapter.setPlugins([enrichmentPlugin] as never);
	adapter.setBatchSimulationAdapter(failedEnrichment);
	const { result, errors } = await adapter.fetchVaults(1, [VAULT]);
	assert.equal(result[0]?.oraclePriceRaw.queryFailure, true);
	assert(errors.some((issue) => issue.source === "vaultLens" && issue.message.includes("Oracle price query")));
	assert(errors.some((issue) => issue.source === "batchSimulation" && issue.message.includes("initial vault snapshot")));
});

test("failed account read enrichment exposes fallback alongside ordinary lens errors", async () => {
	const adapter = new AccountOnchainAdapter({ getProvider: () => ({}) } as never, deployment as never,
		{ fetchAccountVaults: async () => ({}) });
	adapter.setQueryEVCAccountInfo(async () => ({ timestamp: 1n, evc: VAULT, account: SUB, owner: OWNER,
		addressPrefix: OWNER.slice(0, -2), isLockdownMode: false, isPermitDisabledMode: false,
		lastAccountStatusCheckTimestamp: 0n, enabledControllers: [], enabledCollaterals: [],
	}) as never);
	adapter.setQueryEVaultInfoFull(async () => makeVaultInfo({ oracle: VAULT, name: "Test oracle", oracleInfo: "0x" }) as never);
	adapter.setQueryVaultAccountInfo(async () => ({ queryFailure: true, queryFailureReason: "0x1234" }) as never);
	adapter.setPlugins([enrichmentPlugin] as never);
	adapter.setBatchSimulationAdapter(failedEnrichment);
	const { result, errors } = await adapter.fetchSubAccount(1, SUB, [VAULT]);
	assert(result);
	assert(errors.some((issue) => issue.source === "accountLens" && issue.originalValue === "0x1234"));
	assert(errors.some((issue) => issue.source === "batchSimulation"));
});

function evault() {
	return convertVaultInfoFullToIEVault(makeVaultInfo({ oracle: zeroAddress, name: "", oracleInfo: "0x" }), 1, []);
}

test("EulerEarn withdrawal uses the snapshot exchange rate with minimal sufficient rounding", () => {
	for (const [totalAssets, totalShares] of [[0n, 0n], [1n, 3n], [3n, 1n], [10n ** 24n, 3n * 10n ** 24n], [3n * 10n ** 24n, 10n ** 24n]]) {
		const vault = Object.assign(Object.create(EulerEarn.prototype) as EulerEarn, { totalAssets, totalShares });
		for (const amount of [0n, 1n, 999_999n, 1_000_001n, 10n ** 18n]) {
			const shares = vault.previewWithdraw(amount);
			assert(vault.convertToAssets(shares) >= amount);
			if (shares > 0n) assert(vault.convertToAssets(shares - 1n) < amount);
		}
	}
	for (const prototype of [ERC4626Vault.prototype, SecuritizeCollateralVault.prototype]) {
		assert.equal(prototype.previewWithdraw(123n), 123n, "the supported 1:1 collateral wrapper remains 1:1");
	}
});

test("liquidation ramps match Solidity integer basis-point rounding and apply increases immediately", () => {
	const base = evault();
	const collateral = {
		address: VAULT, borrowLTV: 0.75, liquidationLTV: 0.80,
		oraclePriceRaw: base.oraclePriceRaw,
		ramping: { initialLiquidationLTV: 0.85, targetTimestamp: 103, rampDuration: 3n },
	};
	const vault = new EVault({ ...base, timestamp: 101, collaterals: [collateral] });
	assert.equal(vault.collaterals[0].currentLiquidationLTV, 0.8333);
	const increase = new EVault({ ...base, timestamp: 101, collaterals: [{
		...collateral, liquidationLTV: 0.90,
	}] });
	assert.equal(increase.collaterals[0].currentLiquidationLTV, 0.90);
	assert.equal(increase.collaterals[0].isLiquidationLTVRamping, false);
	const ended = new EVault({ ...base, timestamp: 103, collaterals: [collateral] });
	assert.equal(ended.collaterals[0].currentLiquidationLTV, 0.80);
});

test("risk prices normalize high-decimal units of account without negative bigint exponents", () => {
	const base = evault();
	const raw = { ...base.oraclePriceRaw, amountIn: 10n ** 18n, amountOutMid: 2n * 10n ** 24n + 999_999n,
		amountOutAsk: 3n * 10n ** 24n, amountOutBid: 10n ** 24n };
	const vault = new EVault({ ...base, unitOfAccount: { ...base.unitOfAccount!, decimals: 24 },
		oraclePriceRaw: raw, collaterals: [{ address: VAULT, borrowLTV: 0.8, liquidationLTV: 0.85, oraclePriceRaw: raw }] });
	assert.deepEqual(vault.assetRiskPrice, { priceLiquidation: 2n * 10n ** 18n, priceBorrowing: 3n * 10n ** 18n });
	const collateral = Object.assign(Object.create(ERC4626Vault.prototype), { address: VAULT, asset: { decimals: 18 } });
	assert.deepEqual(vault.getCollateralRiskPrice(collateral), { priceLiquidation: 2n * 10n ** 18n, priceBorrowing: 10n ** 18n });
});

test("owner modes survive account discovery that only returns a secondary subaccount", async () => {
	const adapter = new AccountOnchainAdapter(
		{ getProvider: () => ({}) } as never,
		{ getDeployment: () => ({ addresses: { lensAddrs: { accountLens: VAULT }, coreAddrs: { evc: VAULT } } }) } as never,
		{ fetchAccountVaults: async () => ({ [SUB]: { deposits: [], borrows: [] } }) },
	);
	adapter.setQueryEVCAccountInfo(async () => ({
		timestamp: 1n, evc: VAULT, account: SUB, owner: OWNER,
		addressPrefix: OWNER.slice(0, -2), isLockdownMode: true, isPermitDisabledMode: true,
		lastAccountStatusCheckTimestamp: 0n, enabledControllers: [], enabledCollaterals: [],
	}) as never);
	const { result } = await adapter.fetchAccount(1, OWNER);
	assert.equal(result?.isLockdownMode, true);
	assert.equal(result?.isPermitDisabledMode, true);
	assert.equal(result?.subAccounts[OWNER], undefined);
});

test("V3 balances survive missing optional subaccount metadata with a diagnostic", async () => {
	const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3AccountPositions(async () => ({ data: [{
		chainId: 1, account: SUB, vault: VAULT, asset: address(3), shares: "10", assets: "20", borrowed: "0",
		isController: false, isCollateral: false, balanceForwarderEnabled: false, subAccount: null,
	}], meta: { hasMore: false } }));
	const { result, errors } = await adapter.fetchAccount(1, OWNER);
	assert.equal(result?.subAccounts[SUB]?.positions[0]?.assets, 20n);
	assert(errors.some((issue) => issue.message.includes("Missing subAccount")));
});

for (const [name, response] of [
	["HTTP failure", () => new Response("{}", { status: 503 })],
	["GraphQL error", () => Response.json({ errors: [{ message: "indexing unavailable" }] })],
	["missing data", () => Response.json({})],
] as const) {
	test(`subgraph discovery rejects ${name} instead of reporting an empty account`, async () => {
		vi.stubGlobal("fetch", vi.fn(async () => response()));
		const adapter = new AccountVaultsSubgraphAdapter({ subgraphURLs: { 1: "https://example.invalid" } });
		await assert.rejects(adapter.fetchAccountVaults(1, OWNER), /subgraph/);
	});
}

test("bundled subgraph discovery chunks more than 100 unique account prefixes", async () => {
	const batches: number[] = [];
	vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
		const body = JSON.parse(options.body);
		assert.match(body.query, /first: 100/);
		batches.push(body.variables.ids.length);
		return Response.json({ data: { trackingActiveAccounts: body.variables.ids.map((id: string) => ({ id, deposits: [], borrows: [] })) } });
	}));
	const adapter = new AccountVaultsSubgraphAdapter({ subgraphURLs: { 1: "https://example.invalid" } });
	await Promise.all(Array.from({ length: 101 }, (_, i) => adapter.fetchAccountVaults(1, address((i + 1) * 256))));
	assert.deepEqual(batches, [100, 1]);
});

for (const field of ["shares", "assets", "borrowed"] as const) {
	test(`V3 unknown ${field} cannot become a successful zero-balance account`, async () => {
		const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
		adapter.setQueryV3AccountPositions(async () => ({ data: [{
			chainId: 1, account: SUB, vault: VAULT, asset: address(3), shares: "10", assets: "20", borrowed: "0",
			isController: false, isCollateral: false, balanceForwarderEnabled: false, subAccount: null,
			[field]: null,
		}], meta: { hasMore: false } }));
		const { result, errors } = await adapter.fetchAccount(1, OWNER);
		assert.equal(result, undefined, "undefined triggers the configured on-chain fallback");
		assert(errors.some((issue) => issue.code === "SOURCE_UNAVAILABLE" && issue.severity === "error"));
	});
}

test("fractional EVault batch size cannot create a zero-step request loop", async () => {
	const calls: unknown[] = [];
	vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
		calls.push(JSON.parse(options.body));
		return Response.json({ data: [] });
	}));
	const adapter = new EVaultV3Adapter({ endpoint: "https://example.invalid", batchSize: 0.5 });
	await adapter.fetchVaults(1, [VAULT]);
	assert.deepEqual(calls, [{ chainId: 1, addresses: [VAULT], include: ["collaterals"] }]);
});

test("documented vault type aliases normalize consistently with lookup keys", async () => {
	for (const [alias, expected] of [["EulerEarn", VaultType.EulerEarn], ["SecuritizeCollateral", VaultType.SecuritizeCollateral]] as const) {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ chainId: 1, address: VAULT, found: true, vaultType: alias }] })));
		const adapter = new VaultTypeV3Adapter({ endpoint: "https://example.invalid" });
		assert.equal(await adapter.fetchVaultType(1, VAULT), expected);
	}
});

test("vault-type subgraph discovery rejects errors instead of unknown vault classifications", async () => {
	vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ message: "rate limited" }] })));
	const adapter = new VaultTypeSubgraphAdapter({ subgraphURLs: { 1: "https://example.invalid" } });
	await assert.rejects(adapter.fetchVaultFactories(1, [VAULT]), /subgraph/);
});

test("invalid oracle page sizes use a finite positive integer and terminate empty lists", async () => {
	for (const pageSize of [NaN, Infinity, -1, 0.5]) {
		const service = new OracleAdapterService({ pageSize });
		let calls = 0;
		service.setQueryV3OracleAdapterAssessmentsPage(async (_chain, offset, limit) => {
			assert.equal(offset, 0);
			assert.equal(limit, 100);
			assert(++calls <= 1, "empty page must terminate");
			return { data: [] };
		});
		service.setQueryV3OracleRoutersPage(async (_chain, offset, limit) => {
			assert.equal(offset, 0);
			assert.equal(limit, 100);
			return { data: [] };
		});
		assert.deepEqual(await service.fetchOracleAdapterAssessments(1), []);
		assert.deepEqual(await service.fetchOracleRouters(1), []);
	}
});

test("account valuation refresh clears old prices and repaid debt values", async () => {
	let nextPrice: number | undefined = 2;
	const vault = { address: VAULT, asset: { decimals: 0 }, marketPriceUsd: undefined as number | undefined,
		populateMarketPrices: async () => { vault.marketPriceUsd = nextPrice; return []; } };
	const account = new Account({ chainId: 1, owner: OWNER, populated: { vaults: true }, subAccounts: { [SUB]: {
		account: SUB, owner: OWNER, timestamp: 0, lastAccountStatusCheckTimestamp: 0,
		enabledControllers: [VAULT], enabledCollaterals: [], positions: [{
			account: SUB, vaultAddress: VAULT, vault, asset: address(3), shares: 10n, assets: 10n, borrowed: 3n,
			isController: true, isCollateral: false, balanceForwarderEnabled: false,
		}],
	} } });
	await account.populateMarketPrices({} as never);
	const position = account.subAccounts[SUB]!.positions[0];
	assert.equal(position.borrowedValueUsd, 6);
	position.borrowed = 0n;
	await account.populateMarketPrices({} as never);
	assert.equal(position.borrowedValueUsd, undefined);
	assert.equal(position.suppliedValueUsd, 20);
	nextPrice = undefined;
	await account.populateMarketPrices({} as never);
	assert.equal(position.marketPriceUsd, undefined);
	assert.equal(position.suppliedValueUsd, undefined);
});
