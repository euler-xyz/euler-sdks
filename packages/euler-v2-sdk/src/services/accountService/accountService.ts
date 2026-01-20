import { Account, IAccount, SubAccount } from "../../entities/Account.js";
import { getSubAccountId } from "../../utils/subAccounts.js";
import { Address } from "viem";

export interface IAccountDataSource {
  fetchFullAccount(chainId: number, address: Address): Promise<IAccount | undefined>;
  fetchSubAccount(chainId: number, subAccount: Address, vaults?: Address[]): Promise<SubAccount | undefined>;
}

export interface IAccountService {
  fetchFullAccount(chainId: number, address: Address): Promise<Account | undefined>;
  fetchSubAccount(chainId: number, subAccount: Address): Promise<SubAccount | undefined>;
}

export class AccountService implements IAccountService {
  constructor(
    private readonly dataSource: IAccountDataSource
  ) {}

  // `address` in this context can be any sub-account, not just the main account.
  async fetchFullAccount(chainId: number, address: Address): Promise<Account | undefined> {
    const accountData = await this.dataSource.fetchFullAccount(chainId, address);
    if (!accountData) return undefined;

    if (accountData.subAccounts && Array.isArray(accountData.subAccounts)) {
      accountData.subAccounts.sort((a, b) => {
        const primary = accountData.owner;
        const aId = getSubAccountId(primary, a.account);
        const bId = getSubAccountId(primary, b.account);
        return aId - bId;
      });
    }

    return new Account(accountData);
  }

  async fetchSubAccount(chainId: number, subAccount: Address): Promise<SubAccount | undefined> {
    return this.dataSource.fetchSubAccount(chainId, subAccount);
  }
}
