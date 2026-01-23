import { encodeFunctionData, getAddress, Hex, maxUint256, type Address, zeroAddress, maxUint160, maxUint48, TypedDataDefinition } from "viem";
import { DeploymentService } from "../deploymentService/index.js";
import { executionAbis } from "./executionAbis.js";
import type { Account, AccountPosition, SubAccount } from "../../entities/Account.js";
import {
  type EVCBatchItem,
  type EncodeDepositArgs,
  type EncodeMintArgs,
  type EncodeWithdrawArgs,
  type EncodeRedeemArgs,
  type EncodeBorrowArgs,
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
  type PlanRepayFromWalletArgs,
  type PlanRepayFromDepositArgs,
  type PlanRepayWithSwapArgs,
  type PlanSwapCollateralArgs,
  type PlanSwapDebtArgs,
  type PlanTransferArgs,
  type PlanPullDebtArgs,
} from "./executionServiceTypes.js";

export interface IExecutionService {
  encodeDeposit(args: EncodeDepositArgs): EVCBatchItem[];
  encodeMint(args: EncodeMintArgs): EVCBatchItem[];
  encodeWithdraw(args: EncodeWithdrawArgs): EVCBatchItem[];
  encodeRedeem(args: EncodeRedeemArgs): EVCBatchItem[];
  encodeBorrow(args: EncodeBorrowArgs): EVCBatchItem[];
  encodePullDebt(args: EncodePullDebtArgs): EVCBatchItem[];
  encodeRepayFromWallet(args: EncodeRepayFromWalletArgs): EVCBatchItem[];
  encodeRepayFromDeposit(args: EncodeRepayFromDepositArgs): Promise<EVCBatchItem[]>;
  encodeRepayWithSwap(args: EncodeRepayWithSwapArgs): EVCBatchItem[];
  encodeSwapCollateral(args: EncodeSwapCollateralArgs): EVCBatchItem[];
  encodeSwapDebt(args: EncodeSwapDebtArgs): EVCBatchItem[];
  encodeTransfer(args: EncodeTransferArgs): EVCBatchItem[];
  // Transaction plan functions
  planDeposit(args: PlanDepositArgs): TransactionPlanItem[];
  planMint(args: PlanMintArgs): TransactionPlanItem[];
  planWithdraw(args: PlanWithdrawArgs): TransactionPlanItem[];
  planRedeem(args: PlanRedeemArgs): TransactionPlanItem[];
  planBorrow(args: PlanBorrowArgs): TransactionPlanItem[];
  planRepayFromWallet(args: PlanRepayFromWalletArgs): TransactionPlanItem[];
  planRepayFromDeposit(args: PlanRepayFromDepositArgs): Promise<TransactionPlanItem[]>;
  planRepayWithSwap(args: PlanRepayWithSwapArgs): TransactionPlanItem[];
  planSwapCollateral(args: PlanSwapCollateralArgs): TransactionPlanItem[];
  planSwapDebt(args: PlanSwapDebtArgs): TransactionPlanItem[];
  planTransfer(args: PlanTransferArgs): TransactionPlanItem[];
  planPullDebt(args: PlanPullDebtArgs): TransactionPlanItem[];
}

const PERMIT2_SIG_WINDOW = 60n * 60n

// TODO explain how this service is coupled to the concrete abis of ERC4626, permit2 and EVK. 
// this is a helper service, not a generic one.
export class ExecutionService implements IExecutionService {
  constructor(
    private readonly deploymentService: DeploymentService,
  ) {}

  encodeBatch(items: EVCBatchItem[]): Hex {
    return encodeFunctionData({
      abi: executionAbis.batchAbi,
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
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: zeroAddress,
        data: encodeFunctionData({
          abi: executionAbis.enableCollateralAbi,
          functionName: "enableCollateral",
          args: [receiver, vault]
        })
      })
    }

    // Add deposit operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: owner,
      value: amount,
      data: encodeFunctionData({
        abi: executionAbis.depositAbi,
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
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: zeroAddress,
        data: encodeFunctionData({
          abi: executionAbis.enableCollateralAbi,
          functionName: "enableCollateral",
          args: [receiver, vault]
        })
      })
    }

    // Add mint operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: receiver,
      data: encodeFunctionData({
        abi: executionAbis.mintAbi,
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
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: owner,
        data: encodeFunctionData({
          abi: executionAbis.disableCollateralAbi,
          functionName: "disableCollateral",
          args: [owner, vault]
        })
      })
    }

    // Add withdraw operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: owner,
      data: encodeFunctionData({
        abi: executionAbis.withdrawAbi,
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
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: owner,
        data: encodeFunctionData({
          abi: executionAbis.disableCollateralAbi,
          functionName: "disableCollateral",
          args: [owner, vault]
        })
      })
    }

    // Add redeem operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: owner,
      data: encodeFunctionData({
        abi: executionAbis.redeemAbi,
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
      account,
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
        receiver: account,
        enableCollateral,
        permit2: collateralPermit2,
        owner: account,
      })
      items.push(...depositItems)
    }

    // Add disable controller if there's a different controller enabled
    if (currentController && currentController !== vault) {
      items.push({
        targetContract: currentController,
        onBehalfOfAccount: account,
        data: encodeFunctionData({
          abi: executionAbis.disableControllerAbi,
          functionName: "disableController",
          args: [account]
        })
      })
    }

    if (enableController) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: zeroAddress,
        data: encodeFunctionData({
          abi: executionAbis.enableControllerAbi,
          functionName: "enableController",
          args: [account, vault]
        })
      })
    }

    // Add borrow operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: account,
      data: encodeFunctionData({
        abi: executionAbis.borrowAbi,
        functionName: "borrow",
        args: [amount, receiver]
      })
    })

    return items
  }

  encodePullDebt({ chainId, vault, amount, from, enableController }: EncodePullDebtArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add enable controller if flag is set
    if (enableController) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: zeroAddress,
        data: encodeFunctionData({
          abi: executionAbis.enableControllerAbi,
          functionName: "enableController",
          args: [from, vault]
        })
      })
    }

    // Add pullDebt operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: from,
      data: encodeFunctionData({
        abi: executionAbis.pullDebtAbi,
        functionName: "pullDebt",
        args: [amount, from]
      })
    })

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
      data: encodeFunctionData({
        abi: executionAbis.repayAbi,
        functionName: "repay",
        args: [liabilityAmount, receiver],
      }),
    })

    // Disable controller if needed (for max repay)
    // Sender must be allowed to act on behalf of receiver (sender is subaccount of receiver or is an operator)
    if (disableControllerOnMax && isMax) {
      items.push({
        targetContract: liabilityVault,
        onBehalfOfAccount: receiver,
        data: encodeFunctionData({
          abi: executionAbis.disableControllerAbi,
          functionName: "disableController",
          args: [receiver],
        }),
      })
    }

    return items
  }

  /**
   * Encodes batch items for repaying debt from a deposit.
   * Supports multiple scenarios:
   * 1. Same asset, same vault - use repayWithShares
   * 2. Same asset, different vault - withdraw and repay
   */
  async encodeRepayFromDeposit(args: EncodeRepayFromDepositArgs): Promise<EVCBatchItem[]> {
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
      data: encodeFunctionData({
        abi: executionAbis.withdrawAbi,
        functionName: "withdraw",
        args: [withdrawAmount, swapQuote.swap.swapperAddress, swapQuote.accountIn],
      }),
    })

    // 2. Execute swap multicall
    items.push({
      targetContract: swapQuote.swap.swapperAddress,
      onBehalfOfAccount: swapQuote.accountIn,
      data: swapQuote.swap.swapperData,
    })

    // 3. Verify swap and repay (verifyDebtMax handles the repay)
    if (swapQuote.verify.type !== "debtMax") {
      throw new Error("Invalid swap quote type for repay - must be debtMax")
    }

    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      data: swapQuote.verify.verifierData,
    })

    // 4. Disable controller if needed (for max repay)
    if (isMax && disableControllerOnMax) {
        items.push({
          targetContract: swapQuote.receiver,
          onBehalfOfAccount: swapQuote.accountOut,
          data: encodeFunctionData({
            abi: executionAbis.disableControllerAbi,
            functionName: "disableController",
            args: [swapQuote.accountOut],
          }),
        })
    }

    return items
  }

  /**
   * Encodes batch items for swapping collateral from one vault to another.
   * Make sure the swap quote comes from swapService.getSwapCollateralQuotes() or follows the same structure.
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
    const deployment = this.deploymentService.getDeployment(chainId)
    const evc = deployment.addresses.coreAddrs.evc

    // 1. Withdraw from source vault to swapper
    const withdrawAmount = BigInt(swapQuote.amountInMax || swapQuote.amountIn)
    items.push({
      targetContract: swapQuote.vaultIn,
      onBehalfOfAccount: swapQuote.accountIn,
      data: encodeFunctionData({
        abi: executionAbis.withdrawAbi,
        functionName: "withdraw",
        args: [withdrawAmount, swapQuote.swap.swapperAddress, swapQuote.accountIn]
      })
    })

    // 2. Execute swap multicall
    items.push({
      targetContract: swapQuote.swap.swapperAddress,
      onBehalfOfAccount: swapQuote.accountIn,
      data: swapQuote.swap.swapperData
    })

    // 3. Verify swap and skim
    if (swapQuote.verify.type !== "skimMin") {
      throw new Error("Invalid swap quote type for swap collateral - must be skimMin")
    }
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      data: swapQuote.verify.verifierData
    })

    // 4. Disable collateral if needed (for max swap)
    if(isMax && disableCollateralOnMax) {
      items.push({
        targetContract: evc,
        onBehalfOfAccount: zeroAddress,
        data: encodeFunctionData({
          abi: executionAbis.disableCollateralAbi,
          functionName: "disableCollateral",
          args: [swapQuote.accountIn, swapQuote.vaultIn],
        }),
      })
    }

    // 5. Enable collateral if needed
    if (enableCollateral) {
      items.push({
        targetContract: evc,
        onBehalfOfAccount: zeroAddress,
        data: encodeFunctionData({
          abi: executionAbis.enableCollateralAbi,
          functionName: "enableCollateral",
          args: [swapQuote.accountOut, swapQuote.receiver]
        })
      })
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
    const deployment = this.deploymentService.getDeployment(chainId)
    const evc = deployment.addresses.coreAddrs.evc
    // 1. Borrow from source vault
    const borrowAmount = BigInt(swapQuote.amountIn)
    items.push({
      targetContract: swapQuote.vaultIn,
      onBehalfOfAccount: swapQuote.accountIn,
      data: encodeFunctionData({
        abi: executionAbis.borrowAbi,
        functionName: "borrow",
        args: [borrowAmount, swapQuote.swap.swapperAddress]
      })
    })

    // 2. Execute swap multicall
    items.push({
      targetContract: swapQuote.swap.swapperAddress,
      onBehalfOfAccount: swapQuote.accountIn,
      data: swapQuote.swap.swapperData
    })

    // 3. Verify swap and skim
    if (swapQuote.verify.type !== "debtMax") {
      throw new Error("Invalid swap quote type for repay - must be debtMax")
    }
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      data: swapQuote.verify.verifierData
    })

    if (swapQuote.accountOut !== swapQuote.accountIn) {
      // 4. Disable controller if needed (for max swap)
      if (isMax && disableControllerOnMax) {
        items.push({
          targetContract: swapQuote.vaultIn,
          onBehalfOfAccount: swapQuote.accountIn,
          data: encodeFunctionData({
            abi: executionAbis.disableControllerAbi,
            functionName: "disableController",
            args: [swapQuote.accountIn],
          }),
        })
      }

      // 5. Enable controller if needed
      if (enableController) {
        items.push({
          targetContract: evc,
          onBehalfOfAccount: zeroAddress,
          data: encodeFunctionData({
            abi: executionAbis.enableControllerAbi,
            functionName: "enableController",
            args: [swapQuote.accountOut],
          }),
        })
      }
    }

    return items
  }

  encodeTransfer({ chainId, vault, to, amount, from, enableCollateralTo, disableCollateralFrom }: EncodeTransferArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add disable collateral from sender if flag is set
    if (disableCollateralFrom) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: from,
        data: encodeFunctionData({
          abi: executionAbis.disableCollateralAbi,
          functionName: "disableCollateral",
          args: [from, vault]
        })
      })
    }

    // Add transfer operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: from,
      data: encodeFunctionData({
        abi: executionAbis.transferAbi,
        functionName: "transfer",
        args: [to, amount]
      })
    })

    // Add enable collateral to receiver if flag is set
    if (enableCollateralTo) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: zeroAddress,
        data: encodeFunctionData({
          abi: executionAbis.enableCollateralAbi,
          functionName: "enableCollateral",
          args: [to, vault]
        })
      })
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
      data: encodeFunctionData({
        abi: executionAbis.permit2Abi,
        functionName: "permit",
        args: [owner, message, signature],
      }),
    }
  }
 // TODO add example usage with wagmi
  getPermit2TypedData(args: GetPermit2TypedDataArgs): TypedDataDefinition<typeof PERMIT2_TYPES, "PermitSingle"> {
    const nowInSeconds = () => BigInt(Math.floor(Date.now() / 1000))

    const {
      chainId,
      token,
      amount,
      spender,
      nonce,
      sigDeadline,
    } = args
    const deployment = this.deploymentService.getDeployment(chainId)
    const permit2 = deployment.addresses.coreAddrs.permit2

    const permitSingle = {
      details: {
        token,
        amount: amount > maxUint160 ? maxUint160 : amount,
        expiration: Number(maxUint48),
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
      message: permitSingle,
    }
  }

  /**
   * Encodes batch items for repaying with shares from the same asset and vault
   */
  private encodeRepayWithSharesSameAssetAndVault({
    vault,
    amount,
    from,
    receiver,
    disableController,
  }: {
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
      data: encodeFunctionData({
        abi: executionAbis.repayWithSharesAbi,
        functionName: "repayWithShares",
        args: [amount, receiver],
      }),
    })

    // Disable controller if needed (for max repay)
    if (disableController) {
      items.push({
        targetContract: vault,
        onBehalfOfAccount: receiver,
        data: encodeFunctionData({
          abi: executionAbis.disableControllerAbi,
          functionName: "disableController",
          args: [receiver],
        }),
      })

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
        data: encodeFunctionData({
          abi: executionAbis.withdrawAbi,
          functionName: "withdraw",
          args: [amountWithExtra, toVault, from],
        }),
      })

      // 2. Skim exact withdrawal amount to liability vault
      items.push({
        targetContract: toVault,
        onBehalfOfAccount: from,
        data: encodeFunctionData({
          abi: executionAbis.skimAbi,
          functionName: "skim",
          args: [amountWithExtra, receiver],
        }),
      })

      // 3. Repay with shares (max)
      items.push({
        targetContract: toVault,
        onBehalfOfAccount: receiver,
        data: encodeFunctionData({
          abi: executionAbis.repayWithSharesAbi,
          functionName: "repayWithShares",
          // max is ok now, because skim deposited exact amount and it is the full debt,
          // so pre-existing balance will not be consumed
          args: [maxUint256, receiver],
        }),
      })

      // 4. Disable controller if needed
      if (disableControllerOnMax) {
        items.push({
          targetContract: toVault,
          onBehalfOfAccount: receiver,
          data: encodeFunctionData({
            abi: executionAbis.disableControllerAbi,
            functionName: "disableController",
            args: [receiver],
          }),
        })
      }
    } else {
      // For partial repay: withdraw, then repay exact amount
      // 1. Withdraw from collateral vault
      items.push({
        targetContract: fromVault,
        onBehalfOfAccount: from,
        data: encodeFunctionData({
          abi: executionAbis.withdrawAbi,
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

  // ========== Helper functions for transaction plans ==========

  /**
   * Gets the sub-account for a given account address from the Account entity
   */
  private getSubAccount(account: Account, accountAddress: Address): SubAccount | undefined {
    return account.subAccounts.find(sub => getAddress(sub.account) === getAddress(accountAddress))
  }

  /**
   * Gets the position for a given vault and account address
   */
  private getPosition(account: Account, accountAddress: Address, vault: Address): AccountPosition | undefined {
    const subAccount = this.getSubAccount(account, accountAddress)
    if (!subAccount) return undefined
    return subAccount.positions.find(pos => getAddress(pos.vault) === getAddress(vault))
  }

  /**
   * Checks if a vault is enabled as collateral for an account
   */
  private isCollateralEnabled(account: Account, accountAddress: Address, vault: Address): boolean {
    const subAccount = this.getSubAccount(account, accountAddress)
    if (!subAccount) return false
    return subAccount.enabledCollaterals.some(coll => getAddress(coll) === getAddress(vault))
  }

  /**
   * Checks if a vault is enabled as controller for an account
   */
  private isControllerEnabled(account: Account, accountAddress: Address, vault: Address): boolean {
    const subAccount = this.getSubAccount(account, accountAddress)
    if (!subAccount) return false
    return subAccount.enabledControllers.some(ctrl => getAddress(ctrl) === getAddress(vault))
  }

  /**
   * Gets the current controller for an account (there can only be one)
   */
  private getCurrentController(account: Account, accountAddress: Address): Address | undefined {
    const subAccount = this.getSubAccount(account, accountAddress)
    if (!subAccount || subAccount.enabledControllers.length === 0) return undefined
    return subAccount.enabledControllers[0]
  }

  /**
   * Determines if an approval is needed and whether to use permit2 or regular approval
   * Returns an empty array if no approval is needed, or an array of items (approval + permit2 if both needed)
   */
  private determineApproval(
    account: Account,
    accountAddress: Address,
    token: Address,
    vault: Address,
    amount: bigint,
    usePermit2: boolean = true,
    unlimitedApproval: boolean = true
  ): (ApproveCall | Permit2DataToSign)[] {
    const position = this.getPosition(account, accountAddress, vault)
    const deployment = this.deploymentService.getDeployment(account.chainId)
    const permit2 = deployment.addresses.coreAddrs.permit2

    const allowanceToSet = unlimitedApproval ? maxUint160 : amount

    // If position is not found, assume approval is needed
    if (!position) {
      if (usePermit2) {
        // Check if permit2 is disabled for this account
        const subAccount = this.getSubAccount(account, accountAddress)
        if (subAccount?.isPermitDisabledMode) {
          // Fall back to regular approval
          return [{
            type: "approve",
            token,
            spender: vault,
            amount: allowanceToSet,
          }]
        }
        // Without position data, we can't know if assetForPermit2 is sufficient
        // Assume both approval and permit2 signature are needed
        return [
          {
            type: "approve",
            token,
            spender: permit2,
            amount: allowanceToSet,
          },
          {
            type: "permit2",
            token,
            amount: allowanceToSet,
            spender: vault, // Spender is the vault that receives the allowance
          },
        ]
      } else {
        // Regular approval
        return [{
          type: "approve",
          token,
          spender: vault,
          amount: allowanceToSet,
        }]
      }
    }

    if (usePermit2) {
      // Check if permit2 is disabled for this account
      const subAccount = this.getSubAccount(account, accountAddress)
      // If sub-account is not found, assume permit2 is allowed (default behavior)
      if (subAccount?.isPermitDisabledMode) {
        // Fall back to regular approval
        return [{
          type: "approve",
          token,
          spender: vault,
          amount: allowanceToSet,
        }]
      }

      // Check permit2 allowances
      // assetForPermit2: allowance from user wallet to permit2 contract (doesn't expire)
      // assetForVaultInPermit2: allowance from permit2 to vault (set by signature, can expire)
      const assetForPermit2 = position.allowances.assetForPermit2
      const assetForVaultInPermit2 = position.allowances.assetForVaultInPermit2
      const permit2ExpirationTime = position.allowances.permit2ExpirationTime

      // Check if permit2 signature has expired
      const currentTime = Math.floor(Date.now() / 1000) // Current time in seconds
      const isPermit2Expired = permit2ExpirationTime > 0 && currentTime >= permit2ExpirationTime

      // Check if both allowances are sufficient and signature is not expired
      const hasSufficientPermit2Allowance = assetForPermit2 >= amount
      const hasSufficientVaultAllowance = assetForVaultInPermit2 >= amount && !isPermit2Expired

      // If both are sufficient, no approval needed
      if (hasSufficientPermit2Allowance && hasSufficientVaultAllowance) {
        return []
      }

      // If assetForPermit2 is insufficient, we need both approval and permit2 signature
      if (!hasSufficientPermit2Allowance) {
        return [
          {
            type: "approve",
            token,
            spender: permit2,
            amount: unlimitedApproval ? maxUint256 : amount,
          },
          {
            type: "permit2",
            token,
            amount: allowanceToSet,
            spender: vault, // Spender is the vault that receives the allowance
          },
        ]
      }

      // assetForPermit2 is sufficient, but vault allowance is insufficient or expired
      // Only need permit2 signature (approval already exists)
      return [{
        type: "permit2",
        token,
        amount: allowanceToSet,
        spender: vault, // Spender is the vault that receives the allowance
      }]
    } else {
      // Regular approval (non-permit2 path)
      // Check if we have sufficient direct vault allowance
      const needsDirectApproval = position.allowances.assetForVault < amount
      if (!needsDirectApproval) return []

      // Regular approval needed
      return [{
        type: "approve",
        token,
        spender: vault,
        amount: unlimitedApproval ? maxUint256 : amount,
      }]
    }
  }

  // ========== Transaction plan functions ==========

  planDeposit(args: PlanDepositArgs): TransactionPlanItem[] {
    const { chainId, vault, amount, receiver, account, usePermit2, unlimitedApproval = true } = args
    const plan: TransactionPlanItem[] = []

    // Get position to determine asset and check if collateral is enabled
    const position = this.getPosition(account, receiver, vault)
    if (!position) {
      throw new Error(`Position not found for vault ${vault} and account ${receiver}`)
    }

    const asset = position.asset
    const isCollateralEnabled = this.isCollateralEnabled(account, receiver, vault)

    // Check if approval is needed (deposit from wallet needs token approval)
    const approval = this.determineApproval(account, receiver, asset, vault, amount, usePermit2, unlimitedApproval)
    if (approval.length > 0) {
      plan.push(...approval)
    }

    // Build EVC batch items
    const batchItems = this.encodeDeposit({
      chainId,
      vault,
      amount,
      receiver,
      owner: receiver,
      enableCollateral: !isCollateralEnabled,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planMint(args: PlanMintArgs): TransactionPlanItem[] {
    const { chainId, vault, shares, receiver, account, usePermit2, unlimitedApproval = true } = args
    const plan: TransactionPlanItem[] = []

    // Get position to determine asset and check if collateral is enabled
    const position = this.getPosition(account, receiver, vault)
    if (!position) {
      throw new Error(`Position not found for vault ${vault} and account ${receiver}`)
    }

    const asset = position.asset
    const isCollateralEnabled = this.isCollateralEnabled(account, receiver, vault)

    // Check if approval is needed (mint from wallet needs token approval)
    // For mint, we need the asset amount. We'll use a conservative estimate based on shares
    // In practice, you'd query the vault's convertToAssets(shares) to get the exact amount
    // For now, we'll use shares as a proxy (this may overestimate, but that's safer)
    const estimatedAssetAmount = shares // This should be convertToAssets(shares) in practice
    const approval = this.determineApproval(account, receiver, asset, vault, estimatedAssetAmount, usePermit2, unlimitedApproval)
    if (approval.length > 0) {
      plan.push(...approval)
    }

    // Build EVC batch items
    const batchItems = this.encodeMint({
      chainId,
      vault,
      shares,
      receiver,
      owner: receiver,
      enableCollateral: !isCollateralEnabled,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planWithdraw(args: PlanWithdrawArgs): TransactionPlanItem[] {
    const { chainId, vault, assets, receiver, account } = args
    const plan: TransactionPlanItem[] = []

    // Get position to check collateral state
    const position = this.getPosition(account, receiver, vault)
    if (!position) {
      throw new Error(`Position not found for vault ${vault} and account ${receiver}`)
    }

    // Check if we're withdrawing all collateral (disable if so)
    // We disable collateral when all assets are withdrawn
    const willHaveNoCollateral = position.assets <= assets
    const disableCollateral = willHaveNoCollateral && position.isCollateral

    // Build EVC batch items
    const batchItems = this.encodeWithdraw({
      chainId,
      vault,
      assets,
      receiver,
      owner: receiver,
      disableCollateral,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planRedeem(args: PlanRedeemArgs): TransactionPlanItem[] {
    const { chainId, vault, shares, receiver, account } = args
    const plan: TransactionPlanItem[] = []

    // Get position to check collateral state
    const position = this.getPosition(account, receiver, vault)
    if (!position) {
      throw new Error(`Position not found for vault ${vault} and account ${receiver}`)
    }

    // Check if we're redeeming all collateral (disable if so)
    // We disable collateral when all shares are redeemed
    const willHaveNoCollateral = position.shares <= shares
    const disableCollateral = willHaveNoCollateral && position.isCollateral

    // Build EVC batch items
    const batchItems = this.encodeRedeem({
      chainId,
      vault,
      shares,
      receiver,
      owner: receiver,
      disableCollateral,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planBorrow(args: PlanBorrowArgs): TransactionPlanItem[] {
    const { chainId, vault, amount, receiver, account, collateralVault, collateralAmount, usePermit2, unlimitedApproval = true } = args
    const plan: TransactionPlanItem[] = []

    // Get receiver sub-account
    const receiverSubAccount = this.getSubAccount(account, receiver)
    if (!receiverSubAccount) {
      throw new Error(`Sub-account not found for ${receiver}`)
    }

    // Check if collateral needs to be enabled
    let enableCollateral = false
    if (collateralVault && collateralAmount !== undefined && collateralAmount > 0n) {
      enableCollateral = !this.isCollateralEnabled(account, receiver, collateralVault)
    }

    // Check if controller needs to be enabled
    const currentController = this.getCurrentController(account, receiver)
    const enableController = !this.isControllerEnabled(account, receiver, vault)

    // If there's a different controller, it will be disabled in encodeBorrow
    // Only one controller can be enabled at a time

    // Check if approval is needed for collateral deposit
    // Collateral is deposited from wallet, so we need approval from the account owner
    // Note: encodeBorrow's encodeDeposit uses account (receiver) as owner, which works
    // because EVC allows accounts to act on behalf of themselves. The actual tokens
    // come from the wallet via permit2 or existing allowance from account.owner.
    let collateralApproval: (ApproveCall | Permit2DataToSign)[]
    if (collateralVault && collateralAmount !== undefined && collateralAmount > 0n) {
      // Get the asset address from the collateral vault position
      // If position doesn't exist yet, we'd need to fetch it from the vault service
      // For now, we'll try to get it from a position if it exists
      const collateralPosition = this.getPosition(account, receiver, collateralVault)
      const asset = collateralPosition?.asset
      
      if (asset) {
        // Approval is needed from the account owner (who owns the wallet tokens)
        // We check approval for the account owner -> vault
        collateralApproval = this.determineApproval(
          account,
          account.owner, // Tokens come from owner's wallet
          asset,
          collateralVault,
          collateralAmount,
          usePermit2,
          unlimitedApproval
        )
        if (collateralApproval.length > 0) {
          plan.push(...collateralApproval)
        }
      } else {
        // If position doesn't exist, we can't determine the asset address
        // In practice, you'd need to fetch it from the vault service
        // For now, we'll skip the approval check (user will need to handle this manually)
      }
    }

    // Build EVC batch items
    // encodeBorrow uses account as both owner and receiver for the deposit
    // This works because EVC allows the account to act on behalf of itself
    // The actual tokens come from the wallet via permit2 or existing allowance
    const batchItems = this.encodeBorrow({
      chainId,
      vault,
      amount,
      account: receiver,
      receiver,
      enableController,
      currentController: currentController || undefined,
      enableCollateral,
      collateralVault,
      collateralAmount,
      // Permit2 is handled separately in the plan - we don't pass it here
      // Note: encodeBorrow would need to be updated to support owner parameter
      // for wallet deposits, or we handle permit2 separately
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planRepayFromWallet(args: PlanRepayFromWalletArgs): TransactionPlanItem[] {
    const { chainId, liabilityVault, liabilityAmount, receiver, account, isMax = false, usePermit2, unlimitedApproval = true } = args
    const plan: TransactionPlanItem[] = []

    // Get position to determine asset
    const position = this.getPosition(account, receiver, liabilityVault)
    if (!position) {
      throw new Error(`Position not found for vault ${liabilityVault} and account ${receiver}`)
    }

    const asset = position.asset

    // Check if approval is needed (repay from wallet needs token approval)
    const approval = this.determineApproval(account, receiver, asset, liabilityVault, liabilityAmount, usePermit2, unlimitedApproval)
    if (approval.length > 0) {
      plan.push(...approval)
    }

    // Determine if controller should be disabled (only when full debt is repaid)
    const disableControllerOnMax = isMax

    // Build EVC batch items
    const batchItems = this.encodeRepayFromWallet({
      chainId,
      sender: receiver,
      liabilityVault,
      liabilityAmount,
      receiver,
      disableControllerOnMax,
      isMax,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  async planRepayFromDeposit(args: PlanRepayFromDepositArgs): Promise<TransactionPlanItem[]> {
    const { chainId, liabilityVault, liabilityAmount, receiver, fromVault, account, isMax = false, usePermit2, unlimitedApproval = true } = args
    const plan: TransactionPlanItem[] = []

    // Get positions
    const liabilityPosition = this.getPosition(account, receiver, liabilityVault)
    const fromPosition = this.getPosition(account, receiver, fromVault)

    if (!liabilityPosition) {
      throw new Error(`Position not found for vault ${liabilityVault} and account ${receiver}`)
    }
    if (!fromPosition) {
      throw new Error(`Position not found for vault ${fromVault} and account ${receiver}`)
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
      // Check if approval is needed for repay
      const approval = this.determineApproval(account, receiver, liabilityAsset, liabilityVault, liabilityAmount, usePermit2, unlimitedApproval)
      if (approval.length > 0) {
        plan.push(...approval)
      }
    }

    // Determine if controller should be disabled (only when full debt is repaid)
    const disableControllerOnMax = isMax

    // Build EVC batch items
    const batchItems = await this.encodeRepayFromDeposit({
      chainId,
      liabilityVault,
      liabilityAsset,
      liabilityAmount,
      from: receiver,
      receiver,
      fromVault,
      fromAsset,
      disableControllerOnMax,
      isMax,
      // Permit2 is handled separately in the plan
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planRepayWithSwap(args: PlanRepayWithSwapArgs): TransactionPlanItem[] {
    const { swapQuote, maxWithdraw, isMax = false, account } = args
    const plan: TransactionPlanItem[] = []

    // Determine if controller should be disabled (only when full debt is repaid)
    const disableControllerOnMax = isMax

    // Build EVC batch items
    const batchItems = this.encodeRepayWithSwap({
      swapQuote,
      maxWithdraw,
      isMax,
      disableControllerOnMax,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planSwapCollateral(args: PlanSwapCollateralArgs): TransactionPlanItem[] {
    const { chainId, swapQuote, account, isMax = false } = args
    const plan: TransactionPlanItem[] = []

    // Check if source collateral needs to be disabled (when all is swapped)
    const sourcePosition = this.getPosition(account, swapQuote.accountIn, swapQuote.vaultIn)
    const disableCollateralOnMax = isMax && sourcePosition?.isCollateral === true

    // Check if destination collateral needs to be enabled
    const enableCollateral = !this.isCollateralEnabled(account, swapQuote.accountOut, swapQuote.receiver)

    // Build EVC batch items
    const batchItems = this.encodeSwapCollateral({
      chainId,
      swapQuote,
      enableCollateral,
      disableCollateralOnMax,
      isMax,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planSwapDebt(args: PlanSwapDebtArgs): TransactionPlanItem[] {
    const { chainId, swapQuote, account, isMax = false } = args
    const plan: TransactionPlanItem[] = []

    // Check if source controller needs to be disabled (when all debt is swapped)
    const sourcePosition = this.getPosition(account, swapQuote.accountIn, swapQuote.vaultIn)
    const disableControllerOnMax = isMax && sourcePosition?.isController === true

    // Check if destination controller needs to be enabled
    // Note: swapDebt borrows from vaultIn and repays to vaultOut (which is the receiver)
    // The controller should be enabled on the account that will have the debt
    const enableController = swapQuote.accountOut !== swapQuote.accountIn && 
      !this.isControllerEnabled(account, swapQuote.accountOut, swapQuote.vaultIn)

    // Build EVC batch items
    const batchItems = this.encodeSwapDebt({
      chainId,
      swapQuote,
      enableController,
      disableControllerOnMax,
      isMax,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planTransfer(args: PlanTransferArgs): TransactionPlanItem[] {
    const { chainId, vault, to, amount, account } = args
    const plan: TransactionPlanItem[] = []

    // Get sender position
    const fromPosition = this.getPosition(account, account.owner, vault)
    if (!fromPosition) {
      throw new Error(`Position not found for vault ${vault} and account ${account.owner}`)
    }

    // Check if source collateral needs to be disabled (when all is transferred)
    // We disable collateral when all shares are transferred
    const willHaveNoCollateral = fromPosition.shares <= amount
    const disableCollateralFrom = willHaveNoCollateral && fromPosition.isCollateral

    // Check if destination collateral needs to be enabled
    const enableCollateralTo = !this.isCollateralEnabled(account, to, vault)

    // Build EVC batch items
    const batchItems = this.encodeTransfer({
      chainId,
      vault,
      to,
      amount,
      from: account.owner,
      enableCollateralTo,
      disableCollateralFrom,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }

  planPullDebt(args: PlanPullDebtArgs): TransactionPlanItem[] {
    const { chainId, vault, amount, account } = args
    const plan: TransactionPlanItem[] = []

    // Check if controller needs to be enabled
    const enableController = !this.isControllerEnabled(account, account.owner, vault)

    // Build EVC batch items
    const batchItems = this.encodePullDebt({
      chainId,
      vault,
      amount,
      from: account.owner,
      enableController,
    })

    plan.push({
      type: "evcBatch",
      items: batchItems,
    })

    return plan
  }
}