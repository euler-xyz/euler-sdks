import { type Address, type Hex, getAddress } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import type {
	FuulClaimCheck,
	FuulTotals,
	IRewardsAdapter,
	RewardAction,
	RewardCampaign,
	RewardSource,
	UserReward,
	UserRewardToken,
	VaultRewardInfo,
} from "../../rewardsServiceTypes.js";
import type {
	RewardsV3AdapterConfig,
	V3ListEnvelope,
	V3RewardsApyRow,
	V3RewardsBreakdownEnvelope,
	V3RewardsBreakdownRow,
} from "./rewardsV3AdapterTypes.js";

const DEFAULT_PAGE_SIZE = 100;

const normalizeAddress = (value?: string): Address | undefined => {
	if (!value) return undefined;
	try {
		return getAddress(value) as Address;
	} catch {
		return undefined;
	}
};

const normalizeProvider = (value?: string): RewardSource | undefined => {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized.includes("merkl")) return "merkl";
	if (normalized.includes("brevis")) return "brevis";
	if (normalized.includes("fuul")) return "fuul";
	return undefined;
};

const normalizeAction = (value?: string): RewardAction | undefined => {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized.includes("borrow")) return "BORROW";
	if (normalized.includes("lend") || normalized.includes("supply")) return "LEND";
	return undefined;
};

const normalizeBigintString = (value: unknown): string | undefined => {
	if (typeof value === "string" && value.length > 0) return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.trunc(value).toString();
	}
	return undefined;
};

export class RewardsV3Adapter implements IRewardsAdapter {
	constructor(
		private config: RewardsV3AdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: RewardsV3AdapterConfig): void {
		this.config = config;
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	private buildUrl(
		endpoint: string,
		path: string,
		search?: Record<string, string>,
	): string {
		const normalizedEndpoint = endpoint.replace(/\/+$/, "");
		const joined =
			normalizedEndpoint.startsWith("http://") ||
			normalizedEndpoint.startsWith("https://")
				? new URL(path, `${normalizedEndpoint}/`).toString()
				: `${normalizedEndpoint}${path}`;

		if (!search || Object.keys(search).length === 0) return joined;

		const params = new URLSearchParams(search);
		return `${joined}?${params.toString()}`;
	}

	queryV3RewardsBreakdown = async (
		chainId: number,
		account: Address,
		vault?: Address,
	): Promise<V3RewardsBreakdownEnvelope> => {
		const url = this.buildUrl(this.config.endpoint, "/v3/rewards/breakdown", {
			chainId: String(chainId),
			account,
			...(vault ? { vault } : {}),
		});

		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok) {
			throw new Error(`rewardsV3 ${response.status} ${response.statusText}`);
		}
		return response.json() as Promise<V3RewardsBreakdownEnvelope>;
	};

	setQueryV3RewardsBreakdown(fn: typeof this.queryV3RewardsBreakdown): void {
		this.queryV3RewardsBreakdown = fn;
	}

	queryV3RewardsApyPage = async (
		chainId: number,
		offset: number,
		limit: number,
		vault?: Address,
	): Promise<V3ListEnvelope<V3RewardsApyRow>> => {
		const url = this.buildUrl(this.config.endpoint, "/v3/apys/rewards", {
			chainId: String(chainId),
			offset: String(offset),
			limit: String(limit),
			...(vault ? { vault } : {}),
		});

		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok) {
			throw new Error(`rewardsV3 ${response.status} ${response.statusText}`);
		}
		return response.json() as Promise<V3ListEnvelope<V3RewardsApyRow>>;
	};

	setQueryV3RewardsApyPage(fn: typeof this.queryV3RewardsApyPage): void {
		this.queryV3RewardsApyPage = fn;
	}

	async fetchVaultRewards(
		chainId: number,
		vaultAddress: Address,
	): Promise<VaultRewardInfo | undefined> {
		const rewardsMap = await this.fetchRewardsApyMap(chainId, vaultAddress);
		return rewardsMap.get(vaultAddress.toLowerCase());
	}

	async fetchChainRewards(chainId: number): Promise<Map<string, VaultRewardInfo>> {
		return this.fetchRewardsApyMap(chainId);
	}

	async fetchUserRewards(chainId: number, address: Address): Promise<UserReward[]> {
		const response = await this.queryV3RewardsBreakdown(chainId, address);
		const rows = Array.isArray(response.data) ? response.data : [];
		return rows
			.map((row) => this.convertRow(chainId, row))
			.filter((reward): reward is UserReward => reward !== undefined);
	}

	async fetchFuulTotals(address: Address): Promise<FuulTotals> {
		return { claimed: [], unclaimed: [] };
	}

	async fetchFuulClaimChecks(address: Address): Promise<FuulClaimCheck[]> {
		return [];
	}

	private async fetchRewardsApyMap(
		chainId: number,
		vault?: Address,
	): Promise<Map<string, VaultRewardInfo>> {
		const pageSize = DEFAULT_PAGE_SIZE;
		let offset = 0;
		const map = new Map<string, VaultRewardInfo>();

		for (;;) {
			const page = await this.queryV3RewardsApyPage(
				chainId,
				offset,
				pageSize,
				vault,
			);
			const rows = Array.isArray(page.data) ? page.data : [];

			for (const row of rows) {
				this.mergeRewardsApyRow(map, row);
			}

			if (rows.length < pageSize) break;
			offset += rows.length;
			if (typeof page.meta?.total === "number" && offset >= page.meta.total) break;
		}

		return map;
	}

	private mergeRewardsApyRow(
		map: Map<string, VaultRewardInfo>,
		row: V3RewardsApyRow,
	): void {
		const vaultAddress = normalizeAddress(row.vault ?? row.vaultAddress);
		const provider = normalizeProvider(row.provider ?? row.source);
		const action = normalizeAction(row.action);
		const apr = typeof row.apr === "number" ? row.apr / 100 : undefined;

		if (!vaultAddress || !provider || !action || !apr) return;

		const rewardTokenAddress = normalizeAddress(
			row.rewardToken?.address ?? row.rewardTokenAddress ?? row.token?.address,
		);
		const rewardTokenSymbol =
			row.rewardToken?.symbol ?? row.rewardTokenSymbol ?? row.token?.symbol;

		if (!rewardTokenSymbol) return;

		const campaign: RewardCampaign = {
			campaignId:
				row.campaignId ??
				row.id ??
				`${provider}:${action}:${vaultAddress}:${rewardTokenAddress ?? rewardTokenSymbol}`,
			source: provider,
			action,
			apr,
			rewardTokenAddress,
			rewardTokenSymbol,
			dailyRewards: row.dailyRewards,
			endTimestamp: row.endTimestamp ?? row.endTime,
		};

		const key = vaultAddress.toLowerCase();
		let info = map.get(key);
		if (!info) {
			info = { totalRewardsApr: 0, campaigns: [] };
			map.set(key, info);
		}

		const dedupeKey = `${campaign.source}:${campaign.campaignId}`;
		const exists = info.campaigns.some(
			(existing) => `${existing.source}:${existing.campaignId}` === dedupeKey,
		);
		if (exists) return;

		info.campaigns.push(campaign);
		info.totalRewardsApr += campaign.apr;
	}

	private convertRow(
		defaultChainId: number,
		row: V3RewardsBreakdownRow,
	): UserReward | undefined {
		const provider = normalizeProvider(row.provider ?? row.source);
		if (!provider) return undefined;

		const tokenAddress = normalizeAddress(
			row.token?.address ?? row.rewardTokenAddress ?? row.tokenAddress,
		);
		if (!tokenAddress) return undefined;

		const token: UserRewardToken = {
			address: tokenAddress,
			chainId: row.token?.chainId ?? row.chainId ?? defaultChainId,
			symbol:
				row.token?.symbol ??
				row.rewardTokenSymbol ??
				row.tokenSymbol ??
				tokenAddress,
			name:
				row.token?.name ??
				row.rewardTokenName ??
				row.tokenName ??
				(row.token?.symbol ??
					row.rewardTokenSymbol ??
					row.tokenSymbol ??
					tokenAddress),
			decimals:
				row.token?.decimals ??
				row.rewardTokenDecimals ??
				row.tokenDecimals ??
				18,
		};

		const accumulated =
			normalizeBigintString(
				row.accumulated ?? row.accumulatedAmount ?? row.totalAccumulated,
			) ?? "0";
		const unclaimed =
			normalizeBigintString(
				row.unclaimed ?? row.unclaimedAmount ?? row.claimable ?? row.claimableAmount,
			) ?? accumulated;

		if (BigInt(unclaimed) <= 0n) return undefined;

		return {
			chainId: row.chainId ?? defaultChainId,
			token,
			tokenPrice:
				row.rewardTokenPriceUsd ?? row.tokenPriceUsd ?? row.tokenPrice ?? 0,
			provider,
			accumulated,
			unclaimed,
			proof: (row.proof ?? row.proofs ?? row.merkleProof) as Hex[] | undefined,
			claimAddress: normalizeAddress(
				row.claimAddress ?? row.claimContract ?? row.claimContractAddr,
			),
			cumulativeAmounts: row.cumulativeAmounts ?? row.cumulativeRewards,
			epoch:
				typeof row.epoch === "number"
					? String(row.epoch)
					: row.epoch,
		};
	}
}
