import type {
	Abi,
	Address,
	Hex,
	StateOverride,
	TypedDataDomain,
	TypedDataParameter,
} from "viem";
import type { Account, IHasVaultAddress } from "../../entities/Account.js";
import type { SwapQuote } from "../swapService/index.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../executionService/index.js";

export type PositionMigrationDirection =
	| "external-to-euler"
	| "euler-to-external";

export type MigrationAssetAmount = {
	asset: Address;
	amount: bigint;
	shares?: bigint;
};

export type MigrationPosition<TRaw = unknown, TPositionRef = unknown> = {
	connectorId: string;
	protocol: string;
	id: string;
	chainId: number;
	owner: Address;
	ref: TPositionRef;
	debt: MigrationAssetAmount;
	collateral: MigrationAssetAmount;
	raw: TRaw;
};

export type MigrationTargetAsset = {
	asset: Address;
	symbol?: string;
	decimals?: number;
};

export type MigrationTarget<
	TRaw = unknown,
	TPositionRef = unknown,
	TExtraData = unknown,
> = {
	connectorId: string;
	protocol: string;
	id: string;
	chainId: number;
	ref: TPositionRef;
	debt: MigrationTargetAsset;
	collateral: MigrationTargetAsset;
	liquidity?: MigrationAssetAmount;
	raw?: TRaw;
	extraData?: TExtraData;
};

export type TypedDataMigrationAuthorizationRequest<
	TMessage extends Record<string, unknown> = Record<string, unknown>,
> = {
	kind: "typedData";
	connectorId: string;
	protocol: string;
	chainId: number;
	owner: Address;
	positionId?: string;
	typedData: {
		domain: TypedDataDomain;
		types: Record<string, readonly TypedDataParameter[]>;
		primaryType: string;
		message: TMessage;
	};
	postMigrationAuthorization?: MigrationAuthorizationRequest;
};

export type TransactionMigrationAuthorizationRequest = {
	kind: "transaction";
	connectorId: string;
	protocol: string;
	chainId: number;
	owner: Address;
	positionId?: string;
	call: {
		to: Address;
		abi: Abi;
		functionName: string;
		args: readonly unknown[];
		value?: bigint;
	};
	postMigrationAuthorization?: MigrationAuthorizationRequest;
};

export type MigrationAuthorizationRequest =
	| TypedDataMigrationAuthorizationRequest
	| TransactionMigrationAuthorizationRequest;

export type SignedMigrationAuthorization<
	TRequest extends
		MigrationAuthorizationRequest = MigrationAuthorizationRequest,
> = {
	request: TRequest;
	signature?: Hex;
	data?: unknown;
	postMigrationAuthorization?: SignedMigrationAuthorization;
};

export type EulerMigrationTarget = {
	eulerAccount: Address;
	borrowVault?: Address;
	collateralVault: Address;
	swapper?: Address;
	borrowAmount?: bigint;
	interestBufferBps?: bigint;
	minCollateralAssets?: bigint;
	enableController?: boolean;
	enableCollateral?: boolean;
	/**
	 * How swapped collateral is verified and credited to the target vault:
	 * `skim` (default) routes the swap output to the vault and skims it —
	 * EVault targets only. `deposit` routes the output to the SwapVerifier and
	 * deposits it via `verifyAmountMinAndDeposit`, which works for any ERC-4626
	 * target (e.g. EulerEarn); it requires a supply-only migration and a quote
	 * requested with `transferOutputToReceiver`.
	 */
	collateralSwapVerification?: "skim" | "deposit";
};

export type EulerMigrationSource = {
	eulerAccount: Address;
	borrowVault: Address;
	collateralVault: Address;
	swapper?: Address;
	debtAmount?: bigint;
	collateralAmount?: bigint;
	collateralShares?: bigint;
};

export type ExternalMigrationTarget<TPositionRef = unknown> = {
	positionRef?: TPositionRef;
	borrowAmount?: bigint;
	collateralAmount?: bigint;
	repayAmount?: bigint;
	interestBufferBps?: bigint;
};

export type ListMigrationPositionsArgs<TPositionRef = unknown> = {
	connectorId?: string;
	chainId: number;
	owner: Address;
	positionRefs?: readonly TPositionRef[];
};

export type ListMigrationTargetsArgs = {
	connectorId?: string;
	chainId: number;
	direction?: PositionMigrationDirection;
	debtAsset: Address;
	collateralAsset: Address;
	minLiquidity?: bigint;
};

export type GetMigrationPositionArgs<TPositionRef = unknown> = {
	connectorId: string;
	chainId: number;
	owner: Address;
	positionRef: TPositionRef;
};

export type GetMigrationAuthorizationArgs<
	TPosition extends MigrationPosition = MigrationPosition,
> = {
	direction: PositionMigrationDirection;
	connectorId: string;
	chainId: number;
	owner: Address;
	position?: TPosition;
	positionRef?: unknown;
	target?: EulerMigrationTarget;
	source?: EulerMigrationSource;
	externalTarget?: ExternalMigrationTarget;
	deadline?: bigint;
	removeAuthorizationAfterMigration?: boolean;
	/** Account snapshot used when authorization amounts depend on Euler source state. */
	account?: Account<IHasVaultAddress>;
};

export type BuildMigrationBatchArgs<
	TPosition extends MigrationPosition = MigrationPosition,
> = {
	direction: PositionMigrationDirection;
	connectorId: string;
	chainId: number;
	owner: Address;
	position?: TPosition;
	positionRef?: unknown;
	target?: EulerMigrationTarget;
	source?: EulerMigrationSource;
	externalTarget?: ExternalMigrationTarget;
	authorizationRequest?: MigrationAuthorizationRequest;
	authorization?: SignedMigrationAuthorization;
	/**
	 * Internal simulation hint: when a caller already resolved that an
	 * authorization is required and supplied `authorization`, connectors can add
	 * the authorization item without re-reading the live authorization state.
	 */
	skipAuthorizationCheck?: boolean;
	collateralSwapQuote?: SwapQuote;
	debtSwapQuote?: SwapQuote;
	deadline?: bigint;
	validateEulerVaults?: boolean;
	removeAuthorizationAfterMigration?: boolean;
	/** Account snapshot used to derive outgoing Euler cleanup actions. */
	account?: Account<IHasVaultAddress>;
	/**
	 * For euler-to-external migrations, move secondary Euler collateral vault
	 * shares from the source sub-account to the owner account after the debt is
	 * repaid. The source borrow controller is disabled for all outgoing
	 * migrations regardless of this flag.
	 */
	cleanupEulerPosition?: boolean;
};

export type PlanMigrationArgs<
	TPosition extends MigrationPosition = MigrationPosition,
> = BuildMigrationBatchArgs<TPosition> & {
	operationName?: string;
};

export type PlanMigrationSimulationResult = {
	plan: TransactionPlan;
	stateOverrides: StateOverride;
	/**
	 * The full migration plan including authorization items carrying placeholder
	 * (stub) signatures — or the caller-provided signed authorization when one
	 * was passed. Suitable for calldata preview/display without a second
	 * `planMigration` round trip; the batch is built exactly once for both plans.
	 */
	previewPlan: TransactionPlan;
	/**
	 * The authorization request that must be signed at execution time, if any.
	 * Resolved internally when the caller did not provide one, so consumers can
	 * reuse it (e.g. for signature-step display) without a separate
	 * `getAuthorization` call.
	 */
	authorizationRequest?: MigrationAuthorizationRequest;
};

export type BuildConnectorMigrationBatchArgs<
	TPosition extends MigrationPosition = MigrationPosition,
> = Omit<
	BuildMigrationBatchArgs<TPosition>,
	"connectorId" | "validateEulerVaults"
> & {
	position: TPosition;
};

export type PositionMigrationConnectorMetadata = {
	id: string;
	protocol: string;
	name: string;
};

export interface PositionMigrationConnector<
	TPositionRef = unknown,
	TPosition extends MigrationPosition = MigrationPosition,
> extends PositionMigrationConnectorMetadata {
	getProtocolAddress?(chainId: number): Address | undefined;
	listPositions?(
		args: ListMigrationPositionsArgs<TPositionRef>,
	): Promise<TPosition[]>;
	listTargets?(
		args: ListMigrationTargetsArgs,
	): Promise<MigrationTarget<unknown, TPositionRef>[]>;
	getPosition(args: GetMigrationPositionArgs<TPositionRef>): Promise<TPosition>;
	getAuthorization?(
		args: GetMigrationAuthorizationArgs<TPosition>,
	): Promise<MigrationAuthorizationRequest | undefined>;
	buildMigrationBatch(
		args: BuildConnectorMigrationBatchArgs<TPosition>,
	): Promise<EVCBatchItem[]> | EVCBatchItem[];
}

export type PositionMigrationServiceConfig = {
	includeDefaultConnectors?: boolean;
	connectors?: PositionMigrationConnector[];
};

export interface IPositionMigrationService {
	getConnectors(): PositionMigrationConnectorMetadata[];
	registerConnector(connector: PositionMigrationConnector): void;
	getConnector(connectorId: string): PositionMigrationConnector;
	getConnectorProtocolAddress(
		connectorId: string,
		chainId: number,
	): Address | undefined;
	listPositions(args: ListMigrationPositionsArgs): Promise<MigrationPosition[]>;
	listTargets(args: ListMigrationTargetsArgs): Promise<MigrationTarget[]>;
	getPosition(args: GetMigrationPositionArgs): Promise<MigrationPosition>;
	getAuthorization(
		args: GetMigrationAuthorizationArgs,
	): Promise<MigrationAuthorizationRequest | undefined>;
	buildMigrationBatch(args: BuildMigrationBatchArgs): Promise<EVCBatchItem[]>;
	planMigration(args: PlanMigrationArgs): Promise<TransactionPlan>;
	planMigrationSimulation(
		args: PlanMigrationArgs,
	): Promise<PlanMigrationSimulationResult>;
}
