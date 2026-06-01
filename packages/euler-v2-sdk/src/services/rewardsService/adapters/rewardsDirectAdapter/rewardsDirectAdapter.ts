import { type Address, getAddress, type Hex } from "viem";
import {
	applyBuildQuery,
	normalizeQueryKeyObjectSets,
	serializeQueryArgs,
	type BuildQueryFn,
} from "../../../../utils/buildQuery.js";
import type { ProviderService } from "../../../providerService/index.js";
import type {
	BrevisCampaign,
	BrevisCampaignsResponse,
	BrevisUserRewardsBatchResponse,
	FuulClaimCheck,
	FuulIncentive,
	FuulTotals,
	IRewardsAdapter,
	MerklOpportunity,
	MerklUserChainRewards,
	RewardCampaign,
	RewardAction,
	RewardsDirectAdapterConfig,
	TurtleStreamMapping,
	UserReward,
} from "../../rewardsServiceTypes.js";
import { VaultRewardInfo } from "../../vaultRewardInfo.js";

const DEFAULT_MERKL_API_URL = "https://api.merkl.xyz/v4";
const DEFAULT_BREVIS_API_URL =
	"https://incentra-prd.brevis.network/sdk/v1/eulerCampaigns";
const DEFAULT_BREVIS_PROOFS_API_URL =
	"https://incentra-prd.brevis.network/v1/getMerkleProofsBatch";
const DEFAULT_FUUL_API_URL = "https://api.fuul.xyz/api/v1";
const DEFAULT_TURTLE_API_URL = "https://earn.turtle.xyz";

const DEFAULT_MERKL_DISTRIBUTOR: Address =
	"0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
const DEFAULT_FUUL_MANAGER: Address =
	"0x8a0836dA623ea1083c85acB958DeEa3716b39dc6";
const DEFAULT_FUUL_FACTORY: Address =
	"0xa0080A60EE9f1985151161Fa6b09652Dc46afdEF";

const BREVIS_LEND = 2002;
const BREVIS_BORROW = 2001;

const TURTLE_STREAM_ABI = [
	{
		type: "function",
		name: "canClaim",
		inputs: [
			{ name: "user", type: "address", internalType: "address" },
			{ name: "amount", type: "uint256", internalType: "uint256" },
			{ name: "timestamp", type: "uint40", internalType: "uint40" },
			{ name: "merkleProof", type: "bytes32[]", internalType: "bytes32[]" },
		],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
] as const;

type MerklOpportunityType =
	| "EULER"
	| "MULTILENDBORROW"
	| "ERC20LOGPROCESSOR"
	| "EULER_BORROW_FROM_COLLATERAL"
	| "EULER_MULTI_BORROW_FROM_COLLATERAL";

type TurtleSupportedToken = {
	address?: string;
	symbol?: string;
	name?: string;
	decimals?: number | string;
	logoUrl?: string;
	priceUsd?: number | string;
	chainId?: number | string;
};

type TurtleStreamSnapshot = {
	timestamp?: string;
	amountDistributed?: string;
	apr?: number | string | null;
	baseApr?: number | string | null;
	rewardTokenPrice?: number | string | null;
};

type TurtleStream = {
	id: string;
	chainId?: number | null;
	contractAddress?: string | null;
	type?: number;
	startTimestamp?: string;
	endTimestamp?: string | null;
	claimPaused?: boolean;
	customArgs?: Record<string, unknown>;
	adapters?: Array<{ type?: string; params?: Record<string, unknown> }>;
	point?: unknown | null;
	strategy?: string;
	lastSnapshot?: TurtleStreamSnapshot | null;
	committedSnapshot?: TurtleStreamSnapshot | null;
	rewardToken?: TurtleSupportedToken | null;
};

type TurtleStreamsResponse = {
	streams?: TurtleStream[];
};

type TurtleMerkleProof = {
	streamId: string;
	chainId: number;
	contractAddress: string;
	amount: string;
	timestamp: string;
	proof: string[];
	rootHash?: string;
};

type TurtleMerkleProofsResponse = {
	proofs?: TurtleMerkleProof[];
};

type TurtleResolvedStream = {
	streamId: string;
	chainId: number;
	contractAddress?: Address;
	vaultAddress?: Address;
	action?: RewardAction;
	collateralAddress?: Address;
	sourceUrl?: string;
	rewardToken?: {
		address: Address;
		symbol: string;
		name: string;
		decimals: number;
		icon?: string;
		priceUsd: number;
	};
	apr?: number;
	endTimestamp?: number;
};

const MERKL_EULER_SOURCE_URL = "https://app.merkl.xyz/?protocol=euler";
const TURTLE_SOURCE_URL = "https://app.turtle.xyz/";

const normalizeAddress = (value?: string): Address | undefined => {
	if (!value) return undefined;
	try {
		return getAddress(value) as Address;
	} catch {
		return undefined;
	}
};

const normalizeFiniteNumber = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
};

const normalizeNonNegativeInteger = (value: unknown): number | undefined => {
	const parsed = normalizeFiniteNumber(value);
	if (parsed === undefined) return undefined;
	const integer = Math.trunc(parsed);
	return integer >= 0 ? integer : undefined;
};

const normalizeTimestampSeconds = (value: unknown): number | undefined => {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "number" && Number.isFinite(value)) {
		return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
	}
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) {
			return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
		}
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
	}
	return undefined;
};

const normalizeTurtleAction = (value: unknown): RewardAction | undefined => {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized.includes("loop")) return "LOOPING";
	if (normalized.includes("borrow") && normalized.includes("collateral")) {
		return "BORROW_COLLATERAL";
	}
	if (normalized.includes("borrow")) return "BORROW";
	if (
		normalized.includes("lend") ||
		normalized.includes("supply") ||
		normalized.includes("deposit")
	) {
		return "LEND";
	}
	return undefined;
};

const readAddressFromRecord = (
	record: Record<string, unknown> | undefined,
	keys: readonly string[],
): Address | undefined => {
	if (!record) return undefined;
	for (const key of keys) {
		const value = record[key];
		if (typeof value !== "string") continue;
		const address = normalizeAddress(value);
		if (address) return address;
	}
	return undefined;
};

const readNestedAddressFromRecord = (
	record: Record<string, unknown> | undefined,
	key: string,
	nestedKey: string,
): Address | undefined => {
	const nested = record?.[key];
	if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
		return undefined;
	}
	const value = (nested as Record<string, unknown>)[nestedKey];
	return typeof value === "string" ? normalizeAddress(value) : undefined;
};

const sanitizeFuulClaimChecks = (
	claimChecks: FuulClaimCheck[],
	address: Address,
): FuulClaimCheck[] => {
	const requestedAddress = getAddress(address);

	return claimChecks.flatMap((check) => {
		const to = normalizeAddress(check.to);
		const projectAddress = normalizeAddress(check.project_address);
		const currency = normalizeAddress(check.currency);
		if (!to || !projectAddress || !currency) return [];
		if (to !== requestedAddress) return [];

		return [
			{
				...check,
				to,
				project_address: projectAddress,
				currency,
			},
		];
	});
};

const extractMerklVaultAddress = (identifier: string): string | undefined => {
	const match = identifier.match(/^0x[a-fA-F0-9]{40}/);
	return match ? match[0]!.toLowerCase() : undefined;
};

const normalizeAddressList = (
	list?: readonly string[],
): string[] | undefined => {
	if (!list?.length) return undefined;
	return list.map((address) => address.toLowerCase());
};

const mapMerklSubType = (
	subType: number | null | undefined,
): RewardAction | undefined => {
	if (subType === 0) return "LEND";
	if (subType === 1) return "BORROW";
	if (subType === 2) return "BORROW_COLLATERAL";
	return undefined;
};

const merklOpportunityUrl = (
	opportunity: MerklOpportunity,
	type: MerklOpportunityType,
): string => {
	if (!opportunity.identifier) return MERKL_EULER_SOURCE_URL;

	const chain = (
		opportunity.chain?.name || opportunity.chainId?.toString()
	)?.trim();
	if (!chain) return MERKL_EULER_SOURCE_URL;

	const chainSlug = chain.toLowerCase().replace(/\s+/g, "-");
	return `https://app.merkl.xyz/opportunities/${encodeURIComponent(chainSlug)}/${type}/${encodeURIComponent(opportunity.identifier)}`;
};

const merklAprMap = (opportunity: MerklOpportunity): Map<string, number> => {
	const map = new Map<string, number>();
	for (const breakdown of opportunity.aprRecord?.breakdowns ?? []) {
		map.set(breakdown.identifier, breakdown.value);
	}
	return map;
};

export class RewardsDirectAdapter implements IRewardsAdapter {
	private merklApiUrl: string;
	private brevisApiUrl: string;
	private brevisProofsApiUrl: string;
	private fuulApiUrl: string;
	private turtleApiUrl: string;
	private turtleApiKey?: string;
	private turtleStreamMappings: TurtleStreamMapping[];
	private fuulTotalsUrl?: string;
	private fuulClaimChecksUrl?: string;
	private brevisChainIds?: number[];
	private merklDistributorAddress: Address;
	private fuulManagerAddress: Address;
	private fuulFactoryAddress: Address;
	private enableMerkl: boolean;
	private enableBrevis: boolean;
	private enableFuul: boolean;
	private enableTurtle: boolean;
	private providerService?: ProviderService;

	constructor(config?: RewardsDirectAdapterConfig, buildQuery?: BuildQueryFn) {
		this.merklApiUrl = config?.merklApiUrl ?? DEFAULT_MERKL_API_URL;
		this.brevisApiUrl = config?.brevisApiUrl ?? DEFAULT_BREVIS_API_URL;
		this.brevisProofsApiUrl =
			config?.brevisProofsApiUrl ?? DEFAULT_BREVIS_PROOFS_API_URL;
		this.fuulApiUrl = config?.fuulApiUrl ?? DEFAULT_FUUL_API_URL;
		this.turtleApiUrl = config?.turtleApiUrl ?? DEFAULT_TURTLE_API_URL;
		this.turtleApiKey = config?.turtleApiKey;
		this.turtleStreamMappings = config?.turtleStreamMappings ?? [];
		this.fuulTotalsUrl = config?.fuulTotalsUrl;
		this.fuulClaimChecksUrl = config?.fuulClaimChecksUrl;
		this.brevisChainIds = config?.brevisChainIds;
		this.merklDistributorAddress =
			config?.merklDistributorAddress ?? DEFAULT_MERKL_DISTRIBUTOR;
		this.fuulManagerAddress =
			config?.fuulManagerAddress ?? DEFAULT_FUUL_MANAGER;
		this.fuulFactoryAddress =
			config?.fuulFactoryAddress ?? DEFAULT_FUUL_FACTORY;
		this.enableMerkl = config?.enableMerkl ?? true;
		this.enableBrevis = config?.enableBrevis ?? true;
		this.enableFuul = config?.enableFuul ?? true;
		this.enableTurtle = config?.enableTurtle ?? false;

		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setProviderService(providerService: ProviderService): void {
		this.providerService = providerService;
	}

	queryMerklOpportunities = async (
		url: string,
	): Promise<MerklOpportunity[]> => {
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
		body: object,
	): Promise<BrevisCampaignsResponse> => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) return { campaigns: [] };
		return res.json() as Promise<BrevisCampaignsResponse>;
	};

	getQueryKeyBrevisCampaigns(url: string, body: object): string | null {
		return serializeQueryArgs([url, normalizeQueryKeyObjectSets(body)]);
	}

	setQueryBrevisCampaigns(fn: typeof this.queryBrevisCampaigns): void {
		this.queryBrevisCampaigns = fn;
	}

	queryMerklUserRewards = async (
		url: string,
	): Promise<MerklUserChainRewards[]> => {
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
		body: object,
	): Promise<BrevisUserRewardsBatchResponse> => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) return { err: null, rewardsBatch: null };
		return res.json() as Promise<BrevisUserRewardsBatchResponse>;
	};

	getQueryKeyBrevisUserProofs(url: string, body: object): string | null {
		return serializeQueryArgs([url, normalizeQueryKeyObjectSets(body)]);
	}

	setQueryBrevisUserProofs(fn: typeof this.queryBrevisUserProofs): void {
		this.queryBrevisUserProofs = fn;
	}

	queryFuulIncentives = async (url: string): Promise<FuulIncentive[]> => {
		const res = await fetch(url);
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? (data as FuulIncentive[]) : [];
	};

	setQueryFuulIncentives(fn: typeof this.queryFuulIncentives): void {
		this.queryFuulIncentives = fn;
	}

	queryFuulTotals = async (url: string): Promise<FuulTotals> => {
		const res = await fetch(url);
		if (!res.ok) return { claimed: [], unclaimed: [] };
		const data = (await res.json()) as Partial<FuulTotals>;
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
		body: object,
	): Promise<FuulClaimCheck[]> => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? (data as FuulClaimCheck[]) : [];
	};

	getQueryKeyFuulClaimChecks(url: string, body: object): string | null {
		return serializeQueryArgs([url, normalizeQueryKeyObjectSets(body)]);
	}

	setQueryFuulClaimChecks(fn: typeof this.queryFuulClaimChecks): void {
		this.queryFuulClaimChecks = fn;
	}

	queryTurtleStreams = async (
		url: string,
		headers: Record<string, string>,
	): Promise<TurtleStreamsResponse> => {
		const res = await fetch(url, { method: "GET", headers });
		if (!res.ok) return { streams: [] };
		return res.json() as Promise<TurtleStreamsResponse>;
	};

	getQueryKeyTurtleStreams(url: string): string | null {
		return serializeQueryArgs([url]);
	}

	setQueryTurtleStreams(fn: typeof this.queryTurtleStreams): void {
		this.queryTurtleStreams = fn;
	}

	queryTurtleMerkleProofs = async (
		url: string,
	): Promise<TurtleMerkleProofsResponse> => {
		const res = await fetch(url, { method: "GET" });
		if (!res.ok) return { proofs: [] };
		return res.json() as Promise<TurtleMerkleProofsResponse>;
	};

	getQueryKeyTurtleMerkleProofs(url: string): string | null {
		return serializeQueryArgs([url]);
	}

	setQueryTurtleMerkleProofs(fn: typeof this.queryTurtleMerkleProofs): void {
		this.queryTurtleMerkleProofs = fn;
	}

	async fetchVaultRewards(
		chainId: number,
		vaultAddress: Address,
	): Promise<VaultRewardInfo | undefined> {
		const chainMap = await this.fetchChainRewards(chainId);
		return chainMap.get(vaultAddress.toLowerCase());
	}

	async fetchChainRewards(
		chainId: number,
	): Promise<Map<string, VaultRewardInfo>> {
		const [merklCampaigns, brevisCampaigns, fuulCampaigns, turtleCampaigns] =
			await Promise.all([
				this.enableMerkl
					? this.fetchMerklCampaigns(chainId)
					: Promise.resolve([]),
				this.isBrevisChainEnabled(chainId)
					? this.fetchBrevisCampaigns(chainId)
					: Promise.resolve([]),
				this.enableFuul
					? this.fetchFuulCampaigns(chainId)
					: Promise.resolve([]),
				this.enableTurtle
					? this.fetchTurtleCampaigns(chainId)
					: Promise.resolve([]),
			]);

		const rewardsMap = this.mergeCampaigns(
			merklCampaigns,
			brevisCampaigns,
			fuulCampaigns,
			turtleCampaigns,
		);
		return rewardsMap;
	}

	async fetchUserRewards(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		const [merklRewards, brevisRewards, fuulRewards, turtleRewards] =
			await Promise.all([
				this.enableMerkl
					? this.fetchMerklUserRewards(chainId, address)
					: Promise.resolve([]),
				this.isBrevisChainEnabled(chainId)
					? this.fetchBrevisUserRewards(chainId, address)
					: Promise.resolve([]),
				this.enableFuul
					? this.fetchFuulUserRewards(chainId, address)
					: Promise.resolve([]),
				this.enableTurtle
					? this.fetchTurtleUserRewards(chainId, address)
					: Promise.resolve([]),
			]);

		return [
			...merklRewards,
			...brevisRewards,
			...fuulRewards,
			...turtleRewards,
		];
	}

	async fetchFuulTotals(address: Address): Promise<FuulTotals> {
		if (!this.fuulTotalsUrl) return { claimed: [], unclaimed: [] };
		const separator = this.fuulTotalsUrl.includes("?") ? "&" : "?";
		const url = `${this.fuulTotalsUrl}${separator}user_identifier=${encodeURIComponent(address)}&user_identifier_type=evm_address`;
		return this.queryFuulTotals(url).catch(() => ({
			claimed: [],
			unclaimed: [],
		}));
	}

	async fetchFuulClaimChecks(address: Address): Promise<FuulClaimCheck[]> {
		if (!this.fuulClaimChecksUrl) return [];
		const claimChecks = await this.queryFuulClaimChecks(
			this.fuulClaimChecksUrl,
			{
				userIdentifier: address,
				userIdentifierType: "evm_address",
			},
		).catch(() => []);
		return sanitizeFuulClaimChecks(claimChecks, address);
	}

	getMerklDistributorAddress(): Address {
		return this.merklDistributorAddress;
	}

	getFuulManagerAddress(): Address {
		return this.fuulManagerAddress;
	}

	getFuulFactoryAddress(): Address {
		return this.fuulFactoryAddress;
	}

	async fetchBrevisChainRewards(
		chainId: number,
	): Promise<Map<string, VaultRewardInfo>> {
		if (!this.isBrevisChainEnabled(chainId)) return new Map();
		const campaigns = await this.fetchBrevisCampaigns(chainId);
		return this.mergeCampaigns([], campaigns, []);
	}

	async fetchBrevisUserRewardClaims(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		if (!this.isBrevisChainEnabled(chainId)) return [];
		return this.fetchBrevisUserRewards(chainId, address);
	}

	private isBrevisChainEnabled(chainId: number): boolean {
		return (
			this.enableBrevis &&
			(this.brevisChainIds === undefined ||
				this.brevisChainIds.includes(chainId))
		);
	}

	private async fetchMerklCampaigns(
		chainId: number,
	): Promise<RewardCampaign[]> {
		const typedUrls: Array<[MerklOpportunityType, string]> = [
			[
				"EULER",
				`${this.merklApiUrl}/opportunities/?chainId=${chainId}&type=EULER&campaigns=true`,
			],
			[
				"MULTILENDBORROW",
				`${this.merklApiUrl}/opportunities/?chainId=${chainId}&type=MULTILENDBORROW&campaigns=true`,
			],
			[
				"ERC20LOGPROCESSOR",
				`${this.merklApiUrl}/opportunities/?chainId=${chainId}&mainProtocolId=euler&campaigns=true&type=ERC20LOGPROCESSOR`,
			],
			[
				"EULER_BORROW_FROM_COLLATERAL",
				`${this.merklApiUrl}/opportunities/?chainId=${chainId}&mainProtocolId=euler&campaigns=true&type=EULER_BORROW_FROM_COLLATERAL`,
			],
			[
				"EULER_MULTI_BORROW_FROM_COLLATERAL",
				`${this.merklApiUrl}/opportunities/?chainId=${chainId}&mainProtocolId=euler&campaigns=true&type=EULER_MULTI_BORROW_FROM_COLLATERAL`,
			],
		];

		const results = await Promise.all(
			typedUrls.map(([type, url]) =>
				this.queryMerklOpportunities(url)
					.then((opportunities) => ({ type, opportunities }))
					.catch(() => ({ type, opportunities: [] })),
			),
		);

		const campaigns: RewardCampaign[] = [];

		for (const { type, opportunities } of results) {
			for (const opp of opportunities) {
				if (opp.status !== "LIVE") continue;
				const aprs = merklAprMap(opp);

				for (const c of opp.campaigns ?? []) {
					if (
						type === "EULER_BORROW_FROM_COLLATERAL" ||
						type === "EULER_MULTI_BORROW_FROM_COLLATERAL"
					) {
						const apr = aprs.get(c.campaignId) ?? c.apr ?? 0;
						if (!apr) continue;

						const pairs: Array<{ vault: string; collateral: string }> = [];
						for (const vault of c.params?.vaults ?? []) {
							const vaultAddress = vault.evkAddress?.toLowerCase();
							if (!vaultAddress) continue;
							for (const collateral of vault.collaterals ?? []) {
								const collateralAddress =
									collateral.tokenAddress?.toLowerCase();
								if (!collateralAddress) continue;
								pairs.push({
									vault: vaultAddress,
									collateral: collateralAddress,
								});
							}
						}

						if (
							pairs.length === 0 &&
							c.params?.evkAddress &&
							c.params.collateralAddress
						) {
							pairs.push({
								vault: c.params.evkAddress.toLowerCase(),
								collateral: c.params.collateralAddress.toLowerCase(),
							});
						}

						for (const pair of pairs) {
							campaigns.push({
								campaignId: c.campaignId,
								source: "merkl",
								action: "BORROW_COLLATERAL",
								apr: apr / 100,
								rewardTokenAddress: getAddress(
									c.rewardToken.address,
								) as Address,
								rewardTokenSymbol: c.rewardToken.symbol,
								rewardTokenIcon: c.rewardToken.icon,
								dailyRewards: c.dailyRewards,
								endTimestamp: c.endTimestamp,
								collateralAddress: normalizeAddress(pair.collateral),
								sourceUrl: merklOpportunityUrl(opp, type),
								whitelist: normalizeAddressList(c.params?.whitelist),
								blacklist: normalizeAddressList(c.params?.blacklist),
								_vaultAddress: pair.vault,
							} as RewardCampaign & { _vaultAddress: string });
						}
						continue;
					}

					if (type === "MULTILENDBORROW") {
						const action =
							opp.action === "LEND"
								? ("LEND" as const)
								: opp.action === "BORROW"
									? ("BORROW" as const)
									: undefined;
						if (!action) continue;
						const apr = aprs.get(c.campaignId) ?? c.apr ?? 0;
						if (!apr) continue;

						for (const market of c.params?.markets ?? []) {
							const vaultAddress = (
								market.campaignParameters?.evkAddress ??
								market.campaignParameters?.targetToken
							)?.toLowerCase();
							if (!vaultAddress) continue;

							campaigns.push({
								campaignId: c.campaignId,
								source: "merkl",
								action,
								apr: apr / 100,
								rewardTokenAddress: getAddress(
									c.rewardToken.address,
								) as Address,
								rewardTokenSymbol: c.rewardToken.symbol,
								rewardTokenIcon: c.rewardToken.icon,
								dailyRewards: c.dailyRewards,
								endTimestamp: c.endTimestamp,
								sourceUrl: merklOpportunityUrl(opp, type),
								whitelist: normalizeAddressList(c.params?.whitelist),
								blacklist: normalizeAddressList(c.params?.blacklist),
								_vaultAddress: vaultAddress,
							} as RewardCampaign & { _vaultAddress: string });
						}
						continue;
					}

					const action =
						mapMerklSubType(c.subType) ??
						(opp.action === "LEND" || opp.action === "BORROW"
							? opp.action
							: undefined);
					if (!action) continue;
					const vaultAddress =
						(type === "ERC20LOGPROCESSOR"
							? c.params?.targetToken
							: (c.params?.evkAddress ?? c.params?.targetToken)
						)?.toLowerCase() ?? extractMerklVaultAddress(opp.identifier);
					if (!vaultAddress) continue;

					const apr = aprs.get(c.campaignId) ?? c.apr ?? 0;
					if (!apr) continue;

					campaigns.push({
						campaignId: c.campaignId,
						source: "merkl",
						action,
						apr: apr / 100,
						rewardTokenAddress: getAddress(c.rewardToken.address) as Address,
						rewardTokenSymbol: c.rewardToken.symbol,
						rewardTokenIcon: c.rewardToken.icon,
						dailyRewards: c.dailyRewards,
						endTimestamp: c.endTimestamp,
						collateralAddress: normalizeAddress(c.params?.collateralAddress),
						sourceUrl: merklOpportunityUrl(opp, type),
						whitelist: normalizeAddressList(c.params?.whitelist),
						blacklist: normalizeAddressList(c.params?.blacklist),
						_vaultAddress: vaultAddress,
					} as RewardCampaign & { _vaultAddress: string });
				}
			}
		}

		return campaigns;
	}

	private async fetchBrevisCampaigns(
		chainId: number,
	): Promise<RewardCampaign[]> {
		const body = {
			chain_id: [chainId],
			action: [BREVIS_LEND, BREVIS_BORROW],
			status: [3],
		};

		const response = await this.queryBrevisCampaigns(
			this.brevisApiUrl,
			body,
		).catch(() => ({ campaigns: [] }) as BrevisCampaignsResponse);

		if (response.err || !response.campaigns) return [];

		return response.campaigns.map(
			(c: BrevisCampaign) =>
				({
					campaignId: c.campaign_id,
					source: "brevis" as const,
					action:
						c.action === BREVIS_LEND ? ("LEND" as const) : ("BORROW" as const),
					apr: c.reward_info.apr,
					rewardTokenAddress: getAddress(
						c.reward_info.token_address,
					) as Address,
					rewardTokenSymbol: c.reward_info.token_symbol,
					endTimestamp: c.end_time,
					sourceUrl: "https://incentra.brevis.network/",
					_vaultAddress: c.vault_address.toLowerCase(),
				}) as RewardCampaign & { _vaultAddress: string },
		);
	}

	private async fetchFuulCampaigns(chainId: number): Promise<RewardCampaign[]> {
		const [eulerIncentives, loopingIncentives] = await Promise.all([
			this.queryFuulIncentives(
				`${this.fuulApiUrl}/incentives?protocol=euler&chain_id=${chainId}`,
			).catch(() => []),
			this.queryFuulIncentives(
				`${this.fuulApiUrl}/incentives?protocol=euler-looping&chain_id=${chainId}`,
			).catch(() => []),
		]);

		const lendCampaigns = eulerIncentives
			.filter((item) => item.trigger?.context?.token_address)
			.map((item) => {
				const vaultAddress = item.trigger.context.token_address!.toLowerCase();
				return {
					campaignId: `${item.protocol}:${item.project}:${vaultAddress}`,
					source: "fuul" as const,
					action: "LEND" as const,
					apr: item.apr,
					rewardTokenSymbol: item.project,
					endTimestamp: 0,
					sourceUrl: "https://www.fuul.xyz/",
					_vaultAddress: vaultAddress,
				} as RewardCampaign & { _vaultAddress: string };
			});

		const loopingCampaigns = loopingIncentives
			.filter(
				(item) =>
					item.trigger?.context?.borrowVault &&
					item.trigger?.context?.depositVault,
			)
			.map((item) => {
				const borrowVault = item.trigger.context.borrowVault!.toLowerCase();
				return {
					campaignId: `${item.protocol}:${item.project}:${borrowVault}:${item.trigger.context.depositVault!.toLowerCase()}`,
					source: "fuul" as const,
					action: "LOOPING" as const,
					apr: item.apr,
					rewardTokenSymbol: item.pool?.token0_symbol || item.project,
					endTimestamp: 0,
					collateralAddress: getAddress(
						item.trigger.context.depositVault!,
					) as Address,
					sourceUrl: "https://www.fuul.xyz/",
					minMultiplier: item.trigger.context.min_leverage,
					maxMultiplier: item.trigger.context.max_leverage,
					_vaultAddress: borrowVault,
				} as RewardCampaign & { _vaultAddress: string };
			});

		return [...lendCampaigns, ...loopingCampaigns];
	}

	private async fetchTurtleCampaigns(
		chainId: number,
	): Promise<RewardCampaign[]> {
		const streams = await this.fetchTurtleResolvedStreams(chainId);
		const campaigns: RewardCampaign[] = [];

		for (const stream of streams) {
			if (!stream.vaultAddress || !stream.action || !stream.rewardToken)
				continue;
			if (!stream.apr) continue;

			campaigns.push({
				campaignId: stream.streamId,
				source: "turtle",
				action: stream.action,
				apr: stream.apr,
				rewardTokenAddress: stream.rewardToken.address,
				rewardTokenSymbol: stream.rewardToken.symbol,
				rewardTokenIcon: stream.rewardToken.icon,
				endTimestamp: stream.endTimestamp,
				collateralAddress: stream.collateralAddress,
				sourceUrl: stream.sourceUrl,
				_vaultAddress: stream.vaultAddress.toLowerCase(),
			} as RewardCampaign & { _vaultAddress: string });
		}

		return campaigns;
	}

	private async fetchTurtleUserRewards(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		const streams = await this.fetchTurtleResolvedStreams(chainId);
		const streamsWithTokens = streams.filter((stream) => stream.rewardToken);
		if (streamsWithTokens.length === 0) return [];

		const params = new URLSearchParams({ wallet: address });
		for (const stream of streamsWithTokens) {
			params.append("streamIds", stream.streamId);
		}

		const response = await this.queryTurtleMerkleProofs(
			this.buildTurtleUrl("/v1/streams/merkle_proofs", params),
		).catch(() => ({ proofs: [] }) as TurtleMerkleProofsResponse);

		const streamById = new Map(
			streamsWithTokens.map((stream) => [
				stream.streamId.toLowerCase(),
				stream,
			]),
		);
		const rewards: UserReward[] = [];

		for (const proof of response.proofs ?? []) {
			const stream = streamById.get(proof.streamId.toLowerCase());
			if (!stream?.rewardToken) continue;
			if (proof.chainId !== chainId) continue;

			const claimAddress = normalizeAddress(proof.contractAddress);
			if (!claimAddress) continue;
			if (
				stream.contractAddress &&
				getAddress(stream.contractAddress) !== claimAddress
			) {
				continue;
			}

			const rootTimestamp = normalizeTimestampSeconds(proof.timestamp);
			if (rootTimestamp === undefined) continue;

			const proofBytes = proof.proof as Hex[];
			const accumulated = proof.amount;
			let accumulatedAmount: bigint;
			try {
				accumulatedAmount = BigInt(accumulated);
			} catch {
				continue;
			}
			let unclaimed: bigint;
			try {
				unclaimed = await this.readTurtleClaimable(
					chainId,
					address,
					claimAddress,
					accumulated,
					rootTimestamp,
					proofBytes,
				);
			} catch {
				unclaimed = accumulatedAmount;
			}
			if (unclaimed <= 0n) continue;

			rewards.push({
				chainId,
				token: {
					address: stream.rewardToken.address,
					chainId,
					symbol: stream.rewardToken.symbol,
					name: stream.rewardToken.name,
					decimals: stream.rewardToken.decimals,
				},
				tokenPrice: stream.rewardToken.priceUsd,
				provider: "turtle",
				campaignId: proof.streamId,
				accumulated,
				unclaimed: unclaimed.toString(),
				proof: proofBytes,
				claimAddress,
				rootTimestamp: rootTimestamp.toString(),
			});
		}

		return rewards;
	}

	private async fetchTurtleResolvedStreams(
		chainId: number,
	): Promise<TurtleResolvedStream[]> {
		const streamRows = await this.fetchTurtleStreamRows();
		const mappingById = new Map(
			this.turtleStreamMappings.map((mapping) => [
				mapping.streamId.toLowerCase(),
				mapping,
			]),
		);

		const resolvedById = new Map<string, TurtleResolvedStream>();
		for (const stream of streamRows) {
			const resolved = this.resolveTurtleStream(
				stream,
				mappingById.get(stream.id.toLowerCase()),
			);
			if (resolved && resolved.chainId === chainId) {
				resolvedById.set(resolved.streamId.toLowerCase(), resolved);
			}
		}

		for (const mapping of this.turtleStreamMappings) {
			const key = mapping.streamId.toLowerCase();
			if (resolvedById.has(key)) continue;
			const resolved = this.resolveTurtleStream(undefined, mapping);
			if (resolved && resolved.chainId === chainId) {
				resolvedById.set(key, resolved);
			}
		}

		return [...resolvedById.values()];
	}

	private async fetchTurtleStreamRows(): Promise<TurtleStream[]> {
		if (!this.turtleApiKey) return [];
		const response = await this.queryTurtleStreams(
			this.buildTurtleUrl(
				"/v1/streams/",
				new URLSearchParams({
					withSnapshots: "false",
					usersCount: "false",
				}),
			),
			this.getTurtleHeaders(),
		).catch(() => ({ streams: [] }) as TurtleStreamsResponse);

		return Array.isArray(response.streams) ? response.streams : [];
	}

	private resolveTurtleStream(
		stream?: TurtleStream,
		mapping?: TurtleStreamMapping,
	): TurtleResolvedStream | undefined {
		const streamId = stream?.id ?? mapping?.streamId;
		if (!streamId) return undefined;

		const chainId =
			typeof stream?.chainId === "number" ? stream.chainId : mapping?.chainId;
		if (!chainId) return undefined;

		const customArgs = stream?.customArgs;
		const vaultAddress =
			mapping?.vaultAddress ??
			readAddressFromRecord(customArgs, [
				"vaultAddress",
				"vault",
				"evkAddress",
				"targetToken",
				"targetTokenAddress",
				"target_token",
			]) ??
			readNestedAddressFromRecord(customArgs, "targetToken", "address");
		const action =
			mapping?.action ??
			normalizeTurtleAction(customArgs?.action) ??
			normalizeTurtleAction(customArgs?.rewardAction) ??
			normalizeTurtleAction(stream?.strategy) ??
			(vaultAddress ? "LEND" : undefined);
		const collateralAddress =
			mapping?.collateralAddress ??
			readAddressFromRecord(customArgs, [
				"collateralAddress",
				"collateral",
				"depositVault",
				"depositVaultAddress",
			]);
		const rawApr =
			normalizeFiniteNumber(stream?.lastSnapshot?.apr) ??
			normalizeFiniteNumber(stream?.committedSnapshot?.apr) ??
			normalizeFiniteNumber(customArgs?.apr);
		const apr =
			rawApr === undefined ? undefined : rawApr > 1 ? rawApr / 100 : rawApr;
		const rewardToken = this.resolveTurtleRewardToken(stream, mapping, chainId);
		const contractAddress = normalizeAddress(
			stream?.contractAddress ?? undefined,
		);

		return {
			streamId,
			chainId,
			contractAddress,
			vaultAddress,
			action,
			collateralAddress,
			sourceUrl: mapping?.sourceUrl ?? TURTLE_SOURCE_URL,
			rewardToken,
			apr,
			endTimestamp: normalizeTimestampSeconds(stream?.endTimestamp),
		};
	}

	private resolveTurtleRewardToken(
		stream: TurtleStream | undefined,
		mapping: TurtleStreamMapping | undefined,
		chainId: number,
	): TurtleResolvedStream["rewardToken"] {
		const mappedToken = mapping?.rewardToken;
		const tokenAddress =
			mappedToken?.address ?? normalizeAddress(stream?.rewardToken?.address);
		if (!tokenAddress) return undefined;

		const symbol =
			mappedToken?.symbol ?? stream?.rewardToken?.symbol ?? tokenAddress;
		const name = mappedToken?.name ?? stream?.rewardToken?.name ?? symbol;
		const decimals =
			mappedToken?.decimals ??
			normalizeNonNegativeInteger(stream?.rewardToken?.decimals) ??
			18;
		const tokenChainId =
			normalizeNonNegativeInteger(stream?.rewardToken?.chainId) ?? chainId;
		if (tokenChainId !== chainId) return undefined;

		return {
			address: tokenAddress,
			symbol,
			name,
			decimals,
			icon: mappedToken?.icon ?? stream?.rewardToken?.logoUrl,
			priceUsd:
				mappedToken?.priceUsd ??
				normalizeFiniteNumber(stream?.rewardToken?.priceUsd) ??
				0,
		};
	}

	private async readTurtleClaimable(
		chainId: number,
		account: Address,
		claimAddress: Address,
		amount: string,
		rootTimestamp: number,
		proof: Hex[],
	): Promise<bigint> {
		if (!this.providerService) return BigInt(amount);
		const provider = this.providerService.getProvider(chainId);
		return provider.readContract({
			address: claimAddress,
			abi: TURTLE_STREAM_ABI,
			functionName: "canClaim",
			args: [account, BigInt(amount), rootTimestamp, proof],
		});
	}

	private getTurtleHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.turtleApiKey ? { "X-API-Key": this.turtleApiKey } : {}),
		};
	}

	private buildTurtleUrl(path: string, params?: URLSearchParams): string {
		const normalizedApiUrl = this.turtleApiUrl.replace(/\/+$/, "");
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;
		const url =
			normalizedApiUrl.startsWith("http://") ||
			normalizedApiUrl.startsWith("https://")
				? new URL(normalizedPath, `${normalizedApiUrl}/`).toString()
				: `${normalizedApiUrl}${normalizedPath}`;
		const query = params?.toString();
		return query ? `${url}?${query}` : url;
	}

	private mergeCampaigns(
		merklCampaigns: RewardCampaign[],
		brevisCampaigns: RewardCampaign[],
		fuulCampaigns: RewardCampaign[] = [],
		turtleCampaigns: RewardCampaign[] = [],
	): Map<string, VaultRewardInfo> {
		const map = new Map<string, VaultRewardInfo>();

		const all = [
			...merklCampaigns,
			...brevisCampaigns,
			...fuulCampaigns,
			...turtleCampaigns,
		] as (RewardCampaign & { _vaultAddress: string })[];

		for (const campaign of all) {
			const key = campaign._vaultAddress;
			if (!key || !campaign.apr) continue;

			let info = map.get(key);
			if (!info) {
				info = new VaultRewardInfo({ campaigns: [] });
				map.set(key, info);
			}

			const dedupeKey = [
				campaign.source,
				campaign.campaignId,
				campaign.action,
				campaign.collateralAddress?.toLowerCase(),
				campaign.rewardTokenAddress?.toLowerCase(),
			].join(":");
			const exists = info.campaigns.some(
				(c) =>
					[
						c.source,
						c.campaignId,
						c.action,
						c.collateralAddress?.toLowerCase(),
						c.rewardTokenAddress?.toLowerCase(),
					].join(":") === dedupeKey,
			);
			if (exists) continue;

			const { _vaultAddress, ...cleanCampaign } = campaign;
			info.campaigns.push(cleanCampaign);
		}

		return map;
	}

	private async fetchMerklUserRewards(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		const url = `${this.merklApiUrl}/users/${address}/rewards?chainId=${chainId}`;

		const chainRewardsList = await this.queryMerklUserRewards(url).catch(
			() => [],
		);

		const rewards: UserReward[] = [];
		for (const chainRewards of chainRewardsList) {
			for (const reward of chainRewards.rewards ?? []) {
				const unclaimed = BigInt(reward.amount) - BigInt(reward.claimed);
				if (unclaimed <= 0n) continue;

				const tokenPrice =
					Math.abs(reward.token.price) < 1e-8 ? 0 : reward.token.price;

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

	private async fetchBrevisUserRewards(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		const campaignsResponse = await this.queryBrevisCampaigns(
			this.brevisApiUrl,
			{
				chain_id: [chainId],
				user_address: [address],
				status: [3, 4],
			},
		).catch(() => ({ campaigns: [] }) as BrevisCampaignsResponse);

		if (!campaignsResponse.campaigns?.length) return [];

		const campaignMap = new Map<string, BrevisCampaign>();
		for (const c of campaignsResponse.campaigns) {
			campaignMap.set(c.campaign_id, c);
		}

		const proofsResponse = await this.queryBrevisUserProofs(
			this.brevisProofsApiUrl,
			{
				user_addr: address,
				types: [BREVIS_BORROW, BREVIS_LEND],
				chain_id: [chainId],
			},
		).catch(
			() =>
				({ err: null, rewardsBatch: null }) as BrevisUserRewardsBatchResponse,
		);

		if (proofsResponse.err || !proofsResponse.rewardsBatch?.length) return [];

		const rewards: UserReward[] = [];
		for (const batch of proofsResponse.rewardsBatch) {
			const campaign = campaignMap.get(batch.campaignId);
			if (!campaign) continue;
			const claimAddress = getAddress(batch.claimContractAddr) as Address;
			if (
				campaign.reward_info.claim_chain_id !== undefined &&
				Number(campaign.reward_info.claim_chain_id) !== batch.claimChainId
			) {
				continue;
			}
			if (
				!campaign.reward_info.claim_contract ||
				getAddress(campaign.reward_info.claim_contract) !== claimAddress
			) {
				continue;
			}

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
				campaignId: batch.campaignId,
				accumulated,
				unclaimed: batch.claimableRewards,
				proof: batch.merkleProof as Hex[],
				claimAddress,
				cumulativeAmounts: batch.cumulativeRewards,
				epoch: batch.epoch,
			});
		}

		return rewards;
	}

	private async fetchFuulUserRewards(
		chainId: number,
		address: Address,
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
