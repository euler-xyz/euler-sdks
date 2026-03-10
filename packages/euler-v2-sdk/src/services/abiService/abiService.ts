import { Abi } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

export interface IABIService {
  fetchABI(chainId: number, contract: string): Promise<Abi>;
}

export class ABIService implements IABIService {
  private readonly abis: Record<string, Abi> = {};

  constructor(buildQuery?: BuildQueryFn) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  private getABIURL(_: number, contract: string): string {
    return `https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/master/abis/${contract}.json`;
  }

  queryABI = async (url: string): Promise<Abi> => {
    const response = await fetch(url);
    return response.json() as Promise<Abi>;
  };

  setQueryABI(fn: typeof this.queryABI): void {
    this.queryABI = fn;
  }

  async fetchABI(_: number, contract: string): Promise<Abi> {
    if (!this.abis[contract]) {
      this.abis[contract] = await this.queryABI(this.getABIURL(_, contract));
    }

    return this.abis[contract];
  }
}
