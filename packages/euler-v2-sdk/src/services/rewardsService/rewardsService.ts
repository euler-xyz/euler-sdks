import {
	type Address,
	encodeFunctionData,
	getAddress,
	type Hex,
	zeroAddress,
} from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type { AccountRewardStream } from "../../entities/Account.js";
import type {
	ContractCall,
	EVCBatchItem,
	TransactionPlan,
} from "../executionService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type { DeploymentService } from "../deploymentService/index.js";
import { accountLensAbi } from "../accountService/adapters/accountOnchainAdapter/abis/accountLensAbi.js";
import type { VaultAccountInfo } from "../accountService/adapters/accountOnchainAdapter/accountLensTypes.js";
import type {
	BuildRewardClaimAllPlanArgs,
	BuildRewardClaimPlanArgs,
	BuildRewardClaimsPlanArgs,
	FetchRewardStreamsArgs,
	BuildRewardStreamClaimPlanArgs,
	FuulClaimCheck,
	FuulTotals,
	IRewardsAdapter,
	IRewardsService,
	UserReward,
	VaultRewardInfo,
} from "./rewardsServiceTypes.js";
import {
	defaultIsActiveForViewer,
	type IsActiveForViewerFn,
} from "./rewardCampaignEligibility.js";

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

const REWARD_STREAMS_ABI = [
	{
		type: "function",
		name: "claimReward",
		inputs: [
			{ name: "rewarded", type: "address", internalType: "address" },
			{ name: "reward", type: "address", internalType: "address" },
			{ name: "to", type: "address", internalType: "address" },
			{ name: "ignoreRecentReward", type: "bool", internalType: "bool" },
		],
		outputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
		stateMutability: "nonpayable",
	},
] as const;

const MERKL_DEFAULT_DISTRIBUTOR: Address =
	"0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
const MERKL_DEFAULT_DISTRIBUTOR_CHAIN_IDS = new Set([
	1, 10, 30, 56, 100, 122, 130, 137, 143, 146, 151, 169, 196, 239, 250, 252,
	480, 592, 747, 988, 999, 1135, 1284, 1329, 1868, 1923, 2020, 4114, 4217, 4326,
	5000, 5464, 6900, 8453, 9745, 13371, 16661, 25363, 31612, 34443, 42161, 42220,
	42793, 43111, 43114, 48900, 57073, 59144, 60808, 80094, 81457, 98866, 167000,
	534352, 685689, 747474, 1440000, 5064014, 21000000, 2046399126,
]);
const MERKL_DISTRIBUTOR_OVERRIDES = new Map<number, Address>([
	[50, "0xDd8098dA94cF3aEA5253545162F1Feb371278F5a"],
	[324, "0xe117ed7Ef16d3c28fCBA7eC49AFAD77f451a6a21"],
]);

type BrevisFallbackAdapter = IRewardsAdapter & {
	fetchBrevisUserRewardClaims?: (
		chainId: number,
		address: Address,
	) => Promise<UserReward[]>;
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

const fuulRewardKey = (currency: string, currencyType?: number): string =>
	`${getAddress(currency).toLowerCase()}:${currencyType ?? "*"}`;

const uniqueAddresses = (
	addresses: Iterable<string | Address | undefined>,
): Address[] => {
	const out = new Map<string, Address>();
	for (const address of addresses) {
		if (!address) continue;
		const checksum = getAddress(address);
		if (checksum === zeroAddress) continue;
		out.set(checksum.toLowerCase(), checksum as Address);
	}
	return [...out.values()];
};

export class RewardsService implements IRewardsService {
	private providerService?: ProviderService;
	private deploymentService?: DeploymentService;
	private isActiveForViewer: IsActiveForViewerFn;

	constructor(
		private adapter: IRewardsAdapter,
		private readonly addresses: {
			merklDistributorAddress: Address;
			fuulManagerAddress: Address;
			fuulFactoryAddress: Address;
			rewardStreamsAddress?: Address;
		},
		options?: { isActiveForViewer?: IsActiveForViewerFn },
	) {
		this.isActiveForViewer =
			options?.isActiveForViewer ?? defaultIsActiveForViewer;
	}

	setAdapter(adapter: IRewardsAdapter): void {
		this.adapter = adapter;
	}

	setProviderService(providerService: ProviderService): void {
		this.providerService = providerService;
	}

	setDeploymentService(deploymentService: DeploymentService): void {
		this.deploymentService = deploymentService;
	}

	setIsActiveForViewer(fn: IsActiveForViewerFn): void {
		this.isActiveForViewer = fn;
	}

	getIsActiveForViewer(): IsActiveForViewerFn {
		return this.isActiveForViewer;
	}

	async fetchVaultRewards(
		chainId: number,
		vaultAddress: Address,
	): Promise<VaultRewardInfo | undefined> {
		const info = await this.adapter.fetchVaultRewards(chainId, vaultAddress);
		if (info) info.setIsActiveForViewer(this.isActiveForViewer);
		return info;
	}

	async fetchChainRewards(
		chainId: number,
	): Promise<Map<string, VaultRewardInfo>> {
		const map = await this.adapter.fetchChainRewards(chainId);
		for (const info of map.values()) {
			info.setIsActiveForViewer(this.isActiveForViewer);
		}
		return map;
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
		return this.adapter.fetchUserRewards(chainId, address);
	}

	async fetchFuulTotals(address: Address): Promise<FuulTotals> {
		return this.adapter.fetchFuulTotals(address);
	}

	async fetchFuulClaimChecks(address: Address): Promise<FuulClaimCheck[]> {
		return this.adapter.fetchFuulClaimChecks(address);
	}

	queryVaultAccountInfo = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		accountLensAddress: Address,
		account: Address,
		vault: Address,
	): Promise<VaultAccountInfo> => {
		return provider.readContract({
			address: accountLensAddress,
			abi: accountLensAbi,
			functionName: "getVaultAccountInfo",
			args: [account, vault],
		}) as Promise<VaultAccountInfo>;
	};

	setQueryVaultAccountInfo(fn: typeof this.queryVaultAccountInfo): void {
		this.queryVaultAccountInfo = fn;
	}

	async fetchRewardStreams(
		args: FetchRewardStreamsArgs,
	): Promise<AccountRewardStream[]> {
		const provider = this.getProvider(args.chainId);
		const accountLensAddress = this.resolveAccountLensAddress(
			args.chainId,
			args.accountLensAddress,
		);
		const uniquePositions = Array.from(
			new Map(
				args.positions.map((position) => {
					const account = getAddress(position.account) as Address;
					const vault = getAddress(position.vault) as Address;
					return [`${account}:${vault}`, { account, vault }];
				}),
			).values(),
		);

		const vaultAccountInfos = await Promise.all(
			uniquePositions.map((position) =>
				this.queryVaultAccountInfo(
					provider,
					accountLensAddress,
					position.account,
					position.vault,
				),
			),
		);

		return vaultAccountInfos.flatMap((vaultAccountInfo) =>
			(vaultAccountInfo.enabledRewardsInfo ?? [])
				.filter((rewardInfo) => rewardInfo.earnedReward > 0n)
				.map((rewardInfo) => ({
					account: getAddress(vaultAccountInfo.account) as Address,
					vault: getAddress(vaultAccountInfo.vault) as Address,
					reward: getAddress(rewardInfo.reward) as Address,
					earnedReward: rewardInfo.earnedReward,
					earnedRewardRecentIgnored: rewardInfo.earnedRewardRecentIgnored,
				})),
		);
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
			const groupedMerklRewards = new Map<
				string,
				{ distributorAddress: Address; rewards: UserReward[] }
			>();
			for (const reward of merklRewards) {
				if (!reward.proof?.length) {
					throw new Error("Missing Merkl claim data");
				}
				const distributorAddress = this.getTrustedMerklDistributorAddress(
					reward.chainId,
				);
				if (
					reward.claimAddress &&
					getAddress(reward.claimAddress) !== distributorAddress
				) {
					throw new Error("Merkl claim address mismatch");
				}
				const key = `${reward.chainId}:${distributorAddress.toLowerCase()}`;
				const group = groupedMerklRewards.get(key) ?? {
					distributorAddress,
					rewards: [],
				};
				group.rewards.push(reward);
				groupedMerklRewards.set(key, group);
			}

			for (const group of groupedMerklRewards.values()) {
				plan.push(
					this.buildMerklContractCall(
						group.rewards,
						account,
						group.distributorAddress,
					),
				);
			}
		}

		for (const reward of rewards) {
			if (reward.provider !== "brevis") continue;
			await this.validateBrevisClaimTarget(reward, account);
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

		return this.buildContractCallBatchPlan(plan, account, "Claim rewards");
	}

	async buildClaimAllPlan(
		args: BuildRewardClaimAllPlanArgs,
	): Promise<TransactionPlan> {
		const rewards = await this.fetchUserRewards(args.chainId, args.account);
		return this.buildClaimPlans({
			rewards,
			account: args.account,
		});
	}

	buildRewardStreamClaimPlan(
		args: BuildRewardStreamClaimPlanArgs,
	): TransactionPlan {
		const rewardStreamsAddress = this.resolveRewardStreamsAddress(
			args.chainId,
			args.rewardStreamsAddress,
		);
		const recipient = getAddress(args.recipient) as Address;
		const items: EVCBatchItem[] = args.rewardStreams
			.filter((rewardStream) => rewardStream.earnedReward > 0n)
			.map((rewardStream) => ({
				targetContract: rewardStreamsAddress,
				onBehalfOfAccount: getAddress(rewardStream.account) as Address,
				value: 0n,
				data: encodeFunctionData({
					abi: REWARD_STREAMS_ABI,
					functionName: "claimReward",
					args: [
						getAddress(rewardStream.vault) as Address,
						getAddress(rewardStream.reward) as Address,
						recipient,
						rewardStream.earnedReward ===
							rewardStream.earnedRewardRecentIgnored,
					],
				}),
			}));

		if (items.length === 0) return [];
		const walletBalanceTokens = uniqueAddresses(
			args.rewardStreams
				.filter((rewardStream) => rewardStream.earnedReward > 0n)
				.map((rewardStream) => rewardStream.reward),
		);
		return [
			{
				type: "evcBatch",
				items: [
					{
						type: "operation",
						name: "Claim rewards",
						items,
						...(walletBalanceTokens.length ? { walletBalanceTokens } : {}),
					},
				],
			},
		];
	}

	private getProvider(
		chainId: number,
	): ReturnType<ProviderService["getProvider"]> {
		if (!this.providerService) {
			throw new Error("Provider service not configured");
		}
		return this.providerService.getProvider(chainId);
	}

	private getDeployment(chainId: number) {
		if (!this.deploymentService) {
			throw new Error("Deployment service not configured");
		}
		return this.deploymentService.getDeployment(chainId);
	}

	private resolveRewardStreamsAddress(
		chainId: number,
		override?: Address,
	): Address {
		return (
			override ??
			this.addresses.rewardStreamsAddress ??
			this.getDeployment(chainId).addresses.coreAddrs.balanceTracker
		);
	}

	private resolveAccountLensAddress(
		chainId: number,
		override?: Address,
	): Address {
		return (
			override ?? this.getDeployment(chainId).addresses.lensAddrs.accountLens
		);
	}

	private buildContractCallBatchPlan(
		plan: TransactionPlan,
		account: Address,
		operationName: string,
	): TransactionPlan {
		const items: EVCBatchItem[] = plan.map((item) => {
			if (item.type !== "contractCall") {
				throw new Error(
					"RewardsService can only convert contract-call reward claims to EVC batch items",
				);
			}
			return {
				targetContract: item.to,
				onBehalfOfAccount: account,
				value: item.value,
				data: encodeFunctionData({
					abi: item.abi,
					functionName: item.functionName,
					args: item.args,
				}),
			};
		});

		if (items.length === 0) return [];
		const walletBalanceTokens = uniqueAddresses(
			plan.flatMap((item) =>
				item.type === "contractCall" ? (item.walletBalanceTokens ?? []) : [],
			),
		);
		return [
			{
				type: "evcBatch",
				items: [
					{
						type: "operation",
							name: operationName,
							items,
							...(walletBalanceTokens.length ? { walletBalanceTokens } : {}),
						},
					],
				},
		];
	}

	private buildMerklContractCall(
		rewards: UserReward[],
		account: Address,
		distributorAddress: Address,
	): ContractCall {
		const firstReward = rewards[0];
		if (!firstReward) {
			throw new Error("Missing Merkl claim data");
		}

		return {
			type: "contractCall",
			chainId: firstReward.chainId,
			to: distributorAddress,
			abi: MERKL_DISTRIBUTOR_ABI,
			functionName: "claim",
			args: [
				rewards.map(() => account),
				rewards.map((reward) => reward.token.address),
				rewards.map((reward) => BigInt(reward.accumulated)),
				rewards.map((reward) => reward.proof ?? []),
			],
			value: 0n,
			walletBalanceTokens: uniqueAddresses(
				rewards.map((reward) => reward.token.address),
			),
		};
	}

	private getTrustedMerklDistributorAddress(chainId: number): Address {
		const configuredAddress = getAddress(
			this.addresses.merklDistributorAddress,
		) as Address;
		if (configuredAddress !== MERKL_DEFAULT_DISTRIBUTOR) {
			return configuredAddress;
		}

		const overrideAddress = MERKL_DISTRIBUTOR_OVERRIDES.get(chainId);
		if (overrideAddress) return overrideAddress;
		if (MERKL_DEFAULT_DISTRIBUTOR_CHAIN_IDS.has(chainId)) {
			return MERKL_DEFAULT_DISTRIBUTOR;
		}

		throw new Error(`No trusted Merkl distributor for chainId ${chainId}`);
	}

	private async validateBrevisClaimTarget(
		reward: UserReward,
		account: Address,
	): Promise<void> {
		if (!hasBrevisClaimData(reward)) {
			throw new Error("Missing Brevis claim data");
		}

		const claimAdapter = this.getBrevisClaimAdapter();
		if (!claimAdapter) {
			throw new Error("Unverified Brevis claim data");
		}

		const verifiedRewards = await claimAdapter.fetchBrevisUserRewardClaims!(
			reward.chainId,
			account,
		).catch(() => []);
		const match = verifiedRewards?.some((verifiedReward) =>
			this.isSameBrevisClaim(reward, verifiedReward),
		);
		if (!match) {
			throw new Error("Brevis claim address mismatch");
		}
	}

	private getBrevisClaimAdapter(): BrevisFallbackAdapter | undefined {
		const adapter = this.adapter as BrevisFallbackAdapter;
		return adapter.fetchBrevisUserRewardClaims ? adapter : undefined;
	}

	private isSameBrevisClaim(
		reward: UserReward,
		verifiedReward: UserReward,
	): boolean {
		if (verifiedReward.provider !== "brevis") return false;
		if (verifiedReward.chainId !== reward.chainId) return false;
		if (verifiedReward.campaignId !== reward.campaignId) return false;
		if (
			getAddress(verifiedReward.token.address) !==
			getAddress(reward.token.address)
		) {
			return false;
		}
		if (
			!verifiedReward.claimAddress ||
			!reward.claimAddress ||
			getAddress(verifiedReward.claimAddress) !==
				getAddress(reward.claimAddress)
		) {
			return false;
		}
		if (verifiedReward.epoch !== reward.epoch) return false;

		return (
			this.arrayEquals(
				verifiedReward.cumulativeAmounts,
				reward.cumulativeAmounts,
			) && this.arrayEquals(verifiedReward.proof, reward.proof)
		);
	}

	private arrayEquals<T>(
		left: readonly T[] | undefined,
		right: readonly T[] | undefined,
	): boolean {
		if (!left || !right || left.length !== right.length) return false;
		return left.every((value, index) => value === right[index]);
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
			walletBalanceTokens: [getAddress(reward.token.address) as Address],
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
			walletBalanceTokens: uniqueAddresses(
				claimChecks.map((check) => check.currency),
			),
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
