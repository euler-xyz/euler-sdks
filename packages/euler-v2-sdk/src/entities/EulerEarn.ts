import { Address } from "viem";
import { ERC4626Data, Token, VaultType } from "../utils/types.js";
import { ERC4626Vault, IERC4626Vault, IERC4626VaultConversion, VIRTUAL_DEPOSIT_AMOUNT } from "./ERC4626Vault.js";


export interface EulerEarnAllocationCap {
  current: bigint;
  pending: bigint;
  pendingValidAt: number;
}

export interface EulerEarnStrategyInfo extends ERC4626Data {
  address: Address;
  vaultType: VaultType;
  allocatedAssets: bigint;
  availableAssets: bigint;
  allocationCap: EulerEarnAllocationCap;
  removableAt: number;
}

export interface EulerEarnGovernance {
  owner: Address;
  creator: Address;
  curator: Address;
  guardian: Address;
  feeReceiver: Address;

  timelock: number;

  pendingTimelock: number;
  pendingTimelockValidAt: number;
  pendingGuardian: Address;
  pendingGuardianValidAt: number;
}

export interface IEulerEarn extends IERC4626Vault {
  lostAssets: bigint;
  availableAssets: bigint;
  performanceFee: number;

  governance: EulerEarnGovernance;

  supplyQueue: Address[];
  strategies: EulerEarnStrategyInfo[];

  timestamp: number;
}

export class EulerEarn extends ERC4626Vault implements IEulerEarn, IERC4626VaultConversion {
  lostAssets: bigint;
  availableAssets: bigint;
  performanceFee: number;

  governance: EulerEarnGovernance;

  supplyQueue: Address[];
  strategies: EulerEarnStrategyInfo[];

  timestamp: number;

  constructor(args: IEulerEarn) {
    super(args);
    this.lostAssets = args.lostAssets;
    this.availableAssets = args.availableAssets;
    this.performanceFee = args.performanceFee;

    this.governance = args.governance;

    this.supplyQueue = args.supplyQueue;
    this.strategies = args.strategies;

    this.timestamp = args.timestamp;
  }

  isPendingRemoval(strategy: EulerEarnStrategyInfo): boolean {
    return this.strategies.some((s) => s.address === strategy.address && s.removableAt > this.timestamp);
  }

  /** Conversion using VIRTUAL_DEPOSIT (matches EVault contract). */
  override convertToAssets(shares: bigint): bigint {
    const totalAssetsAdjusted = this.totalAssets + VIRTUAL_DEPOSIT_AMOUNT;
    const totalSharesAdjusted = this.totalShares + VIRTUAL_DEPOSIT_AMOUNT;
    return (shares * totalAssetsAdjusted) / totalSharesAdjusted;
  }

  /** Conversion using VIRTUAL_DEPOSIT (matches EVault contract). */
  override convertToShares(assets: bigint): bigint {
    const totalAssetsAdjusted = this.totalAssets + VIRTUAL_DEPOSIT_AMOUNT;
    const totalSharesAdjusted = this.totalShares + VIRTUAL_DEPOSIT_AMOUNT;
    return (assets * totalSharesAdjusted) / totalAssetsAdjusted;
  }
}

