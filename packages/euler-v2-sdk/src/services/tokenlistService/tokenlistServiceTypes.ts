import type { Address } from "viem";

/**
 * Token list entry shape matching Euler API GET /v1/tokens response.
 */
export interface TokenListItem {
	chainId: number;
	address: Address;
	name: string;
	symbol: string;
	decimals: number;
	logoURI: string;
	groups?: string[];
	metadata?: {
		provider?: string;
		poolId?: string;
		claimUrl?: string;
		isPendlePT?: boolean;
		pendleMarket?: string;
		isPendleCrossChainPT?: boolean;
		pendleCrossChainPTPaired?: string;
		isPendleLP?: boolean;
		isPendleWrappedLP?: boolean;
		isSpectraMarket?: boolean;
		spectraPool?: string;
		cmcId?: number;
		[key: string]: unknown;
	};
	coingeckoId?: string;
}

export interface TokenlistServiceConfig {
	/** Returns the full URL for fetching the token list for a given chain. */
	getTokenListUrl: (chainId: number) => string;
}
