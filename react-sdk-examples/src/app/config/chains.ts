export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BSC",
  130: "Unichain",
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

export const DEFAULT_CHAIN = 1;

export const RPC_URLS: Record<number, string> = {
  1: "https://eth.drpc.org",
  56: "https://bsc.drpc.org",
  130: "https://unichain.drpc.org",
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

export function isSupportedChainId(chainId: number): boolean {
  return Number.isInteger(chainId) && chainId in CHAIN_NAMES;
}

export function resolveChainId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return isSupportedChainId(parsed) ? parsed : DEFAULT_CHAIN;
}
