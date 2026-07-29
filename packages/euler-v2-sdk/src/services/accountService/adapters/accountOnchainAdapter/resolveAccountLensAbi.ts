import type { Abi } from "viem";
import type { IABIService } from "../../../abiService/index.js";
import { accountLensAbi } from "./abis/accountLensAbi.js";

/** The AccountLens functions the SDK encodes and decodes. */
const DEFAULT_REQUIRED_FUNCTIONS = [
	"getEVCAccountInfo",
	"getVaultAccountInfo",
] as const;

const bundledAccountLensAbi = accountLensAbi as unknown as Abi;

export interface ResolvedAccountLensAbi {
	abi: Abi;
	/**
	 * Set when the runtime ABI could not be used and the bundled copy was
	 * substituted, e.g. the ABI document is unreachable or is missing the
	 * functions this SDK calls.
	 */
	fallbackReason?: string;
}

const missingFunctions = (
	abi: Abi,
	requiredFunctions: readonly string[],
): string[] =>
	requiredFunctions.filter(
		(name) =>
			!abi.some((item) => item.type === "function" && item.name === name),
	);

/**
 * Resolves the AccountLens ABI used for onchain reads.
 *
 * Deployment addresses are loaded from the mutable `euler-interfaces` document,
 * so the ABI is resolved from the same source to keep the two in step: a lens
 * redeployed with a changed return tuple keeps the same function selector, and
 * decoding it with the compiled-in ABI would silently misread the response.
 *
 * The bundled ABI remains a fallback. An unreachable, rate-limited, or
 * incomplete ABI document must degrade to the compiled-in copy rather than take
 * down every AccountLens read; callers that have a diagnostics channel should
 * surface `fallbackReason` on it.
 */
export async function resolveAccountLensAbi(
	abiService: IABIService | undefined,
	chainId: number,
	requiredFunctions: readonly string[] = DEFAULT_REQUIRED_FUNCTIONS,
): Promise<ResolvedAccountLensAbi> {
	if (!abiService) return { abi: bundledAccountLensAbi };

	try {
		const abi = await abiService.fetchABI(chainId, "AccountLens");
		const missing = missingFunctions(abi, requiredFunctions);
		if (missing.length > 0) {
			return {
				abi: bundledAccountLensAbi,
				fallbackReason: `Runtime AccountLens ABI is missing ${missing.join(", ")}; using the bundled ABI.`,
			};
		}

		return { abi };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return {
			abi: bundledAccountLensAbi,
			fallbackReason: `Failed to resolve the runtime AccountLens ABI (${reason}); using the bundled ABI.`,
		};
	}
}
