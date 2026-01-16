import { Address } from "viem";
export type AddressPrefix = `0x${string}`; // expects a hex string representation of 19 bytes

export interface SubAccount {
  timestamp: number;
  account: Address;
  owner: Address;
  isLockdownMode: boolean;
  isPermitDisabledMode: boolean;
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

export interface AccountAllowances {
  assetForVault: bigint;
  assetForPermit2: bigint;
  assetForVaultInPermit2: bigint;
  permit2ExpirationTime: number;
}

export type AccountPosition = {
  account: Address;
  vault: Address;
  asset: Address;

  walletBalance: bigint;
  shares: bigint;
  assets: bigint;
  borrowed: bigint;

  allowances: AccountAllowances;

  isController: boolean;
  isCollateral: boolean;
  
  balanceForwarderEnabled: boolean;
  liquidity?: AccountLiquidity;
};

export interface IAccount {
  chainId: number;
  owner: Address;
  subAccounts: SubAccount[];
}

export class Account implements IAccount {
  chainId: number;
  owner: Address;
  subAccounts: SubAccount[];

  constructor(
    account: IAccount
  ) {
    this.chainId = account.chainId;
    this.owner = account.owner;
    this.subAccounts = account.subAccounts;
  }
}



