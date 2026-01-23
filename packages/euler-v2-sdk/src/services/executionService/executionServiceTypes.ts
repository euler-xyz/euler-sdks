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
  owner: Address
  enableCollateral?: boolean
  permit2?: Permit2Data
}

export type EncodeMintArgs = {
  chainId: number
  vault: Address
  shares: bigint
  receiver: Address
  owner: Address
  enableCollateral?: boolean
  permit2?: Permit2Data
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
  account: Address
  receiver: Address
  currentController?: Address
  enableController?: boolean
  enableCollateral?: boolean
  collateralVault?: Address
  collateralAmount?: bigint
  collateralPermit2?: Permit2Data
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
  permit2?: Permit2Data
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
  liabilityPermit2?: Permit2Data
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

export type EncodePermit2CallArgs = {
  chainId: number
  message: PermitSingleMessage
  signature: Hex
  owner: Address
}

export type GetPermit2TypedDataArgs = {
  chainId: number
  token: Address
  amount: bigint
  spender: Address
  nonce: number
  sigDeadline: bigint
}

export type PermitSingleMessage = {
  details: PermitDetails
  spender: Address
  sigDeadline: bigint
}

export type PermitDetails = {
  token: Address
  amount: bigint
  expiration: bigint
  nonce: bigint
}


export type Permit2Data = {
  message: PermitSingleMessage
  signature: Hex
}

export const PERMIT2_TYPES = {
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
} as const
