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

const brevisRewardKey = (reward: UserReward): string | undefined =>
	reward.provider === "brevis" && reward.campaignId
		? `${reward.chainId}:${reward.campaignId}:${reward.token.address.toLowerCase()}`
		: undefined;

const hasBrevisClaimData = (reward: UserReward): boolean =>
	Boolean(
		reward.claimAddress &&
			reward.proof?.length &&
			reward.cumulativeAmounts?.length &&
			reward.epoch !== undefined &&
			reward.epoch !== "",
	);

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
		const merged = new Map(v3Rewards);
		for (const [vault, info] of directRewards) {
			const v3Info = merged.get(vault);
			const combined = mergeVaultRewardInfo(
				v3Info,
				info,
				campaignSources([v3Info]),
			);
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
		const merged = [...v3Rewards];
		const v3BrevisIndexes = new Map<string, number[]>();
		for (const [index, reward] of v3Rewards.entries()) {
			const key = brevisRewardKey(reward);
			if (key) v3BrevisIndexes.set(key, [...(v3BrevisIndexes.get(key) ?? []), index]);
		}
		// Fuul rows are currency totals rather than campaign rows, so V3 takes
		// precedence for that provider. Brevis rows can be matched by campaign.
		const served = new Set(v3Rewards.map((reward) => reward.provider));
		for (const reward of directRewards) {
			if (reward.provider === "brevis") {
				const key = brevisRewardKey(reward);
				const index = (key ? v3BrevisIndexes.get(key) : undefined)?.find(
					(candidate) => {
						const existing = merged[candidate]!;
						return (
							existing.epoch === reward.epoch ||
							(existing.epoch === undefined && !hasBrevisClaimData(existing))
						);
					},
				);
				if (index === undefined) {
					merged.push(reward);
				} else if (
					!hasBrevisClaimData(merged[index]!) &&
					hasBrevisClaimData(reward)
				) {
					merged[index] = reward;
				}
			} else if (!served.has(reward.provider)) {
				merged.push(reward);
			}
		}
		return merged;
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
