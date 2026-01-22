import { Address, Hex } from "viem";
import type { SubAccount } from "../../entities/Account.js";
import type {
  SwapQuote,
  SwapQuoteRequest,
} from "../swapService/swapServiceTypes.js";

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

export type RepaySourceType = "wallet" | "collateral" | "savings"

export type EncodeRepayWithSwapBatchItemsArgs = {
  swapQuote: SwapQuote
  maxWithdraw?: bigint // max assets available to withdraw. For buy orders, amountInMax may exceed the available assets and withdraw must be capped
  isMax?: boolean
  disableControllerOnMax?: boolean
}

export type EncodeRepayFromWalletBatchItemsArgs = {
  chainId: number
  liabilityVault: Address
  liabilityAmount: bigint
  sender: Address
  receiver: Address
  disableControllerOnMax?: boolean
  isMax?: boolean
}

export type EncodeRepayFromDepositBatchItemsArgs = {
  chainId: number
  liabilityVault: Address
  liabilityAmount: bigint
  from: Address
  receiver: Address
  fromVault: Address
  fromAsset: Address
  liabilityAsset: Address
  swapQuote?: SwapQuote
  swapParams?: Omit<SwapQuoteRequest, "targetDebt" | "deadline"> & {
    targetDebt?: bigint
    deadline?: number
  }
  disableControllerOnMax?: boolean
  isMax?: boolean
  withdrawMax?: bigint
}

export type EncodeSwapCollateralBatchItemsArgs = {
  chainId: number
  swapQuote: SwapQuote
  enableCollateral?: boolean
  disableCollateralOnMax?: boolean
  isMax?: boolean
}

export type EncodeSwapDebtBatchItemsArgs = {
  chainId: number
  swapQuote: SwapQuote
  enableController?: boolean
  disableControllerOnMax?: boolean
  isMax?: boolean
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