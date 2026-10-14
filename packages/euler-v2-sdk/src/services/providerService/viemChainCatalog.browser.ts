import type { ViemChainCatalog } from "./chainResolution.js";

let loaded: ViemChainCatalog | undefined;

export function getLoadedViemChains(): ViemChainCatalog | undefined {
	return loaded;
}

export async function loadViemChains(): Promise<ViemChainCatalog> {
	loaded ??= await import("viem/chains");
	return loaded;
}
