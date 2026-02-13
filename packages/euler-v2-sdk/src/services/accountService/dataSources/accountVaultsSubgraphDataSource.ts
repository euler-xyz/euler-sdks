import { Address, getAddress } from "viem";
import { IAccountVaultsDataSource } from "./accountOnchainDataSource.js";
import { getAddressPrefix } from "../../../utils/subAccounts.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../utils/buildQuery.js";

export interface AccountVaults {
  [vault: Address]: {
    deposits: Address[];
    borrows: Address[];
  };
}

export interface AccountVaultsSubgraphDataSourceConfig {
  subgraphURLs: Record<number, string>;
}

export class AccountVaultsSubgraphDataSource implements IAccountVaultsDataSource {
  constructor(
    private readonly config: AccountVaultsSubgraphDataSourceConfig,
    buildQuery?: BuildQueryFn,
  ) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryAccountVaults = async (
    subgraphUrl: string,
    account: Address
  ): Promise<any> => {
    const response = await fetch(subgraphUrl, {
      method: "POST",
      body: JSON.stringify({
        query: `query AccountBorrows {
          trackingActiveAccount(id: "${getAddressPrefix(account)}") {
            deposits
            borrows
          }
        }`,
        operationName: 'AccountVaults',
      }),
    });
    return response.json();
  };

  setQueryAccountVaults(fn: typeof this.queryAccountVaults): void {
    this.queryAccountVaults = fn;
  }

  async getAccountVaults(chainId: number, account: Address): Promise<AccountVaults> {
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
    const subgraphUrl = this.config.subgraphURLs[chainId];
    if (!subgraphUrl) {
      throw new Error(`Subgraph URL not found for chain ${chainId}`);
    }
    const data = await this.queryAccountVaults(subgraphUrl, account);

    const accountVaults: AccountVaults = {};
    parseResult("deposits", accountVaults, data.data?.trackingActiveAccount?.deposits || []);
    parseResult("borrows", accountVaults, data.data?.trackingActiveAccount?.borrows || []);

    return accountVaults;
  }
}
