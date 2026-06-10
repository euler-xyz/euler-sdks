import assert from "node:assert/strict";
import { test } from "vitest";
import {
	decodeFunctionData,
	getAddress,
	type Address,
	type Hex,
	zeroAddress,
} from "viem";

import { RewardsService } from "../src/services/rewardsService/rewardsService.js";
import type {
	FuulClaimCheck,
	IRewardsAdapter,
	UserReward,
} from "../src/services/rewardsService/index.js";
import type { MerklOpportunity } from "../src/services/rewardsService/rewardsServiceTypes.js";
import { RewardsV3Adapter } from "../src/services/rewardsService/adapters/rewardsV3Adapter/index.js";
import { RewardsDirectAdapter } from "../src/services/rewardsService/adapters/rewardsDirectAdapter/index.js";

const rewardToken = getAddress(
	"0x0000000000000000000000000000000000000001",
) as Address;
const vaultAddress = getAddress(
	"0x0000000000000000000000000000000000000002",
) as Address;
const claimAddress = getAddress(
	"0x0000000000000000000000000000000000000003",
) as Address;
const merklDistributorAddress = getAddress(
	"0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
) as Address;
const zksyncMerklDistributorAddress = getAddress(
	"0xe117ed7Ef16d3c28fCBA7eC49AFAD77f451a6a21",
) as Address;
const accountAddress = getAddress(
	"0x0000000000000000000000000000000000000004",
) as Address;
const otherAccountAddress = getAddress(
	"0x0000000000000000000000000000000000000005",
) as Address;
const fuulProjectAddress = getAddress(
	"0x0000000000000000000000000000000000000006",
) as Address;
const otherRewardToken = getAddress(
	"0x0000000000000000000000000000000000000007",
) as Address;
const secondCollateralAddress = getAddress(
	"0x0000000000000000000000000000000000000008",
) as Address;
const secondVaultAddress = getAddress(
	"0x0000000000000000000000000000000000000009",
) as Address;
const accountLensAddress = getAddress(
	"0x0000000000000000000000000000000000000010",
) as Address;
const rewardStreamsAddress = getAddress(
	"0x0000000000000000000000000000000000000011",
) as Address;
const proofHash =
	"0x0000000000000000000000000000000000000000000000000000000000000abc" as Hex;
const farFutureTimestamp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

const MERKL_CLAIM_ABI = [
	{
		type: "function",
		name: "claim",
		inputs: [
			{ name: "users", type: "address[]" },
			{ name: "tokens", type: "address[]" },
			{ name: "amounts", type: "uint256[]" },
			{ name: "proofs", type: "bytes32[][]" },
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
			{ name: "earner", type: "address" },
			{ name: "cumulativeAmounts", type: "uint256[]" },
			{ name: "epoch", type: "uint64" },
			{ name: "proof", type: "bytes32[]" },
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
				components: [
					{ name: "projectAddress", type: "address" },
					{ name: "to", type: "address" },
					{ name: "currency", type: "address" },
					{ name: "currencyType", type: "uint8" },
					{ name: "amount", type: "uint256" },
					{ name: "reason", type: "uint8" },
					{ name: "tokenId", type: "uint256" },
					{ name: "deadline", type: "uint256" },
					{ name: "proof", type: "bytes32" },
					{ name: "signatures", type: "bytes[]" },
				],
			},
		],
		outputs: [],
		stateMutability: "payable",
	},
] as const;

const REWARD_STREAMS_ABI = [
	{
		type: "function",
		name: "claimReward",
		inputs: [
			{ name: "rewarded", type: "address" },
			{ name: "reward", type: "address" },
			{ name: "to", type: "address" },
			{ name: "ignoreRecentReward", type: "bool" },
		],
		outputs: [{ name: "amount", type: "uint256" }],
		stateMutability: "nonpayable",
	},
] as const;

const emptyAdapter: IRewardsAdapter = {
	async fetchVaultRewards() {
		return undefined;
	},
	async fetchChainRewards() {
		return new Map();
	},
	async fetchUserRewards() {
		return [];
	},
	async fetchFuulTotals() {
		return { claimed: [], unclaimed: [] };
	},
	async fetchFuulClaimChecks() {
		return [];
	},
};

const makeRewardsService = () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress,
		fuulManagerAddress: otherAccountAddress,
		fuulFactoryAddress: fuulProjectAddress,
	});
	service.setProviderService({
		getProvider(chainId: number) {
			assert.equal(chainId, 1);
			return {};
		},
		getSupportedChainIds() {
			return [1];
		},
	} as any);
	service.setDeploymentService({
		getDeployment(chainId: number) {
			assert.equal(chainId, 1);
			return {
				chainId,
				name: "test",
				status: "active",
				addresses: {
					coreAddrs: {
						balanceTracker: rewardStreamsAddress,
					},
					lensAddrs: {
						accountLens: accountLensAddress,
					},
				},
			};
		},
		getDeploymentChainIds() {
			return [1];
		},
		addDeployment() {},
	} as any);
	return service;
};

const makeBrevisReward = (overrides: Partial<UserReward> = {}): UserReward => ({
	chainId: 1,
	token: {
		address: rewardToken,
		chainId: 1,
		symbol: "EUL",
		name: "EUL",
		decimals: 18,
	},
	tokenPrice: 2,
	provider: "brevis",
	accumulated: "1000",
	unclaimed: "1000",
	...overrides,
});

const makeMerklReward = (overrides: Partial<UserReward> = {}): UserReward => ({
	chainId: 1,
	token: {
		address: rewardToken,
		chainId: 1,
		symbol: "EUL",
		name: "EUL",
		decimals: 18,
	},
	tokenPrice: 2,
	provider: "merkl",
	accumulated: "1000",
	unclaimed: "1000",
	proof: [proofHash],
	claimAddress: merklDistributorAddress,
	...overrides,
});

const makeFuulClaimCheck = (
	overrides: Partial<FuulClaimCheck> = {},
): FuulClaimCheck => ({
	project_address: fuulProjectAddress,
	to: accountAddress,
	currency: rewardToken,
	currency_type: 0,
	amount: "1000",
	reason: 0,
	token_id: "0",
	deadline: "9999999999",
	proof: proofHash,
	signatures: ["0x123"],
	...overrides,
});

const makeFuulReward = (overrides: Partial<UserReward> = {}): UserReward => ({
	chainId: 1,
	token: {
		address: rewardToken,
		chainId: 1,
		symbol: "EUL",
		name: "EUL",
		decimals: 18,
	},
	tokenPrice: 0,
	provider: "fuul",
	accumulated: "1000",
	unclaimed: "1000",
	claimAddress,
	...overrides,
});

const makeMerklOpportunity = (
	overrides: Partial<MerklOpportunity>,
): MerklOpportunity =>
	({
		chainId: 1,
		chain: { name: "Ethereum" },
		type: "EULER",
		identifier: `${vaultAddress}-test`,
		status: "LIVE",
		action: "LEND",
		apr: 0,
		dailyRewards: 0,
		aprRecord: { breakdowns: [] },
		campaigns: [],
		...overrides,
	}) as MerklOpportunity;

const makeMerklCampaign = (
	overrides: Partial<MerklOpportunity["campaigns"][number]>,
): MerklOpportunity["campaigns"][number] =>
	({
		id: "campaign-row-1",
		campaignId: "campaign-1",
		type: "EULER",
		subType: 0,
		rewardToken: {
			address: rewardToken,
			symbol: "EUL",
			icon: "https://example.invalid/eul.png",
		},
		apr: 0,
		dailyRewards: 100,
		startTimestamp: 0,
		endTimestamp: farFutureTimestamp,
		params: {
			targetToken: vaultAddress,
		},
		...overrides,
	}) as MerklOpportunity["campaigns"][number];

const makeDirectRewardsAdapter = (
	opportunitiesByType: Record<string, MerklOpportunity[]>,
): RewardsDirectAdapter => {
	const adapter = new RewardsDirectAdapter({
		enableBrevis: false,
		enableFuul: false,
	});
	adapter.setQueryMerklOpportunities(async (url) => {
		const type = new URL(url).searchParams.get("type");
		return type ? (opportunitiesByType[type] ?? []) : [];
	});
	return adapter;
};

test("V3 rewards adapter normalizes Incentra APY campaigns as Brevis", async () => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3RewardsApyPage(async () => ({
		data: [
			{
				vault: vaultAddress,
				provider: "Incentra",
				campaignType: "EULER_LEND",
				id: "incentra-1",
				apr: 4.5,
				rewardToken: {
					address: rewardToken,
					symbol: "EUL",
				},
			},
		],
	}));

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 1);
	assert.equal(info?.campaigns[0]?.source, "brevis");
	assert.equal(info?.campaigns[0]?.action, "LEND");
	assert.equal(info?.campaigns[0]?.apr, 0.045);
});

test("V3 rewards adapter preserves collateral and looping campaign metadata", async () => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3RewardsApyPage(async () => ({
		data: [
			{
				vault: vaultAddress,
				campaigns: [
					{
						id: "borrow-collateral-1",
						provider: "merkl",
						campaignType: "euler_borrow_collateral",
						apr: 3,
						collateralAsset: otherRewardToken,
						sourceUrl: "https://app.merkl.xyz/opportunities/mainnet/EULER/x",
						rewardToken: {
							address: rewardToken,
							symbol: "EUL",
						},
						status: "active",
					},
					{
						id: "looping-1",
						provider: "fuul",
						campaignType: "euler_looping",
						apr: 4,
						collateralAsset: otherRewardToken,
						sourceUrl: "https://www.fuul.xyz/",
						minMultiplier: 2,
						maxMultiplier: 5,
						rewardToken: {
							address: rewardToken,
							symbol: "EUL",
						},
						status: "active",
					},
				],
			},
		],
	}));

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 2);
	assert.equal(info?.campaigns[0]?.action, "BORROW_COLLATERAL");
	assert.equal(info?.campaigns[0]?.collateralAddress, otherRewardToken);
	assert.equal(info?.campaigns[0]?.sourceUrl?.includes("merkl.xyz"), true);
	assert.equal(info?.campaigns[1]?.action, "LOOPING");
	assert.equal(info?.campaigns[1]?.collateralAddress, otherRewardToken);
	assert.equal(info?.campaigns[1]?.minMultiplier, 2);
	assert.equal(info?.campaigns[1]?.maxMultiplier, 5);
});

test("V3 rewards adapter maps campaign whitelist and blacklist (lowercased)", async () => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3RewardsApyPage(async () => ({
		data: [
			{
				vault: vaultAddress,
				campaigns: [
					{
						id: "gated-1",
						provider: "merkl",
						campaignType: "euler_lend",
						apr: 5,
						rewardToken: {
							address: rewardToken,
							symbol: "EUL",
						},
						status: "active",
						whitelist: [accountAddress],
						blacklist: [otherAccountAddress],
					},
				],
			},
		],
	}));

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 1);
	assert.deepEqual(info?.campaigns[0]?.whitelist, [
		accountAddress.toLowerCase(),
	]);
	assert.deepEqual(info?.campaigns[0]?.blacklist, [
		otherAccountAddress.toLowerCase(),
	]);
	// Eligibility predicate honours the mapped lists.
	assert.equal(info?.getActiveCampaigns({ viewer: accountAddress }).length, 1);
	assert.equal(
		info?.getActiveCampaigns({ viewer: otherAccountAddress }).length,
		0,
	);
});

test("V3 rewards adapter maps whitelist and blacklist on flat rows", async () => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3RewardsApyPage(async () => ({
		data: [
			{
				vault: vaultAddress,
				provider: "merkl",
				action: "LEND",
				id: "flat-gated-1",
				apr: 5,
				rewardToken: {
					address: rewardToken,
					symbol: "EUL",
				},
				whitelist: [accountAddress],
				blacklist: [otherAccountAddress],
			},
		],
	}));

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 1);
	assert.deepEqual(info?.campaigns[0]?.whitelist, [
		accountAddress.toLowerCase(),
	]);
	assert.deepEqual(info?.campaigns[0]?.blacklist, [
		otherAccountAddress.toLowerCase(),
	]);
});

test("direct rewards adapter expands Merkl MULTILENDBORROW markets", async () => {
	const adapter = makeDirectRewardsAdapter({
		MULTILENDBORROW: [
			makeMerklOpportunity({
				type: "MULTILENDBORROW",
				identifier: "multi-lend-borrow-1",
				action: "BORROW",
				campaigns: [
					makeMerklCampaign({
						campaignId: "multi-1",
						type: "MULTILENDBORROW",
						apr: 2.5,
						params: {
							whitelist: [accountAddress],
							blacklist: [otherAccountAddress],
							markets: [
								{
									campaignParameters: {
										evkAddress: vaultAddress,
									},
								},
								{
									campaignParameters: {
										targetToken: secondVaultAddress,
									},
								},
							],
						},
					}),
				],
			}),
		],
	});

	const rewards = await adapter.fetchChainRewards(1);
	const first = rewards.get(vaultAddress.toLowerCase());
	const second = rewards.get(secondVaultAddress.toLowerCase());

	assert.equal(first?.campaigns.length, 1);
	assert.equal(second?.campaigns.length, 1);
	assert.equal(first?.campaigns[0]?.action, "BORROW");
	assert.equal(first?.campaigns[0]?.apr, 0.025);
	assert.deepEqual(first?.campaigns[0]?.whitelist, [
		accountAddress.toLowerCase(),
	]);
	assert.deepEqual(first?.campaigns[0]?.blacklist, [
		otherAccountAddress.toLowerCase(),
	]);
	assert.match(first?.campaigns[0]?.sourceUrl ?? "", /MULTILENDBORROW/);
});

test("direct rewards adapter fans out Merkl borrow-from-collateral pairs", async () => {
	const adapter = makeDirectRewardsAdapter({
		EULER_MULTI_BORROW_FROM_COLLATERAL: [
			makeMerklOpportunity({
				type: "EULER_MULTI_BORROW_FROM_COLLATERAL",
				identifier: "borrow-from-collateral-1",
				action: "BORROW",
				aprRecord: {
					breakdowns: [
						{
							identifier: "borrow-collateral-1",
							value: 7,
						},
					],
				},
				campaigns: [
					makeMerklCampaign({
						campaignId: "borrow-collateral-1",
						type: "EULER_MULTI_BORROW_FROM_COLLATERAL",
						apr: 1,
						params: {
							vaults: [
								{
									evkAddress: vaultAddress,
									collaterals: [
										{ tokenAddress: otherRewardToken },
										{ tokenAddress: secondCollateralAddress },
									],
								},
							],
						},
					}),
				],
			}),
		],
	});

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 2);
	assert.equal(info?.campaigns[0]?.action, "BORROW_COLLATERAL");
	assert.equal(info?.campaigns[0]?.apr, 0.07);
	assert.deepEqual(
		info?.campaigns.map((campaign) => campaign.collateralAddress).sort(),
		[otherRewardToken, secondCollateralAddress].sort(),
	);
	assert.match(
		info?.campaigns[0]?.sourceUrl ?? "",
		/EULER_MULTI_BORROW_FROM_COLLATERAL/,
	);
});

test("direct rewards adapter accepts flat Merkl borrow-from-collateral params", async () => {
	const adapter = makeDirectRewardsAdapter({
		EULER_BORROW_FROM_COLLATERAL: [
			makeMerklOpportunity({
				type: "EULER_BORROW_FROM_COLLATERAL",
				identifier: "borrow-from-collateral-flat",
				action: "BORROW",
				campaigns: [
					makeMerklCampaign({
						campaignId: "borrow-collateral-flat-1",
						type: "EULER_BORROW_FROM_COLLATERAL",
						apr: 3,
						params: {
							evkAddress: vaultAddress,
							collateralAddress: otherRewardToken,
						},
					}),
				],
			}),
		],
	});

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 1);
	assert.equal(info?.campaigns[0]?.action, "BORROW_COLLATERAL");
	assert.equal(info?.campaigns[0]?.collateralAddress, otherRewardToken);
	assert.equal(info?.campaigns[0]?.apr, 0.03);
});

test("direct rewards adapter preserves standard Merkl allowlist metadata", async () => {
	const adapter = makeDirectRewardsAdapter({
		EULER: [
			makeMerklOpportunity({
				aprRecord: {
					breakdowns: [
						{
							identifier: "standard-1",
							value: 4.2,
						},
					],
				},
				campaigns: [
					makeMerklCampaign({
						campaignId: "standard-1",
						subType: 0,
						apr: 0,
						params: {
							evkAddress: vaultAddress,
							whitelist: [accountAddress],
							blacklist: [otherAccountAddress],
						},
					}),
				],
			}),
		],
	});

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 1);
	assert.equal(info?.campaigns[0]?.action, "LEND");
	assert.equal(info?.campaigns[0]?.apr, 0.042);
	assert.equal(info?.campaigns[0]?.rewardTokenIcon, "https://example.invalid/eul.png");
	assert.deepEqual(info?.campaigns[0]?.whitelist, [
		accountAddress.toLowerCase(),
	]);
	assert.deepEqual(info?.campaigns[0]?.blacklist, [
		otherAccountAddress.toLowerCase(),
	]);
});

test("direct rewards adapter maps split Merkl Euler lend and borrow opportunity types", async () => {
	const adapter = makeDirectRewardsAdapter({
		EULER_LEND: [
			makeMerklOpportunity({
				type: "EULER_LEND",
				identifier: `${vaultAddress}-lend`,
				action: "",
				campaigns: [
					makeMerklCampaign({
						campaignId: "split-lend-1",
						type: "EULER_LEND",
						subType: null,
						apr: 2,
						params: {
							evkAddress: vaultAddress,
						},
					}),
				],
			}),
		],
		EULER_BORROW: [
			makeMerklOpportunity({
				type: "EULER_BORROW",
				identifier: `${vaultAddress}-borrow`,
				action: "",
				campaigns: [
					makeMerklCampaign({
						campaignId: "split-borrow-1",
						type: "EULER_BORROW",
						subType: null,
						apr: 3,
						params: {
							evkAddress: vaultAddress,
						},
					}),
				],
			}),
		],
	});

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 2);
	assert.deepEqual(
		info?.campaigns.map((campaign) => campaign.action).sort(),
		["BORROW", "LEND"],
	);
	assert.deepEqual(
		info?.campaigns.map((campaign) => campaign.apr).sort(),
		[0.02, 0.03],
	);
	assert.ok(
		info?.campaigns.every((campaign) =>
			campaign.sourceUrl?.includes(`EULER_${campaign.action}`),
		),
	);
});

test("rewards service uses only selected adapter for user rewards", async () => {
	const primary: IRewardsAdapter = {
		...emptyAdapter,
		async fetchUserRewards() {
			return [
				makeBrevisReward({
					tokenPrice: 3,
					claimAddress: undefined,
					proof: undefined,
					cumulativeAmounts: undefined,
					epoch: undefined,
				}),
			];
		},
	};
	const service = new RewardsService(primary, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	const rewards = await service.fetchUserRewards(1, zeroAddress);

	assert.equal(rewards.length, 1);
	assert.equal(rewards[0]?.provider, "brevis");
	assert.equal(rewards[0]?.tokenPrice, 3);
	assert.equal(rewards[0]?.claimAddress, undefined);

	await assert.rejects(
		() =>
			service.buildClaimPlan({
				reward: rewards[0]!,
				account: zeroAddress,
			}),
		/Missing Brevis claim data/,
	);
});

test("rewards service does not add Brevis rewards outside the selected adapter", async () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	const rewards = await service.fetchUserRewards(1, zeroAddress);

	assert.equal(rewards.length, 0);
});

test("rewards service rejects Brevis rewards without verified claim address", async () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	await assert.rejects(
		() =>
			service.buildClaimPlan({
				reward: makeBrevisReward({
					claimAddress,
					proof: [proofHash],
					cumulativeAmounts: ["1000"],
					epoch: "7",
				}),
				account: accountAddress,
			}),
		/Unverified Brevis claim data/,
	);
});

test("V3 rewards adapter delegates Brevis claim verification to direct adapter", async () => {
	const directAdapter = new RewardsDirectAdapter();
	directAdapter.setQueryBrevisCampaigns(async () => ({
		campaigns: [
			{
				chain_id: 1,
				vault_address: vaultAddress,
				action: 2002,
				campaign_id: "brevis-1",
				campaign_name: "Brevis",
				start_time: 1,
				end_time: 2,
				reward_info: {
					token_address: rewardToken,
					token_symbol: "EUL",
					apr: 0.01,
					rewardUsdPrice: 1,
					claim_chain_id: 1,
					claim_contract: claimAddress,
				},
				status: 4,
			},
		],
	}));
	directAdapter.setQueryBrevisUserProofs(async () => ({
		err: null,
		rewardsBatch: [
			{
				campaignId: "brevis-1",
				claimChainId: 1,
				claimContractAddr: claimAddress,
				claimableRewards: "1000",
				epoch: "7",
				cumulativeRewards: ["1000"],
				merkleProof: [proofHash],
			},
		],
	}));
	const v3Adapter = new RewardsV3Adapter(
		{ endpoint: "https://example.invalid" },
		undefined,
		directAdapter,
	);
	const service = new RewardsService(v3Adapter, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	const plan = await service.buildClaimPlan({
		reward: makeBrevisReward({
			campaignId: "brevis-1",
			claimAddress,
			proof: [proofHash],
			cumulativeAmounts: ["1000"],
			epoch: "7",
		}),
		account: accountAddress,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") throw new Error("expected evcBatch");
	const operation = plan[0].items[0];
	assert.equal(operation?.type, "operation");
	if (!operation || !("items" in operation)) throw new Error("expected operation");
	assert.equal(operation.items.length, 1);
	assert.equal(operation.items[0]?.targetContract, claimAddress);
	const decoded = decodeFunctionData({
		abi: BREVIS_CLAIM_ABI,
		data: operation.items[0]!.data,
	});
	assert.equal(decoded.functionName, "claim");
});

test("direct rewards adapter verifies Brevis claim target against campaign metadata", async () => {
	const adapter = new RewardsDirectAdapter();
	let campaignsBody: unknown;
	adapter.setQueryBrevisCampaigns(async (_url, body) => {
		campaignsBody = body;
		return {
			campaigns: [
				{
					chain_id: 1,
					vault_address: vaultAddress,
					action: 2002,
					campaign_id: "brevis-1",
					campaign_name: "Brevis",
					start_time: 1,
					end_time: 2,
					reward_info: {
						token_address: rewardToken,
						token_symbol: "EUL",
						apr: 0.01,
						rewardUsdPrice: 1,
						claim_chain_id: 1,
						claim_contract: claimAddress,
					},
					status: 4,
				},
			],
		};
	});
	adapter.setQueryBrevisUserProofs(async () => ({
		err: null,
		rewardsBatch: [
			{
				campaignId: "brevis-1",
				claimChainId: 1,
				claimContractAddr: claimAddress,
				claimableRewards: "1000",
				epoch: "7",
				cumulativeRewards: ["1000"],
				merkleProof: [proofHash],
			},
		],
	}));

	const rewards = await adapter.fetchBrevisUserRewardClaims(1, accountAddress);

	assert.equal(rewards.length, 1);
	assert.equal(rewards[0]?.claimAddress, claimAddress);
	assert.deepEqual(campaignsBody, {
		chain_id: [1],
		user_address: [accountAddress],
		status: [3, 4],
	});
});

test("direct rewards adapter drops Brevis proofs with mismatched claim target", async () => {
	const adapter = new RewardsDirectAdapter();
	adapter.setQueryBrevisCampaigns(async () => ({
		campaigns: [
			{
				chain_id: 1,
				vault_address: vaultAddress,
				action: 2002,
				campaign_id: "brevis-1",
				campaign_name: "Brevis",
				start_time: 1,
				end_time: 2,
				reward_info: {
					token_address: rewardToken,
					token_symbol: "EUL",
					apr: 0.01,
					rewardUsdPrice: 1,
					claim_chain_id: 1,
					claim_contract: claimAddress,
				},
				status: 4,
			},
		],
	}));
	adapter.setQueryBrevisUserProofs(async () => ({
		err: null,
		rewardsBatch: [
			{
				campaignId: "brevis-1",
				claimChainId: 1,
				claimContractAddr: otherAccountAddress,
				claimableRewards: "1000",
				epoch: "7",
				cumulativeRewards: ["1000"],
				merkleProof: [proofHash],
			},
		],
	}));

	const rewards = await adapter.fetchBrevisUserRewardClaims(1, accountAddress);

	assert.equal(rewards.length, 0);
});

test("rewards service uses only selected adapter for APY campaigns", async () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	const rewards = await service.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info, undefined);
});

test("direct rewards adapter maps Fuul lend and looping incentives", async () => {
	const adapter = new RewardsDirectAdapter();
	adapter.setQueryFuulIncentives(async (url) => {
		if (url.includes("euler-looping")) {
			return [
				{
					conversion: "",
					project: "EUL",
					protocol: "euler-looping",
					chain_id: 1,
					pool: {
						name: "EUL",
						token0_symbol: "EUL",
						token0_address: rewardToken,
					},
					trigger: {
						type: "looping",
						context: {
							chain_id: 1,
							borrowVault: vaultAddress,
							depositVault: otherRewardToken,
							min_leverage: 2,
							max_leverage: 5,
						},
					},
					apr: 0.04,
					tvl: 0,
					refreshed_at: "",
				},
			];
		}

		return [
			{
				conversion: "",
				project: "EUL",
				protocol: "euler",
				chain_id: 1,
				pool: {
					name: "EUL",
					token0_symbol: "EUL",
					token0_address: rewardToken,
				},
				trigger: {
					type: "lend",
					context: {
						chain_id: 1,
						token_address: vaultAddress,
					},
				},
				apr: 0.03,
				tvl: 0,
				refreshed_at: "",
			},
		];
	});

	const rewards = await adapter.fetchChainRewards(1);
	const info = rewards.get(vaultAddress.toLowerCase());

	assert.equal(info?.campaigns.length, 2);
	assert.equal(info?.campaigns[0]?.action, "LEND");
	assert.equal(info?.campaigns[0]?.apr, 0.03);
	assert.equal(info?.campaigns[1]?.action, "LOOPING");
	assert.equal(info?.campaigns[1]?.apr, 0.04);
	assert.equal(info?.campaigns[1]?.collateralAddress, otherRewardToken);
	assert.equal(info?.campaigns[1]?.minMultiplier, 2);
	assert.equal(info?.campaigns[1]?.maxMultiplier, 5);
});

test("rewards service derives Merkl claim target from trusted distributor", async () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	const plan = await service.buildClaimPlans({
		rewards: [makeMerklReward({ claimAddress: undefined })],
		account: accountAddress,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") throw new Error("expected evcBatch");
	const operation = plan[0].items[0];
	assert.equal(operation?.type, "operation");
	if (!operation || !("items" in operation)) throw new Error("expected operation");
	assert.equal(operation.items[0]?.targetContract, merklDistributorAddress);
});

test("rewards service can build EVC batch items for claim providers", async () => {
	const brevisReward = makeBrevisReward({
		campaignId: "brevis-1",
		claimAddress,
		cumulativeAmounts: ["1000"],
		epoch: "7",
		proof: [proofHash],
	});
	const adapter = {
		...emptyAdapter,
		async fetchBrevisUserRewardClaims() {
			return [brevisReward];
		},
		async fetchFuulClaimChecks() {
			return [makeFuulClaimCheck()];
		},
		async fetchFuulTotals() {
			return {
				claimed: [],
				unclaimed: [
					{
						currency: rewardToken,
						currency_type: 0,
						amount: "1000",
						chain_id: 1,
					},
				],
			};
		},
	} satisfies IRewardsAdapter & {
		fetchBrevisUserRewardClaims: (
			chainId: number,
			address: Address,
		) => Promise<UserReward[]>;
	};
	const service = new RewardsService(adapter, {
		merklDistributorAddress,
		fuulManagerAddress: otherAccountAddress,
		fuulFactoryAddress: fuulProjectAddress,
	});
	service.setProviderService({
		getProvider() {
			return {
				async readContract() {
					return { nativeUserClaimFee: 123n };
				},
			};
		},
	} as any);

	const plan = await service.buildClaimPlans({
		rewards: [
			makeMerklReward({ claimAddress: undefined }),
			brevisReward,
			makeFuulReward(),
		],
		account: accountAddress,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") throw new Error("expected evcBatch");
	const operation = plan[0].items[0];
	assert.equal(operation?.type, "operation");
	if (!operation || !("items" in operation)) {
		throw new Error("expected operation");
	}
	assert.equal(operation.name, "Claim rewards");
	assert.equal(operation.items.length, 3);
	assert.deepEqual(operation.walletBalanceTokens, [rewardToken]);

	const [merklItem, brevisItem, fuulItem] = operation.items;
	assert.equal(merklItem?.targetContract, merklDistributorAddress);
	assert.equal(merklItem?.onBehalfOfAccount, accountAddress);
	assert.equal(merklItem?.value, 0n);
	const merklDecoded = decodeFunctionData({
		abi: MERKL_CLAIM_ABI,
		data: merklItem!.data,
	});
	assert.equal(merklDecoded.functionName, "claim");
	assert.deepEqual(merklDecoded.args[0], [accountAddress]);
	assert.deepEqual(merklDecoded.args[1], [rewardToken]);

	assert.equal(brevisItem?.targetContract, claimAddress);
	assert.equal(brevisItem?.onBehalfOfAccount, accountAddress);
	assert.equal(brevisItem?.value, 0n);
	const brevisDecoded = decodeFunctionData({
		abi: BREVIS_CLAIM_ABI,
		data: brevisItem!.data,
	});
	assert.equal(brevisDecoded.functionName, "claim");
	assert.deepEqual(brevisDecoded.args, [
		accountAddress,
		[1000n],
		7n,
		[proofHash],
	]);

	assert.equal(fuulItem?.targetContract, otherAccountAddress);
	assert.equal(fuulItem?.onBehalfOfAccount, accountAddress);
	assert.equal(fuulItem?.value, 123n);
	const fuulDecoded = decodeFunctionData({
		abi: FUUL_MANAGER_ABI,
		data: fuulItem!.data,
	});
	assert.equal(fuulDecoded.functionName, "claim");
	assert.equal(fuulDecoded.args[0][0].to, accountAddress);
});

test("rewards service fetches claimable reward streams from account lens", async () => {
	const service = makeRewardsService();
	const calls: Array<{
		accountLensAddress: Address;
		account: Address;
		vault: Address;
	}> = [];
	service.setQueryVaultAccountInfo(
		async (_provider, queriedAccountLensAddress, account, vault) => {
			calls.push({ accountLensAddress: queriedAccountLensAddress, account, vault });
			return {
				account,
				vault,
				enabledRewardsInfo: [
					{
						reward: rewardToken,
						earnedReward: 100n,
						earnedRewardRecentIgnored: 75n,
					},
					{
						reward: otherRewardToken,
						earnedReward: 0n,
						earnedRewardRecentIgnored: 0n,
					},
				],
			} as any;
		},
	);

	const rewardStreams = await service.fetchRewardStreams({
		chainId: 1,
		positions: [
			{ account: accountAddress, vault: vaultAddress },
			{ account: accountAddress, vault: vaultAddress },
		],
	});

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], {
		accountLensAddress,
		account: accountAddress,
		vault: vaultAddress,
	});
	assert.deepEqual(rewardStreams, [
		{
			account: accountAddress,
			vault: vaultAddress,
			reward: rewardToken,
			earnedReward: 100n,
			earnedRewardRecentIgnored: 75n,
		},
	]);
});

test("rewards service builds reward stream claims as an EVC batch", () => {
	const service = makeRewardsService();

	const plan = service.buildRewardStreamClaimPlan({
		chainId: 1,
		recipient: otherAccountAddress,
		rewardStreams: [
			{
				account: accountAddress,
				vault: vaultAddress,
				reward: rewardToken,
				earnedReward: 100n,
				earnedRewardRecentIgnored: 100n,
			},
			{
				account: accountAddress,
				vault: secondVaultAddress,
				reward: otherRewardToken,
				earnedReward: 50n,
				earnedRewardRecentIgnored: 25n,
			},
			{
				account: accountAddress,
				vault: secondVaultAddress,
				reward: rewardToken,
				earnedReward: 0n,
				earnedRewardRecentIgnored: 0n,
			},
		],
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") throw new Error("expected evcBatch");
	const operation = plan[0].items[0];
	assert.equal(operation?.type, "operation");
	if (!operation || !("items" in operation)) {
		throw new Error("expected operation");
	}
	assert.equal(operation.name, "Claim rewards");
	assert.equal(operation.items.length, 2);
	const [firstItem, secondItem] = operation.items;
	assert.equal(firstItem?.targetContract, rewardStreamsAddress);
	assert.equal(firstItem?.onBehalfOfAccount, accountAddress);
	assert.equal(firstItem?.value, 0n);
	const firstDecoded = decodeFunctionData({
		abi: REWARD_STREAMS_ABI,
		data: firstItem!.data,
	});
	assert.deepEqual(firstDecoded.args, [
		vaultAddress,
		rewardToken,
		otherAccountAddress,
		true,
	]);

	assert.equal(secondItem?.targetContract, rewardStreamsAddress);
	assert.equal(secondItem?.onBehalfOfAccount, accountAddress);
	assert.equal(secondItem?.value, 0n);
	const secondDecoded = decodeFunctionData({
		abi: REWARD_STREAMS_ABI,
		data: secondItem!.data,
	});
	assert.deepEqual(secondDecoded.args, [
		secondVaultAddress,
		otherRewardToken,
		otherAccountAddress,
		false,
	]);
});

test("rewards service rejects Merkl rewards with untrusted claim address", async () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	await assert.rejects(
		() =>
			service.buildClaimPlans({
				rewards: [makeMerklReward({ claimAddress })],
				account: accountAddress,
			}),
		/Merkl claim address mismatch/,
	);
});

test("rewards service uses chain-specific Merkl distributor overrides", async () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	const plan = await service.buildClaimPlans({
		rewards: [
			makeMerklReward({
				chainId: 324,
				claimAddress: zksyncMerklDistributorAddress,
			}),
		],
		account: accountAddress,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") throw new Error("expected evcBatch");
	const operation = plan[0].items[0];
	assert.equal(operation?.type, "operation");
	if (!operation || !("items" in operation)) throw new Error("expected operation");
	assert.equal(operation.items[0]?.targetContract, zksyncMerklDistributorAddress);
});

test("rewards service rejects default Merkl distributor on unknown chains", async () => {
	const service = new RewardsService(emptyAdapter, {
		merklDistributorAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	await assert.rejects(
		() =>
			service.buildClaimPlans({
				rewards: [
					makeMerklReward({
						chainId: 999_999_999,
						claimAddress: merklDistributorAddress,
					}),
				],
				account: accountAddress,
			}),
		/No trusted Merkl distributor for chainId 999999999/,
	);
});

test("direct rewards adapter filters Fuul claim checks for another recipient", async () => {
	const adapter = new RewardsDirectAdapter({
		fuulClaimChecksUrl: "https://example.invalid/fuul-claim-checks",
	});
	adapter.setQueryFuulClaimChecks(async () => [
		makeFuulClaimCheck(),
		makeFuulClaimCheck({ to: otherAccountAddress }),
		makeFuulClaimCheck({ currency: "not-an-address" }),
	]);

	const claimChecks = await adapter.fetchFuulClaimChecks(accountAddress);

	assert.equal(claimChecks.length, 1);
	assert.equal(claimChecks[0]?.to, accountAddress);
	assert.equal(claimChecks[0]?.project_address, fuulProjectAddress);
	assert.equal(claimChecks[0]?.currency, rewardToken);
});

test("V3 rewards adapter delegates Fuul claim data to direct adapter", async () => {
	const directAdapter = new RewardsDirectAdapter({
		fuulTotalsUrl: "https://example.invalid/fuul-totals",
		fuulClaimChecksUrl: "https://example.invalid/fuul-claim-checks",
	});
	directAdapter.setQueryFuulTotals(async () => ({
		claimed: [],
		unclaimed: [
			{
				currency: rewardToken,
				currency_type: 0,
				amount: "1000",
				chain_id: 1,
			},
		],
	}));
	directAdapter.setQueryFuulClaimChecks(async () => [makeFuulClaimCheck()]);
	const v3Adapter = new RewardsV3Adapter(
		{ endpoint: "https://example.invalid" },
		undefined,
		directAdapter,
	);
	const service = new RewardsService(v3Adapter, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: claimAddress,
		fuulFactoryAddress: fuulProjectAddress,
	});
	service.setProviderService({
		getProvider() {
			return {
				async readContract() {
					return { nativeUserClaimFee: 123n };
				},
			};
		},
	} as any);

	const plan = await service.buildClaimPlans({
		rewards: [makeFuulReward()],
		account: accountAddress,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") throw new Error("expected evcBatch");
	const operation = plan[0].items[0];
	assert.equal(operation?.type, "operation");
	if (!operation || !("items" in operation)) throw new Error("expected operation");
	assert.equal(operation.items[0]?.targetContract, claimAddress);
	assert.equal(operation.items[0]?.value, 123n);
	const decoded = decodeFunctionData({
		abi: FUUL_MANAGER_ABI,
		data: operation.items[0]!.data,
	});
	assert.equal(decoded.functionName, "claim");
});

test("rewards service rejects Fuul claim checks whose recipient differs from the account", async () => {
	const adapter: IRewardsAdapter = {
		...emptyAdapter,
		async fetchFuulClaimChecks() {
			return [makeFuulClaimCheck({ to: otherAccountAddress })];
		},
		async fetchFuulTotals() {
			return {
				claimed: [],
				unclaimed: [
					{
						currency: rewardToken,
						currency_type: 0,
						amount: "1000",
						chain_id: 1,
					},
				],
			};
		},
	};
	const service = new RewardsService(adapter, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	await assert.rejects(
		() =>
			service.buildClaimPlans({
				rewards: [makeFuulReward()],
				account: accountAddress,
			}),
		/Fuul claim check recipient mismatch/,
	);
});

test("rewards service rejects Fuul claim checks outside chain unclaimed metadata", async () => {
	const adapter: IRewardsAdapter = {
		...emptyAdapter,
		async fetchFuulClaimChecks() {
			return [makeFuulClaimCheck({ currency: otherRewardToken })];
		},
		async fetchFuulTotals() {
			return {
				claimed: [],
				unclaimed: [
					{
						currency: rewardToken,
						currency_type: 0,
						amount: "1000",
						chain_id: 1,
					},
				],
			};
		},
	};
	const service = new RewardsService(adapter, {
		merklDistributorAddress: zeroAddress,
		fuulManagerAddress: zeroAddress,
		fuulFactoryAddress: zeroAddress,
	});

	await assert.rejects(
		() =>
			service.buildClaimPlans({
				rewards: [makeFuulReward()],
				account: accountAddress,
			}),
		/Fuul claim check currency does not match unclaimed rewards/,
	);
});
