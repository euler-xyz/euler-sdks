import type { Chain } from "viem";

export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BSC",
  130: "Unichain",
  143: "Monad",
  146: "Sonic",
  239: "TAC",
  1923: "Swell",
  8453: "Base",
  9745: "Plasma",
  42161: "Arbitrum",
  43114: "Avalanche",
  60808: "Bob",
  80094: "Berachain",
};

export const ALL_CHAIN_IDS = Object.keys(CHAIN_NAMES)
  .map(Number)
  .sort((a, b) => a - b);

// Verified against the configured V3 endpoint on 2026-04-02.
export const DEFAULT_ENABLED_V3_CHAIN_IDS = [1, 143, 146, 8453, 42161];

export const DEFAULT_CHAIN = 1;

// Public RPC fallbacks — override per chain with VITE_RPC_URL_<chainId> in .env
const PUBLIC_RPC_URLS: Record<number, string> = {
  1: "https://eth.drpc.org",
  56: "https://bsc.drpc.org",
  130: "https://unichain.drpc.org",
  143: "https://rpc.monad.xyz",
  146: "https://sonic.drpc.org",
  239: "https://turin.rpc.tac.build",
  1923: "https://swell-mainnet.g.alchemy.com/public",
  8453: "https://base.drpc.org",
  9745: "https://rpc.plasma.cloud",
  42161: "https://arbitrum.drpc.org",
  43114: "https://avalanche.drpc.org",
  60808: "https://bob.drpc.org",
  80094: "https://berachain.drpc.org",
};

export const RPC_URLS: Record<number, string> = Object.fromEntries(
  Object.entries(PUBLIC_RPC_URLS).map(([chainId, fallback]) => [
    chainId,
    import.meta.env[`VITE_RPC_URL_${chainId}`] || fallback,
  ])
);

const DEFAULT_NATIVE = { name: "Ether", symbol: "ETH", decimals: 18 };

const NATIVE_CURRENCY: Record<number, { name: string; symbol: string; decimals: number }> = {
  56: { name: "BNB", symbol: "BNB", decimals: 18 },
  43114: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  80094: { name: "Berachain", symbol: "BERA", decimals: 18 },
};

export const WAGMI_CHAINS: Chain[] = Object.entries(CHAIN_NAMES).map(
  ([id, name]) => {
    const chainId = Number(id);
    const rpcUrl = RPC_URLS[chainId];
    return {
      id: chainId,
      name,
      network: name.toLowerCase().replace(/\s+/g, "-"),
      nativeCurrency: NATIVE_CURRENCY[chainId] ?? DEFAULT_NATIVE,
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    };
  }
);
