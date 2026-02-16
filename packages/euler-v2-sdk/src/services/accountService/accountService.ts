import { Account, IAccount, SubAccount } from "../../entities/Account.js";
import { Address, getAddress } from "viem";
import type { IVaultMetaService } from "../vaults/vaultMetaService/index.js";
import type { IHasVaultAddress, IVaultEntity } from "../../entities/Account.js";
import type { VaultFetchOptions } from "../vaults/index.js";
import type { IPriceService } from "../priceService/index.js";

export interface AccountFetchOptions {
  populateVaults?: boolean;
  /** When true, populates USD market prices on positions and liquidity. Requires `populateVaults` (default). */
  populateMarketPrices?: boolean;
  /** Options forwarded to vault services when populating vaults. */
  vaultFetchOptions?: VaultFetchOptions;
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

export interface IAccountAdapter {
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
  populateVaults(accounts: Account<never>[], options?: AccountFetchOptions): Promise<Account<TVaultEntity>[]>;
}

export class AccountService<TVaultEntity extends IHasVaultAddress = IVaultEntity>
  implements IAccountService<TVaultEntity>
{
  constructor(
    private adapter: IAccountAdapter,
    private vaultMetaService: IVaultMetaService<TVaultEntity>,
    private priceService?: IPriceService
  ) {}

  setAdapter(adapter: IAccountAdapter): void {
    this.adapter = adapter;
  }

  setVaultMetaService(vaultMetaService: IVaultMetaService<TVaultEntity>): void {
    this.vaultMetaService = vaultMetaService;
  }

  setPriceService(priceService: IPriceService): void {
    this.priceService = priceService;
  }

  async fetchAccount(chainId: number, address: Address, options?: AccountFetchOptions): Promise<Account<TVaultEntity>> {
    const accountData = await this.adapter.fetchAccount(chainId, address);
    const account: Account<never> = accountData
      ? new Account(accountData)
      : new Account({
          chainId,
          owner: address,
          isLockdownMode: false,
          isPermitDisabledMode: false,
          subAccounts: {},
        });

    if (options?.populateVaults === false) {
      return account as Account<TVaultEntity>;
    }

    const populated = await this.populateVaults([account], options);
    const result = populated[0]!;

    if (options?.populateMarketPrices && this.priceService) {
      await result.populateMarketPrices(this.priceService);
    }

    return result;
  }

  async fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[],
    options?: AccountFetchOptions
  ): Promise<SubAccount<TVaultEntity> | undefined> {
    const sa = await this.adapter.fetchSubAccount(chainId, subAccount, vaults);
    if (!sa) return undefined;

    if (options?.populateVaults === false) {
      return sa as SubAccount<TVaultEntity>;
    }

    const addresses = vaults?.length ? vaults : collectVaultAddressesFromSubAccountPositionsAndLiquidity(sa);
    if (addresses.length === 0) return sa as SubAccount<TVaultEntity>;

    const tempAccount = new Account<never>({
      chainId,
      owner: sa.owner,
      subAccounts: { [getAddress(sa.account)]: sa },
    });
    const populated = await tempAccount.populateVaults(this.vaultMetaService, this.buildVaultFetchOptions(options));
    return populated.getSubAccount(getAddress(sa.account));
  }

  async populateVaults(accounts: Account<never>[], options?: AccountFetchOptions): Promise<Account<TVaultEntity>[]> {
    const vaultFetchOptions = this.buildVaultFetchOptions(options);

    return Promise.all(
      accounts.map((account) => account.populateVaults(this.vaultMetaService, vaultFetchOptions))
    );
  }

  private buildVaultFetchOptions(options?: AccountFetchOptions): VaultFetchOptions | undefined {
    return options?.vaultFetchOptions;
  }
}
