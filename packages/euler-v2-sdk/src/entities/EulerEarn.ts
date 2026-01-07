import { Address, Token } from "./EVault.js";

export interface VaultInfoERC4626 {
  timestamp: bigint;
  vault: Address;
  vaultName: string;
  vaultSymbol: string;
  vaultDecimals: bigint;
  asset: Address;
  assetName: string;
  assetSymbol: string;
  assetDecimals: bigint;
  totalShares: bigint;
  totalAssets: bigint;
  isEVault: boolean;
}

export interface EulerEarnVaultStrategyInfo {
  strategy: Address;
  allocatedAssets: bigint;
  availableAssets: bigint;
  currentAllocationCap: bigint;
  pendingAllocationCap: bigint;
  pendingAllocationCapValidAt: bigint;
  removableAt: bigint;
  info: VaultInfoERC4626;
}

export interface IEulerEarn {
  timestamp: bigint;
  address: Address;
  vault: Token;
  asset: Token;
  totalShares: bigint;
  totalAssets: bigint;
  lostAssets: bigint;
  availableAssets: bigint;
  timelock: bigint;
  performanceFee: bigint;
  feeReceiver: Address;
  owner: Address;
  creator: Address;
  curator: Address;
  guardian: Address;
  evc: Address;
  permit2: Address;
  pendingTimelock: bigint;
  pendingTimelockValidAt: bigint;
  pendingGuardian: Address;
  pendingGuardianValidAt: bigint;
  supplyQueue: Address[];
  strategies: EulerEarnVaultStrategyInfo[];
}

export class EulerEarn implements IEulerEarn {
  timestamp: bigint;
  address: Address;
  vault: Token;
  asset: Token;
  totalShares: bigint;
  totalAssets: bigint;
  lostAssets: bigint;
  availableAssets: bigint;
  timelock: bigint;
  performanceFee: bigint;
  feeReceiver: Address;
  owner: Address;
  creator: Address;
  curator: Address;
  guardian: Address;
  evc: Address;
  permit2: Address;
  pendingTimelock: bigint;
  pendingTimelockValidAt: bigint;
  pendingGuardian: Address;
  pendingGuardianValidAt: bigint;
  supplyQueue: Address[];
  strategies: EulerEarnVaultStrategyInfo[];

  constructor(params: IEulerEarn) {
    this.timestamp = params.timestamp;
    this.address = params.address;
    this.vault = params.vault;
    this.asset = params.asset;
    this.totalShares = params.totalShares;
    this.totalAssets = params.totalAssets;
    this.lostAssets = params.lostAssets;
    this.availableAssets = params.availableAssets;
    this.timelock = params.timelock;
    this.performanceFee = params.performanceFee;
    this.feeReceiver = params.feeReceiver;
    this.owner = params.owner;
    this.creator = params.creator;
    this.curator = params.curator;
    this.guardian = params.guardian;
    this.evc = params.evc;
    this.permit2 = params.permit2;
    this.pendingTimelock = params.pendingTimelock;
    this.pendingTimelockValidAt = params.pendingTimelockValidAt;
    this.pendingGuardian = params.pendingGuardian;
    this.pendingGuardianValidAt = params.pendingGuardianValidAt;
    this.supplyQueue = params.supplyQueue;
    this.strategies = params.strategies;
  }
}

