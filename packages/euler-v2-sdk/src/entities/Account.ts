import { Address, getAddress, isAddressEqual } from "viem";
import { getSubAccountAddress } from "../utils/subAccounts.js";
import type { VaultEntity } from "../services/vaults/vaultMetaService/index.js";
import type { IVaultMetaService } from "../services/vaults/vaultMetaService/index.js";
import type { VaultFetchOptions } from "../services/vaults/index.js";
import type { PriceWad } from "./ERC4626Vault.js";
import type { IPriceService } from "../services/priceService/index.js";
import type { IRewardsService, UserReward } from "../services/rewardsService/index.js";
import {
  computeHealthFactor,
  computeCurrentLTV,
  computeLiquidationLTV,
  computeMultiplier,
  computeSubAccountTotalCollateralValueUsd,
  computeSubAccountLiabilityValueUsd,
  computeSubAccountNetValueUsd,
  computeSubAccountRoe,
  computeCollateralLiquidationPrices,
  computeBorrowLiquidationPrice,
} from "../utils/accountComputations.js";
import type { SubAccountRoe } from "../utils/accountComputations.js";

export type AddressPrefix = `0x${string}`; // expects a hex string representation of 19 bytes

/** Base interface for vault-like values (has `address`). Used as generic constraint so custom vault entity types work. */
export interface IHasVaultAddress {
  address: Address;
}

/** Default vault entity type (EVault | EulerEarn | SecuritizeCollateralVault). Use as IVaultEntity in the SDK. */

export type IVaultEntity = VaultEntity;


export interface AssetValue {
  liquidation: bigint;
  borrowing: bigint;
  oracleMid: bigint;
}

export type DaysToLiquidation = "Infinity" | "MoreThanAYear" | number;

/** Vault is only ever a vault entity type (EVault, EulerEarn, SecuritizeCollateralVault, or custom). Use generic = never for unresolved (vault omitted). */
export interface AccountLiquidityCollateral<TVaultEntity extends IHasVaultAddress = never> {
  address: Address;
  vault?: TVaultEntity;
  value: AssetValue;
  /** USD price per underlying asset (18 dec WAD). Populated by `populateMarketPrices`. */
  marketPriceUsd?: PriceWad;
  /** Collateral value in USD (18 dec). Computed from `value.oracleMid * uoaUsdRate / 1e18`. */
  valueUsd?: bigint;
}

// ---------------------------------------------------------------------------
// AccountLiquidity
// ---------------------------------------------------------------------------

/** Raw liquidity data shape (returned by data sources). */
export interface IAccountLiquidity<TVaultEntity extends IHasVaultAddress = never> {
  vaultAddress: Address;
  vault?: TVaultEntity;
  unitOfAccount: Address;
  daysToLiquidation: DaysToLiquidation;
  liabilityValue: AssetValue;
  totalCollateralValue: AssetValue;
  collaterals: AccountLiquidityCollateral<TVaultEntity>[];
  /** Liability value in USD (18 dec). Populated by `populateMarketPrices`. */
  liabilityValueUsd?: bigint;
  /** Total collateral value in USD (18 dec). Populated by `populateMarketPrices`. */
  totalCollateralValueUsd?: bigint;
  /** Per-collateral liquidation price multipliers (WAD). Computed getter on AccountLiquidity class. */
  readonly collateralLiquidationPrices?: Record<Address, bigint>;
  /** Borrow liquidation price multiplier (WAD). `> 1` = safe margin. Computed getter on AccountLiquidity class. */
  readonly borrowLiquidationPrice?: bigint;
}

/** AccountLiquidity with computed getters for liquidation prices. */
export class AccountLiquidity<TVaultEntity extends IHasVaultAddress = never> implements IAccountLiquidity<TVaultEntity> {
  vaultAddress: Address;
  vault?: TVaultEntity;
  unitOfAccount: Address;
  daysToLiquidation: DaysToLiquidation;
  liabilityValue: AssetValue;
  totalCollateralValue: AssetValue;
  collaterals: AccountLiquidityCollateral<TVaultEntity>[];
  liabilityValueUsd?: bigint;
  totalCollateralValueUsd?: bigint;

  constructor(data: IAccountLiquidity<TVaultEntity>) {
    this.vaultAddress = data.vaultAddress;
    this.vault = data.vault;
    this.unitOfAccount = data.unitOfAccount;
    this.daysToLiquidation = data.daysToLiquidation;
    this.liabilityValue = data.liabilityValue;
    this.totalCollateralValue = data.totalCollateralValue;
    this.collaterals = data.collaterals;
    this.liabilityValueUsd = data.liabilityValueUsd;
    this.totalCollateralValueUsd = data.totalCollateralValueUsd;
  }

  /** Per-collateral liquidation price multipliers (WAD). */
  get collateralLiquidationPrices(): Record<Address, bigint> {
    return computeCollateralLiquidationPrices(this as unknown as IAccountLiquidity<IHasVaultAddress>);
  }

  /** Borrow liquidation price multiplier (WAD). `> 1` = safe margin. */
  get borrowLiquidationPrice(): bigint | undefined {
    return computeBorrowLiquidationPrice(this as unknown as IAccountLiquidity<IHasVaultAddress>);
  }
}

// ---------------------------------------------------------------------------
// AccountPosition
// ---------------------------------------------------------------------------

export type AccountPosition<TVaultEntity extends IHasVaultAddress = never> = {
  account: Address;
  vaultAddress: Address;
  /** Resolved vault entity only (never Address). Omitted when unresolved. */
  vault?: TVaultEntity;
  asset: Address;

  shares: bigint;
  assets: bigint;
  borrowed: bigint;

  isController: boolean;
  isCollateral: boolean;

  balanceForwarderEnabled: boolean;
  liquidity?: IAccountLiquidity<TVaultEntity>;

  /** USD price per underlying asset (18 dec WAD). Populated by `populateMarketPrices`. */
  marketPriceUsd?: PriceWad;
  /** Supplied value in USD (18 dec). `assets * marketPriceUsd / 10^decimals`. */
  suppliedValueUsd?: bigint;
  /** Borrowed value in USD (18 dec). `borrowed * marketPriceUsd / 10^decimals`. */
  borrowedValueUsd?: bigint;
};

// ---------------------------------------------------------------------------
// SubAccount
// ---------------------------------------------------------------------------

/** Raw sub-account data shape (returned by data sources). */
export interface ISubAccount<TVaultEntity extends IHasVaultAddress = never> {
  timestamp: number;
  account: Address;
  owner: Address;
  lastAccountStatusCheckTimestamp: number;
  /** Always addresses; only positions and liquidity collaterals get resolved vault entities. */
  enabledControllers: Address[];
  /** Always addresses; only positions and liquidity collaterals get resolved vault entities. */
  enabledCollaterals: Address[];
  positions: AccountPosition<TVaultEntity>[];

  /** Health factor (WAD). `> 1e18` = healthy. Computed getter on SubAccount class. */
  readonly healthFactor?: bigint;
  /** Current LTV (WAD). `liabilityValue / totalCollateralValue`. Computed getter on SubAccount class. */
  readonly currentLTV?: bigint;
  /** Weighted-average liquidation LTV threshold (WAD). Computed getter on SubAccount class. */
  readonly liquidationLTV?: bigint;
  /** Leverage multiplier (WAD, 1e18 = 1x). Requires USD data. Computed getter on SubAccount class. */
  readonly multiplier?: bigint;
  /** Total collateral value in USD (18 dec). Requires USD data. Computed getter on SubAccount class. */
  readonly totalCollateralValueUsd?: bigint;
  /** Liability value in USD (18 dec). Requires USD data. Computed getter on SubAccount class. */
  readonly liabilityValueUsd?: bigint;
  /** Net value in USD (18 dec): sum(supplied) - sum(borrowed). Computed getter on SubAccount class. */
  readonly netValueUsd?: bigint;
  /** ROE breakdown (decimal fractions). Requires populated vaults + market prices. Computed getter on SubAccount class. */
  readonly roe?: SubAccountRoe;
}

/** SubAccount with computed getters for risk metrics. */
export class SubAccount<TVaultEntity extends IHasVaultAddress = never> implements ISubAccount<TVaultEntity> {
  timestamp: number;
  account: Address;
  owner: Address;
  lastAccountStatusCheckTimestamp: number;
  enabledControllers: Address[];
  enabledCollaterals: Address[];
  positions: AccountPosition<TVaultEntity>[];

  constructor(data: ISubAccount<TVaultEntity>) {
    this.timestamp = data.timestamp;
    this.account = data.account;
    this.owner = data.owner;
    this.lastAccountStatusCheckTimestamp = data.lastAccountStatusCheckTimestamp;
    this.enabledControllers = data.enabledControllers;
    this.enabledCollaterals = data.enabledCollaterals;
    // Wrap raw liquidity objects in AccountLiquidity class instances
    this.positions = data.positions.map((p) => {
      if (p.liquidity && !(p.liquidity instanceof AccountLiquidity)) {
        return { ...p, liquidity: new AccountLiquidity(p.liquidity) };
      }
      return p;
    });
  }

  /** Health factor (WAD). `> 1e18` = healthy. */
  get healthFactor(): bigint | undefined {
    return computeHealthFactor(this as unknown as ISubAccount<IHasVaultAddress>);
  }

  /** Current LTV (WAD). `liabilityValue / totalCollateralValue`. */
  get currentLTV(): bigint | undefined {
    return computeCurrentLTV(this as unknown as ISubAccount<IHasVaultAddress>);
  }

  /** Weighted-average liquidation LTV threshold (WAD). */
  get liquidationLTV(): bigint | undefined {
    return computeLiquidationLTV(this as unknown as ISubAccount<IHasVaultAddress>);
  }

  /** Leverage multiplier (WAD, 1e18 = 1x). Requires USD data. */
  get multiplier(): bigint | undefined {
    return computeMultiplier(this as unknown as ISubAccount<IHasVaultAddress>);
  }

  /** Total collateral value in USD (18 dec). Requires USD data. */
  get totalCollateralValueUsd(): bigint | undefined {
    return computeSubAccountTotalCollateralValueUsd(this as unknown as ISubAccount<IHasVaultAddress>);
  }

  /** Liability value in USD (18 dec). Requires USD data. */
  get liabilityValueUsd(): bigint | undefined {
    return computeSubAccountLiabilityValueUsd(this as unknown as ISubAccount<IHasVaultAddress>);
  }

  /** Net value in USD (18 dec): sum(supplied) - sum(borrowed). */
  get netValueUsd(): bigint | undefined {
    return computeSubAccountNetValueUsd(this as unknown as ISubAccount<IHasVaultAddress>);
  }

  /** ROE breakdown (decimal fractions, 0.05 = 5%). Requires populated vaults + market prices. */
  get roe(): SubAccountRoe | undefined {
    return computeSubAccountRoe(this as unknown as ISubAccount<IHasVaultAddress>);
  }
}

export type SubAccountsMap<TVaultEntity extends IHasVaultAddress = never> = Partial<
  Record<Address, SubAccount<TVaultEntity>>
>;

export interface IAccount<TVaultEntity extends IHasVaultAddress = never> {
  chainId: number;
  owner: Address;
  subAccounts: Partial<Record<Address, ISubAccount<TVaultEntity>>>;
  isLockdownMode?: boolean;
  isPermitDisabledMode?: boolean;
}

export class Account<TVaultEntity extends IHasVaultAddress = never> implements IAccount<TVaultEntity> {
  chainId: number;
  owner: Address;
  isLockdownMode: boolean;
  isPermitDisabledMode: boolean;
  subAccounts: SubAccountsMap<TVaultEntity>;
  /** Per-user unclaimed rewards from Merkl/Brevis. Populated by `populateUserRewards`. */
  userRewards?: UserReward[];

  constructor(account: IAccount<TVaultEntity>) {
    this.chainId = account.chainId;
    this.owner = account.owner;
    this.isLockdownMode = account.isLockdownMode ?? false;
    this.isPermitDisabledMode = account.isPermitDisabledMode ?? false;

    // Wrap raw ISubAccount data into SubAccount class instances
    const wrapped: SubAccountsMap<TVaultEntity> = {};
    for (const [addr, sa] of Object.entries(account.subAccounts ?? {})) {
      if (sa) {
        wrapped[addr as Address] = sa instanceof SubAccount ? sa : new SubAccount(sa);
      }
    }
    this.subAccounts = wrapped;
  }

  getSubAccount(account: Address): SubAccount<TVaultEntity> | undefined {
    return this.subAccounts[getAddress(account)];
  }

  getSubAccountById(id: number): SubAccount<TVaultEntity> | undefined {
    return this.subAccounts[getSubAccountAddress(this.owner, id)];
  }

  getPosition(account: Address, vault: Address): AccountPosition<TVaultEntity> | undefined {
    const subAccount = this.getSubAccount(getAddress(account));
    return subAccount?.positions.find((p) => isAddressEqual(p.vaultAddress, getAddress(vault)));
  }

  /**
   * Returns true if the given vault is enabled as collateral for the sub-account.
   * Returns false when sub-account is not available.
   */
  isCollateralEnabled(subAccountAddress: Address, vault: Address): boolean {
    const subAccount = this.getSubAccount(getAddress(subAccountAddress));
    if (!subAccount) return false;
    return subAccount.enabledCollaterals.some((coll) => isAddressEqual(coll, getAddress(vault)));
  }

  /**
   * Returns true if the given vault is enabled as controller for the sub-account.
   * Returns false when sub-account is not available.
   */
  isControllerEnabled(subAccountAddress: Address, vault: Address): boolean {
    const subAccount = this.getSubAccount(getAddress(subAccountAddress));
    if (!subAccount) return false;
    return subAccount.enabledControllers.some((ctrl) => isAddressEqual(ctrl, getAddress(vault)));
  }

  /**
   * Returns the current controller vault address for the sub-account (there can only be one).
   * Returns undefined when sub-account is not available or has no controller enabled.
   */
  getCurrentController(subAccountAddress: Address): Address | undefined {
    const subAccount = this.getSubAccount(getAddress(subAccountAddress));
    if (!subAccount || subAccount.enabledControllers.length === 0) return undefined;
    return subAccount.enabledControllers[0];
  }

  /**
   * Fetches vault entities from the service and maps them onto positions and liquidity collaterals.
   * Mutates in place. Returns this account re-typed as Account<TResolved>.
   */
  async populateVaults<TResolved extends IHasVaultAddress>(
    vaultMetaService: IVaultMetaService<TResolved>,
    options?: VaultFetchOptions
  ): Promise<Account<TResolved>> {
    const set = new Set<string>();
    const push = (a: Address) => set.add(getAddress(a));
    for (const sa of Object.values(this.subAccounts ?? {})) {
      if (!sa) continue;
      for (const p of sa.positions) {
        push(p.vaultAddress);
        if (p.liquidity) {
          push(p.liquidity.vaultAddress);
          p.liquidity.collaterals.forEach((c) => push(c.address));
        }
      }
    }
    const addresses = Array.from(set, (s) => s as Address);
    if (addresses.length === 0) return this as unknown as Account<TResolved>;
    const vaults = await vaultMetaService.fetchVaults(this.chainId, addresses, options);
    return this.mapVaultsToPositions(vaults);
  }

  /** Maps fetched vault entities onto positions and liquidity collaterals. Mutates in place. */
  mapVaultsToPositions<TResolved extends IHasVaultAddress>(
    vaults: TResolved[]
  ): Account<TResolved> {
    const byAddress = new Map<string, TResolved>();
    for (const v of vaults) {
      byAddress.set(getAddress(v.address), v);
    }
    const resolve = (addr: Address): TResolved | undefined => byAddress.get(getAddress(addr));
    for (const sa of Object.values(this.subAccounts ?? {})) {
      if (!sa) continue;
      for (const p of sa.positions) {
        const entity = resolve(p.vaultAddress);
        if (entity !== undefined) (p as unknown as AccountPosition<TResolved>).vault = entity;
        if (p.liquidity) {
          const liqEntity = resolve(p.liquidity.vaultAddress);
          const liq = p.liquidity as unknown as AccountLiquidity<TResolved>;
          if (liqEntity !== undefined) liq.vault = liqEntity;
          liq.collaterals = p.liquidity.collaterals.map((c) => {
            const collEntity = resolve(c.address);
            return collEntity !== undefined ? { ...c, vault: collEntity } : c;
          }) as AccountLiquidityCollateral<TResolved>[];
        }
      }
    }
    return this as unknown as Account<TResolved>;
  }

  /**
   * Populates USD market prices on positions and liquidity data.
   * Requires `populateVaults` to have been called first (vault entities must be resolved).
   * Mutates in place and returns `this`.
   */
  async populateMarketPrices(priceService: IPriceService): Promise<this> {
    const ONE_18 = 10n ** 18n;

    // Collect unique vault entities and populate their market prices
    const vaultEntities = new Map<string, TVaultEntity>();
    for (const sa of Object.values(this.subAccounts ?? {})) {
      if (!sa) continue;
      for (const p of sa.positions) {
        if (p.vault) vaultEntities.set(getAddress(p.vault.address), p.vault);
        if (p.liquidity?.vault) vaultEntities.set(getAddress(p.liquidity.vault.address), p.liquidity.vault);
        if (p.liquidity) {
          for (const c of p.liquidity.collaterals) {
            if (c.vault) vaultEntities.set(getAddress(c.vault.address), c.vault);
          }
        }
      }
    }

    // Call populateMarketPrices on each unique vault entity (duck-typed)
    await Promise.all(
      Array.from(vaultEntities.values()).map(async (vault) => {
        if (typeof (vault as any).populateMarketPrices === "function") {
          await (vault as any).populateMarketPrices(priceService);
        }
      })
    );

    // Populate position USD values
    for (const sa of Object.values(this.subAccounts ?? {})) {
      if (!sa) continue;
      for (const p of sa.positions) {
        const vault = p.vault as any;
        if (vault?.marketPriceUsd != null && vault?.asset?.decimals != null) {
          const price = vault.marketPriceUsd as bigint;
          const decimals = BigInt(vault.asset.decimals as number);
          p.marketPriceUsd = price;
          p.suppliedValueUsd = (p.assets * price) / 10n ** decimals;
          if (p.borrowed > 0n) {
            p.borrowedValueUsd = (p.borrowed * price) / 10n ** decimals;
          }
        }

        // Populate liquidity USD values
        if (p.liquidity?.vault) {
          const liqVault = p.liquidity.vault as any;
          const uoaRate = await priceService.getUnitOfAccountUsdRate(liqVault).catch(() => undefined);
          if (uoaRate != null) {
            p.liquidity.liabilityValueUsd = (p.liquidity.liabilityValue.oracleMid * uoaRate) / ONE_18;
            p.liquidity.totalCollateralValueUsd =
              (p.liquidity.totalCollateralValue.oracleMid * uoaRate) / ONE_18;
            for (const c of p.liquidity.collaterals) {
              c.valueUsd = (c.value.oracleMid * uoaRate) / ONE_18;
              const collVault = c.vault as any;
              if (collVault?.marketPriceUsd != null) {
                c.marketPriceUsd = collVault.marketPriceUsd;
              }
            }
          }
        }

      }
    }

    return this;
  }

  /** Sum of `suppliedValueUsd` across all positions. `undefined` if no USD data populated. */
  get totalSuppliedValueUsd(): bigint | undefined {
    let total: bigint | undefined;
    for (const sa of Object.values(this.subAccounts ?? {})) {
      if (!sa) continue;
      for (const p of sa.positions) {
        if (p.suppliedValueUsd != null) {
          total = (total ?? 0n) + p.suppliedValueUsd;
        }
      }
    }
    return total;
  }

  /** Sum of `borrowedValueUsd` across all positions. `undefined` if no USD data populated. */
  get totalBorrowedValueUsd(): bigint | undefined {
    let total: bigint | undefined;
    for (const sa of Object.values(this.subAccounts ?? {})) {
      if (!sa) continue;
      for (const p of sa.positions) {
        if (p.borrowedValueUsd != null) {
          total = (total ?? 0n) + p.borrowedValueUsd;
        }
      }
    }
    return total;
  }

  /** Net asset value in USD: totalSupplied - totalBorrowed. `undefined` if no USD data populated. */
  get netAssetValueUsd(): bigint | undefined {
    const supplied = this.totalSuppliedValueUsd;
    const borrowed = this.totalBorrowedValueUsd;
    if (supplied == null) return undefined;
    return supplied - (borrowed ?? 0n);
  }

  /** Total unclaimed rewards value in USD (18 dec). `undefined` if no user rewards populated. */
  get totalRewardsValueUsd(): bigint | undefined {
    if (!this.userRewards || this.userRewards.length === 0) return undefined;
    const PRICE_PRECISION = 8;
    const PRICE_SCALE = 10 ** PRICE_PRECISION;
    const WAD_SCALER = 10n ** BigInt(18 - PRICE_PRECISION); // 10^10
    let total = 0n;
    for (const reward of this.userRewards) {
      if (reward.tokenPrice <= 0 || reward.unclaimed === "0") continue;
      const unclaimed = BigInt(reward.unclaimed);
      const priceScaled = BigInt(Math.round(reward.tokenPrice * PRICE_SCALE));
      const tokenDecimals = BigInt(reward.token.decimals);
      total += (unclaimed * priceScaled * WAD_SCALER) / (10n ** tokenDecimals);
    }
    return total;
  }

  /**
   * Fetches per-user unclaimed rewards from Merkl and Brevis providers.
   * Populates `this.userRewards`. Returns `this`.
   */
  async populateUserRewards(rewardsService: IRewardsService): Promise<this> {
    this.userRewards = await rewardsService.getUserRewards(this.chainId, this.owner);
    return this;
  }

  /**
   * Replaces subAccounts with a map built from the given sub-accounts (keyed by account address).
   * Use in examples or when building account state from fetched sub-accounts.
   */
  updateSubAccounts(...subAccounts: SubAccount<TVaultEntity>[]): void {
    const next: SubAccountsMap<TVaultEntity> = {};
    for (const sa of subAccounts) {
      next[getAddress(sa.account)] = sa;
    }
    this.subAccounts = next;
  }
}
