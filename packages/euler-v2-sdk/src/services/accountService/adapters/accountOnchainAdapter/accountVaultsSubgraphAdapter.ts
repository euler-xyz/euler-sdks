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

export class AccountVaultsSubgraphAdapter implements IAccountVaultsAdapter {
	constructor(
		private readonly config: AccountVaultsSubgraphAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	queryAccountVaults = createCallBundler(
		async (keys: { chainId: number; account: Address }[]): Promise<any[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const arr = byChain.get(key.chainId) ?? [];
				arr.push(key.account);
				byChain.set(key.chainId, arr);
			}

			const chainResults = new Map<number, Map<string, any>>();
			for (const [chainId, accounts] of byChain) {
				const subgraphUrl = this.config.subgraphURLs[chainId];
				if (!subgraphUrl) {
					throw new Error(
						`Account discovery subgraph is not configured for chain ${chainId}`,
					);
				}

				const ids = [...new Set(accounts.map((a) => getAddressPrefix(a)))];
				const map = new Map<string, any>();
				// The Graph defaults list fields to 100 entities. Bound each group so
				// a burst of bundled account queries cannot silently omit later owners.
				for (let offset = 0; offset < ids.length; offset += 100) {
					const response = await fetch(subgraphUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							query: `query AccountVaults($ids: [String!]!) {
              trackingActiveAccounts(first: 100, where: { id_in: $ids }) {
                id
                deposits
                borrows
              }
            }`,
							variables: { ids: ids.slice(offset, offset + 100) },
							operationName: "AccountVaults",
						}),
					});
					if (!response.ok) {
						throw new Error(
							`Account discovery subgraph HTTP ${response.status}`,
						);
					}
					const json = await response.json();
					if (
						(json as any).errors?.length ||
						!Array.isArray((json as any).data?.trackingActiveAccounts)
					) {
						throw new Error(
							"Account discovery subgraph returned errors or an invalid response",
						);
					}
					for (const entry of (json as any).data.trackingActiveAccounts) {
						map.set(entry.id.toLowerCase(), entry);
					}
				}
				chainResults.set(chainId, map);
			}

			return keys.map((key) => {
				const prefix = getAddressPrefix(key.account);
				const entry = chainResults.get(key.chainId)?.get(prefix.toLowerCase());
				return {
					data: {
						trackingActiveAccount: entry ?? null,
					},
				};
			});
		},
	);

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
