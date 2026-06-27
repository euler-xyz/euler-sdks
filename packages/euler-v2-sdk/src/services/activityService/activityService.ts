import { getAddress, isAddress, type Address } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import type {
	ActivityCategory,
	ActivityCategoryOption,
	ActivityEvent,
	ActivityEventsMeta,
	ActivityEventsPage,
	ActivityEventsQuery,
	ActivityServiceConfig,
	FetchAccountActivityEventsArgs,
	FetchVaultActivityEventsArgs,
	IActivityService,
} from "./activityServiceTypes.js";

type RawActivityResponse = {
	data?: unknown[];
	meta?: ActivityEventsMeta;
};

const SELECTOR_INFO: Record<
	string,
	{ label: string; category: ActivityCategory }
> = {
	// ERC4626 share operations used by EVK and Earn vaults.
	"0x6e553f65": { label: "Deposit", category: "lending" },
	"0x94bf804d": { label: "Mint shares", category: "lending" },
	"0xb460af94": { label: "Withdraw", category: "lending" },
	"0xba087652": { label: "Redeem shares", category: "lending" },
	// Common EVC/account operations.
	"0x2b67b570": { label: "Permit approval", category: "account" },
	"0x3f8a17e2": { label: "Enable collateral", category: "account" },
	"0x1d5a6eb6": { label: "Disable collateral", category: "account" },
	"0x92b7d2bb": { label: "Enable controller", category: "account" },
	"0xa789fe84": { label: "Disable controller", category: "account" },
};

export const ACTIVITY_CATEGORIES: ActivityCategoryOption[] = [
	{ value: "lending", label: "Lending" },
	{ value: "borrowing", label: "Borrowing" },
	{ value: "swaps", label: "Swaps" },
	{ value: "liquidations", label: "Liquidations" },
	{ value: "account", label: "Account" },
	{ value: "rewards", label: "Rewards" },
];

const getString = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value : undefined;

export const getActivityPayloadString = (
	event: Pick<ActivityEvent, "payload">,
	keys: string[],
): string | undefined => {
	for (const key of keys) {
		const value = getString(event.payload[key]);
		if (value) return value;
	}
	return undefined;
};

const normalizeSelector = (
	payload: Record<string, unknown>,
): string | undefined => getString(payload.selector)?.toLowerCase();

const titleize = (value: string): string => {
	const cleaned = value
		.replace(/[_-]+/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.trim();
	if (!cleaned) return "Activity";
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const inferCategory = (
	type: string,
	payload: Record<string, unknown>,
): ActivityCategory => {
	const selector = normalizeSelector(payload);
	const selectorInfo = selector ? SELECTOR_INFO[selector] : undefined;
	if (selectorInfo) return selectorInfo.category;

	const haystack = [
		type,
		getString(payload.event),
		getString(payload.kind),
		getString(payload.action),
		getString(payload.operation),
		getString(payload.selector_name),
		getString(payload.method),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	if (/reward|claim|merkl|reul|lock|unlock/.test(haystack)) return "rewards";
	if (/liquidat|violator|liquidator/.test(haystack)) return "liquidations";
	if (/swap|multiply|cow/.test(haystack)) return "swaps";
	if (/borrow|repay|debt/.test(haystack)) return "borrowing";
	if (/deposit|withdraw|mint|redeem|supply|share/.test(haystack)) {
		return "lending";
	}
	return "account";
};

const inferLabel = (type: string, payload: Record<string, unknown>): string => {
	const selector = normalizeSelector(payload);
	const selectorInfo = selector ? SELECTOR_INFO[selector] : undefined;
	if (selectorInfo) return selectorInfo.label;

	return (
		getString(payload.label) ??
		getString(payload.event) ??
		getString(payload.action) ??
		getString(payload.operation) ??
		titleize(type)
	);
};

const normalizeAddressValue = (value: unknown): Address | undefined => {
	const maybeAddress = getString(value);
	if (!maybeAddress || !isAddress(maybeAddress)) return undefined;
	return getAddress(maybeAddress) as Address;
};

export const getActivityTargetContract = (
	event: Pick<ActivityEvent, "payload">,
): Address | undefined =>
	normalizeAddressValue(
		event.payload.target_contract ??
			event.payload.targetContract ??
			event.payload.vault ??
			event.payload.vault_address ??
			event.payload.vaultAddress,
	);

export const getActivityAccount = (
	event: Pick<ActivityEvent, "payload">,
): Address | undefined =>
	normalizeAddressValue(
		event.payload.on_behalf_of_account ??
			event.payload.onBehalfOfAccount ??
			event.payload.account ??
			event.payload.sub_account ??
			event.payload.subAccount,
	);

export const getActivityCaller = (
	event: Pick<ActivityEvent, "payload">,
): Address | undefined =>
	normalizeAddressValue(
		event.payload.caller ?? event.payload.sender ?? event.payload.owner,
	);

export const normalizeActivityEvent = (raw: unknown): ActivityEvent | null => {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	const type = getString(record.type) ?? "activity";
	const payload =
		record.payload && typeof record.payload === "object"
			? (record.payload as Record<string, unknown>)
			: {};

	const chainId = Number(record.chainId);
	const timestamp = getString(record.timestamp) ?? getString(record.createdAt);
	if (!Number.isFinite(chainId) || !timestamp) return null;

	const blockNumber = getString(record.blockNumber) ?? getString(record.block);
	const txHash = getString(record.txHash) ?? getString(record.transactionHash);

	return {
		chainId,
		type,
		timestamp,
		...(blockNumber ? { blockNumber } : {}),
		...(txHash ? { txHash } : {}),
		payload,
		category: inferCategory(type, payload),
		label: inferLabel(type, payload),
	};
};

export const normalizeActivityEventsResponse = (
	raw: unknown,
): ActivityEventsPage => {
	const parsed =
		typeof raw === "string" ? (JSON.parse(raw) as RawActivityResponse) : raw;
	const response = (parsed ?? {}) as RawActivityResponse;
	return {
		data: (response.data ?? [])
			.map(normalizeActivityEvent)
			.filter((event): event is ActivityEvent => Boolean(event)),
		...(response.meta ? { meta: response.meta } : {}),
	};
};

export class ActivityService implements IActivityService {
	private readonly endpoint: string;
	private readonly apiKey?: string;

	constructor(config: ActivityServiceConfig, buildQuery?: BuildQueryFn) {
		this.endpoint = config.endpoint;
		this.apiKey = config.apiKey;
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	queryAccountActivityEvents = async (
		args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage> => {
		const url = this.buildEventsUrl(
			`/v3/evc/accounts/${getAddress(args.account)}/events`,
			args,
		);
		return this.fetchEvents(url);
	};

	queryVaultActivityEvents = async (
		args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage> => {
		const url = this.buildEventsUrl(
			`/v3/evk/vaults/${args.chainId}/${getAddress(args.vault)}/events`,
			args,
		);
		return this.fetchEvents(url);
	};

	async fetchAccountActivityEvents(
		args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		return this.queryAccountActivityEvents(args);
	}

	async fetchVaultActivityEvents(
		args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		return this.queryVaultActivityEvents(args);
	}

	private async fetchEvents(url: string): Promise<ActivityEventsPage> {
		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`ActivityService request failed (${response.status} ${response.statusText}): ${body.slice(0, 200)}`,
			);
		}
		return normalizeActivityEventsResponse(await response.json());
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.apiKey ? { "X-API-Key": this.apiKey } : {}),
		};
	}

	private buildEventsUrl(path: string, args: ActivityEventsQuery): string {
		const params = new URLSearchParams({
			chainId: String(args.chainId),
			from: String(args.from),
			to: String(args.to),
		});
		if (args.type !== undefined) params.set("type", args.type);
		if (args.offset !== undefined) params.set("offset", String(args.offset));
		if (args.limit !== undefined) params.set("limit", String(args.limit));

		const normalizedEndpoint = this.endpoint.replace(/\/+$/, "");
		const url =
			normalizedEndpoint.startsWith("http://") ||
			normalizedEndpoint.startsWith("https://")
				? new URL(path, `${normalizedEndpoint}/`).toString()
				: `${normalizedEndpoint}${path}`;
		return `${url}?${params.toString()}`;
	}
}
