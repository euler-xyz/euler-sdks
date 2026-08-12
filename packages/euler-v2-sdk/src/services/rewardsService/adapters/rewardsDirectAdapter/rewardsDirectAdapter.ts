import { type Address, getAddress, type Hex } from "viem";
import {
	applyBuildQuery,
	type BuildQueryFn,
	normalizeQueryKeyObjectSets,
	serializeQueryArgs,
} from "../../../../utils/buildQuery.js";
import type {
	BrevisCampaign,
	BrevisCampaignsResponse,
	BrevisUserRewardsBatchResponse,
	FuulClaimableReward,
	FuulClaimCheck,
	FuulIncentive,
	FuulTotalEntry,
	FuulTotals,
	IRewardsAdapter,
	MerklOpportunity,
	MerklUserChainRewards,
	RewardAction,
	RewardCampaign,
	RewardsDirectAdapterConfig,
	TurtleMerkleProof,
	TurtleStreamConfig,
	UserReward,
} from "../../rewardsServiceTypes.js";
import { VaultRewardInfo } from "../../vaultRewardInfo.js";

const DEFAULT_MERKL_API_URL = "https://api.merkl.xyz/v4";
const DEFAULT_BREVIS_API_URL =
	"https://incentra-prd.brevis.network/sdk/v1/eulerCampaigns";
const DEFAULT_BREVIS_PROOFS_API_URL =
	"https://incentra-prd.brevis.network/v1/getMerkleProofsBatch";
const DEFAULT_FUUL_API_URL = "https://api.fuul.xyz/api/v1";
const DEFAULT_TURTLE_API_URL = "https://earn.turtle.xyz/v1";

const DEFAULT_MERKL_DISTRIBUTOR: Address =
	"0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
const DEFAULT_FUUL_MANAGER: Address =
	"0x8a0836dA623ea1083c85acB958DeEa3716b39dc6";
const DEFAULT_FUUL_FACTORY: Address =
	"0xa0080A60EE9f1985151161Fa6b09652Dc46afdEF";

const BREVIS_LEND = 2002;
const BREVIS_BORROW = 2001;

type MerklOpportunityType =
	| "EULER"
	| "EULER_LEND"
	| "EULER_BORROW"
	| "MULTILENDBORROW"
	| "ERC20LOGPROCESSOR"
	| "EULER_BORROW_FROM_COLLATERAL"
	| "EULER_MULTI_BORROW_FROM_COLLATERAL";

type TurtleTokenLike = {
	address?: string;
	symbol?: string;
	name?: string;
	decimals?: number | string;
	logoUrl?: string;
};

type TurtleStream = {
	id?: string;
	chainId?: number | string | null;
	startTimestamp?: string | number | null;
	endTimestamp?: string | number | null;
	customArgs?: {
		apr?: string | number;
		targetToken?: TurtleTokenLike & {
			chain?: { chainId?: string | number };
		};
	};
	lastSnapshot?: {
		apr?: string | number;
		baseApr?: string | number;
	};
	rewardToken?: TurtleTokenLike | null;
	point?: TurtleTokenLike | null;
};

const MERKL_EULER_SOURCE_URL = "https://app.merkl.xyz/?protocol=euler";
const TURTLE_SOURCE_URL = "https://app.turtle.club";

const normalizeAddress = (value?: string): Address | undefined => {
	if (!value) return undefined;
	try {
		return getAddress(value) as Address;
	} catch {
		return undefined;
	}
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

const normalizeFuulClaimableReward = (
	reward: FuulClaimableReward,
	address: Address,
): FuulClaimableReward | undefined => {
	const requestedAddress = getAddress(address);
	const userAddress = normalizeAddress(reward.user_address);
	const projectAddress = normalizeAddress(reward.project_address);
	const currencyAddress = normalizeAddress(reward.currency_address);
	const currencyChainId = Number(reward.currency_chain_id);
	const currencyDecimals =
		reward.currency_decimals === undefined
			? undefined
			: Number(reward.currency_decimals);
	const reason = Number(reward.reason);
	let amount: bigint;
	try {
		amount = BigInt(reward.amount);
		BigInt(reward.token_id);
		BigInt(reward.deadline);
	} catch {
		return undefined;
	}

	if (!userAddress || !projectAddress || !currencyAddress) return undefined;
	if (userAddress !== requestedAddress) return undefined;
	if (!Number.isFinite(currencyChainId)) return undefined;
	if (currencyDecimals !== undefined && !Number.isFinite(currencyDecimals)) {
		return undefined;
	}
	if (!Number.isFinite(reason)) return undefined;
	if (!Array.isArray(reward.signatures)) return undefined;
	if (amount <= 0n) return undefined;
	if (
		reward.status &&
		!["claimable", "unclaimed"].includes(reward.status.toLowerCase())
	) {
		return undefined;
	}

	return {
		...reward,
		user_address: userAddress,
		project_address: projectAddress,
		currency_address: currencyAddress,
		currency_chain_id: currencyChainId,
		currency_decimals: currencyDecimals,
		amount: amount.toString(),
	};
};

const fuulClaimableRewardToClaimCheck = (
	reward: FuulClaimableReward,
): FuulClaimCheck => ({
	project_address: reward.project_address,
	to: reward.user_address,
	currency: reward.currency_address,
	currency_type: 1,
	amount: reward.amount,
	reason: Number(reward.reason),
	token_id: reward.token_id.toString(),
	deadline: reward.deadline.toString(),
	proof: reward.proof,
	signatures: reward.signatures,
});

const fuulClaimableRewardToTotalEntry = (
	reward: FuulClaimableReward,
): FuulTotalEntry => ({
	currency: reward.currency_address,
	currency_type: 1,
	amount: reward.amount,
	chain_id: Number(reward.currency_chain_id),
});

const aggregateFuulTotals = (
	rewards: FuulClaimableReward[],
): FuulTotalEntry[] => {
	const totals = new Map<string, FuulTotalEntry>();
	for (const reward of rewards) {
		const entry = fuulClaimableRewardToTotalEntry(reward);
		const key = `${entry.chain_id}:${entry.currency.toLowerCase()}:${entry.currency_type}`;
		const existing = totals.get(key);
		if (existing) {
			existing.amount = (
				BigInt(existing.amount) + BigInt(entry.amount)
			).toString();
		} else {
			totals.set(key, entry);
		}
	}
	return [...totals.values()];
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

const normalizeFiniteNumber = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
};

const normalizeAprFraction = (value: unknown): number | undefined => {
	const parsed = normalizeFiniteNumber(value);
	if (parsed === undefined || parsed <= 0) return undefined;
	return parsed > 1 ? parsed / 100 : parsed;
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

const isActiveTimeWindow = (args: {
	startTimestamp?: string | number | null;
	endTimestamp?: string | number | null;
	nowSeconds?: number;
}): boolean => {
	const nowSeconds = args.nowSeconds ?? Math.floor(Date.now() / 1000);
	const startSeconds = normalizeTimestampSeconds(args.startTimestamp);
	const endSeconds = normalizeTimestampSeconds(args.endTimestamp);

	if (startSeconds !== undefined && nowSeconds < startSeconds) return false;
	if (endSeconds !== undefined && nowSeconds >= endSeconds) return false;
	return true;
};

const parseRawAmount = (value: unknown): bigint | undefined => {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
		return BigInt(value);
	}
	if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
	return undefined;
};

const proofStreamId = (proof: TurtleMerkleProof): string | undefined =>
	proof.streamId ?? proof.stream_id ?? proof.id;

const proofStreamAddress = (
	proof: TurtleMerkleProof,
	stream?: TurtleStreamConfig,
): Address | undefined =>
	normalizeAddress(
		proof.streamAddress ??
			proof.stream_address ??
			proof.contractAddress ??
			proof.contract_address ??
			proof.claimAddress,
	) ?? stream?.streamAddress;

const proofAmount = (proof: TurtleMerkleProof): bigint | undefined =>
	parseRawAmount(
		proof.amount ?? proof.cumulativeAmount ?? proof.cumulative_amount,
	);

const proofClaimableAmount = (proof: TurtleMerkleProof): bigint | undefined =>
	parseRawAmount(
		proof.claimable ??
			proof.claimableAmount ??
			proof.claimable_amount ??
			proof.unclaimed ??
			proof.unclaimedAmount ??
			proof.unclaimed_amount,
	);

const extractTurtleProofs = (payload: unknown): TurtleMerkleProof[] => {
	if (Array.isArray(payload)) return payload as TurtleMerkleProof[];
	if (!payload || typeof payload !== "object") return [];
	const record = payload as Record<string, unknown>;
	for (const key of [
		"proofs",
		"merkleProofs",
		"merkle_proofs",
		"streams",
		"rewards",
		"data",
	]) {
		const value = record[key];
		if (Array.isArray(value)) return value as TurtleMerkleProof[];
	}
	return Object.values(record).filter(
		(value): value is TurtleMerkleProof =>
			!!value && typeof value === "object" && !Array.isArray(value),
	);
};

const extractTurtleStreams = (payload: unknown): TurtleStream[] => {
	if (Array.isArray(payload)) return payload as TurtleStream[];
	if (!payload || typeof payload !== "object") return [];
	const record = payload as Record<string, unknown>;
	for (const key of ["streams", "data", "rewards"]) {
		const value = record[key];
		if (Array.isArray(value)) return value as TurtleStream[];
	}
	return [];
};

const parseTurtleStreamChainId = (stream: TurtleStream): number | undefined => {
	const value =
		stream.chainId ?? stream.customArgs?.targetToken?.chain?.chainId;
	if (typeof value === "number" && Number.isSafeInteger(value)) return value;
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
	return undefined;
};

const mapMerklSubType = (
	subType: number | null | undefined,
): RewardAction | undefined => {
	if (subType === 0) return "LEND";
	if (subType === 1) return "BORROW";
	if (subType === 2) return "BORROW_COLLATERAL";
	return undefined;
};

const mapMerklOpportunityTypeAction = (
	type: MerklOpportunityType,
): RewardAction | undefined => {
	if (type === "EULER_LEND") return "LEND";
	if (type === "EULER_BORROW") return "BORROW";
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
	private fuulTotalsUrl?: string;
	private fuulClaimChecksUrl?: string;
	private brevisChainIds?: number[];
	private turtleStreams: TurtleStreamConfig[];
	private merklDistributorAddress: Address;
	private fuulManagerAddress: Address;
	private fuulFactoryAddress: Address;
	private enableMerkl: boolean;
	private enableBrevis: boolean;
	private enableFuul: boolean;
	private enableTurtle: boolean;

	constructor(config?: RewardsDirectAdapterConfig, buildQuery?: BuildQueryFn) {
		this.merklApiUrl = config?.merklApiUrl ?? DEFAULT_MERKL_API_URL;
		this.brevisApiUrl = config?.brevisApiUrl ?? DEFAULT_BREVIS_API_URL;
		this.brevisProofsApiUrl =
			config?.brevisProofsApiUrl ?? DEFAULT_BREVIS_PROOFS_API_URL;
		this.fuulApiUrl = config?.fuulApiUrl ?? DEFAULT_FUUL_API_URL;
		this.turtleApiUrl = config?.turtleApiUrl ?? DEFAULT_TURTLE_API_URL;
		this.fuulTotalsUrl = config?.fuulTotalsUrl;
		this.fuulClaimChecksUrl = config?.fuulClaimChecksUrl;
		this.brevisChainIds = config?.brevisChainIds;
		this.turtleStreams = config?.turtleStreams ?? [];
		this.merklDistributorAddress =
			config?.merklDistributorAddress ?? DEFAULT_MERKL_DISTRIBUTOR;
		this.fuulManagerAddress =
			config?.fuulManagerAddress ?? DEFAULT_FUUL_MANAGER;
		this.fuulFactoryAddress =
			config?.fuulFactoryAddress ?? DEFAULT_FUUL_FACTORY;
		this.enableMerkl = config?.enableMerkl ?? true;
		this.enableBrevis = config?.enableBrevis ?? true;
		this.enableFuul = config?.enableFuul ?? true;
		this.enableTurtle = config?.enableTurtle ?? true;

		if (buildQuery) applyBuildQuery(this, buildQuery);
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

	queryFuulClaimableRewards = async (
		url: string,
	): Promise<FuulClaimableReward[]> => {
		const res = await fetch(url);
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? (data as FuulClaimableReward[]) : [];
	};

	setQueryFuulClaimableRewards(
		fn: typeof this.queryFuulClaimableRewards,
	): void {
		this.queryFuulClaimableRewards = fn;
	}

	queryTurtleMerkleProofs = async (
		url: string,
	): Promise<TurtleMerkleProof[]> => {
		const res = await fetch(url);
		if (!res.ok) return [];
		return extractTurtleProofs(await res.json());
	};

	setQueryTurtleMerkleProofs(fn: typeof this.queryTurtleMerkleProofs): void {
		this.queryTurtleMerkleProofs = fn;
	}

	queryTurtleStreams = async (url: string): Promise<TurtleStream[]> => {
		const res = await fetch(url);
		if (!res.ok) return [];
		return extractTurtleStreams(await res.json());
	};

	setQueryTurtleStreams(fn: typeof this.queryTurtleStreams): void {
		this.queryTurtleStreams = fn;
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

	async fetchFuulTotals(
		address: Address,
		chainId?: number,
	): Promise<FuulTotals> {
		if (!this.fuulTotalsUrl) {
			if (chainId === undefined) return { claimed: [], unclaimed: [] };
			const rewards = await this.fetchFuulClaimableRewards(
				chainId,
				address,
			).catch(() => []);
			return {
				claimed: [],
				unclaimed: aggregateFuulTotals(rewards),
			};
		}
		const separator = this.fuulTotalsUrl.includes("?") ? "&" : "?";
		const url = `${this.fuulTotalsUrl}${separator}user_identifier=${encodeURIComponent(address)}&user_identifier_type=evm_address`;
		return this.queryFuulTotals(url).catch(() => ({
			claimed: [],
			unclaimed: [],
		}));
	}

	async fetchFuulClaimChecks(
		address: Address,
		chainId?: number,
	): Promise<FuulClaimCheck[]> {
		if (!this.fuulClaimChecksUrl) {
			if (chainId === undefined) return [];
			const rewards = await this.fetchFuulClaimableRewards(
				chainId,
				address,
			).catch(() => []);
			return rewards
				.filter((reward) => Number(reward.currency_chain_id) === chainId)
				.map(fuulClaimableRewardToClaimCheck);
		}
		const claimChecks = await this.queryFuulClaimChecks(
			this.fuulClaimChecksUrl,
			{
				userIdentifier: address,
				userIdentifierType: "evm_address",
			},
		).catch(() => []);
		return sanitizeFuulClaimChecks(claimChecks, address);
	}

	async fetchTurtleProofs(
		address: Address,
		streamIds: string[],
	): Promise<TurtleMerkleProof[]> {
		if (streamIds.length === 0) return [];
		const separator = this.turtleApiUrl.includes("?") ? "&" : "?";
		const url = `${this.turtleApiUrl}/streams/merkle_proofs${separator}wallet=${encodeURIComponent(address)}&streamIds=${encodeURIComponent(streamIds.join(","))}`;
		return this.queryTurtleMerkleProofs(url).catch(() => []);
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
				"EULER_LEND",
				`${this.merklApiUrl}/opportunities/?chainId=${chainId}&type=EULER_LEND&campaigns=true`,
			],
			[
				"EULER_BORROW",
				`${this.merklApiUrl}/opportunities/?chainId=${chainId}&type=EULER_BORROW&campaigns=true`,
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
						mapMerklOpportunityTypeAction(type) ??
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
		const separator = this.turtleApiUrl.includes("?") ? "&" : "?";
		const streams = await this.queryTurtleStreams(
			`${this.turtleApiUrl}/streams${separator}chainId=${chainId}`,
		).catch(() => []);
		const campaigns: (RewardCampaign & { _vaultAddress: string })[] = [];

		for (const stream of streams) {
			if (parseTurtleStreamChainId(stream) !== chainId) continue;
			if (
				!isActiveTimeWindow({
					startTimestamp: stream.startTimestamp,
					endTimestamp: stream.endTimestamp,
				})
			) {
				continue;
			}

			const campaignId = stream.id;
			const targetTokenAddress = normalizeAddress(
				stream.customArgs?.targetToken?.address,
			);
			const rewardToken = stream.rewardToken;
			const rewardTokenAddress = normalizeAddress(rewardToken?.address);
			const rewardTokenSymbol = rewardToken?.symbol;
			const apr = normalizeAprFraction(
				stream.lastSnapshot?.apr ??
					stream.lastSnapshot?.baseApr ??
					stream.customArgs?.apr,
			);

			if (!campaignId || !targetTokenAddress || !rewardTokenSymbol || !apr) {
				continue;
			}

			campaigns.push({
				campaignId,
				source: "turtle",
				action: "LEND",
				apr,
				rewardTokenAddress,
				rewardTokenSymbol,
				rewardTokenIcon: rewardToken?.logoUrl,
				endTimestamp: normalizeTimestampSeconds(stream.endTimestamp),
				sourceUrl: TURTLE_SOURCE_URL,
				_vaultAddress: targetTokenAddress.toLowerCase(),
			});
		}

		return campaigns;
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

		const rewardsByToken = new Map<string, UserReward>();
		for (const chainRewards of chainRewardsList) {
			for (const reward of chainRewards.rewards ?? []) {
				const unclaimed = BigInt(reward.amount) - BigInt(reward.claimed);
				if (unclaimed <= 0n) continue;

				const tokenPrice =
					Math.abs(reward.token.price) < 1e-8 ? 0 : reward.token.price;

				const tokenAddress = getAddress(reward.token.address) as Address;
				const userReward: UserReward = {
					chainId: reward.token.chainId,
					token: {
						address: tokenAddress,
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
				};
				const key = `${userReward.chainId}:${tokenAddress.toLowerCase()}`;
				const existing = rewardsByToken.get(key);
				if (
					!existing ||
					BigInt(userReward.accumulated) > BigInt(existing.accumulated)
				) {
					rewardsByToken.set(key, userReward);
				}
			}
		}

		return [...rewardsByToken.values()];
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
		if (!this.fuulTotalsUrl) {
			const claimableRewards = await this.fetchFuulClaimableRewards(
				chainId,
				address,
			);
			const totals = new Map<
				string,
				{
					chainId: number;
					token: Address;
					symbol: string;
					decimals: number;
					amount: bigint;
				}
			>();

			for (const reward of claimableRewards) {
				const claimChainId = Number(reward.currency_chain_id);
				if (claimChainId !== chainId) continue;
				const tokenAddress = getAddress(reward.currency_address) as Address;
				const key = `${claimChainId}:${tokenAddress.toLowerCase()}`;
				const existing = totals.get(key);
				if (existing) {
					existing.amount += BigInt(reward.amount);
				} else {
					totals.set(key, {
						chainId: claimChainId,
						token: tokenAddress,
						symbol: reward.currency_name || tokenAddress,
						decimals: Number(reward.currency_decimals ?? 18),
						amount: BigInt(reward.amount),
					});
				}
			}

			return [...totals.values()].map((reward) => ({
				chainId: reward.chainId,
				token: {
					address: reward.token,
					chainId: reward.chainId,
					symbol: reward.symbol,
					name: reward.symbol,
					decimals: reward.decimals,
				},
				tokenPrice: 0,
				provider: "fuul",
				accumulated: reward.amount.toString(),
				unclaimed: reward.amount.toString(),
				claimAddress: this.fuulManagerAddress,
			}));
		}

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

	private async fetchFuulClaimableRewards(
		chainId: number,
		address: Address,
	): Promise<FuulClaimableReward[]> {
		const separator = this.fuulApiUrl.includes("?") ? "&" : "?";
		const url = `${this.fuulApiUrl}/claimable-rewards${separator}protocol=euler&user_address=${encodeURIComponent(address)}&chain_id=${chainId}`;
		const rewards = await this.queryFuulClaimableRewards(url).catch(() => []);
		return rewards.flatMap((reward) => {
			const normalized = normalizeFuulClaimableReward(reward, address);
			return normalized ? [normalized] : [];
		});
	}

	private async fetchTurtleUserRewards(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		const streams = this.turtleStreams.filter(
			(stream) => stream.chainId === chainId,
		);
		if (streams.length === 0) return [];

		const streamById = new Map(
			streams.map((stream) => [stream.streamId, stream]),
		);
		const proofs = await this.fetchTurtleProofs(
			address,
			streams.map((stream) => stream.streamId),
		);
		const rewards: UserReward[] = [];

		for (const proof of proofs) {
			const streamId = proofStreamId(proof);
			if (!streamId) continue;
			const stream = streamById.get(streamId);
			if (!stream) continue;

			const amount = proofAmount(proof);
			if (amount === undefined || amount <= 0n) continue;
			const claimableAmount = proofClaimableAmount(proof);
			if (claimableAmount !== undefined && claimableAmount <= 0n) continue;

			const streamAddress = proofStreamAddress(proof, stream);
			if (!streamAddress) continue;

			const token = proof.rewardToken ?? proof.token ?? stream.rewardToken;
			const tokenAddress = normalizeAddress(token?.address);
			if (!tokenAddress) continue;

			rewards.push({
				chainId,
				token: {
					address: tokenAddress,
					chainId: token?.chainId ?? chainId,
					symbol: token?.symbol ?? tokenAddress,
					name: token?.name ?? token?.symbol ?? tokenAddress,
					decimals: token?.decimals ?? 18,
				},
				tokenPrice:
					normalizeFiniteNumber(
						proof.rewardTokenPriceUsd ??
							proof.tokenPriceUsd ??
							proof.tokenPrice ??
							stream.tokenPrice,
					) ?? 0,
				provider: "turtle",
				campaignId: streamId,
				accumulated: amount.toString(),
				unclaimed: (claimableAmount ?? 0n).toString(),
				proof: (proof.proof ?? proof.merkleProof ?? proof.merkle_proof) as
					| Hex[]
					| undefined,
				claimAddress: streamAddress,
				streamId,
				streamAddress,
				timestamp: proof.timestamp,
			});
		}

		return rewards;
	}
}
