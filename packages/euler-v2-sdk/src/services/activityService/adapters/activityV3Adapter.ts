import { getAddress } from "viem";
import {
	ACTIVITY_CATEGORY_VALUES,
	ACTIVITY_VAULT_TYPES,
	ActivityResponseValidationError,
	normalizeActivityEventsResponse,
	validateAccountActivityEventsPage,
	validateVaultActivityEventsPage,
} from "../activityEvent.js";
import type {
	ActivityCapabilities,
	ActivityEventsPage,
	ActivityEventsQuery,
	ActivityScope,
	ActivityScopeSupport,
	ActivityServiceConfig,
	FetchAccountActivityEventsArgs,
	FetchVaultActivityEventsArgs,
	IActivityAdapter,
} from "../activityServiceTypes.js";

const ACTIVITY_V3_SOURCE = "v3-ponder";
const MAX_ACTIVITY_CHAIN_IDS = 20;
const MAX_ACTIVITY_CURSOR_LENGTH = 2_048;
const MAX_ACTIVITY_LIMIT = 100;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

const uniqueSorted = <T extends string | number>(values: readonly T[]): T[] =>
	[...new Set(values)].sort((left, right) =>
		String(left).localeCompare(String(right)),
	);

const assertPositiveInteger = (value: number, name: string): void => {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive safe integer`);
	}
};

const assertOptionalTimestamp = (
	value: number | undefined,
	name: string,
): void => {
	if (
		value !== undefined &&
		(!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value))
	) {
		throw new Error(`${name} must be a non-negative safe integer`);
	}
};

const appendCommonQuery = (
	params: URLSearchParams,
	args: ActivityEventsQuery,
): void => {
	assertOptionalTimestamp(args.from, "from");
	assertOptionalTimestamp(args.to, "to");
	if (args.from !== undefined && args.to !== undefined && args.from > args.to) {
		throw new Error("from must be less than or equal to to");
	}
	if (args.from !== undefined) params.set("from", String(args.from));
	if (args.to !== undefined) params.set("to", String(args.to));

	if (args.categories !== undefined) {
		const categories = uniqueSorted(args.categories);
		if (
			categories.length === 0 ||
			categories.some(
				(category) => !ACTIVITY_CATEGORY_VALUES.includes(category),
			)
		) {
			throw new Error("categories must contain supported category values");
		}
		params.set("category", categories.join(","));
	}

	if (args.eventTypes !== undefined) {
		const eventTypes = uniqueSorted(
			args.eventTypes.map((eventType) => eventType.trim().toLowerCase()),
		);
		if (
			eventTypes.length === 0 ||
			eventTypes.some((eventType) => !eventType || eventType.includes(","))
		) {
			throw new Error("eventTypes must contain non-empty, comma-free values");
		}
		params.set("eventType", eventTypes.join(","));
	}

	if (args.cursor !== undefined) {
		if (!args.cursor.trim()) throw new Error("cursor must not be empty");
		if (args.cursor.length > MAX_ACTIVITY_CURSOR_LENGTH) {
			throw new Error(
				`cursor must not exceed ${MAX_ACTIVITY_CURSOR_LENGTH} characters`,
			);
		}
		params.set("cursor", args.cursor);
	}
	if (args.limit !== undefined) {
		assertPositiveInteger(args.limit, "limit");
		if (args.limit > MAX_ACTIVITY_LIMIT) {
			throw new Error(`limit must not exceed ${MAX_ACTIVITY_LIMIT}`);
		}
		params.set("limit", String(args.limit));
	}
};

export const joinActivityEndpointPath = (
	endpoint: string,
	path: string,
): string => {
	const trimmedEndpoint = endpoint.trim();
	if (!trimmedEndpoint)
		throw new Error("Activity V3 endpoint must not be empty");
	const pathSuffix = path.replace(/^\/+/, "");

	if (/^https?:\/\//i.test(trimmedEndpoint)) {
		const url = new URL(trimmedEndpoint);
		url.pathname = `${url.pathname.replace(/\/+$/, "")}/${pathSuffix}`;
		url.search = "";
		url.hash = "";
		return url.toString();
	}

	return `${trimmedEndpoint.replace(/\/+$/, "")}/${pathSuffix}`;
};

export class ActivityV3Adapter implements IActivityAdapter {
	constructor(private readonly config: ActivityServiceConfig) {
		if (!config.endpoint.trim()) {
			throw new Error("Activity V3 endpoint must not be empty");
		}
	}

	getCapabilities(): ActivityCapabilities {
		return {
			configured: true,
			adapter: "v3",
			canQueryAccount: true,
			requestableVaultTypes: ["evk", "earn", "securitize"],
		};
	}

	getScopeSupport(scope: ActivityScope): ActivityScopeSupport {
		if (
			scope.kind === "vault" &&
			!ACTIVITY_VAULT_TYPES.includes(scope.vaultType)
		) {
			return "unsupported";
		}
		return "unknown";
	}

	async fetchAccountActivityEvents(
		args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		const chainIds = [
			...new Set(Array.isArray(args.chainId) ? args.chainId : [args.chainId]),
		].sort((left, right) => left - right);
		if (chainIds.length === 0) {
			throw new Error("chainId must contain at least one chain");
		}
		if (chainIds.length > MAX_ACTIVITY_CHAIN_IDS) {
			throw new Error(
				`chainId must not contain more than ${MAX_ACTIVITY_CHAIN_IDS} unique chains`,
			);
		}
		for (const chainId of chainIds) {
			assertPositiveInteger(chainId, "chainId");
		}

		const params = new URLSearchParams({ chainId: chainIds.join(",") });
		appendCommonQuery(params, args);
		const path = `/v3/activity/accounts/${getAddress(args.owner)}/events`;
		const page = await this.fetchEvents(this.buildUrl(path, params));
		return validateAccountActivityEventsPage(page, args);
	}

	async fetchVaultActivityEvents(
		args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		assertPositiveInteger(args.chainId, "chainId");
		if (!ACTIVITY_VAULT_TYPES.includes(args.vaultType)) {
			throw new Error("vaultType must be evk, earn, or securitize");
		}
		const params = new URLSearchParams({ vaultType: args.vaultType });
		appendCommonQuery(params, args);
		const path = `/v3/activity/vaults/${args.chainId}/${getAddress(args.vault)}/events`;
		const page = await this.fetchEvents(this.buildUrl(path, params));
		return validateVaultActivityEventsPage(page, args);
	}

	private async fetchEvents(url: string): Promise<ActivityEventsPage> {
		const response = await this.fetchWithTimeout(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		const body = await response.text();
		if (!response.ok) {
			throw new Error(
				`Activity V3 request failed (${response.status} ${response.statusText}): ${body.slice(0, 200)}`,
			);
		}

		const page = normalizeActivityEventsResponse(body);
		if (page.meta.source !== ACTIVITY_V3_SOURCE) {
			throw new ActivityResponseValidationError(
				`expected ${ACTIVITY_V3_SOURCE}; received ${page.meta.source}`,
				"$.meta.source",
			);
		}
		return page;
	}

	private async fetchWithTimeout(
		url: string,
		init: RequestInit,
	): Promise<Response> {
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			DEFAULT_REQUEST_TIMEOUT_MS,
		);

		try {
			return await fetch(url, {
				...init,
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	private buildUrl(path: string, params: URLSearchParams): string {
		return `${joinActivityEndpointPath(this.config.endpoint, path)}?${params.toString()}`;
	}
}
