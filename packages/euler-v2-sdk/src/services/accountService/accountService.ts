import { Account, IAccount, SubAccount } from "../../entities/Account.js";
import { Address, getAddress } from "viem";
import type { IVaultMetaService } from "../vaults/vaultMetaService/index.js";
import type { IHasVaultAddress, IVaultEntity } from "../../entities/Account.js";
import type { VaultFetchOptions } from "../vaults/index.js";

export interface AccountFetchOptions {
  resolveVaults?: boolean;
  vaultOptions?: VaultFetchOptions;
}

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
  fetchAccount(chainId: number, address: Address, options?: AccountFetchOptions): Promise<Account<TVaultEntity>>;
  fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[],
    options?: AccountFetchOptions
  ): Promise<SubAccount<TVaultEntity> | undefined>;
  fetchVaults(account: Account<never>, vaultOptions?: VaultFetchOptions): Promise<Account<TVaultEntity>>;
  resolveVaults<T extends IHasVaultAddress>(account: Account<never>, vaults: T[]): Account<T>;
}

export class AccountService<TVaultEntity extends IHasVaultAddress = IVaultEntity>
  implements IAccountService<TVaultEntity>
{
  constructor(
    private readonly dataSource: IAccountDataSource,
    private readonly vaultMetaService: IVaultMetaService<TVaultEntity>
  ) {}

  async fetchAccount(chainId: number, address: Address, options?: AccountFetchOptions): Promise<Account<TVaultEntity>> {
    const accountData = await this.dataSource.fetchAccount(chainId, address);
    const account: Account<never> = accountData
      ? new Account(accountData)
      : new Account({
          chainId,
          owner: address,
          isLockdownMode: false,
          isPermitDisabledMode: false,
          subAccounts: {},
        });

    if (options?.resolveVaults === false) {
      return account as Account<TVaultEntity>;
    }

    return this.fetchVaults(account, options?.vaultOptions);
  }

  async fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[],
    options?: AccountFetchOptions
  ): Promise<SubAccount<TVaultEntity> | undefined> {
    const sa = await this.dataSource.fetchSubAccount(chainId, subAccount, vaults);
    if (!sa) return undefined;

    if (options?.resolveVaults === false) {
      return sa as SubAccount<TVaultEntity>;
    }

    const addresses = vaults?.length ? vaults : collectVaultAddressesFromSubAccountPositionsAndLiquidity(sa);
    if (addresses.length === 0) return sa as SubAccount<TVaultEntity>;
    const entities = await this.vaultMetaService.fetchVaults(chainId, addresses, options?.vaultOptions);
    const tempAccount = new Account({
      chainId,
      owner: sa.owner,
      subAccounts: { [getAddress(sa.account)]: sa },
    });
    tempAccount.resolveVaults(entities);
    return tempAccount.getSubAccount(getAddress(sa.account));
  }

  async fetchVaults(account: Account<never>, vaultOptions?: VaultFetchOptions): Promise<Account<TVaultEntity>> {
    const addresses = collectVaultAddressesFromPositionsAndLiquidity(account);
    if (addresses.length === 0) return account as Account<TVaultEntity>;
    const vaults = await this.vaultMetaService.fetchVaults(account.chainId, addresses, vaultOptions);
    return account.resolveVaults(vaults);
  }

  resolveVaults<T extends IHasVaultAddress>(account: Account<never>, vaults: T[]): Account<T> {
    return account.resolveVaults(vaults);
  }
}
