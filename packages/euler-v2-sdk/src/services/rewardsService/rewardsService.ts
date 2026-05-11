import { type Address, getAddress, type Hex } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type {
	ContractCall,
	TransactionPlan,
} from "../executionService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type {
	BuildRewardClaimAllPlanArgs,
	BuildRewardClaimPlanArgs,
	BuildRewardClaimsPlanArgs,
	FuulClaimCheck,
	FuulTotals,
	IRewardsAdapter,
	IRewardsService,
	UserReward,
	VaultRewardInfo,
} from "./rewardsServiceTypes.js";

const MERKL_DISTRIBUTOR_ABI = [
	{
		type: "function",
		name: "claim",
		inputs: [
			{ name: "users", type: "address[]", internalType: "address[]" },
			{ name: "tokens", type: "address[]", internalType: "address[]" },
			{ name: "amounts", type: "uint256[]", internalType: "uint256[]" },
			{ name: "proofs", type: "bytes32[][]", internalType: "bytes32[][]" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

const BREVIS_CLAIM_ABI = [
	{
		type: "function",
		name: "claim",
		inputs: [
			{ name: "earner", type: "address", internalType: "address" },
			{
				name: "cumulativeAmounts",
				type: "uint256[]",
				internalType: "uint256[]",
			},
			{ name: "epoch", type: "uint64", internalType: "uint64" },
			{ name: "proof", type: "bytes32[]", internalType: "bytes32[]" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

const FUUL_MANAGER_ABI = [
	{
		type: "function",
		name: "claim",
		inputs: [
			{
				name: "claimChecks",
				type: "tuple[]",
				internalType: "struct ClaimCheck[]",
				components: [
					{ name: "projectAddress", type: "address", internalType: "address" },
					{ name: "to", type: "address", internalType: "address" },
					{ name: "currency", type: "address", internalType: "address" },
					{
						name: "currencyType",
						type: "uint8",
						internalType: "enum IFuulProject.TokenType",
					},
					{ name: "amount", type: "uint256", internalType: "uint256" },
					{ name: "reason", type: "uint8", internalType: "enum ClaimReason" },
					{ name: "tokenId", type: "uint256", internalType: "uint256" },
					{ name: "deadline", type: "uint256", internalType: "uint256" },
					{ name: "proof", type: "bytes32", internalType: "bytes32" },
					{ name: "signatures", type: "bytes[]", internalType: "bytes[]" },
				],
			},
		],
		outputs: [],
		stateMutability: "payable",
	},
] as const;

const FUUL_FACTORY_ABI = [
	{
		type: "function",
		name: "getFeesInformation",
		inputs: [
			{ name: "projectAddress", type: "address", internalType: "address" },
		],
		outputs: [
			{
				name: "",
				type: "tuple",
				internalType: "struct FeesInformation",
				components: [
					{
						name: "projectOwnerClaimFee",
						type: "uint256",
						internalType: "uint256",
					},
					{
						name: "nativeUserClaimFee",
						type: "uint256",
						internalType: "uint256",
					},
					{
						name: "tokenUserClaimFee",
						type: "uint256",
						internalType: "uint256",
					},
				],
			},
		],
		stateMutability: "view",
	},
] as const;

type BrevisFallbackAdapter = IRewardsAdapter & {
	fetchBrevisChainRewards?: (
		chainId: number,
	) => Promise<Map<string, VaultRewardInfo>>;
	fetchBrevisUserRewardClaims?: (
		chainId: number,
		address: Address,
	) => Promise<UserReward[]>;
};

const rewardCampaignKey = (reward: { source: string; campaignId: string }) =>
	`${reward.source}:${reward.campaignId}`;

const mergeVaultRewardMaps = (
	primary: Map<string, VaultRewardInfo>,
	fallback: Map<string, VaultRewardInfo>,
): Map<string, VaultRewardInfo> => {
	const merged = new Map<string, VaultRewardInfo>();

	for (const [vaultAddress, info] of primary) {
		merged.set(vaultAddress.toLowerCase(), {
			totalRewardsApr: info.totalRewardsApr,
			campaigns: [...info.campaigns],
		});
	}

	for (const [vaultAddress, fallbackInfo] of fallback) {
		const key = vaultAddress.toLowerCase();
		let info = merged.get(key);
		if (!info) {
			info = { totalRewardsApr: 0, campaigns: [] };
			merged.set(key, info);
		}

		const existing = new Set(info.campaigns.map(rewardCampaignKey));
		for (const campaign of fallbackInfo.campaigns) {
			const campaignKey = rewardCampaignKey(campaign);
			if (existing.has(campaignKey)) continue;
			info.campaigns.push(campaign);
			info.totalRewardsApr += campaign.apr;
			existing.add(campaignKey);
		}
	}

	return merged;
};

const hasBrevisClaimData = (reward: UserReward): boolean =>
	reward.provider !== "brevis" ||
	!!(
		reward.claimAddress &&
		reward.proof?.length &&
		reward.cumulativeAmounts?.length &&
		reward.epoch !== undefined &&
		reward.epoch !== ""
	);

const normalizeRewardAddress = (value?: Address) => value?.toLowerCase() ?? "";

const fuulRewardKey = (currency: string, currencyType?: number): string =>
	`${getAddress(currency).toLowerCase()}:${currencyType ?? "*"}`;

const canMergeUserReward = (
	primary: UserReward,
	fallback: UserReward,
): boolean => {
	if (primary.provider !== fallback.provider) return false;
	if (primary.chainId !== fallback.chainId) return false;
	if (
		primary.campaignId &&
		fallback.campaignId &&
		primary.campaignId !== fallback.campaignId
	) {
		return false;
	}
	if (
		primary.token.address.toLowerCase() !== fallback.token.address.toLowerCase()
	) {
		return false;
	}

	const primaryClaimAddress = normalizeRewardAddress(primary.claimAddress);
	const fallbackClaimAddress = normalizeRewardAddress(fallback.claimAddress);
	if (
		primaryClaimAddress &&
		fallbackClaimAddress &&
		primaryClaimAddress !== fallbackClaimAddress
	) {
		return false;
	}

	if (
		primary.epoch !== undefined &&
		fallback.epoch !== undefined &&
		primary.epoch !== fallback.epoch
	) {
		return false;
	}

	return true;
};

const mergeUserReward = (
	primary: UserReward,
	fallback: UserReward,
): UserReward => ({
	...fallback,
	...primary,
	token: {
		...fallback.token,
		...primary.token,
	},
	tokenPrice: primary.tokenPrice || fallback.tokenPrice,
	campaignId: primary.campaignId ?? fallback.campaignId,
	claimAddress: primary.claimAddress ?? fallback.claimAddress,
	proof: primary.proof?.length ? primary.proof : fallback.proof,
	cumulativeAmounts: primary.cumulativeAmounts?.length
		? primary.cumulativeAmounts
		: fallback.cumulativeAmounts,
	epoch: primary.epoch ?? fallback.epoch,
});

const mergeUserRewards = (
	primary: UserReward[],
	fallback: UserReward[],
): UserReward[] => {
	const merged = primary.filter(hasBrevisClaimData);

	for (const fallbackReward of fallback) {
		if (!hasBrevisClaimData(fallbackReward)) continue;

		const existingIndex = merged.findIndex((primaryReward) =>
			canMergeUserReward(primaryReward, fallbackReward),
		);
		if (existingIndex === -1) {
			merged.push(fallbackReward);
			continue;
		}

		const existing = merged[existingIndex]!;
		merged[existingIndex] =
			hasBrevisClaimData(existing) && !hasBrevisClaimData(fallbackReward)
				? existing
				: mergeUserReward(existing, fallbackReward);
	}

	return merged;
};

export class RewardsService implements IRewardsService {
	private providerService?: ProviderService;

	constructor(
		private adapter: IRewardsAdapter,
		private directAdapter: BrevisFallbackAdapter | undefined,
		private readonly addresses: {
			merklDistributorAddress: Address;
			fuulManagerAddress: Address;
			fuulFactoryAddress: Address;
		},
	) {}

	setAdapter(adapter: IRewardsAdapter): void {
		this.adapter = adapter;
	}

	setProviderService(providerService: ProviderService): void {
		this.providerService = providerService;
	}

	async fetchVaultRewards(
		chainId: number,
		vaultAddress: Address,
	): Promise<VaultRewardInfo | undefined> {
		return this.adapter.fetchVaultRewards(chainId, vaultAddress);
	}

	async fetchChainRewards(
		chainId: number,
	): Promise<Map<string, VaultRewardInfo>> {
		let rewardsMap: Map<string, VaultRewardInfo>;
		try {
			rewardsMap = await this.adapter.fetchChainRewards(chainId);
		} catch (err) {
			if (!this.directAdapter?.fetchBrevisChainRewards) throw err;
			rewardsMap = new Map();
		}

		if (!this.directAdapter?.fetchBrevisChainRewards) return rewardsMap;

		const brevisRewardsMap = await this.directAdapter
			.fetchBrevisChainRewards(chainId)
			.catch(() => new Map<string, VaultRewardInfo>());
		return mergeVaultRewardMaps(rewardsMap, brevisRewardsMap);
	}

	async populateRewards(vaults: ERC4626Vault[]): Promise<void> {
		if (vaults.length === 0) return;

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
			}),
		);
	}

	async fetchUserRewards(
		chainId: number,
		address: Address,
	): Promise<UserReward[]> {
		let rewards: UserReward[];
		try {
			rewards = await this.adapter.fetchUserRewards(chainId, address);
		} catch (err) {
			if (!this.directAdapter?.fetchBrevisUserRewardClaims) throw err;
			rewards = [];
		}

		if (!this.directAdapter?.fetchBrevisUserRewardClaims) return rewards;

		const brevisRewards = await this.directAdapter
			.fetchBrevisUserRewardClaims(chainId, address)
			.catch(() => []);
		return mergeUserRewards(rewards, brevisRewards);
	}

	async fetchFuulTotals(address: Address): Promise<FuulTotals> {
		const adapter = this.directAdapter ?? this.adapter;
		return adapter.fetchFuulTotals(address);
	}

	async fetchFuulClaimChecks(address: Address): Promise<FuulClaimCheck[]> {
		const adapter = this.directAdapter ?? this.adapter;
		return adapter.fetchFuulClaimChecks(address);
	}

	async buildClaimPlan(
		args: BuildRewardClaimPlanArgs,
	): Promise<TransactionPlan> {
		return this.buildClaimPlans({
			rewards: [args.reward],
			account: args.account,
		});
	}

	async buildClaimPlans(
		args: BuildRewardClaimsPlanArgs,
	): Promise<TransactionPlan> {
		const account = getAddress(args.account) as Address;
		const rewards = args.rewards.filter(
			(reward) => BigInt(reward.unclaimed) > 0n,
		);
		if (rewards.length === 0) return [];

		const plan: TransactionPlan = [];

		const merklRewards = rewards.filter(
			(reward) => reward.provider === "merkl",
		);
		if (merklRewards.length > 0) {
			const groupedMerklRewards = new Map<string, UserReward[]>();
			for (const reward of merklRewards) {
				if (!reward.claimAddress || !reward.proof?.length) {
					throw new Error("Missing Merkl claim data");
				}
				const key = `${reward.chainId}:${reward.claimAddress.toLowerCase()}`;
				const group = groupedMerklRewards.get(key) ?? [];
				group.push(reward);
				groupedMerklRewards.set(key, group);
			}

			for (const group of groupedMerklRewards.values()) {
				plan.push(this.buildMerklContractCall(group, account));
			}
		}

		for (const reward of rewards) {
			if (reward.provider !== "brevis") continue;
			plan.push(this.buildBrevisContractCall(reward, account));
		}

		const fuulRewards = rewards.filter((reward) => reward.provider === "fuul");
		if (fuulRewards.length > 0) {
			const chainIds = new Set(fuulRewards.map((reward) => reward.chainId));
			if (chainIds.size > 1) {
				throw new Error(
					"Fuul claim planning requires rewards from a single chain",
				);
			}
			plan.push(
				await this.buildFuulContractCall(
					fuulRewards[0]!.chainId,
					account,
					fuulRewards,
				),
			);
		}

		return plan;
	}

	async buildClaimAllPlan(
		args: BuildRewardClaimAllPlanArgs,
	): Promise<TransactionPlan> {
		const rewards = await this.fetchUserRewards(args.chainId, args.account);
		return this.buildClaimPlans({ rewards, account: args.account });
	}

	private buildMerklContractCall(
		rewards: UserReward[],
		account: Address,
	): ContractCall {
		const firstReward = rewards[0];
		if (!firstReward?.claimAddress) {
			throw new Error("Missing Merkl claim address");
		}

		return {
			type: "contractCall",
			chainId: firstReward.chainId,
			to: firstReward.claimAddress,
			abi: MERKL_DISTRIBUTOR_ABI,
			functionName: "claim",
			args: [
				rewards.map(() => account),
				rewards.map((reward) => reward.token.address),
				rewards.map((reward) => BigInt(reward.accumulated)),
				rewards.map((reward) => reward.proof ?? []),
			],
			value: 0n,
		};
	}

	private buildBrevisContractCall(
		reward: UserReward,
		account: Address,
	): ContractCall {
		if (
			!reward.claimAddress ||
			!reward.cumulativeAmounts?.length ||
			reward.epoch === undefined ||
			reward.epoch === "" ||
			!reward.proof?.length
		) {
			throw new Error("Missing Brevis claim data");
		}

		return {
			type: "contractCall",
			chainId: reward.chainId,
			to: reward.claimAddress,
			abi: BREVIS_CLAIM_ABI,
			functionName: "claim",
			args: [
				account,
				reward.cumulativeAmounts.map((amount) => BigInt(amount)),
				BigInt(reward.epoch),
				reward.proof,
			],
			value: 0n,
		};
	}

	private async buildFuulContractCall(
		chainId: number,
		account: Address,
		rewards: UserReward[],
	): Promise<ContractCall> {
		const claimChecks = await this.fetchFuulClaimChecks(account);
		if (claimChecks.length === 0) {
			throw new Error("No claimable Fuul rewards found");
		}
		await this.validateFuulClaimChecks(chainId, account, rewards, claimChecks);

		const uniqueProjects = [
			...new Set(claimChecks.map((check) => getAddress(check.project_address))),
		];
		const feePairs = await Promise.all(
			uniqueProjects.map(
				async (projectAddress) =>
					[
						projectAddress,
						await this.readFuulClaimFee(chainId, projectAddress),
					] as const,
			),
		);
		const feeMap = new Map(feePairs);
		const totalFee = claimChecks.reduce(
			(sum, check) =>
				sum + (feeMap.get(getAddress(check.project_address)) ?? 0n),
			0n,
		);

		return {
			type: "contractCall",
			chainId,
			to: this.addresses.fuulManagerAddress,
			abi: FUUL_MANAGER_ABI,
			functionName: "claim",
			args: [
				claimChecks.map((check) => ({
					projectAddress: getAddress(check.project_address) as Address,
					to: getAddress(check.to) as Address,
					currency: getAddress(check.currency) as Address,
					currencyType: check.currency_type,
					amount: BigInt(check.amount),
					reason: check.reason,
					tokenId: BigInt(check.token_id),
					deadline: BigInt(check.deadline),
					proof: check.proof as Hex,
					signatures: check.signatures as Hex[],
				})),
			],
			value: totalFee,
		};
	}

	private async validateFuulClaimChecks(
		chainId: number,
		account: Address,
		rewards: UserReward[],
		claimChecks: FuulClaimCheck[],
	): Promise<void> {
		const requestedAccount = getAddress(account);
		const totals = await this.fetchFuulTotals(account).catch(() => ({
			claimed: [],
			unclaimed: [],
		}));

		const unclaimedByCurrencyType = new Map<string, bigint>();
		for (const reward of totals.unclaimed) {
			if (reward.chain_id !== chainId) continue;
			const key = fuulRewardKey(reward.currency, reward.currency_type);
			unclaimedByCurrencyType.set(
				key,
				(unclaimedByCurrencyType.get(key) ?? 0n) + BigInt(reward.amount),
			);
		}

		const selectedByCurrency = new Map<string, bigint>();
		for (const reward of rewards) {
			if (reward.provider !== "fuul" || reward.chainId !== chainId) continue;
			const key = fuulRewardKey(reward.token.address);
			selectedByCurrency.set(
				key,
				(selectedByCurrency.get(key) ?? 0n) + BigInt(reward.unclaimed),
			);
		}

		const strictCurrencyValidation = unclaimedByCurrencyType.size > 0;
		for (const check of claimChecks) {
			if (getAddress(check.to) !== requestedAccount) {
				throw new Error("Fuul claim check recipient mismatch");
			}
			getAddress(check.project_address);

			const amount = BigInt(check.amount);
			const strictKey = fuulRewardKey(check.currency, check.currency_type);
			if (strictCurrencyValidation) {
				const available = unclaimedByCurrencyType.get(strictKey) ?? 0n;
				if (available <= 0n) {
					throw new Error(
						"Fuul claim check currency does not match unclaimed rewards",
					);
				}
				if (amount > available) {
					throw new Error("Fuul claim check amount exceeds unclaimed rewards");
				}
				unclaimedByCurrencyType.set(strictKey, available - amount);
				continue;
			}

			const fallbackKey = fuulRewardKey(check.currency);
			const available = selectedByCurrency.get(fallbackKey) ?? 0n;
			if (available <= 0n) {
				throw new Error(
					"Fuul claim check currency does not match requested rewards",
				);
			}
			if (amount > available) {
				throw new Error("Fuul claim check amount exceeds requested rewards");
			}
			selectedByCurrency.set(fallbackKey, available - amount);
		}
	}

	private async readFuulClaimFee(
		chainId: number,
		projectAddress: Address,
	): Promise<bigint> {
		if (!this.providerService) {
			throw new Error("RewardsService providerService not configured");
		}

		const provider = this.providerService.getProvider(chainId);
		const feesInfo = await provider.readContract({
			address: this.addresses.fuulFactoryAddress,
			abi: FUUL_FACTORY_ABI,
			functionName: "getFeesInformation",
			args: [projectAddress],
		});

		return feesInfo.nativeUserClaimFee;
	}

	getMerklDistributorAddress(): Address {
		return this.addresses.merklDistributorAddress;
	}

	getFuulManagerAddress(): Address {
		return this.addresses.fuulManagerAddress;
	}

	getFuulFactoryAddress(): Address {
		return this.addresses.fuulFactoryAddress;
	}
}
