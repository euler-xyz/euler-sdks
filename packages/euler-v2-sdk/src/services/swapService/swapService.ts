import { type Address, encodeFunctionData, getAddress, zeroAddress } from "viem";
import type {
	SwapQuote,
	SwapQuoteRequest,
	SwapsApiResponse,
	SwapProvidersApiResponse,
	GetRepayQuoteArgs,
	GetDepositQuoteArgs,
	GetWalletSwapQuoteArgs,
} from "./swapServiceTypes.js";
import { SwapperMode } from "./swapServiceTypes.js";
import { swapVerifierAbi } from "./swapVerifierAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import type { IDeploymentService } from "../deploymentService/index.js";

export interface SwapServiceConfig {
	swapApiUrl: string;
	defaultDeadline?: number; // seconds, default 1800 (30 minutes)
}

export interface ISwapService {
	/** Fetches raw swap quotes from the API. Prefer fetchRepayQuotes or fetchDepositQuote for repay/collateral-swap flows. */
	fetchSwapQuotes(args: SwapQuoteRequest): Promise<SwapQuote[]>;
	/** Fetches swap quotes for repaying debt by swapping collateral (withdraw → swap → repay). */
	fetchRepayQuotes(args: GetRepayQuoteArgs): Promise<SwapQuote[]>;
	/** Fetches swap quotes for swapping collateral between vaults (withdraw → swap → deposit). */
	fetchDepositQuote(args: GetDepositQuoteArgs): Promise<SwapQuote[]>;
	/** Fetches swap quotes for swapping wallet input to wallet output (transferFromSender → swap → transferOutputToReceiver). */
	fetchWalletSwapQuote(args: GetWalletSwapQuoteArgs): Promise<SwapQuote[]>;
	/** Fetches available swap providers for a given chain. */
	fetchProviders(chainId: number): Promise<string[]>;
}

const DEFAULT_DEADLINE = 1800; // 30 minutes
const MAX_SLIPPAGE = 50;
const SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR = 10_000n;
const SLIPPAGE_VALIDATION_TOLERANCE_UNITS = 1n; // 0.01%

export class SwapService implements ISwapService {
	constructor(
		private readonly config: SwapServiceConfig,
		private readonly deploymentService: IDeploymentService,
		buildQuery?: BuildQueryFn,
	) {
		if (!config.swapApiUrl) {
			throw new Error("Swap API URL is required");
		}
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	querySwapQuotes = async (url: string): Promise<SwapsApiResponse> => {
		const response = await fetch(url);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Swap API request failed: ${response.status} ${errorText}`,
			);
		}

		return response.json() as Promise<SwapsApiResponse>;
	};

	setQuerySwapQuotes(fn: typeof this.querySwapQuotes): void {
		this.querySwapQuotes = fn;
	}

	querySwapProviders = async (
		url: string,
	): Promise<SwapProvidersApiResponse> => {
		const response = await fetch(url);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Swap API providers request failed: ${response.status} ${errorText}`,
			);
		}

		return response.json() as Promise<SwapProvidersApiResponse>;
	};

	setQuerySwapProviders(fn: typeof this.querySwapProviders): void {
		this.querySwapProviders = fn;
	}

	/**
	 * Fetches swap quotes from the swap API for a given token pair and amount.
	 * Validates verifier data for each quote. Use fetchRepayQuotes or fetchDepositQuote for repay/collateral-swap flows.
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
	 * @param request.provider - Optional preselected provider (see fetchProviders)
	 * @returns Promise of array of swap quotes (amounts, swap calldata, verifier calldata). Throws if tokenIn === tokenOut, origin is zero, or API/verifier validation fails.
	 */
	async fetchSwapQuotes(request: SwapQuoteRequest): Promise<SwapQuote[]> {
		if (request.tokenIn === request.tokenOut) {
			throw new Error("Token in and token out cannot be the same");
		}
		if (
			!request.origin ||
			request.origin === "0x0000000000000000000000000000000000000000"
		) {
			throw new Error("origin must be provided for swap repay");
		}
		const params = this.buildRequestParams(request);
		const searchParams = new URLSearchParams(params);

		const jsonData = await this.querySwapQuotes(
			`${this.config.swapApiUrl}/swaps?${searchParams.toString()}`,
		);

		if (!jsonData.success) {
			throw new Error("Swap API returned unsuccessful response");
		}

		// Validate verifier and slippage data for each quote
		for (const quote of jsonData.data) {
			this.validateVerifierData(request, quote);
			this.validateSlippageData(request, quote);
		}

		return jsonData.data;
	}

	/**
	 * Fetches available swap providers for a given chain.
	 * The result is static per chain and can be cached for a long time.
	 *
	 * @param chainId - Chain ID
	 * @returns Promise of array of provider name strings
	 */
	async fetchProviders(chainId: number): Promise<string[]> {
		const params = new URLSearchParams({ chainId: chainId.toString() });

		const jsonData = await this.querySwapProviders(
			`${this.config.swapApiUrl}/providers?${params.toString()}`,
		);

		if (!jsonData.success) {
			throw new Error("Swap API providers returned unsuccessful response");
		}

		return jsonData.data;
	}

	/**
	 * Builds request parameters for the swap API
	 */
	private buildRequestParams(
		request: SwapQuoteRequest,
	): Record<string, string> {
		const deadline =
			request.deadline ||
			Math.floor(Date.now() / 1000) +
				(this.config.defaultDeadline || DEFAULT_DEADLINE);

		const params: Record<string, string> = {
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
			swapperMode:
				request.swapperMode.toString() || SwapperMode.EXACT_IN.toString(),
			dustAccount: request.dustAccount
				? getAddress(request.dustAccount)
				: getAddress(request.origin),
			isRepay: request.isRepay ? "true" : "false",
		};

		if (request.provider) {
			params.provider = request.provider;
		}

		if (request.unusedInputReceiver) {
			params.unusedInputReceiver = getAddress(request.unusedInputReceiver);
		}

		if (request.transferOutputToReceiver) {
			params.transferOutputToReceiver = "true";
		}

		if (request.skipSweepDepositOut) {
			params.skipSweepDepositOut = "true";
		}

		return params;
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

		const expectedVerifierAddress = this.deploymentService.getDeployment(
			request.chainId,
		).addresses.peripheryAddrs?.swapVerifier;
		if (!expectedVerifierAddress) {
			throw new Error(
				`SwapVerifier address missing for chainId ${request.chainId}`,
			);
		}
		if (
			getAddress(quote.verify.verifierAddress) !==
				getAddress(expectedVerifierAddress)
		) {
			throw new Error("SwapVerifier address mismatch");
		}

		let functionName:
			| "verifyAmountMinAndSkim"
			| "verifyDebtMax"
			| "verifyAmountMinAndTransfer";
		let amount: bigint;
		let firstArg: Address; // vault or asset depending on verification type
		let secondArg: Address; // receiver or account depending on verification type

		const adjustForInterest = (debtAmount: bigint) =>
			(debtAmount * 10_001n) / 10_000n;

		if (request.isRepay) {
			functionName = "verifyDebtMax";
			firstArg = request.receiver;
			secondArg = request.accountOut;
			if (request.swapperMode === SwapperMode.TARGET_DEBT) {
				amount = request.targetDebt || 0n;
			} else {
				amount = (request.currentDebt || 0n) - BigInt(quote.amountOutMin);
				if (amount < 0n) amount = 0n;
				amount = adjustForInterest(amount);
			}
		} else if (request.transferOutputToReceiver) {
			functionName = "verifyAmountMinAndTransfer";
			firstArg = request.tokenOut;
			secondArg = request.receiver;
			amount = BigInt(quote.amountOutMin);
		} else {
			functionName = "verifyAmountMinAndSkim";
			firstArg = request.receiver;
			secondArg = request.accountOut;
			amount = BigInt(quote.amountOutMin);
		}

		const deadline =
			request.deadline ||
			Math.floor(Date.now() / 1000) +
				(this.config.defaultDeadline || DEFAULT_DEADLINE);

		const expectedVerifierData = encodeFunctionData({
			abi: swapVerifierAbi,
			functionName,
			args: [firstArg, secondArg, amount, BigInt(deadline)],
		});

		if (quote.verify.verifierData !== expectedVerifierData) {
			throw new Error("SwapVerifier data mismatch");
		}
	}

	/**
	 * Fetches swap quotes for repaying debt by swapping collateral (e.g. withdraw collateral → swap → repay).
	 * Delegates to fetchSwapQuotes with isRepay true. fromAsset and liabilityAsset must differ.
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
	async fetchRepayQuotes(args: GetRepayQuoteArgs): Promise<SwapQuote[]> {
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
			targetDebt =
				currentDebt === liabilityAmount ? 0n : currentDebt - liabilityAmount;
			amount =
				currentDebt === liabilityAmount
					? currentDebt - targetDebt
					: liabilityAmount;
		}

		const quotes = await this.fetchSwapQuotes({
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
			unusedInputReceiver: args.unusedInputReceiver,
			provider: args.provider,
		});

		if (quotes.length === 0) {
			throw new Error("No swap quotes available");
		}

		return quotes;
	}

	/**
	 * Fetches swap quotes for swapping one asset to another and depositing into a destination vault.
	 * Delegates to fetchSwapQuotes with isRepay false and EXACT_IN mode.
	 *
	 * The swapped output tokens are always deposited into `toVault` for `toAccount` (verify type skimMin).
	 * Use `fetchSwapQuotes` directly with `transferOutputToReceiver` if you need to transfer output
	 * tokens to an address instead of depositing into a vault.
	 *
	 * `unusedInputReceiver` can redirect leftover input tokens to a wallet address instead of
	 * depositing them back into `fromVault` for `fromAccount`. When set, `fromVault` and
	 * `fromAccount` should be zero address.
	 *
	 * `skipSweepDepositOut` leaves the output tokens in the Swapper contract instead of depositing.
	 * Useful when the Swapper is the receiver and further processing is needed.
	 *
	 * @param args - Deposit/collateral-swap quote arguments
	 * @param args.chainId - Chain ID
	 * @param args.fromVault - Vault to withdraw collateral from (source). Use zero address when `unusedInputReceiver` is set.
	 * @param args.toVault - Vault to deposit swapped tokens into (destination, receiver)
	 * @param args.fromAccount - Sub-account that holds the collateral in fromVault. Use zero address when `unusedInputReceiver` is set.
	 * @param args.toAccount - Sub-account that will hold the new collateral in toVault
	 * @param args.fromAsset - Underlying asset of fromVault (tokenIn)
	 * @param args.toAsset - Underlying asset of toVault (tokenOut)
	 * @param args.amount - Amount of fromAsset to swap (exact-in)
	 * @param args.origin - EOA sending the transaction
	 * @param args.slippage - Slippage in percent (0–50)
	 * @param args.deadline - Quote deadline timestamp in seconds (optional)
	 * @param args.unusedInputReceiver - Address to receive unused input tokens instead of depositing back to fromVault/fromAccount (optional)
	 * @param args.skipSweepDepositOut - If true, output tokens are left in the Swapper (no deposit of output). (optional)
	 * @returns Promise of array of swap quotes (verify type skimMin). Throws if slippage invalid or no quotes.
	 */
	async fetchDepositQuote(args: GetDepositQuoteArgs): Promise<SwapQuote[]> {
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

		const quotes = await this.fetchSwapQuotes({
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
			unusedInputReceiver: args.unusedInputReceiver,
			skipSweepDepositOut: args.skipSweepDepositOut,
			provider: args.provider,
		});

		if (quotes.length === 0) {
			throw new Error("No swap quotes available");
		}

		return quotes;
	}

	/**
	 * Fetches swap quotes for swapping a wallet token into another wallet token.
	 * Delegates to fetchSwapQuotes with zero-address vault/account placeholders,
	 * `unusedInputReceiver` set to origin, `skipSweepDepositOut` enabled, and
	 * `transferOutputToReceiver` enabled so the output is transferred to `receiver`.
	 *
	 * This helper is designed to pair with executionService.planSwapFromWallet(),
	 * which pulls the input token from the sender wallet via SwapVerifier.transferFromSender.
	 *
	 * @param args - Wallet-to-wallet swap quote arguments
	 * @param args.chainId - Chain ID
	 * @param args.fromAsset - Wallet token to sell (tokenIn)
	 * @param args.toAsset - Wallet token to buy (tokenOut)
	 * @param args.amount - Amount of fromAsset to swap (exact-in)
	 * @param args.receiver - Address that receives the output token
	 * @param args.origin - EOA sending the transaction and later authorizing transferFromSender
	 * @param args.slippage - Slippage in percent (0–50)
	 * @param args.deadline - Quote deadline timestamp in seconds (optional)
	 * @returns Promise of array of swap quotes (verify type transferMin). Throws if slippage invalid or no quotes.
	 */
	async fetchWalletSwapQuote(args: GetWalletSwapQuoteArgs): Promise<SwapQuote[]> {
		const {
			chainId,
			fromAsset,
			toAsset,
			amount,
			receiver,
			origin,
			slippage,
			deadline,
		} = args;

		this.validateSlippage(slippage);

		const quotes = await this.fetchSwapQuotes({
			chainId,
			tokenIn: fromAsset,
			tokenOut: toAsset,
			accountIn: zeroAddress,
			accountOut: zeroAddress,
			amount,
			vaultIn: zeroAddress,
			receiver,
			origin,
			slippage,
			swapperMode: SwapperMode.EXACT_IN,
			isRepay: false,
			targetDebt: 0n,
			currentDebt: 0n,
			deadline: deadline ?? 0,
			unusedInputReceiver: origin,
			transferOutputToReceiver: true,
			skipSweepDepositOut: true,
			provider: args.provider,
		});

		if (quotes.length === 0) {
			throw new Error("No swap quotes available");
		}

		return quotes;
	}

	private validateSlippage(slippage: number): void {
		if (
			slippage === undefined ||
			!Number.isFinite(slippage) ||
			slippage > MAX_SLIPPAGE ||
			slippage < 0
		) {
			throw new Error(
				"Valid slippage between 0 and 50% must be provided for swap",
			);
		}
	}

	private validateSlippageData(
		request: SwapQuoteRequest,
		quote: SwapQuote,
	): void {
		if (request.swapperMode === SwapperMode.TARGET_DEBT) {
			const amountIn = BigInt(quote.amountIn);
			const amountInMax = BigInt(quote.amountInMax);
			const expectedAmountInMax = this.applySlippageToInput(
				amountIn,
				request.slippage,
			);
			const allowedAmountInMax = this.applyInputValidationTolerance(
				expectedAmountInMax,
			);

			if (amountInMax > allowedAmountInMax) {
				throw new Error("Swap quote amountInMax exceeds requested slippage");
			}
		} else {
			const amountOut = BigInt(quote.amountOut);
			const amountOutMin = BigInt(quote.amountOutMin);
			const expectedAmountOutMin = this.applySlippageToOutput(
				amountOut,
				request.slippage,
			);
			const allowedAmountOutMin = this.applyOutputValidationTolerance(
				expectedAmountOutMin,
			);

			if (amountOutMin < allowedAmountOutMin) {
				throw new Error("Swap quote amountOutMin exceeds requested slippage");
			}
		}
	}

	private applyOutputValidationTolerance(amount: bigint): bigint {
		return (
			amount *
			(SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR -
				SLIPPAGE_VALIDATION_TOLERANCE_UNITS)
		) / SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR;
	}

	private applyInputValidationTolerance(amount: bigint): bigint {
		return (
			amount *
				(SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR +
					SLIPPAGE_VALIDATION_TOLERANCE_UNITS) +
			SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR -
			1n
		) / SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR;
	}

	private applySlippageToOutput(amount: bigint, slippage: number): bigint {
		const { slippageUnits, denominator } = this.parseSlippagePercent(slippage);
		return (amount * (denominator - slippageUnits)) / denominator;
	}

	private applySlippageToInput(amount: bigint, slippage: number): bigint {
		const { slippageUnits, denominator } = this.parseSlippagePercent(slippage);
		return (amount * (denominator + slippageUnits) + denominator - 1n) /
			denominator;
	}

	private parseSlippagePercent(slippage: number): {
		slippageUnits: bigint;
		denominator: bigint;
	} {
		const slippageString = slippage.toLocaleString("en-US", {
			useGrouping: false,
			maximumFractionDigits: 20,
		});
		const [whole = "0", fraction = ""] = slippageString.split(".");
		const scale = 10n ** BigInt(fraction.length);
		const slippageUnits = BigInt(whole) * scale + BigInt(fraction || "0");

		return {
			slippageUnits,
			denominator: 100n * scale,
		};
	}
}
