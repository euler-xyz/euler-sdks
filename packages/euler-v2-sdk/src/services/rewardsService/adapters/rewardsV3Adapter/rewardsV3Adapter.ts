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
	TurtleMerkleProof,
	UserReward,
	UserRewardToken,
} from "../../rewardsServiceTypes.js";
import { VaultRewardInfo } from "../../vaultRewardInfo.js";
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
	if (normalized.includes("brevis") || normalized.includes("incentra"))
		return "brevis";
	if (normalized.includes("fuul")) return "fuul";
	if (normalized.includes("turtle")) return "turtle";
	return undefined;
};

const normalizeAction = (value?: string): RewardAction | undefined => {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized.includes("loop")) return "LOOPING";
	if (normalized.includes("borrow") && normalized.includes("collateral"))
		return "BORROW_COLLATERAL";
	if (normalized.includes("borrow")) return "BORROW";
	if (normalized.includes("lend") || normalized.includes("supply"))
		return "LEND";
	return undefined;
};

const isActiveCampaign = (args: {
	status?: string;
	startTimestamp?: string | number;
	endTimestamp?: string | number;
	nowMs?: number;
}): boolean => {
	const nowMs = args.nowMs ?? Date.now();
	const normalizedStatus = args.status?.trim().toLowerCase();

	if (normalizedStatus) {
		if (
			["ended", "expired", "inactive", "failed", "past"].includes(
				normalizedStatus,
			)
		) {
			return false;
		}
		if (["active", "live", "running", "success"].includes(normalizedStatus)) {
			return true;
		}
	}

	const parseTimestampMs = (value?: string | number): number | undefined => {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value > 1e12 ? value : value * 1000;
		}
		if (typeof value === "string" && value.length > 0) {
			const parsed = Date.parse(value);
			if (Number.isFinite(parsed)) return parsed;
			const numeric = Number(value);
			if (Number.isFinite(numeric))
				return numeric > 1e12 ? numeric : numeric * 1000;
		}
		return undefined;
	};

	const startMs = parseTimestampMs(args.startTimestamp);
	const endMs = parseTimestampMs(args.endTimestamp);

	if (startMs !== undefined && nowMs < startMs) return false;
	if (endMs !== undefined && nowMs >= endMs) return false;

	return true;
};

const normalizeBigintString = (value: unknown): string | undefined => {
	if (typeof value === "string" && value.length > 0) return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.trunc(value).toString();
	}
	return undefined;
};

const normalizeFiniteNumber = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
};

const normalizeTimestampSeconds = (value: unknown): number | undefined => {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "number" && Number.isFinite(value)) {
		return value > 1e12 ? Math.floor(value / 1000) : value;
	}
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) {
			return numeric > 1e12 ? Math.floor(numeric / 1000) : numeric;
		}
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
	}
	return undefined;
};

const normalizeNonNegativeInteger = (value: unknown): number | undefined => {
	const parsed = normalizeFiniteNumber(value);
	if (parsed === undefined) return undefined;
	const integer = Math.trunc(parsed);
	return integer >= 0 ? integer : undefined;
};

const normalizeAddressList = (
	list?: readonly string[],
): string[] | undefined => {
	if (!list?.length) return undefined;
	return list.map((address) => address.toLowerCase());
};

type RewardsClaimAdapter = Pick<
	IRewardsAdapter,
	"fetchFuulTotals" | "fetchFuulClaimChecks"
> & {
	fetchBrevisUserRewardClaims?: (
		chainId: number,
		address: Address,
	) => Promise<UserReward[]>;
	fetchTurtleProofs?: (
		address: Address,
		streamIds: string[],
	) => Promise<TurtleMerkleProof[]>;
};

type RewardTokenLike = {
	address?: string;
	chainId?: number;
	symbol?: string;
	name?: string;
	decimals?: number | string;
} | null | undefined;

type CampaignMetadata = {
	provider?: string;
	source?: string;
	campaignType?: string;
	rewardToken?: RewardTokenLike;
};

const campaignMetadataKey = (campaignId: string, vault?: string): string =>
	`${vault?.toLowerCase() ?? ""}:${campaignId}`;

const isUuidLike = (value?: string): boolean =>
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value ?? "",
	);

const normalizeRewardToken = (
	value: string | RewardTokenLike,
): RewardTokenLike => {
	if (typeof value === "string") return { address: value };
	return value;
};

export class RewardsV3Adapter implements IRewardsAdapter {
	constructor(
		private config: RewardsV3AdapterConfig,
		buildQuery?: BuildQueryFn,
		private claimAdapter?: RewardsClaimAdapter,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: RewardsV3AdapterConfig): void {
		this.config = config;
	}

	setClaimAdapter(adapter?: RewardsClaimAdapter): void {
		this.claimAdapter = adapter;
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

	async fetchChainRewards(
		chainId: number,
	): Promise<Map<string, VaultRewardInfo>> {
		return this.fetchRewardsApyMap(chainId);
	}

	async fetchUserRewards(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		const response = await this.queryV3RewardsBreakdown(chainId, address);
		const rows = Array.isArray(response.data) ? response.data : [];
		const campaignMetadata = await this.fetchCampaignMetadataMap(
			chainId,
			rows,
		).catch(() => new Map<string, CampaignMetadata>());

		return rows
			.map((row) => {
				const campaignId = row.campaignId ?? row.id;
				const vaultAddress = normalizeAddress(row.vault ?? row.vaultAddress);
				const metadata = campaignId
					? campaignMetadata.get(campaignMetadataKey(campaignId, vaultAddress)) ??
						campaignMetadata.get(campaignMetadataKey(campaignId))
					: undefined;

				return this.convertRow(chainId, row, metadata);
			})
			.filter((reward): reward is UserReward => reward !== undefined);
	}

	async fetchFuulTotals(
		address: Address,
		chainId?: number,
	): Promise<FuulTotals> {
		return (
			this.claimAdapter?.fetchFuulTotals(address, chainId) ?? {
				claimed: [],
				unclaimed: [],
			}
		);
	}

	async fetchFuulClaimChecks(
		address: Address,
		chainId?: number,
	): Promise<FuulClaimCheck[]> {
		return this.claimAdapter?.fetchFuulClaimChecks(address, chainId) ?? [];
	}

	async fetchBrevisUserRewardClaims(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		return (
			this.claimAdapter?.fetchBrevisUserRewardClaims?.(chainId, address) ?? []
		);
	}

	async fetchTurtleProofs(
		address: Address,
		streamIds: string[],
	): Promise<TurtleMerkleProof[]> {
		return this.claimAdapter?.fetchTurtleProofs?.(address, streamIds) ?? [];
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
			if (typeof page.meta?.total === "number" && offset >= page.meta.total)
				break;
		}

		return map;
	}

	private async fetchCampaignMetadataMap(
		chainId: number,
		breakdownRows: V3RewardsBreakdownRow[],
	): Promise<Map<string, CampaignMetadata>> {
		const pageSize = DEFAULT_PAGE_SIZE;
		const map = new Map<string, CampaignMetadata>();
		const vaults = new Set(
			breakdownRows
				.map((row) => normalizeAddress(row.vault ?? row.vaultAddress))
				.filter((vault): vault is Address => !!vault),
		);

		const readPage = async (vault?: Address): Promise<void> => {
			let offset = 0;
			for (;;) {
				const page = await this.queryV3RewardsApyPage(
					chainId,
					offset,
					pageSize,
					vault,
				);
				const rows = Array.isArray(page.data) ? page.data : [];

				for (const row of rows) {
					const vaultAddress = normalizeAddress(row.vault ?? row.vaultAddress);
					if (!vaultAddress || !Array.isArray(row.campaigns)) continue;

					for (const campaign of row.campaigns) {
						if (!campaign.id) continue;
						const metadata: CampaignMetadata = {
							provider: campaign.provider,
							source: campaign.source,
							campaignType: campaign.campaignType,
							rewardToken: campaign.rewardToken,
						};
						map.set(campaignMetadataKey(campaign.id, vaultAddress), metadata);
						if (!map.has(campaignMetadataKey(campaign.id))) {
							map.set(campaignMetadataKey(campaign.id), metadata);
						}
					}
				}

				if (rows.length < pageSize) break;
				offset += rows.length;
				if (typeof page.meta?.total === "number" && offset >= page.meta.total)
					break;
			}
		};

		if (vaults.size > 0) {
			await Promise.all(Array.from(vaults).map((vault) => readPage(vault)));
		} else {
			await readPage();
		}

		return map;
	}

	private mergeRewardsApyRow(
		map: Map<string, VaultRewardInfo>,
		row: V3RewardsApyRow,
	): void {
		const vaultAddress = normalizeAddress(row.vault ?? row.vaultAddress);
		if (!vaultAddress) return;

		const key = vaultAddress.toLowerCase();
		let info = map.get(key);
		if (!info) {
			info = new VaultRewardInfo({ campaigns: [] });
			map.set(key, info);
		}

		const addCampaign = (campaign: RewardCampaign): void => {
			const dedupeKey = `${campaign.source}:${campaign.campaignId}`;
			const exists = info!.campaigns.some(
				(existing) => `${existing.source}:${existing.campaignId}` === dedupeKey,
			);
			if (exists) return;

			info!.campaigns.push(campaign);
		};

		if (Array.isArray(row.campaigns) && row.campaigns.length > 0) {
			for (const campaignRow of row.campaigns) {
				if (
					!isActiveCampaign({
						status: campaignRow.status,
						startTimestamp: campaignRow.startTimestamp,
						endTimestamp: campaignRow.endTimestamp,
					})
				) {
					continue;
				}

				const provider = normalizeProvider(
					campaignRow.provider ?? campaignRow.source,
				);
				const action = normalizeAction(campaignRow.campaignType);
				const apr =
					typeof campaignRow.apr === "number"
						? campaignRow.apr / 100
						: undefined;
				const rewardTokenAddress = normalizeAddress(
					campaignRow.rewardToken?.address,
				);
				const rewardTokenSymbol = campaignRow.rewardToken?.symbol;
				const collateralAddress = normalizeAddress(campaignRow.collateralAsset);

				if (!provider || !action || !apr || !rewardTokenSymbol) continue;

				addCampaign({
					campaignId:
						campaignRow.id ??
						`${provider}:${action}:${vaultAddress}:${rewardTokenAddress ?? rewardTokenSymbol}`,
					source: provider,
					action,
					apr,
					rewardTokenAddress,
					rewardTokenSymbol,
					endTimestamp: normalizeTimestampSeconds(campaignRow.endTimestamp),
					collateralAddress,
					sourceUrl: campaignRow.sourceUrl ?? campaignRow.url,
					minMultiplier: normalizeFiniteNumber(
						campaignRow.minMultiplier ?? campaignRow.minLeverage,
					),
					maxMultiplier: normalizeFiniteNumber(
						campaignRow.maxMultiplier ?? campaignRow.maxLeverage,
					),
					whitelist: normalizeAddressList(campaignRow.whitelist),
					blacklist: normalizeAddressList(campaignRow.blacklist),
				});
			}

			return;
		}

		const provider = normalizeProvider(row.provider ?? row.source);
		const action = normalizeAction(row.action ?? row.campaignType);
		const apr = typeof row.apr === "number" ? row.apr / 100 : undefined;
		const rewardTokenAddress = normalizeAddress(
			row.rewardToken?.address ?? row.rewardTokenAddress ?? row.token?.address,
		);
		const rewardTokenSymbol =
			row.rewardToken?.symbol ?? row.rewardTokenSymbol ?? row.token?.symbol;
		const collateralAddress = normalizeAddress(row.collateralAsset);

		if (!provider || !action || !apr || !rewardTokenSymbol) return;

		addCampaign({
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
			endTimestamp: normalizeTimestampSeconds(row.endTimestamp ?? row.endTime),
			collateralAddress,
			sourceUrl: row.sourceUrl ?? row.url,
			minMultiplier: normalizeFiniteNumber(
				row.minMultiplier ?? row.minLeverage,
			),
			maxMultiplier: normalizeFiniteNumber(
				row.maxMultiplier ?? row.maxLeverage,
			),
			whitelist: normalizeAddressList(row.whitelist),
			blacklist: normalizeAddressList(row.blacklist),
		});
	}

	private convertRow(
		defaultChainId: number,
		row: V3RewardsBreakdownRow,
		campaignMetadata?: CampaignMetadata,
	): UserReward | undefined {
		const campaignId = row.campaignId ?? row.id;
		const provider =
			normalizeProvider(row.provider ?? row.source) ??
			normalizeProvider(campaignMetadata?.provider ?? campaignMetadata?.source) ??
			(isUuidLike(campaignId) ? "turtle" : undefined);
		if (!provider) return undefined;

		const rowRewardToken = normalizeRewardToken(row.rewardToken);
		const metadataRewardToken = campaignMetadata?.rewardToken;
		const tokenAddress = normalizeAddress(
			row.token?.address ??
				rowRewardToken?.address ??
				row.rewardTokenAddress ??
				row.tokenAddress ??
				metadataRewardToken?.address,
		);
		if (!tokenAddress) return undefined;

		const token: UserRewardToken = {
			address: tokenAddress,
			chainId:
				row.token?.chainId ??
				rowRewardToken?.chainId ??
				metadataRewardToken?.chainId ??
				row.chainId ??
				defaultChainId,
			symbol:
				row.token?.symbol ??
				rowRewardToken?.symbol ??
				row.rewardTokenSymbol ??
				row.tokenSymbol ??
				metadataRewardToken?.symbol ??
				tokenAddress,
			name:
				row.token?.name ??
				rowRewardToken?.name ??
				row.rewardTokenName ??
				row.tokenName ??
				row.token?.symbol ??
				rowRewardToken?.symbol ??
				row.rewardTokenSymbol ??
				row.tokenSymbol ??
				metadataRewardToken?.name ??
				metadataRewardToken?.symbol ??
				tokenAddress,
			decimals:
				normalizeNonNegativeInteger(
					row.token?.decimals ??
						rowRewardToken?.decimals ??
						row.rewardTokenDecimals ??
						row.tokenDecimals ??
						metadataRewardToken?.decimals,
				) ?? 18,
		};

		const accumulated =
			normalizeBigintString(
				row.accumulated ??
					row.accumulatedAmount ??
					row.totalAccumulated ??
					row.amount,
			) ?? "0";
		const unclaimed =
			normalizeBigintString(
				row.unclaimed ??
					row.unclaimedAmount ??
					row.claimable ??
					row.claimableAmount ??
					row.amount,
			) ?? accumulated;

		if (BigInt(unclaimed) <= 0n) return undefined;

		return {
			chainId: row.chainId ?? defaultChainId,
			token,
			tokenPrice:
				normalizeFiniteNumber(
					row.rewardTokenPriceUsd ?? row.tokenPriceUsd ?? row.tokenPrice,
				) ?? 0,
			provider,
			campaignId,
			accumulated,
			unclaimed,
			proof: (row.proof ?? row.proofs ?? row.merkleProof) as Hex[] | undefined,
			claimAddress: normalizeAddress(
				row.claimAddress ?? row.claimContract ?? row.claimContractAddr,
			),
			cumulativeAmounts: row.cumulativeAmounts ?? row.cumulativeRewards,
			epoch: typeof row.epoch === "number" ? String(row.epoch) : row.epoch,
			streamId:
				row.streamId ??
				row.stream_id ??
				(provider === "turtle" ? campaignId : undefined),
			streamAddress: normalizeAddress(
				row.streamAddress ?? row.stream_address ?? row.contractAddress,
			),
			timestamp: row.timestamp,
		};
	}
}
