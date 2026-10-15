import type { Chain, HttpTransportConfig, MulticallBatchOptions } from "viem";

export type ViemChainCatalog = Readonly<Record<string, unknown>>;

export interface ChainTransportOptions {
	/** Options for viem's `http()` transport; `batch` is merged over the SDK default. */
	http?: HttpTransportConfig;
	/** Multicall batching for the chain's public client, merged over the SDK default. */
	multicall?: MulticallBatchOptions;
}

/**
 * A complete viem `Chain` is used as is. A partial chain patches the chain the
 * SDK resolves from viem; `contracts`, `blockExplorers` and `rpcUrls` merge by key.
 */
export type ChainOverride = Partial<Chain> & {
	transport?: ChainTransportOptions;
};

export type ChainOverrides = Readonly<Record<number, ChainOverride>>;

export interface ChainResolutionSources {
	override?: ChainOverride;
	viemName?: string;
	catalog: ViemChainCatalog | undefined;
}

// euler-interfaces has no viemName for these chains yet, and viem exports
// several chains with their ids. Remove once the registry names them.
export const INTERIM_VIEM_NAMES: Readonly<Record<number, string>> = {
	8453: "base",
	999: "hyperEvm",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

export function isViemChain(value: unknown): value is Chain {
	return (
		isRecord(value) &&
		typeof value.id === "number" &&
		typeof value.name === "string" &&
		isRecord(value.nativeCurrency) &&
		isRecord(value.rpcUrls) &&
		isRecord(value.rpcUrls.default)
	);
}

function chainFieldsOf(override: ChainOverride | undefined): Partial<Chain> {
	if (!override) return {};
	const { transport: _transport, ...chainFields } = override;
	return chainFields;
}

export function needsViemChains(
	chainIds: readonly number[],
	overrides: ChainOverrides | undefined,
): boolean {
	return chainIds.some(
		(chainId) => !isViemChain(chainFieldsOf(overrides?.[chainId])),
	);
}

const overrideFix = (chainId: number) =>
	`pass chains: { ${chainId}: <viem Chain> } to buildEulerSDK`;
const registryFix = (chainId: number) =>
	`set viemName for chain ${chainId} in euler-interfaces EulerChains.json`;

function findChainsWithId(
	catalog: ViemChainCatalog,
	chainId: number,
): Array<{ chain: Chain; names: string[] }> {
	const matches = Object.entries(catalog).filter(
		(entry): entry is [string, Chain] =>
			isViemChain(entry[1]) && entry[1].id === chainId,
	);
	const distinctChains = [...new Set(matches.map(([, chain]) => chain))];
	return distinctChains.map((chain) => ({
		chain,
		names: matches
			.filter(([, candidate]) => candidate === chain)
			.map(([name]) => name),
	}));
}

function resolveFromViem(
	chainId: number,
	viemName: string | undefined,
	catalog: ViemChainCatalog | undefined,
): Chain {
	if (!catalog) {
		throw new Error(
			`viem chains are not loaded for chain ${chainId} in this browser build. Create the provider service with await ProviderService.build(...), as buildEulerSDK does, or ${overrideFix(chainId)}.`,
		);
	}

	if (viemName) {
		const named = catalog[viemName];
		if (isViemChain(named) && named.id === chainId) return named;
		throw new Error(
			`EulerChains viemName "${viemName}" for chain ${chainId} is not a viem chain with that id. Fix viemName for chain ${chainId} in euler-interfaces EulerChains.json, or ${overrideFix(chainId)}.`,
		);
	}

	const candidates = findChainsWithId(catalog, chainId);
	const [only] = candidates;
	if (only && candidates.length === 1) return only.chain;

	if (candidates.length > 1) {
		const interimName = INTERIM_VIEM_NAMES[chainId];
		const interim = candidates.find(
			(candidate) => interimName && candidate.names.includes(interimName),
		);
		if (interim) return interim.chain;

		const names = candidates.flatMap((candidate) => candidate.names).join(", ");
		throw new Error(
			`viem has several chains with id ${chainId} (${names}). Either ${registryFix(chainId)}, or ${overrideFix(chainId)}.`,
		);
	}

	throw new Error(
		`viem has no chain with id ${chainId}. Either ${overrideFix(chainId)}, or ${registryFix(chainId)} once viem ships the chain.`,
	);
}

function assertChainId(chainId: number, chain: Partial<Chain>): void {
	if (chain.id !== undefined && chain.id !== chainId) {
		throw new Error(`chains[${chainId}] has id ${chain.id}.`);
	}
}

function patchChain(base: Chain, patch: Partial<Chain>): Chain {
	return {
		...base,
		...patch,
		...(patch.contracts
			? { contracts: { ...base.contracts, ...patch.contracts } }
			: {}),
		...(patch.blockExplorers
			? { blockExplorers: { ...base.blockExplorers, ...patch.blockExplorers } }
			: {}),
		...(patch.rpcUrls
			? { rpcUrls: { ...base.rpcUrls, ...patch.rpcUrls } }
			: {}),
	};
}

/**
 * Resolves a viem chain: a complete app-supplied chain, then the EulerChains
 * `viemName`, then the only viem chain with that id. A partial override
 * patches the chain resolved from viem.
 */
export function resolveViemChain(
	chainId: number,
	{ override, viemName, catalog }: ChainResolutionSources,
): Chain {
	const chainFields = chainFieldsOf(override);
	assertChainId(chainId, chainFields);
	if (isViemChain(chainFields)) return chainFields;
	if (Object.keys(chainFields).length === 0) {
		return resolveFromViem(chainId, viemName, catalog);
	}

	try {
		return patchChain(resolveFromViem(chainId, viemName, catalog), chainFields);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`chains[${chainId}] is not a complete viem Chain, so it patches the chain resolved from viem: ${reason}`,
			{ cause: error },
		);
	}
}
