import { encodeFunctionData, getAddress, Hex, type Address } from "viem";
import { DeploymentService } from "../deploymentService/index.js";
import { executionAbis } from "./executionAbis.js";
import type { SubAccount } from "../../entities/Account.js";
import type {
  EVCBatchItem,
  EncodeDepositBatchItemsArgs,
  EncodeMintBatchItemsArgs,
  EncodeWithdrawBatchItemsArgs,
  EncodeRedeemBatchItemsArgs,
  EncodeBorrowBatchItemsArgs,
  EncodeRepayBatchItemsArgs,
  EncodePullDebtBatchItemsArgs,
  EncodeRepayBatchItemsWithSwapArgs,
  EncodeSwapCollateralBatchItemsArgs,
  EncodeSwapDebtBatchItemsArgs,
  EncodeTransferBatchItemsArgs,
} from "./executionServiceTypes.js";

// Re-export all types
export type {
  EVCBatchItem,
  EncodeDepositBatchItemsArgs,
  EncodeMintBatchItemsArgs,
  EncodeWithdrawBatchItemsArgs,
  EncodeRedeemBatchItemsArgs,
  EncodeBorrowBatchItemsArgs,
  EncodeRepayBatchItemsArgs,
  EncodePullDebtBatchItemsArgs,
  EncodeRepayBatchItemsWithSwapArgs,
  EncodeSwapCollateralBatchItemsArgs,
  EncodeSwapDebtBatchItemsArgs,
  EncodeTransferBatchItemsArgs,
  SwapQuoteForBatch,
} from "./executionServiceTypes.js";

export interface IExecutionService {
  encodeDepositBatchItems(args: EncodeDepositBatchItemsArgs): EVCBatchItem[];
  encodeMintBatchItems(args: EncodeMintBatchItemsArgs): EVCBatchItem[];
  encodeWithdrawBatchItems(args: EncodeWithdrawBatchItemsArgs): EVCBatchItem[];
  encodeRedeemBatchItems(args: EncodeRedeemBatchItemsArgs): EVCBatchItem[];
  encodeBorrowBatchItems(args: EncodeBorrowBatchItemsArgs): EVCBatchItem[];
  encodeRepayBatchItems(args: EncodeRepayBatchItemsArgs): EVCBatchItem[];
  encodePullDebtBatchItems(args: EncodePullDebtBatchItemsArgs): EVCBatchItem[];
  encodeRepayBatchItemsWithSwap(args: EncodeRepayBatchItemsWithSwapArgs): EVCBatchItem[];
  encodeSwapCollateralBatchItems(args: EncodeSwapCollateralBatchItemsArgs): EVCBatchItem[];
  encodeSwapDebtBatchItems(args: EncodeSwapDebtBatchItemsArgs): EVCBatchItem[];
  encodeTransferBatchItems(args: EncodeTransferBatchItemsArgs): EVCBatchItem[];
}

// TODO explain how this service is coupled to the concrete abis of ERC4626, permit2 and EVK. 
// this is a helper service, not a generic one.
export class ExecutionService implements IExecutionService {
  constructor(private readonly deploymentService: DeploymentService) {}

  encodeBatch(items: EVCBatchItem[]): Hex {
    return encodeFunctionData({
      abi: executionAbis.batchAbi,
      functionName: "batch",
      args: [items]
    })
  }
  

  encodeDepositBatchItems({ chainId, vault, amount, receiver, enableCollateral }: EncodeDepositBatchItemsArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add enable collateral if flag is set
    if (enableCollateral) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: receiver,
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
      onBehalfOfAccount: receiver,
      value: amount,
      data: encodeFunctionData({
        abi: executionAbis.depositAbi,
        functionName: "deposit",
        args: [amount, receiver]
      })
    })

    return items
  }

  encodeMintBatchItems({ chainId, vault, shares, receiver, enableCollateral }: EncodeMintBatchItemsArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add enable collateral if flag is set
    if (enableCollateral) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: receiver,
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

  encodeWithdrawBatchItems({ chainId, vault, assets, receiver, owner, disableCollateral }: EncodeWithdrawBatchItemsArgs): EVCBatchItem[] {
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

  encodeRedeemBatchItems({ chainId, vault, shares, receiver, owner, disableCollateral }: EncodeRedeemBatchItemsArgs): EVCBatchItem[] {
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

  encodeBorrowBatchItems({
    chainId,
    vault,
    amount,
    receiver,
    subAccount,
    collateralVault,
    collateralAmount,
  }: EncodeBorrowBatchItemsArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []
    const account = subAccount?.account ?? receiver
    const borrowVaultAddress = getAddress(vault)

    // Add collateral deposit if provided
    if (collateralVault && collateralAmount !== undefined && collateralAmount > 0n) {
      // Determine if we need to enable collateral based on subAccount state
      let needsEnableCollateral = true
      if (subAccount) {
        const collateralVaultAddress = getAddress(collateralVault)
        const isCollateralEnabled = subAccount.enabledCollaterals.some(
          (collateral: Address) => getAddress(collateral) === collateralVaultAddress
        )
        needsEnableCollateral = !isCollateralEnabled
      }

      const depositItems = this.encodeDepositBatchItems({
        chainId,
        vault: collateralVault,
        amount: collateralAmount,
        receiver,
        enableCollateral: needsEnableCollateral,
      })
      items.push(...depositItems)
    }

    // Determine if we need to disable/enable controller
    let needsDisableController = false
    let currentController: Address | null = null
    let needsEnableController = true

    if (subAccount) {
      // There can be only one controller enabled per account
      const enabledControllers = subAccount.enabledControllers.map(getAddress)
      currentController = enabledControllers.length > 0 ? (enabledControllers[0] ?? null) : null
      needsDisableController = currentController !== null && getAddress(currentController) !== borrowVaultAddress
      needsEnableController = !enabledControllers.some((controller: Address) => getAddress(controller) === borrowVaultAddress)
    }

    // Add disable controller if there's a different controller enabled
    if (needsDisableController && currentController) {
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

    // Add enable controller if needed (default to true when subAccount is not provided)
    if (needsEnableController) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: account,
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

  encodeRepayBatchItems({ chainId, vault, amount, receiver, subAccount, disableController }: EncodeRepayBatchItemsArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []
    const account = subAccount?.account ?? receiver

    // Add disable controller if flag is set
    if (disableController && subAccount) {
      const enabledControllers = subAccount.enabledControllers.map(getAddress)
      const vaultAddress = getAddress(vault)
      const currentController = enabledControllers.find(
        (controller: Address) => getAddress(controller) === vaultAddress
      )
      
      if (currentController) {
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
    }

    // Add repay operation
    items.push({
      targetContract: vault,
      onBehalfOfAccount: receiver,
      data: encodeFunctionData({
        abi: executionAbis.repayAbi,
        functionName: "repay",
        args: [amount, receiver]
      })
    })

    return items
  }

  encodePullDebtBatchItems({ chainId, vault, amount, from, enableController }: EncodePullDebtBatchItemsArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // Add enable controller if flag is set
    if (enableController) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: from,
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
   * Encodes batch items for repaying debt, optionally with a swap if repaying from collateral.
   * Supports repaying from wallet or from collateral via swap.
   */
  encodeRepayBatchItemsWithSwap({
    chainId,
    liabilityVault,
    liabilityAmount,
    receiver,
    collateralVault,
    swapQuote,
    subAccount,
    disableControllerOnMax = false,
  }: EncodeRepayBatchItemsWithSwapArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []
    const account = subAccount?.account ?? receiver

    // 1. Withdraw collateral from vault to swapper
    const withdrawAmount = BigInt(swapQuote.amountInMax || swapQuote.amountIn)
    items.push({
      targetContract: collateralVault,
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

    // 3. Verify swap and skim/repay
    // Note: verifyDebtMax already handles the repay, so we don't need a separate repay call
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      data: swapQuote.verify.verifierData
    })

    if (swapQuote.verify.type === "skimMin") {
      throw new Error("Invalid swap quote type")
    }

    // 5. Disable controller if needed (for max repay)
    if (disableControllerOnMax && subAccount) {
      const enabledControllers = subAccount.enabledControllers.map(getAddress)
      const liabilityVaultAddress = getAddress(liabilityVault)
      const currentController = enabledControllers.find(
        (controller: Address) => getAddress(controller) === liabilityVaultAddress
      )
      
      if (currentController) {
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
    }
  

    // Disable controller if needed (for max repay)
    if (disableControllerOnMax && subAccount) {
      const enabledControllers = subAccount.enabledControllers.map(getAddress)
      const liabilityVaultAddress = getAddress(liabilityVault)
      const currentController = enabledControllers.find(
        (controller: Address) => getAddress(controller) === liabilityVaultAddress
      )
      
      if (currentController) {
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
    }
    

    return items
  }

  /**
   * Encodes batch items for swapping collateral from one vault to another.
   */
  encodeSwapCollateralBatchItems({
    chainId,
    fromVault,
    toVault,
    fromAccount,
    toAccount,
    swapQuote,
    subAccount,
  }: EncodeSwapCollateralBatchItemsArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []

    // 1. Withdraw from source vault to swapper
    const withdrawAmount = BigInt(swapQuote.amountInMax || swapQuote.amountIn)
    items.push({
      targetContract: fromVault,
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
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      data: swapQuote.verify.verifierData
    })

    // 4. Deposit swapped tokens to destination vault
    const depositAmount = BigInt(swapQuote.amountOut)
    
    // Check if we need to enable collateral
    let needsEnableCollateral = true
    if (subAccount) {
      const toVaultAddress = getAddress(toVault)
      const isCollateralEnabled = subAccount.enabledCollaterals.some(
        (collateral: Address) => getAddress(collateral) === toVaultAddress
      )
      needsEnableCollateral = !isCollateralEnabled
    }

    if (needsEnableCollateral) {
      const deployment = this.deploymentService.getDeployment(chainId)
      const evc = deployment.addresses.coreAddrs.evc
      items.push({
        targetContract: evc,
        onBehalfOfAccount: toAccount,
        data: encodeFunctionData({
          abi: executionAbis.enableCollateralAbi,
          functionName: "enableCollateral",
          args: [toAccount, toVault]
        })
      })
    }

    items.push({
      targetContract: toVault,
      onBehalfOfAccount: toAccount,
      data: encodeFunctionData({
        abi: executionAbis.depositAbi,
        functionName: "deposit",
        args: [depositAmount, toAccount]
      })
    })

    return items
  }

  /**
   * Encodes batch items for swapping debt from one vault to another.
   */
  encodeSwapDebtBatchItems({
    chainId,
    fromVault,
    toVault,
    fromAccount,
    toAccount,
    swapQuote,
    subAccount,
  }: EncodeSwapDebtBatchItemsArgs): EVCBatchItem[] {
    const items: EVCBatchItem[] = []
    const account = subAccount?.account ?? toAccount

    // 1. Borrow from source vault
    const borrowAmount = BigInt(swapQuote.amountIn)
    items.push({
      targetContract: fromVault,
      onBehalfOfAccount: account,
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
    items.push({
      targetContract: swapQuote.verify.verifierAddress,
      onBehalfOfAccount: swapQuote.accountOut,
      data: swapQuote.verify.verifierData
    })

    // 4. Repay to destination vault (if verifyDebtMax wasn't used)
    if (swapQuote.verify.type !== "debtMax") {
      const repayAmount = BigInt(swapQuote.amountOut)
      items.push({
        targetContract: toVault,
        onBehalfOfAccount: toAccount,
        data: encodeFunctionData({
          abi: executionAbis.repayAbi,
          functionName: "repay",
          args: [repayAmount, toAccount]
        })
      })
    }

    // 5. Handle controller management
    if (subAccount) {
      const fromVaultAddress = getAddress(fromVault)
      const toVaultAddress = getAddress(toVault)
      
      // Disable controller for fromVault if it's enabled
      const enabledControllers = subAccount.enabledControllers.map(getAddress)
      const fromController = enabledControllers.find(
        (controller: Address) => getAddress(controller) === fromVaultAddress
      )
      
      if (fromController) {
        items.push({
          targetContract: fromController,
          onBehalfOfAccount: account,
          data: encodeFunctionData({
            abi: executionAbis.disableControllerAbi,
            functionName: "disableController",
            args: [account]
          })
        })
      }

      // Enable controller for toVault if not already enabled
      const needsEnableController = !enabledControllers.some(
        (controller: Address) => getAddress(controller) === toVaultAddress
      )
      
      if (needsEnableController) {
        const deployment = this.deploymentService.getDeployment(chainId)
        const evc = deployment.addresses.coreAddrs.evc
        items.push({
          targetContract: evc,
          onBehalfOfAccount: account,
          data: encodeFunctionData({
            abi: executionAbis.enableControllerAbi,
            functionName: "enableController",
            args: [account, toVault]
          })
        })
      }
    }

    return items
  }

  encodeTransferBatchItems({ chainId, vault, to, amount, from, enableCollateralTo, disableCollateralFrom }: EncodeTransferBatchItemsArgs): EVCBatchItem[] {
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
        onBehalfOfAccount: to,
        data: encodeFunctionData({
          abi: executionAbis.enableCollateralAbi,
          functionName: "enableCollateral",
          args: [to, vault]
        })
      })
    }

    return items
  }
}