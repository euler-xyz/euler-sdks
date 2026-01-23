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

export type EncodeDepositArgs = {
  chainId: number
  vault: Address
  amount: bigint
  receiver: Address
  enableCollateral?: boolean
}

export type EncodeMintArgs = {
  chainId: number
  vault: Address
  shares: bigint
  receiver: Address
  enableCollateral?: boolean
}

export type EncodeWithdrawArgs = {
  chainId: number
  vault: Address
  assets: bigint
  receiver: Address
  owner: Address
  disableCollateral?: boolean
}

export type EncodeRedeemArgs = {
  chainId: number
  vault: Address
  shares: bigint
  receiver: Address
  owner: Address
  disableCollateral?: boolean
}

export type EncodeBorrowArgs = {
  chainId: number
  vault: Address
  amount: bigint
  receiver: Address
  subAccount?: SubAccount
  collateralVault?: Address
  collateralAmount?: bigint
}

export type EncodeRepayArgs = {
  chainId: number
  vault: Address
  amount: bigint
  receiver: Address
  subAccount?: SubAccount
  disableController?: boolean
}

export type EncodePullDebtArgs = {
  chainId: number
  vault: Address
  amount: bigint
  from: Address
  enableController?: boolean
}

export type RepaySourceType = "wallet" | "collateral" | "savings"

export type EncodeRepayWithSwapArgs = {
  swapQuote: SwapQuote
  maxWithdraw?: bigint // max assets available to withdraw. For buy orders, amountInMax may exceed the available assets and withdraw must be capped
  isMax?: boolean
  disableControllerOnMax?: boolean
}

export type EncodeRepayFromWalletArgs = {
  chainId: number
  liabilityVault: Address
  liabilityAmount: bigint
  sender: Address
  receiver: Address
  disableControllerOnMax?: boolean
  isMax?: boolean
}

export type EncodeRepayFromDepositArgs = {
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

export type EncodeSwapCollateralArgs = {
  chainId: number
  swapQuote: SwapQuote
  enableCollateral?: boolean
  disableCollateralOnMax?: boolean
  isMax?: boolean
}

export type EncodeSwapDebtArgs = {
  chainId: number
  swapQuote: SwapQuote
  enableController?: boolean
  disableControllerOnMax?: boolean
  isMax?: boolean
}

export type EncodeTransferArgs = {
  chainId: number
  vault: Address
  to: Address
  amount: bigint
  from: Address
  enableCollateralTo?: boolean
  disableCollateralFrom?: boolean
}