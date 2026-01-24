import { Address, Hex, encodeFunctionData, getAddress } from "viem";
import type {
  SwapQuote,
  SwapQuoteRequest,
  SwapsApiResponse,
  GetRepayQuoteArgs,
  GetDepositQuoteArgs,
} from "./swapServiceTypes.js";
import { SwapperMode } from "./swapServiceTypes.js";
import { swapVerifierAbi } from "./swapVerifierAbi.js";

export interface SwapServiceConfig {
  swapApiUrl: string;
  defaultDeadline?: number; // seconds, default 1800 (30 minutes)
}

export interface ISwapService {
  getSwapQuotes(args: SwapQuoteRequest): Promise<SwapQuote[]>;
  getRepayQuotes(args: GetRepayQuoteArgs): Promise<SwapQuote[]>;
  getDepositQuote(args: GetDepositQuoteArgs): Promise<SwapQuote[]>;
}

const DEFAULT_DEADLINE = 1800; // 30 minutes
const MAX_SLIPPAGE = 50;

export class SwapService implements ISwapService {
  constructor(private readonly config: SwapServiceConfig) {
    if (!config.swapApiUrl) {
      throw new Error("Swap API URL is required");
    }
  }

  /**
   * Fetches swap quotes from the swap API
   */
  async getSwapQuotes(request: SwapQuoteRequest): Promise<SwapQuote[]> {
    if (request.tokenIn === request.tokenOut) {
      throw new Error("Token in and token out cannot be the same");
    }
    if (!request.origin || request.origin === "0x0000000000000000000000000000000000000000") {
      throw new Error("origin must be provided for swap repay");
    }
    const params = this.buildRequestParams(request);
    const searchParams = new URLSearchParams(params);

    const response = await fetch(
      `${this.config.swapApiUrl}/swaps?${searchParams.toString()}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Swap API request failed: ${response.status} ${errorText}`,
      );
    }

    const jsonData = await response.json() as SwapsApiResponse;

    if (!jsonData.success) {
      throw new Error("Swap API returned unsuccessful response");
    }

    // Validate verifier data for each quote
    for (const quote of jsonData.data) {
      this.validateVerifierData(request, quote);
    }

    return jsonData.data;
  }

  /**
   * Builds request parameters for the swap API
   */
  private buildRequestParams(request: SwapQuoteRequest): Record<string, string> {
    const deadline =
      request.deadline ||
      Math.floor(Date.now() / 1000) +
        (this.config.defaultDeadline || DEFAULT_DEADLINE);

    return {
      chainId: request.chainId.toString(),
      tokenIn: getAddress(request.tokenIn),
      tokenOut: getAddress(request.tokenOut),
      amount: request.amount.toString(),
      targetDebt: request.targetDebt.toString() || "0",
      currentDebt: request.currentDebt.toString() || "0",
      receiver: getAddress(request.receiver),
      vaultIn: getAddress(request.vaultIn),
      origin: getAddress(request.origin),
      accountIn: getAddress(request.accountIn),
      accountOut: getAddress(request.accountOut),
      slippage: request.slippage.toString() || "0",
      deadline: deadline.toString(),
      swapperMode: request.swapperMode.toString() || SwapperMode.EXACT_IN.toString(),
      dustAccount: request.dustAccount
        ? getAddress(request.dustAccount)
        : getAddress(request.origin),
      isRepay: request.isRepay ? "true" : "false",
    };
  }

  /**
   * Validates that the verifier data matches what we expect
   * This is a security measure to ensure the swap payload hasn't been tampered with
   */
  private validateVerifierData(
    request: SwapQuoteRequest,
    quote: SwapQuote,
  ): void {
    if (!request.receiver || !request.accountOut) {
      throw new Error("Missing swap params for verification");
    }

    let functionName: "verifyAmountMinAndSkim" | "verifyDebtMax";
    let amount: bigint;

    const adjustForInterest = (debtAmount: bigint) =>
      (debtAmount * 10_001n) / 10_000n;

    if (request.isRepay) {
      functionName = "verifyDebtMax";
      if (request.swapperMode === SwapperMode.TARGET_DEBT) {
        amount = request.targetDebt || 0n;
      } else {
        amount = (request.currentDebt || 0n) - BigInt(quote.amountOutMin);
        if (amount < 0n) amount = 0n;
        amount = adjustForInterest(amount);
      }
    } else {
      functionName = "verifyAmountMinAndSkim";
      amount = BigInt(quote.amountOutMin);
    }

    const deadline =
      request.deadline ||
      Math.floor(Date.now() / 1000) +
        (this.config.defaultDeadline || DEFAULT_DEADLINE);

    const expectedVerifierData = encodeFunctionData({
      abi: swapVerifierAbi,
      functionName,
      args: [
        request.receiver,
        request.accountOut,
        amount,
        BigInt(deadline),
      ],
    });

    if (quote.verify.verifierData !== expectedVerifierData) {
      console.warn("[SwapService] SwapVerifier data mismatch", {
        expected: expectedVerifierData,
        received: quote.verify.verifierData,
      });
      throw new Error("SwapVerifier data mismatch");
    }
  }

  /**
   * Fetches a swap quote for repaying debt with a swap.
   */
  async getRepayQuotes(
    args: GetRepayQuoteArgs,
  ): Promise<SwapQuote[]> {
    const {
      chainId,
      fromVault,
      fromAsset,
      fromAccount,
      liabilityVault,
      liabilityAsset,
      liabilityAmount,
      currentDebt,
      toAccount,
      origin,
      swapperMode,
      slippage,
      collateralAmount,
      isMax = false,
      deadline,
    } = args;

    if (currentDebt <= 0n) {
      throw new Error("currentDebt must be provided for swap repay");
    }
    if (fromAsset === liabilityAsset) {
      throw new Error(
        "Swap repay requires different from and liability assets",
      );
    }
    this.validateSlippage(slippage);

    let amount: bigint;
    let targetDebt = 0n;

    if (swapperMode === SwapperMode.EXACT_IN) {
      if (collateralAmount === undefined) {
        throw new Error(
          "collateralAmount must be provided for exact-in swap repay",
        );
      }
      amount = collateralAmount;
    } else {
      if (liabilityAmount === undefined) {
        throw new Error(
          "liabilityAmount must be provided for target-debt swap repay",
        );
      }
      amount = liabilityAmount;
      targetDebt = isMax || amount >= currentDebt ? 0n : currentDebt - amount;
    }

    const quotes = await this.getSwapQuotes({
      chainId,
      tokenIn: fromAsset,
      tokenOut: liabilityAsset,
      accountIn: fromAccount,
      accountOut: toAccount,
      amount,
      vaultIn: fromVault,
      receiver: liabilityVault,
      origin,
      slippage,
      swapperMode,
      isRepay: true,
      targetDebt,
      currentDebt,
      deadline: deadline ?? 0,
    });

    if (quotes.length === 0) {
      throw new Error("No swap quotes available");
    }

    return quotes;
  }

  /**
   * Fetches a swap quote for swapping collateral from one vault to another.
   */
  async getDepositQuote(
    args: GetDepositQuoteArgs,
  ): Promise<SwapQuote[]> {
    const {
      chainId,
      fromVault,
      toVault,
      fromAccount,
      toAccount,
      fromAsset,
      toAsset,
      amount,
      origin,
      slippage,
      deadline,
    } = args;

    this.validateSlippage(slippage);

    const quotes = await this.getSwapQuotes({
      chainId,
      tokenIn: fromAsset,
      tokenOut: toAsset,
      accountIn: fromAccount,
      accountOut: toAccount,
      amount,
      vaultIn: fromVault,
      receiver: toVault,
      origin,
      slippage,
      swapperMode: SwapperMode.EXACT_IN,
      isRepay: false,
      targetDebt: 0n,
      currentDebt: 0n,
      deadline: deadline ?? 0,
    });

    if (quotes.length === 0) {
      throw new Error("No swap quotes available");
    }

    return quotes;
  }

  private validateSlippage(slippage: number): void {
    if (slippage === undefined || slippage > MAX_SLIPPAGE || slippage < 0) {
      throw new Error(
        "Valid slippage between 0 and 50% must be provided for swap",
      );
    }
  }
}
