/** Shared VaultLens `getVaultInfoFull` fixture for on-chain converter tests. */
export const LENS_BASE_ASSET = "0x00000000000000000000000000000000000000f1" as const;
export const LENS_QUOTE_ASSET = "0x0000000000000000000000000000000000000348" as const;

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const emptyPriceInfo = {
	queryFailure: false,
	queryFailureReason: "0x",
	timestamp: 1n,
	oracle: ZERO,
	asset: LENS_BASE_ASSET,
	unitOfAccount: LENS_QUOTE_ASSET,
	amountIn: 1n,
	amountOutMid: 1n,
	amountOutBid: 1n,
	amountOutAsk: 1n,
} as const;

/**
 * A complete `VaultInfoFull` as the lens returns it: every ABI field is
 * present, so the fixture both converts and ABI-encodes (for simulation
 * batches). `oracleInfo` is the caller's, so oracle decoding can be varied.
 */
export function makeVaultInfo(oracleInfo: {
	oracle: `0x${string}`;
	name: string;
	oracleInfo: `0x${string}`;
}) {
	return {
		timestamp: 1n,
		vault: "0x0000000000000000000000000000000000000abc",
		vaultName: "Vault",
		vaultSymbol: "vBASE",
		vaultDecimals: 18n,
		asset: LENS_BASE_ASSET,
		assetName: "Base Asset",
		assetSymbol: "BASE",
		assetDecimals: 18n,
		unitOfAccount: LENS_QUOTE_ASSET,
		unitOfAccountName: "USD",
		unitOfAccountSymbol: "USD",
		unitOfAccountDecimals: 18n,
		totalShares: 0n,
		totalCash: 0n,
		totalBorrowed: 0n,
		totalAssets: 0n,
		accumulatedFeesShares: 0n,
		accumulatedFeesAssets: 0n,
		governorFeeReceiver: "0x0000000000000000000000000000000000000005",
		protocolFeeReceiver: "0x0000000000000000000000000000000000000006",
		protocolFeeShare: 0n,
		interestFee: 0n,
		hookedOperations: 0n,
		configFlags: 0n,
		supplyCap: 0n,
		borrowCap: 0n,
		maxLiquidationDiscount: 0n,
		liquidationCoolOffTime: 0n,
		dToken: "0x0000000000000000000000000000000000000003",
		oracle: "0x0000000000000000000000000000000000000008",
		interestRateModel: "0x0000000000000000000000000000000000000009",
		hookTarget: "0x0000000000000000000000000000000000000007",
		evc: ZERO,
		protocolConfig: ZERO,
		balanceTracker: "0x0000000000000000000000000000000000000004",
		permit2: ZERO,
		creator: "0x0000000000000000000000000000000000000001",
		governorAdmin: "0x0000000000000000000000000000000000000002",
		irmInfo: {
			queryFailure: false,
			queryFailureReason: "0x",
			vault: "0x0000000000000000000000000000000000000abc",
			interestRateModel: "0x0000000000000000000000000000000000000009",
			interestRateInfo: [
				{ cash: 0n, borrows: 0n, borrowSPY: 0n, borrowAPY: 0n, supplyAPY: 0n },
			],
			interestRateModelInfo: {
				interestRateModel: "0x0000000000000000000000000000000000000009",
				interestRateModelType: 0n,
				interestRateModelParams: "0x",
			},
		},
		collateralLTVInfo: [],
		liabilityPriceInfo: emptyPriceInfo,
		collateralPriceInfo: [],
		oracleInfo,
		backupAssetPriceInfo: emptyPriceInfo,
		backupAssetOracleInfo: { oracle: ZERO, name: "", oracleInfo: "0x" },
	} as const;
}
