import type { Address, Hex } from "viem";
import type {
	MigrationPosition,
	TypedDataMigrationAuthorizationRequest,
} from "../../positionMigrationServiceTypes.js";

export type MorphoMarketParams = {
	loanToken: Address;
	collateralToken: Address;
	oracle: Address;
	irm: Address;
	lltv: bigint;
};

export type MorphoMarketState = {
	totalSupplyAssets: bigint;
	totalSupplyShares: bigint;
	totalBorrowAssets: bigint;
	totalBorrowShares: bigint;
	lastUpdate: bigint;
	fee: bigint;
};

export type MorphoPositionRaw = {
	marketId: Hex;
	owner: Address;
	supplyShares: bigint;
	borrowShares: bigint;
	collateral: bigint;
	borrowAssets: bigint;
	market: MorphoMarketState;
	marketParams: MorphoMarketParams;
};

export type MorphoMigrationPosition = MigrationPosition<
	MorphoPositionRaw,
	MorphoMarketParams
>;

export type MorphoMigrationTargetRaw = {
	marketId: Hex;
	listed: boolean;
	borrowApy?: number | null;
	netBorrowApy?: number | null;
	supplyApy?: number | null;
	lltv: number | null;
	liquidityAssets: bigint;
	liquidityAssetsUsd?: number | null;
};

export type MorphoAuthorization = {
	authorizer: Address;
	authorized: Address;
	isAuthorized: boolean;
	nonce: bigint;
	deadline: bigint;
};

export type MorphoAuthorizationTypedDataMessage = MorphoAuthorization &
	Record<string, unknown>;

export type MorphoAuthorizationTypedDataRequest =
	TypedDataMigrationAuthorizationRequest<MorphoAuthorizationTypedDataMessage>;

export type MorphoSignature = {
	v: number;
	r: Hex;
	s: Hex;
};

export type MorphoMigrationConnectorConfig = {
	morphoAddresses?: Record<number, Address>;
	defaultInterestBufferBps?: bigint;
	morphoGraphqlUrl?: string;
	fetchFn?: typeof fetch;
	defaultMinLiquidity?: bigint;
};
