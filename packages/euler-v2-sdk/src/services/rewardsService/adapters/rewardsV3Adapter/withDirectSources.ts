import type { Address } from "viem";
import type {
	IRewardsAdapter,
	RewardCampaign,
	RewardSource,
	UserReward,
} from "../../rewardsServiceTypes.js";
import { VaultRewardInfo } from "../../vaultRewardInfo.js";

/** Reward sources V3 does not serve; the SDK reads them directly beside V3. */
export const SOURCES_BESIDE_V3: readonly RewardSource[] = ["brevis", "fuul"];

export interface DirectSourceReads {
	fetchSourceChainRewards(
		chainId: number,
		sources: readonly RewardSource[],
	): Promise<Map<string, VaultRewardInfo>>;
	fetchSourceUserRewards(
		chainId: number,
		address: Address,
		sources: readonly RewardSource[],
	): Promise<UserReward[]>;
}

function campaignSources(
	infos: Iterable<VaultRewardInfo | undefined>,
): Set<string> {
	const sources = new Set<string>();
	for (const info of infos) {
		for (const campaign of info?.campaigns ?? []) sources.add(campaign.source);
	}
	return sources;
}

/** A source V3 has started to answer for is taken from V3 alone, never twice. */
function withoutServedSources(
	campaigns: readonly RewardCampaign[],
	served: Set<string>,
): RewardCampaign[] {
	return campaigns.filter((campaign) => !served.has(campaign.source));
}

function mergeVaultRewardInfo(
	v3: VaultRewardInfo | undefined,
	direct: VaultRewardInfo | undefined,
	served: Set<string>,
): VaultRewardInfo | undefined {
	const extra = withoutServedSources(direct?.campaigns ?? [], served);
	if (extra.length === 0) return v3;
	return new VaultRewardInfo({
		campaigns: [...(v3?.campaigns ?? []), ...extra],
	});
}

/**
 * Adds the reward sources V3 does not serve to a V3 adapter's answers. A
 * failed V3 read still fails, so a fallback to the direct adapter keeps
 * working; a failed direct read leaves V3's answer as it is.
 */
export function withDirectSources<T extends IRewardsAdapter>(
	v3: T,
	direct: DirectSourceReads,
): T {
	const fetchChainRewards = async (
		chainId: number,
	): Promise<Map<string, VaultRewardInfo>> => {
		const [v3Rewards, directRewards] = await Promise.all([
			v3.fetchChainRewards(chainId),
			direct
				.fetchSourceChainRewards(chainId, SOURCES_BESIDE_V3)
				.catch(() => new Map<string, VaultRewardInfo>()),
		]);
		const served = campaignSources(v3Rewards.values());
		const merged = new Map(v3Rewards);
		for (const [vault, info] of directRewards) {
			const combined = mergeVaultRewardInfo(merged.get(vault), info, served);
			if (combined) merged.set(vault, combined);
		}
		return merged;
	};

	const fetchVaultRewards = async (
		chainId: number,
		vaultAddress: Address,
	): Promise<VaultRewardInfo | undefined> => {
		const [v3Info, directInfo] = await Promise.all([
			v3.fetchVaultRewards(chainId, vaultAddress),
			direct
				.fetchSourceChainRewards(chainId, SOURCES_BESIDE_V3)
				.then((rewards) => rewards.get(vaultAddress.toLowerCase()))
				.catch(() => undefined),
		]);
		return mergeVaultRewardInfo(v3Info, directInfo, campaignSources([v3Info]));
	};

	const fetchUserRewards = async (
		chainId: number,
		address: Address,
	): Promise<UserReward[]> => {
		const [v3Rewards, directRewards] = await Promise.all([
			v3.fetchUserRewards(chainId, address),
			direct
				.fetchSourceUserRewards(chainId, address, SOURCES_BESIDE_V3)
				.catch(() => [] as UserReward[]),
		]);
		const served = new Set<string>(v3Rewards.map((reward) => reward.provider));
		return [
			...v3Rewards,
			...directRewards.filter((reward) => !served.has(reward.provider)),
		];
	};

	const overrides: Partial<Record<PropertyKey, unknown>> = {
		fetchChainRewards,
		fetchVaultRewards,
		fetchUserRewards,
	};

	return new Proxy(v3, {
		get(target, prop, receiver) {
			if (prop in overrides) return overrides[prop];
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}
