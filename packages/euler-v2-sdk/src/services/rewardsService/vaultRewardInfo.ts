import type { RewardCampaign } from "./rewardsServiceTypes.js";
import {
	defaultIsActiveForViewer,
	type IsActiveForViewerFn,
	type ViewerOptions,
} from "./rewardCampaignEligibility.js";

export interface VaultRewardInfoArgs {
	campaigns: RewardCampaign[];
	isActiveForViewer?: IsActiveForViewerFn;
}

/**
 * Reward data attached to a vault.
 *
 * `campaigns` is the raw, unfiltered set. Viewer-aware reads
 * (`getActiveCampaigns`, `getTotalRewardsApr`) apply the configured
 * eligibility predicate. With no viewer the predicate is a no-op, so
 * unconnected discovery surfaces still see the full headline APR.
 */
export class VaultRewardInfo {
	campaigns: RewardCampaign[];
	private isActiveForViewer: IsActiveForViewerFn;

	constructor(args: VaultRewardInfoArgs) {
		this.campaigns = args.campaigns;
		this.isActiveForViewer =
			args.isActiveForViewer ?? defaultIsActiveForViewer;
	}

	setIsActiveForViewer(fn: IsActiveForViewerFn): void {
		this.isActiveForViewer = fn;
	}

	/** Headline sum of campaign APRs (no viewer). Same as `getTotalRewardsApr()`. */
	get totalRewardsApr(): number {
		return this.getTotalRewardsApr();
	}

	getActiveCampaigns(opts: ViewerOptions = {}): RewardCampaign[] {
		const viewer = opts.viewer;
		return this.campaigns.filter((c) => this.isActiveForViewer(c, viewer));
	}

	getTotalRewardsApr(opts: ViewerOptions = {}): number {
		const viewer = opts.viewer;
		let total = 0;
		for (const c of this.campaigns) {
			if (this.isActiveForViewer(c, viewer)) total += c.apr;
		}
		return total;
	}
}
