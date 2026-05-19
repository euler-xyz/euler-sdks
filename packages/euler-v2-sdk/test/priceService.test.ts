import assert from "node:assert/strict";
import type { Address } from "viem";
import { test } from "vitest";
import { EVault } from "../src/entities/EVault.js";
import { EulerEarn } from "../src/entities/EulerEarn.js";
import {
	getCollateralOraclePrice,
	PriceService,
} from "../src/services/priceService/priceService.js";
import {
	PricingBackendClient,
	normalizeBackendPrice,
} from "../src/services/priceService/backendClient.js";
import type { OraclePrice } from "../src/utils/oracle.js";
import type { Token } from "../src/utils/types.js";
import { VaultType } from "../src/utils/types.js";

const CHAIN_ID = 1;
const ASSET = "0x00000000000000000000000000000000000000aa" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const UOA_ADDRESS = "0x0000000000000000000000000000000000000348" as const;
const COLLATERAL_ADDRESS =
	"0x00000000000000000000000000000000000000cc" as const;
const COLLATERAL_ASSET =
	"0x00000000000000000000000000000000000000dd" as const;
const ONE_18 = 10n ** 18n;

function createPriceService() {
	return new PriceService(
		{
			getProvider: () => ({}) as never,
		} as never,
		{
			getDeployment: () => ({
				addresses: {
					lensAddrs: {
						utilsLens: "0x00000000000000000000000000000000000000bb",
					},
				},
			}),
		} as never,
		undefined,
	);
}

function makeToken(
	address: Token["address"],
	symbol: string,
	decimals = 18,
): Token {
	return { address, name: symbol, symbol, decimals };
}

function makeOraclePrice(overrides: Partial<OraclePrice> = {}): OraclePrice {
	return {
		queryFailure: false,
		queryFailureReason: "0x",
		amountIn: ONE_18,
		amountOutMid: ONE_18,
		amountOutBid: ONE_18,
		amountOutAsk: ONE_18,
		timestamp: 0,
		...overrides,
	};
}

function makeLiabilityVault(
	collateralVault: { address: Token["address"] },
	oraclePriceRaw: OraclePrice,
): EVault {
	return {
		unitOfAccount: makeToken(UOA_ADDRESS, "USD"),
		collaterals: [{ address: collateralVault.address, oraclePriceRaw }],
	} as EVault;
}

function makeEVaultCollateral(overrides: {
	totalAssets: bigint;
	totalShares: bigint;
}): EVault {
	return new EVault({
		type: VaultType.EVault,
		chainId: CHAIN_ID,
		address: COLLATERAL_ADDRESS,
		shares: makeToken(COLLATERAL_ADDRESS, "eTST"),
		asset: makeToken(COLLATERAL_ASSET, "TST"),
		totalShares: overrides.totalShares,
		totalAssets: overrides.totalAssets,
		unitOfAccount: makeToken(UOA_ADDRESS, "USD"),
		totalCash: overrides.totalAssets,
		totalBorrowed: 0n,
		creator: ZERO_ADDRESS,
		governorAdmin: ZERO_ADDRESS,
		dToken: ZERO_ADDRESS,
		balanceTracker: ZERO_ADDRESS,
		fees: {
			interestFee: 0,
			accumulatedFeesShares: 0n,
			accumulatedFeesAssets: 0n,
			governorFeeReceiver: ZERO_ADDRESS,
			protocolFeeReceiver: ZERO_ADDRESS,
			protocolFeeShare: 0,
		},
		hooks: {
			hookedOperations: {
				deposit: false,
				mint: false,
				withdraw: false,
				redeem: false,
				transfer: false,
				skim: false,
				borrow: false,
				repay: false,
				repayWithShares: false,
				pullDebt: false,
				convertFees: false,
				liquidate: false,
				flashloan: false,
				touch: false,
				vaultStatusCheck: false,
			},
			hookTarget: ZERO_ADDRESS,
		},
		caps: { supplyCap: 0n, borrowCap: 0n },
		liquidation: {
			maxLiquidationDiscount: 0,
			liquidationCoolOffTime: 0,
			socializeDebt: false,
		},
		oracle: {
			oracle: ZERO_ADDRESS,
			name: "",
			adapters: [],
			resolvedVaults: [],
		},
		interestRates: { borrowSPY: 0, borrowAPY: 0, supplyAPY: 0 },
		interestRateModel: {
			address: ZERO_ADDRESS,
			type: "UNKNOWN",
			data: null,
			params: null,
		} as never,
		collaterals: [],
		evcCompatibleAsset: true,
		oraclePriceRaw: makeOraclePrice(),
		timestamp: 0,
	});
}

function makeEulerEarnCollateral(overrides: {
	totalAssets: bigint;
	totalShares: bigint;
}): EulerEarn {
	return new EulerEarn({
		type: VaultType.EulerEarn,
		chainId: CHAIN_ID,
		address: COLLATERAL_ADDRESS,
		shares: makeToken(COLLATERAL_ADDRESS, "eEARN"),
		asset: makeToken(COLLATERAL_ASSET, "TST"),
		totalShares: overrides.totalShares,
		totalAssets: overrides.totalAssets,
		lostAssets: 0n,
		availableAssets: overrides.totalAssets,
		performanceFee: 0,
		supplyApy1h: undefined,
		governance: {
			owner: ZERO_ADDRESS,
			creator: ZERO_ADDRESS,
			curator: ZERO_ADDRESS,
			guardian: ZERO_ADDRESS,
			feeReceiver: ZERO_ADDRESS,
			timelock: 0,
			pendingTimelock: 0,
			pendingTimelockValidAt: 0,
			pendingGuardian: ZERO_ADDRESS,
			pendingGuardianValidAt: 0,
		},
		supplyQueue: [],
		withdrawQueue: [],
		strategies: [],
		timestamp: 0,
	});
}

function expectedAssetPrice(amountOut: bigint, collateralVault: EVault | EulerEarn) {
	const assetUnit = 10n ** BigInt(collateralVault.asset.decimals);
	return (amountOut * collateralVault.convertToShares(assetUnit)) / ONE_18;
}

test("fetchAssetUsdPriceByAddress returns backend price when available", async () => {
	const service = createPriceService();
	service.setBackendClient({
		isConfigured: true,
		queryV3Price: async () => ({ price: "12.34" }),
	} as never);
	const expectedPrice = normalizeBackendPrice("12.34");

	const price = await service.fetchAssetUsdPriceByAddress(CHAIN_ID, ASSET);

	assert.equal(price, expectedPrice);
});

test("PricingBackendClient supports relative V3 proxy endpoints", async () => {
	const calls: string[] = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input) => {
		calls.push(String(input));
		return new Response(
			JSON.stringify({
				data: [{ address: ASSET, priceUsd: 12.34, source: "test" }],
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	}) as typeof fetch;

	try {
		const client = new PricingBackendClient({ endpoint: "/api/v3" });
		const price = await client.queryV3Price({
			address: ASSET,
			chainId: CHAIN_ID,
		});

		assert.equal(price?.price, 12.34);
		assert.equal(
			calls[0],
			`/api/v3/v3/prices?chainId=1&assets=${ASSET.toLowerCase()}&limit=1`,
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("PricingBackendClient pages requests over 100 addresses", async () => {
	const calls: string[] = [];
	const originalFetch = globalThis.fetch;
	const mkAddr = (i: number): Address =>
		(`0x${i.toString(16).padStart(40, "0")}`) as Address;

	globalThis.fetch = (async (input) => {
		const url = new URL(String(input), "http://test/");
		calls.push(url.search);
		const requested = (url.searchParams.get("assets") ?? "").split(",");
		const rows = requested.map((address, i) => ({
			address,
			priceUsd: 1 + i,
			source: "test",
		}));
		return new Response(JSON.stringify({ data: rows }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;

	try {
		const client = new PricingBackendClient({ endpoint: "/api/v3" });
		// 250 unique addresses → 3 paged requests of 100, 100, 50.
		const results = await Promise.all(
			Array.from({ length: 250 }, (_, i) =>
				client.queryV3Price({ address: mkAddr(i + 1), chainId: CHAIN_ID }),
			),
		);

		assert.equal(results.length, 250);
		for (const r of results) {
			assert.ok(r && typeof r.price === "number" && r.price > 0);
		}
		assert.equal(calls.length, 3);
		const sizes = calls
			.map((s) => new URLSearchParams(s).get("assets")?.split(",").length ?? 0)
			.sort((a, b) => b - a);
		assert.deepEqual(sizes, [100, 100, 50]);
		const limits = calls
			.map((s) => new URLSearchParams(s).get("limit"))
			.sort();
		assert.deepEqual(limits, ["100", "100", "50"]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("fetchAssetUsdPriceByAddress falls back to on-chain asset pricing", async () => {
	const service = createPriceService();
	service.setBackendClient({
		isConfigured: true,
		queryV3Price: async () => {
			throw new Error("backend unavailable");
		},
	} as never);
	service.setQueryAssetPriceInfo(async () => ({
		queryFailure: false,
		amountOutMid: 42000000000000000000n,
	}));

	const result = await service.fetchAssetUsdPriceByAddressWithDiagnostics(
		CHAIN_ID,
		ASSET,
	);

	assert.equal(result.result, 42);
	assert.equal(result.errors?.[0]?.code, "FALLBACK_USED");
});

test("getCollateralOraclePrice uses EVault virtual conversion in low-liquidity states", () => {
	const collateralVault = makeEVaultCollateral({
		totalAssets: 3n,
		totalShares: 1n,
	});
	const sharePrice = makeOraclePrice({
		amountOutMid: ONE_18,
		amountOutAsk: 2n * ONE_18,
		amountOutBid: ONE_18 / 2n,
	});

	const result = getCollateralOraclePrice(
		makeLiabilityVault(collateralVault, sharePrice),
		collateralVault,
	);

	assert.equal(
		result?.amountOutMid,
		expectedAssetPrice(sharePrice.amountOutMid, collateralVault),
	);
	assert.equal(
		result?.amountOutAsk,
		expectedAssetPrice(sharePrice.amountOutAsk, collateralVault),
	);
	assert.equal(
		result?.amountOutBid,
		expectedAssetPrice(sharePrice.amountOutBid, collateralVault),
	);
	assert.notEqual(
		result?.amountOutMid,
		(sharePrice.amountOutMid * collateralVault.totalShares) /
			collateralVault.totalAssets,
	);
});

test("getCollateralOraclePrice returns EVault price when totalAssets is zero", () => {
	const collateralVault = makeEVaultCollateral({
		totalAssets: 0n,
		totalShares: 1n,
	});
	const sharePrice = makeOraclePrice();

	const result = getCollateralOraclePrice(
		makeLiabilityVault(collateralVault, sharePrice),
		collateralVault,
	);

	assert.equal(
		result?.amountOutMid,
		expectedAssetPrice(sharePrice.amountOutMid, collateralVault),
	);
	assert.ok(result?.amountOutMid);
});

test("getCollateralOraclePrice uses EulerEarn virtual conversion in donated-asset states", () => {
	const collateralVault = makeEulerEarnCollateral({
		totalAssets: ONE_18,
		totalShares: 0n,
	});
	const sharePrice = makeOraclePrice();

	const result = getCollateralOraclePrice(
		makeLiabilityVault(collateralVault, sharePrice),
		collateralVault,
	);

	assert.equal(
		result?.amountOutMid,
		expectedAssetPrice(sharePrice.amountOutMid, collateralVault),
	);
	assert.notEqual(result?.amountOutMid, 0n);
});
