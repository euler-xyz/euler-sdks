import { Address, Hex } from "viem";

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
}

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
    addressInfo: Address;
    chainId: number;
    decimals: number;
    logoURI: string;
    name: string;
    symbol: string;
    meta?: unknown;
  };
  tokenOut: {
    addressInfo: Address;
    chainId: number;
    decimals: number;
    logoURI: string;
    name: string;
    symbol: string;
    meta?: unknown;
  };
  slippage: number; // actual slippage
  swap: SwapBundle;
  verify: VerifyBlock;
  route: RouteHop[];
}

export interface SwapBundle {
  swapperAddress: Address;
  swapperData: Hex; // multicall calldata
  multicallItems: MulticallItem[];
}

export interface MulticallItem {
  functionName: string; // e.g. "swap" | "deposit" | others
  args: unknown[]; // allow raw or structured
  data: Hex; // encoded call data for this step
}

export interface RouteHop {
  providerName: string;
}

export interface VerifyBlock {
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
