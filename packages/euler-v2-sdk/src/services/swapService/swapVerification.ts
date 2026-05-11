import { type Address, encodeFunctionData, getAddress, type Hex } from "viem";
import {
	SwapperMode,
	type SwapQuote,
	SwapVerificationType,
} from "./swapServiceTypes.js";
import { swapVerifierAbi } from "./swapVerifierAbi.js";

const INTEREST_CUSHION_NUMERATOR = 10_001n;
const INTEREST_CUSHION_DENOMINATOR = 10_000n;
const MAX_SLIPPAGE = 50;
const SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR = 10_000n;
const SLIPPAGE_VALIDATION_TOLERANCE_UNITS = 1n;

export type SwapVerifierBuildArgs = {
	quote: SwapQuote;
	swapperMode?: SwapperMode;
	isRepay?: boolean;
	requestedSlippage?: number;
	targetDebt?: bigint;
	currentDebt?: bigint;
	verification?: {
		type?: SwapVerificationType;
		vault?: Address;
		account?: Address;
		transferAsset?: Address;
		deadline?: number;
	};
};

export function getSwapInputAmount(
	quote: SwapQuote,
	swapperMode?: SwapperMode,
): bigint {
	const amountIn = BigInt(quote.amountIn || 0);
	const amountInMax = BigInt(quote.amountInMax || 0);
	if (swapperMode === SwapperMode.EXACT_IN) return amountIn;
	if (swapperMode === undefined)
		return amountInMax > 0n ? amountInMax : amountIn;
	return amountInMax > 0n ? amountInMax : amountIn;
}

export function adjustForInterest(amount: bigint): bigint {
	return (amount * INTEREST_CUSHION_NUMERATOR) / INTEREST_CUSHION_DENOMINATOR;
}

export function buildSwapVerifierData({
	quote,
	swapperMode,
	isRepay,
	requestedSlippage,
	targetDebt,
	currentDebt,
	verification,
}: SwapVerifierBuildArgs): Hex {
	const verificationType =
		verification?.type ??
		(isRepay ? SwapVerificationType.DebtMax : quote.verify.type);
	const resolvedSwapperMode =
		swapperMode ??
		(verificationType === SwapVerificationType.DebtMax
			? undefined
			: SwapperMode.EXACT_IN);

	validateSwapQuoteSlippageData(
		{
			slippage: requestedSlippage ?? quote.slippage,
			swapperMode: resolvedSwapperMode,
		},
		quote,
	);

	const verificationVault = verification?.vault ?? quote.verify.vault;
	const verificationAccount = verification?.account ?? quote.verify.account;
	const deadline = BigInt(verification?.deadline ?? quote.verify.deadline ?? 0);

	if (verificationType === SwapVerificationType.DebtMax) {
		const amountMax =
			swapperMode === undefined
				? BigInt(quote.verify.amount || 0)
				: swapperMode === SwapperMode.TARGET_DEBT
					? (targetDebt ?? BigInt(quote.verify.amount || 0))
					: currentDebt === undefined
						? BigInt(quote.verify.amount || 0)
						: adjustForInterest(
								maxBigInt(currentDebt - BigInt(quote.amountOutMin || 0), 0n),
							);

		return encodeFunctionData({
			abi: swapVerifierAbi,
			functionName: "verifyDebtMax",
			args: [verificationVault, verificationAccount, amountMax, deadline],
		});
	}

	const amountMin = BigInt(quote.amountOutMin || 0);
	if (verificationType === SwapVerificationType.TransferMin) {
		return encodeFunctionData({
			abi: swapVerifierAbi,
			functionName: "verifyAmountMinAndTransfer",
			args: [
				verification?.transferAsset ?? quote.tokenOut.address,
				verificationVault,
				amountMin,
				deadline,
			],
		});
	}

	return encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyAmountMinAndSkim",
		args: [verificationVault, verificationAccount, amountMin, deadline],
	});
}

export function validateSwapQuoteVerifierData(
	args: SwapVerifierBuildArgs & { expectedVerifierAddress?: Address },
): Hex {
	if (
		args.expectedVerifierAddress &&
		getAddress(args.quote.verify.verifierAddress) !==
			getAddress(args.expectedVerifierAddress)
	) {
		throw new Error("SwapVerifier address mismatch");
	}

	const verifierData = buildSwapVerifierData(args);
	if (
		verifierData.toLowerCase() !== args.quote.verify.verifierData.toLowerCase()
	) {
		throw new Error("SwapVerifier data mismatch");
	}

	return verifierData;
}

export function validateSwapQuoteSlippageData(
	request: { slippage?: number; swapperMode?: SwapperMode },
	quote: SwapQuote,
): void {
	const { slippage } = request;
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

	if (
		request.swapperMode === SwapperMode.TARGET_DEBT ||
		request.swapperMode === SwapperMode.EXACT_OUT
	) {
		const amountIn = BigInt(quote.amountIn);
		const amountInMax = BigInt(quote.amountInMax);
		const expectedAmountInMax = applySlippageToInput(amountIn, slippage);
		const allowedAmountInMax =
			(expectedAmountInMax *
				(SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR +
					SLIPPAGE_VALIDATION_TOLERANCE_UNITS) +
				SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR -
				1n) /
			SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR;

		if (amountInMax > allowedAmountInMax) {
			throw new Error("Swap quote amountInMax exceeds requested slippage");
		}
		return;
	}

	const amountOut = BigInt(quote.amountOut);
	const amountOutMin = BigInt(quote.amountOutMin);
	const expectedAmountOutMin = applySlippageToOutput(amountOut, slippage);
	const allowedAmountOutMin =
		(expectedAmountOutMin *
			(SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR -
				SLIPPAGE_VALIDATION_TOLERANCE_UNITS)) /
		SLIPPAGE_VALIDATION_TOLERANCE_DENOMINATOR;

	if (amountOutMin < allowedAmountOutMin) {
		throw new Error("Swap quote amountOutMin exceeds requested slippage");
	}
}

function applySlippageToOutput(amount: bigint, slippage: number): bigint {
	const { slippageUnits, denominator } = parseSlippagePercent(slippage);
	return (amount * (denominator - slippageUnits)) / denominator;
}

function applySlippageToInput(amount: bigint, slippage: number): bigint {
	const { slippageUnits, denominator } = parseSlippagePercent(slippage);
	return (
		(amount * (denominator + slippageUnits) + denominator - 1n) / denominator
	);
}

function parseSlippagePercent(slippage: number): {
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

function maxBigInt(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}
