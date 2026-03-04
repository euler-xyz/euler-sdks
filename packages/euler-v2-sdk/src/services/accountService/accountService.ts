import { Account, IAccount, SubAccount } from "../../entities/Account.js";
import { Address, getAddress } from "viem";
import type { IVaultMetaService } from "../vaults/vaultMetaService/index.js";
import type { IHasVaultAddress, IVaultEntity, ISubAccount } from "../../entities/Account.js";
import type { VaultFetchOptions } from "../vaults/index.js";
import type { IPriceService } from "../priceService/index.js";
import type { IRewardsService } from "../rewardsService/index.js";
import { type DataIssue, type ServiceResult, withPathPrefix } from "../../utils/entityDiagnostics.js";

export interface AccountFetchOptions {
  populateVaults?: boolean;
  /** When true, populates USD market prices on positions and liquidity. Requires `populateVaults` (default). */
  populateMarketPrices?: boolean;
  /** When true, populates per-user unclaimed rewards from Merkl/Brevis. */
  populateUserRewards?: boolean;
  /** Options forwarded to vault services when populating vaults. */
  vaultFetchOptions?: VaultFetchOptions;
}

/** Collects unique vault addresses from a sub-account's positions and liquidity collaterals only. */
function collectVaultAddressesFromSubAccountPositionsAndLiquidity(sa: ISubAccount): Address[] {
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
  fetchAccount(chainId: number, address: Address): Promise<ServiceResult<IAccount | undefined>>;
  fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[]
  ): Promise<ServiceResult<ISubAccount | undefined>>;
}

export interface IAccountService<TVaultEntity extends IHasVaultAddress = IVaultEntity> {
  fetchAccount(chainId: number, address: Address, options?: AccountFetchOptions): Promise<ServiceResult<Account<TVaultEntity>>>;
  fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[],
    options?: AccountFetchOptions
  ): Promise<ServiceResult<SubAccount<TVaultEntity> | undefined>>;
  populateVaults(accounts: Account<never>[], options?: AccountFetchOptions): Promise<ServiceResult<Account<TVaultEntity>[]>>;
}

export class AccountService<TVaultEntity extends IHasVaultAddress = IVaultEntity>
  implements IAccountService<TVaultEntity>
{
  private rewardsService?: IRewardsService;

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

  setRewardsService(rewardsService: IRewardsService): void {
    this.rewardsService = rewardsService;
  }

  async fetchAccount(chainId: number, address: Address, options?: AccountFetchOptions): Promise<ServiceResult<Account<TVaultEntity>>> {
    const fetched = await this.adapter.fetchAccount(chainId, address);
    const errors: DataIssue[] = [...fetched.errors];
    const account: Account<never> = fetched.result
      ? new Account(fetched.result)
      : new Account({
          chainId,
          owner: address,
          isLockdownMode: false,
          isPermitDisabledMode: false,
          subAccounts: {},
        });

    if (Boolean(options?.populateVaults) === false) {
      return { result: account as Account<TVaultEntity>, errors };
    }

    const populated = await this.populateVaults([account], options);
    errors.push(...populated.errors.map((e) => ({ ...e, path: withPathPrefix(e.path, "$") })));
    const result = populated.result[0]!;

    if (options?.populateMarketPrices && this.priceService) {
      try {
        errors.push(...(await result.populateMarketPrices(this.priceService)));
      } catch (error) {
        errors.push({
          code: "SOURCE_UNAVAILABLE",
          severity: "warning",
          message: "Failed to populate market prices for account.",
          path: "$",
          source: "priceService",
          originalValue: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (options?.populateUserRewards && this.rewardsService) {
      try {
        errors.push(...(await result.populateUserRewards(this.rewardsService)));
      } catch (error) {
        errors.push({
          code: "SOURCE_UNAVAILABLE",
          severity: "warning",
          message: "Failed to populate user rewards for account.",
          path: "$.userRewards",
          source: "rewardsService",
          originalValue: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { result, errors };
  }

  async fetchSubAccount(
    chainId: number,
    subAccount: Address,
    vaults?: Address[],
    options?: AccountFetchOptions
  ): Promise<ServiceResult<SubAccount<TVaultEntity> | undefined>> {
    const fetched = await this.adapter.fetchSubAccount(chainId, subAccount, vaults);
    const errors: DataIssue[] = [...fetched.errors];
    const sa = fetched.result;
    if (!sa) return { result: undefined, errors };

    if (options?.populateVaults === false) {
      return { result: new SubAccount(sa) as SubAccount<TVaultEntity>, errors };
    }

    const addresses = vaults?.length ? vaults : collectVaultAddressesFromSubAccountPositionsAndLiquidity(sa);
    if (addresses.length === 0) return { result: new SubAccount(sa) as SubAccount<TVaultEntity>, errors };

    const tempAccount = new Account<never>({
      chainId,
      owner: sa.owner,
      subAccounts: { [getAddress(sa.account)]: sa },
    });
    errors.push(...(await tempAccount.populateVaults(this.vaultMetaService, this.buildVaultFetchOptions(options))));
    return { result: tempAccount.getSubAccount(getAddress(sa.account)), errors };
  }

  async populateVaults(accounts: Account<never>[], options?: AccountFetchOptions): Promise<ServiceResult<Account<TVaultEntity>[]>> {
    const vaultFetchOptions = this.buildVaultFetchOptions(options);
    const errors: DataIssue[] = [];

    const result = await Promise.all(
      accounts.map((account) =>
        account
          .populateVaults(this.vaultMetaService, vaultFetchOptions)
          .then((accountErrors) => {
            errors.push(...accountErrors);
            return account as unknown as Account<TVaultEntity>;
          })
          .catch((error) => {
            errors.push({
              code: "SOURCE_UNAVAILABLE",
              severity: "warning",
              message: "Failed to populate vault entities for account.",
              path: "$",
              source: "vaultMetaService",
              originalValue: error instanceof Error ? error.message : String(error),
            });
            return account as unknown as Account<TVaultEntity>;
          })
      )
    );
    return { result, errors };
  }

  private buildVaultFetchOptions(options?: AccountFetchOptions): VaultFetchOptions | undefined {
    return options?.vaultFetchOptions;
  }
}
