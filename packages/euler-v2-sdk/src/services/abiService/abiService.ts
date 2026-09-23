import type { Abi } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

export interface IABIService {
	fetchABI(chainId: number, contract: string): Promise<Abi>;
}

export interface ABIServiceConfig {
	eulerInterfacesBranch?: string;
}

export const DEFAULT_EULER_INTERFACES_BRANCH = "master";

export class ABIService implements IABIService {
	private readonly abiRequests: Record<string, Promise<Abi>> = {};

	constructor(
		buildQuery?: BuildQueryFn,
		private readonly config: ABIServiceConfig = {},
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	private getABIURL(_: number, contract: string): string {
		const branch =
			this.config.eulerInterfacesBranch?.trim() ||
			DEFAULT_EULER_INTERFACES_BRANCH;
		return `https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/${branch}/abis/${contract}.json`;
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

	async fetchABI(chainId: number, contract: string): Promise<Abi> {
		// Keyed by resolved URL rather than contract name, so the cache follows
		// whatever `getABIURL` keys on (today the URL is chain-agnostic, so all
		// chains share one request).
		const url = this.getABIURL(chainId, contract);
		const pending = this.abiRequests[url];
		if (pending) return pending;

		// Evict failed requests so a later call retries instead of replaying the
		// rejection for the lifetime of the service.
		const request = this.queryABI(url).catch((error) => {
			if (this.abiRequests[url] === request) {
				delete this.abiRequests[url];
			}
			throw error;
		});
		this.abiRequests[url] = request;

		return request;
	}
}
