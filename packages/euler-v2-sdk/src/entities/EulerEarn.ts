import { Address } from "viem";
import { ERC4626Data, Token, VaultType } from "../utils/types.js";


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

export interface IEulerEarn extends ERC4626Data {
  chainId: number;
  address: Address;

  lostAssets: bigint;
  availableAssets: bigint;
  performanceFee: number;

  governance: EulerEarnGovernance;

  supplyQueue: Address[];
  strategies: EulerEarnStrategyInfo[];

  timestamp: number;
}

export class EulerEarn implements IEulerEarn {
  chainId: number;
  address: Address;

  shares: Token;
  asset: Token;
  totalShares: bigint;
  totalAssets: bigint;

  lostAssets: bigint;
  availableAssets: bigint;
  performanceFee: number;

  governance: EulerEarnGovernance;

  supplyQueue: Address[];
  strategies: EulerEarnStrategyInfo[];

  timestamp: number;

  constructor(args: IEulerEarn) {
    this.chainId = args.chainId;
    this.address = args.address;

    this.shares = args.shares;
    this.asset = args.asset;
    this.totalShares = args.totalShares;
    this.totalAssets = args.totalAssets;

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
}

