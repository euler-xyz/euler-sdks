import { encodeFunctionData, getAddress, Hex, maxUint256, type Address, zeroAddress, maxUint160, maxUint48, TypedDataDefinition, erc20Abi, decodeFunctionData, type Abi, isAddressEqual } from "viem";
import { DeploymentService } from "../deploymentService/index.js";
import { ethereumVaultConnectorAbi } from "./abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "./abis/eVaultAbi.js";
import { permit2PermitAbi } from "./abis/permit2PermitAbi.js";
import { swapperAbi } from "./abis/swapperAbi.js";
import { swapVerifierAbi } from "./abis/swapVerifierAbi.js";
import type { Account, AccountPosition, SubAccount } from "../../entities/Account.js";
import type { Wallet } from "../../entities/Wallet.js";
import type { AssetWithSpenders, IWalletService } from "../walletService/index.js";
import {
  type EVCBatchItem,
  type EncodeDepositArgs,
  type EncodeMintArgs,
  type EncodeWithdrawArgs,
  type EncodeRedeemArgs,
  type EncodeBorrowArgs,
  type EncodeLiquidationArgs,
  type EncodePullDebtArgs,
  type EncodeRepayWithSwapArgs,
  type EncodeRepayFromWalletArgs,
  type EncodeRepayFromDepositArgs,
  type EncodeSwapDebtArgs,
  type EncodeTransferArgs,
  type EncodeSwapCollateralArgs,
  type EncodePermit2CallArgs,
  PERMIT2_TYPES,
  GetPermit2TypedDataArgs,
  Permit2Data,
  type TransactionPlanItem,
  type ApproveCall,
  type Permit2DataToSign,
  type EVCBatchItems,
  type PlanDepositArgs,
  type PlanMintArgs,
  type PlanWithdrawArgs,
  type PlanRedeemArgs,
  type PlanBorrowArgs,
  type PlanLiquidationArgs,
  type PlanRepayFromWalletArgs,
  type PlanRepayFromDepositArgs,
  type PlanRepayWithSwapArgs,
  type PlanSwapCollateralArgs,
  type PlanSwapDebtArgs,
  type PlanTransferArgs,
  type PlanPullDebtArgs,  
  type BatchItemDescription,
  type EncodeMultiplyWithSwapArgs,
  type EncodeMultiplySameAssetArgs,
  type PlanMultiplyWithSwapArgs,
  type PlanMultiplySameAssetArgs,
  type PermitSingleTypedData,
  PermitSingleMessage,
  type RequiredApproval,
  type ResolveRequiredApprovalsArgs,
  type ResolveRequiredApprovalsWithWalletArgs,
} from "./executionServiceTypes.js";

export interface IExecutionService {
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
  encodeSwapCollateral(args: EncodeSwapCollateralArgs): EVCBatchItem[];
  encodeSwapDebt(args: EncodeSwapDebtArgs): EVCBatchItem[];
  encodeTransfer(args: EncodeTransferArgs): EVCBatchItem[];
  encodeMultiplyWithSwap(args: EncodeMultiplyWithSwapArgs): EVCBatchItem[];
  encodeMultiplySameAsset(args: EncodeMultiplySameAssetArgs): EVCBatchItem[];
  encodePermit2Call(args: EncodePermit2CallArgs): EVCBatchItem;
  // Transaction plan functions
  planDeposit(args: PlanDepositArgs): TransactionPlanItem[];
  planMint(args: PlanMintArgs): TransactionPlanItem[];
  planWithdraw(args: PlanWithdrawArgs): TransactionPlanItem[];
  planRedeem(args: PlanRedeemArgs): TransactionPlanItem[];
  planBorrow(args: PlanBorrowArgs): TransactionPlanItem[];
  planLiquidation(args: PlanLiquidationArgs): TransactionPlanItem[];
  planRepayFromWallet(args: PlanRepayFromWalletArgs): TransactionPlanItem[];
  planRepayFromDeposit(args: PlanRepayFromDepositArgs): TransactionPlanItem[];
  planRepayWithSwap(args: PlanRepayWithSwapArgs): TransactionPlanItem[];
  planSwapCollateral(args: PlanSwapCollateralArgs): TransactionPlanItem[];
  planSwapDebt(args: PlanSwapDebtArgs): TransactionPlanItem[];
  planTransfer(args: PlanTransferArgs): TransactionPlanItem[];
  planPullDebt(args: PlanPullDebtArgs): TransactionPlanItem[];
  planMultiplyWithSwap(args: PlanMultiplyWithSwapArgs): TransactionPlanItem[];
  planMultiplySameAsset(args: PlanMultiplySameAssetArgs): TransactionPlanItem[];

  resolveRequiredApprovalsWithWallet(args: ResolveRequiredApprovalsWithWalletArgs): TransactionPlanItem[];
  resolveRequiredApprovals(args: ResolveRequiredApprovalsArgs): Promise<TransactionPlanItem[]>;
  getPermit2TypedData(args: GetPermit2TypedDataArgs): PermitSingleTypedData;
  describeBatch(batch: EVCBatchItem[]): BatchItemDescription[];
}

const PERMIT2_SIG_WINDOW = 60n * 60n
const WAD = 10n ** 18n

// TODO explain how this service is coupled to the concrete abis of ERC4626, permit2 and EVK. 
// this is a helper service, not a generic one.
export class ExecutionService implements IExecutionService {
  constructor(
    private readonly deploymentService: DeploymentService,
    private readonly walletService: IWalletService,
  ) {}

  encodeBatch(items: EVCBatchItem[]): Hex {
    return encodeFunctionData({
      abi: ethereumVaultConnectorAbi,
      functionName: "batch",
      args: [items]
    })
  }

  encodeDeposit({ chainId, vault, amount, receiver, owner, enableCollateral, permit2 }: EncodeDepositArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    if (permit2) {
      const permit2Call = this.encodePermit2Call({
        chainId,
        owner,
        message: permit2.message,
        signature: permit2.signature,
      })
      items.push(permit2Call)
    }

    // Add enable collateral if flag is set
    if (enableCollateral) {
      items.push(this.encodeEnableCollateral(chainId, receiver, vault))
    }

    // Add deposit operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: owner,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "deposit",
        args: [amount, receiver]
      })
    })

    return items
  }

  encodeMint({ chainId, vault, shares, receiver, owner, enableCollateral, permit2 }: EncodeMintArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    if (permit2) {
      const permit2Call = this.encodePermit2Call({
        chainId,
        owner,
        message: permit2.message,
        signature: permit2.signature,
      })
      items.push(permit2Call)
    }

    // Add enable collateral if flag is set
    if (enableCollateral) {
      items.push(this.encodeEnableCollateral(chainId, receiver, vault))
    }

    // Add mint operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: owner,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "mint",
        args: [shares, receiver]
      })
    })

    return items
  }

  encodeWithdraw({ chainId, vault, assets, receiver, owner, disableCollateral }: EncodeWithdrawArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add disable collateral if flag is set
    if (disableCollateral) {
      items.push(this.encodeDisableCollateral(chainId, owner, vault))
    }

    // Add withdraw operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: owner,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "withdraw",
        args: [assets, receiver, owner]
      })
    })

    return items
  }

  encodeRedeem({ chainId, vault, shares, receiver, owner, disableCollateral }: EncodeRedeemArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add disable collateral if flag is set
    if (disableCollateral) {
      items.push(this.encodeDisableCollateral(chainId, owner, vault))
    }

    // Add redeem operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: owner,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "redeem",
        args: [shares, receiver, owner]
      })
    })

    return items
  }

  encodeBorrow(args: EncodeBorrowArgs): EVCBatchItem[] {
    const {
      chainId,
      vault,
      amount,
      owner,
      borrowAccount,
      receiver,
      enableController,
      currentController,
      collateralVault,
      collateralAmount,
      enableCollateral,
      collateralPermit2,
    } = args
    const items: EVCBatchItem[] = []

    // Add collateral if provided
    if (collateralVault && collateralAmount !== undefined && collateralAmount > 0n) {
      const depositItems = this.encodeDeposit({
        chainId,
        vault: collateralVault,
        amount: collateralAmount,
        receiver: borrowAccount,
        enableCollateral,
        permit2: collateralPermit2,
        owner: owner,
      })
      items.push(...depositItems)
    }

    // Add disable controller if there's a different controller enabled
    if (currentController && currentController !== vault) {
      items.push(this.encodeDisableController(currentController, borrowAccount))
    }

    if (enableController) {
      items.push(this.encodeEnableController(chainId, borrowAccount, vault))
    }

    // Add borrow operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: borrowAccount,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "borrow",
        args: [amount, receiver]
      })
    })

    return items
  }

  encodeLiquidation({
    chainId,
    vault,
    violator,
    collateral,
    repayAssets,
    minYieldBalance,
    liquidatorSubAccountAddress,
    enableCollateral,
    enableController,
  }: EncodeLiquidationArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Optionally enable controller for the liquidator account on the liability vault
    if (enableController) {
      items.push(this.encodeEnableController(chainId, liquidatorSubAccountAddress, vault))
    }

    // Perform the liquidation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: liquidatorSubAccountAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "liquidate",
        args: [violator, collateral, repayAssets, minYieldBalance],
      }),
    })

    // Optionally enable collateral for the seized collateral vault on the liquidator account
    if (enableCollateral) {
      items.push(this.encodeEnableCollateral(chainId, liquidatorSubAccountAddress, collateral))
    }

    return items
  }

  encodePullDebt({ chainId, vault, amount, from, to, enableController }: EncodePullDebtArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add enable controller if flag is set
    if (enableController) {
      items.push(this.encodeEnableController(chainId, to, vault))
    }

    // Add pullDebt operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: to,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "pullDebt",
        args: [amount, from]
      })
    })

    return items
  }

  /**
   * Encodes batch items for multiply/leverage operation with swap.
   * Used when liability asset and long asset are different and require a swap.
   * This combines: deposit collateral, enable controller, borrow, swap, and enable collateral.
   */
  encodeMultiplyWithSwap(args: EncodeMultiplyWithSwapArgs): EVCBatchItem[] {
    const {
      chainId,
      collateralVault,
      collateralAmount,
      liabilityVault,
      liabilityAmount,
      longVault,
      owner,
      receiver,
      enableCollateral = true,
      enableCollateralLong = true,
      currentController,
      enableController = true,
      collateralPermit2,
      swapQuote,
    } = args
    const items: EVCBatchItem[] = []

    // 1. Add permit2 for collateral if provided
    if (collateralPermit2) {
      const permit2Call = this.encodePermit2Call({
        chainId,
        owner,
        message: collateralPermit2.message,
        signature: collateralPermit2.signature,
      })
      items.push(permit2Call)
    }

    // 2. Deposit initial collateral if amount > 0
    if (collateralAmount > 0n) {
      // Enable collateral for collateral vault
      if (enableCollateral) {
        items.push(this.encodeEnableCollateral(chainId, receiver, collateralVault))
      }

      // Deposit collateral
      items.push({
        targetContract: collateralVault,
        onBehalfOfAccount: owner,
        value: 0n,
        data: encodeFunctionData({
          abi: eVaultAbi,
          functionName: "deposit",
          args: [collateralAmount, receiver]
        })
      })
    }

    // 3. Disable current controller if there's a different one enabled
    if (currentController && currentController !== liabilityVault) {
      items.push(this.encodeDisableController(currentController, receiver))
    }

    // 4. Enable controller for liability vault
    if (enableController) {
      items.push(this.encodeEnableController(chainId, receiver, liabilityVault))
    }

    // 5. Borrow from liability vault to swapper
    items.push({
      targetContract: liabilityVault,
      onBehalfOfAccount: receiver,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "borrow",
        args: [liabilityAmount, swapQuote.swap.swapperAddress]
      })
    })

    // 6. Execute swap multicall
    items.push({
      targetContract: swapQuote.swap.swapperAddress,
      onBehalfOfAccount: receiver,
      value: 0n,
      data: swapQuote.swap.swapperData,
    })

    // 7. Verify swap and skim to long vault
    if (swapQuote.verify.type !== "skimMin") {
      throw new Error("Invalid swap quote type for multiply - must be skimMin")
    }
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: receiver,
      value: 0n,
      data: swapQuote.verify.verifierData,
    })

    // 8. Enable collateral on long vault
    if (enableCollateralLong) {
      items.push(this.encodeEnableCollateral(chainId, receiver, longVault))
    }

    return items
  }

  /**
   * Encodes batch items for multiply/leverage operation with same asset.
   * Used when liability asset and long asset are the same (no swap needed).
   * This combines: deposit collateral, enable controller, borrow, skim, and enable collateral.
   */
  encodeMultiplySameAsset(args: EncodeMultiplySameAssetArgs): EVCBatchItem[] {
    const {
      chainId,
      collateralVault,
      collateralAmount,
      liabilityVault,
      liabilityAmount,
      longVault,
      owner,
      receiver,
      enableCollateral = true,
      enableCollateralLong = true,
      enableController = true,
      currentController,
      collateralPermit2,
    } = args
    const items: EVCBatchItem[] = []

    // 1. Add permit2 for collateral if provided
    if (collateralPermit2) {
      const permit2Call = this.encodePermit2Call({
        chainId,
        owner,
        message: collateralPermit2.message,
        signature: collateralPermit2.signature,
      })
      items.push(permit2Call)
    }

    // 2. Deposit initial collateral if amount > 0
    if (collateralAmount > 0n) {
      // Enable collateral for collateral vault
      if (enableCollateral) {
        items.push(this.encodeEnableCollateral(chainId, receiver, collateralVault))
      }

      // Deposit collateral
      items.push({
        targetContract: collateralVault,
        onBehalfOfAccount: owner,
        value: 0n,
        data: encodeFunctionData({
          abi: eVaultAbi,
          functionName: "deposit",
          args: [collateralAmount, receiver]
        })
      })
    }

    // 3. Disable current controller if there's a different one enabled
    if (currentController && currentController !== liabilityVault) {
      items.push(this.encodeDisableController(currentController, receiver))
    }

    // 4. Enable controller for liability vault
    if (enableController) {
      items.push(this.encodeEnableController(chainId, receiver, liabilityVault))
    }

    // 5. Borrow from liability vault directly to long vault
    items.push({
      targetContract: liabilityVault,
      onBehalfOfAccount: receiver,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "borrow",
        args: [liabilityAmount, longVault]
      })
    })

    // 6. Skim borrowed assets to position
    items.push({
      targetContract: longVault,
      onBehalfOfAccount: receiver,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "skim",
        args: [liabilityAmount, receiver]
      })
    })

    // 7. Enable collateral on long vault
    if (enableCollateralLong) {
      items.push(this.encodeEnableCollateral(chainId, receiver, longVault))
    }

    return items
  }

  /**
   * Encodes batch items for repaying debt from wallet.
   */
  encodeRepayFromWallet(args: EncodeRepayFromWalletArgs): EVCBatchItem[] {
    const {
      chainId,
      sender,
      liabilityVault,
      liabilityAmount,
      receiver,
      disableControllerOnMax = true,
      isMax = false,
      permit2,
    } = args

    const items: EVCBatchItem[] = []

    if (permit2) {
      const permit2Call = this.encodePermit2Call({
        chainId,
        owner: sender,
        message: permit2.message,
        signature: permit2.signature,
      })
      items.push(permit2Call)
    }

    // Repay operation
    items.push({
      targetContract: liabilityVault,
      onBehalfOfAccount: sender,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "repay",
        args: [isMax ? maxUint256 : liabilityAmount, receiver],
      }),
    })

    // Disable controller if needed (for max repay)
    // Sender must be allowed to act on behalf of receiver (sender is subaccount of receiver or is an operator)
    if (disableControllerOnMax && isMax) {
      items.push(this.encodeDisableController(liabilityVault, receiver))
    }

    return items
  }

  /**
   * Encodes batch items for repaying debt from a deposit.
   * Supports multiple scenarios:
   * 1. Same asset, same vault - use repayWithShares
   * 2. Same asset, different vault - withdraw and repay
   */
  encodeRepayFromDeposit(args: EncodeRepayFromDepositArgs): EVCBatchItem[] {
    const {
      chainId,
      liabilityVault,
      liabilityAsset,
      liabilityAmount,
      from,
      receiver,
      fromVault,
      fromAsset,
      disableControllerOnMax = false,
      isMax = false,
      liabilityPermit2,
    } = args

    // PATH 1: Same asset, same vault - use repayWithShares
    if (fromAsset === liabilityAsset && fromVault === liabilityVault) {
      return this.encodeRepayWithSharesSameAssetAndVault({
        chainId,
        vault: liabilityVault,
        amount: liabilityAmount,
        receiver,
        from,
        disableController: isMax && disableControllerOnMax,
      })
    }

    // PATH 2: Same asset, different vault
    if (fromAsset === liabilityAsset) {
      return this.encodeRepayWithSharesSameAssetDifferentVault({
        chainId,
        fromVault,
        toVault: liabilityVault,
        amount: liabilityAmount,
        receiver, 
        from,
        isMax,
        disableControllerOnMax,
        permit2: liabilityPermit2,
      })
    }

    throw new Error("encodeRepayFromDeposit only supports same-asset paths")
  }

  /**
   * Requires a swap quote to be provided.
   * Make sure the swap quote comes from swapService.getRepayQuotes() or follows the same structure.
   */
  encodeRepayWithSwap(
    args: EncodeRepayWithSwapArgs,
  ): EVCBatchItem[] {
    const {
      chainId,
      swapQuote,
      maxWithdraw,
      isMax = false,
      disableControllerOnMax = true,
    } = args
    const items: EVCBatchItem[] = []

    // Determine withdraw amount (cap to available amount if provided)
    const withdrawAmount =
      maxWithdraw && maxWithdraw < BigInt(swapQuote.amountInMax || swapQuote.amountIn)
        ? maxWithdraw
        : BigInt(swapQuote.amountInMax || swapQuote.amountIn)

    // 1. Withdraw collateral from vault to swapper
    items.push({
      targetContract: swapQuote.vaultIn,
      onBehalfOfAccount: swapQuote.accountIn,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "withdraw",
        args: [withdrawAmount, swapQuote.swap.swapperAddress, swapQuote.accountIn],
      }),
    })

    // 2. Execute swap multicall
    items.push({
      targetContract: swapQuote.swap.swapperAddress,
      onBehalfOfAccount: swapQuote.accountIn,
      value: 0n,
      data: swapQuote.swap.swapperData,
    })

    // 3. Verify swap and repay (verifyDebtMax handles the repay)
    if (swapQuote.verify.type !== "debtMax") {
      throw new Error("Invalid swap quote type for repay - must be debtMax")
    }

    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.verify.account,
      value: 0n,
      data: swapQuote.verify.verifierData,
    })

    // 4. Disable controller if needed (for max repay)
    if (isMax && disableControllerOnMax) {
      items.push(this.encodeDisableController(swapQuote.receiver, swapQuote.accountOut))
    }

    return items
  }

  /**
   * Encodes batch items for swapping collateral from one vault to another.
   * Make sure the swap quote comes from swapService.getDepositQuote() or follows the same structure.
   */
  encodeSwapCollateral(args: EncodeSwapCollateralArgs): EVCBatchItem[] {
    const {
      chainId,
      swapQuote,
      enableCollateral = true,
      disableCollateralOnMax = true,
      isMax = false,
    } = args

    const items: EVCBatchItem[] = []

    // 1. Withdraw from source vault to swapper
    const withdrawAmount = BigInt(swapQuote.amountInMax || swapQuote.amountIn)
    items.push({
      targetContract: swapQuote.vaultIn,
      onBehalfOfAccount: swapQuote.accountIn,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "withdraw",
        args: [withdrawAmount, swapQuote.swap.swapperAddress, swapQuote.accountIn]
      })
    })

    // 2. Execute swap multicall
    items.push({
      targetContract: swapQuote.swap.swapperAddress,
      onBehalfOfAccount: swapQuote.accountIn,
      value: 0n,
      data: swapQuote.swap.swapperData
    })

    // 3. Verify swap and skim
    if (swapQuote.verify.type !== "skimMin") {
      throw new Error("Invalid swap quote type for swap collateral - must be skimMin")
    }
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      value: 0n,
      data: swapQuote.verify.verifierData
    })

    // 4. Disable collateral if needed (for max swap)
    if(isMax && disableCollateralOnMax) {
      items.push(this.encodeDisableCollateral(chainId, swapQuote.accountIn, swapQuote.vaultIn))
    }

    // 5. Enable collateral if needed
    if (enableCollateral) {
      items.push(this.encodeEnableCollateral(chainId, swapQuote.accountOut, swapQuote.receiver))
    }

    return items
  }

  /**
   * Encodes batch items for swapping debt from one vault to another.
   * Make sure the swap quote comes from swapService.getRepayQuotes() or follows the same structure.
   */
  encodeSwapDebt({
    chainId,
    swapQuote,
    enableController = true,
    disableControllerOnMax = true,
    isMax = false,
  }: EncodeSwapDebtArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Enable controller if needed
    if (enableController) {
      items.push(this.encodeEnableController(chainId, swapQuote.accountOut, swapQuote.vaultIn))
    }

    // Borrow from source vault
    const borrowAmount = BigInt(swapQuote.amountInMax)
    items.push({
      targetContract: swapQuote.vaultIn,
      onBehalfOfAccount: swapQuote.accountIn,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "borrow",
        args: [borrowAmount, swapQuote.swap.swapperAddress]
      })
    })

    // Execute swap multicall
    items.push({
      targetContract: swapQuote.swap.swapperAddress,
      onBehalfOfAccount: swapQuote.accountIn,
      value: 0n,
      data: swapQuote.swap.swapperData
    })

    // Verify swap and skim
    if (swapQuote.verify.type !== "debtMax") {
      throw new Error("Invalid swap quote type for repay - must be debtMax")
    }
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      value: 0n,
      data: swapQuote.verify.verifierData
    })

    // Disable controller if needed (for max swap)
    if (isMax && disableControllerOnMax) {
      items.push(this.encodeDisableController(swapQuote.receiver, swapQuote.accountIn))
    }

    return items
  }

  encodeTransfer({ chainId, vault, to, amount, from, enableCollateralTo, disableCollateralFrom }: EncodeTransferArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add disable collateral from sender if flag is set
    if (disableCollateralFrom) {
      items.push(this.encodeDisableCollateral(chainId, from, vault))
    }

    // Add transfer operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: from,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "transfer",
        args: [to, amount]
      })
    })

    // Add enable collateral to receiver if flag is set
    if (enableCollateralTo) {
      items.push(this.encodeEnableCollateral(chainId, to, vault))
    }

    return items
  }

  encodePermit2Call(args: EncodePermit2CallArgs): EVCBatchItem {
    const {
      chainId,
      owner,
      message,
      signature
    } = args
    const deployment = this.deploymentService.getDeployment(chainId)
    const permit2 = deployment.addresses.coreAddrs.permit2

    return {
      targetContract: permit2,
      onBehalfOfAccount: owner,
      value: 0n,
      data: encodeFunctionData({
        abi: permit2PermitAbi,
        functionName: "permit",
        args: [owner, message, signature],
      }),
    }
  }

  encodeEnableCollateral(chainId: number, account: Address, vault: Address): EVCBatchItem {
    const deployment = this.deploymentService.getDeployment(chainId)
    const evc = deployment.addresses.coreAddrs.evc
    return {
      targetContract: evc,
      onBehalfOfAccount: zeroAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: ethereumVaultConnectorAbi,
        functionName: "enableCollateral",
        args: [account, vault]
      })
    }
  }

  encodeDisableCollateral(chainId: number, account: Address, vault: Address): EVCBatchItem {
    const deployment = this.deploymentService.getDeployment(chainId)
    const evc = deployment.addresses.coreAddrs.evc
    return {
      targetContract: evc,
      onBehalfOfAccount: zeroAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: ethereumVaultConnectorAbi,
        functionName: "disableCollateral",
        args: [account, vault]
      })
    }
  }

  encodeEnableController(chainId: number, account: Address, vault: Address): EVCBatchItem {
    const deployment = this.deploymentService.getDeployment(chainId)
    const evc = deployment.addresses.coreAddrs.evc
    return {
      targetContract: evc,
      onBehalfOfAccount: zeroAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: ethereumVaultConnectorAbi,
        functionName: "enableController",
        args: [account, vault]
      })
    }
  }

  encodeDisableController(vault: Address, account: Address): EVCBatchItem {
    return {
      targetContract: vault,
      onBehalfOfAccount: account,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "disableController",
        args: []
      })
    }
  }

 // TODO add example usage with wagmi
  getPermit2TypedData(args: GetPermit2TypedDataArgs): PermitSingleTypedData {
    const nowInSeconds = () => BigInt(Math.floor(Date.now() / 1000))

    const {
      chainId,
      token,
      amount,
      spender,
      nonce,
      sigDeadline,
      expiration,
    } = args
    const deployment = this.deploymentService.getDeployment(chainId)
    const permit2 = deployment.addresses.coreAddrs.permit2

    const permitSingle = {
      details: {
        token,
        amount: amount > maxUint160 ? maxUint160 : amount,
        expiration: expiration ?? Number(maxUint48),
        nonce,
      },
      spender,
      sigDeadline: sigDeadline ?? nowInSeconds() + PERMIT2_SIG_WINDOW,
    }

    return {
      domain: {
        name: 'Permit2',
        chainId,
        verifyingContract: permit2,
      },
      types: PERMIT2_TYPES,
      primaryType: 'PermitSingle',
      message: permitSingle as PermitSingleMessage,
    }
  }

  /**
   * Decodes EVCBatchItem[] back to function name and named arguments.
   * 
   * @example
   * const batchItems = executionService.encodeDeposit({ ... });
   * const described = executionService.describeBatch(batchItems);
   * console.log(described[0].functionName); // "deposit"
   * console.log(described[0].args); // { amount: 1000n, receiver: "0x..." }
   */
  describeBatch(batch: EVCBatchItem[]): BatchItemDescription[] {
    const decodedBatchItems: BatchItemDescription[] = []
    for (const item of batch) {
      let decoded = false
      const executionDecodeAbis: Abi[] = [ethereumVaultConnectorAbi, eVaultAbi, permit2PermitAbi, swapperAbi, swapVerifierAbi];
      for (const abi of executionDecodeAbis) {
        try {
          const decodedData = decodeFunctionData({
            abi: abi as unknown as Abi,
            data: item.data,
          })

          // Convert args array to named object
          const functionAbi = abi.find(
            (abiItem) => abiItem.type === "function" && abiItem.name === decodedData.functionName
          )

          if (!functionAbi || functionAbi.type !== "function") {
            continue
          }

          // Create named arguments object
          const namedArgs: Record<string, unknown> = {}
          if (functionAbi.inputs && Array.isArray(decodedData.args) && decodedData.args.length > 0) {
            functionAbi.inputs.forEach((input, index) => {
              if (input.name) {
                namedArgs[input.name] = decodedData.args?.[index]
              }
            })
          }

          decodedBatchItems.push({
            targetContract: item.targetContract,
            onBehalfOfAccount: item.onBehalfOfAccount,
            functionName: decodedData.functionName,
            args: namedArgs,
          })
          decoded = true
          break
        } catch {
          // Try next ABI
          continue
        }
      }
      if (!decoded) {
        throw new Error(`Could not decode batch item data: ${item.data}`)
      }
    }

    return decodedBatchItems
  }

  /**
   * Encodes batch items for repaying with shares from the same asset and vault
   */
  private encodeRepayWithSharesSameAssetAndVault({
    chainId,
    vault,
    amount,
    from,
    receiver,
    disableController,
  }: {
    chainId: number
    vault: Address
    amount: bigint
    from: Address
    receiver: Address
    disableController: boolean
  }): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Repay with shares
    items.push({
      targetContract: vault,
      onBehalfOfAccount: from,
      value: 0n,
      data: encodeFunctionData({
        abi: eVaultAbi,
        functionName: "repayWithShares",
        args: [amount, receiver],
      }),
    })

    // Disable controller if needed (for max repay)
    if (disableController) {
      items.push(this.encodeDisableController(vault, receiver))
    }

    return items
  }

  /**
   * Encodes batch items for repaying with shares from same asset but different vault
   */
  private encodeRepayWithSharesSameAssetDifferentVault({
    chainId,
    fromVault,
    toVault,
    amount, // if isMax, this should be the total current debt
    receiver,
    from,
    isMax,
    disableControllerOnMax,
    permit2,
  }: {
    chainId: number
    fromVault: Address
    toVault: Address
    amount: bigint
    receiver: Address
    from: Address
    isMax: boolean
    disableControllerOnMax: boolean
    permit2?: Permit2Data
  }): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    if (isMax) {
      // if amount was max uint, skim and repay with shares would not revert if after withdraw funds were skimmed
      // by other party
      if (amount == maxUint256) {
        throw new Error("Amount is maxUint256, cannot be used for max repay")
      }
      // For max repay: withdraw full debt amount +1 BPS to cover interest, then skim, then repayWithShares max
      const amountWithExtra = (amount * 10_001n) / 10_000n

      if (amountWithExtra >= maxUint256) {
        throw new Error("Amount with extra exceeds maxUint256")
      }

      // 1. Withdraw from collateral vault
      items.push({
        targetContract: fromVault,
        onBehalfOfAccount: from,
        value: 0n,
        data: encodeFunctionData({
          abi: eVaultAbi,
          functionName: "withdraw",
          args: [amountWithExtra, toVault, from],
        }),
      })

      // 2. Skim exact withdrawal amount to liability vault
      items.push({
        targetContract: toVault,
        onBehalfOfAccount: from,
        value: 0n,
        data: encodeFunctionData({
          abi: eVaultAbi,
          functionName: "skim",
          args: [amountWithExtra, receiver],
        }),
      })

      // 3. Repay with shares (max)
      items.push({
        targetContract: toVault,
        onBehalfOfAccount: receiver,
        value: 0n,
        data: encodeFunctionData({
          abi: eVaultAbi,
          functionName: "repayWithShares",
          // max is ok now, because skim deposited exact amount and it is the full debt,
          // so pre-existing balance will not be consumed
          args: [maxUint256, receiver],
        }),
      })

      // 4. Disable controller if needed
      if (disableControllerOnMax) {
        items.push(this.encodeDisableController(toVault, receiver))
      }
    } else {
      // For partial repay: withdraw, then repay exact amount
      // 1. Withdraw from collateral vault
      items.push({
        targetContract: fromVault,
        onBehalfOfAccount: from,
        value: 0n,
        data: encodeFunctionData({
          abi: eVaultAbi,
          functionName: "withdraw",
          args: [amount, from, from],
        }),
      })

      // 2. Repay exact amount
      const repayItems = this.encodeRepayFromWallet({
        chainId,
        sender: from,
        liabilityVault: toVault,
        liabilityAmount: amount,
        receiver,
        disableControllerOnMax,
        isMax,
        permit2,
      })

      items.push(...repayItems)
    }

    return items
  }

  /**
   * Resolves RequiredApproval items in a transaction plan by filling in the resolved field.
   * Uses Wallet data to determine what approvals are needed and whether to use permit2.
   * Returns the modified plan.
   */
  resolveRequiredApprovalsWithWallet(args: ResolveRequiredApprovalsWithWalletArgs): TransactionPlanItem[] {
    const { plan, wallet, chainId, usePermit2 = true, unlimitedApproval = true } = args

    const deployment = this.deploymentService.getDeployment(chainId)
    const permit2 = deployment.addresses.coreAddrs.permit2

    for (const item of plan) {
      if (item.type === "requiredApproval") {
        const approval = item as RequiredApproval
        const { token, owner, spender, amount } = approval

        // Get wallet asset and allowances for the specific spender
        const walletAsset = wallet.getAsset(token)
        const allowances = walletAsset?.allowances[spender]

        const resolvedItems: (ApproveCall | Permit2DataToSign)[] = []

        const makeApprove = (approvalSpender: Address, approvalAmount: bigint): ApproveCall => ({
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
        })

        const makePermit2 = (permit2Spender: Address, permit2Amount: bigint): Permit2DataToSign => ({
          type: "permit2",
          token,
          owner,
          spender: permit2Spender,
          amount: permit2Amount,
        })

        // If no wallet asset data, assume approval is needed
        if (!walletAsset || !allowances) {
          if (usePermit2) {
            // Need approval to permit2 and permit2 signature
            resolvedItems.push(makeApprove(permit2, unlimitedApproval ? maxUint256 : amount))
            resolvedItems.push(makePermit2(spender, unlimitedApproval ? maxUint160 : amount))
          } else {
            // Regular approval
            resolvedItems.push(makeApprove(spender, unlimitedApproval ? maxUint256 : amount))
          }
          approval.resolved = resolvedItems
          continue
        }

        if (usePermit2) {
          // Check permit2 allowances
          const assetForPermit2 = allowances.assetForPermit2
          const assetForVaultInPermit2 = allowances.assetForVaultInPermit2
          const permit2ExpirationTime = allowances.permit2ExpirationTime

          // Check if permit2 signature has expired
          const currentTime = Math.floor(Date.now() / 1000)
          const isPermit2Expired = permit2ExpirationTime > 0 && currentTime >= permit2ExpirationTime

          const hasSufficientPermit2Allowance = assetForPermit2 >= amount
          const hasSufficientVaultAllowance = assetForVaultInPermit2 >= amount && !isPermit2Expired

          // If both are sufficient, no approval needed
          if (hasSufficientPermit2Allowance && hasSufficientVaultAllowance) {
            approval.resolved = []
            continue
          }

          // If assetForPermit2 is insufficient, we need both approval and permit2 signature
          if (!hasSufficientPermit2Allowance) {
            resolvedItems.push(makeApprove(permit2, unlimitedApproval ? maxUint256 : amount))
            resolvedItems.push(makePermit2(spender, unlimitedApproval ? maxUint160 : amount))
          } else {
            // assetForPermit2 is sufficient, but vault allowance is insufficient or expired
            // Only need permit2 signature
            resolvedItems.push(makePermit2(spender, unlimitedApproval ? maxUint160 : amount))
          }

          approval.resolved = resolvedItems
        } else {
          // Regular approval (non-permit2 path)
          const assetForVault = allowances.assetForVault
          const needsDirectApproval = assetForVault < amount

          if (!needsDirectApproval) {
            approval.resolved = []
            continue
          }

          resolvedItems.push(makeApprove(spender, unlimitedApproval ? maxUint256 : amount))
          approval.resolved = resolvedItems
        }
      }
    }

    return plan
  }

  /**
   * Resolves RequiredApproval items in a transaction plan by:
   * 1. Deriving wallet assets/spenders from the plan
   * 2. Fetching wallet data via WalletService
   * 3. Delegating to resolveRequiredApprovalsWithWallet to fill in approvals
   */
  async resolveRequiredApprovals(args: ResolveRequiredApprovalsArgs): Promise<TransactionPlanItem[]> {
    const { plan, chainId, account, usePermit2 = true, unlimitedApproval = true } = args

    // Filter transaction plan for only RequiredApproval items
    const requiredApprovals = plan.filter(
      (item): item is RequiredApproval => item.type === "requiredApproval"
    )

    // Transform RequiredApprovals into AssetWithSpenders
    const assetSpendersMap = new Map<Address, Set<Address>>()

    for (const approval of requiredApprovals) {
      const asset = getAddress(approval.token)
      const spender = getAddress(approval.spender)

      if (!assetSpendersMap.has(asset)) {
        assetSpendersMap.set(asset, new Set())
      }
      assetSpendersMap.get(asset)!.add(spender)
    }

    // Convert map to AssetWithSpenders array
    const assetsWithSpenders: AssetWithSpenders[] = Array.from(assetSpendersMap.entries()).map(
      ([asset, spenders]) => ({
        asset,
        spenders: Array.from(spenders),
      })
    )

    const wallet = await this.walletService.fetchWallet(chainId, account, assetsWithSpenders)

    return this.resolveRequiredApprovalsWithWallet({
      plan,
      wallet,
      chainId,
      usePermit2,
      unlimitedApproval,
    })
  }

  // ========== Transaction plan functions ==========

  // TODO document - set maxUint256 for amount to deposit all available assets
  planDeposit(args: PlanDepositArgs): TransactionPlanItem[] {
    const { vault, amount, receiver, account, asset, enableCollateral } = args
    const plan: TransactionPlanItem[] = []

    // Default: collateral is not enabled when account/position is not available
    const isCollateralEnabled = (account?.isCollateralEnabled(receiver, vault) ?? false)

    // Add approval requirement (will be resolved later with Wallet data)
    plan.push({
      type: "requiredApproval",
      token: asset,
      owner: account.owner,
      spender: vault,
      amount,
    })


    // Build EVC batch items
    const batchItems = this.encodeDeposit({
      chainId: account.chainId,
      vault,
      amount,
      receiver,
      owner: account.owner,
      enableCollateral: !isCollateralEnabled && enableCollateral,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planMint(args: PlanMintArgs): TransactionPlanItem[] {
    const { vault, shares, receiver, account, asset, enableCollateral, sharesToAssetsExchangeRateWad } = args
    const plan: TransactionPlanItem[] = []

    // Default: collateral is not enabled when account/position is not available
    const isCollateralEnabled = (account?.isCollateralEnabled(receiver, vault) ?? false)

    const estimatedAssetAmount = sharesToAssetsExchangeRateWad ? shares * sharesToAssetsExchangeRateWad / WAD : shares

    
    // Add approval requirement (will be resolved later with Wallet data)
    plan.push({
      type: "requiredApproval",
      token: asset,
      owner: account.owner,
      spender: vault,
      amount: estimatedAssetAmount,
    })

    // Build EVC batch items
    const batchItems = this.encodeMint({
      chainId: account.chainId,
      vault,
      shares,
      receiver,
      owner: account.owner,
      enableCollateral: !isCollateralEnabled && enableCollateral,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planWithdraw(args: PlanWithdrawArgs): TransactionPlanItem[] {
    const { vault, assets, receiver, owner, account, disableCollateral = false } = args
    const plan: TransactionPlanItem[] = []

    // Get position to check collateral state
    const position = account?.getPosition(owner, vault)

    // Build EVC batch items
    const batchItems = this.encodeWithdraw({
      chainId: account.chainId,
      vault,
      assets,
      receiver,
      owner,
      disableCollateral: disableCollateral && (!position || position.isCollateral)
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  // TODO document - set maxUint256 for shares to redeem all available shares
  planRedeem(args: PlanRedeemArgs): TransactionPlanItem[] {
    const { vault, shares, receiver, owner, account, disableCollateral = false } = args
    const plan: TransactionPlanItem[] = []

    // Get position to check collateral state
    const position = account?.getPosition(owner, vault)

    // Build EVC batch items
    const batchItems = this.encodeRedeem({
      chainId: account.chainId,
      vault,
      shares,
      receiver,
      owner,
      disableCollateral: disableCollateral && (!position || position.isCollateral)
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }
  // TODO document - set maxUint256 for collateral amount to deposit all available assets
  planBorrow(args: PlanBorrowArgs): TransactionPlanItem[] {
    const { vault, amount, receiver, borrowAccount, account, collateral } = args
    const plan: TransactionPlanItem[] = []

    const enableCollateral = collateral && collateral.amount > 0n
      ? !(account?.isCollateralEnabled(borrowAccount, collateral.vault) ?? false)
      : false

    // Check if controller needs to be enabled
    // Default: controller is not enabled when account/sub-account is not available
    const currentController = account?.getCurrentController(borrowAccount)
    const enableController = !(account?.isControllerEnabled(borrowAccount, vault) ?? false)

    if (collateral && collateral.amount > 0n) {
      // Approval is needed from the account owner (who owns the wallet tokens)
      // Add approval requirement (will be resolved later with Wallet data)
      plan.push({
        type: "requiredApproval",
        token: collateral.asset,
        owner: account.owner,
        spender: collateral.vault,
        amount: collateral.amount,
      })
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
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planLiquidation(args: PlanLiquidationArgs): TransactionPlanItem[] {
    const {
      account,
      liquidatorSubAccountAddress,
      vault,
      asset,
      violator,
      collateral,
      repayAssets,
      minYieldBalance,
    } = args

    const plan: TransactionPlanItem[] = []

    // Add approval requirement for the liability asset the liquidator will repay
    plan.push({
      type: "requiredApproval",
      token: asset,
      owner: account.owner,
      spender: vault,
      amount: repayAssets,
    })

    // Check if controller needs to be enabled for the liquidator account on the liability vault
    const enableController = !(account?.isControllerEnabled(liquidatorSubAccountAddress, vault) ?? false)

    // Check if collateral needs to be enabled for the seized collateral vault on the liquidator account
    const enableCollateral = !(account?.isCollateralEnabled(liquidatorSubAccountAddress, collateral) ?? false)

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
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  // TODO document - set maxUint256 for liabilityAmount to repay all available debt
  planRepayFromWallet(args: PlanRepayFromWalletArgs): TransactionPlanItem[] {
    const { liabilityVault, liabilityAmount, receiver, account } = args
    const plan: TransactionPlanItem[] = []

    // Get position to determine asset
    const position = account?.getPosition(receiver, liabilityVault)
    if (!position) {
      throw new Error(`Position not found. Liability vault: ${liabilityVault}, Account: ${receiver}`)
    }

    // Add approval requirement (will be resolved later with Wallet data)
    plan.push({
      type: "requiredApproval",
      token: position.asset,
      owner: account.owner,
      spender: liabilityVault,
      amount: liabilityAmount,
    })

    // Build EVC batch items
    const batchItems = this.encodeRepayFromWallet({
      chainId: account.chainId,
      sender: account.owner,
      liabilityVault,
      liabilityAmount,
      receiver,
      disableControllerOnMax: true,
      isMax: liabilityAmount === maxUint256,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  // TODO document - set maxUint256 for liabilityAmount to repay all available debt or up to available deposit
  planRepayFromDeposit(args: PlanRepayFromDepositArgs): TransactionPlanItem[] {
    const { liabilityVault, liabilityAmount, receiver, fromVault, fromAccount, account } = args
    const plan: TransactionPlanItem[] = []

    // Get positions
    const liabilityPosition = account?.getPosition(receiver, liabilityVault)
    const fromPosition = account?.getPosition(fromAccount, fromVault)

    // If positions are not available, we can't determine asset addresses
    // We'll need to throw an error or require asset addresses to be provided
    if (!liabilityPosition || !fromPosition) {
      throw new Error(`Positions not found. Liability vault: ${liabilityVault}, From vault: ${fromVault}, Account: ${receiver}. Asset addresses are required when positions are not available.`)
    }

    const liabilityAsset = liabilityPosition.asset
    const fromAsset = fromPosition.asset

    // Check if approval is needed (only if different assets and we need to swap/withdraw)
    if (fromAsset !== liabilityAsset) {
      // This path requires a swap, which is handled by planRepayWithSwap
      throw new Error("planRepayFromDeposit only supports same-asset paths. Use planRepayWithSwap for different assets.")
    }

    // If same asset, different vault, we might need approval for the withdraw/repay path
    if (fromVault !== liabilityVault) {
      // Add approval requirement (will be resolved later with Wallet data)
      plan.push({
        type: "requiredApproval",
        token: liabilityAsset,
        owner: account.owner,
        spender: liabilityVault,
        amount: liabilityAmount,
      })
    }

    // Build EVC batch items
    const batchItems = this.encodeRepayFromDeposit({
      chainId: account.chainId,
      liabilityVault,
      liabilityAsset,
      liabilityAmount,
      from: receiver,
      receiver,
      fromVault,
      fromAsset,
      disableControllerOnMax: true,
      isMax: liabilityAmount === maxUint256,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planRepayWithSwap(args: PlanRepayWithSwapArgs): TransactionPlanItem[] {
    const { swapQuote, account } = args
    const plan: TransactionPlanItem[] = []

    const liabilityPosition = account?.getPosition(swapQuote.accountOut, swapQuote.receiver)
    const fromPosition = account?.getPosition(swapQuote.accountIn, swapQuote.vaultIn)
    if (!liabilityPosition || !fromPosition || liabilityPosition.borrowed <= 0n) {
      throw new Error(`Positions not found or liability is 0. Liability vault: ${swapQuote.receiver}, From vault: ${swapQuote.vaultIn}, Account: ${swapQuote.accountOut}`)
    }

    const isMax = liabilityPosition.borrowed <= BigInt(swapQuote.amountOutMin)
    const maxWithdraw = fromPosition.assets
    // Build EVC batch items
    const batchItems = this.encodeRepayWithSwap({
      chainId: account.chainId,
      swapQuote,
      maxWithdraw,
      isMax,
      disableControllerOnMax: true,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planSwapCollateral(args: PlanSwapCollateralArgs): TransactionPlanItem[] {
    const { swapQuote, account } = args
    const plan: TransactionPlanItem[] = []

    // Check if source collateral needs to be disabled (when all is swapped)
    // Default: when position is not available, assume amounts are zero, so we don't disable collateral
    const sourcePosition = account?.getPosition(swapQuote.accountIn, swapQuote.vaultIn)

    const isMax = sourcePosition ? sourcePosition.assets <= BigInt(swapQuote.amountIn) : false

    // Check if destination collateral needs to be enabled
    // Default: collateral is not enabled when account/sub-account is not available
    const enableCollateral = !(account?.isCollateralEnabled(swapQuote.accountOut, swapQuote.receiver) ?? false)

    // Build EVC batch items
    const batchItems = this.encodeSwapCollateral({
      chainId: account.chainId,
      swapQuote,
      enableCollateral,
      disableCollateralOnMax: true,
      isMax,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planSwapDebt(args: PlanSwapDebtArgs): TransactionPlanItem[] {
    const { swapQuote, account } = args
    const plan: TransactionPlanItem[] = []

    const sourcePosition = account?.getPosition(swapQuote.accountIn, swapQuote.vaultIn)

    const isMax = sourcePosition ? sourcePosition.borrowed <= BigInt(swapQuote.amountOutMin) : false

    const enableController = !(account?.isControllerEnabled(swapQuote.accountOut, swapQuote.vaultIn) ?? false)

    // Build EVC batch items
    const batchItems = this.encodeSwapDebt({
      chainId: account.chainId,
      swapQuote,
      enableController,
      disableControllerOnMax: true,
      isMax,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planTransfer(args: PlanTransferArgs): TransactionPlanItem[] {
    const { vault, to, amount, from, account, enableCollateralTo, disableCollateralFrom } = args
    const plan: TransactionPlanItem[] = []

    // Build EVC batch items
    const batchItems = this.encodeTransfer({
      chainId: account.chainId,
      vault,
      to,
      amount,
      from,
      enableCollateralTo: enableCollateralTo && !(account?.isCollateralEnabled(to, vault) ?? false),
      disableCollateralFrom: disableCollateralFrom && (account?.isCollateralEnabled(from, vault) ?? false),
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planPullDebt(args: PlanPullDebtArgs): TransactionPlanItem[] {
    const { vault, amount, from, to, account } = args
    const plan: TransactionPlanItem[] = []

    const enableController = !(account?.isControllerEnabled(to, vault) ?? false)

    // Build EVC batch items
    const batchItems = this.encodePullDebt({
      chainId: account.chainId,
      vault,
      amount,
      from,
      to,
      enableController,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  /**
   * Plans a multiply/leverage operation with swap.
   * Used when liability asset and long asset are different and require a swap.
   */
  planMultiplyWithSwap(args: PlanMultiplyWithSwapArgs): TransactionPlanItem[] {
    const {
      collateralVault,
      collateralAmount,
      collateralAsset,
      account,
      swapQuote,
    } = args
    const plan: TransactionPlanItem[] = []

    // 1. Check if collateral approval is needed (only if depositing collateral)
    if (collateralAmount > 0n) {
      // Add approval requirement (will be resolved later with Wallet data)
      plan.push({
        type: "requiredApproval",
        token: collateralAsset,
        owner: account.owner,
        spender: collateralVault,
        amount: collateralAmount,
      })
    }
    if (swapQuote.accountIn !== swapQuote.accountOut) {
      throw new Error("Account in and account out must be the same")
    }
    const receiver = swapQuote.accountIn
    const liabilityVault = swapQuote.vaultIn
    const longVault = swapQuote.receiver
    const liabilityAmount = BigInt(swapQuote.amountIn)

    // 2. Determine if collateral needs to be enabled
    const enableCollateral = collateralAmount > 0n && !(account?.isCollateralEnabled(receiver, collateralVault) ?? false)

    // 3. Determine if controller needs to be enabled
    const enableController = !(account?.isControllerEnabled(receiver, liabilityVault) ?? false)

    // 4. Get current controller (may need to disable if different)
    const currentController = account?.getCurrentController(receiver)

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
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  /**
   * Plans a multiply/leverage operation with same asset.
   * Used when liability asset and long asset are the same (no swap needed).
   */
  planMultiplySameAsset(args: PlanMultiplySameAssetArgs): TransactionPlanItem[] {
    const {
      collateralVault,
      collateralAmount,
      collateralAsset,
      liabilityVault,
      liabilityAmount,
      longVault,
      receiver,
      account,
    } = args
    const plan: TransactionPlanItem[] = []

    // 1. Check if collateral approval is needed (only if depositing collateral)
    if (collateralAmount > 0n) {
      // Add approval requirement (will be resolved later with Wallet data)
      plan.push({
        type: "requiredApproval",
        token: collateralAsset,
        owner: account.owner,
        spender: collateralVault,
        amount: collateralAmount,
      })
    }

    // 2. Determine if collateral needs to be enabled
    const enableCollateral = collateralAmount > 0n && !(account?.isCollateralEnabled(receiver, collateralVault) ?? false)

    // 3. Determine if controller needs to be enabled
    const enableController = !(account?.isControllerEnabled(receiver, liabilityVault) ?? false)

    // 4. Get current controller (may need to disable if different)
    const currentController = account?.getCurrentController(receiver)

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
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }
}