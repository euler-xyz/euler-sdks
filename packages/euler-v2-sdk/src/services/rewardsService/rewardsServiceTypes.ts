import type { Address } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RewardSource = "merkl" | "brevis";
export type RewardAction = "LEND" | "BORROW";

export interface RewardCampaign {
  campaignId: string;
  source: RewardSource;
  action: RewardAction;
  /** APR as a decimal fraction (0.05 = 5%). */
  apr: number;
  rewardTokenAddress: Address;
  rewardTokenSymbol: string;
  dailyRewards?: number;
  /** Campaign end time in seconds (unix timestamp). */
  endTimestamp?: number;
}

export interface VaultRewardInfo {
  /** Sum of all LIVE campaign APRs (decimal fraction). */
  totalRewardsApr: number;
  campaigns: RewardCampaign[];
}

export interface RewardsServiceConfig {
  merklApiUrl?: string;
  brevisApiUrl?: string;
  /** Chain IDs for which Brevis campaigns should be fetched (default: [1]). */
  brevisChainIds?: number[];
  /** Cache TTL in milliseconds (default: 300_000 = 5 min). */
  cacheTtlMs?: number;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface IRewardsService {
  getVaultRewards(chainId: number, vaultAddress: Address): Promise<VaultRewardInfo | undefined>;
  getChainRewards(chainId: number): Promise<Map<string, VaultRewardInfo>>;
  populateRewards(vaults: ERC4626Vault[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal: Merkl API types
// ---------------------------------------------------------------------------

export interface MerklCampaign {
  id: string;
  campaignId: string;
  type: string;
  rewardToken: {
    address: string;
    symbol: string;
  };
  apr: number;
  dailyRewards: number;
  startTimestamp: number;
  endTimestamp: number;
}

export interface MerklOpportunity {
  chainId: number;
  type: string;
  identifier: string;
  status: "LIVE" | "PAST";
  action: "LEND" | "BORROW";
  apr: number;
  dailyRewards: number;
  campaigns: MerklCampaign[];
}

// ---------------------------------------------------------------------------
// Internal: Brevis / Incentra API types
// ---------------------------------------------------------------------------

export interface BrevisRewardInfo {
  token_address: string;
  token_symbol: string;
  apr: number;
}

export interface BrevisCampaign {
  chain_id: number;
  vault_address: string;
  action: number; // 2001 = BORROW, 2002 = LEND
  campaign_id: string;
  campaign_name: string;
  start_time: number;
  end_time: number;
  reward_info: BrevisRewardInfo;
  status: number;
}

export interface BrevisCampaignsRequest {
  chain_id?: number[];
  action?: number[];
  status?: number[];
}

export interface BrevisCampaignsResponse {
  err?: { code: number; msg: string };
  campaigns: BrevisCampaign[];
}
