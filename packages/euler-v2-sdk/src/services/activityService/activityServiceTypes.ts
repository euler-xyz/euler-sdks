import type { Address } from "viem";

export type ActivityCategory =
	| "lending"
	| "borrowing"
	| "swaps"
	| "liquidations"
	| "account"
	| "rewards";

export interface ActivityCategoryOption {
	value: ActivityCategory;
	label: string;
}

export interface ActivityEvent {
	chainId: number;
	type: string;
	timestamp: string;
	blockNumber?: string;
	txHash?: string;
	payload: Record<string, unknown>;
	category: ActivityCategory;
	label: string;
}

export interface ActivityEventsMeta {
	hasMore?: boolean;
	offset?: number;
	limit?: number;
	total?: number;
	timestamp?: string;
	chainId?: string | number;
}

export interface ActivityEventsPage {
	data: ActivityEvent[];
	meta?: ActivityEventsMeta;
}

export interface ActivityEventsQuery {
	chainId: number;
	from: number;
	to: number;
	type?: string;
	offset?: number;
	limit?: number;
}

export interface FetchAccountActivityEventsArgs extends ActivityEventsQuery {
	account: Address;
}

export interface FetchVaultActivityEventsArgs extends ActivityEventsQuery {
	vault: Address;
}

export interface ActivityServiceConfig {
	/** V3 API endpoint URL. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` for V3 backend requests. */
	apiKey?: string;
}

export interface IActivityService {
	fetchAccountActivityEvents(
		args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage>;
	fetchVaultActivityEvents(
		args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage>;
}
