import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import { EulerSDK } from "../src/sdk/sdk.js";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";
import {
	ACTIVITY_CATEGORIES,
	ACTIVITY_EVENT_TYPES,
	ActivityResponseValidationError,
	ActivityService,
	ActivityUnavailableError,
	getActivityAccount,
	getActivityCaller,
	getActivityTargetContract,
	joinActivityEndpointPath,
	normalizeActivityEvent,
	normalizeActivityEventsResponse,
	UnavailableActivityAdapter,
	type ActivityEventsPage,
	type ActivityEventType,
	type IActivityAdapter,
	type IActivityService,
	type IActivityServiceWithLiquidations,
} from "../src/services/activityService/index.js";
import {
	createQueryCacheBuildQuery,
	serializeQueryArgs,
	type BuildQueryFn,
} from "../src/utils/buildQuery.js";
import {
	getSubAccountAddress,
	SUB_ACCOUNT_MAX_ID,
} from "../src/utils/subAccounts.js";

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
const EVENT_TIMESTAMP_SECONDS = Date.parse("2026-07-13T10:00:00.000Z") / 1_000;

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

const listenOnLoopback = async (server: Server): Promise<string> => {
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => reject(error);
		server.once("error", onError);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", onError);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected a TCP address for the Activity test server");
	}
	return `http://127.0.0.1:${address.port}`;
};

const closeServer = async (server: Server): Promise<void> => {
	if (!server.listening) return;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.useRealTimers();
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
			eventTypes: ["deposit", "borrow", "deposit"],
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
			normalizeActivityEventsResponse(
				page([], { hasMore: true, nextCursor: "x".repeat(2_049) }),
			),
		).toThrow("expected at most 2048 characters");
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

	it.each(["account", "vault"] as const)(
		"rejects %s activity responses outside requested time and page bounds",
		async (scope) => {
			const fetchScopedPage = (responsePage: unknown) => {
				stubActivityResponse(responsePage);
				const service = new ActivityService({ endpoint: "/api/internal" });
				const bounds = {
					from: EVENT_TIMESTAMP_SECONDS,
					to: EVENT_TIMESTAMP_SECONDS,
					limit: 1,
				};
				return scope === "account"
					? service.fetchAccountActivityEvents({
							owner: OWNER,
							chainId: 1,
							...bounds,
						})
					: service.fetchVaultActivityEvents({
							vault: VAULT,
							vaultType: "evk",
							chainId: 1,
							...bounds,
						});
			};

			await expect(fetchScopedPage(page([event()]))).resolves.toMatchObject({
				data: [expect.objectContaining({ id: EVENT_ID })],
			});
			await expect(
				fetchScopedPage(
					page([
						event({
							timestamp: new Date(
								(EVENT_TIMESTAMP_SECONDS - 1) * 1_000,
							).toISOString(),
						}),
					]),
				),
			).rejects.toThrow("timestamp is before the requested from value");
			await expect(
				fetchScopedPage(
					page([
						event({
							timestamp: new Date(
								(EVENT_TIMESTAMP_SECONDS + 1) * 1_000,
							).toISOString(),
						}),
					]),
				),
			).rejects.toThrow("timestamp is after the requested to value");
			await expect(
				fetchScopedPage(
					page([
						event(),
						event({
							id: "v3-ponder:1:deposit:1:tx:8",
							logIndex: 8,
						}),
					]),
				),
			).rejects.toThrow("expected at most the requested limit of 1 rows");
		},
	);

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

	it("accepts the exported maximum sub-account ID", async () => {
		const maxSubAccount = getSubAccountAddress(OWNER, SUB_ACCOUNT_MAX_ID);
		stubActivityResponse(
			page([
				event({
					account: maxSubAccount,
					subAccountIndex: SUB_ACCOUNT_MAX_ID,
				}),
			]),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).resolves.toMatchObject({
			data: [
				{
					account: maxSubAccount,
					subAccountIndex: SUB_ACCOUNT_MAX_ID,
				},
			],
		});
		expect(() =>
			normalizeActivityEvent(
				event({ subAccountIndex: SUB_ACCOUNT_MAX_ID + 1 }),
			),
		).toThrow(`no greater than ${SUB_ACCOUNT_MAX_ID}`);
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

	it("rejects event types outside the normalized V3 contract", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				eventTypes: ["not_real"] as unknown as readonly ActivityEventType[],
			}),
		).rejects.toThrow("eventTypes must contain supported event type values");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(ACTIVITY_EVENT_TYPES).toContain("terms_of_use_signed");
	});

	it("rejects response event types outside the normalized contract", () => {
		expect(() => normalizeActivityEvent(event({ type: "not_real" }))).toThrow(
			"Invalid activity response at $.data[].type",
		);
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
					{
						kind: "collateral",
						amountRaw: "500000000000000000",
						amountUnderlyingRaw: "495000",
						underlyingAddress: OTHER_VAULT,
						underlyingDecimals: 6,
						amountUsd: 0.5,
					},
					{
						kind: "collateral",
						amountRaw: "1",
						amountUnderlyingRaw: null,
						amountUsd: null,
					},
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
				{
					kind: "collateral",
					amountRaw: "500000000000000000",
					amountUnderlyingRaw: "495000",
					underlyingAddress: OTHER_VAULT,
					underlyingDecimals: 6,
					// Numeric wire values normalize to the established string type.
					amountUsd: "0.5",
				},
				{
					kind: "collateral",
					amountRaw: "1",
					amountUnderlyingRaw: null,
				},
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
		expect(result.assets?.[2]).not.toHaveProperty("amountUsd");
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
						{ kind: "assets", amountRaw: "1", amountUsd: -1 },
					],
				}),
			),
		).toThrow(".assets[0].amountUsd");
		for (const malformedUsd of ["-1", "abc", "1e3", "0x12", ""]) {
			expect(() =>
				normalizeActivityEvent(
					event({
						assets: [
							{ kind: "assets", amountRaw: "1", amountUsd: malformedUsd },
						],
					}),
				),
			).toThrow(".assets[0].amountUsd");
		}
		expect(() =>
			normalizeActivityEvent(
				event({
					assets: [
						{
							kind: "collateral",
							amountRaw: "1",
							amountUnderlyingRaw: "1.5",
						},
					],
				}),
			),
		).toThrow(".assets[0].amountUnderlyingRaw");
		expect(() =>
			normalizeActivityEvent(
				event({ change: { fields: { queue: [VAULT, 1] } } }),
			),
		).toThrow("expected an array of strings");
	});

	it("expands exponent-form USD numbers exactly, without re-rounding", () => {
		const read = (amountUsd: number) =>
			normalizeActivityEvent(
				event({ assets: [{ kind: "assets", amountRaw: "1", amountUsd }] }),
			).assets?.[0]?.amountUsd;

		expect(read(0.5)).toBe("0.5");
		expect(read(1e-7)).toBe("0.0000001");
		expect(read(1.25e-9)).toBe("0.00000000125");
		// Extreme exponents keep the serialized mantissa verbatim — the
		// smallest denormal must not underflow to "0".
		expect(read(1e-101)).toBe(`0.${"0".repeat(100)}1`);
		expect(read(5e-324)).toBe(`0.${"0".repeat(323)}5`);
		expect(read(1e21)).toBe(`1${"0".repeat(21)}`);
		expect(read(1.25e22)).toBe(`125${"0".repeat(20)}`);
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
			eventTypes: ["deposit", "borrow", "deposit"],
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
			eventTypes: ["set_fee", "set_fee"],
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

	it("bypasses the default cache for cursor pages while retaining first-page dedupe", async () => {
		const result = normalizeActivityEventsResponse(page());
		let accountRuns = 0;
		let vaultRuns = 0;
		const adapter: IActivityAdapter = {
			getCapabilities: () => ({
				configured: true,
				adapter: "custom",
				canQueryAccount: true,
				requestableVaultTypes: ["evk"],
			}),
			getScopeSupport: () => "supported",
			fetchAccountActivityEvents: async () => {
				accountRuns += 1;
				return result;
			},
			fetchVaultActivityEvents: async () => {
				vaultRuns += 1;
				return result;
			},
		};
		const service = new ActivityService(
			adapter,
			createQueryCacheBuildQuery({ ttlMs: 60_000 }),
		);
		const cursorCount = 25;

		for (let index = 0; index < cursorCount; index += 1) {
			for (let repeat = 0; repeat < 2; repeat += 1) {
				await service.fetchAccountActivityEvents({
					owner: OWNER,
					chainId: 1,
					cursor: `account:${index}`,
				});
				await service.fetchVaultActivityEvents({
					vault: VAULT,
					vaultType: "evk",
					chainId: 1,
					cursor: `vault:${index}`,
				});
			}
		}

		await service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 });
		await service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 });
		await service.fetchVaultActivityEvents({
			vault: VAULT,
			vaultType: "evk",
			chainId: 1,
		});
		await service.fetchVaultActivityEvents({
			vault: VAULT,
			vaultType: "evk",
			chainId: 1,
		});

		expect(accountRuns).toBe(cursorCount * 2 + 1);
		expect(vaultRuns).toBe(cursorCount * 2 + 1);
	});

	it("preserves cursor cache bypass in custom buildQuery integrations", async () => {
		const result = normalizeActivityEventsResponse(page());
		let accountRuns = 0;
		let vaultRuns = 0;
		const adapter: IActivityAdapter = {
			getCapabilities: () => ({
				configured: true,
				adapter: "custom",
				canQueryAccount: true,
				requestableVaultTypes: ["evk"],
			}),
			getScopeSupport: () => "supported",
			fetchAccountActivityEvents: async () => {
				accountRuns += 1;
				return result;
			},
			fetchVaultActivityEvents: async () => {
				vaultRuns += 1;
				return result;
			},
		};
		const cache = new Map<string, Promise<unknown>>();
		const customBuildQuery: BuildQueryFn = (
			queryName,
			fn,
			_target,
			context,
		) =>
			(async (...args: unknown[]) => {
				const cacheKey = context
					? context.getCacheKey(args)
					: serializeQueryArgs(args);
				if (cacheKey === null) return fn(...args);

				const key = `${queryName}:${cacheKey}`;
				const cached = cache.get(key);
				if (cached) return cached;

				const pending = fn(...args);
				cache.set(key, pending);
				return pending;
			}) as typeof fn;
		const service = new ActivityService(adapter, customBuildQuery);

		for (let repeat = 0; repeat < 2; repeat += 1) {
			await service.fetchAccountActivityEvents({
				owner: OWNER,
				chainId: 1,
				cursor: "account:cursor",
			});
			await service.fetchVaultActivityEvents({
				vault: VAULT,
				vaultType: "evk",
				chainId: 1,
				cursor: "vault:cursor",
			});
		}

		await service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 });
		await service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 });
		await service.fetchVaultActivityEvents({
			vault: VAULT,
			vaultType: "evk",
			chainId: 1,
		});
		await service.fetchVaultActivityEvents({
			vault: VAULT,
			vaultType: "evk",
			chainId: 1,
		});

		expect(accountRuns).toBe(3);
		expect(vaultRuns).toBe(3);
		expect(cache.size).toBe(2);
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

	it("reports Activity unavailable when its resolved V3 endpoint is empty", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const sdk = await buildEulerSDK({
			activityServiceConfig: { endpoint: "   " },
			servicesOverrides: { deploymentService },
		});

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
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("aborts stalled V3 activity requests after ten seconds", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn(
			async (_url: string, init?: RequestInit): Promise<Response> =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener(
						"abort",
						() => reject(new DOMException("The operation was aborted", "AbortError")),
						{ once: true },
					);
				}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const service = new ActivityService({ endpoint: "/api/internal" });

		const result = service
			.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 })
			.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(10_000);

		expect(await result).toMatchObject({ name: "AbortError" });
		expect(fetchMock).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps the V3 timeout active while consuming a stalled response body", async () => {
		vi.useFakeTimers();
		let requestSignal: AbortSignal | undefined;
		let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				requestSignal = init?.signal ?? undefined;
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						bodyController = controller;
						controller.enqueue(new TextEncoder().encode('{"data":'));
						requestSignal?.addEventListener(
							"abort",
							() =>
								controller.error(
									new DOMException("The operation was aborted", "AbortError"),
								),
							{ once: true },
						);
					},
				});
				return new Response(body, { status: 200 });
			}),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		const result = service
			.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 })
			.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(10_000);
		if (!requestSignal?.aborted) {
			bodyController?.error(new Error("test cleanup: request was not aborted"));
		}

		expect(requestSignal?.aborted).toBe(true);
		expect(await result).toMatchObject({ name: "AbortError" });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects a V3 activity response body larger than two MiB", async () => {
		let requestSignal: AbortSignal | undefined;
		let bodyCancelled = false;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				requestSignal = init?.signal ?? undefined;
				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(new Uint8Array(2 * 1_024 * 1_024 + 1));
						},
						cancel() {
							bodyCancelled = true;
						},
					}),
					{ status: 200 },
				);
			}),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toThrow("response body must not exceed 2097152 bytes");
		expect(requestSignal?.aborted).toBe(true);
		expect(bodyCancelled).toBe(true);
	});

	it("cancels an oversized content-length response before clearing its timeout", async () => {
		vi.useFakeTimers();
		let requestSignal: AbortSignal | undefined;
		let bodyCancelled = false;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				requestSignal = init?.signal ?? undefined;
				return new Response(
					new ReadableStream<Uint8Array>({
						cancel() {
							bodyCancelled = true;
						},
					}),
					{
						status: 200,
						headers: { "Content-Length": String(2 * 1_024 * 1_024 + 1) },
					},
				);
			}),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(
			service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
		).rejects.toThrow("response body must not exceed 2097152 bytes");
		expect(requestSignal?.aborted).toBe(true);
		expect(bodyCancelled).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects cross-origin redirects without forwarding the API key", async () => {
		const targetRequests: Array<string | undefined> = [];
		const redirectRequests: Array<string | undefined> = [];
		const targetServer = createServer((request, response) => {
			targetRequests.push(request.headers["x-api-key"]);
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify(page()));
		});
		const targetOrigin = await listenOnLoopback(targetServer);
		const redirectServer = createServer((request, response) => {
			redirectRequests.push(request.headers["x-api-key"]);
			response.writeHead(302, {
				Location: `${targetOrigin}/captured-activity-request`,
			});
			response.end();
		});

		try {
			const redirectOrigin = await listenOnLoopback(redirectServer);
			const service = new ActivityService({
				endpoint: redirectOrigin,
				apiKey: "activity-secret",
			});

			await expect(
				service.fetchAccountActivityEvents({ owner: OWNER, chainId: 1 }),
			).rejects.toThrow();
			expect(redirectRequests).toEqual(["activity-secret"]);
			expect(targetRequests).toEqual([]);
		} finally {
			await Promise.all([
				closeServer(redirectServer),
				closeServer(targetServer),
			]);
		}
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

	it("exposes callable liquidations on the built SDK for default and legacy override services", async () => {
		const baseOptions = {
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
		};

		// Strict downstream fixture: the normal built SDK exposes
		// fetchLiquidations directly — no narrowing, no optional call.
		const sdk = new EulerSDK(baseOptions);
		await expect(
			sdk.activityService.fetchLiquidations({ chainId: 1 }),
		).rejects.toBeInstanceOf(ActivityUnavailableError);

		// A legacy custom service without liquidations stays assignable and
		// is wrapped: delegation is preserved and the guaranteed method
		// reports activity-unavailable at runtime instead of being a type
		// hole on the public SDK property.
		const legacyService: IActivityService = {
			getCapabilities: () => ({
				configured: true,
				adapter: "legacy-custom",
				canQueryAccount: true,
				requestableVaultTypes: ["evk"],
			}),
			getScopeSupport: () => "unknown",
			fetchAccountActivityEvents: async () => {
				throw new Error("unused");
			},
			fetchVaultActivityEvents: async () => {
				throw new Error("unused");
			},
		};
		const sdkWithLegacyOverride = new EulerSDK({
			...baseOptions,
			activityService: legacyService,
		});
		// Documented boundary: wrapping replaces the override's identity, so
		// only the declared IActivityService surface carries through — any
		// undeclared custom extensions on a legacy override are not reachable
		// via sdk.activityService.
		expect(sdkWithLegacyOverride.activityService).not.toBe(legacyService);
		expect(sdkWithLegacyOverride.activityService.getCapabilities().adapter).toBe(
			"legacy-custom",
		);
		await expect(
			sdkWithLegacyOverride.activityService.fetchLiquidations({ chainId: 1 }),
		).rejects.toBeInstanceOf(ActivityUnavailableError);

		// An override that already supports liquidations keeps its identity.
		const modernService = new ActivityService({ endpoint: "/api/internal" });
		const sdkWithModernOverride = new EulerSDK({
			...baseOptions,
			activityService: modernService,
		});
		expect(sdkWithModernOverride.activityService).toBe(modernService);
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

describe("ActivityService liquidations", () => {
	const LIQUIDATION_TX = `0x${"ab".repeat(32)}` as const;

	const liquidationRow = (overrides: Record<string, unknown> = {}) => ({
		chainId: 1,
		vault: VAULT,
		violator: ACCOUNT,
		liquidator: OWNER,
		collateral: OTHER_VAULT,
		repayAssets: "451076",
		yieldBalance: "486058",
		debtAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		debtAssetDecimals: 6,
		debtAssetPriceUsd: 0.9997843,
		repayAssetsUsd: 0.4509787029068,
		collateralAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		collateralAssetDecimals: 6,
		collateralAssetPriceUsd: 0.9997843,
		collateralAssets: "530677",
		collateralAssetsUsd: 0.5305625329711,
		bonusUsd: 0.0795838300643,
		valuation: { status: "available", source: "historical-price-snapshots" },
		blockNumber: "25181865",
		txHash: LIQUIDATION_TX,
		timestamp: "2026-05-26T20:24:23.000Z",
		...overrides,
	});

	const liquidationsPage = (
		rows: unknown[],
		meta: Record<string, unknown> = {},
	) => ({
		data: rows,
		meta: {
			total: rows.length,
			offset: 0,
			limit: 100,
			timestamp: "2026-07-23T10:10:10.649Z",
			...meta,
		},
	});

	it("fetches normalized liquidations with filters and offset pagination", async () => {
		const requests: Array<{ url: string; headers: HeadersInit | undefined }> =
			[];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				requests.push({ url, headers: init?.headers });
				return new Response(
					JSON.stringify(
						// The endpoint echoes the requested page window and clamps
						// only downwards; the response must answer the request.
						liquidationsPage([liquidationRow()], {
							total: 142,
							offset: 50,
							limit: 25,
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
		const result = await service.fetchLiquidations({
			chainId: 1,
			vault: VAULT,
			violator: ACCOUNT,
			liquidator: OWNER,
			from: 1779000000,
			to: 1780000000,
			limit: 25,
			offset: 50,
		});

		expect(requests[0]?.url).toBe(
			`/api/internal/v3/liquidations?chainId=1&vault=${VAULT}&violator=${ACCOUNT}&liquidator=${OWNER}&from=1779000000&to=1780000000&limit=25&offset=50`,
		);
		expect(requests[0]?.headers).toMatchObject({
			Accept: "application/json",
			"X-API-Key": "secret",
		});
		expect(result.data[0]).toMatchObject({
			vault: VAULT,
			violator: ACCOUNT,
			liquidator: OWNER,
			repayAssets: "451076",
			collateralAssets: "530677",
			bonusUsd: 0.0795838300643,
			valuation: { status: "available" },
		});
		expect(result.meta).toMatchObject({ total: 142, offset: 50, limit: 25 });
	});

	it("accepts negative bonuses and omitted valuations, rejects malformed rows", async () => {
		const respond = (rows: unknown[]) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(
					async () =>
						new Response(JSON.stringify(liquidationsPage(rows)), {
							status: 200,
						}),
				),
			);
		};
		const service = new ActivityService({ endpoint: "/api/internal" });

		// Unprofitable liquidation (negative bonus with both valued legs) and
		// missing historical prices (no bonus, no legs) are both valid.
		respond([
			liquidationRow({
				repayAssetsUsd: 1.0,
				collateralAssetsUsd: 0.75,
				bonusUsd: -0.25,
			}),
			liquidationRow({
				bonusUsd: null,
				debtAssetPriceUsd: null,
				repayAssetsUsd: null,
				collateralAssetPriceUsd: null,
				collateralAssets: null,
				collateralAssetsUsd: null,
				valuation: {
					status: "unavailable",
					source: "historical-price-snapshots",
					reason: "no snapshot",
				},
			}),
		]);
		const tolerant = await service.fetchLiquidations({ chainId: 1 });
		expect(tolerant.data[0]).toMatchObject({ bonusUsd: -0.25 });
		expect(tolerant.data[1]?.collateralAssets).toBeUndefined();
		expect(tolerant.data[1]?.repayAssetsUsd).toBeUndefined();
		expect(tolerant.data[1]?.bonusUsd).toBeUndefined();

		respond([liquidationRow({ violator: "not-an-address" })]);
		await expect(service.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
			ActivityResponseValidationError,
		);

		respond([liquidationRow({ repayAssetsUsd: -1 })]);
		await expect(service.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
			ActivityResponseValidationError,
		);

		respond([liquidationRow({ repayAssets: "1.5" })]);
		await expect(service.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
			ActivityResponseValidationError,
		);
	});

	it("accepts live rows with null historical token metadata", async () => {
		// Mirrors production pages where the conversion is unavailable at the
		// event (e.g. mainnet tx 0xef7d…200d): every metadata and USD field
		// is null while the raw amounts remain present.
		const row = liquidationRow({
			debtAsset: null,
			debtAssetDecimals: null,
			debtAssetPriceUsd: null,
			repayAssetsUsd: null,
			collateralAsset: null,
			collateralAssetDecimals: null,
			collateralAssetPriceUsd: null,
			collateralAssets: null,
			collateralAssetsUsd: null,
			bonusUsd: null,
			valuation: {
				status: "unavailable",
				source: "historical-price-snapshots",
				reason:
					"Collateral share conversion is unavailable at the liquidation event",
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify(liquidationsPage([row])), {
						status: 200,
					}),
			),
		);

		const service = new ActivityService({ endpoint: "/api/internal" });
		const page = await service.fetchLiquidations({ chainId: 1 });
		expect(page.data[0]).toMatchObject({
			repayAssets: "451076",
			yieldBalance: "486058",
			valuation: { status: "unavailable" },
		});
		for (const field of [
			"debtAsset",
			"debtAssetDecimals",
			"collateralAsset",
			"collateralAssetDecimals",
			"collateralAssets",
			"bonusUsd",
		]) {
			expect(page.data[0]).not.toHaveProperty(field);
		}
	});

	it("enforces the valuation discriminant against the USD legs", async () => {
		const respond = (rows: unknown[]) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(
					async () =>
						new Response(JSON.stringify(liquidationsPage(rows)), {
							status: 200,
						}),
				),
			);
		};
		const service = new ActivityService({ endpoint: "/api/internal" });
		const legs = (
			repayAssetsUsd: number | null,
			collateralAssetsUsd: number | null,
		) => ({
			repayAssetsUsd,
			collateralAssetsUsd,
			// Keep dependent fields consistent with the missing legs.
			...(repayAssetsUsd === null ? { debtAssetPriceUsd: null } : {}),
			...(collateralAssetsUsd === null
				? { collateralAssetPriceUsd: null, bonusUsd: null }
				: {}),
		});

		// The v3 contract: available = both legs, partial = exactly one,
		// unavailable = neither, always from historical-price-snapshots.
		const contradictions: Array<Record<string, unknown>> = [
			// available with no or one valued leg.
			liquidationRow({
				...legs(null, null),
				valuation: { status: "available", source: "historical-price-snapshots" },
			}),
			liquidationRow({
				...legs(0.5, null),
				valuation: { status: "available", source: "historical-price-snapshots" },
			}),
			// partial with neither or both legs.
			liquidationRow({
				...legs(null, null),
				valuation: { status: "partial", source: "historical-price-snapshots" },
			}),
			liquidationRow({
				valuation: { status: "partial", source: "historical-price-snapshots" },
			}),
			// unavailable with one or both legs.
			liquidationRow({
				...legs(0.5, null),
				valuation: {
					status: "unavailable",
					source: "historical-price-snapshots",
				},
			}),
			liquidationRow({
				valuation: {
					status: "unavailable",
					source: "historical-price-snapshots",
				},
			}),
			// Missing or foreign valuation source.
			liquidationRow({ valuation: { status: "available" } }),
			liquidationRow({
				valuation: { status: "available", source: "v3-prices" },
			}),
			// The derived bonus must exist exactly when both legs are valued:
			// a P&L figure without its valuation inputs (or valued legs
			// without their derived bonus) contradicts the producer.
			liquidationRow({
				...legs(0.5, null),
				bonusUsd: 0.1,
				valuation: { status: "partial", source: "historical-price-snapshots" },
			}),
			liquidationRow({
				...legs(null, null),
				bonusUsd: -0.25,
				valuation: {
					status: "unavailable",
					source: "historical-price-snapshots",
				},
			}),
			liquidationRow({ bonusUsd: null }),
			// Historical token decimals share the uint8 bound the producer
			// and the sibling asset parser enforce.
			liquidationRow({ debtAssetDecimals: 256 }),
			liquidationRow({ collateralAssetDecimals: 256 }),
		];
		for (const row of contradictions) {
			respond([row]);
			await expect(service.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
				ActivityResponseValidationError,
			);
		}

		// The live partial shape — one valued leg — is accepted.
		respond([
			liquidationRow({
				...legs(10.29, null),
				collateralAssets: null,
				valuation: {
					status: "partial",
					source: "historical-price-snapshots",
					reason:
						"Historical USD price or token metadata is unavailable for one liquidation leg",
				},
			}),
		]);
		const partial = await service.fetchLiquidations({ chainId: 1 });
		expect(partial.data[0]).toMatchObject({
			repayAssetsUsd: 10.29,
			valuation: { status: "partial" },
		});
		expect(partial.data[0]?.collateralAssetsUsd).toBeUndefined();

		// The uint8 boundary itself is valid.
		respond([
			liquidationRow({ debtAssetDecimals: 255, collateralAssetDecimals: 255 }),
		]);
		const boundary = await service.fetchLiquidations({ chainId: 1 });
		expect(boundary.data[0]).toMatchObject({
			debtAssetDecimals: 255,
			collateralAssetDecimals: 255,
		});
	});

	it("rejects structurally valid pages that do not answer the request", async () => {
		const respond = (rows: unknown[], meta: Record<string, unknown> = {}) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(
					async () =>
						new Response(JSON.stringify(liquidationsPage(rows, meta)), {
							status: 200,
						}),
				),
			);
		};
		const service = new ActivityService({ endpoint: "/api/internal" });

		// Wrong chain.
		respond([liquidationRow({ chainId: 8453 })]);
		await expect(service.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
			"chain 8453 was not requested",
		);

		// Wrong vault for the supplied filter.
		respond([liquidationRow({ vault: OTHER_VAULT })]);
		await expect(
			service.fetchLiquidations({ chainId: 1, vault: VAULT }),
		).rejects.toThrow("expected the requested vault");

		// Wrong violator for the supplied filter.
		respond([liquidationRow({ violator: OWNER })]);
		await expect(
			service.fetchLiquidations({ chainId: 1, violator: ACCOUNT }),
		).rejects.toThrow("expected the requested violator");

		// Pagination metadata that ignores the request.
		respond([liquidationRow()], { offset: 0, limit: 100 });
		await expect(
			service.fetchLiquidations({ chainId: 1, limit: 1, offset: 50 }),
		).rejects.toThrow("expected the requested offset 50");

		// The endpoint clamps page sizes down, never up.
		respond([liquidationRow()], { limit: 100 });
		await expect(
			service.fetchLiquidations({ chainId: 1, limit: 1 }),
		).rejects.toThrow("expected at most the requested limit of 1");

		// More rows than the echoed page size allows.
		respond([liquidationRow(), liquidationRow()], { limit: 1, total: 2 });
		await expect(service.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
			"expected at most 1 rows",
		);

		// Rows beyond the reported total.
		respond([liquidationRow()], { total: 0 });
		await expect(service.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
			"expected row count consistent with the reported total",
		);

		// A row returned past the remaining count is inconsistent even when
		// the empty-overshoot case is allowed.
		respond([liquidationRow()], { total: 2374, offset: 999999, limit: 1 });
		await expect(
			service.fetchLiquidations({ chainId: 1, limit: 1, offset: 999999 }),
		).rejects.toThrow("expected row count consistent with the reported total");

		// Rows outside the requested time window.
		respond([liquidationRow({ timestamp: "2026-01-01T00:00:00.000Z" })]);
		await expect(
			service.fetchLiquidations({ chainId: 1, from: 1779000000 }),
		).rejects.toThrow("before the requested from value");
	});

	it("accepts a valid empty page for an offset beyond the total", async () => {
		// Live shape: the endpoint answers an overshooting offset with an
		// empty page while still reporting the overall total.
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify(
							liquidationsPage([], { total: 2374, offset: 999999, limit: 1 }),
						),
						{ status: 200 },
					),
			),
		);
		const service = new ActivityService({ endpoint: "/api/internal" });
		const page = await service.fetchLiquidations({
			chainId: 1,
			limit: 1,
			offset: 999999,
		});
		expect(page.data).toEqual([]);
		expect(page.meta).toMatchObject({ total: 2374, offset: 999999 });
	});

	it("validates liquidation query arguments before requesting", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const service = new ActivityService({ endpoint: "/api/internal" });

		await expect(service.fetchLiquidations({ chainId: 0 })).rejects.toThrow(
			"chainId must be a positive safe integer",
		);
		await expect(
			service.fetchLiquidations({ chainId: 1, limit: 101 }),
		).rejects.toThrow("limit must not exceed 100");
		await expect(
			service.fetchLiquidations({ chainId: 1, offset: -1 }),
		).rejects.toThrow("offset must be a non-negative safe integer");
		await expect(
			service.fetchLiquidations({ chainId: 1, from: 10, to: 5 }),
		).rejects.toThrow("from must be less than or equal to to");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports liquidations unavailable without adapter support", async () => {
		const unavailable = new ActivityService(
			new UnavailableActivityAdapter("v3-disabled"),
		);
		await expect(unavailable.fetchLiquidations({ chainId: 1 })).rejects.toThrow(
			ActivityUnavailableError,
		);

		const legacyAdapter: IActivityAdapter = {
			getCapabilities: () => ({
				configured: true,
				adapter: "custom",
				canQueryAccount: true,
				requestableVaultTypes: ["evk"],
			}),
			getScopeSupport: () => "unknown",
			fetchAccountActivityEvents: async () => {
				throw new Error("unused");
			},
			fetchVaultActivityEvents: async () => {
				throw new Error("unused");
			},
		};
		const service = new ActivityService(legacyAdapter);
		// Downstream compile fixtures. A legacy custom service override that
		// predates liquidations must stay assignable to the override-facing
		// contract, while the built-in service carries the stronger guarantee
		// so its consumers can call fetchLiquidations without narrowing.
		const legacyServiceOverride: IActivityService = legacyAdapter;
		expect(legacyServiceOverride.fetchLiquidations).toBeUndefined();
		const builtInService: IActivityServiceWithLiquidations = service;
		await expect(
			builtInService.fetchLiquidations({ chainId: 1 }),
		).rejects.toThrow(ActivityUnavailableError);
	});

	it("builds a stable liquidations query key with checksummed addresses", () => {
		const service = new ActivityService({ endpoint: "/api/internal" });
		const key = service.getQueryKeyLiquidations({
			chainId: 1,
			vault: VAULT.toLowerCase() as Address,
			violator: ACCOUNT.toLowerCase() as Address,
		});
		// The serializer lowercases values; stability across input casing is
		// the invariant that matters.
		expect(key).toContain(VAULT.toLowerCase());
		expect(key).toContain(ACCOUNT.toLowerCase());
		expect(key).toBe(
			service.getQueryKeyLiquidations({
				chainId: 1,
				vault: VAULT,
				violator: ACCOUNT,
			}),
		);
	});
});
