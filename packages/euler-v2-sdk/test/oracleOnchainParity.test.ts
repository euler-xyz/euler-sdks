import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeAbiParameters, getAddress, zeroAddress } from "viem";
import {
	decodeOracleInfo,
	decodeOracleRouteForPair,
	decodeOracleResolvedVaults,
	getOracleRouteAdapters,
	getOracleRouteResolvedVaults,
} from "../src/utils/oracle.js";
import { convertVaultInfoFullToIEVault } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/vaultInfoConverter.js";
import { convertVault } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.js";

const BASE = "0x00000000000000000000000000000000000000f1" as const;
const QUOTE = "0x0000000000000000000000000000000000000348" as const;
const PYTH_FEED_ID =
	"0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20" as const;

function encodeRouterInfo({
	fallbackOracleInfo,
	resolvedOraclesInfo,
	bases,
	quotes,
	resolvedAssets,
}: {
	fallbackOracleInfo: {
		oracle: `0x${string}`;
		name: string;
		oracleInfo: `0x${string}`;
	};
	resolvedOraclesInfo: Array<{
		oracle: `0x${string}`;
		name: string;
		oracleInfo: `0x${string}`;
	}>;
	bases: `0x${string}`[];
	quotes: `0x${string}`[];
	resolvedAssets?: `0x${string}`[][];
}) {
	return encodeAbiParameters(
		[
			{
				type: "tuple",
				components: [
					{ name: "governor", type: "address" },
					{ name: "fallbackOracle", type: "address" },
					{
						name: "fallbackOracleInfo",
						type: "tuple",
						components: [
							{ name: "oracle", type: "address" },
							{ name: "name", type: "string" },
							{ name: "oracleInfo", type: "bytes" },
						],
					},
					{ name: "bases", type: "address[]" },
					{ name: "quotes", type: "address[]" },
					{ name: "resolvedAssets", type: "address[][]" },
					{ name: "resolvedOracles", type: "address[]" },
					{
						name: "resolvedOraclesInfo",
						type: "tuple[]",
						components: [
							{ name: "oracle", type: "address" },
							{ name: "name", type: "string" },
							{ name: "oracleInfo", type: "bytes" },
						],
					},
				],
			},
		],
		[
			{
				governor: "0x00000000000000000000000000000000000000aa",
				fallbackOracle: fallbackOracleInfo.oracle,
				fallbackOracleInfo,
				bases,
				quotes,
				resolvedAssets: resolvedAssets ?? [],
				resolvedOracles: resolvedOraclesInfo.map((info) => info.oracle),
				resolvedOraclesInfo,
			},
		],
	);
}

function encodePythOracleInfo({
	pyth,
	base,
	quote,
}: {
	pyth: `0x${string}`;
	base: `0x${string}`;
	quote: `0x${string}`;
}) {
	return encodeAbiParameters(
		[
			{
				type: "tuple",
				components: [
					{ name: "pyth", type: "address" },
					{ name: "base", type: "address" },
					{ name: "quote", type: "address" },
					{ name: "feedId", type: "bytes32" },
					{ name: "maxStaleness", type: "uint256" },
					{ name: "maxConfWidth", type: "uint256" },
				],
			},
		],
		[
			{
				pyth,
				base,
				quote,
				feedId: PYTH_FEED_ID,
				maxStaleness: 60n,
				maxConfWidth: 0n,
			},
		],
	);
}

function encodeCrossAdapterInfo({
	base,
	cross,
	quote,
	oracleBaseCrossInfo,
	oracleCrossQuoteInfo,
}: {
	base: `0x${string}`;
	cross: `0x${string}`;
	quote: `0x${string}`;
	oracleBaseCrossInfo: {
		oracle: `0x${string}`;
		name: string;
		oracleInfo: `0x${string}`;
	};
	oracleCrossQuoteInfo: {
		oracle: `0x${string}`;
		name: string;
		oracleInfo: `0x${string}`;
	};
}) {
	return encodeAbiParameters(
		[
			{
				type: "tuple",
				components: [
					{ name: "base", type: "address" },
					{ name: "cross", type: "address" },
					{ name: "quote", type: "address" },
					{ name: "oracleBaseCross", type: "address" },
					{ name: "oracleCrossQuote", type: "address" },
					{
						name: "oracleBaseCrossInfo",
						type: "tuple",
						components: [
							{ name: "oracle", type: "address" },
							{ name: "name", type: "string" },
							{ name: "oracleInfo", type: "bytes" },
						],
					},
					{
						name: "oracleCrossQuoteInfo",
						type: "tuple",
						components: [
							{ name: "oracle", type: "address" },
							{ name: "name", type: "string" },
							{ name: "oracleInfo", type: "bytes" },
						],
					},
				],
			},
		],
		[
			{
				base,
				cross,
				quote,
				oracleBaseCross: oracleBaseCrossInfo.oracle,
				oracleCrossQuote: oracleCrossQuoteInfo.oracle,
				oracleBaseCrossInfo,
				oracleCrossQuoteInfo,
			},
		],
	);
}

function makeVaultInfo(oracleInfo: {
	oracle: `0x${string}`;
	name: string;
	oracleInfo: `0x${string}`;
}) {
	return {
		vault: "0x0000000000000000000000000000000000000abc",
		asset: BASE,
		assetName: "Base Asset",
		assetSymbol: "BASE",
		assetDecimals: 18n,
		vaultName: "Vault",
		vaultSymbol: "vBASE",
		vaultDecimals: 18n,
		unitOfAccount: QUOTE,
		unitOfAccountName: "USD",
		unitOfAccountSymbol: "USD",
		unitOfAccountDecimals: 18n,
		creator: "0x0000000000000000000000000000000000000001",
		governorAdmin: "0x0000000000000000000000000000000000000002",
		dToken: "0x0000000000000000000000000000000000000003",
		balanceTracker: "0x0000000000000000000000000000000000000004",
		interestFee: 0n,
		accumulatedFeesShares: 0n,
		accumulatedFeesAssets: 0n,
		governorFeeReceiver: "0x0000000000000000000000000000000000000005",
		protocolFeeReceiver: "0x0000000000000000000000000000000000000006",
		protocolFeeShare: 0n,
		hookedOperations: 0n,
		hookTarget: "0x0000000000000000000000000000000000000007",
		supplyCap: 0n,
		borrowCap: 0n,
		configFlags: 0n,
		maxLiquidationDiscount: 0n,
		liquidationCoolOffTime: 0n,
		oracle: "0x0000000000000000000000000000000000000008",
		oracleInfo,
		irmInfo: {
			interestRateInfo: [{ borrowSPY: 0n, borrowAPY: 0n, supplyAPY: 0n }],
			interestRateModelInfo: {
				interestRateModel: "0x0000000000000000000000000000000000000009",
				interestRateModelType: 0n,
				interestRateModelParams: "0x",
			},
		},
		collateralLTVInfo: [],
		liabilityPriceInfo: {
			queryFailure: false,
			queryFailureReason: "0x",
			timestamp: 1n,
			amountIn: 1n,
			amountOutMid: 1n,
			amountOutBid: 1n,
			amountOutAsk: 1n,
		},
		timestamp: 1n,
		evcCompatibleAsset: true,
	} as const;
}

test("decodeOracleInfo ignores blank zero-address router leaves like V3", () => {
	const routerInfo = encodeRouterInfo({
		fallbackOracleInfo: {
			oracle: zeroAddress,
			name: "",
			oracleInfo: "0x",
		},
		resolvedOraclesInfo: [
			{
				oracle: zeroAddress,
				name: "",
				oracleInfo: "0x",
			},
		],
		bases: [BASE],
		quotes: [QUOTE],
	});

	const adapters = decodeOracleInfo(
		{
			oracle: "0x00000000000000000000000000000000000000d3",
			name: "EulerRouter",
			oracleInfo: routerInfo,
		},
		3,
		{ base: BASE, quote: QUOTE },
	);

	assert.deepEqual(adapters, []);
});

test("decodeOracleResolvedVaults returns router resolved asset routes", () => {
	const vault = "0x0000000000000000000000000000000000000a11";
	const asset = getAddress("0x0000000000000000000000000000000000000a12");
	const routerInfo = encodeRouterInfo({
		fallbackOracleInfo: {
			oracle: zeroAddress,
			name: "",
			oracleInfo: "0x",
		},
		resolvedOraclesInfo: [
			{
				oracle: zeroAddress,
				name: "",
				oracleInfo: "0x",
			},
		],
		bases: [vault],
		quotes: [QUOTE],
		resolvedAssets: [[asset, QUOTE]],
	});

	const resolvedVaults = decodeOracleResolvedVaults({
		oracle: "0x00000000000000000000000000000000000000d3",
		name: "EulerRouter",
		oracleInfo: routerInfo,
	});

	assert.deepEqual(resolvedVaults, [
		{
			vault,
				asset,
			quote: QUOTE,
			resolvedAssets: [asset, QUOTE],
		},
	]);
});

test("convertVaultInfoFullToIEVault suppresses blank root oracle tuples like V3", () => {
	const errors: unknown[] = [];
	const vault = convertVaultInfoFullToIEVault(
		makeVaultInfo({
			oracle: zeroAddress,
			name: "",
			oracleInfo: "0x1234",
		}),
		1,
		errors as never[],
	);

	assert.equal(vault.oracle.name, "");
	assert.deepEqual(vault.oracle, {
		oracle: zeroAddress,
		name: "",
	});
	assert.equal(vault.debtPricingOracleRoute, undefined);
});

test("VaultLens conversion keeps resolved caps separate from encoded EVK evidence", () => {
	const oracleInfo = {
		oracle: "0x00000000000000000000000000000000000000d3",
		name: "UnknownOracle",
		oracleInfo: "0x1234",
	} as const;
	const vault = convertVaultInfoFullToIEVault(
		{
			...makeVaultInfo(oracleInfo),
			borrowCap: 2_000_000n,
			configFlags: 7n,
			hookedOperations: 9n,
			supplyCap: 1_000_000n,
		},
		1,
		[],
		{ borrowCap: 321n, supplyCap: 123n },
	);

	assert.deepEqual(vault.caps, {
		borrowCap: 2_000_000n,
		supplyCap: 1_000_000n,
	});
	assert.deepEqual(vault.rawConfig, {
		caps: { borrowCap: 321n, supplyCap: 123n },
		configFlags: 7n,
		hookConfig: {
			hookedOperations: 9n,
			hookTarget: "0x0000000000000000000000000000000000000007",
		},
		oracleInfo,
	});
});

test("oracle routes preserve vault unwrap steps and exact configured leaves", () => {
	const collateralVault = "0x0000000000000000000000000000000000000a11";
	const collateralAsset = getAddress(
		"0x0000000000000000000000000000000000000a12",
	);
	const chainlinkOracle = "0x0000000000000000000000000000000000000c11";
	const pythOracle = "0x0000000000000000000000000000000000000c12";
	const oracleInfo = {
		oracle: "0x00000000000000000000000000000000000000d3",
		name: "EulerRouter",
		oracleInfo: encodeRouterInfo({
			fallbackOracleInfo: {
				oracle: pythOracle,
				name: "PythOracle",
				oracleInfo: encodePythOracleInfo({
					pyth: "0x0000000000000000000000000000000000000c13",
					base: collateralVault,
					quote: QUOTE,
				}),
			},
			resolvedOraclesInfo: [
				{
					oracle: chainlinkOracle,
					name: "ChainlinkOracle",
					oracleInfo: "0x",
				},
			],
			bases: [collateralVault],
			quotes: [QUOTE],
			resolvedAssets: [[collateralAsset]],
		}),
	} as const;

	const route = decodeOracleRouteForPair(oracleInfo, collateralVault, QUOTE);
	assert.equal(route?.source, "configured");
	assert.deepEqual(
		route?.steps.map((step) => step.kind),
		["vault", "adapter"],
	);
	assert.equal(route?.steps[0]?.oracle, collateralVault);
	assert.equal(route?.steps[0]?.base, collateralVault);
	assert.equal(route?.steps[0]?.quote, collateralAsset);
	assert.equal(route?.steps[1]?.oracle, chainlinkOracle);
	assert.equal(route?.steps[1]?.base, collateralAsset);
	assert.equal(route?.steps[1]?.quote, QUOTE);
	assert.deepEqual(getOracleRouteAdapters(route).map((adapter) => adapter.oracle), [
		chainlinkOracle,
	]);

	const errors: unknown[] = [];
	const vault = convertVaultInfoFullToIEVault(
		{
			...makeVaultInfo(oracleInfo),
			collateralLTVInfo: [
				{
					collateral: collateralVault,
					borrowLTV: 9_000n,
					liquidationLTV: 9_300n,
					initialLiquidationLTV: 0n,
					targetTimestamp: 1n,
					rampDuration: 0n,
				},
			],
			collateralPriceInfo: [
				{
					queryFailure: false,
					queryFailureReason: "0x",
					timestamp: 1n,
					oracle: oracleInfo.oracle,
					asset: collateralVault,
					unitOfAccount: QUOTE,
					amountIn: 1n,
					amountOutMid: 1n,
					amountOutBid: 1n,
					amountOutAsk: 1n,
				},
			],
		},
		1,
		errors as never[],
	);

	assert.deepEqual(
		vault.collaterals[0]?.oracleRoute?.steps.map((step) => step.kind),
		["vault", "adapter"],
	);
	assert.deepEqual(
		getOracleRouteAdapters(vault.collaterals[0]?.oracleRoute).map(
			(adapter) => adapter.oracle,
		),
		[chainlinkOracle],
	);
});

test("decodeOracleRouteForPair keeps inverted Pyth legs inside cross adapters", () => {
	const usdc = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
	const usd = QUOTE;
	const eul = getAddress("0xd9fcd98c322942075a5c3860693e9f4f03aae07b");
	const crossAdapter = getAddress("0x336D821459db40bA9bfb8a1a89457D689AfbA6E8");
	const chainlinkOracle = getAddress(
		"0x6213f24332D35519039f2afa7e3BffE105a37d3F",
	);
	const pythOracle = getAddress("0xfa9880c197bb245d055ee864653EeECF8619de65");
	const pythContract = getAddress("0x0000000000000000000000000000000000000c13");
	const chainlinkInfo = {
		oracle: chainlinkOracle,
		name: "ChainlinkOracle",
		oracleInfo: "0x",
	} as const;
	const pythInfo = {
		oracle: pythOracle,
		name: "PythOracle",
		oracleInfo: encodePythOracleInfo({
			pyth: pythContract,
			base: eul,
			quote: usd,
		}),
	} as const;
	const oracleInfo = {
		oracle: "0x1FC53457F04fdd8C73B28934C0ee77f1a41F8BC7",
		name: "EulerRouter",
		oracleInfo: encodeRouterInfo({
			fallbackOracleInfo: {
				oracle: zeroAddress,
				name: "",
				oracleInfo: "0x",
			},
			resolvedOraclesInfo: [
				{
					oracle: crossAdapter,
					name: "CrossAdapter",
					oracleInfo: encodeCrossAdapterInfo({
						base: usdc,
						cross: usd,
						quote: eul,
						oracleBaseCrossInfo: chainlinkInfo,
						oracleCrossQuoteInfo: pythInfo,
					}),
				},
			],
			bases: [usdc],
			quotes: [eul],
		}),
	} as const;

	const route = decodeOracleRouteForPair(oracleInfo, usdc, eul);

	assert.equal(route?.source, "configured");
	assert.deepEqual(
		route?.steps.map((step) => step.name),
		["ChainlinkOracle", "PythOracle"],
	);
	assert.equal(route?.steps[0]?.oracle, chainlinkOracle);
	assert.equal(route?.steps[0]?.base, usdc);
	assert.equal(route?.steps[0]?.quote, usd);
	assert.equal(route?.steps[1]?.oracle, pythOracle);
	assert.equal(route?.steps[1]?.base, eul);
	assert.equal(route?.steps[1]?.quote, usd);
});

test("convertVault maps V3 oracle resolved vault routes", () => {
	const collateralVault = "0x0000000000000000000000000000000000000a11";
	const collateralAsset = getAddress(
		"0x0000000000000000000000000000000000000a12",
	);
	const resolvedVault = getAddress("0x0000000000000000000000000000000000000b11");
	const resolvedAsset = getAddress("0x0000000000000000000000000000000000000b12");
	const chainlinkOracle = getAddress("0x0000000000000000000000000000000000000c11");
	const rootOracle = getAddress("0x00000000000000000000000000000000000000d3");
	const errors: unknown[] = [];
	const vault = convertVault(
		{
			chainId: 1,
			address: "0x0000000000000000000000000000000000000abc",
			name: "Vault",
			symbol: "vBASE",
			decimals: 18,
			shares: {
				address: "0x0000000000000000000000000000000000000abc",
				name: "Vault",
				symbol: "vBASE",
				decimals: 18,
			},
			asset: {
				address: BASE,
				name: "Base Asset",
				symbol: "BASE",
				decimals: 18,
			},
			dToken: "0x0000000000000000000000000000000000000003",
			oracle: {
				oracle: rootOracle,
				name: "EulerRouter",
				adapters: [],
				resolvedVaults: [
					{
						vault: resolvedVault,
						asset: resolvedAsset,
						quote: QUOTE,
						resolvedAssets: [resolvedAsset],
					},
				],
				detailedInfo: {
					oracle: rootOracle,
					name: "EulerRouter",
					oracleInfo: encodeRouterInfo({
						fallbackOracleInfo: {
							oracle: chainlinkOracle,
							name: "ChainlinkOracle",
							oracleInfo: "0x",
						},
						resolvedOraclesInfo: [
							{
								oracle: chainlinkOracle,
								name: "ChainlinkOracle",
								oracleInfo: "0x",
							},
						],
						bases: [collateralVault],
						quotes: [QUOTE],
						resolvedAssets: [[resolvedAsset]],
					}),
				},
			},
			unitOfAccount: {
				address: QUOTE,
				name: "USD",
				symbol: "USD",
				decimals: 18,
			},
			creator: "0x0000000000000000000000000000000000000001",
			governorAdmin: "0x0000000000000000000000000000000000000002",
			totalShares: "0",
			totalAssets: "0",
			totalBorrows: "0",
			totalBorrowed: "0",
			totalCash: "0",
			balanceTracker: "0x0000000000000000000000000000000000000004",
			fees: {
				interestFee: 0,
				accumulatedFeesShares: "0",
				accumulatedFeesAssets: "0",
				governorFeeReceiver: "0x0000000000000000000000000000000000000005",
				protocolFeeReceiver: "0x0000000000000000000000000000000000000006",
				protocolFeeShare: 0,
			},
			hooks: {
				hookedOperations: {},
				hookTarget: "0x0000000000000000000000000000000000000007",
			},
			caps: { supplyCap: "0", borrowCap: "0" },
			liquidation: {
				maxLiquidationDiscount: 0,
				liquidationCoolOffTime: 0,
				socializeDebt: false,
			},
			interestRates: {
				borrowSPY: 0,
				borrowAPY: 0,
				supplyAPY: 0,
			},
			interestRateModel: {
				address: "0x0000000000000000000000000000000000000009",
				type: "unknown",
				data: null,
			},
			evcCompatibleAsset: true,
			oraclePriceRaw: {
				queryFailure: false,
				queryFailureReason: "0x",
				amountIn: "1",
				amountOutMid: "1",
				amountOutBid: "1",
				amountOutAsk: "1",
				timestamp: "1970-01-01T00:00:01.000Z",
			},
			timestamp: "1970-01-01T00:00:01.000Z",
		},
		[
			{
				collateral: collateralVault,
				asset: collateralAsset,
				borrowLTV: "9000",
				liquidationLTV: "9300",
				initialLiquidationLTV: "0",
				targetTimestamp: 1,
				rampDuration: 0,
				oraclePriceRaw: {
					queryFailure: false,
					queryFailureReason: "0x",
					amountIn: "1",
					amountOutMid: "1",
					amountOutBid: "1",
					amountOutAsk: "1",
					timestamp: "1970-01-01T00:00:01.000Z",
				},
			},
		],
		errors as never[],
		"0x0000000000000000000000000000000000000abc",
	);

	assert.deepEqual(
		getOracleRouteResolvedVaults(vault.collaterals[0]?.oracleRoute),
		[
			{
				vault: collateralVault,
				asset: resolvedAsset,
				quote: QUOTE,
				resolvedAssets: [resolvedAsset],
			},
		],
	);
	assert.deepEqual(
		getOracleRouteAdapters(vault.collaterals[0]?.oracleRoute).map(
			(adapter) => adapter.oracle,
		),
		[chainlinkOracle],
	);
});

test("convertVault keeps active V3 collateral ramp-down rows with ISO target timestamps", () => {
	const errors = [];
	const vault = convertVault(
		{
			chainId: 1,
			address: "0x0000000000000000000000000000000000000abc",
			name: "Vault",
			symbol: "eTEST",
			decimals: 18,
			asset: {
				address: BASE,
				symbol: "BASE",
				decimals: 18,
				name: "Base",
			},
			dToken: "0x0000000000000000000000000000000000000001",
			creator: "0x0000000000000000000000000000000000000002",
			governorAdmin: "0x0000000000000000000000000000000000000003",
			totalShares: "0",
			totalAssets: "0",
			totalBorrows: "0",
			totalBorrowed: "0",
			totalCash: "0",
			balanceTracker: "0x0000000000000000000000000000000000000004",
			evcCompatibleAsset: true,
			oraclePriceRaw: {
				queryFailure: false,
				queryFailureReason: "0x",
				amountIn: "1",
				amountOutMid: "1",
				amountOutBid: "1",
				amountOutAsk: "1",
				timestamp: "1970-01-01T00:00:01.000Z",
			},
			timestamp: "2026-05-12T00:00:00.000Z",
		},
		[
			{
				collateral: "0x0000000000000000000000000000000000000def",
				borrowLTV: "0",
				liquidationLTV: "0",
				initialLiquidationLTV: "9400",
				targetTimestamp: "2026-05-23T10:28:35.000Z",
				rampDuration: 2592000,
				oraclePriceRaw: {
					queryFailure: false,
					queryFailureReason: "0x",
					amountIn: "1",
					amountOutMid: "1",
					amountOutBid: "1",
					amountOutAsk: "1",
					timestamp: "1970-01-01T00:00:01.000Z",
				},
			},
		],
		errors as never[],
		"0x0000000000000000000000000000000000000abc",
	);

	assert.equal(
		errors.some((error) =>
			error.locations?.some((location) => location.path === "$.targetTimestamp"),
		),
		false,
	);
	assert.equal(vault.collaterals.length, 1);
	assert.equal(vault.collaterals[0]?.borrowLTV, 0);
	assert.equal(vault.collaterals[0]?.liquidationLTV, 0);
	assert.equal(vault.collaterals[0]?.ramping?.targetTimestamp, 1779532115);
	assert.equal(vault.collaterals[0]?.ramping?.initialLiquidationLTV, 0.94);
});
