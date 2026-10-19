import { type Address, getAddress } from "viem";
import type { IAccountVaultsAdapter } from "./accountOnchainAdapter.js";
import { getAddressPrefix } from "../../../../utils/subAccounts.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import { createCallBundler } from "../../../../utils/callBundler.js";

export interface AccountVaults {
	[vault: Address]: {
		deposits: Address[];
		borrows: Address[];
	};
}

export interface AccountVaultsSubgraphAdapterConfig {
	subgraphURLs: Record<number, string>;
}

const PAGE_SIZE = 1000;

export class AccountVaultsSubgraphAdapter implements IAccountVaultsAdapter {
	constructor(
		private readonly config: AccountVaultsSubgraphAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	private loadAccountVaults = createCallBundler(
		async (
			keys: { chainId: number; account: Address }[],
		): Promise<({ result: any } | { error: unknown })[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const arr = byChain.get(key.chainId) ?? [];
				arr.push(key.account);
				byChain.set(key.chainId, arr);
			}

			const chainResults = new Map<number, Map<string, any>>();
			const chainErrors = new Map<number, unknown>();
			for (const [chainId, accounts] of byChain) {
				const subgraphUrl = this.config.subgraphURLs[chainId];
				if (!subgraphUrl) continue;

				try {
					const ids = [
						...new Set(accounts.map((a) => getAddressPrefix(a).toLowerCase())),
					];
					const query = `query AccountVaults($ids: [String!]!) {
              trackingActiveAccounts(first: ${PAGE_SIZE}, where: { id_in: $ids }) {
                id
                deposits
                borrows
              }
            }`;
					const map = new Map<string, any>();
					for (let i = 0; i < ids.length; i += PAGE_SIZE) {
						const response = await fetch(subgraphUrl, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								query,
								variables: { ids: ids.slice(i, i + PAGE_SIZE) },
								operationName: "AccountVaults",
							}),
						});
						if (!response.ok) {
							throw new Error(
								`Account vaults subgraph ${response.status} ${response.statusText}`,
							);
						}
						const json = (await response.json()) as {
							data?: {
								trackingActiveAccounts?: Array<{
									id: string;
									deposits: string[];
									borrows: string[];
								}>;
							};
							errors?: unknown[];
						};
						if (json?.errors?.length) {
							throw new Error(
								"Account vaults subgraph returned GraphQL errors.",
							);
						}
						if (!Array.isArray(json?.data?.trackingActiveAccounts)) {
							throw new Error(
								"Account vaults subgraph returned malformed account data.",
							);
						}
						for (const entry of json.data.trackingActiveAccounts) {
							if (
								typeof entry?.id !== "string" ||
								!Array.isArray(entry.deposits) ||
								!Array.isArray(entry.borrows)
							) {
								throw new Error(
									"Account vaults subgraph returned malformed account data.",
								);
							}
							map.set(entry.id.toLowerCase(), entry);
						}
					}
					chainResults.set(chainId, map);
				} catch (error) {
					chainErrors.set(chainId, error);
				}
			}

			return keys.map((key) => {
				if (chainErrors.has(key.chainId)) {
					return { error: chainErrors.get(key.chainId) };
				}
				const prefix = getAddressPrefix(key.account);
				const entry = chainResults.get(key.chainId)?.get(prefix.toLowerCase());
				return {
					result: {
						data: {
							trackingActiveAccount: entry ?? null,
						},
					},
				};
			});
		},
	);

	queryAccountVaults = async (key: { chainId: number; account: Address }) => {
		const outcome = await this.loadAccountVaults(key);
		// Reject per key before buildQuery caches the public query's result.
		if ("error" in outcome) throw outcome.error;
		return outcome.result;
	};

	setQueryAccountVaults(fn: typeof this.queryAccountVaults): void {
		this.queryAccountVaults = fn;
	}

	async fetchAccountVaults(
		chainId: number,
		account: Address,
	): Promise<AccountVaults> {
		const parseResult = (
			type: "deposits" | "borrows",
			results: AccountVaults,
			data: any,
		) => {
			data.forEach((entry: any) => {
				const subAccount = getAddress(entry.substring(0, 42));
				const vault = getAddress(`0x${entry.substring(42)}`);
				if (!results[subAccount]) {
					results[subAccount] = {
						deposits: [],
						borrows: [],
					};
				}
				results[subAccount][type].push(vault);
			});
		};
		const data = await this.queryAccountVaults({ chainId, account });

		const accountVaults: AccountVaults = {};
		parseResult(
			"deposits",
			accountVaults,
			data.data?.trackingActiveAccount?.deposits || [],
		);
		parseResult(
			"borrows",
			accountVaults,
			data.data?.trackingActiveAccount?.borrows || [],
		);

		return accountVaults;
	}
}
