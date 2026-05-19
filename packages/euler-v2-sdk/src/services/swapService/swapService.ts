import { getAddress, zeroAddress } from "viem";
import { applyBuildQuery, type BuildQueryFn } from "../../utils/buildQuery.js";
import type { IDeploymentService } from "../deploymentService/index.js";
import {
	buildClosePositionQuoteAppData,
	buildCollateralSwapQuoteAppData,
	buildOpenPositionQuoteAppData,
	getCowSwapChainConfig,
} from "../executionService/cowSwapHelpers.js";
import type {
	GetDepositQuoteArgs,
	GetRepayQuoteArgs,
	GetWalletSwapQuoteArgs,
	SwapProviderExtraData,
	SwapProvidersApiResponse,
	SwapQuote,
	SwapQuoteRequest,
	SwapsApiResponse,
} from "./swapServiceTypes.js";
import { SwapperMode, SwapVerificationType } from "./swapServiceTypes.js";
import {
	adjustForInterest,
	validateSwapQuoteVerifierData,
} from "./swapVerification.js";
import { getAllowedSwapperAddresses } from "./swapAllowlist.js";

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
const COWSWAP_ORDER_DEADLINE_SECONDS = 900;
const COWSWAP_PROVIDER_NAME = "cow";
const COWSWAP_PROVIDER_LABEL = "cow swap";
const CLOSE_POSITION_FULL_REPAY_BUY_AMOUNT_BUFFER_DENOMINATOR = 100_000n;
const MAX_SLIPPAGE = 50;
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
		if (request.swapperMode === SwapperMode.EXACT_OUT) {
			throw new Error("EXACT_OUT swap quotes are not supported");
		}
		const params = this.buildRequestParams(request);
		const validatedRequest = {
			...request,
			deadline: Number(params.deadline),
		};
		const searchParams = new URLSearchParams(params);

		const jsonData = await this.querySwapQuotes(
			`${this.config.swapApiUrl}/swaps?${searchParams.toString()}`,
		);

		if (!jsonData.success) {
			throw new Error("Swap API returned unsuccessful response");
		}

		// Validate verifier and slippage data for each quote
		for (const [index, quote] of jsonData.data.entries()) {
			try {
				this.validateQuoteMatchesRequest(validatedRequest, quote);
				this.validateVerifierData(validatedRequest, quote);
				this.validateCowSwapQuoteMatchesRequest(validatedRequest, quote);
			} catch (error) {
				const route = quote.route
					.map((hop) => hop.providerName)
					.filter(Boolean)
					.join(" -> ");
				const context = [
					`quote #${index + 1}`,
					route ? `route=${route}` : undefined,
					`amountIn=${quote.amountIn}`,
					`amountOut=${quote.amountOut}`,
					quote.providerData
						? `providerData=${JSON.stringify(quote.providerData)}`
						: undefined,
				]
					.filter(Boolean)
					.join(", ");
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(
					`Swap quote validation failed (${context}): ${message}`,
				);
			}
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

		if (request.providerExtraData) {
			params.providerExtraData = JSON.stringify(
				request.providerExtraData,
				(_key, value) => (typeof value === "bigint" ? value.toString() : value),
			);
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

		validateSwapQuoteVerifierData({
			quote,
			swapperMode: request.swapperMode,
			isRepay: request.isRepay,
			requestedSlippage: request.slippage,
			targetDebt: request.targetDebt,
			currentDebt: request.currentDebt,
			expectedVerifierAddress,
			verification: {
				type: request.isRepay
					? SwapVerificationType.DebtMax
					: request.transferOutputToReceiver
						? SwapVerificationType.TransferMin
						: SwapVerificationType.SkimMin,
				vault: request.receiver,
				account: request.accountOut,
				transferAsset: request.tokenOut,
				deadline: request.deadline,
			},
		});
	}

	private validateQuoteMatchesRequest(
		request: SwapQuoteRequest,
		quote: SwapQuote,
	): void {
		this.assertAddressField("tokenIn", quote.tokenIn.address, request.tokenIn);
		this.assertAddressField(
			"tokenOut",
			quote.tokenOut.address,
			request.tokenOut,
		);
		this.assertAddressField("accountIn", quote.accountIn, request.accountIn);
		this.assertAddressField("accountOut", quote.accountOut, request.accountOut);
		this.assertAddressField("vaultIn", quote.vaultIn, request.vaultIn);
		this.assertAddressField("receiver", quote.receiver, request.receiver);

		if (quote.tokenIn.chainId !== request.chainId) {
			throw new Error("Swap quote tokenIn.chainId mismatch");
		}
		if (quote.tokenOut.chainId !== request.chainId) {
			throw new Error("Swap quote tokenOut.chainId mismatch");
		}

		const isCowWrapperQuote =
			!!request.providerExtraData && this.isCowSwapQuote(quote);
		if (!isCowWrapperQuote && request.swapperMode === SwapperMode.EXACT_IN) {
			this.assertBigIntField("amountIn", quote.amountIn, request.amount);
		} else if (
			!isCowWrapperQuote &&
			request.swapperMode === SwapperMode.EXACT_OUT
		) {
			this.assertBigIntField("amountOut", quote.amountOut, request.amount);
		}

		if (
			Boolean(quote.transferOutputToReceiver) !==
			Boolean(request.transferOutputToReceiver)
		) {
			throw new Error("Swap quote transferOutputToReceiver mismatch");
		}

		// Compare against the chain's full canonical swapper allowlist
		// (peripheryAddrs.swapper + eulerSwapAddrs.eulerSwapV{1,2}Periphery).
		// Older versions only checked peripheryAddrs.swapper, which rejected
		// quotes routed through the EulerSwap periphery contracts.
		const deploymentAddresses = this.deploymentService.getDeployment(
			request.chainId,
		).addresses;
		const allowedSwappers = getAllowedSwapperAddresses({
			swapper: deploymentAddresses.peripheryAddrs?.swapper,
			eulerSwapV1Periphery:
				deploymentAddresses.eulerSwapAddrs?.eulerSwapV1Periphery,
			eulerSwapV2Periphery:
				deploymentAddresses.eulerSwapAddrs?.eulerSwapV2Periphery,
		});
		if (allowedSwappers.length > 0) {
			const quoteSwapper = getAddress(quote.swap.swapperAddress).toLowerCase();
			if (!allowedSwappers.includes(quoteSwapper)) {
				throw new Error(
					`Swap quote swap.swapperAddress (${quote.swap.swapperAddress}) is not in the canonical allowlist: ${allowedSwappers.join(", ")}`,
				);
			}
		}

		const expectedVerificationType = request.isRepay
			? SwapVerificationType.DebtMax
			: request.transferOutputToReceiver
				? SwapVerificationType.TransferMin
				: SwapVerificationType.SkimMin;
		if (quote.verify.type !== expectedVerificationType) {
			throw new Error("Swap quote verify.type mismatch");
		}

		const expectedVerificationAccount =
			expectedVerificationType === SwapVerificationType.TransferMin
				? zeroAddress
				: request.accountOut;
		this.assertAddressField(
			"verify.vault",
			quote.verify.vault,
			request.receiver,
		);
		this.assertAddressField(
			"verify.account",
			quote.verify.account,
			expectedVerificationAccount,
		);
		this.assertBigIntField(
			"verify.amount",
			quote.verify.amount,
			this.getExpectedVerifierAmount(request, quote),
		);
		if (quote.verify.deadline !== request.deadline) {
			throw new Error("Swap quote verify.deadline mismatch");
		}
	}

	private validateCowSwapQuoteMatchesRequest(
		request: SwapQuoteRequest,
		quote: SwapQuote,
	): void {
		if (!request.providerExtraData) return;
		this.validateSupportedCowSwapRequest(request);
		const isCowQuote = this.isCowSwapQuote(quote);
		if (
			!isCowQuote &&
			request.provider &&
			this.isCowSwapProviderName(request.provider)
		) {
			throw new Error(`CoW quote route must include ${COWSWAP_PROVIDER_NAME}`);
		}
		if (!isCowQuote) return;

		const quoteId = this.normalizeCowSwapQuoteId(quote.providerData?.quoteId);
		if (quoteId === undefined) {
			throw new Error(
				`CoW quote providerData.quoteId missing or invalid: ${String(
					quote.providerData?.quoteId,
				)}`,
			);
		}
		quote.providerData = { ...quote.providerData, quoteId };

		const sellAmount = this.parseCowSwapProviderAmount(
			"providerData.sellAmount",
			quote.providerData?.sellAmount,
		);
		const feeAmount = this.parseCowSwapProviderAmount(
			"providerData.feeAmount",
			quote.providerData?.feeAmount,
		);
		const buyAmount = this.parseCowSwapProviderAmount(
			"providerData.buyAmount",
			quote.providerData?.buyAmount,
		);

		if (sellAmount <= 0n || buyAmount <= 0n) {
			throw new Error("CoW quote order amount must be positive");
		}

		if (request.swapperMode === SwapperMode.TARGET_DEBT) {
			this.assertBigIntValue(
				"providerData.buyAmount",
				buyAmount,
				this.getExpectedCowSwapBuyAmount(request),
			);
			return;
		}

		const actualSellAmount = sellAmount + feeAmount;
		const expectedSellAmount = this.getExpectedCowSwapSellAmount(request);
		if (actualSellAmount !== expectedSellAmount) {
			throw new Error(
				`CoW quote providerData sell total mismatch: providerData.sellAmount (${sellAmount}) + providerData.feeAmount (${feeAmount}) = ${actualSellAmount}, expected ${expectedSellAmount}`,
			);
		}
	}

	private validateSupportedCowSwapRequest(request: SwapQuoteRequest): void {
		if (
			request.providerExtraData?.type === "closePosition" &&
			request.swapperMode === SwapperMode.TARGET_DEBT &&
			request.isRepay
		) {
			return;
		}

		if (
			(request.providerExtraData?.type === "openPosition" ||
				request.providerExtraData?.type === "collateralSwap") &&
			request.swapperMode === SwapperMode.EXACT_IN &&
			!request.isRepay
		) {
			return;
		}

		throw new Error("Unsupported CoW quote request");
	}

	private getExpectedCowSwapSellAmount(request: SwapQuoteRequest): bigint {
		if (request.providerExtraData?.type === "collateralSwap") {
			const sharesAmount =
				request.providerExtraData.swapCollateralSharesAmountIn;
			if (sharesAmount === undefined || sharesAmount <= 0n) {
				throw new Error("CoW quote collateral swap sell amount missing");
			}
			return sharesAmount;
		}
		return request.amount;
	}

	private getExpectedCowSwapBuyAmount(request: SwapQuoteRequest): bigint {
		if (
			request.providerExtraData?.type === "closePosition" &&
			request.targetDebt === 0n
		) {
			return (
				request.currentDebt +
				request.currentDebt /
					CLOSE_POSITION_FULL_REPAY_BUY_AMOUNT_BUFFER_DENOMINATOR
			);
		}
		return request.amount;
	}

	private parseCowSwapProviderAmount(field: string, value: unknown): bigint {
		if (typeof value !== "string" || !/^\d+$/.test(value)) {
			throw new Error(
				`CoW quote ${field} missing or invalid: ${String(value)}`,
			);
		}
		return BigInt(value);
	}

	private normalizeCowSwapQuoteId(quoteId: unknown): number | undefined {
		if (
			typeof quoteId === "number" &&
			Number.isSafeInteger(quoteId) &&
			quoteId >= 0
		) {
			return quoteId;
		}
		if (typeof quoteId === "string" && /^\d+$/.test(quoteId)) {
			const parsed = Number(quoteId);
			if (Number.isSafeInteger(parsed)) return parsed;
		}
		return undefined;
	}

	private isCowSwapQuote(quote: SwapQuote): boolean {
		return quote.route.some((hop) =>
			this.isCowSwapProviderName(hop.providerName),
		);
	}

	private getExpectedVerifierAmount(
		request: SwapQuoteRequest,
		quote: SwapQuote,
	): bigint {
		if (!request.isRepay) {
			return BigInt(quote.amountOutMin);
		}
		if (request.swapperMode === SwapperMode.TARGET_DEBT) {
			return request.targetDebt;
		}
		const remainingDebt = request.currentDebt - BigInt(quote.amountOutMin);
		return adjustForInterest(remainingDebt > 0n ? remainingDebt : 0n);
	}

	private assertAddressField(
		field: string,
		actual: string,
		expected: string,
	): void {
		if (getAddress(actual) !== getAddress(expected)) {
			throw new Error(`Swap quote ${field} mismatch`);
		}
	}

	private assertBigIntField(
		field: string,
		actual: string,
		expected: bigint,
	): void {
		this.assertBigIntValue(field, BigInt(actual), expected);
	}

	private assertBigIntValue(
		field: string,
		actual: bigint,
		expected: bigint,
	): void {
		if (actual !== expected) {
			throw new Error(
				`Swap quote ${field} mismatch: actual ${actual}, expected ${expected}`,
			);
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

		const resolvedDeadline =
			deadline ??
			(args.providerExtraData ||
			this.shouldBuildCowProviderExtraData(args.provider, args.cowSwap)
				? this.getCowSwapDeadline()
				: 0);
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
			deadline: resolvedDeadline,
			unusedInputReceiver: args.unusedInputReceiver,
			provider: args.provider,
			providerExtraData:
				args.providerExtraData ??
				this.buildRepayCowSwapProviderExtraData(args, resolvedDeadline),
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

		const resolvedDeadline =
			deadline ??
			(args.providerExtraData ||
			this.shouldBuildCowProviderExtraData(args.provider, args.cowSwap)
				? this.getCowSwapDeadline()
				: 0);
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
			deadline: resolvedDeadline,
			unusedInputReceiver: args.unusedInputReceiver,
			skipSweepDepositOut: args.skipSweepDepositOut,
			provider: args.provider,
			providerExtraData:
				args.providerExtraData ??
				this.buildDepositCowSwapProviderExtraData(args, resolvedDeadline),
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
	async fetchWalletSwapQuote(
		args: GetWalletSwapQuoteArgs,
	): Promise<SwapQuote[]> {
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
			providerExtraData: args.providerExtraData,
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

	private buildDepositCowSwapProviderExtraData(
		args: GetDepositQuoteArgs,
		deadline: number,
	): SwapProviderExtraData | undefined {
		if (!this.shouldBuildCowProviderExtraData(args.provider, args.cowSwap)) {
			return undefined;
		}
		const chainConfig = this.getRequiredCowSwapChainConfig(args.chainId);

		if (args.cowSwap?.type === "openPosition") {
			return {
				type: "openPosition",
				appData: buildOpenPositionQuoteAppData(
					{
						owner: args.cowSwap.owner,
						account: args.fromAccount,
						deadline,
						collateralVault: args.cowSwap.collateralVault,
						borrowVault: args.fromVault,
						collateralAmount: args.cowSwap.collateralAmount,
						borrowAmount: args.amount,
					},
					chainConfig.openPositionWrapper,
					this.getSlippageBips(args.slippage),
				),
			};
		}

		if (args.cowSwap?.type === "collateralSwap") {
			return {
				type: "collateralSwap",
				swapCollateralSharesAmountIn: args.cowSwap.sharesAmount,
				appData: buildCollateralSwapQuoteAppData(
					{
						owner: args.cowSwap.owner,
						account: args.toAccount,
						deadline,
						fromVault: args.fromVault,
						toVault: args.toVault,
						fromAmount: args.cowSwap.sharesAmount,
						disableSourceCollateral:
							args.cowSwap.disableSourceCollateral ?? false,
					},
					chainConfig.collateralSwapWrapper,
					this.getSlippageBips(args.slippage),
				),
			};
		}

		return undefined;
	}

	private buildRepayCowSwapProviderExtraData(
		args: GetRepayQuoteArgs,
		deadline: number,
	): SwapProviderExtraData | undefined {
		if (!this.shouldBuildCowProviderExtraData(args.provider, args.cowSwap)) {
			return undefined;
		}
		const chainConfig = this.getRequiredCowSwapChainConfig(args.chainId);

		return {
			type: "closePosition",
			appData: buildClosePositionQuoteAppData(
				{
					owner: args.cowSwap.owner,
					account: args.toAccount,
					deadline,
					borrowVault: args.liabilityVault,
					collateralVault: args.fromVault,
					collateralAmount: args.cowSwap.collateralSharesAmount,
				},
				chainConfig.closePositionWrapper,
				this.getSlippageBips(args.slippage),
			),
		};
	}

	private shouldBuildCowProviderExtraData(
		provider: string | undefined,
		cowSwap: GetDepositQuoteArgs["cowSwap"] | GetRepayQuoteArgs["cowSwap"],
	): cowSwap is NonNullable<
		GetDepositQuoteArgs["cowSwap"] | GetRepayQuoteArgs["cowSwap"]
	> {
		return !!cowSwap && (!provider || this.isCowSwapProviderName(provider));
	}

	private getCowSwapDeadline(deadline?: number): number {
		return (
			deadline ?? Math.floor(Date.now() / 1000) + COWSWAP_ORDER_DEADLINE_SECONDS
		);
	}

	private getSlippageBips(slippage: number): number {
		return Math.round(slippage * 100);
	}

	private getRequiredCowSwapChainConfig(chainId: number) {
		const chainConfig = getCowSwapChainConfig(chainId);
		if (!chainConfig) {
			throw new Error(`CoW Swap not supported on chain ${chainId}`);
		}
		return chainConfig;
	}

	private isCowSwapProviderName(provider: string): boolean {
		const providerName = provider.toLowerCase();
		return (
			providerName === COWSWAP_PROVIDER_NAME ||
			providerName === COWSWAP_PROVIDER_LABEL
		);
	}
}
