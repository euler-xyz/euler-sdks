import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, getAddress, zeroAddress } from "viem";
import {
	decodeOracleInfo,
	decodeOracleResolvedVaults,
} from "../src/utils/oracle.js";
import { convertVaultInfoFullToIEVault } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/vaultInfoConverter.js";
import { convertVault } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.js";

const BASE = "0x00000000000000000000000000000000000000f1" as const;
const QUOTE = "0x0000000000000000000000000000000000000348" as const;

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
	assert.deepEqual(vault.oracle.adapters, []);
	assert.deepEqual(vault.oracle.resolvedVaults, []);
});

test("convertVault maps V3 oracle resolved vault rows", () => {
	const collateralVault = "0x0000000000000000000000000000000000000a11";
	const collateralAsset = getAddress(
		"0x0000000000000000000000000000000000000a12",
	);
	const resolvedVault = getAddress("0x0000000000000000000000000000000000000b11");
	const resolvedAsset = getAddress("0x0000000000000000000000000000000000000b12");
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
				oracle: "0x00000000000000000000000000000000000000d3",
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
				borrowSPY: "0",
				borrowAPY: "0",
				supplyAPY: "0",
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

	assert.deepEqual(vault.oracle.resolvedVaults, [
		{
			vault: resolvedVault,
			asset: resolvedAsset,
			quote: QUOTE,
			resolvedAssets: [resolvedAsset],
		},
	]);
});
