export interface ChainMeta {
  name: string;
  rpc: string;
  explorer: string;
}

export const CHAINS: Record<number, ChainMeta> = {
  1:     { name: "Ethereum",   rpc: "https://eth.drpc.org",                           explorer: "https://etherscan.io" },
  56:    { name: "BSC",        rpc: "https://bsc.drpc.org",                           explorer: "https://bscscan.com" },
  130:   { name: "Unichain",   rpc: "https://unichain.drpc.org",                      explorer: "https://uniscan.xyz" },
  146:   { name: "Sonic",      rpc: "https://sonic.drpc.org",                         explorer: "https://sonicscan.org" },
  239:   { name: "TAC",        rpc: "https://turin.rpc.tac.build",                    explorer: "https://explorer.tac.build" },
  480:   { name: "Worldchain", rpc: "https://worldchain-mainnet.g.alchemy.com/public",explorer: "https://worldscan.org" },
  999:   { name: "HyperEVM",   rpc: "https://rpc.hyperliquid.xyz/evm",               explorer: "https://explorer.hyperliquid.xyz" },
  1923:  { name: "Swell",      rpc: "https://swell-mainnet.g.alchemy.com/public",    explorer: "https://explorer.swellnetwork.io" },
  5000:  { name: "Mantle",     rpc: "https://rpc.mantle.xyz",                         explorer: "https://mantlescan.xyz" },
  8453:  { name: "Base",       rpc: "https://base.drpc.org",                          explorer: "https://basescan.org" },
  9745:  { name: "Plasma",     rpc: "https://rpc.plasma.cloud",                       explorer: "https://explorer.plasma.cloud" },
  42161: { name: "Arbitrum",   rpc: "https://arbitrum.drpc.org",                      explorer: "https://arbiscan.io" },
  43114: { name: "Avalanche",  rpc: "https://avalanche.drpc.org",                     explorer: "https://snowtrace.io" },
  57073: { name: "Ink",        rpc: "https://ink.drpc.org",                           explorer: "https://explorer.inkonchain.com" },
  60808: { name: "BOB",        rpc: "https://bob.drpc.org",                           explorer: "https://explorer.gobob.xyz" },
  80094: { name: "Berachain",  rpc: "https://berachain.drpc.org",                     explorer: "https://berascan.com" },
};

export function getExplorerUrl(chainId: number, type: "address" | "tx", hash: string): string {
  const chain = CHAINS[chainId];
  if (!chain) return "#";
  return `${chain.explorer}/${type}/${hash}`;
}
