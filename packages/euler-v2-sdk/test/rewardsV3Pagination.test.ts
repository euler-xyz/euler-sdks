import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { Address } from "viem";
import { RewardsV3Adapter } from "../src/services/rewardsService/adapters/rewardsV3Adapter/index.js";
import type {
	V3ListEnvelope,
	V3RewardsApyRow,
} from "../src/services/rewardsService/adapters/rewardsV3Adapter/rewardsV3AdapterTypes.js";

const vault: Address = "0x0000000000000000000000000000000000000001";
const account: Address = "0x0000000000000000000000000000000000000002";
const rewardToken = {
	address: "0x0000000000000000000000000000000000000003",
	symbol: "REWARD",
	decimals: 18,
};
type Page = V3ListEnvelope<V3RewardsApyRow>;

function rewardRows(count: number): V3RewardsApyRow[] {
	return Array.from({ length: count }, (_, index) => ({
		vault,
		campaigns: [
			{
				id: `campaign-${index}`,
				provider: "merkl",
				campaignType: "euler_lend",
				apr: 1,
				rewardToken,
			},
		],
	}));
}

describe.each([
	"chain rewards",
	"campaign metadata",
] as const)("V3 %s pagination", (mode) => {
	async function readPages(pages: Page[], expectedRows: V3RewardsApyRow[]) {
		const adapter = new RewardsV3Adapter({
			endpoint: "https://example.invalid",
		});
		const offsets: number[] = [];
		adapter.setQueryV3RewardsApyPage(
			async (chainId, offset, limit, requestedVault) => {
				assert.equal(chainId, 1);
				assert.equal(limit, 100);
				assert.equal(
					requestedVault,
					mode === "campaign metadata" ? vault : undefined,
				);
				offsets.push(offset);
				const page = pages[offsets.length - 1];
				assert.ok(page, "requested a page after the complete response");
				return page;
			},
		);
		const campaignIds = expectedRows.flatMap(
			(row) => row.campaigns?.map((campaign) => campaign.id) ?? [],
		);
		let receivedIds: Array<string | undefined>;
		if (mode === "chain rewards") {
			const rewards = await adapter.fetchChainRewards(1);
			receivedIds =
				rewards.get(vault)?.campaigns.map((campaign) => campaign.campaignId) ??
				[];
		} else {
			adapter.setQueryV3RewardsBreakdown(async () => ({
				data: campaignIds.map((campaignId) => ({
					vault,
					campaignId,
					amount: "1",
				})),
			}));
			const rewards = await adapter.fetchUserRewards(1, account);
			receivedIds = rewards.map((reward) => reward.campaignId);
			assert.ok(rewards.every(({ token }) =>
				token.address === rewardToken.address &&
				token.decimals === rewardToken.decimals,
			));
		}
		assert.deepEqual(receivedIds, campaignIds);
		return offsets;
	}

	test("a complete 100-row response without pagination fields is read once", async () => {
		const rows = rewardRows(100);
		assert.deepEqual(
			await readPages(
				[{ data: rows, meta: { timestamp: "2026-10-16" } }],
				rows,
			),
			[0],
		);
	});

	test.each([
		"hasMore",
		"total",
		"limit",
	] as const)("follows explicit %s metadata on shorter pages", async (field) => {
		const rows = rewardRows(3);
		const firstMeta = {
			[field]: field === "hasMore" ? true : field === "total" ? 3 : 2,
		};
		const lastMeta = {
			[field]: field === "hasMore" ? false : field === "total" ? 3 : 2,
		};
		assert.deepEqual(
			await readPages(
				[
					{ data: rows.slice(0, 2), meta: firstMeta },
					{ data: rows.slice(2), meta: lastMeta },
				],
				rows,
			),
			[0, 2],
		);
	});

	test("hasMore false stops a full page even when total and limit suggest more", async () => {
		const rows = rewardRows(100);
		assert.deepEqual(
			await readPages(
				[{ data: rows, meta: { hasMore: false, total: 200, limit: 100 } }],
				rows,
			),
			[0],
		);
	});

	test("an empty page stops even when pagination metadata advertises more", async () => {
		const rows = rewardRows(100);
		assert.deepEqual(
			await readPages(
				[
					{ data: rows, meta: { hasMore: true } },
					{ data: [], meta: { hasMore: true, total: 200, limit: 100 } },
				],
				rows,
			),
			[0, 100],
		);
	});

	test.each([
		0, -1,
	])("a non-positive limit of %s does not imply more pages", async (limit) => {
		const rows = rewardRows(100);
		assert.deepEqual(
			await readPages([{ data: rows, meta: { limit } }], rows),
			[0],
		);
	});
});
