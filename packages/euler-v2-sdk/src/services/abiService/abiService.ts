import type { Abi } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

export interface IABIService {
	fetchABI(chainId: number, contract: string): Promise<Abi>;
}

export class ABIService implements IABIService {
	private readonly abiRequests: Record<string, Promise<Abi>> = {};

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
		if (!this.abiRequests[contract]) {
			const request = this.queryABI(this.getABIURL(_, contract)).catch((error) => {
				if (this.abiRequests[contract] === request) {
					delete this.abiRequests[contract];
				}
				throw error;
			});
			this.abiRequests[contract] = request;
		}

		return this.abiRequests[contract];
	}
}
