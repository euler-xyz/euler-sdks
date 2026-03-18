import type { Address, Hex } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type { TransactionPlan } from "../executionService/index.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RewardSource = "merkl" | "brevis" | "fuul";
export type RewardAction = "LEND" | "BORROW";

export interface RewardCampaign {
  campaignId: string;
  source: RewardSource;
  action: RewardAction;
  /** APR as a decimal fraction (0.05 = 5%). */
  apr: number;
  rewardTokenAddress?: Address;
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

export interface UserRewardToken {
  address: Address;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
}

export interface UserReward {
  /** Chain the reward can be claimed on (may differ from account chain for cross-chain rewards). */
  chainId: number;
  /** Reward token metadata. */
  token: UserRewardToken;
  /** USD price per whole token (floating point). */
  tokenPrice: number;
  /** Reward provider. */
  provider: RewardSource;
  /** Total accumulated reward amount (raw, unscaled bigint as string). */
  accumulated: string;
  /** Unclaimed reward amount (raw, unscaled bigint as string). */
  unclaimed: string;
  /** Merkle proof for claiming. */
  proof?: Hex[];
  /** Contract address to call for claiming rewards. */
  claimAddress?: Address;
  /** Cumulative amounts for epoch-based claiming (Brevis). */
  cumulativeAmounts?: string[];
  /** Epoch identifier (Brevis). */
  epoch?: string;
}

export interface RewardsServiceConfig {
  merklApiUrl?: string;
  brevisApiUrl?: string;
  /** URL for Brevis user rewards proofs endpoint. */
  brevisProofsApiUrl?: string;
  /** Public Fuul incentives API base URL. */
  fuulApiUrl?: string;
  /** Optional app-hosted endpoint for Fuul totals. */
  fuulTotalsUrl?: string;
  /** Optional app-hosted endpoint for Fuul claim checks. */
  fuulClaimChecksUrl?: string;
  /** Chain IDs for which Brevis campaigns should be fetched (default: [1]). */
  brevisChainIds?: number[];
  /** Cache TTL in milliseconds (default: 300_000 = 5 min). */
  cacheTtlMs?: number;
  /** Override the Merkl distributor contract address (default: standard Merkl Distributor). */
  merklDistributorAddress?: Address;
  /** Optional Fuul claim manager address for user reward display / future claim flows. */
  fuulManagerAddress?: Address;
  /** Override the Fuul factory address used to read per-project claim fees. */
  fuulFactoryAddress?: Address;
  /** Feature flags for individual providers. */
  enableMerkl?: boolean;
  enableBrevis?: boolean;
  enableFuul?: boolean;
}

export interface BuildRewardClaimPlanArgs {
  reward: UserReward;
  account: Address;
}

export interface BuildRewardClaimsPlanArgs {
  rewards: UserReward[];
  account: Address;
}

export interface BuildRewardClaimAllPlanArgs {
  chainId: number;
  account: Address;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface IRewardsService {
  fetchVaultRewards(chainId: number, vaultAddress: Address): Promise<VaultRewardInfo | undefined>;
  fetchChainRewards(chainId: number): Promise<Map<string, VaultRewardInfo>>;
  populateRewards(vaults: ERC4626Vault[]): Promise<void>;
  fetchUserRewards(chainId: number, address: Address): Promise<UserReward[]>;
  fetchFuulTotals(address: Address): Promise<FuulTotals>;
  fetchFuulClaimChecks(address: Address): Promise<FuulClaimCheck[]>;
  buildClaimPlan(args: BuildRewardClaimPlanArgs): Promise<TransactionPlan>;
  buildClaimPlans(args: BuildRewardClaimsPlanArgs): Promise<TransactionPlan>;
  buildClaimAllPlan(args: BuildRewardClaimAllPlanArgs): Promise<TransactionPlan>;
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
  rewardUsdPrice?: number;
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

// ---------------------------------------------------------------------------
// Internal: Merkl user rewards API types
// ---------------------------------------------------------------------------

export interface MerklUserRewardEntry {
  token: {
    address: string;
    chainId: number;
    price: number;
    symbol: string;
    name: string;
    decimals: number;
    icon?: string;
    isTest?: boolean;
  };
  amount: string;
  claimed: string;
  proofs: string[];
}

export interface MerklUserChainRewards {
  chainId: number;
  rewards: MerklUserRewardEntry[];
}

// ---------------------------------------------------------------------------
// Internal: Brevis user rewards proofs API types
// ---------------------------------------------------------------------------

export interface BrevisUserRewardBatchEntry {
  campaignId: string;
  claimChainId: number;
  claimContractAddr: string;
  claimableRewards: string;
  epoch: string;
  cumulativeRewards: string[];
  merkleProof: string[];
}

export interface BrevisUserRewardsBatchResponse {
  err?: { code: string; msg: string } | null;
  rewardsBatch: BrevisUserRewardBatchEntry[] | null;
}

// ---------------------------------------------------------------------------
// Internal: Fuul API types
// ---------------------------------------------------------------------------

export interface FuulPool {
  name: string;
  token0_symbol: string;
  token0_address: string;
}

export interface FuulTrigger {
  type: string;
  context: {
    chain_id: number;
    token_address: string;
  };
}

export interface FuulIncentive {
  conversion: string;
  project: string;
  protocol: string;
  chain_id: number;
  pool: FuulPool;
  trigger: FuulTrigger;
  apr: number;
  tvl: number;
  refreshed_at: string;
}

export interface FuulClaimCheck {
  project_address: string;
  to: string;
  currency: string;
  currency_type: number;
  amount: string;
  reason: number;
  token_id: string;
  deadline: string;
  proof: string;
  signatures: string[];
}

export interface FuulTotalEntry {
  currency: string;
  currency_type: number;
  amount: string;
  chain_id: number;
}

export interface FuulTotals {
  claimed: FuulTotalEntry[];
  unclaimed: FuulTotalEntry[];
}
