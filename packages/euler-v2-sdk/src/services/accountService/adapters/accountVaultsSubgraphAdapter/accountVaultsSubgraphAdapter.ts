import { type Address, getAddress } from "viem";
import type { IAccountVaultsAdapter } from "../accountOnchainAdapter/accountOnchainAdapter.js";
import { getAddressPrefix } from "../../../../utils/subAccounts.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";
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
        if (!subgraphUrl) continue;

        const ids = [...new Set(accounts.map((a) => getAddressPrefix(a)))];
        const response = await fetch(subgraphUrl, {
          method: "POST",
          body: JSON.stringify({
            query: `query AccountVaults($ids: [String!]!) {
              trackingActiveAccounts(where: { id_in: $ids }) {
                id
                deposits
                borrows
              }
            }`,
            variables: { ids },
            operationName: "AccountVaults",
          }),
        });
        const json = await response.json();
        const map = new Map<string, any>();
        for (const entry of (json as any).data?.trackingActiveAccounts ?? []) {
          map.set(entry.id.toLowerCase(), entry);
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

  async fetchAccountVaults(chainId: number, account: Address): Promise<AccountVaults> {
    const parseResult = (type: "deposits" | "borrows", results: AccountVaults, data: any) => {
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
    parseResult("deposits", accountVaults, data.data?.trackingActiveAccount?.deposits || []);
    parseResult("borrows", accountVaults, data.data?.trackingActiveAccount?.borrows || []);

    return accountVaults;
  }
}
