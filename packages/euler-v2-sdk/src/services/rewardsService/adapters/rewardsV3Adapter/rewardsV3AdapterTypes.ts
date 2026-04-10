import type { RewardsV3AdapterConfig } from "../../rewardsServiceTypes.js";

export type { RewardsV3AdapterConfig };

export type V3ListEnvelope<T> = {
	data?: T[];
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
		timestamp?: string;
		chainId?: string;
	};
};

export type V3RewardsApyRow = {
	chainId?: number;
	vault?: string;
	vaultAddress?: string;
	source?: string;
	provider?: string;
	action?: string;
	campaignId?: string;
	id?: string;
	apr?: number;
	totalApr?: number;
	dailyRewards?: number;
	endTimestamp?: number;
	endTime?: number;
	campaignType?: string;
	rewardToken?:
		| {
				address?: string;
				symbol?: string;
				name?: string;
				decimals?: number;
		  }
		| null;
	token?:
		| {
				address?: string;
				symbol?: string;
				name?: string;
				decimals?: number;
		  }
		| null;
	rewardTokenAddress?: string;
	rewardTokenSymbol?: string;
	rewardTokenName?: string;
	rewardTokenDecimals?: number;
	campaigns?: Array<{
		id?: string;
		provider?: string;
		source?: string;
		apr?: number;
		campaignType?: string;
		startTimestamp?: string;
		endTimestamp?: string;
		status?: string;
		collateralAsset?: string;
		rewardToken?:
			| {
					address?: string;
					symbol?: string;
					name?: string;
					decimals?: number;
			  }
			| null;
	}>;
};

export type V3RewardsBreakdownEnvelope = {
	data?: V3RewardsBreakdownRow[];
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
		timestamp?: string;
		chainId?: string;
	};
};

export type V3RewardsBreakdownRow = {
	chainId?: number;
	source?: string;
	provider?: string;
	token?:
		| {
				address?: string;
				chainId?: number;
				symbol?: string;
				name?: string;
				decimals?: number;
		  }
		| null;
	tokenAddress?: string;
	tokenSymbol?: string;
	tokenName?: string;
	tokenDecimals?: number;
	tokenPrice?: number;
	tokenPriceUsd?: number;
	rewardTokenAddress?: string;
	rewardTokenSymbol?: string;
	rewardTokenName?: string;
	rewardTokenDecimals?: number;
	rewardTokenPriceUsd?: number;
	accumulated?: string | number;
	accumulatedAmount?: string | number;
	totalAccumulated?: string | number;
	unclaimed?: string | number;
	unclaimedAmount?: string | number;
	claimable?: string | number;
	claimableAmount?: string | number;
	proof?: string[];
	proofs?: string[];
	merkleProof?: string[];
	claimAddress?: string;
	claimContract?: string;
	claimContractAddr?: string;
	cumulativeAmounts?: string[];
	cumulativeRewards?: string[];
	epoch?: string | number;
};
