import * as viemChains from "viem/chains";
import type { ViemChainCatalog } from "./chainResolution.js";

// package.json "browser" swaps this module for viemChainCatalog.browser.ts,
// so browser bundles load viem/chains lazily instead of embedding it.
export function getLoadedViemChains(): ViemChainCatalog | undefined {
	return viemChains;
}

export async function loadViemChains(): Promise<ViemChainCatalog> {
	return viemChains;
}
