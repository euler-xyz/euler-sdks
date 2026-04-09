import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, zeroAddress } from "viem";
import { decodeOracleInfo } from "../src/utils/oracle.js";
import { convertVaultInfoFullToIEVault } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/vaultInfoConverter.js";

const BASE = "0x00000000000000000000000000000000000000f1" as const;
const QUOTE = "0x0000000000000000000000000000000000000348" as const;

function encodeRouterInfo({
	fallbackOracleInfo,
	resolvedOraclesInfo,
	bases,
	quotes,
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
				resolvedAssets: [],
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
});
