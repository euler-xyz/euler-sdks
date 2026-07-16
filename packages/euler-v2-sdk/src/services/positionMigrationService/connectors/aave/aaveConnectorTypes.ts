import type { Address, Hex } from "viem";
import type {
	MigrationPosition,
	MigrationAuthorizationCall,
	TransactionMigrationAuthorizationRequest,
	TypedDataMigrationAuthorizationRequest,
} from "../../positionMigrationServiceTypes.js";

export type AavePositionRef = {
	collateralAsset: Address;
	debtAsset?: Address;
	pool?: Address;
};

export type AaveMarketDeploymentConfig = {
	chainId: number;
	pool: Address;
	marketName?: string;
};

export type AaveReserveTokens = {
	aTokenAddress: Address;
	stableDebtTokenAddress: Address;
	variableDebtTokenAddress: Address;
};

export type AaveReserveData = AaveReserveTokens & {
	configurationData: bigint;
};

export type AaveMigrationTargetMetadata = {
	pool: Address;
	marketName?: string;
	availableLiquidity?: bigint;
	totalSupplied?: bigint;
	totalMarketSizeUsd?: string;
	totalAvailableLiquidityUsd?: string;
};

export type AaveMigrationTargetRaw = AaveMigrationTargetMetadata & {
	collateralReserve: AaveReserveData;
	debtReserve: AaveReserveData;
};

export type AaveMigrationTargetExtraData = AaveMigrationTargetMetadata;

export type AavePositionRaw = {
	id: string;
	owner: Address;
	pool: Address;
	marketName?: string;
	collateralAsset: Address;
	debtAsset?: Address;
	collateralReserve: AaveReserveTokens;
	debtReserve?: AaveReserveTokens;
	aTokenBalance: bigint;
	stableDebt: bigint;
	variableDebt: bigint;
};

export type AaveMigrationPosition = MigrationPosition<
	AavePositionRaw,
	AavePositionRef
>;

export type AavePermitTypedDataMessage = {
	owner: Address;
	spender: Address;
	value: bigint;
	nonce: bigint;
	deadline: bigint;
} & Record<string, unknown>;

export type AaveDelegationTypedDataMessage = {
	delegatee: Address;
	value: bigint;
	nonce: bigint;
	deadline: bigint;
} & Record<string, unknown>;

export type AavePermitTypedDataRequest =
	TypedDataMigrationAuthorizationRequest<AavePermitTypedDataMessage> & {
		authorizationType: "aTokenPermit";
		token: Address;
	};

export type AaveDelegationTypedDataRequest =
	TypedDataMigrationAuthorizationRequest<AaveDelegationTypedDataMessage> & {
		authorizationType: "variableDebtDelegation";
		token: Address;
		delegator: Address;
	};

/** `aToken.approve` — the signature-free counterpart of the aToken permit. */
export type AaveATokenApprovalTransactionRequest =
	TransactionMigrationAuthorizationRequest & {
		authorizationType: "aTokenApproval";
		token: Address;
		revocation: MigrationAuthorizationCall;
	};

/** `variableDebtToken.approveDelegation` — counterpart of the debt delegation. */
export type AaveDebtDelegationTransactionRequest =
	TransactionMigrationAuthorizationRequest & {
		authorizationType: "variableDebtDelegationApproval";
		token: Address;
		delegator: Address;
		revocation: MigrationAuthorizationCall;
	};

export type AaveMigrationAuthorizationRequest =
	| AavePermitTypedDataRequest
	| AaveDelegationTypedDataRequest
	| AaveATokenApprovalTransactionRequest
	| AaveDebtDelegationTransactionRequest;

export type AaveSignature = {
	v: number;
	r: Hex;
	s: Hex;
};

export type AaveMigrationConnectorConfig = {
	poolAddresses?: Record<number, Address>;
	deployments?: AaveMarketDeploymentConfig[];
	graphqlEndpoint?: string | null;
	defaultInterestBufferBps?: bigint;
	defaultOutboundInterestBufferBps?: bigint;
	referralCode?: number;
};
