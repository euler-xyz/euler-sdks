import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { getAddress, type Address } from "viem";

import { VaultRewardInfo } from "../src/services/rewardsService/vaultRewardInfo.js";
import {
	defaultIsActiveForViewer,
	type IsActiveForViewerFn,
} from "../src/services/rewardsService/rewardCampaignEligibility.js";
import type { RewardCampaign } from "../src/services/rewardsService/rewardsServiceTypes.js";

const VIEWER_A = getAddress(
	"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
) as Address;
const VIEWER_B = getAddress(
	"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
) as Address;

function campaign(
	overrides: Partial<RewardCampaign> & Pick<RewardCampaign, "apr">,
): RewardCampaign {
	return {
		campaignId: "c",
		source: "merkl",
		action: "LEND",
		rewardTokenSymbol: "EUL",
		...overrides,
	};
}

describe("VaultRewardInfo viewer-aware reads", () => {
	test("no viewer keeps every campaign visible (headline view)", () => {
		const info = new VaultRewardInfo({
			campaigns: [
				campaign({ campaignId: "open", apr: 0.05 }),
				campaign({
					campaignId: "gated",
					apr: 0.1,
					whitelist: [VIEWER_A.toLowerCase()],
				}),
			],
		});

		assert.equal(info.getActiveCampaigns().length, 2);
		assert.equal(
			info.getTotalRewardsApr(),
			0.05 + 0.1,
		);
	});

	test("whitelist filters: non-eligible viewer drops the gated campaign", () => {
		const info = new VaultRewardInfo({
			campaigns: [
				campaign({ campaignId: "open", apr: 0.05 }),
				campaign({
					campaignId: "gated",
					apr: 0.1,
					whitelist: [VIEWER_A.toLowerCase()],
				}),
			],
		});

		const active = info.getActiveCampaigns({ viewer: VIEWER_B });
		assert.equal(active.length, 1);
		assert.equal(active[0]?.campaignId, "open");
		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_B }), 0.05);
	});

	test("whitelist filters: eligible viewer keeps every campaign", () => {
		const info = new VaultRewardInfo({
			campaigns: [
				campaign({ campaignId: "open", apr: 0.05 }),
				campaign({
					campaignId: "gated",
					apr: 0.1,
					whitelist: [VIEWER_A.toLowerCase()],
				}),
			],
		});

		assert.equal(info.getActiveCampaigns({ viewer: VIEWER_A }).length, 2);
		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_A }), 0.05 + 0.1);
	});

	test("address comparison is case-insensitive", () => {
		const info = new VaultRewardInfo({
			campaigns: [
				campaign({
					campaignId: "gated",
					apr: 0.07,
					whitelist: [VIEWER_A.toLowerCase()],
				}),
			],
		});

		assert.equal(
			info.getTotalRewardsApr({ viewer: VIEWER_A.toUpperCase() }),
			0.07,
		);
	});

	test("blacklist excludes only listed viewer", () => {
		const info = new VaultRewardInfo({
			campaigns: [
				campaign({
					campaignId: "denied",
					apr: 0.04,
					blacklist: [VIEWER_A.toLowerCase()],
				}),
			],
		});

		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_A }), 0);
		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_B }), 0.04);
		assert.equal(info.getTotalRewardsApr(), 0.04);
	});

	test("custom isActiveForViewer overrides default semantics", () => {
		const allowOnlyB: IsActiveForViewerFn = (_c, viewer) =>
			!viewer || viewer.toLowerCase() === VIEWER_B.toLowerCase();
		const info = new VaultRewardInfo({
			campaigns: [campaign({ campaignId: "open", apr: 0.03 })],
			isActiveForViewer: allowOnlyB,
		});

		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_A }), 0);
		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_B }), 0.03);
	});

	test("setIsActiveForViewer rebinds the predicate after construction", () => {
		const info = new VaultRewardInfo({
			campaigns: [
				campaign({
					campaignId: "gated",
					apr: 0.06,
					whitelist: [VIEWER_A.toLowerCase()],
				}),
			],
		});

		// Default semantics: VIEWER_B excluded by whitelist.
		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_B }), 0);

		// Swap in an open-house predicate.
		info.setIsActiveForViewer(() => true);
		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_B }), 0.06);

		// Restore default to verify rebinding both ways.
		info.setIsActiveForViewer(defaultIsActiveForViewer);
		assert.equal(info.getTotalRewardsApr({ viewer: VIEWER_B }), 0);
	});
});

describe("defaultIsActiveForViewer", () => {
	test("missing viewer keeps headline visible", () => {
		assert.equal(defaultIsActiveForViewer({}, undefined), true);
		assert.equal(defaultIsActiveForViewer({}, null), true);
		assert.equal(defaultIsActiveForViewer({}, ""), true);
	});

	test("no whitelist + no blacklist means eligible", () => {
		assert.equal(defaultIsActiveForViewer({}, VIEWER_A), true);
	});

	test("empty whitelist is treated as absent (does not exclude everyone)", () => {
		assert.equal(defaultIsActiveForViewer({ whitelist: [] }, VIEWER_A), true);
	});

	test("non-empty whitelist gates eligibility on membership", () => {
		assert.equal(
			defaultIsActiveForViewer(
				{ whitelist: [VIEWER_A.toLowerCase()] },
				VIEWER_A,
			),
			true,
		);
		assert.equal(
			defaultIsActiveForViewer(
				{ whitelist: [VIEWER_A.toLowerCase()] },
				VIEWER_B,
			),
			false,
		);
	});

	test("whitelist membership wins over blacklist membership", () => {
		assert.equal(
			defaultIsActiveForViewer(
				{
					whitelist: [VIEWER_A.toLowerCase()],
					blacklist: [VIEWER_A.toLowerCase()],
				},
				VIEWER_A,
			),
			true,
		);
	});

	test("blacklist excludes when no whitelist is set", () => {
		assert.equal(
			defaultIsActiveForViewer(
				{ blacklist: [VIEWER_A.toLowerCase()] },
				VIEWER_A,
			),
			false,
		);
		assert.equal(
			defaultIsActiveForViewer(
				{ blacklist: [VIEWER_A.toLowerCase()] },
				VIEWER_B,
			),
			true,
		);
	});
});
