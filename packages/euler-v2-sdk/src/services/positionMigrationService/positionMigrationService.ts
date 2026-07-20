import {
	getAddress,
	maxUint256,
	toHex,
	type Address,
	type Hex,
	type StateOverride,
} from "viem";
import {
	eVaultAbi,
	type EVCBatchItem,
	type IExecutionService,
	type TransactionPlan,
} from "../executionService/index.js";
import type { IProviderService } from "../providerService/index.js";
import { isEVault } from "../vaults/vaultMetaService/index.js";
import { applyBuildQuery, type BuildQueryFn } from "../../utils/buildQuery.js";
import { computeAllowanceSlot } from "../../utils/stateOverrides/index.js";
import { assertSameAddress } from "./connectors/shared.js";
import type {
	BuildMigrationBatchArgs,
	GetMigrationAuthorizationArgs,
	GetMigrationPositionArgs,
	IPositionMigrationService,
	ListMigrationPositionsArgs,
	ListMigrationTargetsArgs,
	MigrationAuthorizationRequest,
	MigrationPosition,
	MigrationTarget,
	PlanMigrationArgs,
	PlanMigrationSimulationResult,
	PositionMigrationDirection,
	PositionMigrationConnector,
	PositionMigrationConnectorMetadata,
	PositionMigrationServiceConfig,
	SignedMigrationAuthorization,
} from "./positionMigrationServiceTypes.js";

const DEFAULT_OPERATION_NAME = "positionMigration";
const ENABLED_MIGRATIONS = new Set([
	"aave:external-to-euler",
	"aave:euler-to-external",
	"morpho:external-to-euler",
	"morpho:euler-to-external",
	"metamorpho:external-to-euler",
]);
const AAVE_CONNECTOR_ID = "aave";
const MORPHO_CONNECTOR_ID = "morpho";
const METAMORPHO_CONNECTOR_ID = "metamorpho";
const AAVE_ATOKEN_ALLOWANCE_SLOT_INDEX = 53n;
const AAVE_VARIABLE_DEBT_ALLOWANCE_SLOT_INDEX = 54n;
const MORPHO_AUTHORIZATION_SLOT_INDEX = 6n;
const METAMORPHO_DEFAULT_ALLOWANCE_SLOT_INDEX = 1n;
const AAVE_PERMIT_SELECTOR = "0xd505accf";
const AAVE_DELEGATION_SELECTOR = "0x0b52d558";
const MORPHO_SET_AUTHORIZATION_SELECTOR = "0x8069218f";
const ERC2612_PERMIT_SELECTOR = "0xd505accf";
const STUB_SIGNATURE = `0x${"00".repeat(65)}` as Hex;

function assertPositionMigrationEnabled(args: {
	connectorId: string;
	direction: PositionMigrationDirection;
}): void {
	if (ENABLED_MIGRATIONS.has(`${args.connectorId}:${args.direction}`)) return;
	throw new Error(
		`External position migration is temporarily disabled for connector ${args.connectorId} in ${args.direction} direction`,
	);
}

type EulerMigrationTargetWithQuotes = NonNullable<
	BuildMigrationBatchArgs["target"]
> &
	Pick<BuildMigrationBatchArgs, "collateralSwapQuote" | "debtSwapQuote">;

type EulerTargetVaultData = {
	collateralVaultAsset: Address;
	borrowVaultAsset?: Address;
	borrowLtv: number;
};

type EulerSourceVaultAssets = {
	borrowVaultAsset: Address;
	collateralVaultAsset: Address;
};

export class PositionMigrationService implements IPositionMigrationService {
	private readonly connectors = new Map<string, PositionMigrationConnector>();

	constructor(
		private readonly providerService: IProviderService,
		private readonly executionService: IExecutionService,
		config?: PositionMigrationServiceConfig,
		buildQuery?: BuildQueryFn,
	) {
		for (const connector of config?.connectors ?? []) {
			this.registerConnector(connector);
		}

		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	getConnectors(): PositionMigrationConnectorMetadata[] {
		return Array.from(this.connectors.values()).map(
			({ id, protocol, name }) => ({
				id,
				protocol,
				name,
			}),
		);
	}

	registerConnector(connector: PositionMigrationConnector): void {
		this.connectors.set(connector.id, connector);
	}

	getConnector(connectorId: string): PositionMigrationConnector {
		const connector = this.connectors.get(connectorId);
		if (!connector) {
			throw new Error(
				`Position migration connector not registered: ${connectorId}`,
			);
		}
		return connector;
	}

	getConnectorProtocolAddress(
		connectorId: string,
		chainId: number,
	): Address | undefined {
		return this.getConnector(connectorId).getProtocolAddress?.(chainId);
	}

	queryListPositions = async (
		args: ListMigrationPositionsArgs,
	): Promise<MigrationPosition[]> => {
		const connectors = args.connectorId
			? [this.getConnector(args.connectorId)]
			: Array.from(this.connectors.values());

		const results = await Promise.all(
			connectors.map((connector) =>
				connector.listPositions
					? connector.listPositions(args)
					: Promise.resolve([]),
			),
		);
		return results.flat();
	};

	async listPositions(
		args: ListMigrationPositionsArgs,
	): Promise<MigrationPosition[]> {
		return this.queryListPositions(args);
	}

	queryListTargets = async (
		args: ListMigrationTargetsArgs,
	): Promise<MigrationTarget[]> => {
		const direction = args.direction ?? "euler-to-external";

		if (args.connectorId) {
			assertPositionMigrationEnabled({
				connectorId: args.connectorId,
				direction,
			});
			const connector = this.getConnector(args.connectorId);
			return connector.listTargets
				? connector.listTargets({ ...args, direction })
				: [];
		}

		const connectors = Array.from(this.connectors.values()).filter(
			(connector) => ENABLED_MIGRATIONS.has(`${connector.id}:${direction}`),
		);
		const results = await Promise.allSettled(
			connectors.map((connector) =>
				connector.listTargets
					? connector.listTargets({ ...args, direction })
					: Promise.resolve([]),
			),
		);
		const targets = results.flatMap((result) =>
			result.status === "fulfilled" ? result.value : [],
		);
		if (targets.length > 0) return targets;

		const failures = results.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		const firstFailure = failures[0];
		if (firstFailure && failures.length === results.length) {
			throw firstFailure.reason;
		}
		return targets;
	};

	async listTargets(
		args: ListMigrationTargetsArgs,
	): Promise<MigrationTarget[]> {
		return this.queryListTargets(args);
	}

	queryGetPosition = async (
		args: GetMigrationPositionArgs,
	): Promise<MigrationPosition> => {
		return this.getConnector(args.connectorId).getPosition(args);
	};

	async getPosition(
		args: GetMigrationPositionArgs,
	): Promise<MigrationPosition> {
		return this.queryGetPosition(args);
	}

	queryGetAuthorization = async (
		args: GetMigrationAuthorizationArgs,
	): Promise<MigrationAuthorizationRequest | undefined> => {
		assertPositionMigrationEnabled(args);

		const connector = this.getConnector(args.connectorId);
		if (!connector.getAuthorization) return undefined;

		const position = await this.resolvePosition(args);
		return connector.getAuthorization({ ...args, position });
	};

	async getAuthorization(
		args: GetMigrationAuthorizationArgs,
	): Promise<MigrationAuthorizationRequest | undefined> {
		return this.queryGetAuthorization(args);
	}

	async buildMigrationBatch(
		args: BuildMigrationBatchArgs,
	): Promise<EVCBatchItem[]> {
		assertPositionMigrationEnabled(args);

		const connector = this.getConnector(args.connectorId);
		const position = await this.resolvePosition(args);

		return this.buildMigrationBatchForConnector(args, connector, position);
	}

	async planMigration(args: PlanMigrationArgs): Promise<TransactionPlan> {
		const items = await this.buildMigrationBatch(args);
		return this.executionService.convertBatchItemsToPlan(
			items,
			args.operationName ?? DEFAULT_OPERATION_NAME,
		);
	}

	async planMigrationSimulation(
		args: PlanMigrationArgs,
	): Promise<PlanMigrationSimulationResult> {
		assertPositionMigrationEnabled(args);

		const connector = this.getConnector(args.connectorId);
		const position = await this.resolvePosition(args);
		const authorizationRequest =
			args.authorization?.request ??
			args.authorizationRequest ??
			(await this.queryGetAuthorization({ ...args, position }));
		const simulationAuthorization = authorizationRequest
			? this.getSimulationAuthorization(authorizationRequest)
			: undefined;
		const items = await this.buildMigrationBatchForConnector(
			{
				...args,
				...(authorizationRequest ? { authorizationRequest } : {}),
				authorization:
					simulationAuthorization?.authorization ??
					args.authorization ??
					(!simulationAuthorization && authorizationRequest
						? this.getStubAuthorization(authorizationRequest)
						: undefined),
				...(simulationAuthorization ? { skipAuthorizationCheck: true } : {}),
			},
			connector,
			position,
		);
		const simulationItems = simulationAuthorization?.skippedCall
			? items.filter(
					(item) =>
						!isAuthorizationItem(item, simulationAuthorization.skippedCall!),
				)
			: items;
		const operationName = args.operationName ?? DEFAULT_OPERATION_NAME;

		return {
			plan: this.executionService.convertBatchItemsToPlan(
				simulationItems,
				operationName,
			),
			stateOverrides: simulationAuthorization?.stateOverrides ?? [],
			// The unfiltered items already carry stub-signed (or caller-signed)
			// authorization calls — exactly what a calldata preview built via
			// `planMigration` with a placeholder authorization would contain.
			// Reusing them avoids a second position-resolve/validate/batch-build.
			previewPlan: this.executionService.convertBatchItemsToPlan(
				items,
				operationName,
			),
			...(authorizationRequest ? { authorizationRequest } : {}),
		};
	}

	private async buildMigrationBatchForConnector(
		args: BuildMigrationBatchArgs,
		connector: PositionMigrationConnector,
		position: MigrationPosition,
	): Promise<EVCBatchItem[]> {
		if (args.validateEulerVaults ?? true) {
			if (args.direction === "external-to-euler") {
				if (!args.target) {
					throw new Error("Euler migration target is required");
				}
				await this.validateEulerTargets(position, {
					...args.target,
					collateralSwapQuote: args.collateralSwapQuote,
					debtSwapQuote: args.debtSwapQuote,
				});
			} else if (args.direction === "euler-to-external") {
				if (!args.source) {
					throw new Error("Euler migration source is required");
				}
				await this.validateEulerSource(position, args.source);
			} else {
				throw new Error(`Unsupported migration direction: ${args.direction}`);
			}
		}

		const items = await connector.buildMigrationBatch({ ...args, position });
		return [...items, ...this.buildOutgoingEulerCleanupItems(args)];
	}

	private buildOutgoingEulerCleanupItems(
		args: BuildMigrationBatchArgs,
	): EVCBatchItem[] {
		if (args.direction !== "euler-to-external" || !args.source) return [];

		const sourceAccount = getAddress(args.source.eulerAccount);
		const sourceBorrowVault = getAddress(args.source.borrowVault);
		const sourceCollateralVault = getAddress(args.source.collateralVault);
		const owner = getAddress(args.owner);
		const items: EVCBatchItem[] = [];
		const seenCollaterals = new Set<string>([
			sourceCollateralVault.toLowerCase(),
		]);

		if (args.cleanupEulerPosition) {
			const account = args.account;
			if (!account) {
				throw new Error("cleanupEulerPosition requires an account snapshot");
			}
			const subAccount = account.getSubAccount(sourceAccount);
			if (!subAccount) {
				throw new Error(
					"cleanupEulerPosition requires the source sub-account snapshot",
				);
			}

			for (const collateral of subAccount.enabledCollaterals ?? []) {
				const collateralVault = getAddress(collateral);
				const collateralKey = collateralVault.toLowerCase();
				if (seenCollaterals.has(collateralKey)) continue;
				seenCollaterals.add(collateralKey);

				items.push(
					this.executionService.encodeDisableCollateral(
						args.chainId,
						sourceAccount,
						collateralVault,
					),
				);

				const collateralPosition = subAccount.positions.find(
					(position) => getAddress(position.vaultAddress) === collateralVault,
				);
				if (
					collateralPosition &&
					collateralPosition.shares > 0n &&
					isEVault(collateralPosition.vault) &&
					sourceAccount !== owner
				) {
					items.push(
						this.executionService.encodeTransferFromMax(
							collateralVault,
							sourceAccount,
							owner,
						),
					);
				}
			}
		}

		items.push(
			this.executionService.encodeDisableController(
				sourceBorrowVault,
				sourceAccount,
			),
		);
		return items;
	}

	private async resolvePosition(args: {
		connectorId: string;
		chainId: number;
		owner: Address;
		position?: MigrationPosition;
		positionRef?: unknown;
	}): Promise<MigrationPosition> {
		if (args.position) return args.position;
		if (args.positionRef === undefined) {
			throw new Error(
				"Migration position or positionRef is required to resolve a source position",
			);
		}

		return this.queryGetPosition({
			connectorId: args.connectorId,
			chainId: args.chainId,
			owner: args.owner,
			positionRef: args.positionRef,
		});
	}

	private getStubAuthorization(
		request: SignedMigrationAuthorization["request"],
	): SignedMigrationAuthorization {
		const postMigrationAuthorization = request.postMigrationAuthorization
			? this.getStubAuthorization(request.postMigrationAuthorization)
			: undefined;
		return {
			request,
			signature: STUB_SIGNATURE,
			...(postMigrationAuthorization ? { postMigrationAuthorization } : {}),
		};
	}

	private getSimulationAuthorization(
		request: SignedMigrationAuthorization["request"],
	):
		| {
				authorization?: SignedMigrationAuthorization;
				stateOverrides: StateOverride;
				skippedCall?: { target: Address; selector: Hex };
		  }
		| undefined {
		if (request.kind === "transaction") {
			const authorizationType = (request as { authorizationType?: string })
				.authorizationType;
			const authorized = request.call.args[0];
			const grantedValue = request.call.args[1];

			if (
				request.connectorId === AAVE_CONNECTOR_ID &&
				authorizationType === "aTokenApproval" &&
				"token" in request &&
				typeof authorized === "string" &&
				typeof grantedValue === "bigint"
			) {
				const token = getAddress((request as { token: Address }).token);
				const slot = computeAllowanceSlot(
					getAddress(request.owner),
					getAddress(authorized),
					AAVE_ATOKEN_ALLOWANCE_SLOT_INDEX,
				);
				return {
					stateOverrides: [
						{
							address: token,
							stateDiff: [{ slot, value: toHex(grantedValue, { size: 32 }) }],
						},
					],
				};
			}

			if (
				request.connectorId === AAVE_CONNECTOR_ID &&
				authorizationType === "variableDebtDelegationApproval" &&
				"token" in request &&
				typeof authorized === "string" &&
				typeof grantedValue === "bigint"
			) {
				const token = getAddress((request as { token: Address }).token);
				const slot = computeAllowanceSlot(
					getAddress(request.owner),
					getAddress(authorized),
					AAVE_VARIABLE_DEBT_ALLOWANCE_SLOT_INDEX,
				);
				return {
					stateOverrides: [
						{
							address: token,
							stateDiff: [{ slot, value: toHex(grantedValue, { size: 32 }) }],
						},
					],
				};
			}

			if (
				request.connectorId === METAMORPHO_CONNECTOR_ID &&
				authorizationType === "metamorphoApproval" &&
				"token" in request &&
				typeof authorized === "string" &&
				typeof grantedValue === "bigint"
			) {
				const token = getAddress((request as { token: Address }).token);
				const slotIndex =
					(request as { allowanceSlotIndex?: bigint }).allowanceSlotIndex ??
					METAMORPHO_DEFAULT_ALLOWANCE_SLOT_INDEX;
				const slot = computeAllowanceSlot(
					getAddress(request.owner),
					getAddress(authorized),
					slotIndex,
				);
				return {
					stateOverrides: [
						{
							address: token,
							stateDiff: [{ slot, value: toHex(grantedValue, { size: 32 }) }],
						},
					],
				};
			}

			if (
				request.connectorId === MORPHO_CONNECTOR_ID &&
				authorizationType === "morphoAuthorization" &&
				typeof authorized === "string" &&
				grantedValue === true
			) {
				const morpho = getAddress(request.call.to);
				const slot = computeAllowanceSlot(
					getAddress(request.owner),
					getAddress(authorized),
					MORPHO_AUTHORIZATION_SLOT_INDEX,
				);
				return {
					stateOverrides: [
						{
							address: morpho,
							stateDiff: [{ slot, value: toHex(1n, { size: 32 }) }],
						},
					],
				};
			}

			return undefined;
		}

		const message =
			request.kind === "typedData" ? request.typedData.message : {};

		if (
			request.connectorId === AAVE_CONNECTOR_ID &&
			(request as { authorizationType?: string }).authorizationType ===
				"aTokenPermit" &&
			"token" in request &&
			"owner" in message &&
			"spender" in message
		) {
			const token = getAddress((request as { token: Address }).token);
			const owner = getAddress(message.owner as Address);
			const spender = getAddress(message.spender as Address);
			const slot = computeAllowanceSlot(
				owner,
				spender,
				AAVE_ATOKEN_ALLOWANCE_SLOT_INDEX,
			);

			return {
				authorization: this.getStubAuthorization(request),
				stateOverrides: [
					{
						address: token,
						stateDiff: [{ slot, value: toHex(maxUint256, { size: 32 }) }],
					},
				],
				skippedCall: { target: token, selector: AAVE_PERMIT_SELECTOR },
			};
		}

		if (
			request.connectorId === AAVE_CONNECTOR_ID &&
			(request as { authorizationType?: string }).authorizationType ===
				"variableDebtDelegation" &&
			"token" in request &&
			"delegator" in request &&
			"delegatee" in message
		) {
			const token = getAddress((request as { token: Address }).token);
			const delegator = getAddress(
				(request as { delegator: Address }).delegator,
			);
			const delegatee = getAddress(message.delegatee as Address);
			const slot = computeAllowanceSlot(
				delegator,
				delegatee,
				AAVE_VARIABLE_DEBT_ALLOWANCE_SLOT_INDEX,
			);

			return {
				authorization: this.getStubAuthorization(request),
				stateOverrides: [
					{
						address: token,
						stateDiff: [{ slot, value: toHex(maxUint256, { size: 32 }) }],
					},
				],
				skippedCall: { target: token, selector: AAVE_DELEGATION_SELECTOR },
			};
		}

		if (
			request.connectorId === METAMORPHO_CONNECTOR_ID &&
			(request as { authorizationType?: string }).authorizationType ===
				"metamorphoPermit" &&
			"token" in request &&
			"owner" in message &&
			"spender" in message
		) {
			const token = getAddress((request as { token: Address }).token);
			const owner = getAddress(message.owner as Address);
			const spender = getAddress(message.spender as Address);
			const slotIndex =
				(request as { allowanceSlotIndex?: bigint }).allowanceSlotIndex ??
				METAMORPHO_DEFAULT_ALLOWANCE_SLOT_INDEX;
			const slot = computeAllowanceSlot(owner, spender, slotIndex);

			return {
				authorization: this.getStubAuthorization(request),
				stateOverrides: [
					{
						address: token,
						stateDiff: [{ slot, value: toHex(maxUint256, { size: 32 }) }],
					},
				],
				skippedCall: { target: token, selector: ERC2612_PERMIT_SELECTOR },
			};
		}

		if (
			request.connectorId === MORPHO_CONNECTOR_ID &&
			"verifyingContract" in request.typedData.domain &&
			"authorizer" in message &&
			"authorized" in message
		) {
			const morpho = getAddress(
				request.typedData.domain.verifyingContract as Address,
			);
			const authorizer = getAddress(message.authorizer as Address);
			const authorized = getAddress(message.authorized as Address);
			const slot = computeAllowanceSlot(
				authorizer,
				authorized,
				MORPHO_AUTHORIZATION_SLOT_INDEX,
			);

			return {
				authorization: this.getStubAuthorization(request),
				stateOverrides: [
					{
						address: morpho,
						stateDiff: [{ slot, value: toHex(1n, { size: 32 }) }],
					},
				],
				skippedCall: {
					target: morpho,
					selector: MORPHO_SET_AUTHORIZATION_SELECTOR,
				},
			};
		}

		return undefined;
	}

	private async validateEulerTargets(
		position: MigrationPosition,
		target: EulerMigrationTargetWithQuotes,
	): Promise<void> {
		const hasDebt = position.debt.amount > 0n;
		const targetBorrowVault = target.borrowVault
			? getAddress(target.borrowVault)
			: undefined;
		const targetCollateralVault = getAddress(target.collateralVault);
		if (hasDebt && !targetBorrowVault) {
			throw new Error("Target Euler borrow vault is required");
		}
		if (!hasDebt && target.debtSwapQuote) {
			throw new Error("Debt swap quote requires source debt");
		}

		const { collateralVaultAsset, borrowVaultAsset, borrowLtv } =
			await this.queryEulerTargetVaultData({
				chainId: position.chainId,
				hasDebt,
				borrowVault: targetBorrowVault,
				collateralVault: targetCollateralVault,
			});

		if (target.debtSwapQuote && borrowVaultAsset) {
			assertSameAddress(
				borrowVaultAsset,
				target.debtSwapQuote.tokenIn.address,
				"Target Euler borrow vault asset must match debt swap input asset",
			);
			assertSameAddress(
				target.debtSwapQuote.tokenOut.address,
				position.debt.asset,
				"Debt swap output asset must match source debt asset",
			);
		} else if (hasDebt && borrowVaultAsset) {
			assertSameAddress(
				borrowVaultAsset,
				position.debt.asset,
				"Target Euler borrow vault asset must match source debt asset",
			);
		}

		if (target.collateralSwapQuote) {
			assertSameAddress(
				target.collateralSwapQuote.tokenIn.address,
				position.collateral.asset,
				"Collateral swap input asset must match source collateral asset",
			);
			assertSameAddress(
				collateralVaultAsset,
				target.collateralSwapQuote.tokenOut.address,
				"Target Euler collateral vault asset must match collateral swap output asset",
			);
		} else {
			assertSameAddress(
				collateralVaultAsset,
				position.collateral.asset,
				"Target Euler collateral vault asset must match source collateral asset",
			);
		}
		if (hasDebt && borrowLtv <= 0) {
			throw new Error(
				"Target Euler borrow vault does not accept the selected collateral vault",
			);
		}
	}

	private async validateEulerSource(
		position: MigrationPosition,
		source: NonNullable<BuildMigrationBatchArgs["source"]>,
	): Promise<void> {
		const sourceBorrowVault = getAddress(source.borrowVault);
		const sourceCollateralVault = getAddress(source.collateralVault);

		const { borrowVaultAsset, collateralVaultAsset } =
			await this.queryEulerSourceVaultAssets({
				chainId: position.chainId,
				borrowVault: sourceBorrowVault,
				collateralVault: sourceCollateralVault,
			});

		assertSameAddress(
			borrowVaultAsset,
			position.debt.asset,
			"Source Euler borrow vault asset must match target debt asset",
		);
		assertSameAddress(
			collateralVaultAsset,
			position.collateral.asset,
			"Source Euler collateral vault asset must match target collateral asset",
		);
	}

	queryEulerTargetVaultData = async (args: {
		chainId: number;
		hasDebt: boolean;
		borrowVault?: Address;
		collateralVault: Address;
	}): Promise<EulerTargetVaultData> => {
		const provider = this.providerService.getProvider(args.chainId);
		const collateralVaultAsset = (await provider.readContract({
			address: args.collateralVault,
			abi: eVaultAbi,
			functionName: "asset",
		})) as Address;

		if (!args.hasDebt) {
			return { collateralVaultAsset, borrowLtv: 0 };
		}
		if (!args.borrowVault) {
			throw new Error("Target Euler borrow vault is required");
		}

		const [borrowVaultAsset, borrowLtv] = (await provider.multicall({
			contracts: [
				{
					address: args.borrowVault,
					abi: eVaultAbi,
					functionName: "asset",
				},
				{
					address: args.borrowVault,
					abi: eVaultAbi,
					functionName: "LTVBorrow",
					args: [args.collateralVault],
				},
			],
			allowFailure: false,
		})) as [Address, number];

		return { collateralVaultAsset, borrowVaultAsset, borrowLtv };
	};

	queryEulerSourceVaultAssets = async (args: {
		chainId: number;
		borrowVault: Address;
		collateralVault: Address;
	}): Promise<EulerSourceVaultAssets> => {
		const provider = this.providerService.getProvider(args.chainId);
		const [borrowVaultAsset, collateralVaultAsset] = (await provider.multicall({
			contracts: [
				{
					address: args.borrowVault,
					abi: eVaultAbi,
					functionName: "asset",
				},
				{
					address: args.collateralVault,
					abi: eVaultAbi,
					functionName: "asset",
				},
			],
			allowFailure: false,
		})) as [Address, Address];

		return { borrowVaultAsset, collateralVaultAsset };
	};
}

function isAuthorizationItem(
	item: EVCBatchItem,
	skippedCall: { target: Address; selector: Hex },
): boolean {
	return (
		getAddress(item.targetContract) === getAddress(skippedCall.target) &&
		item.data.toLowerCase().startsWith(skippedCall.selector.toLowerCase())
	);
}
