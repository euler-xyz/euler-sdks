import { type Address, type Hex, getAddress } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
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
import type {
	ContractCall,
	TransactionPlan,
} from "../executionService/index.js";

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

export class RewardsService implements IRewardsService {
	private providerService?: ProviderService;

	constructor(
		private adapter: IRewardsAdapter,
		private directAdapter: IRewardsAdapter | undefined,
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

	async fetchChainRewards(chainId: number): Promise<Map<string, VaultRewardInfo>> {
		return this.adapter.fetchChainRewards(chainId);
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

	async fetchUserRewards(chainId: number, address: Address): Promise<UserReward[]> {
		return this.adapter.fetchUserRewards(chainId, address);
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
				await this.buildFuulContractCall(fuulRewards[0]!.chainId, account),
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
			!reward.epoch ||
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
	): Promise<ContractCall> {
		const claimChecks = await this.fetchFuulClaimChecks(account);
		if (claimChecks.length === 0) {
			throw new Error("No claimable Fuul rewards found");
		}

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
