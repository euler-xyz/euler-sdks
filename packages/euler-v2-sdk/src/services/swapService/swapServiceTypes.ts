import type { Address, Hex } from "viem";

export enum SwapperMode {
  // 0 - exact input swap
  EXACT_IN = 0,
  // 1 - exact output swap
  EXACT_OUT = 1,
  // 2 - exact output swap and repay, targeting a debt amount of an account
  TARGET_DEBT = 2,
}

export enum SwapVerificationType {
  SkimMin = "skimMin",
  DebtMax = "debtMax",
  TransferMin = "transferMin",
}

export interface SwapQuoteRequest {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  accountIn: Address;
  accountOut: Address;
  amount: bigint; // exact in - amount to sell, exact out - amount to buy, exact out repay - estimated amount to buy (from current debt)
  vaultIn: Address; // for returning unused input
  receiver: Address; // vault to swap or repay to
  origin: Address; // EOA sending the tx
  slippage: number; // in percent 1 = 1%
  swapperMode: SwapperMode;
  isRepay: boolean;
  targetDebt: bigint; // ignored if not in target debt mode
  currentDebt: bigint; // needed in exact input or output and with `isRepay` set
  deadline: number; // timestamp in seconds
  dustAccount?: Address; // account receiving dust deposits from e.g. over-swap repays
  unusedInputReceiver?: Address; // address to receive unused input instead of depositing to vaultIn/accountIn
  transferOutputToReceiver?: boolean; // transfer output tokens to receiver instead of depositing. Not valid for repay swaps
  skipSweepDepositOut?: boolean; // don't add a final deposit of the output token, leave assets in Swapper
  provider?: string; // preselected provider, see fetchProviders
}
// TODO parse this to bigint
export interface SwapQuote {
  amountIn: string;
  amountInMax: string;
  amountOut: string;
  amountOutMin: string;
  accountIn: Address;
  accountOut: Address;
  vaultIn: Address;
  receiver: Address;
  tokenIn: {
    address: Address;
    chainId: number;
    decimals: number;
    logoURI: string;
    name: string;
    symbol: string;
    meta?: unknown;
  };
  tokenOut: {
    address: Address;
    chainId: number;
    decimals: number;
    logoURI: string;
    name: string;
    symbol: string;
    meta?: unknown;
  };
  slippage: number; // actual slippage
  swap: SwapperData;
  verify: SwapVerifierData;
  route: SwapRouteHop[];
  transferOutputToReceiver?: boolean;
}


export interface GetRepayQuoteArgs {
  chainId: number;
  fromVault: Address;
  fromAsset: Address;
  fromAccount: Address;
  liabilityVault: Address;
  liabilityAsset: Address;
  currentDebt: bigint;
  toAccount: Address;
  origin: Address;
  swapperMode: SwapperMode;
  slippage: number;
  liabilityAmount?: bigint; // amount to repay in TARGET_DEBT mode, set to current  debt to repay full
  collateralAmount?: bigint; // amount to sell for debt in EXACT_IN mode
  deadline?: number;
  unusedInputReceiver?: Address; // address to receive unused input instead of depositing to vaultIn/accountIn
  provider?: string; // preselected provider, see fetchProviders
}

export interface GetDepositQuoteArgs {
  chainId: number;
  fromVault: Address;
  toVault: Address;
  fromAccount: Address;
  toAccount: Address;
  fromAsset: Address;
  toAsset: Address;
  amount: bigint;
  origin: Address;
  slippage: number;
  deadline?: number;
  unusedInputReceiver?: Address; // address to receive unused input instead of depositing to vaultIn/accountIn
  skipSweepDepositOut?: boolean; // don't add a final deposit of the output token, leave assets in Swapper
  provider?: string; // preselected provider, see fetchProviders
}


export interface SwapperData {
  swapperAddress: Address;
  swapperData: Hex; // multicall calldata
  multicallItems: MulticallItem[];
}

export interface MulticallItem {
  functionName: string; // e.g. "swap" | "deposit" | others
  args: unknown[]; // allow raw or structured
  data: Hex; // encoded call data for this step
}

export interface SwapRouteHop {
  providerName: string;
}

export interface SwapVerifierData {
  verifierAddress: Address;
  verifierData: Hex;
  type: SwapVerificationType;
  vault: Address;
  account: Address;
  amount: string;
  deadline: number;
}

export interface SwapsApiResponse {
  success: boolean;
  data: SwapQuote[];
}

export interface SwapProvidersApiResponse {
  success: boolean;
  data: string[];
}

