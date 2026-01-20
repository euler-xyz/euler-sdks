import { Abi } from "viem";

export interface IABIService {
  getABI(chainId: number, contract: string): Promise<Abi>;
}

export class ABIService implements IABIService {
  private readonly abis: Record<string, Abi> = {};
  private getABIURL(_: number, contract: string): string {
    return `https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/master/abis/${contract}.json`;
  }

  async getABI(_: number, contract: string): Promise<Abi> {
    if (!this.abis[contract]) {
      const abi = await fetch(this.getABIURL(_, contract)).then(response => response.json()).then(json => json as Abi);
      this.abis[contract] = abi;
    }

    return this.abis[contract];
  }
}
