import { Address, getAddress, isAddressEqual } from "viem";
import { getSubAccountAddress } from "../utils/subAccounts.js";
import type { VaultEntity } from "../services/vaults/vaultMetaService/index.js";
import type { IVaultMetaService } from "../services/vaults/vaultMetaService/index.js";
import type { VaultFetchOptions } from "../services/vaults/index.js";

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
}

export interface AccountLiquidity<TVaultEntity extends IHasVaultAddress = never> {
  vaultAddress: Address;
  vault?: TVaultEntity;
  unitOfAccount: Address;
  daysToLiquidation: DaysToLiquidation;
  liabilityValue: AssetValue;
  totalCollateralValue: AssetValue;
  collaterals: AccountLiquidityCollateral<TVaultEntity>[];
}

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
  liquidity?: AccountLiquidity<TVaultEntity>;
};

export interface SubAccount<TVaultEntity extends IHasVaultAddress = never> {
  timestamp: number;
  account: Address;
  owner: Address;
  lastAccountStatusCheckTimestamp: number;
  /** Always addresses; only positions and liquidity collaterals get resolved vault entities. */
  enabledControllers: Address[];
  /** Always addresses; only positions and liquidity collaterals get resolved vault entities. */
  enabledCollaterals: Address[];
  positions: AccountPosition<TVaultEntity>[];
}

export type SubAccountsMap<TVaultEntity extends IHasVaultAddress = never> = Partial<
  Record<Address, SubAccount<TVaultEntity>>
>;

export interface IAccount<TVaultEntity extends IHasVaultAddress = never> {
  chainId: number;
  owner: Address;
  subAccounts: SubAccountsMap<TVaultEntity>;
  isLockdownMode?: boolean;
  isPermitDisabledMode?: boolean;
}

export class Account<TVaultEntity extends IHasVaultAddress = never> implements IAccount<TVaultEntity> {
  chainId: number;
  owner: Address;
  isLockdownMode: boolean;
  isPermitDisabledMode: boolean;
  subAccounts: SubAccountsMap<TVaultEntity>;

  constructor(account: IAccount<TVaultEntity>) {
    this.chainId = account.chainId;
    this.owner = account.owner;
    this.subAccounts = account.subAccounts;
    this.isLockdownMode = account.isLockdownMode ?? false;
    this.isPermitDisabledMode = account.isPermitDisabledMode ?? false;
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
    return Account.mapVaultsToPositions(this, vaults);
  }

  /** Maps fetched vault entities onto positions and liquidity collaterals. Mutates in place. */
  private static mapVaultsToPositions<TResolved extends IHasVaultAddress>(
    account: Account<any>,
    vaults: TResolved[]
  ): Account<TResolved> {
    const byAddress = new Map<string, TResolved>();
    for (const v of vaults) {
      byAddress.set(getAddress(v.address), v);
    }
    const resolve = (addr: Address): TResolved | undefined => byAddress.get(getAddress(addr));
    for (const sa of Object.values(account.subAccounts ?? {})) {
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
    return account as unknown as Account<TResolved>;
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


