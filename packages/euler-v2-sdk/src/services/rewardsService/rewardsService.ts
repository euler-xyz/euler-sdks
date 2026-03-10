import { type Address, type Hex, getAddress } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type {
  IRewardsService,
  RewardsServiceConfig,
  VaultRewardInfo,
  RewardCampaign,
  UserReward,
  MerklOpportunity,
  BrevisCampaign,
  BrevisCampaignsResponse,
  MerklUserChainRewards,
  BrevisUserRewardsBatchResponse,
  FuulClaimCheck,
  FuulIncentive,
  FuulTotals,
} from "./rewardsServiceTypes.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MERKL_API_URL = "https://api.merkl.xyz/v4";
const DEFAULT_BREVIS_API_URL =
  "https://incentra-prd.brevis.network/sdk/v1/eulerCampaigns";
const DEFAULT_BREVIS_PROOFS_API_URL =
  "https://incentra-prd.brevis.network/v1/getMerkleProofsBatch";
const DEFAULT_FUUL_API_URL = "https://api.fuul.xyz/api/v1";
const DEFAULT_BREVIS_CHAIN_IDS = [1];
const DEFAULT_CACHE_TTL_MS = 300_000; // 5 minutes

/** Standard Merkl Distributor contract address (same on all EVM chains via CREATE2). */
const DEFAULT_MERKL_DISTRIBUTOR: Address = "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
const DEFAULT_FUUL_MANAGER: Address = "0x8a0836dA623ea1083c85acB958DeEa3716b39dc6";

// Brevis action codes
const BREVIS_LEND = 2002;
const BREVIS_BORROW = 2001;

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  timestamp: number;
  data: Map<string, VaultRewardInfo>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RewardsService implements IRewardsService {
  private merklApiUrl: string;
  private brevisApiUrl: string;
  private brevisProofsApiUrl: string;
  private fuulApiUrl: string;
  private fuulTotalsUrl?: string;
  private fuulClaimChecksUrl?: string;
  private brevisChainIds: number[];
  private cacheTtlMs: number;
  private merklDistributorAddress: Address;
  private fuulManagerAddress: Address;
  private enableMerkl: boolean;
  private enableBrevis: boolean;
  private enableFuul: boolean;
  private cache = new Map<number, CacheEntry>();

  constructor(config?: RewardsServiceConfig, buildQuery?: BuildQueryFn) {
    this.merklApiUrl = config?.merklApiUrl ?? DEFAULT_MERKL_API_URL;
    this.brevisApiUrl = config?.brevisApiUrl ?? DEFAULT_BREVIS_API_URL;
    this.brevisProofsApiUrl = config?.brevisProofsApiUrl ?? DEFAULT_BREVIS_PROOFS_API_URL;
    this.fuulApiUrl = config?.fuulApiUrl ?? DEFAULT_FUUL_API_URL;
    this.fuulTotalsUrl = config?.fuulTotalsUrl;
    this.fuulClaimChecksUrl = config?.fuulClaimChecksUrl;
    this.brevisChainIds = config?.brevisChainIds ?? DEFAULT_BREVIS_CHAIN_IDS;
    this.cacheTtlMs = config?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.merklDistributorAddress = config?.merklDistributorAddress ?? DEFAULT_MERKL_DISTRIBUTOR;
    this.fuulManagerAddress = config?.fuulManagerAddress ?? DEFAULT_FUUL_MANAGER;
    this.enableMerkl = config?.enableMerkl ?? true;
    this.enableBrevis = config?.enableBrevis ?? true;
    this.enableFuul = config?.enableFuul ?? true;
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  // -----------------------------------------------------------------------
  // Query methods (decoratable via buildQuery)
  // -----------------------------------------------------------------------

  queryMerklOpportunities = async (url: string): Promise<MerklOpportunity[]> => {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  setQueryMerklOpportunities(fn: typeof this.queryMerklOpportunities): void {
    this.queryMerklOpportunities = fn;
  }

  queryBrevisCampaigns = async (
    url: string,
    body: object
  ): Promise<BrevisCampaignsResponse> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { campaigns: [] };
    return res.json() as Promise<BrevisCampaignsResponse>;
  };

  setQueryBrevisCampaigns(fn: typeof this.queryBrevisCampaigns): void {
    this.queryBrevisCampaigns = fn;
  }

  queryMerklUserRewards = async (url: string): Promise<MerklUserChainRewards[]> => {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  setQueryMerklUserRewards(fn: typeof this.queryMerklUserRewards): void {
    this.queryMerklUserRewards = fn;
  }

  queryBrevisUserProofs = async (
    url: string,
    body: object
  ): Promise<BrevisUserRewardsBatchResponse> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { err: null, rewardsBatch: null };
    return res.json() as Promise<BrevisUserRewardsBatchResponse>;
  };

  setQueryBrevisUserProofs(fn: typeof this.queryBrevisUserProofs): void {
    this.queryBrevisUserProofs = fn;
  }

  queryFuulIncentives = async (url: string): Promise<FuulIncentive[]> => {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data as FuulIncentive[] : [];
  };

  setQueryFuulIncentives(fn: typeof this.queryFuulIncentives): void {
    this.queryFuulIncentives = fn;
  }

  queryFuulTotals = async (url: string): Promise<FuulTotals> => {
    const res = await fetch(url);
    if (!res.ok) return { claimed: [], unclaimed: [] };
    const data = await res.json() as Partial<FuulTotals>;
    return {
      claimed: Array.isArray(data.claimed) ? data.claimed : [],
      unclaimed: Array.isArray(data.unclaimed) ? data.unclaimed : [],
    };
  };

  setQueryFuulTotals(fn: typeof this.queryFuulTotals): void {
    this.queryFuulTotals = fn;
  }

  queryFuulClaimChecks = async (
    url: string,
    body: object
  ): Promise<FuulClaimCheck[]> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data as FuulClaimCheck[] : [];
  };

  setQueryFuulClaimChecks(fn: typeof this.queryFuulClaimChecks): void {
    this.queryFuulClaimChecks = fn;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async fetchVaultRewards(
    chainId: number,
    vaultAddress: Address
  ): Promise<VaultRewardInfo | undefined> {
    const chainMap = await this.fetchChainRewards(chainId);
    return chainMap.get(vaultAddress.toLowerCase());
  }

  async fetchChainRewards(chainId: number): Promise<Map<string, VaultRewardInfo>> {
    const cached = this.cache.get(chainId);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    const [merklCampaigns, brevisCampaigns, fuulCampaigns] = await Promise.all([
      this.enableMerkl ? this.fetchMerklCampaigns(chainId) : Promise.resolve([]),
      this.enableBrevis && this.brevisChainIds.includes(chainId)
        ? this.fetchBrevisCampaigns(chainId)
        : Promise.resolve([]),
      this.enableFuul ? this.fetchFuulCampaigns(chainId) : Promise.resolve([]),
    ]);

    const rewardsMap = this.mergeCampaigns(
      merklCampaigns,
      brevisCampaigns,
      fuulCampaigns
    );

    this.cache.set(chainId, { timestamp: Date.now(), data: rewardsMap });
    return rewardsMap;
  }

  async populateRewards(vaults: ERC4626Vault[]): Promise<void> {
    if (vaults.length === 0) return;

    // Group by chainId for efficient fetching
    const byChain = new Map<number, ERC4626Vault[]>();
    for (const vault of vaults) {
      const arr = byChain.get(vault.chainId) ?? [];
      arr.push(vault);
      byChain.set(vault.chainId, arr);
    }

    await Promise.all(
      Array.from(byChain.entries()).map(async ([chainId, chainVaults]) => {
        const rewardsMap = await this.fetchChainRewards(chainId);
        for (const vault of chainVaults) {
          vault.rewards = rewardsMap.get(vault.address.toLowerCase());
          vault.populated.rewards = true;
        }
      })
    );
  }

  async fetchUserRewards(chainId: number, address: Address): Promise<UserReward[]> {
    const [merklRewards, brevisRewards, fuulRewards] = await Promise.all([
      this.enableMerkl ? this.fetchMerklUserRewards(chainId, address) : Promise.resolve([]),
      this.enableBrevis && this.brevisChainIds.includes(chainId)
        ? this.fetchBrevisUserRewards(chainId, address)
        : Promise.resolve([]),
      this.enableFuul ? this.fetchFuulUserRewards(chainId, address) : Promise.resolve([]),
    ]);

    return [
      ...merklRewards,
      ...brevisRewards,
      ...fuulRewards,
    ];
  }

  // -----------------------------------------------------------------------
  // Internal: Merkl
  // -----------------------------------------------------------------------

  private async fetchMerklCampaigns(
    chainId: number
  ): Promise<RewardCampaign[]> {
    const urls = [
      `${this.merklApiUrl}/opportunities/?chainId=${chainId}&type=EULER&campaigns=true`,
      `${this.merklApiUrl}/opportunities/?chainId=${chainId}&mainProtocolId=euler&campaigns=true&type=ERC20LOGPROCESSOR`,
    ];

    const results = await Promise.all(
      urls.map((url) => this.queryMerklOpportunities(url).catch(() => []))
    );

    const opportunities: MerklOpportunity[] = results.flat();
    const campaigns: RewardCampaign[] = [];

    for (const opp of opportunities) {
      if (opp.status !== "LIVE") continue;

      for (const c of opp.campaigns ?? []) {
        campaigns.push({
          campaignId: c.campaignId,
          source: "merkl",
          action: opp.action,
          // Merkl API returns APR as a percentage (5.5 = 5.5%); normalise to decimal fraction
          apr: c.apr / 100,
          rewardTokenAddress: getAddress(c.rewardToken.address) as Address,
          rewardTokenSymbol: c.rewardToken.symbol,
          dailyRewards: c.dailyRewards,
          endTimestamp: c.endTimestamp,
          // attach the vault address via a private field pattern below
          _vaultAddress: opp.identifier.toLowerCase(),
        } as RewardCampaign & { _vaultAddress: string });
      }
    }

    return campaigns;
  }

  // -----------------------------------------------------------------------
  // Internal: Brevis
  // -----------------------------------------------------------------------

  private async fetchBrevisCampaigns(
    chainId: number
  ): Promise<RewardCampaign[]> {
    const body = {
      chain_id: [chainId],
      action: [BREVIS_LEND, BREVIS_BORROW],
      status: [3], // ACTIVE
    };

    const response = await this.queryBrevisCampaigns(
      this.brevisApiUrl,
      body
    ).catch(() => ({ campaigns: [] }) as BrevisCampaignsResponse);

    if (response.err || !response.campaigns) return [];

    return response.campaigns.map((c: BrevisCampaign) => ({
      campaignId: c.campaign_id,
      source: "brevis" as const,
      action: c.action === BREVIS_LEND ? ("LEND" as const) : ("BORROW" as const),
      apr: c.reward_info.apr,
      rewardTokenAddress: getAddress(c.reward_info.token_address) as Address,
      rewardTokenSymbol: c.reward_info.token_symbol,
      endTimestamp: c.end_time,
      _vaultAddress: c.vault_address.toLowerCase(),
    } as RewardCampaign & { _vaultAddress: string }));
  }

  // -----------------------------------------------------------------------
  // Internal: Fuul campaigns
  // -----------------------------------------------------------------------

  private async fetchFuulCampaigns(
    chainId: number
  ): Promise<RewardCampaign[]> {
    const url = `${this.fuulApiUrl}/incentives?protocol=euler&chain_id=${chainId}`;
    const incentives = await this.queryFuulIncentives(url).catch(() => []);

    return incentives
      .filter((item) => item.trigger?.context?.token_address)
      .map((item) => ({
        campaignId: `${item.protocol}:${item.project}:${item.trigger.context.token_address.toLowerCase()}`,
        source: "fuul" as const,
        action: "LEND" as const,
        apr: item.apr / 100,
        rewardTokenSymbol: item.project,
        endTimestamp: 0,
        _vaultAddress: item.trigger.context.token_address.toLowerCase(),
      } as RewardCampaign & { _vaultAddress: string }));
  }

  // -----------------------------------------------------------------------
  // Internal: Merge
  // -----------------------------------------------------------------------

  private mergeCampaigns(
    merklCampaigns: RewardCampaign[],
    brevisCampaigns: RewardCampaign[],
    fuulCampaigns: RewardCampaign[] = []
  ): Map<string, VaultRewardInfo> {
    const map = new Map<string, VaultRewardInfo>();

    const all = [
      ...merklCampaigns,
      ...brevisCampaigns,
      ...fuulCampaigns,
    ] as (RewardCampaign & { _vaultAddress: string })[];

    for (const campaign of all) {
      const key = campaign._vaultAddress; // already lowercased
      if (!key || !campaign.apr) continue;

      let info = map.get(key);
      if (!info) {
        info = { totalRewardsApr: 0, campaigns: [] };
        map.set(key, info);
      }

      // Deduplicate by source + campaignId
      const dedupeKey = `${campaign.source}:${campaign.campaignId}`;
      const exists = info.campaigns.some(
        (c) => `${c.source}:${c.campaignId}` === dedupeKey
      );
      if (exists) continue;

      // Strip internal _vaultAddress before storing
      const { _vaultAddress, ...cleanCampaign } = campaign;
      info.campaigns.push(cleanCampaign);
      info.totalRewardsApr += cleanCampaign.apr;
    }

    return map;
  }

  // -----------------------------------------------------------------------
  // Internal: Merkl user rewards
  // -----------------------------------------------------------------------

  private async fetchMerklUserRewards(
    chainId: number,
    address: Address
  ): Promise<UserReward[]> {
    const url = `${this.merklApiUrl}/users/${address}/rewards?chainId=${chainId}`;

    const chainRewardsList = await this.queryMerklUserRewards(url).catch(() => []);

    const rewards: UserReward[] = [];
    for (const chainRewards of chainRewardsList) {
      for (const reward of chainRewards.rewards ?? []) {
        const unclaimed = BigInt(reward.amount) - BigInt(reward.claimed);
        if (unclaimed <= 0n) continue;

        const tokenPrice = Math.abs(reward.token.price) < 1e-8 ? 0 : reward.token.price;

        rewards.push({
          chainId: reward.token.chainId,
          token: {
            address: getAddress(reward.token.address) as Address,
            chainId: reward.token.chainId,
            symbol: reward.token.symbol,
            name: reward.token.name,
            decimals: reward.token.decimals,
          },
          tokenPrice,
          provider: "merkl",
          accumulated: reward.amount,
          unclaimed: unclaimed.toString(),
          proof: reward.proofs as Hex[],
          claimAddress: this.merklDistributorAddress,
        });
      }
    }

    return rewards;
  }

  // -----------------------------------------------------------------------
  // Internal: Brevis user rewards
  // -----------------------------------------------------------------------

  private async fetchBrevisUserRewards(
    chainId: number,
    address: Address
  ): Promise<UserReward[]> {
    // Fetch campaigns with broader status to get token metadata and prices
    const campaignsResponse = await this.queryBrevisCampaigns(
      this.brevisApiUrl,
      {
        chain_id: [chainId],
        user_address: [address],
        status: ["DEPLOYING", "ACTIVE", "ENDED"],
      }
    ).catch(() => ({ campaigns: [] }) as BrevisCampaignsResponse);

    if (!campaignsResponse.campaigns?.length) return [];

    // Build campaign lookup by campaign_id
    const campaignMap = new Map<string, BrevisCampaign>();
    for (const c of campaignsResponse.campaigns) {
      campaignMap.set(c.campaign_id, c);
    }

    // Fetch user proofs
    const proofsResponse = await this.queryBrevisUserProofs(
      this.brevisProofsApiUrl,
      {
        user_addr: address,
        types: [BREVIS_BORROW, BREVIS_LEND],
        chain_id: [chainId],
      }
    ).catch(() => ({ err: null, rewardsBatch: null }) as BrevisUserRewardsBatchResponse);

    if (proofsResponse.err || !proofsResponse.rewardsBatch?.length) return [];

    const rewards: UserReward[] = [];
    for (const batch of proofsResponse.rewardsBatch) {
      const campaign = campaignMap.get(batch.campaignId);
      if (!campaign) continue;

      const tokenPrice = campaign.reward_info.rewardUsdPrice ?? 0;
      if (!tokenPrice) continue;

      const accumulated = batch.cumulativeRewards
        .reduce((acc, curr) => acc + BigInt(curr), 0n)
        .toString();

      rewards.push({
        chainId: batch.claimChainId,
        token: {
          address: getAddress(campaign.reward_info.token_address) as Address,
          chainId: batch.claimChainId,
          symbol: campaign.reward_info.token_symbol,
          name: campaign.reward_info.token_symbol,
          decimals: 18,
        },
        tokenPrice,
        provider: "brevis",
        accumulated,
        unclaimed: batch.claimableRewards,
        proof: batch.merkleProof as Hex[],
        claimAddress: getAddress(batch.claimContractAddr) as Address,
        cumulativeAmounts: batch.cumulativeRewards,
        epoch: batch.epoch,
      });
    }

    return rewards;
  }

  // -----------------------------------------------------------------------
  // Internal/Public: Fuul user rewards
  // -----------------------------------------------------------------------

  async fetchFuulTotals(address: Address): Promise<FuulTotals> {
    if (!this.fuulTotalsUrl) return { claimed: [], unclaimed: [] };
    const separator = this.fuulTotalsUrl.includes("?") ? "&" : "?";
    const url = `${this.fuulTotalsUrl}${separator}user_identifier=${encodeURIComponent(address)}&user_identifier_type=evm_address`;
    return this.queryFuulTotals(url).catch(() => ({ claimed: [], unclaimed: [] }));
  }

  async fetchFuulClaimChecks(address: Address): Promise<FuulClaimCheck[]> {
    if (!this.fuulClaimChecksUrl) return [];
    return this.queryFuulClaimChecks(this.fuulClaimChecksUrl, {
      userIdentifier: address,
      userIdentifierType: "evm_address",
    }).catch(() => []);
  }

  private async fetchFuulUserRewards(
    chainId: number,
    address: Address
  ): Promise<UserReward[]> {
    const totals = await this.fetchFuulTotals(address);
    const rewards: UserReward[] = [];

    for (const reward of totals.unclaimed) {
      if (reward.chain_id !== chainId) continue;
      const tokenAddress = getAddress(reward.currency) as Address;
      rewards.push({
        chainId: reward.chain_id,
        token: {
          address: tokenAddress,
          chainId: reward.chain_id,
          symbol: tokenAddress,
          name: tokenAddress,
          decimals: 18,
        },
        tokenPrice: 0,
        provider: "fuul",
        accumulated: reward.amount,
        unclaimed: reward.amount,
        claimAddress: this.fuulManagerAddress,
      });
    }

    return rewards;
  }
}
