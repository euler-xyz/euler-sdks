import { Address, Hex, TypedDataDomain } from "viem";
import type { Account, ISubAccount, IHasVaultAddress } from "../../entities/Account.js";
import type { Wallet } from "../../entities/Wallet.js";
import type {
  SwapQuote,
  SwapQuoteRequest,
} from "../swapService/swapServiceTypes.js";

export type EVCBatchItem = {
  targetContract: Address
  onBehalfOfAccount: Address
  value: bigint
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
  subAccount?: ISubAccount
  disableController?: boolean
}

export type EncodeLiquidationArgs = {
  chainId: number
  vault: Address
  violator: Address
  collateral: Address
  repayAssets: bigint
  minYieldBalance: bigint
  liquidatorSubAccountAddress: Address
  enableCollateral?: boolean
  enableController?: boolean
}
 
export type ResolveRequiredApprovalsWithWalletArgs = {
  plan: TransactionPlan
  chainId: number
  wallet: Wallet
  usePermit2?: boolean
  unlimitedApproval?: boolean
}

export type ResolveRequiredApprovalsArgs = {
  plan: TransactionPlan
  chainId: number
  account: Address
  usePermit2?: boolean
  unlimitedApproval?: boolean
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
  chainId: number
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
  sigDeadline?: bigint
  expiration?: number
}

export type PermitSingleMessage = {
  details: PermitDetails
  spender: Address
  sigDeadline: bigint
}

export type PermitSingleTypedData = {
  domain: TypedDataDomain
  types: typeof PERMIT2_TYPES
  primaryType: "PermitSingle"
  message: PermitSingleMessage
}

export type PermitDetails = {
  token: Address
  amount: bigint
  expiration: number
  nonce: number
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

export type RequiredApproval = {
  type: "requiredApproval"
  token: Address
  owner: Address
  spender: Address
  amount: bigint
  resolved?: (ApproveCall | Permit2DataToSign)[]
}

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

export type TransactionPlanItem = RequiredApproval | EVCBatchItems

export type TransactionPlan = TransactionPlanItem[]

// Plan function argument types
export type PlanDepositArgs = {
  vault: Address
  amount: bigint
  receiver: Address
  account: Account<IHasVaultAddress>
  asset: Address
  enableCollateral?: boolean
}

export type PlanMintArgs = {
  account: Account<IHasVaultAddress>
  vault: Address
  shares: bigint
  receiver: Address
  asset: Address
  enableCollateral?: boolean
  sharesToAssetsExchangeRateWad?: bigint
}

export type PlanWithdrawArgs = {
  account: Account<IHasVaultAddress>
  vault: Address
  assets: bigint
  owner: Address
  receiver: Address
  disableCollateral?: boolean
}

export type PlanRedeemArgs = {
  account: Account<IHasVaultAddress>
  vault: Address
  shares: bigint
  owner: Address
  receiver: Address
  disableCollateral?: boolean
}

export type PlanBorrowArgs = {
  account: Account<IHasVaultAddress>
  vault: Address
  amount: bigint
  borrowAccount: Address
  receiver: Address
  collateral?: {
    vault: Address
    amount: bigint
    asset: Address
  }
}

export type PlanLiquidationArgs = {
  account: Account<IHasVaultAddress>
  liquidatorSubAccountAddress: Address
  vault: Address
  asset: Address
  violator: Address
  collateral: Address
  repayAssets: bigint
  minYieldBalance: bigint
}

export type PlanRepayFromWalletArgs = {
  account: Account<IHasVaultAddress>
  liabilityVault: Address
  liabilityAmount: bigint
  receiver: Address
}

export type PlanRepayFromDepositArgs = {
  account: Account<IHasVaultAddress>
  liabilityVault: Address
  liabilityAmount: bigint
  receiver: Address
  fromVault: Address
  fromAccount: Address
}

export type PlanRepayWithSwapArgs = {
  account: Account<IHasVaultAddress>
  swapQuote: SwapQuote
}

export type PlanSwapCollateralArgs = {
  account: Account<IHasVaultAddress>
  swapQuote: SwapQuote
}

export type PlanSwapDebtArgs = {
  account: Account<IHasVaultAddress>
  swapQuote: SwapQuote
}

export type PlanTransferArgs = {
  account: Account<IHasVaultAddress>
  vault: Address
  from: Address
  to: Address
  amount: bigint
  enableCollateralTo?: boolean
  disableCollateralFrom?: boolean
}

export type PlanPullDebtArgs = {
  account: Account<IHasVaultAddress>
  vault: Address
  from: Address
  to: Address
  amount: bigint
}

export type PlanMultiplyWithSwapArgs = {
  account: Account<IHasVaultAddress>
  collateralVault: Address
  collateralAmount: bigint
  collateralAsset: Address
  swapQuote: SwapQuote
}

export type PlanMultiplySameAssetArgs = {
  account: Account<IHasVaultAddress>
  collateralVault: Address
  collateralAmount: bigint
  collateralAsset: Address
  liabilityVault: Address
  liabilityAmount: bigint
  longVault: Address
  receiver: Address
}

// Decoded batch item data
export type BatchItemDescription = {
  targetContract: Address
  onBehalfOfAccount: Address
  functionName: string
  args: Record<string, unknown>
}
