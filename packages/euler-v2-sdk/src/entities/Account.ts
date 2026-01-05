import { Address } from "viem";
export type AddressPrefix = `0x${string}`; // expects a hex string representation of 19 bytes

export interface SubAccount {
  timestamp: bigint;
  addressPrefix: AddressPrefix;
  account: Address;
  owner: Address;
  isLockdownMode: boolean;
  isPermitDisabledMode: boolean;
  lastAccountStatusCheckTimestamp: bigint;
  enabledControllers: Address[];
  enabledCollaterals: Address[];
  positions: Position[];
}

export interface AccountLiquidityInfo {
  queryFailure: boolean;
  queryFailureReason: string;
  account: Address;
  vault: Address;
  unitOfAccount: Address;
  timeToLiquidation: bigint;
  liabilityValueBorrowing: bigint;
  liabilityValueLiquidation: bigint;
  collateralValueBorrowing: bigint;
  collateralValueLiquidation: bigint;
  collateralValueRaw: bigint;
  collaterals: Address[];
  collateralValuesBorrowing: bigint[];
  collateralValuesLiquidation: bigint[];
  collateralValuesRaw: bigint[];
};

export type Position = {
  timestamp: bigint;
  account: Address;
  vault: Address;
  asset: Address;
  assetsAccount: bigint;
  shares: bigint;
  assets: bigint;
  borrowed: bigint;
  assetAllowanceVault: bigint;
  assetAllowanceVaultPermit2: bigint;
  assetAllowanceExpirationVaultPermit2: bigint;
  assetAllowancePermit2: bigint;
  balanceForwarderEnabled: boolean;
  isController: boolean;
  isCollateral: boolean;
  liquidityInfo: AccountLiquidityInfo;
};

export interface IAccount {
  timestamp: bigint;
  owner: Address;
  addressPrefix: AddressPrefix;
  subAccounts: SubAccount[];
}

export class Account implements IAccount {
  timestamp: bigint;
  owner: Address;
  addressPrefix: AddressPrefix;
  subAccounts: SubAccount[];

  constructor(
    timestamp: bigint,
    owner: Address,
    addressPrefix: AddressPrefix,
    subAccounts: SubAccount[]
  ) {
    this.timestamp = timestamp;
    this.owner = owner;
    this.addressPrefix = addressPrefix;
    this.subAccounts = subAccounts;
  }
}



