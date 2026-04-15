import type { Address, Chain } from "viem";

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
  59144: "Linea",
  60808: "Bob",
  80094: "Berachain",
};

export const ALL_CHAIN_IDS = Object.keys(CHAIN_NAMES)
  .map(Number)
  .sort((a, b) => a - b);

// Match the production app's active label-backed networks.
export const DEFAULT_ENABLED_CHAIN_IDS = ALL_CHAIN_IDS;

export const EARN_CHAIN_IDS = ALL_CHAIN_IDS;

export const APP_CHAIN_IDS_MINUS_BOB = ALL_CHAIN_IDS.filter((chainId) => chainId !== 60808);

export const DEFAULT_CHAIN = 1;

export const SECURITIZE_VAULT_ADDRESSES: Record<number, Address[]> = {
  1: [
    "0xCf4846E0d8A8667c516B844EB72A4d6e7430101D",
    "0x1cFC56665c2718454e8dDf975dC37aF0bc68B5aA",
    "0x33c57482EeDb4f81F86A693e8F0CE5D369819edC",
  ],
};

// Public RPC fallbacks — override per chain with VITE_RPC_URL_<chainId> in .env
const PUBLIC_RPC_URLS: Record<number, string> = {
  1: "https://eth.drpc.org",
  56: "https://bsc.drpc.org",
  130: "https://unichain.drpc.org",
  143: "https://rpc.monad.xyz",
  146: "https://sonic.drpc.org",
  239: "https://rpc.tac.build",
  1923: "https://swell-mainnet.g.alchemy.com/public",
  8453: "https://base.drpc.org",
  9745: "https://rpc.plasma.cloud",
  42161: "https://arbitrum.drpc.org",
  43114: "https://avalanche.drpc.org",
  59144: "https://rpc.linea.build",
  60808: "https://bob.drpc.org",
  80094: "https://rpc.berachain.com",
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
  239: { name: "TAC", symbol: "TAC", decimals: 18 },
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
