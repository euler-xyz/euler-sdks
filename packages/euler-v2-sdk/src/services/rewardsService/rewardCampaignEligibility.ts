import type { Address } from "viem";
import type { RewardCampaign } from "./rewardsServiceTypes.js";

/**
 * Options bag for viewer-aware reads.
 *
 * Methods that filter on whitelist/blacklist accept this shape so future
 * options (e.g. provider toggles) can be added without breaking call sites.
 * Omit the bag entirely for the default "headline" view (no viewer).
 */
export interface ViewerOptions {
	viewer?: Address | string | null;
}

/**
 * Decides whether a viewer address is eligible to earn a given campaign.
 *
 * Implementations must treat a missing viewer (`undefined` / `null`) as
 * "headline view" — campaigns should be considered active so discovery surfaces
 * keep showing the full APR to unconnected visitors.
 */
export type IsActiveForViewerFn = (
	campaign: Pick<RewardCampaign, "whitelist" | "blacklist">,
	viewer: Address | string | undefined | null,
) => boolean;

/**
 * Default Merkl-style eligibility:
 *   - no viewer  → eligible (headline APR stays visible),
 *   - non-empty whitelist → eligibility is exactly whitelist membership
 *     (overrides blacklist membership when both are set),
 *   - otherwise blacklist membership disqualifies.
 *
 * Address comparison is case-insensitive; whitelist/blacklist arrays are
 * expected to already be lowercased by the adapter.
 */
export const defaultIsActiveForViewer: IsActiveForViewerFn = (
	campaign,
	viewer,
) => {
	if (!viewer) return true;
	const addr = viewer.toLowerCase();
	if (campaign.whitelist?.length) return campaign.whitelist.includes(addr);
	if (campaign.blacklist?.includes(addr)) return false;
	return true;
};
