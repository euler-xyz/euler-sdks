import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, type Address, zeroAddress } from "viem";

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
const farFutureTimestamp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

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
	proof: ["0xabc" as `0x${string}`],
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
	proof: "0xabc",
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
					proof: ["0xabc" as `0x${string}`],
					cumulativeAmounts: ["1000"],
					epoch: "7",
				}),
				account: accountAddress,
			}),
		/Unverified Brevis claim data/,
	);
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
				merkleProof: ["0xabc"],
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
				merkleProof: ["0xabc"],
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
	assert.equal(plan[0]?.type, "contractCall");
	assert.equal(plan[0]?.to, merklDistributorAddress);
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
	assert.equal(plan[0]?.type, "contractCall");
	assert.equal(plan[0]?.chainId, 324);
	assert.equal(plan[0]?.to, zksyncMerklDistributorAddress);
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
