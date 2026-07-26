import {
	decodeFunctionResult,
	encodeFunctionData,
	type Abi,
	type Address,
	type Hash,
	type Hex,
	type PublicClient,
} from "viem";

export type EVaultExactReadContext = {
	blockHash: Hash;
	blockNumber: bigint;
	mode: "exact";
	provider?: PublicClient;
	requireCanonical: true;
	signal?: AbortSignal;
};

export type EVaultReadContext = EVaultExactReadContext;

export type EVaultReadProvenance =
	| {
			blockHash: null;
			blockNumber: null;
			canonical: false;
			mode: "current";
			source: "custom" | "onchain" | "v3";
	  }
	| {
			blockHash: Hash;
			blockNumber: bigint;
			canonical: true;
			mode: "exact";
			source: "onchain";
	  };

export class EVaultExactReadUnsupportedError extends Error {
	readonly code = "EVAULT_EXACT_READ_UNSUPPORTED";

	constructor(message: string) {
		super(message);
		this.name = "EVaultExactReadUnsupportedError";
	}
}

const BLOCK_HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

export const assertEVaultExactReadContext = (
	context: EVaultExactReadContext,
): void => {
	if (
		context.mode !== "exact" ||
		context.requireCanonical !== true ||
		typeof context.blockNumber !== "bigint" ||
		context.blockNumber < 0n ||
		!BLOCK_HASH_PATTERN.test(context.blockHash)
	) {
		throw new Error(
			"Exact EVault reads require a non-negative block number, block hash, and requireCanonical=true.",
		);
	}
	if (context.signal?.aborted) {
		throw context.signal.reason ?? new Error("Exact EVault read aborted.");
	}
};

export const waitForEVaultRead = async <T>(
	promise: Promise<T>,
	signal?: AbortSignal,
): Promise<T> => {
	if (!signal) return promise;
	if (signal.aborted) {
		throw signal.reason ?? new Error("Exact EVault read aborted.");
	}
	return new Promise<T>((resolve, reject) => {
		const cleanup = () => signal.removeEventListener("abort", onAbort);
		const onAbort = () => {
			cleanup();
			reject(signal.reason ?? new Error("Exact EVault read aborted."));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error: unknown) => {
				cleanup();
				reject(error);
			},
		);
	});
};

export const assertEVaultCanonicalBlock = async (
	provider: PublicClient,
	context: EVaultExactReadContext,
): Promise<void> => {
	assertEVaultExactReadContext(context);
	const block = await waitForEVaultRead(
		provider.getBlock({
			blockNumber: context.blockNumber,
			includeTransactions: false,
		}),
		context.signal,
	);
	if (
		block.number !== context.blockNumber ||
		!block.hash ||
		block.hash.toLowerCase() !== context.blockHash.toLowerCase()
	) {
		throw new Error(
			`Canonical block mismatch at ${context.blockNumber.toString()}.`,
		);
	}
};

export const readEVaultContractAtExactBlock = async <T>(
	provider: PublicClient,
	context: EVaultExactReadContext,
	input: {
		abi: Abi | readonly unknown[];
		address: Address;
		args?: readonly unknown[];
		functionName: string;
	},
): Promise<T> => {
	assertEVaultExactReadContext(context);
	const data = encodeFunctionData({
		abi: input.abi as Abi,
		args: input.args,
		functionName: input.functionName,
	} as never);
	const result = await waitForEVaultRead(
		provider.request({
			method: "eth_call",
			params: [
				{ data, to: input.address },
				{
					blockHash: context.blockHash.toLowerCase() as Hash,
					requireCanonical: true,
				},
			],
		} as never),
		context.signal,
	);
	if (typeof result !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(result)) {
		throw new Error("Exact EVault eth_call returned invalid data.");
	}
	return decodeFunctionResult({
		abi: input.abi as Abi,
		args: input.args,
		data: result as Hex,
		functionName: input.functionName,
	} as never) as T;
};

export const currentEVaultReadProvenance = (
	source: "custom" | "onchain" | "v3",
): EVaultReadProvenance => ({
	blockHash: null,
	blockNumber: null,
	canonical: false,
	mode: "current",
	source,
});

export const exactEVaultReadProvenance = (
	context: EVaultExactReadContext,
): EVaultReadProvenance => ({
	blockHash: context.blockHash.toLowerCase() as Hash,
	blockNumber: context.blockNumber,
	canonical: true,
	mode: "exact",
	source: "onchain",
});
