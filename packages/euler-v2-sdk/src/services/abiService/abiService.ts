import type { Abi } from "viem";
import { applyBuildQuery, type BuildQueryFn } from "../../utils/buildQuery.js";

export interface IABIService {
	fetchABI(chainId: number, contract: string): Promise<Abi>;
}

export class ABIService implements IABIService {
	private readonly abis = new Map<string, Promise<Abi>>();

	constructor(buildQuery?: BuildQueryFn) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	private getABIURL(_: number, contract: string): string {
		return `https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/master/abis/${contract}.json`;
	}

	queryABI = async (url: string): Promise<Abi> => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch ABI (${response.status} ${response.statusText})`,
			);
		}
		const abi: unknown = await response.json();
		if (!Array.isArray(abi)) {
			throw new Error("Invalid ABI response");
		}
		return abi as Abi;
	};

	setQueryABI(fn: typeof this.queryABI): void {
		this.queryABI = fn;
	}

	async fetchABI(_: number, contract: string): Promise<Abi> {
		const cached = this.abis.get(contract);
		if (cached) return cached;

		const pending = this.queryABI(this.getABIURL(_, contract));
		this.abis.set(contract, pending);

		try {
			return await pending;
		} catch (error) {
			if (this.abis.get(contract) === pending) {
				this.abis.delete(contract);
			}
			throw error;
		}
	}
}
