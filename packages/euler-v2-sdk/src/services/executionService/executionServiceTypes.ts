import { Address, Hex } from "viem";
import type { SubAccount } from "../../entities/Account.js";

export type EVCBatchItem = {
  targetContract: Address
  onBehalfOfAccount: Address
  value?: bigint
  data: Hex
}

export type EncodeDepositBatchItemsArgs = {
  chainId: number
  vault: Address
  amount: bigint
  receiver: Address
  enableCollateral?: boolean
}

export type EncodeMintBatchItemsArgs = {
  chainId: number
  vault: Address
  shares: bigint
  receiver: Address
  enableCollateral?: boolean
}

export type EncodeWithdrawBatchItemsArgs = {
  chainId: number
  vault: Address
  assets: bigint
  receiver: Address
  owner: Address
  disableCollateral?: boolean
}

export type EncodeRedeemBatchItemsArgs = {
  chainId: number
  vault: Address
  shares: bigint
  receiver: Address
  owner: Address
  disableCollateral?: boolean
}

export type EncodeBorrowBatchItemsArgs = {
  chainId: number
  vault: Address
  amount: bigint
  receiver: Address
  subAccount?: SubAccount
  collateralVault?: Address
  collateralAmount?: bigint
}

export type EncodeRepayBatchItemsArgs = {
  chainId: number
  vault: Address
  amount: bigint
  receiver: Address
  subAccount?: SubAccount
  disableController?: boolean
}

export type EncodePullDebtBatchItemsArgs = {
  chainId: number
  vault: Address
  amount: bigint
  from: Address
  enableController?: boolean
}

export type EncodeRepayBatchItemsWithSwapArgs = {
  chainId: number
  liabilityVault: Address
  liabilityAmount: bigint
  receiver: Address
  // Swap-related fields (when repaying from collateral)
  collateralVault: Address
  swapQuote: SwapQuoteForBatch
  // Account management
  subAccount?: SubAccount
  disableControllerOnMax?: boolean
}

export type EncodeSwapCollateralBatchItemsArgs = {
  chainId: number
  fromVault: Address
  toVault: Address
  fromAccount: Address
  toAccount: Address
  swapQuote: SwapQuoteForBatch
  subAccount?: SubAccount
}

export type EncodeSwapDebtBatchItemsArgs = {
  chainId: number
  fromVault: Address
  toVault: Address
  fromAccount: Address
  toAccount: Address
  swapQuote: SwapQuoteForBatch
  subAccount?: SubAccount
}

export type EncodeTransferBatchItemsArgs = {
  chainId: number
  vault: Address
  to: Address
  amount: bigint
  from: Address
  enableCollateralTo?: boolean
  disableCollateralFrom?: boolean
}

export type SwapQuoteForBatch = {
  amountIn: string
  amountInMax: string
  amountOut: string
  amountOutMin: string
  accountIn: Address
  accountOut: Address
  vaultIn: Address
  receiver: Address
  swap: {
    swapperAddress: Address
    swapperData: Hex
    multicallItems: Array<{ data: Hex }>
  }
  verify: {
    verifierAddress: Address
    verifierData: Hex
    type: "skimMin" | "debtMax"
    vault: Address
    account: Address
    amount: string
    deadline: number
  }
}
