import {
	encodeAbiParameters,
	encodeFunctionData,
	getAddress,
	type Address,
	type Hex,
} from "viem";
import {
	swapperAbi,
	swapVerifierAbi,
	type EVCBatchItem,
} from "../../executionService/index.js";
import {
	SwapVerificationType,
	type SwapQuote,
} from "../../swapService/index.js";
import { validateSwapQuoteVerifierData } from "../../swapService/swapVerification.js";

export const BPS_SCALE = 10_000n;
export const SWAPPER_MODE_EXACT_IN = 0n;
export const SWAPPER_HANDLER_GENERIC =
	"0x47656e6572696300000000000000000000000000000000000000000000000000" as const;

const GENERIC_HANDLER_DATA_ABI = [
	{ name: "target", type: "address" },
	{ name: "payload", type: "bytes" },
] as const;

export type PermitSignature = {
	v: number;
	r: Hex;
	s: Hex;
};

export function applyBuffer(amount: bigint, bufferBps: bigint): bigint {
	return (amount * (BPS_SCALE + bufferBps) + BPS_SCALE - 1n) / BPS_SCALE;
}

export function assertSameAddress(
	actual: Address,
	expected: Address,
	message: string,
) {
	if (getAddress(actual) !== getAddress(expected)) {
		throw new Error(
			`${message}: ${getAddress(actual)} != ${getAddress(expected)}`,
		);
	}
}

export function splitPermitSignature(signature: Hex): PermitSignature {
	if (signature.length !== 132) {
		throw new Error("Authorization signature must be 65 bytes");
	}

	let v = Number.parseInt(signature.slice(130, 132), 16);
	if (v < 27) v += 27;

	return {
		r: signature.slice(0, 66) as Hex,
		s: `0x${signature.slice(66, 130)}` as Hex,
		v,
	};
}

export function getSwapQuoteInputAmount(quote: SwapQuote): bigint {
	const amountInMax = BigInt(quote.amountInMax || 0);
	return amountInMax > 0n ? amountInMax : BigInt(quote.amountIn);
}

export function assertSwapQuoteUsesSwapper(
	quote: SwapQuote,
	swapper: Address,
	label: string,
): void {
	assertSameAddress(
		quote.swap.swapperAddress,
		swapper,
		`${label} swap quote must use the Euler Swapper`,
	);
}

export function getSwapQuoteSwapCalls(quote: SwapQuote, label: string): Hex[] {
	const calls = quote.swap.multicallItems
		.filter((item) => item.functionName === "swap")
		.map((item) => item.data);

	if (calls.length === 0) {
		throw new Error(`${label} swap quote must contain Swapper swap calldata`);
	}

	return calls;
}

export function encodeGenericSwap(args: {
	target: Address;
	tokenIn: Address;
	tokenOut: Address;
	payload: Hex;
}): Hex {
	return encodeFunctionData({
		abi: swapperAbi,
		functionName: "swap",
		args: [
			{
				handler: SWAPPER_HANDLER_GENERIC,
				mode: SWAPPER_MODE_EXACT_IN,
				account: args.target,
				tokenIn: args.tokenIn,
				tokenOut: args.tokenOut,
				vaultIn: args.target,
				accountIn: args.target,
				receiver: args.target,
				amountOut: 0n,
				data: encodeAbiParameters(GENERIC_HANDLER_DATA_ABI, [
					args.target,
					args.payload,
				]),
			},
		],
	});
}

export function encodeVerifyAmountMinAndDepositItem(args: {
	swapVerifier: Address;
	onBehalfOfAccount: Address;
	vault: Address;
	receiver: Address;
	amountMin: bigint;
	deadline: bigint;
}): EVCBatchItem {
	return {
		targetContract: args.swapVerifier,
		onBehalfOfAccount: args.onBehalfOfAccount,
		value: 0n,
		data: encodeFunctionData({
			abi: swapVerifierAbi,
			functionName: "verifyAmountMinAndDeposit",
			args: [args.vault, args.receiver, args.amountMin, args.deadline],
		}),
	};
}

export function encodeVerifyDebtMaxItem(args: {
	swapVerifier: Address;
	onBehalfOfAccount: Address;
	vault: Address;
	account: Address;
	amountMax: bigint;
	deadline: bigint;
}): EVCBatchItem {
	return {
		targetContract: args.swapVerifier,
		onBehalfOfAccount: args.onBehalfOfAccount,
		value: 0n,
		data: encodeFunctionData({
			abi: swapVerifierAbi,
			functionName: "verifyDebtMax",
			args: [args.vault, args.account, args.amountMax, args.deadline],
		}),
	};
}

/**
 * Verification item for a collateral swap into an EVault target: validates the
 * quote's own SkimMin verifier payload and emits it. The swap output is routed
 * to the target vault and credited via `skim`.
 */
export function encodeSwapQuoteVerificationItem(args: {
	quote: SwapQuote;
	swapVerifier: Address;
	vault: Address;
	account: Address;
	deadline: bigint;
	label: string;
}): EVCBatchItem {
	validateSwapQuoteVerifierData({
		quote: args.quote,
		expectedVerifierAddress: args.swapVerifier,
		verification: {
			type: SwapVerificationType.SkimMin,
			vault: args.vault,
			account: args.account,
			deadline: args.deadline,
		},
	});
	const onBehalfOfAccount = getAddress(
		args.quote.verify.account || args.quote.accountOut,
	);
	assertSameAddress(
		onBehalfOfAccount,
		args.account,
		`${args.label} verifier account must match the Euler account`,
	);

	return {
		targetContract: getAddress(args.quote.verify.verifierAddress),
		onBehalfOfAccount,
		value: 0n,
		data: args.quote.verify.verifierData,
	};
}

/**
 * Verification item for a collateral swap into a generic ERC-4626 target
 * (e.g. EulerEarn) that has no `skim`: the quote must be requested with
 * `transferOutputToReceiver` so its Swapper calldata delivers the output to
 * the SwapVerifier, whose balance is then slippage-checked and deposited into
 * the target via `verifyAmountMinAndDeposit`. The quote's own TransferMin
 * verifier payload is validated for integrity but intentionally not emitted —
 * it is replaced by the deposit item.
 */
export function encodeDepositVerifiedSwapQuoteItem(args: {
	quote: SwapQuote;
	swapVerifier: Address;
	vault: Address;
	account: Address;
	onBehalfOfAccount: Address;
	deadline: bigint;
	label: string;
}): EVCBatchItem {
	const amountMin = BigInt(args.quote.amountOutMin || 0);
	if (amountMin <= 0n) {
		throw new Error(
			`${args.label} swap quote must include a positive minimum output`,
		);
	}
	if (!args.quote.transferOutputToReceiver) {
		throw new Error(
			`${args.label} swap quote must be requested with transferOutputToReceiver`,
		);
	}
	validateSwapQuoteVerifierData({
		quote: args.quote,
		expectedVerifierAddress: args.swapVerifier,
		verification: {
			type: SwapVerificationType.TransferMin,
			vault: getAddress(args.quote.receiver),
			transferAsset: getAddress(args.quote.tokenOut.address),
			deadline: BigInt(args.quote.verify.deadline ?? 0),
		},
	});

	return encodeVerifyAmountMinAndDepositItem({
		swapVerifier: args.swapVerifier,
		onBehalfOfAccount: args.onBehalfOfAccount,
		vault: args.vault,
		receiver: args.account,
		amountMin,
		deadline: args.deadline,
	});
}
