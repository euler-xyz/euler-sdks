import { encodeFunctionData, getAddress, Hex, maxUint256, type Address, zeroAddress, maxUint160, maxUint48, TypedDataDefinition } from "viem";
import { DeploymentService } from "../deploymentService/index.js";
import { executionAbis } from "./executionAbis.js";
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
}