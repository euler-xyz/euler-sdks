/** Shared VaultLens `getVaultInfoFull` fixture for on-chain converter tests. */
export const LENS_BASE_ASSET = "0x00000000000000000000000000000000000000f1" as const;
export const LENS_QUOTE_ASSET = "0x0000000000000000000000000000000000000348" as const;

export function makeVaultInfo(oracleInfo: {
	oracle: `0x${string}`;
	name: string;
	oracleInfo: `0x${string}`;
}) {
	return {
		vault: "0x0000000000000000000000000000000000000abc",
		asset: LENS_BASE_ASSET,
		assetName: "Base Asset",
		assetSymbol: "BASE",
		assetDecimals: 18n,
		vaultName: "Vault",
		vaultSymbol: "vBASE",
		vaultDecimals: 18n,
		unitOfAccount: LENS_QUOTE_ASSET,
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
