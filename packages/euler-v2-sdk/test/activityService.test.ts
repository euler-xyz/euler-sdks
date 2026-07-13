import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import { EulerSDK } from "../src/sdk/sdk.js";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";
import {
	ACTIVITY_CATEGORIES,
	ActivityResponseValidationError,
	ActivityService,
	ActivityUnavailableError,
	getActivityAccount,
	getActivityCaller,
	getActivityTargetContract,
	joinActivityEndpointPath,
	normalizeActivityEvent,
	normalizeActivityEventsResponse,
	type ActivityEventsPage,
	type IActivityAdapter,
} from "../src/services/activityService/index.js";
import { createQueryCacheBuildQuery } from "../src/utils/buildQuery.js";

const OWNER = getAddress(
	"0xee5b5c82a365d75e9f8a1e982687fb5b6ceb606c",
) as Address;
const OTHER_OWNER = getAddress(
	"0x00000000000000000000000000000000000000aa",
) as Address;
const ACCOUNT = getAddress(
	"0xee5b5c82a365d75e9f8a1e982687fb5b6ceb606d",
) as Address;
const VAULT = getAddress(
	"0xd8b27cf359b7d15710a5be299af6e7bf904984c2",
) as Address;
const OTHER_VAULT = getAddress(
	"0x00000000000000000000000000000000000000bb",
) as Address;
const CALLER = getAddress(
	"0x0000000000000000000000000000000000000001",
) as Address;
const TX_HASH =
	"0x2162b1e4c31ccb11d1d84a08e517f3509d4ee74022f0a4670e4502b461b191f6";
const EVENT_ID = "v3-ponder:1:deposit:1:tx:7";
const RESPONSE_TIMESTAMP = "2026-07-13T10:00:01.000Z";

const deploymentService: IDeploymentService = {
	getDeploymentChainIds: () => [],
	getDeployment: () => {
		throw new Error("not used");
	},
	addDeployment: () => {},
};

const event = (overrides: Record<string, unknown> = {}) => ({
	id: EVENT_ID,
	chainId: 1,
	type: "deposit",
	category: "lending",
	timestamp: "2026-07-13T10:00:00.000Z",
	blockNumber: "22910000",
	logIndex: 7,
	txHash: TX_HASH,
	source: "v3-ponder",
	owner: OWNER,
	account: ACCOUNT,
	subAccountIndex: 1,
	vault: VAULT,
	vaultType: "evk",
	actor: CALLER,
	payload: {
		target_contract: VAULT,
		on_behalf_of_account: ACCOUNT,
		caller: CALLER,
	},
	...overrides,
});

const page = (
	events: unknown[] = [event()],
	metaOverrides: Record<string, unknown> = {},
) => {
	const coverageOverride =
		(metaOverrides.coverage as Record<string, unknown> | undefined) ?? {};
	const rawChains = (coverageOverride.chains as unknown[] | undefined) ?? [
		{
			chainId: 1,
			status: "complete",
			indexedFromBlock: "22000000",
			indexedToBlock: "22910000",
		},
	];
	const chains = rawChains.map((chain) => ({
		missingCategories: [],
		...(chain as Record<string, unknown>),
	}));
	const coverage = {
		status: "complete",
		missingCategories: [],
		...coverageOverride,
		chains,
	};

	return {
		data: events,
		meta: {
			hasMore: false,
			nextCursor: null,
			source: "v3-ponder",
			timestamp: RESPONSE_TIMESTAMP,
			...metaOverrides,
			coverage,
		},
	};
};

const stubActivityResponse = (body: unknown) => {
	const fetchMock = vi.fn(
		async () => new Response(JSON.stringify(body), { status: 200 }),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("ActivityService", () => {
	it("fetches normalized owner activity with distinct category and event type filters", async () => {
		const requests: Array<{ url: string; headers: HeadersInit | undefined }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				requests.push({ url, headers: init?.headers });
				return new Response(
					JSON.stringify(
						page([event()], {
							coverage: {
								status: "partial",
								chains: [
									{
										chainId: 1,
										status: "complete",
										indexedFromBlock: "22000000",
										indexedToBlock: "22910000",
										missingCategories: [],
									},
									{
										chainId: 10,
										status: "unsupported",
										missingCategories: ["account", "lending"],
										reason: "Activity is unavailable for this scope",
									},
								],
							},
						}),
					),
					{ status: 200 },
				);
			}),
		);

		const service = new ActivityService({
			endpoint: "/api/internal",
			apiKey: "secret",
		});
		const result = await service.fetchAccountActivityEvents({
			owner: OWNER,
			chainId: [10, 1, 10],
			from: 1782864000,
			to: 1783987200,
			categories: ["lending", "account", "lending"],
				eventTypes: [" Deposit ", "BORROW", "deposit"],
			cursor: "opaque:cursor",
			limit: 25,
		});

		expect(requests[0]?.url).toBe(
			`/api/internal/v3/activity/accounts/${OWNER}/events?chainId=1%2C10&from=1782864000&to=1783987200&category=account%2Clending&eventType=borrow%2Cdeposit&cursor=opaque%3Acursor&limit=25`,
		);
		expect(requests[0]?.headers).toMatchObject({
			Accept: "application/json",
			"X-API-Key": "secret",
		});
		expect(result.data[0]).toMatchObject({
				id: EVENT_ID,
			type: "deposit",
			rawType: "deposit",
			category: "lending",
			logIndex: 7,
			source: "v3-ponder",
		});
		expect(result.meta.coverage.status).toBe("partial");
		expect(getActivityTargetContract(result.data[0]!)).toBe(VAULT);
		expect(getActivityAccount(result.data[0]!)).toBe(ACCOUNT);
		expect(getActivityCaller(result.data[0]!)).toBe(CALLER);
	});

	it("preserves an absolute SSR endpoint path and routes by vault type", async () => {
		const requests: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				requests.push(url);
				return new Response(
					JSON.stringify(
						page([
							event({
								type: "set_fee",
								category: "governance",
								vaultType: "earn",
							}),
						]),
					),
					{ status: 200 },
				);
			}),
		);

		const service = new ActivityService({
			endpoint: "http://localhost:3000/api/internal/",
		});
		const result = await service.fetchVaultActivityEvents({
			vault: VAULT,
			vaultType: "earn",
			chainId: 1,
			categories: ["governance"],
			limit: 20,
		});

		expect(requests[0]).toBe(
			`http://localhost:3000/api/internal/v3/activity/vaults/1/${VAULT}/events?vaultType=earn&category=governance&limit=20`,
		);
		expect(result.data[0]?.category).toBe("governance");
		expect(service.getCapabilities()).toEqual({
			configured: true,
			adapter: "v3",
			canQueryAccount: true,
			requestableVaultTypes: ["evk", "earn", "securitize"],
		});
		expect(
			service.getScopeSupport({ kind: "vault", chainId: 1, vaultType: "earn" }),
		).toBe("unknown");
	});

	it("rejects malformed rows instead of presenting a partial empty page", () => {
		expect(() =>
			normalizeActivityEventsResponse(
				page([event(), { chainId: 1, type: "deposit" }]),
			),
		).toThrowError(ActivityResponseValidationError);
		expect(() =>
			normalizeActivityEventsResponse(page([event({ logIndex: undefined })])),
		).toThrow("$.data[0].logIndex");
		expect(() => normalizeActivityEventsResponse({ data: [] })).toThrow(
			"$.meta",
		);
	});

	it("validates cursor and coverage metadata", () => {
		expect(() =>
			normalizeActivityEventsResponse(
				page([], { hasMore: true, nextCursor: null }),
			),
		).toThrow("expected a cursor when hasMore is true");
		expect(() =>
			normalizeActivityEventsResponse(
				page([], {
					coverage: {
						status: "partial",
						chains: [
							{ chainId: 1, status: "partial" },
							{ chainId: 1, status: "complete" },
						],
					},
				}),
			),
		).toThrow("contains duplicate chain 1");
		expect(() =>
			normalizeActivityEventsResponse(
				page([], { hasMore: false, nextCursor: "unexpected-cursor" }),
			),
		).toThrow("expected null when hasMore is false");
		expect(() =>
			normalizeActivityEventsResponse(page([event(), event()])),
		).toThrow("contains duplicate event id");
		expect(() =>
			normalizeActivityEventsResponse(
				page([], {
					coverage: {
						status: "complete",
						chains: [
							{
								chainId: 1,
								status: "complete",
								indexedFromBlock: "20",
								indexedToBlock: "10",
							},
						],
					},
				}),
			),
		).toThrow("indexedToBlock to be at or after indexedFromBlock");
		expect(() =>
			normalizeActivityEventsResponse(
				page([], {
					coverage: {
						status: "partial",
						chains: [
							{
								chainId: 1,
								status: "partial",
								missingCategories: ["lending", "lending"],
							},
						],
					},
				}),
			),
		).toThrow("contains duplicate category lending");
		expect(() =>
			normalizeActivityEventsResponse(page([event({ source: "other" })])),
		).toThrow("expected the response source v3-ponder");
		expect(() =>
			normalizeActivityEventsResponse(
				page([], {
					coverage: {
						status: "complete",
						chains: [
							{
								chainId: 1,
								status: "complete",
								missingCategories: ["lending"],
							},
						],
					},
				}),
			),
		).toThrow("no missing categories when chain coverage is complete");
		expect(() =>
			normalizeActivityEventsResponse(
				page([], {
					coverage: {
						status: "complete",
						chains: [{ chainId: 1, status: "complete" }],
						missingCategories: ["lending"],
					},
				}),
			),
		).toThrow("no missing categories when aggregate coverage is complete");
	});

	it("requires the V3 response metadata fields declared by the wire contract", () => {
		const withoutChainMissingCategories = page();
		delete (withoutChainMissingCategories.meta.coverage.chains[0] as {
			missingCategories?: unknown;
		}).missingCategories;
		expect(() =>
			normalizeActivityEventsResponse(withoutChainMissingCategories),
		).toThrow("$.meta.coverage.chains[0].missingCategories");

		const withoutAggregateMissingCategories = page();
		delete (withoutAggregateMissingCategories.meta.coverage as {
			missingCategories?: unknown;
		}).missingCategories;
		expect(() =>
			normalizeActivityEventsResponse(withoutAggregateMissingCategories),
		).toThrow("$.meta.coverage.missingCategories");

		const withoutTimestamp = page();
		delete (withoutTimestamp.meta as { timestamp?: unknown }).timestamp;
		expect(() => normalizeActivityEventsResponse(withoutTimestamp)).toThrow(
			"$.meta.timestamp",
		);
	});

	it("requires RFC 3339 event, response, and valuation timestamps", () => {
		expect(() =>
			normalizeActivityEventsResponse(page([event({ timestamp: "1" })])),
		).toThrow("$.data[0].timestamp");
		expect(() =>
			normalizeActivityEventsResponse(page([], { timestamp: "2026-02-30T10:00:00Z" })),
		).toThrow("$.meta.timestamp");
		expect(() =>
			normalizeActivityEvent(
				event({
					valuation: {
						status: "available",
						priceTimestamp: "2026-07-13 10:00:00",
					},
				}),
			),
		).toThrow("$.data[].valuation.priceTimestamp");

		expect(
			normalizeActivityEvent(event({ timestamp: "2026-07-13T11:00:00+01:00" }))
				.timestamp,
		).toBe("2026-07-13T11:00:00+01:00");
	});

	it("rejects an inverted requested time range before fetching", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				from: 20,
				to: 10,
			}),
		).rejects.toThrow("from must be less than or equal to to");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("enforces V3 request bounds before fetching", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: Array.from({ length: 21 }, (_, index) => index + 1),
			}),
		).rejects.toThrow("more than 20 unique chains");
		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				cursor: "x".repeat(2_049),
			}),
		).rejects.toThrow("cursor must not exceed 2048 characters");
		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				limit: 101,
			}),
		).rejects.toThrow("limit must not exceed 100");

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: "unsupported when every chain is unsupported",
			reported: "partial",
			chains: [
				{ chainId: 1, status: "unsupported" },
				{ chainId: 10, status: "unsupported" },
			],
			expected: "unsupported",
		},
		{
			name: "partial when one chain is unsupported",
			reported: "unsupported",
			chains: [
				{ chainId: 1, status: "complete" },
				{ chainId: 10, status: "unsupported" },
			],
			expected: "partial",
		},
		{
			name: "syncing when no chain is partial or unsupported",
			reported: "complete",
			chains: [
				{ chainId: 1, status: "complete" },
				{ chainId: 10, status: "syncing" },
			],
			expected: "syncing",
		},
		{
			name: "complete only when every chain is complete",
			reported: "partial",
			chains: [
				{ chainId: 1, status: "complete" },
				{ chainId: 10, status: "complete" },
			],
			expected: "complete",
		},
	] as const)("rejects aggregate coverage that is not $name", (testCase) => {
		expect(() =>
			normalizeActivityEventsResponse(
				page([], {
					coverage: {
						status: testCase.reported,
						chains: testCase.chains,
					},
				}),
			),
		).toThrow(`expected ${testCase.expected}`);
	});

	it("accepts a fully unsupported empty page", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify(
							page([], {
								coverage: {
									status: "unsupported",
									chains: [
										{
											chainId: 1,
											status: "unsupported",
											missingCategories: ["lending"],
										},
									],
								},
							}),
						),
						{ status: 200 },
					),
			),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				categories: ["lending"],
			}),
		).resolves.toMatchObject({
			data: [],
			meta: { coverage: { status: "unsupported" } },
		});
	});

	it("rejects rows when aggregate coverage is unsupported", () => {
		expect(() =>
			normalizeActivityEventsResponse(
				page([event()], {
					coverage: {
						status: "unsupported",
						chains: [{ chainId: 1, status: "unsupported" }],
					},
				}),
			),
		).toThrow("expected no events when coverage is unsupported");
	});

	it("requires coverage for exactly the requested account chains", async () => {
		stubActivityResponse(page());
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: [1, 10],
			}),
		).rejects.toMatchObject({
			code: "INVALID_ACTIVITY_RESPONSE",
			path: "$.meta.coverage.chains",
		});
	});

	it("requires account rows to match the requested chain and owner", async () => {
		const service = new ActivityService({ endpoint: "/api/internal" });

		stubActivityResponse(page([event({ chainId: 10 })]));
		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toMatchObject({ path: "$.data[0].chainId" });

		stubActivityResponse(page([event({ owner: OTHER_OWNER })]));
		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toMatchObject({ path: "$.data[0].owner" });
	});

	it("requires account rows to belong to the owner family with a consistent index", async () => {
		const service = new ActivityService({ endpoint: "/api/internal" });

		stubActivityResponse(
			page([event({ account: OTHER_OWNER, subAccountIndex: 0 })]),
		);
		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toMatchObject({ path: "$.data[0].account" });

		stubActivityResponse(page([event({ subAccountIndex: 2 })]));
		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toMatchObject({ path: "$.data[0].subAccountIndex" });

		stubActivityResponse(page([event({ subAccountIndex: undefined })]));
		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toMatchObject({ path: "$.data[0].subAccountIndex" });
	});

	it("requires rows to satisfy supplied category and event type filters", async () => {
		const service = new ActivityService({ endpoint: "/api/internal" });

		stubActivityResponse(page([event({ category: "borrowing" })]));
		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				categories: ["lending"],
			}),
		).rejects.toMatchObject({ path: "$.data[0].category" });

		stubActivityResponse(page([event({ type: "borrow" })]));
		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				eventTypes: ["deposit"],
			}),
		).rejects.toMatchObject({ path: "$.data[0].type" });
	});

	it("requires missing categories to be compatible with the category filter", async () => {
		stubActivityResponse(
			page([event()], {
				coverage: {
					status: "partial",
					chains: [
						{
							chainId: 1,
							status: "partial",
							missingCategories: ["borrowing"],
						},
					],
				},
			}),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				categories: ["lending"],
			}),
		).rejects.toMatchObject({
			path: "$.meta.coverage.chains[0].missingCategories[0]",
		});
	});

	it("rejects rows attributed to a chain reported as unsupported", async () => {
		stubActivityResponse(
			page([event({ chainId: 10 })], {
				coverage: {
					status: "partial",
					chains: [
						{ chainId: 1, status: "complete" },
						{ chainId: 10, status: "unsupported" },
					],
				},
			}),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: [1, 10],
			}),
		).rejects.toThrow("chain 10 is reported as unsupported");
	});

	it.each([
		{ name: "chain", overrides: { chainId: 10 }, path: "$.data[0].chainId" },
		{
			name: "vault",
			overrides: { vault: OTHER_VAULT },
			path: "$.data[0].vault",
		},
		{
			name: "vault type",
			overrides: { vaultType: "earn" },
			path: "$.data[0].vaultType",
		},
	] as const)("requires vault rows to match the requested $name", async (testCase) => {
		stubActivityResponse(page([event(testCase.overrides)]));
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchVaultActivityEvents({
				vault: VAULT,
				vaultType: "evk",
				chainId: 1,
			}),
		).rejects.toMatchObject({ path: testCase.path });
	});

	it("rejects a successful response from the wrong activity source", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify(page([], { source: "unexpected" })), {
						status: 200,
					}),
			),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toMatchObject({
			code: "INVALID_ACTIVITY_RESPONSE",
			path: "$.meta.source",
		});
	});

	it("validates and normalizes optional event enrichment", () => {
		const result = normalizeActivityEvent(
			event({
				rawType: "evk_deposit",
				subAccountIndex: 1,
				assets: [
					{
						kind: "assets",
						amountRaw: "1000000000000000000",
						address: VAULT,
						symbol: "eUSDC",
						decimals: 18,
						amount: "1",
						amountUsd: "1.25",
					},
					{ kind: "shares", amountRaw: "500000000000000000" },
				],
				change: {
					fields: {
						feeBefore: "0",
						feeAfter: "100",
						supplyQueue: [VAULT],
					},
				},
				valuation: {
					status: "unavailable",
					source: "v3-prices",
					reason: "Historical price is unavailable",
				},
				groupId: "transaction:deposit",
			}),
		);

		expect(result).toMatchObject({
			rawType: "evk_deposit",
			subAccountIndex: 1,
			assets: [
				{
					kind: "assets",
					amountRaw: "1000000000000000000",
					amount: "1",
					amountUsd: "1.25",
				},
				{ kind: "shares", amountRaw: "500000000000000000" },
			],
			change: {
				fields: {
					feeBefore: "0",
					feeAfter: "100",
					supplyQueue: [VAULT],
				},
			},
			valuation: {
				status: "unavailable",
				reason: "Historical price is unavailable",
			},
		});
	});

	it("rejects malformed canonical enrichment", () => {
		expect(() =>
			normalizeActivityEvent(
				event({ assets: [{ kind: "assets", address: VAULT }] }),
			),
		).toThrow(".assets[0].amountRaw");
		expect(() =>
			normalizeActivityEvent(
				event({
					assets: [
						{ kind: "assets", amountRaw: "1", amountUsd: 1.25 },
					],
				}),
			),
		).toThrow(".assets[0].amountUsd");
		expect(() =>
			normalizeActivityEvent(
				event({ change: { fields: { queue: [VAULT, 1] } } }),
			),
		).toThrow("expected an array of strings");
	});

	it("keeps activity categories machine-stable", () => {
		expect(ACTIVITY_CATEGORIES.map(({ value }) => value)).toEqual([
			"lending",
			"borrowing",
			"swaps",
			"liquidations",
			"account",
			"rewards",
			"governance",
		]);
	});

	it("dedupes semantically equivalent set-like account and vault queries", async () => {
		const accountPage = page([event()], {
			coverage: {
				status: "partial",
				chains: [
					{ chainId: 1, status: "complete", missingCategories: [] },
					{
						chainId: 10,
						status: "unsupported",
						missingCategories: ["account", "lending"],
					},
				],
			},
		});
		const vaultPage = page([
			event({
				type: "set_fee",
				category: "governance",
				vaultType: "earn",
			}),
		]);
		const fetchMock = vi.fn(async (url: string) =>
			new Response(
				JSON.stringify(url.includes("/accounts/") ? accountPage : vaultPage),
				{ status: 200 },
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		const service = new ActivityService(
			{ endpoint: "/api/internal" },
			createQueryCacheBuildQuery({ ttlMs: 60_000, failureTtlMs: 0 }),
		);

		await service.fetchAccountActivityEvents({
			owner: OWNER.toLowerCase() as Address,
			chainId: [10, 1, 10],
			categories: ["lending", "account", "lending"],
			eventTypes: [" Deposit ", "BORROW", "deposit"],
		});
		await service.fetchAccountActivityEvents({
			owner: OWNER,
			chainId: [1, 10],
			categories: ["account", "lending"],
			eventTypes: ["borrow", "deposit"],
		});
		await service.fetchVaultActivityEvents({
			vault: VAULT.toLowerCase() as Address,
			chainId: 1,
			vaultType: "earn",
			categories: ["governance", "governance"],
			eventTypes: [" SET_FEE ", "set_fee"],
		});
		await service.fetchVaultActivityEvents({
			vault: VAULT,
			chainId: 1,
			vaultType: "earn",
			categories: ["governance"],
			eventTypes: ["set_fee"],
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("supports a custom activity adapter", async () => {
		const firstPage = normalizeActivityEventsResponse(page());
		const adapter = (result: ActivityEventsPage): IActivityAdapter => ({
			getCapabilities: () => ({
				configured: true,
				adapter: "custom",
				canQueryAccount: true,
				requestableVaultTypes: ["evk"],
			}),
			getScopeSupport: () => "supported",
			fetchAccountActivityEvents: async () => result,
			fetchVaultActivityEvents: async () => result,
		});
		const service = new ActivityService(adapter(firstPage));

		expect(
			(await service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }))
				.data[0]?.logIndex,
		).toBe(7);
		expect(
			(await service.fetchVaultActivityEvents({
				vault: VAULT,
				vaultType: "evk",
				chainId: 1,
			})).data[0]?.logIndex,
		).toBe(7);
	});

	it("uses activity-specific V3 config precedence", async () => {
		const requests: Array<{ url: string; headers?: HeadersInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				requests.push({ url, headers: init?.headers });
				return new Response(JSON.stringify(page()), { status: 200 });
			}),
		);
		const sdk = await buildEulerSDK({
			v3ApiKey: "shared-key",
			activityServiceConfig: {
				endpoint: "https://activity.example/base",
				apiKey: "activity-key",
			},
			servicesOverrides: { deploymentService },
		});

		await sdk.activityService.fetchAccountActivityEvents({
			owner: OWNER,
			chainId: 1,
		});
		expect(requests[0]?.url).toBe(
			`https://activity.example/base/v3/activity/accounts/${OWNER}/events?chainId=1`,
		);
		expect(requests[0]?.headers).toMatchObject({
			"X-API-Key": "activity-key",
		});
	});

	it("uses activity-specific V3 environment overrides", async () => {
		vi.stubEnv("EULER_SDK_V3_API_URL", "https://shared.example");
		vi.stubEnv("EULER_SDK_V3_API_KEY", "shared-key");
		vi.stubEnv(
			"EULER_SDK_ACTIVITY_V3_API_URL",
			"https://activity-env.example/base",
		);
		vi.stubEnv("EULER_SDK_ACTIVITY_V3_API_KEY", "activity-env-key");
		const requests: Array<{ url: string; headers?: HeadersInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				requests.push({ url, headers: init?.headers });
				return new Response(JSON.stringify(page()), { status: 200 });
			}),
		);
		const sdk = await buildEulerSDK({
			servicesOverrides: { deploymentService },
		});

		await sdk.activityService.fetchAccountActivityEvents({
			owner: OWNER,
			chainId: 1,
		});
		expect(requests[0]?.url).toBe(
			`https://activity-env.example/base/v3/activity/accounts/${OWNER}/events?chainId=1`,
		);
		expect(requests[0]?.headers).toMatchObject({
			"X-API-Key": "activity-env-key",
		});
	});

	it("lets SDK activity V3 config override shared and explicit V3 config", async () => {
		const requests: Array<{ url: string; headers?: HeadersInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				requests.push({ url, headers: init?.headers });
				return new Response(JSON.stringify(page()), { status: 200 });
			}),
		);
		const sdk = await buildEulerSDK({
			activityServiceConfig: {
				endpoint: "https://explicit.example",
				apiKey: "explicit-key",
			},
			config: {
				v3ApiUrl: "https://shared.example",
				v3ApiKey: "shared-key",
				activityV3ApiUrl: "https://activity.example",
				activityV3ApiKey: "activity-key",
			},
			servicesOverrides: { deploymentService },
		});

		await sdk.activityService.fetchAccountActivityEvents({
			owner: OWNER,
			chainId: 1,
		});
		expect(requests[0]?.url).toBe(
			`https://activity.example/v3/activity/accounts/${OWNER}/events?chainId=1`,
		);
		expect(requests[0]?.headers).toMatchObject({
			"X-API-Key": "activity-key",
		});
	});

	it("reports Activity unavailable when buildEulerSDK disables V3", async () => {
		const sdk = await buildEulerSDK({
			config: { disableV3: true },
			servicesOverrides: { deploymentService },
		});

		expect(sdk.activityService.getCapabilities()).toEqual({
			configured: false,
			adapter: null,
			canQueryAccount: false,
			requestableVaultTypes: [],
			reason: "v3-disabled",
		});
		expect(
			sdk.activityService.getScopeSupport({ kind: "account", chainId: 1 }),
		).toBe("unsupported");
		await expect(
			sdk.activityService.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
			}),
		).rejects.toBeInstanceOf(ActivityUnavailableError);
	});

	it("keeps direct EulerSDK construction compatible without claiming a source", async () => {
		const sdk = new EulerSDK({
			accountService: {} as never,
			portfolioService: {} as never,
			walletService: {} as never,
			eVaultService: {} as never,
			eulerEarnService: {} as never,
			securitizeVaultService: {} as never,
			vaultMetaService: {} as never,
			deploymentService,
			providerService: {} as never,
			abiService: {} as never,
			eulerLabelsService: {} as never,
			tokenlistService: {} as never,
			swapService: {} as never,
			executionService: {} as never,
			priceService: {} as never,
			rewardsService: {} as never,
			intrinsicApyService: {} as never,
			oracleAdapterService: {} as never,
			feeFlowService: {} as never,
			reulLockService: {} as never,
			positionMigrationService: {} as never,
		});

		expect(sdk.activityService).toBeInstanceOf(ActivityService);
		expect(sdk.activityService.getCapabilities()).toEqual({
			configured: false,
			adapter: null,
			canQueryAccount: false,
			requestableVaultTypes: [],
			reason: "source-not-configured",
		});
		await expect(
			sdk.activityService.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
			}),
		).rejects.toBeInstanceOf(ActivityUnavailableError);
	});

	it("preserves endpoint path segments when joining URLs", () => {
		expect(
			joinActivityEndpointPath(
				"https://lite.example/api/internal?ignored=1#fragment",
				"/v3/activity/accounts/test/events",
			),
		).toBe(
			"https://lite.example/api/internal/v3/activity/accounts/test/events",
		);
	});
});
