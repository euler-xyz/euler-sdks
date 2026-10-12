import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, zeroAddress } from "viem";

import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import { RewardsDirectAdapter } from "../src/services/rewardsService/adapters/rewardsDirectAdapter/index.js";
import { normalizeBrevisCampaign } from "../src/services/rewardsService/adapters/rewardsDirectAdapter/brevisCampaign.js";
import { withDirectSources } from "../src/services/rewardsService/adapters/rewardsV3Adapter/withDirectSources.js";
import type {
	FuulIncentive,
	IRewardsAdapter,
	RewardCampaign,
	UserReward,
} from "../src/services/rewardsService/index.js";
import { VaultRewardInfo } from "../src/services/rewardsService/vaultRewardInfo.js";

const brevisVault = getAddress("0x7fAb04FF2717d9A6B71A51c56c29697179597D40");
const fuulVault = getAddress("0xc72f073a311e037d4bc909fedae94de38494ee5b");
const merklVault = getAddress("0x1111111111111111111111111111111111111111");
const claimContract = getAddress("0x3d442a3e2c40230806d94465c4ebad2bc225d0e0");
const account = getAddress("0x2222222222222222222222222222222222222222");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Brevis `sdk/v1/eulerCampaigns` answer, shape as of 2026-10-11 (an ended campaign, re-dated). */
const brevisCamelCaseCampaign = () => ({
	chainId: "1",
	vaultAddress: brevisVault,
	action: "EULER_LEND",
	campaignId: "1773896796",
	campaignName: "Supply USDC - ynRWAx/USDC Euler market",
	startTime: String(Math.floor(Date.now() / 1000) - 86_400),
	endTime: String(Math.floor(Date.now() / 1000) + 86_400),
	rewardInfo: {
		submissionChainId: "10",
		submissionContract: "0x03a53ba173c577809f31296423adaec759d0d27b",
		claimChainId: "1",
		claimContract: claimContract.toLowerCase(),
		tokenAddress: "0x01ba69727e2860b37bc1a2bd56999c1afb4c15d8",
		tokenSymbol: "ynRWAx",
		rewardAmt: "2000000000000000000000",
		rewardUsdPrice: "0.672458",
		rewardPerHour: "5952380952380952380",
		tvl: 1198634,
		apr: 0.0292532,
	},
	lastRewardAttestationTime: "1775167405",
	status: "ACTIVE",
});

/** Fuul `incentives?protocol=euler` answer on Base, shape as of 2026-10-11. */
const fuulEulerVaultIncentive = (refreshedAt: string): FuulIncentive =>
	({
		project: "Alpha Growth",
		protocol: "euler",
		chain_id: 8453,
		apr: 0.03271669792275503,
		tvl: 11155.16,
		refreshed_at: refreshedAt,
		pool: {
			name: fuulVault.toLowerCase(),
			token0_symbol: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			token0_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			token1_symbol: null,
			token1_address: null,
		},
		trigger: {
			type: "euler-vaults",
			context: {
				vault: fuulVault.toLowerCase(),
				chain_id: 8453,
				underlying_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			},
		},
		conversion: "Deposit into AlphaGrowth Earn USDC vault on Euler",
	}) as unknown as FuulIncentive;

const directOnly = (
	config: ConstructorParameters<typeof RewardsDirectAdapter>[0],
) =>
	new RewardsDirectAdapter({
		enableMerkl: false,
		enableBrevis: false,
		enableFuul: false,
		enableTurtle: false,
		...config,
	});

const campaign = (
	source: RewardCampaign["source"],
	campaignId: string,
): RewardCampaign =>
	({
		campaignId,
		source,
		action: "LEND",
		apr: 0.01,
		endTimestamp: 0,
	}) as RewardCampaign;

const reward = (provider: UserReward["provider"]): UserReward =>
	({ provider, chainId: 1, campaignId: provider }) as UserReward;

const v3Adapter = (
	chainRewards: Map<string, VaultRewardInfo>,
	userRewards: UserReward[] = [],
): IRewardsAdapter & { claimsChecked: () => string } => ({
	fetchChainRewards: async () => chainRewards,
	fetchVaultRewards: async (_chainId, vault) =>
		chainRewards.get(vault.toLowerCase()),
	fetchUserRewards: async () => userRewards,
	fetchFuulTotals: async () => ({ claimed: [], unclaimed: [] }),
	fetchFuulClaimChecks: async () => [],
	claimsChecked: () => "v3",
});

test("Brevis campaigns are read in the camelCase shape Brevis answers with today", () => {
	const campaign = normalizeBrevisCampaign(brevisCamelCaseCampaign());

	assert.equal(campaign?.campaign_id, "1773896796");
	assert.equal(campaign?.vault_address, brevisVault);
	assert.equal(campaign?.action, 2002);
	assert.equal(campaign?.chain_id, 1);
	assert.equal(campaign?.reward_info.apr, 0.0292532);
	assert.equal(campaign?.reward_info.claim_chain_id, 1);
	assert.equal(campaign?.reward_info.rewardUsdPrice, 0.672458);
});

test("a Brevis campaign without a vault is left out instead of failing the read", async () => {
	const adapter = directOnly({ enableBrevis: true });
	adapter.setQueryBrevisCampaigns(async () => ({
		campaigns: [
			{ ...brevisCamelCaseCampaign(), vaultAddress: undefined },
			brevisCamelCaseCampaign(),
		],
	}));

	const rewards = await adapter.fetchChainRewards(1);

	assert.deepEqual([...rewards.keys()], [brevisVault.toLowerCase()]);
	assert.equal(rewards.get(brevisVault.toLowerCase())?.campaigns[0]?.source, "brevis");
});

test("an account's Brevis rewards match camelCase campaigns to their proofs", async () => {
	const adapter = directOnly({ enableBrevis: true });
	adapter.setQueryBrevisCampaigns(async () => ({
		campaigns: [brevisCamelCaseCampaign()],
	}));
	adapter.setQueryBrevisUserProofs(async () => ({
		err: null,
		rewardsBatch: [
			{
				campaignId: "1773896796",
				claimChainId: 1,
				claimContractAddr: claimContract,
				claimableRewards: "1000",
				epoch: "7",
				cumulativeRewards: ["1000"],
				merkleProof: [`0x${"11".repeat(32)}`],
			},
		],
	}));

	const rewards = await adapter.fetchBrevisUserRewardClaims(1, account);

	assert.equal(rewards.length, 1);
	assert.equal(rewards[0]?.claimAddress, claimContract);
});

test("a Fuul incentive names its vault in the euler-vaults trigger", async () => {
	const adapter = directOnly({ enableFuul: true });
	adapter.setQueryFuulIncentives(async (url) =>
		url.includes("protocol=euler&")
			? [fuulEulerVaultIncentive(new Date().toISOString())]
			: [],
	);

	const info = (await adapter.fetchChainRewards(8453)).get(
		fuulVault.toLowerCase(),
	);

	assert.equal(info?.campaigns.length, 1);
	assert.equal(info?.campaigns[0]?.source, "fuul");
	assert.equal(info?.campaigns[0]?.apr, 0.03271669792275503);
});

test("a Fuul incentive not refreshed for more than 7 days is left out", async () => {
	const adapter = directOnly({ enableFuul: true });
	adapter.setQueryFuulIncentives(async (url) =>
		url.includes("protocol=euler&")
			? [
					fuulEulerVaultIncentive("2026-08-20T21:01:34.890Z"),
					fuulEulerVaultIncentive(new Date(Date.now() - 8 * DAY_MS).toISOString()),
				]
			: [],
	);

	assert.equal((await adapter.fetchChainRewards(8453)).size, 0);
});

test("V3 vault rewards gain the Brevis and Fuul campaigns V3 does not serve", async () => {
	const v3 = v3Adapter(
		new Map([
			[
				brevisVault.toLowerCase(),
				new VaultRewardInfo({ campaigns: [campaign("merkl", "merkl-1")] }),
			],
		]),
	);
	const direct = {
		fetchSourceChainRewards: async (_chainId: number, sources: readonly string[]) => {
			assert.deepEqual(sources, ["brevis", "fuul"]);
			return new Map([
				[
					brevisVault.toLowerCase(),
					new VaultRewardInfo({ campaigns: [campaign("brevis", "b-1")] }),
				],
				[
					fuulVault.toLowerCase(),
					new VaultRewardInfo({ campaigns: [campaign("fuul", "f-1")] }),
				],
			]);
		},
		fetchSourceUserRewards: async () => [],
	};

	const rewards = await withDirectSources(v3, direct).fetchChainRewards(1);

	assert.deepEqual(
		rewards.get(brevisVault.toLowerCase())?.campaigns.map((c) => c.campaignId),
		["merkl-1", "b-1"],
	);
	assert.deepEqual(
		rewards.get(fuulVault.toLowerCase())?.campaigns.map((c) => c.campaignId),
		["f-1"],
	);
	const vault = await withDirectSources(v3, direct).fetchVaultRewards(1, brevisVault);
	assert.deepEqual(
		vault?.campaigns.map((c) => c.campaignId),
		["merkl-1", "b-1"],
	);
});

test("a source V3 already answers for is not read twice", async () => {
	const v3 = v3Adapter(
		new Map([
			[
				merklVault.toLowerCase(),
				new VaultRewardInfo({ campaigns: [campaign("brevis", "v3-brevis")] }),
			],
		]),
		[reward("fuul")],
	);
	const direct = {
		fetchSourceChainRewards: async () =>
			new Map([
				[
					brevisVault.toLowerCase(),
					new VaultRewardInfo({ campaigns: [campaign("brevis", "b-1")] }),
				],
			]),
		fetchSourceUserRewards: async () => [reward("fuul"), reward("brevis")],
	};
	const adapter = withDirectSources(v3, direct);

	assert.deepEqual([...(await adapter.fetchChainRewards(1)).keys()], [
		merklVault.toLowerCase(),
	]);
	assert.deepEqual(
		(await adapter.fetchUserRewards(1, account)).map((r) => r.provider),
		["fuul", "brevis"],
	);
});

test("a failed direct read leaves V3's answer, and a failed V3 read still fails", async () => {
	const v3Rewards = new Map([
		[
			merklVault.toLowerCase(),
			new VaultRewardInfo({ campaigns: [campaign("merkl", "merkl-1")] }),
		],
	]);
	const failing = {
		fetchSourceChainRewards: async () => {
			throw new Error("brevis down");
		},
		fetchSourceUserRewards: async () => {
			throw new Error("fuul down");
		},
	};

	const adapter = withDirectSources(v3Adapter(v3Rewards, [reward("merkl")]), failing);
	assert.deepEqual([...(await adapter.fetchChainRewards(1)).keys()], [
		merklVault.toLowerCase(),
	]);
	assert.equal((await adapter.fetchUserRewards(1, account)).length, 1);

	const brokenV3 = {
		...v3Adapter(v3Rewards),
		fetchChainRewards: async () => {
			throw new Error("v3 down");
		},
	};
	await assert.rejects(
		withDirectSources(brokenV3, failing).fetchChainRewards(1),
		/v3 down/,
	);
});

test("the wrapped V3 adapter keeps its other methods", () => {
	const adapter = withDirectSources(v3Adapter(new Map()), {
		fetchSourceChainRewards: async () => new Map(),
		fetchSourceUserRewards: async () => [],
	});

	assert.equal(adapter.claimsChecked(), "v3");
});

for (const mode of ["v3", "fallback"] as const) {
	test(`the SDK in ${mode} mode shows a Brevis campaign beside V3's rewards`, async () => {
		const sdk = await buildEulerSDK({
			config: {
				rewardsServiceAdapter: mode,
				rewardsV3ApiUrl: "https://example.invalid",
			},
			rewardsServiceConfig: {
				enableMerkl: false,
				enableFuul: false,
				enableTurtle: false,
			},
			buildQuery(queryName, fn) {
				if (queryName === "queryV3RewardsApyPage") {
					return (async () => ({
						data: [
							{
								vault: merklVault,
								provider: "merkl",
								campaignType: "EULER_LEND",
								id: "merkl-1",
								apr: 2,
								rewardToken: { address: zeroAddress, symbol: "EUL" },
							},
						],
					})) as typeof fn;
				}
				if (queryName === "queryBrevisCampaigns") {
					return (async () => ({
						campaigns: [brevisCamelCaseCampaign()],
					})) as typeof fn;
				}
				return fn;
			},
		});

		const rewards = await sdk.rewardsService.fetchChainRewards(1);

		assert.equal(rewards.get(merklVault.toLowerCase())?.campaigns[0]?.source, "merkl");
		assert.equal(
			rewards.get(brevisVault.toLowerCase())?.campaigns[0]?.source,
			"brevis",
		);
	});
}

test("the SDK reads no Brevis or Fuul beside V3 when both are switched off", async () => {
	const calls: string[] = [];
	const sdk = await buildEulerSDK({
		config: {
			rewardsServiceAdapter: "v3",
			rewardsV3ApiUrl: "https://example.invalid",
		},
		rewardsServiceConfig: {
			enableMerkl: false,
			enableBrevis: false,
			enableFuul: false,
			enableTurtle: false,
		},
		buildQuery(queryName, fn) {
			if (queryName === "queryV3RewardsApyPage") {
				return (async () => ({ data: [] })) as typeof fn;
			}
			if (queryName === "queryBrevisCampaigns" || queryName === "queryFuulIncentives") {
				return (async (...args: unknown[]) => {
					calls.push(queryName);
					return (fn as (...a: unknown[]) => unknown)(...args);
				}) as typeof fn;
			}
			return fn;
		},
	});

	await sdk.rewardsService.fetchChainRewards(1);

	assert.deepEqual(calls, []);
});

