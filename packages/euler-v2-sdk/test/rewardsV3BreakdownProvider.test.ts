import assert from "node:assert/strict";
import { test } from "vitest";
import { type Address, getAddress, type Hex } from "viem";
import { RewardsV3Adapter } from "../src/services/rewardsService/adapters/rewardsV3Adapter/index.js";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";

// Monad rows as /v3/rewards/breakdown returns them once rows carry `provider`; the addresses and
// the MULTILENDBORROW campaign are the live ones of 2026-10-11.
const monad = 143;
const account = getAddress("0x59ABc0e437971d585c2bc4d69DC8B31F2f23E855") as Address;
const wmon = getAddress("0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A") as Address;
const multiMarketCampaign =
	"0x6adb6b13c65f10cd02b113bfbcd669eb9a1d2c4714685081313dd1a6cdd00d97";
const markets = [
	getAddress("0x502e4a0B61dEBA3015Eb9E51116B832003B22c2C"),
	getAddress("0x8c75A7177D64167E6EbC65A1D25d03CbF726fc46"),
	getAddress("0xA5B409b5A930AfC49d016Da10BBfCcc183396Ca2"),
] as Address[];
const marketAmounts = [
	"87562102315823768024606",
	"4115376027937737628423",
	"111019692022384907733218",
];
const turtleStream = "4242c3ea-b6cc-46d5-8592-d072620b51bc";

const breakdownRow = (overrides: Record<string, unknown> = {}) => ({
	chainId: monad,
	vault: markets[0],
	recipient: account,
	rewardToken: wmon as string,
	rewardTokenMetadata: {
		address: wmon as string,
		symbol: "WMON",
		name: "Wrapped MON",
		decimals: 18,
	},
	amount: marketAmounts[0],
	campaignId: multiMarketCampaign,
	provider: "merkl",
	timestamp: "2026-10-11T12:00:00.000Z",
	...overrides,
});

const apyRowWithSuffixedCampaignIds = () =>
	markets.map((vault) => ({
		chainId: monad,
		vault,
		campaigns: [
			{
				id: `${multiMarketCampaign}:${vault.toLowerCase()}`,
				provider: "merkl",
				source: "merkl",
				campaignType: "euler_lend",
				apr: 1.5,
				status: "active",
			},
		],
	}));

const buildAdapter = (
	rows: unknown[],
	apyPage: () => Promise<{ data: unknown[] }>,
): RewardsV3Adapter => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3RewardsBreakdown(async () => ({ data: rows as never }));
	adapter.setQueryV3RewardsApyPage(apyPage as never);
	return adapter;
};

test("V3 rewards adapter keeps Merkl rows of a campaign whose APY ids carry a vault suffix", async () => {
	const rows = markets.map((vault, index) =>
		breakdownRow({ vault, amount: marketAmounts[index] }),
	);
	const adapter = buildAdapter(rows, async () => ({
		data: apyRowWithSuffixedCampaignIds(),
	}));

	const rewards = await adapter.fetchUserRewards(monad, account);

	assert.equal(rewards.length, 3);
	assert.ok(rewards.every((reward) => reward.provider === "merkl"));
	assert.ok(rewards.every((reward) => reward.campaignId === multiMarketCampaign));
	assert.deepEqual(
		rewards.map((reward) => reward.unclaimed),
		marketAmounts,
	);
});

test("V3 rewards adapter keeps a provider-labelled row whose campaign is no longer listed", async () => {
	const adapter = buildAdapter([breakdownRow()], async () => ({ data: [] }));

	const rewards = await adapter.fetchUserRewards(monad, account);

	assert.equal(rewards.length, 1);
	assert.equal(rewards[0]?.provider, "merkl");
	assert.equal(rewards[0]?.token.symbol, "WMON");
	assert.equal(rewards[0]?.token.decimals, 18);
});

test("V3 rewards adapter keeps provider-labelled rows when the campaign lookup fails", async () => {
	const adapter = buildAdapter(
		[breakdownRow(), breakdownRow({ campaignId: turtleStream, provider: "turtle" })],
		async () => {
			throw new Error("rewards APY lookup unavailable");
		},
	);

	const rewards = await adapter.fetchUserRewards(monad, account);

	assert.deepEqual(
		rewards.map((reward) => reward.provider),
		["merkl", "turtle"],
	);
});

test("V3 rewards adapter does not guess a provider for a row that names one it does not know", async () => {
	const adapter = buildAdapter(
		[
			breakdownRow({ campaignId: turtleStream, provider: "another-provider" }),
			breakdownRow({
				campaignId: turtleStream,
				provider: "another-provider",
				source: "merkl",
			}),
		],
		async () => ({
			data: [
				{
					chainId: monad,
					vault: markets[0],
					campaigns: [{ id: turtleStream, provider: "turtle", source: "turtle" }],
				},
			],
		}),
	);

	const rewards = await adapter.fetchUserRewards(monad, account);

	assert.equal(rewards.length, 0);
});

test("V3 rewards adapter still infers the provider for rows from V3 releases without it", async () => {
	const { provider: _merkl, ...merklRowWithoutProvider } = breakdownRow({
		campaignId: "0xlisted",
	});
	const { provider: _turtle, ...turtleRowWithoutProvider } = breakdownRow({
		campaignId: turtleStream,
	});
	const adapter = buildAdapter(
		[merklRowWithoutProvider, turtleRowWithoutProvider],
		async () => ({
			data: [
				{
					chainId: monad,
					vault: markets[0],
					campaigns: [{ id: "0xlisted", provider: "merkl", source: "merkl" }],
				},
			],
		}),
	);

	const rewards = await adapter.fetchUserRewards(monad, account);

	assert.deepEqual(
		rewards.map((reward) => reward.provider),
		["merkl", "turtle"],
	);
});

test("fallback rewards service shows a multi-vault Merkl reward once with the direct claim", async () => {
	const proof = `0x${"11".repeat(32)}` as Hex;
	const merklTotal = "202697170366146413386247";
	const sdk = await buildEulerSDK({
		config: {
			rewardsServiceAdapter: "fallback",
			rewardsV3ApiUrl: "https://example.invalid",
		},
		rewardsServiceConfig: {
			enableMerkl: true,
			enableBrevis: false,
			enableFuul: false,
			enableTurtle: false,
		},
		buildQuery(queryName, fn) {
			if (queryName === "queryV3RewardsBreakdown") {
				return (async () => ({
					data: markets.map((vault, index) =>
						breakdownRow({ vault, amount: marketAmounts[index] }),
					),
				})) as typeof fn;
			}
			if (queryName === "queryV3RewardsApyPage") {
				return (async () => ({
					data: apyRowWithSuffixedCampaignIds(),
				})) as typeof fn;
			}
			if (queryName === "queryMerklUserRewards") {
				return (async () => [
					{
						chainId: monad,
						rewards: [
							{
								token: {
									address: wmon,
									chainId: monad,
									symbol: "WMON",
									name: "Wrapped MON",
									decimals: 18,
								},
								amount: merklTotal,
								claimed: "0",
								proofs: [proof],
							},
						],
					},
				]) as typeof fn;
			}
			return fn;
		},
	});

	const rewards = await sdk.rewardsService.fetchUserRewards(monad, account);

	assert.equal(rewards.length, 1);
	assert.equal(rewards[0]?.provider, "merkl");
	assert.equal(rewards[0]?.unclaimed, merklTotal);
	assert.deepEqual(rewards[0]?.proof, [proof]);
});
