import type { Address } from "viem";

/**
 * Allowlist of canonical Euler swapper / EulerSwap periphery deployments. Any
 * `SwapQuote.swap.swapperAddress` that doesn't match one of these (or the
 * `verify.verifierAddress` that doesn't match the chain's swap verifier) is
 * rejected before we build the EVC batch — a forged quote could otherwise
 * point the EVC at an arbitrary contract that drains the sub-account.
 */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type KnownSwapAddresses = {
	swapper?: Address;
	swapVerifier?: Address;
	eulerSwapV1Periphery?: Address;
	eulerSwapV2Periphery?: Address;
	// Kept for forward-compat with deployments that expose a generic
	// `eulerSwapPeriphery` alias alongside the versioned entries.
	eulerSwapPeriphery?: Address;
};

const SWAPPER_ALLOWLIST_KEYS = [
	"swapper",
	"eulerSwapPeriphery",
	"eulerSwapV1Periphery",
	"eulerSwapV2Periphery",
] as const;

const normalizeAddress = (address: string | undefined): string | undefined => {
	if (!address) return undefined;
	const normalized = address.toLowerCase();
	return normalized === ZERO_ADDRESS ? undefined : normalized;
};

export function getAllowedSwapperAddresses(
	knownAddresses: KnownSwapAddresses | null | undefined,
): string[] {
	const allowed = new Set<string>();
	for (const key of SWAPPER_ALLOWLIST_KEYS) {
		const normalized = normalizeAddress(knownAddresses?.[key]);
		if (normalized) allowed.add(normalized);
	}
	return [...allowed];
}

export function assertSwapperAllowed(
	swapperAddress: string,
	knownAddresses: KnownSwapAddresses | null | undefined,
): void {
	const allowedSwappers = getAllowedSwapperAddresses(knownAddresses);
	if (!allowedSwappers.length) {
		throw new Error("Known swapper address not configured");
	}
	if (!allowedSwappers.includes(swapperAddress.toLowerCase())) {
		throw new Error(
			`Unknown swapper address: ${swapperAddress}. Expected one of: ${allowedSwappers.join(", ")}`,
		);
	}
}

export function assertSwapVerifierAllowed(
	swapVerifierAddress: string,
	knownSwapVerifier: string | undefined,
): void {
	if (!knownSwapVerifier) {
		throw new Error("Known swap verifier address not configured");
	}
	if (swapVerifierAddress.toLowerCase() !== knownSwapVerifier.toLowerCase()) {
		throw new Error(
			`Unknown swap verifier address: ${swapVerifierAddress}. Expected: ${knownSwapVerifier}`,
		);
	}
}

export function assertSwapQuoteContractsAllowed(
	quoteContracts: { swapperAddress: string; verifierAddress: string },
	knownAddresses: KnownSwapAddresses | null | undefined,
): void {
	assertSwapVerifierAllowed(
		quoteContracts.verifierAddress,
		knownAddresses?.swapVerifier,
	);
	assertSwapperAllowed(quoteContracts.swapperAddress, knownAddresses);
}
