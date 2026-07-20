import type { Address, Hex } from "viem";

export type ActivityCategory =
	| "lending"
	| "borrowing"
	| "swaps"
	| "liquidations"
	| "account"
	| "rewards"
	| "governance";

export type ActivityVaultType = "evk" | "earn" | "securitize";

export const ACTIVITY_EVENT_TYPES = [
	"deposit",
	"withdraw",
	"transfer",
	"mint",
	"burn",
	"borrow",
	"repay",
	"swap",
	"interest_accrued",
	"debt_socialized",
	"pull_debt",
	"liquidation",
	"approval",
	"balance_forwarder_status",
	"convert_fees",
	"set_caps",
	"set_ltv",
	"set_governor_admin",
	"set_config_flags",
	"set_fee_receiver",
	"set_hook_config",
	"set_interest_fee",
	"set_interest_rate_model",
	"set_liquidation_cool_off_time",
	"set_max_liquidation_discount",
	"accrue_interest",
	"update_last_total_assets",
	"update_lost_assets",
	"reallocate_supply",
	"reallocate_withdraw",
	"set_name",
	"set_symbol",
	"set_fee",
	"set_fee_recipient",
	"set_curator",
	"set_guardian",
	"set_timelock",
	"set_cap",
	"set_is_allocator",
	"set_supply_queue",
	"set_withdraw_queue",
	"submit_cap",
	"submit_guardian",
	"submit_timelock",
	"submit_market_removal",
	"revoke_pending_cap",
	"revoke_pending_guardian",
	"revoke_pending_timelock",
	"revoke_pending_market_removal",
	"ownership_transfer_started",
	"ownership_transferred",
	"frozen",
	"unfrozen",
	"paused",
	"unpaused",
	"seized",
	"set_controller_perspective",
	"set_supply_cap",
	"owner_registered",
	"collateral_status",
	"operator_status",
	"controller_status",
	"lockdown_mode_status",
	"nonce_status",
	"nonce_used",
	"permit_disabled_mode_status",
	"reward_lock_created",
	"reward_lock_removed",
	"reward_transfer",
	"reward_whitelist_status",
	"public_reallocate_to",
	"public_withdrawal",
	"set_admin",
	"set_allocation_fee",
	"set_flow_caps",
	"transfer_allocation_fee",
	"buy",
	"terms_of_use_signed",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export type ActivityCoverageStatus =
	| "complete"
	| "partial"
	| "unsupported"
	| "syncing";

export interface ActivityCategoryOption {
	value: ActivityCategory;
	label: string;
}

export type ActivityAssetKind =
	| "assets"
	| "shares"
	| "value"
	| "collateral"
	| "yield";

export interface ActivityAssetAmount {
	kind: ActivityAssetKind;
	amountRaw: string;
	address?: Address;
	symbol?: string;
	decimals?: number;
	amount?: string;
	amountUsd?: string;
}

export type ActivityChangeValue = string | number | boolean | string[] | null;

export interface ActivityChange {
	fields: Record<string, ActivityChangeValue>;
}

export type ActivityValueChange = ActivityChange;

export interface ActivityValuation {
	status: "available" | "unavailable" | "partial";
	amountUsd?: string;
	priceTimestamp?: string;
	source?: string;
	reason?: string;
}

export interface ActivityEvent {
	/** Stable identifier supplied by the activity source. */
	id: string;
	chainId: number;
	/** Normalized event type supplied by the activity source. */
	type: ActivityEventType;
	/** Original indexed type when it differs from `type`; otherwise equal to `type`. */
	rawType: string;
	category: ActivityCategory;
	timestamp: string;
	blockNumber: string;
	logIndex: number;
	txHash: Hex;
	source: string;
	payload: Record<string, unknown>;
	label?: string;
	owner?: Address;
	account?: Address;
	subAccountIndex?: number;
	vault?: Address;
	vaultType?: ActivityVaultType;
	actor?: Address;
	counterparty?: Address;
	assets?: ActivityAssetAmount[];
	change?: ActivityChange;
	valuation?: ActivityValuation;
	groupId?: string;
}

export interface ActivityChainCoverage {
	chainId: number;
	status: ActivityCoverageStatus;
	indexedFromBlock?: string;
	indexedToBlock?: string;
	missingCategories: ActivityCategory[];
	reason?: string;
}

export interface ActivityCoverage {
	status: ActivityCoverageStatus;
	chains: ActivityChainCoverage[];
	missingCategories: ActivityCategory[];
	reason?: string;
}

export interface ActivityEventsMeta {
	hasMore: boolean;
	nextCursor: string | null;
	source: string;
	coverage: ActivityCoverage;
	limit?: number;
	timestamp: string;
}

export interface ActivityEventsPage {
	data: ActivityEvent[];
	meta: ActivityEventsMeta;
}

export interface ActivityEventsQuery {
	/** Unix timestamp bounds. The backend applies its supported maximum window. */
	from?: number;
	to?: number;
	/** Normalized UI categories sent through the `category` server filter. */
	categories?: readonly ActivityCategory[];
	/** Normalized event `type` values sent through the `eventType` server filter. */
	eventTypes?: readonly ActivityEventType[];
	/** Opaque cursor returned by the backend. Maximum length is 2,048 characters. */
	cursor?: string;
	/** Page size accepted by the backend, from 1 through 100. */
	limit?: number;
}

export interface FetchAccountActivityEventsArgs extends ActivityEventsQuery {
	owner: Address;
	/** One chain ID or at most 20 unique chain IDs. */
	chainId: number | readonly number[];
}

export interface FetchVaultActivityEventsArgs extends ActivityEventsQuery {
	vault: Address;
	chainId: number;
	vaultType: ActivityVaultType;
}

export interface ActivityServiceConfig {
	/** V3 API endpoint. Existing endpoint path segments are preserved. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` for V3 backend requests. */
	apiKey?: string;
}

export type ActivityCapabilityUnavailableReason =
	| "v3-disabled"
	| "source-not-configured";

export type ActivityScopeSupport = "supported" | "unsupported" | "unknown";

export type ActivityScope =
	| { kind: "account"; chainId: number }
	| {
			kind: "vault";
			chainId: number;
			vaultType: ActivityVaultType;
	  };

export interface ActivityCapabilities {
	/** Whether an adapter is configured and can accept activity requests. */
	configured: boolean;
	adapter: string | null;
	/** Whether this adapter implements the account activity route shape. */
	canQueryAccount: boolean;
	/** Vault route shapes this adapter can request. Runtime coverage is response metadata. */
	requestableVaultTypes: readonly ActivityVaultType[];
	reason?: ActivityCapabilityUnavailableReason;
}

export interface IActivityAdapter {
	getCapabilities(): ActivityCapabilities;
	/**
	 * Reports authoritative scoped support when known. `unknown` means the
	 * request is valid but response coverage remains the source of truth.
	 */
	getScopeSupport(scope: ActivityScope): ActivityScopeSupport;
	fetchAccountActivityEvents(
		args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage>;
	fetchVaultActivityEvents(
		args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage>;
}

export interface IActivityService extends IActivityAdapter {}
