import { Account, IAccount, SubAccount } from "../../entities/Account.js";
import { Address, getAddress } from "viem";
import type { IVaultMetaService } from "../vaults/vaultMetaService/index.js";
import type { IHasVaultAddress, IVaultEntity } from "../../entities/Account.js";

/** Collects unique vault addresses from positions and liquidity collaterals only (not enabledControllers/enabledCollaterals). */
function collectVaultAddressesFromPositionsAndLiquidity(account: IAccount): Address[] {
  const set = new Set<string>();
  const push = (a: Address) => set.add(getAddress(a));
  for (const sa of Object.values(account.subAccounts ?? {})) {
    if (!sa) continue;
    for (const p of sa.positions) {
      push(p.vaultAddress);
      if (p.liquidity) {
        push(p.liquidity.vaultAddress);
        p.liquidity.collaterals.forEach((c) => push(c.address));
      }
    }
  }
  return Array.from(set, (s) => s as Address);
}

/** Collects unique vault addresses from a sub-account's positions and liquidity collaterals only. */
function collectVaultAddressesFromSubAccountPositionsAndLiquidity(sa: SubAccount): Address[] {
  const set = new Set<string>();
  const push = (a: Address) => set.add(getAddress(a));
  for (const p of sa.positions) {
    push(p.vaultAddress);
    if (p.liquidity) {
      push(p.liquidity.vaultAddress);
      p.liquidity.collaterals.forEach((c) => push(c.address));
    }
  }
  return Array.from(set, (s) => s as Address);
}

export interface IAccountDataSource {
  fetchAccount(chainId: number, address: Address): Promise<IAccount | undefined>;
  fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[]
  ): Promise<SubAccount | undefined>;
}

export interface IAccountService<TVaultEntity extends IHasVaultAddress = IVaultEntity> {
  fetchAccountBasic(chainId: number, address: Address): Promise<Account<never>>;
  fetchSubAccountBasic(
    chainId: number,
    subAccount: Address,
    vaults?: Address[]
  ): Promise<SubAccount | undefined>;
  fetchAccount(chainId: number, address: Address): Promise<Account<TVaultEntity>>;
  fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[]
  ): Promise<SubAccount<TVaultEntity> | undefined>;
  fetchVaults(account: Account<never>): Promise<Account<TVaultEntity>>;
  resolveVaults<T extends IHasVaultAddress>(account: Account<never>, vaults: T[]): Account<T>;
}

export class AccountService<TVaultEntity extends IHasVaultAddress = IVaultEntity>
  implements IAccountService<TVaultEntity>
{
  constructor(
    private readonly dataSource: IAccountDataSource,
    private readonly vaultMetaService: IVaultMetaService<TVaultEntity>
  ) {}


  // address should be the main account address (e.g. connected EOA)
  async fetchAccount(chainId: number, address: Address): Promise<Account<TVaultEntity>> {
    const account = await this.fetchAccountBasic(chainId, address);
    return this.fetchVaults(account);
  }

  async fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[]
  ): Promise<SubAccount<TVaultEntity> | undefined> {
    const sa = await this.dataSource.fetchSubAccount(chainId, subAccount, vaults);
    if (!sa) return undefined;
    const addresses = vaults?.length ? vaults : collectVaultAddressesFromSubAccountPositionsAndLiquidity(sa);
    if (addresses.length === 0) return sa as SubAccount<TVaultEntity>;
    const entities = await this.vaultMetaService.fetchVaults(chainId, addresses);
    const tempAccount = new Account({
      chainId,
      owner: sa.owner,
      subAccounts: { [getAddress(sa.account)]: sa },
    });
    tempAccount.resolveVaults(entities);
    return tempAccount.getSubAccount(getAddress(sa.account));
  }

  async fetchAccountBasic(chainId: number, address: Address): Promise<Account<never>> {
    const accountData = await this.dataSource.fetchAccount(chainId, address);
    if (!accountData)
      return new Account({
        chainId,
        owner: address,
        isLockdownMode: false,
        isPermitDisabledMode: false,
        subAccounts: {},
      });

    return new Account(accountData);
  }

  async fetchSubAccountBasic(
    chainId: number,
    subAccount: Address,
    vaults?: Address[]
  ): Promise<SubAccount | undefined> {
    return this.dataSource.fetchSubAccount(chainId, subAccount, vaults);
  }

  async fetchVaults(account: Account<never>): Promise<Account<TVaultEntity>> {
    const addresses = collectVaultAddressesFromPositionsAndLiquidity(account);
    if (addresses.length === 0) return account as Account<TVaultEntity>;
    const vaults = await this.vaultMetaService.fetchVaults(account.chainId, addresses);
    return account.resolveVaults(vaults);
  }

  resolveVaults<T extends IHasVaultAddress>(account: Account<never>, vaults: T[]): Account<T> {
    return account.resolveVaults(vaults);
  }
}
