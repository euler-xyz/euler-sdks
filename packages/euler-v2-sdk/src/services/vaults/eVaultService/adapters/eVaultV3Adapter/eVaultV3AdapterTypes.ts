import type { Hex } from "viem";
import type { EVaultHookedOperations } from "../../../../../entities/EVault.js";

export type V3Envelope<T> = {
	data?: T;
};

export type V3ListEnvelope<T> = {
	data?: T[];
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
	};
};

export type V3Token = {
	address: string;
	symbol: string;
	decimals: number;
	name: string;
};

export type V3PythOracleDetail = {
	pyth: string;
	base: string;
	quote: string;
	feedId: Hex | string;
	maxStaleness: string | bigint;
	maxConfWidth: string | bigint;
};

export type V3OracleAdapter = {
	oracle: string;
	name: string;
	base: string;
	quote: string;
	pythDetail?: V3PythOracleDetail;
	chainlinkDetail?: { oracle: string };
};

export type V3OracleResolvedVault = {
	vault: string;
	quote: string;
	asset: string;
	resolvedAssets: string[];
};

export type V3OraclePrice = {
	queryFailure: boolean;
	queryFailureReason: string;
	amountIn: string;
	amountOutMid: string;
	amountOutBid: string;
	amountOutAsk: string;
	timestamp: string;
};

export type V3CollateralRow = {
	collateral: string;
	vaultType?: string;
	collateralName?: string;
	collateralSymbol?: string;
	asset?: string;
	assetSymbol?: string;
	assetDecimals?: number;
	borrowLTV: string;
	liquidationLTV: string;
	initialLiquidationLTV: string;
	targetTimestamp: number;
	rampDuration: number;
	oraclePriceRaw?: V3OraclePrice | null;
};

export type V3VaultDetail = {
	chainId: number;
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	shares?: V3Token;
	asset?: V3Token;
	dToken: string;
	oracle?: {
		oracle: string;
		name: string;
		adapters: V3OracleAdapter[];
		resolvedVaults?: V3OracleResolvedVault[];
	};
	unitOfAccount?: V3Token;
	creator: string;
	governor?: string;
	governorAdmin: string;
	totalShares: string;
	totalAssets: string;
	totalBorrows: string;
	totalBorrowed: string;
	totalCash: string;
	cash?: string;
	interestRate?: string;
	interestAccumulator?: string;
	accumulatedFees?: string;
	balanceTracker: string;
	fees?: {
		interestFee: number;
		accumulatedFeesShares: string;
		accumulatedFeesAssets: string;
		governorFeeReceiver: string;
		protocolFeeReceiver: string;
		protocolFeeShare: number;
	};
	hooks?: {
		hookedOperations?: Partial<Record<keyof EVaultHookedOperations, boolean>>;
		hookTarget: string;
	};
	caps?: {
		supplyCap: string;
		borrowCap: string;
	};
	liquidation?: {
		maxLiquidationDiscount: number;
		liquidationCoolOffTime: number;
		socializeDebt: boolean;
	};
	interestRates?: {
		borrowSPY: string;
		borrowAPY: string;
		supplyAPY: string;
	};
	interestRateModel?: {
		address: string;
		type: string;
		data: unknown;
	};
	evcCompatibleAsset: boolean;
	oraclePriceRaw?: V3OraclePrice;
	timestamp: string;
};

export type V3VaultDetailWithIncludes = V3VaultDetail & {
	collaterals?: V3CollateralRow[] | null;
};

export type V3VaultBatchRequest = {
	chainId: number;
	addresses: string[];
	include?: ["collaterals"];
};

export type V3VaultBatchMeta = {
	count?: number;
	requested?: number;
	notFound?: string[];
	timestamp?: string;
	chainId?: string;
};

export type V3VaultBatchResponse = {
	data?: V3VaultDetailWithIncludes[];
	meta?: V3VaultBatchMeta;
};

export type V3VaultListRow = {
	address: string;
};
