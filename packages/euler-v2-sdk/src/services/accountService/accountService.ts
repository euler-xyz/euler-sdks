import { Account, IAccount, SubAccount } from "../../entities/Account.js";
import { Address } from "viem";

export interface IAccountDataSource {
  fetchAccount(chainId: number, address: Address): Promise<IAccount | undefined>;
  fetchSubAccount(chainId: number, subAccount: Address, vaults?: Address[]): Promise<SubAccount | undefined>;
}

export interface IAccountService {
  fetchAccount(chainId: number, address: Address): Promise<Account>;
  fetchSubAccount(chainId: number, subAccount: Address, vaults?: Address[]): Promise<SubAccount | undefined>;
}

export class AccountService implements IAccountService {
  constructor(
    private readonly dataSource: IAccountDataSource
  ) {}

  // `address` in this context can be any sub-account, not just the main account.
  async fetchAccount(chainId: number, address: Address): Promise<Account> {
    const accountData = await this.dataSource.fetchAccount(chainId, address);
    if (!accountData) return new Account({ chainId, owner: address, subAccounts: {} });

    return new Account(accountData);
  }

  async fetchSubAccount(chainId: number, subAccount: Address, vaults?: Address[]): Promise<SubAccount | undefined> {
    return this.dataSource.fetchSubAccount(chainId, subAccount, vaults);
  }
}
