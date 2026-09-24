import assert from "node:assert/strict";
import { test } from "vitest";
import { type Address, getAddress } from "viem";
import { RewardsDirectAdapter } from "../src/services/rewardsService/adapters/rewardsDirectAdapter/index.js";
import { RewardsService } from "../src/services/rewardsService/rewardsService.js";
import { IntrinsicApyV3Adapter } from "../src/services/intrinsicApyService/adapters/intrinsicApyV3Adapter/index.js";
import { RewardsV3Adapter } from "../src/services/rewardsService/adapters/rewardsV3Adapter/index.js";

const address = (id: number) =>
	getAddress(`0x${id.toString(16).padStart(40, "0")}`);
const account = address(1);
const token = address(2);
const defaultDistributor = getAddress(
	"0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
);

test("direct Merkl rewards are claimable through the service on chains with distributor overrides", async () => {
	for (const [chainId, expected] of [
		[1, defaultDistributor],
		[50, getAddress("0xDd8098dA94cF3aEA5253545162F1Feb371278F5a")],
		[324, getAddress("0xe117ed7Ef16d3c28fCBA7eC49AFAD77f451a6a21")],
	] as const) {
		for (const configured of [defaultDistributor, address(99)]) {
			const adapter = new RewardsDirectAdapter({
				enableBrevis: false,
				enableFuul: false,
				enableTurtle: false,
				merklDistributorAddress: configured,
			});
			adapter.setQueryMerklUserRewards(async () => [
				{
					chainId,
					rewards: [
						{
							token: {
								address: token,
								chainId,
								symbol: "TOKEN",
								name: "Token",
								decimals: 6,
								price: 1,
							},
							amount: "1000000",
							claimed: "0",
							proofs: [`0x${"01".repeat(32)}`],
						},
					],
				},
			]);
			const service = new RewardsService(adapter, {
				merklDistributorAddress: configured,
				fuulManagerAddress: address(3),
				fuulFactoryAddress: address(4),
			});
			const rewards = await service.fetchUserRewards(chainId, account);
			const plan = await service.buildClaimPlans({ chainId, account, rewards });
			const item = plan[0]!;
			assert.equal(item.type, "evcBatch");
			if (item.type !== "evcBatch") throw new Error("Expected EVC batch");
			const operation = item.items[0]!;
			assert.equal(operation.type, "operation");
			if (operation.type !== "operation") throw new Error("Expected operation");
			const target = configured === defaultDistributor ? expected : configured;
			assert.equal(rewards[0]!.claimAddress, target);
			assert.equal(operation.items[0]!.targetContract, target);
		}
	}
});

test("intrinsic APY pages honor the endpoint cap for configured page and asset batch sizes", async () => {
	for (const filtered of [false, true]) {
		const adapter = new IntrinsicApyV3Adapter({
			endpoint: "https://example.invalid",
			pageSize: 200,
			maxAssetsPerRequest: 200,
		});
		const assets = Array.from({ length: 150 }, (_, i) => address(i + 10));
		const requests: Array<{
			offset: number;
			limit: number;
			assets?: Address[];
		}> = [];
		adapter.queryV3IntrinsicApysPage = async (
			_endpoint,
			chainId,
			offset,
			limit,
			requestedAssets,
		) => {
			requests.push({ offset, limit, assets: requestedAssets });
			const source = requestedAssets ?? assets;
			const cap = Math.min(limit, 100);
			return {
				data: source.slice(offset, offset + cap).map((asset) => ({
					chainId,
					address: asset,
					apy: 2,
					provider: "fixture",
				})),
				meta: { total: source.length, offset, limit: cap },
			};
		};
		const result = await adapter.fetchChainIntrinsicApys(
			1,
			filtered ? assets : undefined,
		);
		assert.equal(result.size, 150);
		assert.ok(requests.every(({ limit }) => limit <= 100));
		assert.ok(requests.every(({ assets }) => !assets || assets.length <= 100));
		assert.ok(assets.every((asset) => result.has(asset.toLowerCase())));
	}
});

test("intrinsic APY pagination follows server-clamped page metadata in filtered and full-chain reads", async () => {
	for (const filtered of [false, true]) {
		const adapter = new IntrinsicApyV3Adapter({
			endpoint: "https://example.invalid",
		});
		const assets = Array.from({ length: 45 }, (_, i) => address(i + 10));
		const offsets: number[] = [];
		adapter.queryV3IntrinsicApysPage = async (
			_endpoint,
			chainId,
			offset,
			_limit,
			requestedAssets,
		) => {
			offsets.push(offset);
			const source = requestedAssets ?? assets;
			return {
				data: source.slice(offset, offset + 20).map((asset) => ({
					chainId,
					address: asset,
					apy: 2,
					provider: "fixture",
				})),
				meta: { offset, limit: 20 },
			};
		};
		const result = await adapter.fetchChainIntrinsicApys(
			1,
			filtered ? assets : undefined,
		);
		assert.equal(result.size, 45);
		assert.deepEqual(offsets, [0, 20, 40]);
	}
});

test("unpaginated V3 reward responses with 100 rows complete after one request", async () => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	let calls = 0;
	adapter.setQueryV3RewardsApyPage(async () => {
		calls++;
		if (calls > 1) throw new Error("Repeated an unpaginated endpoint");
		return {
			data: Array.from({ length: 100 }, (_, i) => ({
				vault: address(i + 10),
				campaigns: [
					{
						id: `campaign-${i}`,
						source: "merkl",
						campaignType: "lend",
						apr: 5,
						rewardToken: { address: token, symbol: "TOKEN", decimals: 6 },
					},
				],
			})),
			meta: { timestamp: "2026-09-23T00:00:00Z" },
		};
	});
	assert.equal((await adapter.fetchChainRewards(1)).size, 100);
	assert.equal(calls, 1);
	calls = 0;
	adapter.setQueryV3RewardsBreakdown(async () => ({
		data: [{ campaignId: "campaign-0", rewardToken: token, amount: "1000000" }],
	}));
	const rewards = await adapter.fetchUserRewards(1, account);
	assert.equal(calls, 1);
	assert.equal(rewards[0]!.token.decimals, 6);
});

test("V3 rewards still follow explicit pagination metadata from custom adapters", async () => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	const offsets: number[] = [];
	adapter.setQueryV3RewardsApyPage(async (_chainId, offset) => {
		offsets.push(offset);
		return {
			data: [{ vault: address(offset + 10), campaigns: [] }],
			meta: { hasMore: offset === 0, limit: 1 },
		};
	});
	assert.equal((await adapter.fetchChainRewards(1)).size, 2);
	assert.deepEqual(offsets, [0, 1]);
});

test("direct reward metadata leaves unresolved decimals absent and preserves known scales", async () => {
	const brevis = new RewardsDirectAdapter({
		enableMerkl: false,
		enableFuul: false,
		enableTurtle: false,
	});
	brevis.setQueryBrevisCampaigns(async () => ({
		campaigns: [
			{
				chain_id: 1,
				vault_address: address(10),
				action: 2002,
				campaign_id: "campaign",
				campaign_name: "Fixture",
				start_time: 0,
				end_time: 0,
				status: 3,
				reward_info: {
					token_address: token,
					token_symbol: "TOKEN",
					apr: 0.1,
					rewardUsdPrice: 1,
					claim_chain_id: 1,
					claim_contract: address(3),
				},
			},
		],
	}));
	brevis.setQueryBrevisUserProofs(async () => ({
		rewardsBatch: [
			{
				campaignId: "campaign",
				claimChainId: 1,
				claimContractAddr: address(3),
				claimableRewards: "1000000",
				epoch: "1",
				cumulativeRewards: ["1000000"],
				merkleProof: [`0x${"01".repeat(32)}`],
			},
		],
	}));
	const brevisRewards = await brevis.fetchUserRewards(1, account);
	assert.equal(brevisRewards[0]!.token.decimals, undefined);
	assert.equal(brevisRewards[0]!.unclaimed, "1000000");

	const legacyFuul = new RewardsDirectAdapter({
		enableMerkl: false,
		enableBrevis: false,
		enableTurtle: false,
		fuulTotalsUrl: "https://example.invalid/totals",
	});
	legacyFuul.setQueryFuulTotals(async () => ({
		claimed: [],
		unclaimed: [
			{ currency: token, currency_type: 1, amount: "1000000", chain_id: 1 },
		],
	}));
	const legacyRewards = await legacyFuul.fetchUserRewards(1, account);
	assert.equal(legacyRewards[0]!.token.decimals, undefined);
	assert.equal(legacyRewards[0]!.unclaimed, "1000000");

	for (const decimals of [undefined, 0, 6, 18]) {
		const fuul = new RewardsDirectAdapter({
			enableMerkl: false,
			enableBrevis: false,
			enableTurtle: false,
		});
		fuul.setQueryFuulClaimableRewards(async () => [
			{
				user_address: account,
				currency_address: token,
				currency_chain_id: 1,
				currency_decimals: decimals,
				amount: "1000000",
				project_address: address(4),
				reason: 1,
				token_id: 0,
				deadline: "9999999999",
				proof: `0x${"01".repeat(32)}`,
				signatures: [],
			},
		]);
		const rewards = await fuul.fetchUserRewards(1, account);
		assert.equal(rewards[0]!.token.decimals, decimals);
		assert.equal(rewards[0]!.unclaimed, "1000000");
	}
});
