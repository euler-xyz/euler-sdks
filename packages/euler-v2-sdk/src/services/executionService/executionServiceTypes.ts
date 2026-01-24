import { Address, Hex } from "viem";
import type { Account, SubAccount } from "../../entities/Account.js";
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
  owner: Address
  borrowAccount: Address
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
  to: Address
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

// Transaction plan types
export type ApproveCall = {
  type: "approve"
  token: Address
  owner: Address
  spender: Address
  amount: bigint
  data: Hex
}

export type Permit2DataToSign = {
  type: "permit2"
  token: Address
  amount: bigint
  owner: Address
  spender: Address
}

export type EVCBatchItems = {
  type: "evcBatch"
  items: EVCBatchItem[]
}

export type TransactionPlanItem = ApproveCall | Permit2DataToSign | EVCBatchItems

// Plan function argument types
export type PlanDepositArgs = {
  vault: Address
  amount: bigint
  receiver: Address
  account: Account
  asset: Address // Asset address - required when account/position is not available
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

export type PlanMintArgs = {
  vault: Address
  shares: bigint
  receiver: Address
  account: Account
  asset: Address // Asset address - required when account/position is not available
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

export type PlanWithdrawArgs = {
  vault: Address
  assets: bigint
  receiver: Address
  account: Account
}

export type PlanRedeemArgs = {
  vault: Address
  shares: bigint
  receiver: Address
  account: Account
}

export type PlanBorrowArgs = {
  vault: Address
  amount: bigint
  borrowAccount: Address
  receiver: Address
  account: Account
  collateral?: {
    vault: Address
    amount: bigint
    asset: Address
  }
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

export type PlanRepayFromWalletArgs = {
  liabilityVault: Address
  liabilityAmount: bigint
  receiver: Address
  account: Account
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

export type PlanRepayFromDepositArgs = {
  liabilityVault: Address
  liabilityAmount: bigint
  receiver: Address
  fromVault: Address
  fromAccount: Address
  account: Account
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

export type PlanRepayWithSwapArgs = {
  swapQuote: SwapQuote
  account: Account
}

export type PlanSwapCollateralArgs = {
  swapQuote: SwapQuote
  account: Account
}

export type PlanSwapDebtArgs = {
  swapQuote: SwapQuote
  account: Account
}

export type PlanTransferArgs = {
  vault: Address
  from: Address
  to: Address
  amount: bigint
  account: Account
}

export type PlanPullDebtArgs = {
  chainId: number
  vault: Address
  from: Address
  to: Address
  amount: bigint
  account: Account
}

export type EncodeMultiplyWithSwapArgs = {
  chainId: number
  collateralVault: Address
  collateralAmount: bigint
  liabilityVault: Address
  liabilityAmount: bigint
  longVault: Address
  owner: Address
  receiver: Address
  enableCollateral?: boolean
  enableCollateralLong?: boolean
  currentController?: Address
  enableController?: boolean
  collateralPermit2?: Permit2Data
  swapQuote: SwapQuote
}

export type EncodeMultiplySameAssetArgs = {
  chainId: number
  collateralVault: Address
  collateralAmount: bigint
  liabilityVault: Address
  liabilityAmount: bigint
  longVault: Address
  owner: Address
  receiver: Address
  enableCollateral?: boolean
  enableCollateralLong?: boolean
  currentController?: Address
  enableController?: boolean
  collateralPermit2?: Permit2Data
}

export type PlanMultiplyWithSwapArgs = {
  collateralVault: Address
  collateralAmount: bigint
  collateralAsset: Address
  account: Account
  swapQuote: SwapQuote
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

export type PlanMultiplySameAssetArgs = {
  collateralVault: Address
  collateralAmount: bigint
  collateralAsset: Address
  liabilityVault: Address
  liabilityAmount: bigint
  longVault: Address
  receiver: Address
  account: Account
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

// Decoded batch item data
export type BatchItemDescription = {
  targetContract: Address
  onBehalfOfAccount: Address
  functionName: string
  args: Record<string, unknown>
}
