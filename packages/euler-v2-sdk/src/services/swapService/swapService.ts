import { Address, Hex, encodeFunctionData, getAddress, maxUint256 } from "viem";
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
  /** Fetches raw swap quotes from the API. Prefer getRepayQuotes or getDepositQuote for repay/collateral-swap flows. */
  getSwapQuotes(args: SwapQuoteRequest): Promise<SwapQuote[]>;
  /** Fetches swap quotes for repaying debt by swapping collateral (withdraw → swap → repay). */
  getRepayQuotes(args: GetRepayQuoteArgs): Promise<SwapQuote[]>;
  /** Fetches swap quotes for swapping collateral between vaults (withdraw → swap → deposit). */
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
   * Fetches swap quotes from the swap API for a given token pair and amount.
   * Validates verifier data for each quote. Use getRepayQuotes or getDepositQuote for repay/collateral-swap flows.
   *
   * @param request - Swap quote request
   * @param request.chainId - Chain ID
   * @param request.tokenIn - Token to sell (input)
   * @param request.tokenOut - Token to buy (output); must differ from tokenIn
   * @param request.accountIn - Sub-account providing the input (e.g. withdrawing from vaultIn)
   * @param request.accountOut - Sub-account receiving the output (e.g. repay target or collateral receiver)
   * @param request.amount - Exact-in: amount to sell; exact-out: amount to buy; exact-out repay: estimated amount to buy
   * @param request.vaultIn - Vault to withdraw from (for returning unused input)
   * @param request.receiver - Vault that receives the swap output (e.g. liability vault for repay, destination vault for deposit)
   * @param request.origin - EOA sending the transaction (required, cannot be zero address)
   * @param request.slippage - Slippage in percent (e.g. 1 = 1%); must be between 0 and 50
   * @param request.swapperMode - EXACT_IN (0), EXACT_OUT (1), or TARGET_DEBT (2) for repay
   * @param request.isRepay - If true, quote is for repaying debt (verify type debtMax)
   * @param request.targetDebt - Target debt after repay (used when swapperMode is TARGET_DEBT)
   * @param request.currentDebt - Current debt of the account (required when isRepay is true)
   * @param request.deadline - Quote deadline timestamp in seconds (defaults to config defaultDeadline from now)
   * @param request.dustAccount - Account receiving dust from over-swap repays (defaults to origin)
   * @returns Promise of array of swap quotes (amounts, swap calldata, verifier calldata). Throws if tokenIn === tokenOut, origin is zero, or API/verifier validation fails.
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
   * Fetches swap quotes for repaying debt by swapping collateral (e.g. withdraw collateral → swap → repay).
   * Delegates to getSwapQuotes with isRepay true. fromAsset and liabilityAsset must differ.
   *
   * @param args - Repay quote arguments
   * @param args.chainId - Chain ID
   * @param args.fromVault - Vault to withdraw collateral from (source of swap input)
   * @param args.fromAsset - Underlying asset of fromVault (tokenIn for the swap)
   * @param args.fromAccount - Sub-account that holds the collateral in fromVault
   * @param args.liabilityVault - Vault to repay debt to (receiver of swap output)
   * @param args.liabilityAsset - Underlying asset of liabilityVault (tokenOut for the swap)
   * @param args.currentDebt - Current debt of the account being repaid (must be > 0)
   * @param args.toAccount - Sub-account whose debt is repaid (accountOut)
   * @param args.origin - EOA sending the transaction
   * @param args.swapperMode - EXACT_IN (sell fixed collateral amount) or TARGET_DEBT (repay toward target debt)
   * @param args.slippage - Slippage in percent (0–50)
   * @param args.collateralAmount - In EXACT_IN mode: amount of collateral to sell; required in EXACT_IN
   * @param args.liabilityAmount - In TARGET_DEBT mode: amount of debt to repay; set to currentDebt for full repay
   * @param args.deadline - Quote deadline timestamp in seconds (optional)
   * @returns Promise of array of swap quotes for repay (verify type debtMax). Throws if currentDebt <= 0, fromAsset === liabilityAsset, or no quotes.
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
      // TODO add to docs or change api, liabilityAmount is ignored if isMax is true
      targetDebt = currentDebt === liabilityAmount ? 0n : currentDebt - liabilityAmount;
      amount = currentDebt === liabilityAmount ? currentDebt - targetDebt : liabilityAmount;
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
   * Fetches swap quotes for swapping collateral from one vault to another (withdraw from source → swap → deposit to destination).
   * Delegates to getSwapQuotes with isRepay false and EXACT_IN mode.
   *
   * @param args - Deposit/collateral-swap quote arguments
   * @param args.chainId - Chain ID
   * @param args.fromVault - Vault to withdraw collateral from (source)
   * @param args.toVault - Vault to receive the swapped collateral (destination, receiver)
   * @param args.fromAccount - Sub-account that holds the collateral in fromVault
   * @param args.toAccount - Sub-account that will hold the new collateral in toVault
   * @param args.fromAsset - Underlying asset of fromVault (tokenIn)
   * @param args.toAsset - Underlying asset of toVault (tokenOut)
   * @param args.amount - Amount of fromAsset to swap (exact-in)
   * @param args.origin - EOA sending the transaction
   * @param args.slippage - Slippage in percent (0–50)
   * @param args.deadline - Quote deadline timestamp in seconds (optional)
   * @returns Promise of array of swap quotes (verify type skimMin). Throws if slippage invalid or no quotes.
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
