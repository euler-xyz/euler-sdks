import { createPublicClient, http, PublicClient } from "viem";

export class ProviderService {
  private readonly providers: Record<number, PublicClient> = {};

  constructor(private readonly rpcUrls: Record<number, string>) {
    this.providers = Object.fromEntries(
      Object.entries(rpcUrls).map(([chainId, rpcUrl]) => [
        Number(chainId),
        createPublicClient({ transport: http(rpcUrl) }),
      ])
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
