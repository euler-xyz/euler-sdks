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
	symbol?: string | null;
	decimals?: number | null;
	name?: string | null;
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
	targetTimestamp: number | string;
	rampDuration: number;
	oraclePriceRaw?: V3OraclePrice | null;
};

export type V3VaultDetail = {
	chainId: number;
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	shares?: V3Token | null;
	asset?: V3Token | null;
	dToken: string;
	oracle?: {
		oracle: string;
		name: string;
		adapters: V3OracleAdapter[];
		resolvedVaults: V3OracleResolvedVault[];
	} | null;
	unitOfAccount?: V3Token | null;
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
	balanceTracker?: string | null;
	fees?: {
		interestFee?: number | null;
		accumulatedFeesShares?: string | null;
		accumulatedFeesAssets?: string | null;
		governorFeeReceiver?: string | null;
		protocolFeeReceiver?: string | null;
		protocolFeeShare?: number | null;
	} | null;
	hooks?: {
		hookedOperations?: Partial<Record<keyof EVaultHookedOperations, boolean>>;
		hookTarget?: string | null;
	} | null;
	caps?: {
		supplyCap?: string | null;
		borrowCap?: string | null;
	} | null;
	liquidation?: {
		maxLiquidationDiscount?: number | null;
		liquidationCoolOffTime?: number | null;
		socializeDebt?: boolean | null;
	} | null;
	interestRates?: {
		borrowSPY?: string | null;
		borrowAPY?: string | null;
		supplyAPY?: string | null;
	} | null;
	interestRateModel?: {
		address?: string | null;
		type?: string | null;
		data: unknown;
	} | null;
	evcCompatibleAsset?: boolean | null;
	oraclePriceRaw?: V3OraclePrice | null;
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
