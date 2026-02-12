import { createPublicClient, extractChain, http, PublicClient, Chain } from "viem";
import { mainnet, base, arbitrum, bsc, linea, sonic, unichain, berachain, bob, tac, plasma, monad, swellchain, avalanche } from "viem/chains";

const defaultChains = [mainnet, base, arbitrum, bsc, linea, sonic, unichain, berachain, bob, tac, plasma, monad, swellchain, avalanche];

export interface IProviderService {
  getProvider(chainId: number): PublicClient;
  getSupportedChainIds(): number[];
}

export class ProviderService implements IProviderService {
  private readonly providers: Record<number, PublicClient> = {};

  constructor(rpcUrls: Record<number, string>) {
    this.providers = Object.fromEntries(
      Object.entries(rpcUrls).map(([chainId, rpcUrl]) => {
        const chain = extractChain({chains: defaultChains, id: Number(chainId) as any}) as Chain;
        if (!chain) {
          throw new Error(`Chain ${chainId} not supported`);
        }
        return [
          Number(chainId),
          createPublicClient({ chain, transport: http(rpcUrl) }),
        ]})
    );
  }

  getProvider(chainId: number): PublicClient {
    const provider = this.providers[chainId];
    if (!provider) {
      throw new Error(`No provider configured for chainId ${chainId}`);
    }
    return provider;
  }

  getSupportedChainIds(): number[] {
    return Object.keys(this.providers).map(Number);
  }
}
