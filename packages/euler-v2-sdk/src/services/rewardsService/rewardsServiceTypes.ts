import type { Address, Hex } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type { AccountRewardStream } from "../../entities/Account.js";
import type { TransactionPlan } from "../executionService/index.js";
import type { IsActiveForViewerFn } from "./rewardCampaignEligibility.js";

export { VaultRewardInfo } from "./vaultRewardInfo.js";
import type { VaultRewardInfo } from "./vaultRewardInfo.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RewardSource = "merkl" | "brevis" | "fuul" | "turtle";
export type RewardAction = "LEND" | "BORROW" | "BORROW_COLLATERAL" | "LOOPING";

export interface RewardCampaign {
	campaignId: string;
	source: RewardSource;
	action: RewardAction;
	/** APR as a decimal fraction (0.05 = 5%). */
	apr: number;
	rewardTokenAddress?: Address;
	rewardTokenSymbol: string;
	rewardTokenIcon?: string;
	dailyRewards?: number;
	/** Campaign end time in seconds (unix timestamp). */
	endTimestamp?: number;
	/** Collateral/deposit vault address for collateral-specific borrow or looping rewards. */
	collateralAddress?: Address;
	/** Provider URL for the campaign/opportunity, when exposed by the source. */
	sourceUrl?: string;
	/** Minimum leverage multiplier for looping rewards. */
	minMultiplier?: number;
	/** Maximum leverage multiplier for looping rewards. */
	maxMultiplier?: number;
	/** Lowercased Merkl recipient allowlist/denylist, when provided by campaign params. */
	whitelist?: string[];
	blacklist?: string[];
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
	/** Optional provider campaign identifier, when the upstream exposes one. */
	campaignId?: string;
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
	/** Stream identifier for stream-based rewards (Turtle). */
	streamId?: string;
	/** Stream contract address for stream-based rewards (Turtle). */
	streamAddress?: Address;
	/** Proof timestamp for stream-based rewards. ISO string or Unix seconds. */
	timestamp?: string | number;
}

export interface TurtleStreamConfig {
	streamId: string;
	chainId: number;
	streamAddress?: Address;
	rewardToken?: Partial<UserRewardToken>;
	tokenPrice?: number;
}

export interface TurtleMerkleProof {
	streamId?: string;
	stream_id?: string;
	id?: string;
	streamAddress?: string;
	stream_address?: string;
	contractAddress?: string;
	contract_address?: string;
	claimAddress?: string;
	amount?: string | number;
	cumulativeAmount?: string | number;
	cumulative_amount?: string | number;
	claimable?: string | number;
	claimableAmount?: string | number;
	claimable_amount?: string | number;
	unclaimed?: string | number;
	unclaimedAmount?: string | number;
	unclaimed_amount?: string | number;
	timestamp?: string | number;
	proof?: string[];
	merkleProof?: string[];
	merkle_proof?: string[];
	token?: Partial<UserRewardToken>;
	rewardToken?: Partial<UserRewardToken>;
	tokenPrice?: string | number;
	tokenPriceUsd?: string | number;
	rewardTokenPriceUsd?: string | number;
}

export interface RewardsDirectAdapterConfig {
	merklApiUrl?: string;
	brevisApiUrl?: string;
	/** URL for Brevis user rewards proofs endpoint. */
	brevisProofsApiUrl?: string;
	/** Public Fuul incentives API base URL. */
	fuulApiUrl?: string;
	/** Turtle Earn API base URL. */
	turtleApiUrl?: string;
	/** Optional caller-hosted endpoint for Fuul totals. */
	fuulTotalsUrl?: string;
	/** Optional caller-hosted endpoint for Fuul claim checks. */
	fuulClaimChecksUrl?: string;
	/** Chain IDs for which Brevis campaigns should be fetched. When omitted, all chains are enabled. */
	brevisChainIds?: number[];
	/** Override the Merkl distributor contract address (default: standard Merkl Distributor). */
	merklDistributorAddress?: Address;
	/** Optional Fuul claim manager address for user reward display / future claim flows. */
	fuulManagerAddress?: Address;
	/** Override the Fuul factory address used to read per-project claim fees. */
	fuulFactoryAddress?: Address;
	/** Stream IDs/metadata used to query Turtle proof data directly. */
	turtleStreams?: TurtleStreamConfig[];
	/** Feature flags for individual providers. */
	enableMerkl?: boolean;
	enableBrevis?: boolean;
	enableFuul?: boolean;
	enableTurtle?: boolean;
}

export interface RewardsV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3.euler.finance`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
}

export interface RewardsServiceConfig {
	adapter?: "v3" | "direct" | "fallback";
	merklApiUrl?: string;
	brevisApiUrl?: string;
	/** URL for Brevis user rewards proofs endpoint. */
	brevisProofsApiUrl?: string;
	/** Public Fuul incentives API base URL. */
	fuulApiUrl?: string;
	/** Turtle Earn API base URL. */
	turtleApiUrl?: string;
	/** Optional caller-hosted endpoint for Fuul totals. */
	fuulTotalsUrl?: string;
	/** Optional caller-hosted endpoint for Fuul claim checks. */
	fuulClaimChecksUrl?: string;
	/** Chain IDs for which Brevis campaigns should be fetched. When omitted, all chains are enabled. */
	brevisChainIds?: number[];
	/** Override the Merkl distributor contract address (default: standard Merkl Distributor). */
	merklDistributorAddress?: Address;
	/** Optional Fuul claim manager address for user reward display / future claim flows. */
	fuulManagerAddress?: Address;
	/** Override the Fuul factory address used to read per-project claim fees. */
	fuulFactoryAddress?: Address;
	/** Stream IDs/metadata used to query Turtle proof data directly. */
	turtleStreams?: TurtleStreamConfig[];
	/** Feature flags for individual providers. */
	enableMerkl?: boolean;
	enableBrevis?: boolean;
	enableFuul?: boolean;
	enableTurtle?: boolean;
	directAdapterConfig?: RewardsDirectAdapterConfig;
	v3AdapterConfig?: RewardsV3AdapterConfig;
	/**
	 * Optional override for per-viewer eligibility (whitelist/blacklist).
	 * Defaults to Merkl semantics (see `defaultIsActiveForViewer`).
	 */
	isActiveForViewer?: IsActiveForViewerFn;
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

export interface RewardStreamPosition {
	account: Address;
	vault: Address;
}

export interface FetchRewardStreamsArgs {
	chainId: number;
	positions: RewardStreamPosition[];
	accountLensAddress?: Address;
}

export interface BuildRewardStreamClaimPlanArgs {
	chainId: number;
	rewardStreams: AccountRewardStream[];
	recipient: Address;
	rewardStreamsAddress?: Address;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface IRewardsService {
	fetchVaultRewards(
		chainId: number,
		vaultAddress: Address,
	): Promise<VaultRewardInfo | undefined>;
	fetchChainRewards(chainId: number): Promise<Map<string, VaultRewardInfo>>;
	populateRewards(vaults: ERC4626Vault[]): Promise<void>;
	fetchUserRewards(chainId: number, address: Address): Promise<UserReward[]>;
	fetchFuulTotals(address: Address, chainId?: number): Promise<FuulTotals>;
	fetchFuulClaimChecks(
		address: Address,
		chainId?: number,
	): Promise<FuulClaimCheck[]>;
	fetchRewardStreams(
		args: FetchRewardStreamsArgs,
	): Promise<AccountRewardStream[]>;
	buildClaimPlan(args: BuildRewardClaimPlanArgs): Promise<TransactionPlan>;
	buildClaimPlans(args: BuildRewardClaimsPlanArgs): Promise<TransactionPlan>;
	buildClaimAllPlan(
		args: BuildRewardClaimAllPlanArgs,
	): Promise<TransactionPlan>;
	buildRewardStreamClaimPlan(
		args: BuildRewardStreamClaimPlanArgs,
	): TransactionPlan;
}

export interface IRewardsAdapter {
	fetchVaultRewards(
		chainId: number,
		vaultAddress: Address,
	): Promise<VaultRewardInfo | undefined>;
	fetchChainRewards(chainId: number): Promise<Map<string, VaultRewardInfo>>;
	fetchUserRewards(chainId: number, address: Address): Promise<UserReward[]>;
	fetchFuulTotals(address: Address, chainId?: number): Promise<FuulTotals>;
	fetchFuulClaimChecks(
		address: Address,
		chainId?: number,
	): Promise<FuulClaimCheck[]>;
	fetchTurtleProofs?(
		address: Address,
		streamIds: string[],
	): Promise<TurtleMerkleProof[]>;
}

// ---------------------------------------------------------------------------
// Internal: Merkl API types
// ---------------------------------------------------------------------------

export interface MerklCampaign {
	id: string;
	campaignId: string;
	type: string;
	subType?: number | null;
	rewardToken: {
		address: string;
		symbol: string;
		icon?: string;
	};
	apr: number;
	dailyRewards: number;
	startTimestamp: number;
	endTimestamp: number;
	params?: {
		targetToken?: string;
		evkAddress?: string;
		collateralAddress?: string;
		whitelist?: string[];
		blacklist?: string[];
		markets?: Array<{
			campaignParameters?: {
				evkAddress?: string;
				targetToken?: string;
			};
		}>;
		vaults?: Array<{
			evkAddress?: string;
			collaterals?: Array<{
				tokenAddress?: string;
			}>;
		}>;
	};
}

export interface MerklOpportunity {
	chainId: number;
	type: string;
	identifier: string;
	status: "LIVE" | "PAST";
	action: "LEND" | "BORROW" | string;
	apr: number;
	dailyRewards: number;
	campaigns: MerklCampaign[];
	chain?: {
		name?: string;
	};
	aprRecord?: {
		breakdowns?: Array<{
			identifier: string;
			value: number;
		}>;
	};
}

// ---------------------------------------------------------------------------
// Internal: Brevis / Incentra API types
// ---------------------------------------------------------------------------

export interface BrevisRewardInfo {
	token_address: string;
	token_symbol: string;
	apr: number;
	rewardUsdPrice?: number;
	claim_chain_id?: number;
	claim_contract?: string;
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
		token_address?: string;
		borrowVault?: string;
		depositVault?: string;
		min_leverage?: number;
		max_leverage?: number;
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

export interface FuulClaimableReward {
	id?: string;
	user_address: string;
	currency_address: string;
	currency_chain_id: number | string;
	currency_name?: string;
	currency_decimals?: number | string;
	amount: string;
	project_address: string;
	reason: number | string;
	token_id: number | string;
	deadline: number | string;
	proof: string;
	signatures: string[];
	status?: string;
	sources?: Array<Record<string, unknown>>;
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
