import { Address, getAddress, isAddressEqual } from "viem";
import { getSubAccountAddress } from "../utils/subAccounts.js";
export type AddressPrefix = `0x${string}`; // expects a hex string representation of 19 bytes

export interface SubAccount {
  timestamp: number;
  account: Address;
  owner: Address;
  lastAccountStatusCheckTimestamp: number;
  enabledControllers: Address[];
  enabledCollaterals: Address[];
  positions: AccountPosition[];
}

export interface AssetValue {
  liquidation: bigint;
  borrowing: bigint;
  oracleMid: bigint;
}

export type DaysToLiquidation = "Infinity" | "MoreThanAYear" | number;

export interface AccountLiquidity {
  vault: Address;
  unitOfAccount: Address;
  daysToLiquidation: DaysToLiquidation;
  liabilityValue: AssetValue; 
  totalCollateralValue: AssetValue;
  collaterals: {
    address: Address;
    value: AssetValue;
  }[];
};

export type AccountPosition = {
  account: Address;
  vault: Address;
  asset: Address;

  shares: bigint;
  assets: bigint;
  borrowed: bigint;

  isController: boolean;
  isCollateral: boolean;

  balanceForwarderEnabled: boolean;
  liquidity?: AccountLiquidity;
};

export type SubAccountsMap = Partial<Record<Address, SubAccount>>;

export interface IAccount {
  chainId: number;
  owner: Address;
  subAccounts: SubAccountsMap;
  isLockdownMode?: boolean;
  isPermitDisabledMode?: boolean;
}

export class Account implements IAccount {
  chainId: number;
  owner: Address;
  isLockdownMode: boolean;
  isPermitDisabledMode: boolean;
  subAccounts: SubAccountsMap;

  constructor(
    account: IAccount
  ) {
    this.chainId = account.chainId;
    this.owner = account.owner;
    this.subAccounts = account.subAccounts;
    this.isLockdownMode = account.isLockdownMode ?? false;
    this.isPermitDisabledMode = account.isPermitDisabledMode ?? false;
  }

  getSubAccount(account: Address): SubAccount | undefined {
    return this.subAccounts[getAddress(account)];
  }

  getSubAccountById(id: number): SubAccount | undefined {
    return this.subAccounts[getSubAccountAddress(this.owner, id)];
  }

  getPosition(account: Address, vault: Address): AccountPosition | undefined {
    const subAccount = this.getSubAccount(getAddress(account));
    return subAccount?.positions.find(p => isAddressEqual(p.vault, vault));
  }

  /**
   * Returns true if the given vault is enabled as collateral for the sub-account.
   * Returns false when sub-account is not available.
   */
  isCollateralEnabled(subAccountAddress: Address, vault: Address): boolean {
    const subAccount = this.getSubAccount(getAddress(subAccountAddress));
    if (!subAccount) return false;
    return subAccount.enabledCollaterals.some(coll => isAddressEqual(coll, vault));
  }

  /**
   * Returns true if the given vault is enabled as controller for the sub-account.
   * Returns false when sub-account is not available.
   */
  isControllerEnabled(subAccountAddress: Address, vault: Address): boolean {
    const subAccount = this.getSubAccount(getAddress(subAccountAddress));
    if (!subAccount) return false;
    return subAccount.enabledControllers.some(ctrl => isAddressEqual(ctrl, vault));
  }

  /**
   * Returns the current controller vault for the sub-account (there can only be one).
   * Returns undefined when sub-account is not available or has no controller enabled.
   */
  getCurrentController(subAccountAddress: Address): Address | undefined {
    const subAccount = this.getSubAccount(getAddress(subAccountAddress));
    if (!subAccount || subAccount.enabledControllers.length === 0) return undefined;
    return subAccount.enabledControllers[0];
  }

  /**
   * Replaces subAccounts with a map built from the given sub-accounts (keyed by account address).
   * Use in examples or when building account state from fetched sub-accounts.
   */
  updateSubAccounts(...subAccounts: SubAccount[]): void {
    const next: SubAccountsMap = {};
    for (const sa of subAccounts) {
      next[getAddress(sa.account)] = sa;
    }
    this.subAccounts = next;
  }
}

