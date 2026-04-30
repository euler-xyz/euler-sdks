import {
	type Abi,
	type Address,
	decodeFunctionData,
	encodeFunctionData,
	erc20Abi,
	getAddress,
	type Hex,
	maxUint256,
	maxUint160,
	type StateOverride,
} from "viem";
import type {
	Account,
	AccountPosition,
	IHasVaultAddress,
} from "../../entities/Account.js";
import type { EulerPlugin } from "../../plugins/types.js";
import { resolveBorrowCollateralPositions } from "../../utils/accountPositionClassification.js";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { IEulerLabelsService } from "../eulerLabelsService/index.js";
import type { IIntrinsicApyService } from "../intrinsicApyService/index.js";
import type { IPriceService } from "../priceService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type { IRewardsService } from "../rewardsService/index.js";
import type {
	IVaultMetaService,
	VaultEntity,
} from "../vaults/vaultMetaService/index.js";
import type {
	AssetWithSpenders,
	IWalletService,
} from "../walletService/index.js";
import { ethereumVaultConnectorAbi } from "./abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "./abis/eVaultAbi.js";
import { permit2PermitAbi } from "./abis/permit2PermitAbi.js";
import { swapperAbi } from "./abis/swapperAbi.js";
import { swapVerifierAbi } from "./abis/swapVerifierAbi.js";
import * as encodeHelpers from "./encode.js";
import type {
	ApproveCall,
	BatchItemDescription,
	EncodeBorrowArgs,
	EncodeDepositArgs,
	EncodeDepositWithSwapFromWalletArgs,
	EncodeLiquidationArgs,
	EncodeMigrateSameAssetCollateralArgs,
	EncodeMigrateSameAssetDebtArgs,
	EncodeMintArgs,
	EncodeMultiplySameAssetArgs,
	EncodeMultiplyWithSwapArgs,
	EncodePermit2CallArgs,
	EncodePullDebtArgs,
	EncodeRedeemArgs,
	EncodeRepayFromDepositArgs,
	EncodeRepayFromWalletArgs,
	EncodeRepayWithSwapArgs,
	EncodeSwapCollateralArgs,
	EncodeSwapDebtArgs,
	EncodeSwapFromWalletArgs,
	EncodeTransferArgs,
	EncodeWithdrawArgs,
	EVCBatchItem,
	GetPermit2TypedDataArgs,
	Permit2DataToSign,
	PermitSingleTypedData,
	PlanBorrowArgs,
	PlanDepositArgs,
	PlanDepositWithSwapFromWalletArgs,
	PlanLiquidationArgs,
	PlanMigrateSameAssetCollateralArgs,
	PlanMigrateSameAssetDebtArgs,
	PlanMintArgs,
	PlanMultiplySameAssetArgs,
	PlanMultiplyWithSwapArgs,
	PlanPullDebtArgs,
	PlanRedeemArgs,
	PlanRepayFromDepositArgs,
	PlanRepayFromWalletArgs,
	PlanRepayWithSwapArgs,
	PlanSwapCollateralArgs,
	PlanSwapDebtArgs,
	PlanSwapFromWalletArgs,
	PlanTransferArgs,
	PlanWithdrawArgs,
	RequiredApproval,
	ResolveRequiredApprovalsArgs,
	ResolveRequiredApprovalsWithWalletArgs,
	TransactionPlan,
	TransactionPlanItem,
} from "./executionServiceTypes.js";
import {
	type ExecuteTransactionPlanArgs,
	type ExecuteTransactionPlanInternalArgs,
	executeTransactionPlan,
	type TransactionPlanExecutionResult,
} from "./execute.js";
import {
	deriveStateOverrides,
	type EstimateGasForTransactionPlanOptions,
	estimateGasForTransactionPlan,
	type ExecutionSimulationContext,
	type SimulateBatchOptions,
	type SimulateBatchResult,
	simulateTransactionPlan,
	type SimulationStateOverrideOptions,
} from "./simulate.js";

const TOKENS_REQUIRING_ZERO_APPROVAL_RESET: Record<number, readonly Address[]> =
	{
		1: [getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7")],
	};

function requiresZeroApprovalReset(chainId: number, token: Address): boolean {
	return (
		TOKENS_REQUIRING_ZERO_APPROVAL_RESET[chainId]?.some(
			(resetToken) => resetToken === getAddress(token),
		) ?? false
	);
}

export interface IExecutionService<
	TVaultEntity extends VaultEntity = VaultEntity,
> {
	deriveStateOverrides(
		chainId: number,
		account: Address,
		transactionPlan: TransactionPlan,
		options?: SimulationStateOverrideOptions,
	): Promise<StateOverride>;
	simulateTransactionPlan(
		chainId: number,
		account: Address,
		transactionPlan: TransactionPlan,
		options?: SimulateBatchOptions,
	): Promise<SimulateBatchResult<TVaultEntity>>;
	estimateGasForTransactionPlan(
		chainId: number,
		account: Address,
		transactionPlan: TransactionPlan,
		options?: EstimateGasForTransactionPlanOptions,
	): Promise<bigint>;

	resolveRequiredApprovalsWithWallet(
		args: ResolveRequiredApprovalsWithWalletArgs,
	): TransactionPlan;
	resolveRequiredApprovals(
		args: ResolveRequiredApprovalsArgs,
	): Promise<TransactionPlan>;
	executeTransactionPlan(
		args: ExecuteTransactionPlanArgs,
	): Promise<TransactionPlanExecutionResult>;

	encodeBatch(items: EVCBatchItem[]): Hex;
	encodeDeposit(args: EncodeDepositArgs): EVCBatchItem[];
	encodeMint(args: EncodeMintArgs): EVCBatchItem[];
	encodeWithdraw(args: EncodeWithdrawArgs): EVCBatchItem[];
	encodeRedeem(args: EncodeRedeemArgs): EVCBatchItem[];
	encodeBorrow(args: EncodeBorrowArgs): EVCBatchItem[];
	encodeLiquidation(args: EncodeLiquidationArgs): EVCBatchItem[];
	encodePullDebt(args: EncodePullDebtArgs): EVCBatchItem[];
	encodeRepayFromWallet(args: EncodeRepayFromWalletArgs): EVCBatchItem[];
	encodeRepayFromDeposit(args: EncodeRepayFromDepositArgs): EVCBatchItem[];
	encodeRepayWithSwap(args: EncodeRepayWithSwapArgs): EVCBatchItem[];
	encodeDepositWithSwapFromWallet(
		args: EncodeDepositWithSwapFromWalletArgs,
	): EVCBatchItem[];
	encodeSwapFromWallet(args: EncodeSwapFromWalletArgs): EVCBatchItem[];
	encodeSwapCollateral(args: EncodeSwapCollateralArgs): EVCBatchItem[];
	encodeSwapDebt(args: EncodeSwapDebtArgs): EVCBatchItem[];
	encodeMigrateSameAssetCollateral(
		args: EncodeMigrateSameAssetCollateralArgs,
	): EVCBatchItem[];
	encodeMigrateSameAssetDebt(
		args: EncodeMigrateSameAssetDebtArgs,
	): EVCBatchItem[];
	encodeTransfer(args: EncodeTransferArgs): EVCBatchItem[];
	encodeMultiplyWithSwap(args: EncodeMultiplyWithSwapArgs): EVCBatchItem[];
	encodeMultiplySameAsset(args: EncodeMultiplySameAssetArgs): EVCBatchItem[];
	encodePermit2Call(args: EncodePermit2CallArgs): EVCBatchItem;
	/** Transaction plan functions: build plan items (approvals + EVC batch) for each operation. See implementation JSDoc for argument details. */
	planDeposit(args: PlanDepositArgs): TransactionPlan;
	planMint(args: PlanMintArgs): TransactionPlan;
	planWithdraw(args: PlanWithdrawArgs): TransactionPlan;
	planRedeem(args: PlanRedeemArgs): TransactionPlan;
	planBorrow(args: PlanBorrowArgs): TransactionPlan;
	planLiquidation(args: PlanLiquidationArgs): TransactionPlan;
	planRepayFromWallet(args: PlanRepayFromWalletArgs): TransactionPlan;
	planRepayFromDeposit(args: PlanRepayFromDepositArgs): TransactionPlan;
	planRepayWithSwap(args: PlanRepayWithSwapArgs): TransactionPlan;
	planDepositWithSwapFromWallet(
		args: PlanDepositWithSwapFromWalletArgs,
	): TransactionPlan;
	planSwapFromWallet(args: PlanSwapFromWalletArgs): TransactionPlan;
	planSwapCollateral(args: PlanSwapCollateralArgs): TransactionPlan;
	planSwapDebt(args: PlanSwapDebtArgs): TransactionPlan;
	planMigrateSameAssetCollateral(
		args: PlanMigrateSameAssetCollateralArgs,
	): TransactionPlan;
	planMigrateSameAssetDebt(args: PlanMigrateSameAssetDebtArgs): TransactionPlan;
	planTransfer(args: PlanTransferArgs): TransactionPlan;
	planPullDebt(args: PlanPullDebtArgs): TransactionPlan;
	planMultiplyWithSwap(args: PlanMultiplyWithSwapArgs): TransactionPlan;
	planMultiplySameAsset(args: PlanMultiplySameAssetArgs): TransactionPlan;

	getPermit2TypedData(args: GetPermit2TypedDataArgs): PermitSingleTypedData;
	describeBatch(
		batch: EVCBatchItem[],
		extraAbis?: Abi[],
	): BatchItemDescription[];
	/** Merges multiple plans into one: required approvals for the same (token, owner, spender) are summed; executable items are preserved in order and adjacent EVC batches are concatenated. */
	mergePlans(plans: TransactionPlan[]): TransactionPlan;
	/** Converts EVC batch items into a transaction plan (single evcBatch, no required approvals). */
	convertBatchItemsToPlan(items: EVCBatchItem[]): TransactionPlan;
}

const WAD = 10n ** 18n;
// TODO explain how this service is coupled to the concrete abis of ERC4626, permit2 and EVK.
// this is a helper service, not a generic one.
export class ExecutionService<TVaultEntity extends VaultEntity = VaultEntity>
	implements IExecutionService<TVaultEntity>
{
	private plugins: EulerPlugin[] = [];
	private walletService?: IWalletService;
	private providerService?: ProviderService;
	private vaultMetaService?: IVaultMetaService<TVaultEntity>;
	private priceService?: IPriceService;
	private rewardsService?: IRewardsService;
	private intrinsicApyService?: IIntrinsicApyService;
	private eulerLabelsService?: IEulerLabelsService;

	constructor(
		private deploymentService: IDeploymentService,
		walletService?: IWalletService,
		providerService?: ProviderService,
		vaultMetaService?: IVaultMetaService<TVaultEntity>,
		priceService?: IPriceService,
		rewardsService?: IRewardsService,
		intrinsicApyService?: IIntrinsicApyService,
		eulerLabelsService?: IEulerLabelsService,
	) {
		this.walletService = walletService;
		this.providerService = providerService;
		this.vaultMetaService = vaultMetaService;
		this.priceService = priceService;
		this.rewardsService = rewardsService;
		this.intrinsicApyService = intrinsicApyService;
		this.eulerLabelsService = eulerLabelsService;
	}

	setWalletService(walletService: IWalletService): void {
		this.walletService = walletService;
	}

	setProviderService(providerService: ProviderService): void {
		this.providerService = providerService;
	}

	setVaultMetaService(vaultMetaService: IVaultMetaService<TVaultEntity>): void {
		this.vaultMetaService = vaultMetaService;
	}

	setPriceService(priceService: IPriceService): void {
		this.priceService = priceService;
	}

	setRewardsService(rewardsService: IRewardsService): void {
		this.rewardsService = rewardsService;
	}

	setIntrinsicApyService(intrinsicApyService: IIntrinsicApyService): void {
		this.intrinsicApyService = intrinsicApyService;
	}

	setEulerLabelsService(eulerLabelsService: IEulerLabelsService): void {
		this.eulerLabelsService = eulerLabelsService;
	}

	setPlugins(plugins: EulerPlugin[]): void {
		this.plugins = plugins;
	}

	/** Derive storage overrides needed to simulate the plan against the current account state. */
	async deriveStateOverrides(
		chainId: number,
		account: Address,
		transactionPlan: TransactionPlan,
		options?: SimulationStateOverrideOptions,
	): Promise<StateOverride> {
		return deriveStateOverrides(
			this.getSimulationContext(),
			chainId,
			account,
			transactionPlan,
			options,
		);
	}

	/** Simulate the full transaction plan, including approval resolution and plugin-aware batch execution. */
	async simulateTransactionPlan(
		chainId: number,
		account: Address,
		transactionPlan: TransactionPlan,
		options?: SimulateBatchOptions,
	): Promise<SimulateBatchResult<TVaultEntity>> {
		return simulateTransactionPlan(
			this.getSimulationContext(),
			chainId,
			account,
			transactionPlan,
			options,
		);
	}

	/** Estimate gas for the full transaction plan after applying the same simulation pipeline used for execution. */
	async estimateGasForTransactionPlan(
		chainId: number,
		account: Address,
		transactionPlan: TransactionPlan,
		options?: EstimateGasForTransactionPlanOptions,
	): Promise<bigint> {
		return estimateGasForTransactionPlan(
			this.getSimulationContext(),
			chainId,
			account,
			transactionPlan,
			options,
		);
	}

	/** Execute a transaction plan using caller-provided signing and send callbacks. */
	async executeTransactionPlan(
		args: ExecuteTransactionPlanArgs,
	): Promise<TransactionPlanExecutionResult> {
		const { providerService } = this;
		if (!providerService) {
			throw new Error(
				"ExecutionService.executeTransactionPlan requires a providerService. Pass it to the ExecutionService constructor or call setProviderService().",
			);
		}

		const helperArgs: ExecuteTransactionPlanInternalArgs = {
			...args,
			executionService: this,
			deploymentService: this.deploymentService,
			providerService,
		};

		return executeTransactionPlan(helperArgs);
	}

	private getSimulationContext(): ExecutionSimulationContext<TVaultEntity> {
		return {
			deploymentService: this.deploymentService,
			walletService: this.walletService,
			providerService: this.providerService,
			vaultMetaService: this.vaultMetaService,
			priceService: this.priceService,
			rewardsService: this.rewardsService,
			intrinsicApyService: this.intrinsicApyService,
			eulerLabelsService: this.eulerLabelsService,
			describeBatch: (batch) => this.describeBatch(batch),
		};
	}

	private getCoreAddresses(chainId: number) {
		return this.deploymentService.getDeployment(chainId).addresses.coreAddrs;
	}

	/**
	 * Encodes an array of EVC batch items into a single calldata hex for `EVC.batch()`.
	 *
	 * @param items - Array of batch items (targetContract, onBehalfOfAccount, value, data) to execute atomically
	 * @returns Encoded calldata hex for the EVC batch call
	 */
	encodeBatch(items: EVCBatchItem[]): Hex {
		return encodeHelpers.encodeBatch(items);
	}

	/**
	 * Encodes EVC batch items for depositing underlying assets into a vault (mints shares to receiver).
	 *
	 * @param args - Deposit encoding arguments
	 * @param args.chainId - Chain ID (used for EVC/permit2 addresses)
	 * @param args.vault - Address of the vault to deposit into
	 * @param args.amount - Amount of underlying assets to deposit
	 * @param args.receiver - Sub-account address that receives the vault shares
	 * @param args.owner - Address that owns the assets and authorizes the deposit (onBehalfOfAccount)
	 * @param args.enableCollateral - If true, prepends enableCollateral( receiver, vault ) via EVC
	 * @param args.permit2 - Optional Permit2 message + signature; if set, prepends a permit2 permit call so transferFrom can be used
	 * @returns Array of EVC batch items (optional permit2, optional enableCollateral, deposit)
	 */
	encodeDeposit({ chainId, ...args }: EncodeDepositArgs): EVCBatchItem[] {
		const { evc, permit2 } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeDeposit(evc, permit2, { chainId, ...args });
	}

	/**
	 * Encodes EVC batch items for minting vault shares by depositing underlying assets.
	 *
	 * @param args - Mint encoding arguments
	 * @param args.chainId - Chain ID (used for EVC/permit2 addresses)
	 * @param args.vault - Address of the vault to mint from
	 * @param args.shares - Number of vault shares to mint
	 * @param args.receiver - Sub-account address that receives the shares
	 * @param args.owner - Address that owns the assets and authorizes the mint (onBehalfOfAccount)
	 * @param args.enableCollateral - If true, prepends enableCollateral( receiver, vault ) via EVC
	 * @param args.permit2 - Optional Permit2 message + signature for transferFrom
	 * @returns Array of EVC batch items (optional permit2, optional enableCollateral, mint)
	 */
	encodeMint({ chainId, ...args }: EncodeMintArgs): EVCBatchItem[] {
		const { evc, permit2 } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeMint(evc, permit2, { chainId, ...args });
	}

	/**
	 * Encodes EVC batch items for withdrawing underlying assets from a vault (burns shares).
	 *
	 * @param args - Withdraw encoding arguments
	 * @param args.chainId - Chain ID (used for EVC when disabling collateral)
	 * @param args.vault - Address of the vault to withdraw from
	 * @param args.assets - Amount of underlying assets to withdraw
	 * @param args.receiver - Address that receives the withdrawn underlying assets
	 * @param args.owner - Sub-account address whose vault shares are withdrawn (onBehalfOfAccount)
	 * @param args.disableCollateral - If true, appends disableCollateral( owner, vault ) via EVC before withdraw
	 * @returns Array of EVC batch items (optional disableCollateral, withdraw)
	 */
	encodeWithdraw({ chainId, ...args }: EncodeWithdrawArgs): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeWithdraw(evc, { chainId, ...args });
	}

	/**
	 * Encodes EVC batch items for redeeming vault shares for underlying assets.
	 *
	 * @param args - Redeem encoding arguments
	 * @param args.chainId - Chain ID (used for EVC when disabling collateral)
	 * @param args.vault - Address of the vault to redeem from
	 * @param args.shares - Number of vault shares to redeem
	 * @param args.receiver - Address that receives the underlying assets
	 * @param args.owner - Sub-account address whose shares are redeemed (onBehalfOfAccount)
	 * @param args.disableCollateral - If true, prepends disableCollateral( owner, vault ) via EVC
	 * @returns Array of EVC batch items (optional disableCollateral, redeem)
	 */
	encodeRedeem({ chainId, ...args }: EncodeRedeemArgs): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeRedeem(evc, { chainId, ...args });
	}

	/**
	 * Encodes EVC batch items for borrowing from a liability vault, optionally depositing collateral in the same batch.
	 *
	 * @param args - Borrow encoding arguments
	 * @param args.chainId - Chain ID (used for EVC and optional deposit)
	 * @param args.vault - Address of the liability (borrow) vault to borrow from
	 * @param args.amount - Amount of underlying assets to borrow
	 * @param args.owner - Address that owns collateral assets when depositing (onBehalfOfAccount for deposit)
	 * @param args.borrowAccount - Sub-account that takes the debt and receives collateral if any
	 * @param args.receiver - Address that receives the borrowed assets
	 * @param args.enableController - If true, enables this vault as controller for borrowAccount via EVC before borrow (default true)
	 * @param args.currentController - If set and different from vault, disables it before enabling the new controller
	 * @param args.collateralVault - Optional vault to deposit collateral into (same batch)
	 * @param args.collateralAmount - Optional amount of collateral to deposit (requires collateralVault)
	 * @param args.enableCollateral - When depositing collateral, whether to enable it for borrowAccount (default true)
	 * @param args.collateralPermit2 - Optional Permit2 data for the collateral deposit
	 * @returns Array of EVC batch items (optional deposit, optional disableController, optional enableController, borrow)
	 */
	encodeBorrow(args: EncodeBorrowArgs): EVCBatchItem[] {
		const { evc, permit2 } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeBorrow(evc, permit2, args);
	}

	/**
	 * Encodes EVC batch items for liquidating an undercollateralized account (repay debt, seize collateral).
	 *
	 * @param args - Liquidation encoding arguments
	 * @param args.chainId - Chain ID (used for EVC enableController/enableCollateral)
	 * @param args.vault - Address of the liability vault (debt is repaid to this vault)
	 * @param args.violator - Sub-account address of the account being liquidated
	 * @param args.collateral - Address of the collateral vault from which collateral is seized
	 * @param args.repayAssets - Amount of liability asset the liquidator repays
	 * @param args.minYieldBalance - Minimum yield balance the liquidator requires; liquidation can revert if not met
	 * @param args.liquidatorSubAccountAddress - Sub-account that repays and receives seized collateral (onBehalfOfAccount)
	 * @param args.enableController - If true, enables vault as controller for liquidator sub-account before liquidate (default true)
	 * @param args.enableCollateral - If true, enables collateral vault for liquidator sub-account after liquidate (default true)
	 * @returns Array of EVC batch items (optional enableController, liquidate, optional enableCollateral)
	 */
	encodeLiquidation({
		chainId,
		...args
	}: EncodeLiquidationArgs): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeLiquidation(evc, { chainId, ...args });
	}

	/**
	 * Encodes EVC batch items for pulling debt from one sub-account to another on the same liability vault.
	 *
	 * @param args - Pull-debt encoding arguments
	 * @param args.chainId - Chain ID (used for EVC when enabling controller)
	 * @param args.vault - Address of the liability vault
	 * @param args.amount - Amount of debt to pull
	 * @param args.from - Sub-account address from which debt is pulled
	 * @param args.to - Sub-account address that receives the debt (onBehalfOfAccount)
	 * @param args.enableController - If true, enables vault as controller for `to` via EVC before pullDebt (default true)
	 * @returns Array of EVC batch items (optional enableController, pullDebt)
	 */
	encodePullDebt({ chainId, ...args }: EncodePullDebtArgs): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodePullDebt(evc, { chainId, ...args });
	}

	/**
	 * Encodes EVC batch items for a multiply/leverage operation when liability and long asset differ (swap required).
	 * Order: optional permit2 → optional deposit + enable collateral → optional disableController → enableController → borrow → swap → verify/skim → optional enableCollateral on long vault.
	 *
	 * @param args - Multiply-with-swap encoding arguments
	 * @param args.chainId - Chain ID (used for EVC and permit2)
	 * @param args.collateralVault - Vault to deposit initial collateral into (can use 0n amount to skip)
	 * @param args.collateralAmount - Amount of collateral to deposit (0n to skip)
	 * @param args.liabilityVault - Vault to borrow from (liability)
	 * @param args.liabilityAmount - Amount to borrow (sent to swapper)
	 * @param args.longVault - Vault that receives the swapped assets (verify type must be skimMin)
	 * @param args.owner - Address that owns collateral (onBehalfOfAccount for deposit)
	 * @param args.receiver - Sub-account that holds the position (receives collateral, long and debt)
	 * @param args.enableCollateral - When depositing collateral, whether to enable it for receiver (default true)
	 * @param args.enableCollateralLong - Whether to enable long vault as collateral for receiver (default true)
	 * @param args.currentController - If set and different from liabilityVault, disables it first
	 * @param args.enableController - Whether to enable liability vault as controller for receiver (default true)
	 * @param args.collateralPermit2 - Optional Permit2 data for collateral deposit
	 * @param args.swapQuote - Quote with swap and verify (skimMin) steps; borrow is sent to swapQuote.swap.swapperAddress
	 * @returns Array of EVC batch items
	 */
	encodeMultiplyWithSwap(args: EncodeMultiplyWithSwapArgs): EVCBatchItem[] {
		const { evc, permit2 } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeMultiplyWithSwap(evc, permit2, args);
	}

	/**
	 * Encodes EVC batch items for a multiply/leverage operation when liability and long asset are the same (no swap).
	 * Order: optional permit2 → optional deposit + enable collateral → optional disableController → enableController → borrow to longVault → skim → enableCollateral on long vault.
	 *
	 * @param args - Multiply-same-asset encoding arguments
	 * @param args.chainId - Chain ID (used for EVC and permit2)
	 * @param args.collateralVault - Vault to deposit initial collateral into (can use 0n to skip)
	 * @param args.collateralAmount - Amount of collateral to deposit (0n to skip)
	 * @param args.liabilityVault - Vault to borrow from (same asset as longVault)
	 * @param args.liabilityAmount - Amount to borrow (sent to longVault)
	 * @param args.longVault - Vault that receives the borrowed assets (skim + enable collateral)
	 * @param args.owner - Address that owns collateral (onBehalfOfAccount for deposit)
	 * @param args.receiver - Sub-account that holds the position
	 * @param args.enableCollateral - When depositing collateral, whether to enable it (default true)
	 * @param args.enableCollateralLong - Whether to enable long vault as collateral (default true)
	 * @param args.currentController - If set and different from liabilityVault, disables it first
	 * @param args.enableController - Whether to enable liability vault as controller (default true)
	 * @param args.collateralPermit2 - Optional Permit2 data for collateral deposit
	 * @returns Array of EVC batch items
	 */
	encodeMultiplySameAsset(args: EncodeMultiplySameAssetArgs): EVCBatchItem[] {
		const { evc, permit2 } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeMultiplySameAsset(evc, permit2, args);
	}

	/**
	 * Encodes EVC batch items for repaying debt using assets from the sender's wallet (transferFrom to vault then repay).
	 *
	 * @param args - Repay-from-wallet encoding arguments
	 * @param args.chainId - Chain ID (used for permit2 when provided)
	 * @param args.sender - Address that sends the liability asset and authorizes the repay (onBehalfOfAccount)
	 * @param args.liabilityVault - Vault (liability) to repay debt to
	 * @param args.liabilityAmount - Amount to repay (use maxUint256 with isMax for "repay all")
	 * @param args.receiver - Sub-account whose debt is repaid
	 * @param args.disableControllerOnMax - If true and isMax, appends disableController for receiver on liabilityVault (default true)
	 * @param args.isMax - If true, repays max (amount is ignored and maxUint256 is passed to repay)
	 * @param args.permit2 - Optional Permit2 message + signature so transferFrom can be used without prior approve
	 * @returns Array of EVC batch items (optional permit2, repay, optional disableController)
	 */
	encodeRepayFromWallet(args: EncodeRepayFromWalletArgs): EVCBatchItem[] {
		const { permit2 } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeRepayFromWallet(permit2, args);
	}

	/**
	 * Encodes EVC batch items for repaying debt from a deposit (same-asset only).
	 * Path 1: same asset and same vault → repayWithShares.
	 * Path 2: same asset, different vault → withdraw to liability vault, skim, then repayWithShares.
	 *
	 * @param args - Repay-from-deposit encoding arguments
	 * @param args.chainId - Chain ID used for EVC controller calls
	 * @param args.liabilityVault - Vault (liability) to repay debt to
	 * @param args.liabilityAsset - Underlying asset address of the liability vault
	 * @param args.liabilityAmount - Amount of liability to repay (maxUint256 with isMax for full repay)
	 * @param args.from - Sub-account address that holds the source deposit (withdraw/shares source)
	 * @param args.receiver - Sub-account whose debt is repaid
	 * @param args.fromVault - Vault to withdraw/source assets from (must be same asset as liability for this encoder)
	 * @param args.fromAsset - Underlying asset of fromVault (must equal liabilityAsset)
	 * @param args.disableControllerOnMax - When isMax, whether to disable controller for receiver (default true)
	 * @param args.isMax - If true, repays full debt (amount used for withdraw sizing where applicable)
	 * @returns Array of EVC batch items. Throws if fromAsset !== liabilityAsset.
	 */
	encodeRepayFromDeposit(args: EncodeRepayFromDepositArgs): EVCBatchItem[] {
		return encodeHelpers.encodeRepayFromDeposit(args);
	}

	/**
	 * Encodes EVC batch items for repaying debt by swapping collateral (withdraw from vaultIn → swap → verify/repay debtMax).
	 * Swap quote must come from swapService.fetchRepayQuotes() or match the same structure (verify type debtMax).
	 *
	 * @param args - Repay-with-swap encoding arguments
	 * @param args.chainId - Chain ID (used for EVC disableController when applicable)
	 * @param args.swapQuote - Quote with vaultIn, accountIn, accountOut, receiver, swap and verify (debtMax) steps
	 * @param args.maxWithdraw - Optional cap on withdraw amount (e.g. available collateral); if less than quote amountInMax, that value is used
	 * @param args.isMax - If true, disables controller on max repay when disableControllerOnMax is true (default true)
	 * @param args.disableControllerOnMax - When isMax, whether to append disableController for accountOut on receiver (default true)
	 * @returns Array of EVC batch items (withdraw, swap, verify/repay, optional disableController)
	 */
	encodeRepayWithSwap(args: EncodeRepayWithSwapArgs): EVCBatchItem[] {
		return encodeHelpers.encodeRepayWithSwap(args);
	}

	/**
	 * Encodes EVC batch items for depositing into a vault using tokens from the user's wallet, going through a swap.
	 * The approval is given to SwapVerifier, then transferFromSender pulls tokens to Swapper, swap executes, and output is deposited.
	 *
	 * @param args - Deposit-with-swap-from-wallet encoding arguments
	 * @param args.chainId - Chain ID (used for EVC and deployment addresses)
	 * @param args.swapQuote - Quote with swap and verify steps (verify type skimMin or transferMin)
	 * @param args.amount - Amount of input token to transfer from wallet to swapper
	 * @param args.sender - Wallet address providing the tokens (onBehalfOfAccount for transferFromSender)
	 * @param args.enableCollateral - If true, enables receiver vault as collateral for accountOut (default true)
	 * @returns Array of EVC batch items (transferFromSender, swap, verify, optional enableCollateral)
	 */
	encodeDepositWithSwapFromWallet(
		args: EncodeDepositWithSwapFromWalletArgs,
	): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeDepositWithSwapFromWallet(evc, args);
	}

	/**
	 * Encodes EVC batch items for swapping a token from the sender's wallet into another token
	 * and transferring the output to `swapQuote.receiver`.
	 * The approval is given to SwapVerifier, then transferFromSender pulls tokens to Swapper,
	 * swap executes, and verifyAmountMinAndTransfer sends the output to the receiver wallet.
	 *
	 * @param args - Wallet-swap encoding arguments
	 * @param args.chainId - Chain ID (unused, kept for encode API symmetry)
	 * @param args.swapQuote - Quote with swap and verify steps (verify type transferMin)
	 * @param args.amount - Amount of input token to transfer from wallet to swapper
	 * @param args.sender - Wallet address providing the tokens (onBehalfOfAccount for transferFromSender)
	 * @returns Array of EVC batch items (transferFromSender, swap, verify)
	 */
	encodeSwapFromWallet(args: EncodeSwapFromWalletArgs): EVCBatchItem[] {
		return encodeHelpers.encodeSwapFromWallet(args);
	}

	/**
	 * Encodes EVC batch items for swapping collateral: withdraw from vaultIn → swap → verify/skim to receiver; optional enable/disable collateral.
	 * Swap quote should come from swapService.fetchDepositQuote() or match the same structure (verify type skimMin).
	 *
	 * @param args - Swap-collateral encoding arguments
	 * @param args.chainId - Chain ID (used for EVC enableCollateral/disableCollateral)
	 * @param args.swapQuote - Quote with vaultIn, accountIn, accountOut, receiver, swap and verify (skimMin) steps
	 * @param args.enableCollateral - If true, enables receiver vault as collateral for accountOut (default true)
	 * @param args.disableCollateralOnMax - When isMax, whether to disable collateral for accountIn on vaultIn (default true)
	 * @param args.isMax - If true, treats as full swap (can trigger disableCollateralOnMax)
	 * @returns Array of EVC batch items (withdraw, swap, verify/skim, optional disableCollateral, optional enableCollateral)
	 */
	encodeSwapCollateral(args: EncodeSwapCollateralArgs): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeSwapCollateral(evc, args);
	}

	/**
	 * Encodes EVC batch items for swapping debt: enableController → borrow from vaultIn → swap → verify/repay (debtMax).
	 * Swap quote should come from swapService.fetchRepayQuotes() or match the same structure (verify type debtMax).
	 *
	 * @param args - Swap-debt encoding arguments
	 * @param args.chainId - Chain ID (used for EVC enableController/disableController)
	 * @param args.swapQuote - Quote with vaultIn, accountIn, accountOut, receiver, swap and verify (debtMax) steps
	 * @param args.enableController - If true, enables vaultIn as controller for accountOut before borrow (default true)
	 * @param args.disableControllerOnMax - When isMax, whether to disable controller for accountIn on receiver (default true)
	 * @param args.isMax - If true, treats as full debt swap (can trigger disableControllerOnMax)
	 * @returns Array of EVC batch items (optional enableController, borrow, swap, verify/repay, optional disableController)
	 */
	encodeSwapDebt(args: EncodeSwapDebtArgs): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeSwapDebt(evc, args);
	}

	/**
	 * Encodes EVC batch items for migrating a supplied/collateral position between two same-asset vaults.
	 * Partial migration uses withdraw(amount, toVault, account) then skim(amount, account).
	 * Max migration uses redeem(maxShares || maxUint256, toVault, account) then skim(amount, account).
	 *
	 * @param args - Same-asset collateral migration encoding arguments
	 * @param args.chainId - Chain ID (used for EVC enable/disable collateral)
	 * @param args.fromVault - Source vault holding the supplied shares
	 * @param args.toVault - Destination vault with the same underlying asset
	 * @param args.amount - Asset amount expected to arrive at the destination vault and be skimmed
	 * @param args.account - Sub-account that owns the source shares and receives destination shares
	 * @param args.isMax - If true, redeems shares instead of withdrawing assets
	 * @param args.maxShares - Optional exact share amount for max migration; defaults to maxUint256
	 * @param args.enableCollateralTo - If true, enables the destination vault as collateral after skim
	 * @param args.disableCollateralFrom - If true, disables the source vault as collateral after enabling the destination
	 * @returns Array of EVC batch items
	 */
	encodeMigrateSameAssetCollateral(
		args: EncodeMigrateSameAssetCollateralArgs,
	): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeMigrateSameAssetCollateral(evc, args);
	}

	/**
	 * Encodes EVC batch items for migrating a full debt position between two same-asset liability vaults.
	 * Flow: enable new controller → borrow with interest cushion to old vault → skim → repay old debt with shares
	 * → disable old controller → optionally sweep cushion to the new vault → optionally transfer remaining new-vault shares.
	 *
	 * @param args - Same-asset debt migration encoding arguments
	 * @param args.chainId - Chain ID (used for EVC enable controller)
	 * @param args.oldLiabilityVault - Existing debt vault to fully repay and disable
	 * @param args.newLiabilityVault - New same-asset debt vault to borrow from
	 * @param args.amount - Current debt amount before applying the 0.01% interest cushion
	 * @param args.account - Sub-account that owns the debt position
	 * @param args.enableController - If true, enables the new liability vault as controller first
	 * @param args.disableController - If true, disables the old liability vault after repayment
	 * @param args.sweepExcess - If true, redeems any old-vault cushion shares back to the new vault and skims them
	 * @param args.transferRemainingSharesTo - If set, transfers all new-vault shares from the sub-account to this address
	 * @returns Array of EVC batch items
	 */
	encodeMigrateSameAssetDebt(
		args: EncodeMigrateSameAssetDebtArgs,
	): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodeMigrateSameAssetDebt(evc, args);
	}

	/**
	 * Encodes EVC batch items for transferring vault shares between sub-accounts.
	 *
	 * @param args - Transfer encoding arguments
	 * @param args.chainId - Chain ID (used for EVC when enabling/disabling collateral)
	 * @param args.vault - Address of the vault
	 * @param args.from - Sub-account address sending the shares (onBehalfOfAccount)
	 * @param args.to - Sub-account address receiving the shares
	 * @param args.amount - Amount of vault shares to transfer
	 * @param args.enableCollateralTo - If true, appends enableCollateral( to, vault ) via EVC after transfer
	 * @param args.disableCollateralFrom - If true, prepends disableCollateral( from, vault ) via EVC before transfer
	 * @returns Array of EVC batch items (optional disableCollateralFrom, transfer, optional enableCollateralTo)
	 */
	encodeTransfer({ chainId, ...args }: EncodeTransferArgs): EVCBatchItem[] {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeTransfer(evc, { chainId, ...args });
	}

	/**
	 * Encodes a single EVC batch item that calls Permit2's `permit` with the given message and signature.
	 * Used to authorize a token transfer for a subsequent contract call in the same batch.
	 *
	 * @param args - Permit2 call encoding arguments
	 * @param args.chainId - Chain ID (used to resolve Permit2 contract address)
	 * @param args.owner - Token owner that signed the permit (onBehalfOfAccount)
	 * @param args.message - Permit2 PermitSingle message (details + spender + sigDeadline)
	 * @param args.signature - Signature over the permit message
	 * @returns Single EVC batch item (targetContract = Permit2, permit call)
	 */
	encodePermit2Call(args: EncodePermit2CallArgs): EVCBatchItem {
		const { permit2 } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.encodePermit2Call(permit2, args);
	}

	encodeEnableCollateral(
		chainId: number,
		account: Address,
		vault: Address,
	): EVCBatchItem {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeEnableCollateral(evc, account, vault);
	}

	encodeDisableCollateral(
		chainId: number,
		account: Address,
		vault: Address,
	): EVCBatchItem {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeDisableCollateral(evc, account, vault);
	}

	encodeEnableController(
		chainId: number,
		account: Address,
		vault: Address,
	): EVCBatchItem {
		const { evc } = this.getCoreAddresses(chainId);
		return encodeHelpers.encodeEnableController(evc, account, vault);
	}

	encodeDisableController(vault: Address, account: Address): EVCBatchItem {
		return encodeHelpers.encodeDisableController(vault, account);
	}

	/**
	 * Builds EIP-712 typed data for a Permit2 PermitSingle signature (token approval for a spender).
	 * Use with signTypedData (e.g. wagmi) then pass the signed message to encodePermit2Call or plan flows.
	 *
	 * @param args - Permit2 typed data arguments
	 * @param args.chainId - Chain ID (used to resolve Permit2 contract for domain)
	 * @param args.token - Token address to approve
	 * @param args.amount - Amount to approve (capped to maxUint160 in the message if larger)
	 * @param args.spender - Address that will be allowed to transfer the token (e.g. vault or Permit2)
	 * @param args.nonce - Unique nonce for this permit (e.g. from Permit2 nonce(owner, token, spender))
	 * @param args.sigDeadline - Signature deadline (defaults to now + 1 hour if omitted)
	 * @param args.expiration - Permit expiration (defaults to maxUint48 if omitted)
	 * @returns EIP-712 typed data (domain, types, primaryType, message) for signing
	 */
	getPermit2TypedData(args: GetPermit2TypedDataArgs): PermitSingleTypedData {
		const { permit2 } = this.getCoreAddresses(args.chainId);
		return encodeHelpers.getPermit2TypedData(permit2, args);
	}

	/**
	 * Decodes EVC batch items into human-readable function names and named arguments.
	 * Tries known ABIs (EVC, eVault, Permit2, swapper, swapVerifier) to decode each item's data.
	 *
	 * @param batch - Array of EVC batch items (targetContract, onBehalfOfAccount, value, data) to decode
	 * @param extraAbis - Optional extra ABIs to try first when decoding unknown batch items.
	 * @returns Array of decoded items with targetContract, onBehalfOfAccount, functionName, and args (record of param name to value). Throws if any item cannot be decoded.
	 * @example
	 * const batchItems = executionService.encodeDeposit({ ... });
	 * const described = executionService.describeBatch(batchItems);
	 * console.log(described[0].functionName); // "deposit"
	 * console.log(described[0].args); // { amount: 1000n, receiver: "0x..." }
	 */
	describeBatch(
		batch: EVCBatchItem[],
		extraAbis?: Abi[],
	): BatchItemDescription[] {
		const decodedBatchItems: BatchItemDescription[] = [];
		const executionDecodeAbis: Abi[] = [
			...(extraAbis ?? []),
			ethereumVaultConnectorAbi as unknown as Abi,
			eVaultAbi as unknown as Abi,
			permit2PermitAbi as unknown as Abi,
			swapperAbi as unknown as Abi,
			swapVerifierAbi as unknown as Abi,
		];
		for (const item of batch) {
			let decoded = false;
			for (const abi of executionDecodeAbis) {
				try {
					const decodedData = decodeFunctionData({
						abi: abi as unknown as Abi,
						data: item.data,
					});

					// Convert args array to named object
					const functionAbi = abi.find(
						(abiItem) =>
							abiItem.type === "function" &&
							abiItem.name === decodedData.functionName,
					);

					if (!functionAbi || functionAbi.type !== "function") {
						continue;
					}

					// Create named arguments object
					const namedArgs: Record<string, unknown> = {};
					if (
						functionAbi.inputs &&
						Array.isArray(decodedData.args) &&
						decodedData.args.length > 0
					) {
						functionAbi.inputs.forEach((input, index) => {
							if (input.name) {
								namedArgs[input.name] = decodedData.args?.[index];
							}
						});
					}

					decodedBatchItems.push({
						targetContract: item.targetContract,
						onBehalfOfAccount: item.onBehalfOfAccount,
						functionName: decodedData.functionName,
						args: namedArgs,
					});
					decoded = true;
					break;
				} catch {}
			}
			// Fall back to plugins
			if (!decoded) {
				for (const plugin of this.plugins) {
					if (!plugin.decodeBatchItem) continue;
					try {
						const result = plugin.decodeBatchItem(item);
						if (result) {
							decodedBatchItems.push(result);
							decoded = true;
							break;
						}
					} catch {}
				}
			}
			if (!decoded) {
				decodedBatchItems.push({
					targetContract: item.targetContract,
					onBehalfOfAccount: item.onBehalfOfAccount,
					functionName: "Unknown",
					args: {},
				});
			}
		}

		return decodedBatchItems;
	}

	/**
	 * Merges multiple transaction plans into a single plan.
	 * Required approvals for the same (token, owner, spender) are summed.
	 * Executable items are preserved in order; adjacent EVC batch items are concatenated.
	 * Can be used to construct a transaction queue.
	 *
	 * @param plans - Array of transaction plans to merge
	 * @returns Single plan: summed required approvals first, followed by executable items in order
	 */
	mergePlans(plans: TransactionPlan[]): TransactionPlan {
		const approvalByKey = new Map<string, RequiredApproval>();
		const executableItems: TransactionPlanItem[] = [];

		for (const plan of plans) {
			for (const item of plan) {
				if (item.type === "requiredApproval") {
					const key = `${getAddress(item.token)}:${getAddress(item.owner)}:${getAddress(item.spender)}`;
					const existing = approvalByKey.get(key);
					if (existing) {
						existing.amount += item.amount;
						existing.resolved = undefined;
					} else {
						const { resolved: _r, ...rest } = item;
						approvalByKey.set(key, { ...rest, resolved: undefined });
					}
				} else if (item.type === "evcBatch") {
					const previous = executableItems[executableItems.length - 1];
					if (previous?.type === "evcBatch") {
						previous.items.push(...item.items);
					} else {
						executableItems.push({ type: "evcBatch", items: [...item.items] });
					}
				} else {
					executableItems.push(item);
				}
			}
		}

		return [...approvalByKey.values(), ...executableItems];
	}

	/**
	 * Converts EVC batch items into a transaction plan.
	 * Returns a plan with a single evcBatch containing the given items (no required approvals).
	 * Returns an empty plan if items is empty.
	 *
	 * @param items - EVC batch items to wrap in a plan
	 * @returns Transaction plan containing one evcBatch with the items
	 */
	convertBatchItemsToPlan(items: EVCBatchItem[]): TransactionPlan {
		if (items.length === 0) return [];
		return [{ type: "evcBatch", items }];
	}

	private encodeTransferFromMax(
		vault: Address,
		from: Address,
		to: Address,
	): EVCBatchItem {
		return encodeHelpers.encodeTransferFromMax(vault, from, to);
	}

	/**
	 * Appends post-full-repay cleanup calls owned by plan builders:
	 * disable each active collateral used by the repaid borrow, transfer those collateral shares to the owner,
	 * and, when a source deposit funded the repay, transfer any remaining source-vault shares to the owner.
	 */
	private appendMaxRepayCleanup(args: {
		account: Account<IHasVaultAddress>;
		liabilityPosition: AccountPosition<IHasVaultAddress>;
		receiver: Address;
		batchItems: EVCBatchItem[];
		sourceAccount?: Address;
		sourceVault?: Address;
	}) {
		const {
			account,
			liabilityPosition,
			receiver,
			batchItems,
			sourceAccount,
			sourceVault,
		} = args;
		const receiverSubAccount =
			typeof account.getSubAccount === "function"
				? account.getSubAccount(receiver)
				: undefined;
		const activeCollaterals = receiverSubAccount
			? resolveBorrowCollateralPositions(receiverSubAccount, liabilityPosition)
			: [];
		const transferredPositions = new Set<string>();

		for (const collateral of activeCollaterals) {
			batchItems.push(
				this.encodeDisableCollateral(
					account.chainId,
					receiver,
					collateral.vaultAddress,
				),
			);

			if (getAddress(receiver) !== getAddress(account.owner)) {
				batchItems.push(
					this.encodeTransferFromMax(
						collateral.vaultAddress,
						receiver,
						account.owner,
					),
				);
			}

			transferredPositions.add(
				`${getAddress(receiver)}:${getAddress(collateral.vaultAddress)}`,
			);
		}

		if (sourceAccount && sourceVault) {
			const sourcePositionKey = `${getAddress(sourceAccount)}:${getAddress(sourceVault)}`;
			if (
				getAddress(sourceAccount) !== getAddress(account.owner) &&
				!transferredPositions.has(sourcePositionKey)
			) {
				batchItems.push(
					this.encodeTransferFromMax(sourceVault, sourceAccount, account.owner),
				);
			}
		}
	}

	/**
	 * Resolves RequiredApproval items in a transaction plan by filling in each item's `resolved` field.
	 * Uses wallet allowances (and optional Permit2 state) to decide whether to add approve/permit2 steps.
	 * Mutates the plan in place and returns it.
	 *
	 * @param args - Resolve-with-wallet arguments
	 * @param args.plan - Transaction plan containing requiredApproval items (e.g. from planDeposit, planBorrow)
	 * @param args.chainId - Chain ID (used to resolve Permit2 address when usePermit2 is true)
	 * @param args.wallet - Wallet entity with token balances and allowances (assetForVault, assetForPermit2, etc.)
	 * @param args.usePermit2 - If true, prefer Permit2 path (approve Permit2 + sign PermitSingle) when allowance is insufficient (default true)
	 * @param args.unlimitedApproval - If true, approval/permit amounts use maxUint256/maxUint160 (default true)
	 * @returns The same plan array with requiredApproval[].resolved populated (approve and/or permit2 data to sign)
	 */
	resolveRequiredApprovalsWithWallet(
		args: ResolveRequiredApprovalsWithWalletArgs,
	): TransactionPlanItem[] {
		const {
			plan,
			wallet,
			chainId,
			usePermit2 = true,
			unlimitedApproval = true,
		} = args;

		const deployment = this.deploymentService.getDeployment(chainId);
		const permit2 = deployment.addresses.coreAddrs.permit2;

		for (const item of plan) {
			if (item.type === "requiredApproval") {
				const approval = item as RequiredApproval;
				const { token, owner, spender, amount } = approval;

				// Get wallet asset and allowances for the specific spender
				const walletAsset = wallet.getAsset(token);
				const allowances = walletAsset?.allowances[spender];

				const resolvedItems: (ApproveCall | Permit2DataToSign)[] = [];

				const makeApprove = (
					approvalSpender: Address,
					approvalAmount: bigint,
				): ApproveCall => ({
					type: "approve",
					token,
					owner,
					spender: approvalSpender,
					amount: approvalAmount,
					data: encodeFunctionData({
						abi: erc20Abi,
						functionName: "approve",
						args: [approvalSpender, approvalAmount],
					}),
				});
				const addApproveWithOptionalReset = (
					approvalSpender: Address,
					approvalAmount: bigint,
					currentAllowance: bigint,
				) => {
					if (
						currentAllowance > 0n &&
						requiresZeroApprovalReset(chainId, token)
					) {
						resolvedItems.push(makeApprove(approvalSpender, 0n));
					}
					resolvedItems.push(makeApprove(approvalSpender, approvalAmount));
				};

				const makePermit2 = (
					permit2Spender: Address,
					permit2Amount: bigint,
				): Permit2DataToSign => ({
					type: "permit2",
					token,
					owner,
					spender: permit2Spender,
					amount: permit2Amount,
				});

				// If no wallet asset data, assume approval is needed
				if (!walletAsset || !allowances) {
					if (usePermit2) {
						// Need approval to permit2 and permit2 signature
						resolvedItems.push(
							makeApprove(permit2, unlimitedApproval ? maxUint256 : amount),
						);
						resolvedItems.push(
							makePermit2(spender, unlimitedApproval ? maxUint160 : amount),
						);
					} else {
						// Regular approval
						resolvedItems.push(
							makeApprove(spender, unlimitedApproval ? maxUint256 : amount),
						);
					}
					approval.resolved = resolvedItems;
					continue;
				}

				if (usePermit2) {
					// Check permit2 allowances
					const assetForPermit2 = allowances.assetForPermit2;
					const assetForVaultInPermit2 = allowances.assetForVaultInPermit2;
					const permit2ExpirationTime = allowances.permit2ExpirationTime;

					// Check if permit2 signature has expired
					const currentTime = Math.floor(Date.now() / 1000);
					const isPermit2Expired =
						permit2ExpirationTime > 0 && currentTime >= permit2ExpirationTime;

					const hasSufficientPermit2Allowance = assetForPermit2 >= amount;
					const hasSufficientVaultAllowance =
						assetForVaultInPermit2 >= amount && !isPermit2Expired;

					// If both are sufficient, no approval needed
					if (hasSufficientPermit2Allowance && hasSufficientVaultAllowance) {
						approval.resolved = [];
						continue;
					}

					// If assetForPermit2 is insufficient, we need both approval and permit2 signature
					if (!hasSufficientPermit2Allowance) {
						addApproveWithOptionalReset(
							permit2,
							unlimitedApproval ? maxUint256 : amount,
							assetForPermit2,
						);
						resolvedItems.push(
							makePermit2(spender, unlimitedApproval ? maxUint160 : amount),
						);
					} else {
						// assetForPermit2 is sufficient, but vault allowance is insufficient or expired
						// Only need permit2 signature
						resolvedItems.push(
							makePermit2(spender, unlimitedApproval ? maxUint160 : amount),
						);
					}

					approval.resolved = resolvedItems;
				} else {
					// Regular approval (non-permit2 path)
					const assetForVault = allowances.assetForVault;
					const needsDirectApproval = assetForVault < amount;

					if (!needsDirectApproval) {
						approval.resolved = [];
						continue;
					}

					addApproveWithOptionalReset(
						spender,
						unlimitedApproval ? maxUint256 : amount,
						assetForVault,
					);
					approval.resolved = resolvedItems;
				}
			}
		}

		return plan;
	}

	/**
	 * Resolves RequiredApproval items in a transaction plan by fetching wallet data then filling in approvals.
	 * Collects (token, spender) from plan's requiredApproval items, fetches wallet via WalletService, then calls resolveRequiredApprovalsWithWallet.
	 *
	 * @param args - Resolve arguments
	 * @param args.plan - Transaction plan containing requiredApproval items
	 * @param args.chainId - Chain ID (used for deployment and wallet fetch)
	 * @param args.account - Account address (owner) used to fetch wallet and allowances
	 * @param args.usePermit2 - If true, use Permit2 path when needed (default true)
	 * @param args.unlimitedApproval - If true, use max amounts for approvals (default false)
	 * @returns Promise of the plan with requiredApproval[].resolved populated
	 */
	async resolveRequiredApprovals(
		args: ResolveRequiredApprovalsArgs,
	): Promise<TransactionPlanItem[]> {
		const {
			plan,
			chainId,
			account,
			usePermit2 = true,
			unlimitedApproval = false,
		} = args;

		if (!this.walletService) {
			throw new Error(
				"ExecutionService.resolveRequiredApprovals requires a walletService. Pass it to the ExecutionService constructor or call setWalletService().",
			);
		}

		// Filter transaction plan for only RequiredApproval items
		const requiredApprovals = plan.filter(
			(item): item is RequiredApproval => item.type === "requiredApproval",
		);

		// Transform RequiredApprovals into AssetWithSpenders
		const assetSpendersMap = new Map<Address, Set<Address>>();

		for (const approval of requiredApprovals) {
			const asset = getAddress(approval.token);
			const spender = getAddress(approval.spender);

			if (!assetSpendersMap.has(asset)) {
				assetSpendersMap.set(asset, new Set());
			}
			assetSpendersMap.get(asset)!.add(spender);
		}

		// Convert map to AssetWithSpenders array
		const assetsWithSpenders: AssetWithSpenders[] = Array.from(
			assetSpendersMap.entries(),
		).map(([asset, spenders]) => ({
			asset,
			spenders: Array.from(spenders),
		}));

		const walletFetch = await this.walletService.fetchWallet(
			chainId,
			account,
			assetsWithSpenders,
		);
		const wallet = walletFetch.result;

		return this.resolveRequiredApprovalsWithWallet({
			plan,
			wallet,
			chainId,
			usePermit2,
			unlimitedApproval,
		});
	}

	// ========== Transaction plan functions ==========

	/**
	 * Builds a transaction plan for depositing assets into a vault.
	 * Use `maxUint256` for `amount` to deposit all available assets from the wallet.
	 *
	 * @param args - Deposit plan arguments
	 * @param args.vault - Address of the vault to deposit into
	 * @param args.amount - Amount of underlying assets to deposit (use maxUint256 for "deposit all")
	 * @param args.receiver - Sub-account address that will receive the vault shares (and count as collateral if enabled)
	 * @param args.account - Account entity (owner + positions); used for chainId, owner, and collateral state
	 * @param args.asset - Address of the underlying ERC20 asset being deposited (used for approval requirement)
	 * @param args.enableCollateral - If true, enables this vault as collateral for `receiver` when not already enabled
	 * @returns Array of transaction plan items (required approvals + EVC batch)
	 */
	planDeposit(args: PlanDepositArgs): TransactionPlanItem[] {
		const { vault, amount, receiver, account, asset, enableCollateral } = args;
		const plan: TransactionPlanItem[] = [];

		// Default: collateral is not enabled when account/position is not available
		const isCollateralEnabled =
			account?.isCollateralEnabled(receiver, vault) ?? false;

		// Add approval requirement (will be resolved later with Wallet data)
		plan.push({
			type: "requiredApproval",
			token: asset,
			owner: account.owner,
			spender: vault,
			amount,
		});

		// Build EVC batch items
		const batchItems = this.encodeDeposit({
			chainId: account.chainId,
			vault,
			amount,
			receiver,
			owner: account.owner,
			enableCollateral: !isCollateralEnabled && enableCollateral,
			// Permit2 is handled separately in the plan
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for minting vault shares by depositing assets.
	 *
	 * @param args - Mint plan arguments
	 * @param args.vault - Address of the vault to mint shares from
	 * @param args.shares - Number of vault shares to mint
	 * @param args.receiver - Sub-account address that will receive the shares (and count as collateral if enabled)
	 * @param args.account - Account entity (owner + positions); used for chainId, owner, and collateral state
	 * @param args.asset - Address of the underlying ERC20 asset (used for approval requirement)
	 * @param args.enableCollateral - If true, enables this vault as collateral for `receiver` when not already enabled
	 * @param args.sharesToAssetsExchangeRateWad - Optional exchange rate (WAD) to estimate asset amount for approval when minting by shares. Default 1.
	 * @returns Array of transaction plan items (required approvals + EVC batch)
	 */
	planMint(args: PlanMintArgs): TransactionPlan {
		const {
			vault,
			shares,
			receiver,
			account,
			asset,
			enableCollateral,
			sharesToAssetsExchangeRateWad,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// Default: collateral is not enabled when account/position is not available
		const isCollateralEnabled =
			account?.isCollateralEnabled(receiver, vault) ?? false;

		const estimatedAssetAmount = sharesToAssetsExchangeRateWad
			? (shares * sharesToAssetsExchangeRateWad) / WAD
			: shares;

		// Add approval requirement (will be resolved later with Wallet data)
		plan.push({
			type: "requiredApproval",
			token: asset,
			owner: account.owner,
			spender: vault,
			amount: estimatedAssetAmount,
		});

		// Build EVC batch items
		const batchItems = this.encodeMint({
			chainId: account.chainId,
			vault,
			shares,
			receiver,
			owner: account.owner,
			enableCollateral: !isCollateralEnabled && enableCollateral,
			// Permit2 is handled separately in the plan
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for withdrawing assets from a vault.
	 *
	 * @param args - Withdraw plan arguments
	 * @param args.vault - Address of the vault to withdraw from
	 * @param args.assets - Amount of underlying assets to withdraw
	 * @param args.owner - Sub-account address whose vault shares are being withdrawn
	 * @param args.receiver - Address that will receive the withdrawn underlying assets
	 * @param args.account - Account entity; used for chainId and position/collateral state
	 * @param args.disableCollateral - If true, disables this vault as collateral for `owner` when the position is fully withdrawn and was collateral
	 * @returns Array of transaction plan items (EVC batch; no approvals needed for withdraw)
	 */
	planWithdraw(args: PlanWithdrawArgs): TransactionPlan {
		const {
			vault,
			assets,
			receiver,
			owner,
			account,
			disableCollateral = false,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// Get position to check collateral state
		const position = account?.getPosition(owner, vault);

		// Build EVC batch items
		const batchItems = this.encodeWithdraw({
			chainId: account.chainId,
			vault,
			assets,
			receiver,
			owner,
			disableCollateral:
				disableCollateral && (!position || position.isCollateral),
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for redeeming vault shares for underlying assets.
	 * Use `maxUint256` for `shares` to redeem all available shares.
	 *
	 * @param args - Redeem plan arguments
	 * @param args.vault - Address of the vault to redeem shares from
	 * @param args.shares - Number of vault shares to redeem (use maxUint256 for "redeem all")
	 * @param args.owner - Sub-account address whose shares are being redeemed
	 * @param args.receiver - Address that will receive the underlying assets
	 * @param args.account - Account entity; used for chainId and position/collateral state
	 * @param args.disableCollateral - If true, disables this vault as collateral for `owner` when the position is fully redeemed and was collateral
	 * @returns Array of transaction plan items (EVC batch; no approvals needed for redeem)
	 */
	planRedeem(args: PlanRedeemArgs): TransactionPlan {
		const {
			vault,
			shares,
			receiver,
			owner,
			account,
			disableCollateral = false,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// Get position to check collateral state
		const position = account?.getPosition(owner, vault);

		// Build EVC batch items
		const batchItems = this.encodeRedeem({
			chainId: account.chainId,
			vault,
			shares,
			receiver,
			owner,
			disableCollateral:
				disableCollateral && (!position || position.isCollateral),
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for borrowing from a liability vault.
	 * Use `maxUint256` for `collateral.amount` to deposit all available collateral asset from the wallet.
	 *
	 * @param args - Borrow plan arguments
	 * @param args.vault - Address of the liability (borrow) vault to borrow from
	 * @param args.amount - Amount of underlying assets to borrow
	 * @param args.borrowAccount - Sub-account address that will take the debt (and hold collateral if any)
	 * @param args.receiver - Address that will receive the borrowed assets
	 * @param args.account - Account entity; used for chainId, owner, controller/collateral state
	 * @param args.collateral - Optional: deposit collateral in the same batch; use maxUint256 for amount to deposit all available
	 * @param args.collateral.vault - Collateral vault to deposit into
	 * @param args.collateral.amount - Amount of collateral asset to deposit
	 * @param args.collateral.asset - Underlying asset address of the collateral (for approval)
	 * @returns Array of transaction plan items (optional approval + EVC batch)
	 */
	planBorrow(args: PlanBorrowArgs): TransactionPlan {
		const { vault, amount, receiver, borrowAccount, account, collateral } =
			args;
		const plan: TransactionPlanItem[] = [];

		const enableCollateral =
			collateral && collateral.amount > 0n
				? !(
						account?.isCollateralEnabled(borrowAccount, collateral.vault) ??
						false
					)
				: false;

		// Check if controller needs to be enabled
		// Default: controller is not enabled when account/sub-account is not available
		const currentController = account?.getCurrentController(borrowAccount);
		const enableController = !(
			account?.isControllerEnabled(borrowAccount, vault) ?? false
		);

		if (collateral && collateral.amount > 0n) {
			// Approval is needed from the account owner (who owns the wallet tokens)
			// Add approval requirement (will be resolved later with Wallet data)
			plan.push({
				type: "requiredApproval",
				token: collateral.asset,
				owner: account.owner,
				spender: collateral.vault,
				amount: collateral.amount,
			});
		}

		const batchItems = this.encodeBorrow({
			chainId: account.chainId,
			vault,
			amount,
			owner: account.owner,
			borrowAccount,
			receiver,
			enableController,
			currentController: currentController || undefined,
			enableCollateral,
			collateralVault: collateral?.vault,
			collateralAmount: collateral?.amount,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for liquidating an undercollateralized account.
	 *
	 * @param args - Liquidation plan arguments
	 * @param args.account - Liquidator's account entity; used for chainId, owner, and controller/collateral state on liquidator sub-account
	 * @param args.liquidatorSubAccountAddress - Sub-account address that will repay debt and receive seized collateral
	 * @param args.vault - Address of the liability vault (debt is repaid to this vault)
	 * @param args.asset - Address of the liability vault's underlying asset (used for approval of repay amount)
	 * @param args.violator - Sub-account address of the undercollateralized account being liquidated
	 * @param args.collateral - Address of the collateral vault from which collateral is seized
	 * @param args.repayAssets - Amount of liability asset the liquidator will repay (and receive collateral up to the liquidation incentive)
	 * @param args.minYieldBalance - Minimum yield balance the liquidator requires; liquidation may revert if not met
	 * @returns Array of transaction plan items (approval for repay asset + EVC batch)
	 */
	planLiquidation(args: PlanLiquidationArgs): TransactionPlan {
		const {
			account,
			liquidatorSubAccountAddress,
			vault,
			asset,
			violator,
			collateral,
			repayAssets,
			minYieldBalance,
		} = args;

		const plan: TransactionPlanItem[] = [];

		// Add approval requirement for the liability asset the liquidator will repay
		plan.push({
			type: "requiredApproval",
			token: asset,
			owner: account.owner,
			spender: vault,
			amount: repayAssets,
		});

		// Check if controller needs to be enabled for the liquidator account on the liability vault
		const enableController = !(
			account?.isControllerEnabled(liquidatorSubAccountAddress, vault) ?? false
		);

		// Check if collateral needs to be enabled for the seized collateral vault on the liquidator account
		const enableCollateral = !(
			account?.isCollateralEnabled(liquidatorSubAccountAddress, collateral) ??
			false
		);

		const batchItems = this.encodeLiquidation({
			chainId: account.chainId,
			vault,
			violator,
			collateral,
			repayAssets,
			minYieldBalance,
			liquidatorSubAccountAddress,
			enableController,
			enableCollateral,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for repaying debt using assets from the wallet.
	 * Use `maxUint256` for `liabilityAmount` to repay all available debt.
	 *
	 * @param args - Repay-from-wallet plan arguments
	 * @param args.liabilityVault - Address of the liability vault (debt is repaid to this vault)
	 * @param args.liabilityAmount - Amount of liability asset to repay (use maxUint256 for "repay all")
	 * @param args.receiver - Sub-account address whose debt is being repaid
	 * @param args.account - Account entity; used for chainId, owner, and position (to resolve liability asset)
	 * @param args.cleanupOnMax - When true and liabilityAmount is maxUint256, the batch disables active collaterals on the repaid sub-account and transfers their shares to the owner account (default false)
	 * @returns Array of transaction plan items (approval + EVC batch)
	 */
	planRepayFromWallet(args: PlanRepayFromWalletArgs): TransactionPlan {
		const {
			liabilityVault,
			liabilityAmount,
			receiver,
			account,
			cleanupOnMax = false,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// Get position to determine asset
		const position = account?.getPosition(receiver, liabilityVault);
		if (!position) {
			throw new Error(
				`Position not found. Liability vault: ${liabilityVault}, Account: ${receiver}`,
			);
		}

		// Add approval requirement (will be resolved later with Wallet data)
		plan.push({
			type: "requiredApproval",
			token: position.asset,
			owner: account.owner,
			spender: liabilityVault,
			amount: liabilityAmount,
		});

		const isMax = liabilityAmount === maxUint256;

		// Build EVC batch items
		const batchItems = this.encodeRepayFromWallet({
			chainId: account.chainId,
			sender: account.owner,
			liabilityVault,
			liabilityAmount,
			receiver,
			disableControllerOnMax: true,
			isMax,
			// Permit2 is handled separately in the plan
		});

		if (cleanupOnMax && isMax) {
			this.appendMaxRepayCleanup({
				account,
				liabilityPosition: position,
				receiver,
				batchItems,
			});
		}

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for repaying debt using assets from another vault deposit (same asset only).
	 * Use `maxUint256` for `liabilityAmount` to perform a full repay.
	 * Full repay can opt into cleanup. For different-vault full repays, cleanup only redeems
	 * liability-vault shares left from the repay cushion when the account snapshot shows no pre-existing liability-vault deposit;
	 * otherwise those shares are preserved in the liability vault instead of being migrated to the source vault.
	 * Cleanup also disables active collaterals on the repaid sub-account, transfers those collateral shares to the owner
	 * account, and transfers any remaining source-vault shares from the source sub-account to the owner account.
	 *
	 * @param args - Repay-from-deposit plan arguments
	 * @param args.liabilityVault - Address of the liability vault (debt is repaid to this vault)
	 * @param args.liabilityAmount - Amount of liability to repay (use maxUint256 for max repay)
	 * @param args.receiver - Sub-account address whose debt is being repaid (and from whose deposit we may withdraw when fromAccount === receiver)
	 * @param args.fromVault - Vault to withdraw assets from (must be same underlying asset as liability for this plan)
	 * @param args.fromAccount - Sub-account that holds the deposit in `fromVault`
	 * @param args.account - Account entity; used for chainId, owner, and positions (to resolve assets and eligibility)
	 * @param args.cleanupOnMax - Whether max repay should append repay-cushion, collateral, and source-share cleanup (default false)
	 * @returns Array of transaction plan items (EVC batch only). Throws if asset differs between fromVault and liabilityVault; use planRepayWithSwap for cross-asset.
	 */
	planRepayFromDeposit(args: PlanRepayFromDepositArgs): TransactionPlan {
		const {
			liabilityVault,
			liabilityAmount,
			receiver,
			fromVault,
			fromAccount,
			account,
			cleanupOnMax = false,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// Get positions
		const liabilityPosition = account?.getPosition(receiver, liabilityVault);
		const fromPosition = account?.getPosition(fromAccount, fromVault);

		// If positions are not available, we can't determine asset addresses
		// We'll need to throw an error or require asset addresses to be provided
		if (!liabilityPosition || !fromPosition) {
			throw new Error(
				`Positions not found. Liability vault: ${liabilityVault}, From vault: ${fromVault}, Account: ${receiver}. Asset addresses are required when positions are not available.`,
			);
		}

		const liabilityAsset = liabilityPosition.asset;
		const fromAsset = fromPosition.asset;

		// Cross-asset repay requires a swap path; this planner only builds same-asset batches.
		if (fromAsset !== liabilityAsset) {
			// This path requires a swap, which is handled by planRepayWithSwap
			throw new Error(
				"planRepayFromDeposit only supports same-asset paths. Use planRepayWithSwap for different assets.",
			);
		}

		const isMax = liabilityAmount === maxUint256;
		const amount =
			isMax && fromVault !== liabilityVault
				? liabilityPosition.borrowed
				: liabilityAmount;
		const hasPreExistingLiabilityDeposit =
			(liabilityPosition.assets ?? 0n) > 0n;

		// Build EVC batch items
		const batchItems = this.encodeRepayFromDeposit({
			chainId: account.chainId,
			liabilityVault,
			liabilityAsset,
			liabilityAmount: amount,
			from: fromAccount,
			receiver,
			fromVault,
			fromAsset,
			disableControllerOnMax: true,
			isMax,
			// Permit2 is handled separately in the plan
		});

		if (cleanupOnMax && isMax) {
			if (fromVault !== liabilityVault && !hasPreExistingLiabilityDeposit) {
				// Sweep only the repay cushion. If liability shares existed before this batch,
				// redeem(max) would also migrate that unrelated deposit into the source vault.
				batchItems.push({
					targetContract: liabilityVault,
					onBehalfOfAccount: receiver,
					value: 0n,
					data: encodeFunctionData({
						abi: eVaultAbi,
						functionName: "redeem",
						args: [maxUint256, fromVault, receiver],
					}),
				});

				batchItems.push({
					targetContract: fromVault,
					onBehalfOfAccount: fromAccount,
					value: 0n,
					data: encodeFunctionData({
						abi: eVaultAbi,
						functionName: "skim",
						args: [maxUint256, fromAccount],
					}),
				});
			}

			this.appendMaxRepayCleanup({
				account,
				liabilityPosition,
				receiver,
				batchItems,
				sourceAccount: fromAccount,
				sourceVault: fromVault,
			});
		}

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for repaying debt by swapping collateral (e.g. withdraw collateral → swap → repay).
	 * Use when the repayment asset differs from the collateral asset.
	 *
	 * @param args - Repay-with-swap plan arguments
	 * @param args.swapQuote - Quote from swap service (e.g. fetchRepayQuotes); defines vaultIn, accountIn, accountOut, receiver, swap and verify steps
	 * @param args.account - Account entity; used for chainId and positions (to compute isMax and maxWithdraw)
	 * @param args.cleanupOnMax - When true and the quote repays the full debt, the batch disables active collaterals on the repaid sub-account, transfers their shares to the owner account, and transfers remaining source-vault shares to the owner account (default false)
	 * @returns Array of transaction plan items (EVC batch: withdraw, swap, verify/repay). Throws if positions not found or liability is zero.
	 */
	planRepayWithSwap(args: PlanRepayWithSwapArgs): TransactionPlan {
		const { swapQuote, account, cleanupOnMax = false } = args;
		const plan: TransactionPlanItem[] = [];

		const liabilityPosition = account?.getPosition(
			swapQuote.accountOut,
			swapQuote.receiver,
		);
		const fromPosition = account?.getPosition(
			swapQuote.accountIn,
			swapQuote.vaultIn,
		);
		if (
			!liabilityPosition ||
			!fromPosition ||
			liabilityPosition.borrowed <= 0n
		) {
			throw new Error(
				`Positions not found or liability is 0. Liability vault: ${swapQuote.receiver}, From vault: ${swapQuote.vaultIn}, Account: ${swapQuote.accountOut}`,
			);
		}

		const isMax = liabilityPosition.borrowed <= BigInt(swapQuote.amountOutMin);
		const maxWithdraw = fromPosition.assets;
		// Build EVC batch items
		const batchItems = this.encodeRepayWithSwap({
			chainId: account.chainId,
			swapQuote,
			maxWithdraw,
			isMax,
			disableControllerOnMax: true,
		});

		if (cleanupOnMax && isMax) {
			this.appendMaxRepayCleanup({
				account,
				liabilityPosition,
				receiver: swapQuote.accountOut,
				batchItems,
				sourceAccount: swapQuote.accountIn,
				sourceVault: swapQuote.vaultIn,
			});
		}

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for depositing into a vault using tokens from the user's wallet, going through a swap.
	 * The approval is given to SwapVerifier (not the vault), then transferFromSender is used in the batch
	 * to provide the tokens to the Swapper from the user's wallet.
	 *
	 * @param args - Deposit-with-swap-from-wallet plan arguments
	 * @param args.swapQuote - Quote from swap service; defines swap and verify steps
	 * @param args.amount - Amount of input token to transfer from wallet
	 * @param args.tokenIn - Input token address (for approval to SwapVerifier)
	 * @param args.account - Account entity; used for chainId, owner, and collateral state
	 * @param args.enableCollateral - If true, enables receiver vault as collateral for accountOut
	 * @returns Array of transaction plan items (approval to SwapVerifier + EVC batch)
	 */
	planDepositWithSwapFromWallet(
		args: PlanDepositWithSwapFromWalletArgs,
	): TransactionPlan {
		const { swapQuote, amount, tokenIn, account, enableCollateral } = args;
		const plan: TransactionPlanItem[] = [];

		// Approval goes to the transferFromSender contract (which uses permit2 transferFrom internally)
		plan.push({
			type: "requiredApproval",
			token: tokenIn,
			owner: account.owner,
			spender: swapQuote.verify.verifierAddress,
			amount,
		});

		// Check if collateral needs to be enabled
		const receiverVault = swapQuote.receiver;
		const accountOut = swapQuote.accountOut || account.owner;
		const isCollateralEnabled =
			account?.isCollateralEnabled(accountOut, receiverVault) ?? false;
		const shouldEnableCollateral =
			enableCollateral !== undefined
				? enableCollateral && !isCollateralEnabled
				: !isCollateralEnabled;

		// Build EVC batch items
		const batchItems = this.encodeDepositWithSwapFromWallet({
			chainId: account.chainId,
			swapQuote,
			amount,
			sender: account.owner,
			enableCollateral: shouldEnableCollateral,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for swapping a token from the sender's wallet into another
	 * token and transferring the output to the quote receiver.
	 *
	 * @param args - Wallet-swap plan arguments
	 * @param args.swapQuote - Quote from swap service; must use transferOutputToReceiver / transferMin verification
	 * @param args.amount - Amount of input token to transfer from wallet
	 * @param args.tokenIn - Input token address (for approval to SwapVerifier)
	 * @param args.account - Account entity; used for chainId and owner
	 * @returns Array of transaction plan items (approval to SwapVerifier + EVC batch)
	 */
	planSwapFromWallet(args: PlanSwapFromWalletArgs): TransactionPlan {
		const { swapQuote, amount, tokenIn, account } = args;
		const plan: TransactionPlanItem[] = [];

		plan.push({
			type: "requiredApproval",
			token: tokenIn,
			owner: account.owner,
			spender: swapQuote.verify.verifierAddress,
			amount,
		});

		const batchItems = this.encodeSwapFromWallet({
			chainId: account.chainId,
			swapQuote,
			amount,
			sender: account.owner,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for swapping collateral from one vault to another (withdraw → swap → deposit/skim).
	 *
	 * @param args - Swap-collateral plan arguments
	 * @param args.swapQuote - Quote from swap service (e.g. fetchDepositQuote); defines vaultIn, accountIn, accountOut, receiver, swap and verify (skimMin) steps
	 * @param args.account - Account entity; used for chainId and positions (to determine isMax and whether to enable collateral on destination)
	 * @returns Array of transaction plan items (EVC batch: withdraw, swap, verify/skim, optional enable/disable collateral)
	 */
	planSwapCollateral(args: PlanSwapCollateralArgs): TransactionPlan {
		const { swapQuote, account } = args;
		const plan: TransactionPlanItem[] = [];

		// Check if source collateral needs to be disabled (when all is swapped)
		// Default: when position is not available, assume amounts are zero, so we don't disable collateral
		const sourcePosition = account?.getPosition(
			swapQuote.accountIn,
			swapQuote.vaultIn,
		);

		const isMax = sourcePosition
			? sourcePosition.assets <= BigInt(swapQuote.amountIn)
			: false;

		// Check if destination collateral needs to be enabled
		// Default: collateral is not enabled when account/sub-account is not available
		const enableCollateral = !(
			account?.isCollateralEnabled(swapQuote.accountOut, swapQuote.receiver) ??
			false
		);

		// Build EVC batch items
		const batchItems = this.encodeSwapCollateral({
			chainId: account.chainId,
			swapQuote,
			enableCollateral,
			disableCollateralOnMax: true,
			isMax,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for swapping debt from one liability vault to another (borrow from source → swap → repay to destination).
	 *
	 * @param args - Swap-debt plan arguments
	 * @param args.swapQuote - Quote from swap service (e.g. fetchRepayQuotes for the new debt); defines vaultIn, accountIn, accountOut, swap and verify (debtMax) steps
	 * @param args.account - Account entity; used for chainId and controller state (enableController, isMax, disableControllerOnMax)
	 * @returns Array of transaction plan items (EVC batch: enableController, borrow, swap, verify/repay, optional disableController)
	 */
	planSwapDebt(args: PlanSwapDebtArgs): TransactionPlan {
		const { swapQuote, account } = args;
		const plan: TransactionPlanItem[] = [];

		const sourcePosition = account?.getPosition(
			swapQuote.accountIn,
			swapQuote.vaultIn,
		);

		const isMax = sourcePosition
			? sourcePosition.borrowed <= BigInt(swapQuote.amountOutMin)
			: false;

		const enableController = !(
			account?.isControllerEnabled(swapQuote.accountOut, swapQuote.vaultIn) ??
			false
		);

		// Build EVC batch items
		const batchItems = this.encodeSwapDebt({
			chainId: account.chainId,
			swapQuote,
			enableController,
			disableControllerOnMax: true,
			isMax,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for migrating a supplied/collateral position between two same-asset vaults.
	 * This is the no-swap path for moving shares from one vault to another vault with the same underlying asset.
	 *
	 * @param args - Same-asset collateral migration plan arguments
	 * @param args.fromVault - Source vault holding the supplied shares
	 * @param args.toVault - Destination vault with the same underlying asset
	 * @param args.amount - Asset amount to withdraw/redeem and skim into the destination vault
	 * @param args.positionAccount - Sub-account that owns the source shares and receives destination shares
	 * @param args.fromAsset - Optional source underlying asset; defaults to the account position asset
	 * @param args.toAsset - Destination underlying asset, used to verify this is a same-asset migration
	 * @param args.isMax - If true, redeems shares instead of withdrawing assets
	 * @param args.maxShares - Optional exact share amount for max migration
	 * @param args.enableCollateralTo - Optional override for enabling destination collateral
	 * @param args.disableCollateralFrom - Optional override for disabling source collateral
	 * @returns Array of transaction plan items (EVC batch; no token approvals)
	 */
	planMigrateSameAssetCollateral(
		args: PlanMigrateSameAssetCollateralArgs,
	): TransactionPlan {
		const {
			account,
			fromVault,
			toVault,
			amount,
			positionAccount,
			fromAsset,
			toAsset,
			isMax = false,
			maxShares,
			enableCollateralTo,
			disableCollateralFrom,
		} = args;
		const plan: TransactionPlanItem[] = [];

		const sourcePosition = account?.getPosition(positionAccount, fromVault);
		const resolvedFromAsset = fromAsset ?? sourcePosition?.asset;

		if (!resolvedFromAsset) {
			throw new Error(
				`Position not found. From vault: ${fromVault}, Account: ${positionAccount}. Source asset is required when position is not available.`,
			);
		}

		if (getAddress(resolvedFromAsset) !== getAddress(toAsset)) {
			throw new Error(
				"planMigrateSameAssetCollateral only supports same-asset vault migrations. Use planSwapCollateral for cross-asset migrations.",
			);
		}

		const shouldEnableCollateralTo =
			enableCollateralTo ??
			!account.isCollateralEnabled(positionAccount, toVault);
		const shouldDisableCollateralFrom =
			disableCollateralFrom ??
			(isMax && account.isCollateralEnabled(positionAccount, fromVault));

		const batchItems = this.encodeMigrateSameAssetCollateral({
			chainId: account.chainId,
			fromVault,
			toVault,
			amount,
			account: positionAccount,
			isMax,
			maxShares: maxShares ?? (isMax ? sourcePosition?.shares : undefined),
			enableCollateralTo: shouldEnableCollateralTo,
			disableCollateralFrom: shouldDisableCollateralFrom,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for migrating a full same-asset debt position from one liability vault to another.
	 * This is the no-swap path for debt vault migration and repays the old vault with shares after borrowing
	 * slightly more from the new vault to cover interest accrual.
	 *
	 * @param args - Same-asset debt migration plan arguments
	 * @param args.oldLiabilityVault - Existing debt vault to fully repay and disable
	 * @param args.newLiabilityVault - New same-asset debt vault to borrow from
	 * @param args.liabilityAccount - Sub-account that owns the debt position
	 * @param args.liabilityAmount - Current debt amount; defaults to the old-vault borrowed amount in account data
	 * @param args.oldLiabilityAsset - Optional old liability asset; defaults to the old-vault account position asset
	 * @param args.newLiabilityAsset - New liability underlying asset, used to verify this is a same-asset migration
	 * @param args.sweepExcess - Whether to redeem and skim the migration cushion back into the new vault (default true)
	 * @param args.transferRemainingSharesToOwner - Whether to transfer new-vault shares to the owner when liabilityAccount differs from owner (default true)
	 * @returns Array of transaction plan items (EVC batch; no token approvals)
	 */
	planMigrateSameAssetDebt(
		args: PlanMigrateSameAssetDebtArgs,
	): TransactionPlan {
		const {
			account,
			oldLiabilityVault,
			newLiabilityVault,
			liabilityAccount,
			liabilityAmount,
			oldLiabilityAsset,
			newLiabilityAsset,
			sweepExcess = true,
			transferRemainingSharesToOwner = true,
		} = args;
		const plan: TransactionPlanItem[] = [];

		const oldPosition = account?.getPosition(
			liabilityAccount,
			oldLiabilityVault,
		);
		const resolvedOldAsset = oldLiabilityAsset ?? oldPosition?.asset;

		if (!resolvedOldAsset) {
			throw new Error(
				`Position not found. Old liability vault: ${oldLiabilityVault}, Account: ${liabilityAccount}. Old liability asset is required when position is not available.`,
			);
		}

		if (getAddress(resolvedOldAsset) !== getAddress(newLiabilityAsset)) {
			throw new Error(
				"planMigrateSameAssetDebt only supports same-asset debt migrations. Use planSwapDebt for cross-asset migrations.",
			);
		}

		const amount = liabilityAmount ?? oldPosition?.borrowed;
		if (!amount || amount <= 0n) {
			throw new Error(
				`Debt position not found or liability is 0. Old liability vault: ${oldLiabilityVault}, Account: ${liabilityAccount}`,
			);
		}

		const enableController = !account.isControllerEnabled(
			liabilityAccount,
			newLiabilityVault,
		);
		const transferRemainingSharesTo =
			transferRemainingSharesToOwner &&
			getAddress(liabilityAccount) !== getAddress(account.owner)
				? account.owner
				: undefined;

		const batchItems = this.encodeMigrateSameAssetDebt({
			chainId: account.chainId,
			oldLiabilityVault,
			newLiabilityVault,
			amount,
			account: liabilityAccount,
			enableController,
			disableController: true,
			sweepExcess,
			transferRemainingSharesTo,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for transferring vault shares between sub-accounts.
	 *
	 * @param args - Transfer plan arguments
	 * @param args.vault - Address of the vault
	 * @param args.from - Sub-account address sending the shares
	 * @param args.to - Sub-account address receiving the shares
	 * @param args.amount - Amount of vault shares to transfer
	 * @param args.account - Account entity; used for chainId and collateral state for from/to
	 * @param args.enableCollateralTo - If true, enables the vault as collateral for `to` when not already enabled
	 * @param args.disableCollateralFrom - If true, disables the vault as collateral for `from` when it was enabled
	 * @returns Array of transaction plan items (EVC batch; no approvals needed)
	 */
	planTransfer(args: PlanTransferArgs): TransactionPlan {
		const {
			vault,
			to,
			amount,
			from,
			account,
			enableCollateralTo,
			disableCollateralFrom,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// Build EVC batch items
		const batchItems = this.encodeTransfer({
			chainId: account.chainId,
			vault,
			to,
			amount,
			from,
			enableCollateralTo:
				enableCollateralTo &&
				!(account?.isCollateralEnabled(to, vault) ?? false),
			disableCollateralFrom:
				disableCollateralFrom &&
				(account?.isCollateralEnabled(from, vault) ?? false),
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for pulling debt from one sub-account to another (same liability vault).
	 *
	 * @param args - Pull-debt plan arguments
	 * @param args.vault - Address of the liability vault
	 * @param args.amount - Amount of debt to pull
	 * @param args.from - Sub-account address from which debt is pulled
	 * @param args.to - Sub-account address that will receive the debt (and receive the borrowed assets if any)
	 * @param args.account - Account entity; used for chainId and controller state (enableController for `to` if needed)
	 * @returns Array of transaction plan items (EVC batch: optional enableController + pullDebt)
	 */
	planPullDebt(args: PlanPullDebtArgs): TransactionPlan {
		const { vault, amount, from, to, account } = args;
		const plan: TransactionPlanItem[] = [];

		const enableController = !(
			account?.isControllerEnabled(to, vault) ?? false
		);

		// Build EVC batch items
		const batchItems = this.encodePullDebt({
			chainId: account.chainId,
			vault,
			amount,
			from,
			to,
			enableController,
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for a multiply/leverage position when liability and long asset differ (requires a swap).
	 * Flow: optional collateral deposit → enable controller → borrow → swap → enable collateral on long vault.
	 *
	 * @param args - Multiply-with-swap plan arguments
	 * @param args.collateralVault - Vault to deposit initial collateral into (optional; omit amount or use 0 to skip)
	 * @param args.collateralAmount - Amount of collateral asset to deposit (0n to skip deposit)
	 * @param args.collateralAsset - Underlying asset address of collateral (for approval when collateralAmount > 0)
	 * @param args.swapQuote - Quote describing borrow vault (vaultIn), long vault (receiver), amounts, swap and verify (skimMin) steps; accountIn must equal accountOut
	 * @param args.account - Account entity; used for chainId, owner, and collateral/controller state
	 * @returns Array of transaction plan items (optional approval + EVC batch). Throws if swapQuote.accountIn !== swapQuote.accountOut.
	 */
	planMultiplyWithSwap(args: PlanMultiplyWithSwapArgs): TransactionPlan {
		const {
			collateralVault,
			collateralAmount,
			collateralAsset,
			account,
			swapQuote,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// 1. Check if collateral approval is needed (only if depositing collateral)
		if (collateralAmount > 0n) {
			// Add approval requirement (will be resolved later with Wallet data)
			plan.push({
				type: "requiredApproval",
				token: collateralAsset,
				owner: account.owner,
				spender: collateralVault,
				amount: collateralAmount,
			});
		}
		if (swapQuote.accountIn !== swapQuote.accountOut) {
			throw new Error("Account in and account out must be the same");
		}
		const receiver = swapQuote.accountIn;
		const liabilityVault = swapQuote.vaultIn;
		const longVault = swapQuote.receiver;
		const liabilityAmount = BigInt(swapQuote.amountIn);

		// 2. Determine if collateral needs to be enabled
		const enableCollateral =
			collateralAmount > 0n &&
			!(account?.isCollateralEnabled(receiver, collateralVault) ?? false);

		// 3. Determine if controller needs to be enabled
		const enableController = !(
			account?.isControllerEnabled(receiver, liabilityVault) ?? false
		);

		// 4. Get current controller (may need to disable if different)
		const currentController = account?.getCurrentController(receiver);

		// 5. Build EVC batch items
		const batchItems = this.encodeMultiplyWithSwap({
			chainId: account.chainId,
			collateralVault,
			collateralAmount,
			liabilityVault,
			liabilityAmount,
			longVault,
			owner: account.owner,
			receiver,
			enableCollateral,
			currentController: currentController || undefined,
			enableController,
			swapQuote,
			// Permit2 is handled separately in the plan
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}

	/**
	 * Builds a transaction plan for a multiply/leverage position when liability and long asset are the same (no swap).
	 * Flow: optional collateral deposit → enable controller → borrow to long vault → skim → enable collateral on long vault.
	 *
	 * @param args - Multiply-same-asset plan arguments
	 * @param args.collateralVault - Vault to deposit initial collateral into (optional; use 0n for collateralAmount to skip)
	 * @param args.collateralAmount - Amount of collateral asset to deposit (0n to skip)
	 * @param args.collateralAsset - Underlying asset address of collateral (for approval when collateralAmount > 0)
	 * @param args.liabilityVault - Liability vault to borrow from
	 * @param args.liabilityAmount - Amount to borrow (same asset as long vault)
	 * @param args.longVault - Vault to deposit borrowed assets into (same asset as liability)
	 * @param args.receiver - Sub-account address that holds the position (collateral + debt)
	 * @param args.account - Account entity; used for chainId, owner, and collateral/controller state
	 * @returns Array of transaction plan items (optional approval + EVC batch)
	 */
	planMultiplySameAsset(args: PlanMultiplySameAssetArgs): TransactionPlan {
		const {
			collateralVault,
			collateralAmount,
			collateralAsset,
			liabilityVault,
			liabilityAmount,
			longVault,
			receiver,
			account,
		} = args;
		const plan: TransactionPlanItem[] = [];

		// 1. Check if collateral approval is needed (only if depositing collateral)
		if (collateralAmount > 0n) {
			// Add approval requirement (will be resolved later with Wallet data)
			plan.push({
				type: "requiredApproval",
				token: collateralAsset,
				owner: account.owner,
				spender: collateralVault,
				amount: collateralAmount,
			});
		}

		// 2. Determine if collateral needs to be enabled
		const enableCollateral =
			collateralAmount > 0n &&
			!(account?.isCollateralEnabled(receiver, collateralVault) ?? false);

		// 3. Determine if controller needs to be enabled
		const enableController = !(
			account?.isControllerEnabled(receiver, liabilityVault) ?? false
		);

		// 4. Get current controller (may need to disable if different)
		const currentController = account?.getCurrentController(receiver);

		// 5. Build EVC batch items
		const batchItems = this.encodeMultiplySameAsset({
			chainId: account.chainId,
			collateralVault,
			collateralAmount,
			liabilityVault,
			liabilityAmount,
			longVault,
			owner: account.owner,
			receiver,
			enableCollateral,
			currentController: currentController || undefined,
			enableController,
			// Permit2 is handled separately in the plan
		});

		plan.push({
			type: "evcBatch",
			items: batchItems,
		});

		return plan;
	}
}
