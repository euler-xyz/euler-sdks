import { readFileSync } from "node:fs";
import { getAddress } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createSubgraphCatalogResolver,
	parseSubgraphCatalog,
} from "../src/utils/subgraphCatalog.js";
import { AccountVaultsSubgraphAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import { VaultTypeSubgraphAdapter } from "../src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.js";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";
import type { BuildQueryFn } from "../src/utils/buildQuery.js";

const address = "0x0000000000000000000000000000000000000001";
const active = {
	chainId: 1,
	family: "euler-simple",
	channel: "stable",
	status: "active",
	version: "1.0.3.2",
	endpoint: "https://graph.example/v1",
	deploymentId: "QmDeployment",
	capabilities: ["account-vault-discovery", "vault-factory-lookup"],
	sourceCommit: "a".repeat(40),
	startBlock: 0,
};
const catalog = (...deployments: unknown[]) => ({
	schemaVersion: 1,
	revision: "revision",
	publishedAt: "2026-10-19T10:00:00Z",
	deployments,
});
const json = (value: unknown) =>
	new Response(JSON.stringify(value), { status: 200 });
const deploymentService: IDeploymentService = {
	getDeploymentChainIds: () => [],
	getDeployment: () => {
		throw new Error("not used");
	},
	addDeployment: () => {},
};
const graphFetch = () =>
	vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		json({
			data: {
				trackingActiveAccounts: [],
				vaults: [],
				_meta: { deployment: active.deploymentId },
			},
		}),
	);
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("catalog parsing and selection", () => {
	it("quarantines duplicate identities without damaging unrelated chains", async () => {
		const resolver = createSubgraphCatalogResolver({
			catalog: catalog(
				active,
				{ ...active, endpoint: "http://bad" },
				{ ...active, chainId: 2 },
			),
		});
		await expect(
			resolver.resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "invalid" });
		await expect(
			resolver.resolve(2, "vault-factory-lookup"),
		).resolves.toMatchObject({ endpoint: active.endpoint });
	});
	it.each([
		"http://graph.example",
		"https://name:secret@graph.example",
		"https://graph.example?key=secret",
		"https://graph.example/#fragment",
	])("rejects public endpoint %s", async (endpoint) => {
		await expect(
			createSubgraphCatalogResolver({
				catalog: catalog({ ...active, endpoint }),
			}).resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "invalid" });
	});
	it("distinguishes missing, retired and unsupported capability; candidates require opt-in", async () => {
		const snapshot = catalog(
			{ ...active, channel: "candidate" },
			{
				chainId: 2,
				family: "euler-simple",
				channel: "stable",
				status: "retired",
			},
			{ ...active, chainId: 3, capabilities: ["vault-factory-lookup"] },
			{ ...active, family: "other" },
		);
		const resolver = createSubgraphCatalogResolver({ catalog: snapshot });
		for (const [chainId, reason] of [
			[1, "missing"],
			[2, "retired"],
			[3, "unsupported-capability"],
		] as const)
			await expect(
				resolver.resolve(chainId, "account-vault-discovery"),
			).rejects.toMatchObject({ reason });
		await expect(
			createSubgraphCatalogResolver({
				catalog: snapshot,
				channel: "candidate",
			}).resolve(1, "account-vault-discovery"),
		).resolves.toMatchObject({ deploymentId: active.deploymentId });
	});
	it("rejects malformed envelopes and schema versions", () => {
		for (const value of [
			null,
			{},
			{ ...catalog(active), schemaVersion: 2 },
			{ ...catalog(active), publishedAt: "yesterday" },
		])
			expect(() => parseSubgraphCatalog(value)).toThrow();
	});
});

describe("metadata cache", () => {
	it("is lazy, single-flight and bounds last-good age without extending it on failures", async () => {
		let now = 0;
		const fetch = vi.fn().mockResolvedValue(json(catalog(active)));
		const resolver = createSubgraphCatalogResolver({
			fetch,
			freshMs: 10,
			maxAgeMs: 20,
			now: () => now,
		});
		expect(fetch).not.toHaveBeenCalled();
		await Promise.all([
			resolver.resolve(1, "account-vault-discovery"),
			resolver.resolve(1, "vault-factory-lookup"),
		]);
		expect(fetch).toHaveBeenCalledTimes(1);
		fetch.mockRejectedValue(new Error("offline"));
		now = 11;
		await resolver.resolve(1, "account-vault-discovery");
		now = 19;
		await resolver.resolve(1, "account-vault-discovery");
		now = 20;
		await expect(
			resolver.resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "source-failed" });
	});
	it("accepts retirement immediately and never resurrects it after failed refresh", async () => {
		let now = 0;
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(json(catalog(active)))
			.mockResolvedValueOnce(json(catalog({ ...active, status: "retired" })))
			.mockRejectedValue(new Error("offline"));
		const resolver = createSubgraphCatalogResolver({
			fetch,
			freshMs: 1,
			maxAgeMs: 10,
			now: () => now,
		});
		await resolver.resolve(1, "account-vault-discovery");
		now = 2;
		await expect(
			resolver.resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "retired" });
		now = 4;
		await expect(
			resolver.resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "retired" });
	});
	it("isolates source instances and supplied snapshots even with identical chain IDs", async () => {
		const fetch = vi.fn();
		const first = createSubgraphCatalogResolver({
			catalog: catalog(active),
			url: "/unused",
			fetch,
		});
		const second = createSubgraphCatalogResolver({
			catalog: catalog({ ...active, endpoint: "https://other.example" }),
			fetch,
		});
		expect((await first.resolve(1, "account-vault-discovery")).endpoint).toBe(
			active.endpoint,
		);
		expect((await second.resolve(1, "account-vault-discovery")).endpoint).toBe(
			"https://other.example",
		);
		expect(fetch).not.toHaveBeenCalled();
	});
	it("custom resolver suppresses catalog fetch and accepts private transport", async () => {
		const fetch = vi.fn();
		const resolver = createSubgraphCatalogResolver({
			resolver: {
				resolve: async () => ({ endpoint: "/proxy", deploymentId: "private" }),
			},
			catalog: null,
			fetch,
		});
		expect(
			(await resolver.resolve(1, "account-vault-discovery")).endpoint,
		).toBe("/proxy");
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("actual adapters and SDK callers", () => {
	it("preserves explicit per-purpose sources and disables without catalog HTTP", async () => {
		const graph = graphFetch();
		const metadata = vi.fn();
		const sdk = await buildEulerSDK({
			config: {
				subgraphCatalog: { fetch: metadata },
				accountServiceAdapter: "onchain",
				vaultTypeAdapter: "subgraph",
				accountVaultsSubgraphUrls: { 1: "/account", 2: false },
				vaultTypeSubgraphUrls: { 1: "http://localhost/factory", 2: false },
			},
			servicesOverrides: { deploymentService },
		});
		expect(metadata).not.toHaveBeenCalled();
		await sdk.accountService.fetchAccount(1, address, {
			populateVaults: false,
		});
		await sdk.vaultMetaService.fetchVaultType(1, address);
		expect(graph.mock.calls.map(([url]) => url)).toEqual([
			"/account",
			"http://localhost/factory",
		]);
		await expect(
			sdk.accountService.fetchAccount(2, address),
		).rejects.toMatchObject({ reason: "disabled" });
		await expect(
			sdk.vaultMetaService.fetchVaultType(2, address),
		).rejects.toMatchObject({ reason: "disabled" });
		expect(metadata).not.toHaveBeenCalled();
	});
	it("honors config over adapter over environment for each purpose", async () => {
		vi.stubEnv("EULER_SDK_ACCOUNT_VAULTS_SUBGRAPH_URL_1", "/env-account");
		vi.stubEnv("EULER_SDK_VAULT_TYPE_SUBGRAPH_URL_1", "/env-factory");
		const graph = graphFetch();
		const sdk = await buildEulerSDK({
			config: {
				subgraphCatalog: {},
				accountServiceAdapter: "onchain",
				vaultTypeAdapter: "subgraph",
				accountVaultsSubgraphUrls: { 1: "/config-account" },
			},
			accountVaultsAdapterConfig: { subgraphURLs: { 1: "/adapter-account" } },
			vaultTypeAdapterConfig: { subgraphURLs: { 1: "/adapter-factory" } },
			servicesOverrides: { deploymentService },
		});
		await sdk.accountService.fetchAccount(1, address, {
			populateVaults: false,
		});
		await sdk.vaultMetaService.fetchVaultType(1, address);
		expect(graph.mock.calls.map(([url]) => url)).toEqual([
			"/config-account",
			"/adapter-factory",
		]);
	});
	it("does not mask retirement with buildQuery cache in actual SDK service calls", async () => {
		let now = 0;
		const metadata = vi
			.fn()
			.mockResolvedValueOnce(json(catalog(active)))
			.mockResolvedValue(json(catalog({ ...active, status: "retired" })));
		const graph = graphFetch();
		const buildQuery: BuildQueryFn = (_name, fn) => {
			const cache = new Map<string, ReturnType<typeof fn>>();
			return ((...args: Parameters<typeof fn>) => {
				const key = JSON.stringify(args);
				if (!cache.has(key)) cache.set(key, fn(...args));
				return cache.get(key);
			}) as typeof fn;
		};
		const sdk = await buildEulerSDK({
			config: {
				subgraphCatalog: { fetch: metadata, freshMs: 1, now: () => now },
				accountServiceAdapter: "onchain",
				vaultTypeAdapter: "subgraph",
			},
			buildQuery,
			servicesOverrides: { deploymentService },
		});
		await sdk.accountService.fetchAccount(1, address, {
			populateVaults: false,
		});
		await sdk.vaultMetaService.fetchVaultType(1, address);
		now = 2;
		await expect(
			sdk.accountService.fetchAccount(1, address),
		).rejects.toMatchObject({ reason: "retired" });
		await expect(
			sdk.vaultMetaService.fetchVaultType(1, address),
		).rejects.toMatchObject({ reason: "retired" });
		expect(graph).toHaveBeenCalledTimes(2);
	});
	it("treats supplied invalid/missing catalog entries as errors through real adapters", async () => {
		graphFetch();
		for (const snapshot of [
			catalog(),
			catalog({ ...active, endpoint: "http://bad" }),
			catalog({ ...active, status: "retired" }),
		]) {
			const resolver = createSubgraphCatalogResolver({ catalog: snapshot });
			await expect(
				new AccountVaultsSubgraphAdapter({
					subgraphURLs: {},
					resolver,
				}).fetchAccountVaults(1, address),
			).rejects.toThrow();
			await expect(
				new VaultTypeSubgraphAdapter({
					subgraphURLs: {},
					resolver,
				}).fetchVaultFactories(1, [address]),
			).rejects.toThrow();
		}
	});
	it("retains bundled compatibility for false catalog and empty explicit maps", async () => {
		const graph = graphFetch();
		const sdk = await buildEulerSDK({
			config: {
				subgraphCatalog: false,
				accountServiceAdapter: "onchain",
				accountVaultsSubgraphUrls: {},
			},
			servicesOverrides: { deploymentService },
		});
		await sdk.accountService.fetchAccount(1, address, {
			populateVaults: false,
		});
		expect(String(graph.mock.calls[0][0])).toContain("api.goldsky.com");
	});
});

describe("producer compatibility and source transitions", () => {
	it("reads the exact producer v1 fixture including hotfix and retirement", async () => {
		const snapshot = JSON.parse(
			readFileSync(
				new URL("./fixtures/subgraph-catalog.v1.json", import.meta.url),
				"utf8",
			),
		);
		const resolver = createSubgraphCatalogResolver({ catalog: snapshot });
		await expect(
			resolver.resolve(1, "account-vault-discovery"),
		).resolves.toMatchObject({ deploymentId: "QmFixtureDeployment" });
		await expect(
			resolver.resolve(8453, "vault-factory-lookup"),
		).rejects.toMatchObject({ reason: "retired" });
	});
	it("detects changed deployment identity before querying and allows a restarted read", async () => {
		const graph = graphFetch();
		let deploymentId = "first";
		graph.mockImplementation(async () =>
			json({
				data: {
					trackingActiveAccounts: [],
					vaults: [],
					_meta: { deployment: deploymentId },
				},
			}),
		);
		const resolver = {
			resolve: async () => ({ endpoint: "/proxy", deploymentId }),
		};
		const account = new AccountVaultsSubgraphAdapter({
			subgraphURLs: {},
			resolver,
		});
		const vault = new VaultTypeSubgraphAdapter({ subgraphURLs: {}, resolver });
		await account.fetchAccountVaults(1, address);
		await vault.fetchVaultFactories(1, [address]);
		deploymentId = "second";
		await expect(account.fetchAccountVaults(1, address)).rejects.toMatchObject({
			reason: "source-changed",
		});
		await expect(vault.fetchVaultFactories(1, [address])).rejects.toMatchObject(
			{ reason: "source-changed" },
		);
		expect(graph).toHaveBeenCalledTimes(2);
		await account.fetchAccountVaults(1, address);
		await vault.fetchVaultFactories(1, [address]);
		expect(graph).toHaveBeenCalledTimes(4);
	});
	it("backs off failed refresh without extending maximum last-good age", async () => {
		let now = 0;
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(json(catalog(active)))
			.mockRejectedValue(new Error("offline"));
		const resolver = createSubgraphCatalogResolver({
			fetch,
			now: () => now,
			freshMs: 1,
			maxAgeMs: 5,
			retryMs: 10,
		});
		await resolver.resolve(1, "account-vault-discovery");
		now = 2;
		await resolver.resolve(1, "account-vault-discovery");
		now = 4;
		await resolver.resolve(1, "account-vault-discovery");
		now = 5;
		await expect(
			resolver.resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "source-failed" });
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("uses purpose-specific injected resolvers ahead of the catalog and never calls its fetch", async () => {
		const graph = graphFetch();
		const fetch = vi.fn();
		const sdk = await buildEulerSDK({
			config: {
				subgraphCatalog: { fetch },
				accountServiceAdapter: "onchain",
				vaultTypeAdapter: "subgraph",
			},
			accountVaultsAdapterConfig: {
				subgraphURLs: {},
				resolver: {
					resolve: async () => ({
						endpoint: "/account-custom",
						deploymentId: active.deploymentId,
					}),
				},
			},
			vaultTypeAdapterConfig: {
				subgraphURLs: {},
				resolver: {
					resolve: async () => ({
						endpoint: "/vault-custom",
						deploymentId: active.deploymentId,
					}),
				},
			},
			servicesOverrides: { deploymentService },
		});
		await sdk.accountService.fetchAccount(1, address, {
			populateVaults: false,
		});
		await sdk.vaultMetaService.fetchVaultType(1, address);
		expect(graph.mock.calls.map(([url]) => url)).toEqual([
			"/account-custom",
			"/vault-custom",
		]);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("row diagnostics and response identity", () => {
	it("quarantines malformed unidentified rows without blocking a valid chain", async () => {
		const snapshot = catalog(null, { ...active, chainId: -1 }, active);
		const parsed = parseSubgraphCatalog(snapshot);
		expect(parsed.diagnostics).toHaveLength(2);
		await expect(
			createSubgraphCatalogResolver({ catalog: snapshot }).resolve(
				1,
				"account-vault-discovery",
			),
		).resolves.toMatchObject({ deploymentId: active.deploymentId });
	});
	it.each([
		{ sourceCommit: "short" },
		{ interfacesCommit: "invalid" },
		{ version: "01.2.3" },
	])("quarantines invalid provenance/version %j", async (changes) => {
		await expect(
			createSubgraphCatalogResolver({
				catalog: catalog({ ...active, ...changes }),
			}).resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "invalid" });
	});
	it("requires timezone in envelope timestamps", () => {
		expect(() =>
			parseSubgraphCatalog({
				...catalog(active),
				publishedAt: "2026-10-19T00:00:00",
			}),
		).toThrow();
	});
	it.each([
		undefined,
		{ deployment: "wrong-deployment" },
	])("rejects absent or mismatched actual deployment %j", async (_meta) => {
		const graph = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async () =>
				json({ data: { trackingActiveAccounts: [], vaults: [], _meta } }),
			);
		const resolver = createSubgraphCatalogResolver({
			catalog: catalog(active),
		});
		await expect(
			new AccountVaultsSubgraphAdapter({
				subgraphURLs: {},
				resolver,
			}).fetchAccountVaults(1, address),
		).rejects.toThrow();
		await expect(
			new VaultTypeSubgraphAdapter({
				subgraphURLs: {},
				resolver,
			}).fetchVaultFactories(1, [address]),
		).rejects.toThrow();
		expect(JSON.parse(String(graph.mock.calls[0][1]?.body)).query).toContain(
			"_meta { deployment }",
		);
	});
	it.each([false, true])(
		"checks every catalog account page and rejects a changed deployment: %s",
		async (changeDeployment) => {
			const accounts = Array.from({ length: 1001 }, (_, index) =>
				getAddress(`0x${(BigInt(index + 1) << 8n).toString(16).padStart(40, "0")}`),
			);
			const byPrefix = new Map(
				accounts.map((account) => [account.toLowerCase().slice(0, 40), account]),
			);
			const pages: string[][] = [];
			vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
				expect(url).toBe(active.endpoint);
				const request = JSON.parse(String(init?.body)) as {
					query: string;
					variables: { ids: string[] };
				};
				pages.push(request.variables.ids);
				expect(request.query).toContain("_meta { deployment }");
				const first = Number(
					request.query.match(/trackingActiveAccounts\(first:\s*(\d+)/)?.[1] ?? 100,
				);
				expect(first).toBeLessThanOrEqual(1000);
				return json({
					data: {
						_meta: {
							deployment:
								changeDeployment && pages.length === 2
									? "replacement"
									: active.deploymentId,
						},
						trackingActiveAccounts: request.variables.ids
							.slice(0, first)
							.map((id) => ({
								id,
								deposits: [`${byPrefix.get(id.toLowerCase())}${address.slice(2)}`],
								borrows: [],
							})),
					},
				});
			});
			const adapter = new AccountVaultsSubgraphAdapter({
				subgraphURLs: {},
				resolver: createSubgraphCatalogResolver({ catalog: catalog(active) }),
			});
			const results = await Promise.allSettled(
				accounts.map((account) => adapter.fetchAccountVaults(1, account)),
			);
			for (const [index, account] of accounts.entries()) {
				if (changeDeployment) {
					expect(results[index]).toMatchObject({
						status: "rejected",
						reason: { reason: "source-changed" },
					});
				} else {
					expect(results[index]).toEqual({
						status: "fulfilled",
						value: { [account]: { deposits: [address], borrows: [] } },
					});
				}
			}
			expect(pages.map((page) => page.length)).toEqual([1000, 1]);
			expect(pages.flat()).toEqual([...byPrefix.keys()]);
		},
	);
	it("rejects a factory page served by a different deployment", async () => {
		const graph = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				json({
					data: { vaults: [], _meta: { deployment: active.deploymentId } },
				}),
			)
			.mockResolvedValueOnce(
				json({ data: { vaults: [], _meta: { deployment: "switched" } } }),
			);
		const resolver = createSubgraphCatalogResolver({
			catalog: catalog(active),
		});
		const addresses = Array.from(
			{ length: 1001 },
			(_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
		);
		await expect(
			new VaultTypeSubgraphAdapter({
				subgraphURLs: {},
				resolver,
			}).fetchVaultFactories(1, addresses),
		).rejects.toMatchObject({ reason: "source-changed" });
		expect(graph).toHaveBeenCalledTimes(2);
	});
	it("does not require or request metadata for explicit custom endpoints", async () => {
		const graph = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async () =>
				json({ data: { trackingActiveAccounts: [], vaults: [] } }),
			);
		const resolver = { resolve: vi.fn() };
		await new AccountVaultsSubgraphAdapter({
			subgraphURLs: { 1: "/proxy" },
			resolver,
		}).fetchAccountVaults(1, address);
		await new VaultTypeSubgraphAdapter({
			subgraphURLs: { 1: "/proxy" },
			resolver,
		}).fetchVaultFactories(1, [address]);
		expect(resolver.resolve).not.toHaveBeenCalled();
		for (const [, init] of graph.mock.calls)
			expect(JSON.parse(String(init?.body)).query).not.toContain("_meta");
	});
	it("isolates concurrent chain failures while coalescing valid same-chain reads", async () => {
		const graph = graphFetch();
		const resolver = createSubgraphCatalogResolver({
			catalog: catalog(active, { ...active, chainId: 2, status: "retired" }),
		});
		const account = new AccountVaultsSubgraphAdapter({
			subgraphURLs: {},
			resolver,
		});
		const vault = new VaultTypeSubgraphAdapter({ subgraphURLs: {}, resolver });
		const results = await Promise.allSettled([
			account.fetchAccountVaults(1, address),
			account.fetchAccountVaults(2, address),
			account.fetchAccountVaults(1, address),
			vault.fetchVaultFactories(1, [address]),
			vault.fetchVaultFactories(2, [address]),
			vault.fetchVaultFactories(1, [address]),
		]);
		expect(results.map((result) => result.status)).toEqual([
			"fulfilled",
			"rejected",
			"fulfilled",
			"fulfilled",
			"rejected",
			"fulfilled",
		]);
		expect(graph).toHaveBeenCalledTimes(2);
	});
});

describe("custom query pipelines and deadline", () => {
	it("preserves explicit-map query wrappers alongside uncached catalog reads", async () => {
		const graph = graphFetch();
		const wrapped = vi.fn();
		const buildQuery: BuildQueryFn = (name, fn) =>
			((...args: Parameters<typeof fn>) => {
				wrapped(name);
				return fn(...args);
			}) as typeof fn;
		const sdk = await buildEulerSDK({
			config: {
				accountServiceAdapter: "onchain",
				vaultTypeAdapter: "subgraph",
				subgraphCatalog: { catalog: catalog(active) },
				accountVaultsSubgraphUrls: { 2: "/configured-account" },
				vaultTypeSubgraphUrls: { 2: "/configured-factory" },
			},
			buildQuery,
			servicesOverrides: { deploymentService },
		});
		await sdk.accountService.fetchAccount(1, address, {
			populateVaults: false,
		});
		await sdk.vaultMetaService.fetchVaultType(1, address);
		expect(wrapped).not.toHaveBeenCalled();
		await sdk.accountService.fetchAccount(2, address, {
			populateVaults: false,
		});
		await sdk.vaultMetaService.fetchVaultType(2, address);
		expect(wrapped.mock.calls.map(([name]) => name)).toEqual([
			"queryAccountVaults",
			"queryVaultFactories",
		]);
		expect(graph).toHaveBeenCalledTimes(4);
	});
	it("bounds custom metadata fetch even when it ignores abort", async () => {
		const fetch = vi.fn(() => new Promise<Response>(() => {}));
		const resolver = createSubgraphCatalogResolver({ fetch, timeoutMs: 5 });
		await expect(
			resolver.resolve(1, "account-vault-discovery"),
		).rejects.toMatchObject({ reason: "source-failed" });
		expect(fetch.mock.calls[0]).toBeDefined();
	});
});

describe("caller-owned source provenance", () => {
	const first = { endpoint: "/graph-a", deploymentId: "deployment-a" };
	const second = { endpoint: "/graph-b", deploymentId: "deployment-b" };
	const otherAddress = "0x0000000000000000000000000000000000000101";
	const setup = (buildQuery?: BuildQueryFn) => {
		let current = first;
		const resolver = { resolve: vi.fn(async () => current) };
		const urls: Record<number, string | false> = {};
		const account = new AccountVaultsSubgraphAdapter(
			{ subgraphURLs: urls, resolver },
			buildQuery,
		);
		const vault = new VaultTypeSubgraphAdapter(
			{ subgraphURLs: urls, resolver },
			buildQuery,
		);
		const graph = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (_url, init) => {
				const ids = JSON.parse(String(init?.body)).variables.ids as string[];
				return json({
					data: {
						_meta: { deployment: current.deploymentId },
						trackingActiveAccounts: [],
						vaults: ids.map((id) => ({ id, factory: address })),
					},
				});
			});
		return {
			account,
			vault,
			urls,
			resolver,
			graph,
			change: (source = second) => {
				current = source;
			},
		};
	};

	it.each([
		"account",
		"vault",
	] as const)("keeps %s poll protection after an unrelated read consumes the shared notice", async (kind) => {
		const { account, vault, graph, change } = setup();
		const read = (
			target: typeof address | typeof otherAddress,
			expectedSource?: typeof first,
		) =>
			kind === "account"
				? account.fetchAccountVaultsWithSource(1, target, { expectedSource })
				: vault.fetchVaultFactoriesWithSource(1, [target], { expectedSource });
		const simple = (target: typeof address | typeof otherAddress) =>
			kind === "account"
				? account.fetchAccountVaults(1, target)
				: vault.fetchVaultFactories(1, [target]);
		await simple(address);
		const baseline = await read(address);
		expect(baseline.source).toEqual(first);
		change();
		await expect(simple(otherAddress)).rejects.toMatchObject({
			reason: "source-changed",
		});
		await simple(otherAddress);
		const count = graph.mock.calls.length;
		await expect(read(address, baseline.source)).rejects.toMatchObject({
			reason: "source-changed",
		});
		await expect(read(address, baseline.source)).rejects.toMatchObject({
			reason: "source-changed",
		});
		expect(graph).toHaveBeenCalledTimes(count);
		const restarted = await read(address);
		expect(restarted.source).toEqual(second);
		await expect(read(address, restarted.source)).resolves.toMatchObject({
			source: second,
		});
	});

	it.each([
		"endpoint",
		"deploymentId",
	] as const)("checks caller-owned %s independently and isolates conflicting batched expectations", async (field) => {
		const wrapped = vi.fn();
		const buildQuery: BuildQueryFn = (_name, fn) =>
			((...args: Parameters<typeof fn>) => {
				wrapped();
				return fn(...args);
			}) as typeof fn;
		const { account, vault, graph, change } = setup(buildQuery);
		const baseline = await account.fetchAccountVaultsWithSource(1, address);
		const next = { ...first, [field]: second[field] };
		change(next);
		const results = await Promise.allSettled([
			account.fetchAccountVaultsWithSource(1, address, {
				expectedSource: baseline.source,
			}),
			account.fetchAccountVaultsWithSource(1, address, {
				expectedSource: next,
			}),
			account.fetchAccountVaultsWithSource(1, otherAddress, {
				expectedSource: { ...next },
			}),
			vault.fetchVaultFactoriesWithSource(1, [address], {
				expectedSource: baseline.source,
			}),
			vault.fetchVaultFactoriesWithSource(1, [address], {
				expectedSource: next,
			}),
			vault.fetchVaultFactoriesWithSource(1, [otherAddress], {
				expectedSource: { ...next },
			}),
		]);
		expect(results.map((result) => result.status)).toEqual([
			"rejected",
			"fulfilled",
			"fulfilled",
			"rejected",
			"fulfilled",
			"fulfilled",
		]);
		for (const index of [0, 3])
			expect(results[index]).toMatchObject({
				reason: { reason: "source-changed" },
			});
		for (const index of [1, 2, 4, 5])
			expect(results[index]).toMatchObject({ value: { source: next } });
		expect(graph).toHaveBeenCalledTimes(3);
		expect(wrapped).not.toHaveBeenCalled();
	});

	it("keeps explicit transport and wrappers, and rejects expectations when an explicit override takes over", async () => {
		const wrapped = vi.fn();
		const buildQuery: BuildQueryFn = (name, fn) =>
			((...args: Parameters<typeof fn>) => {
				wrapped(name);
				return fn(...args);
			}) as typeof fn;
		const { account, vault, urls, resolver, graph } = setup(buildQuery);
		const baseline = await account.fetchAccountVaultsWithSource(1, address);
		urls[1] = "/fork-proxy";
		graph.mockImplementation(async () =>
			json({ data: { trackingActiveAccounts: [], vaults: [] } }),
		);
		await expect(
			account.fetchAccountVaultsWithSource(1, address),
		).resolves.toEqual({ value: {} });
		await expect(
			vault.fetchVaultFactoriesWithSource(1, [address]),
		).resolves.toEqual({ value: [] });
		expect(wrapped.mock.calls.map(([name]) => name)).toEqual([
			"queryAccountVaults",
			"queryVaultFactories",
		]);
		expect(resolver.resolve).toHaveBeenCalledTimes(1);
		for (const [, init] of graph.mock.calls.slice(1))
			expect(JSON.parse(String(init?.body)).query).not.toContain("_meta");
		await expect(
			account.fetchAccountVaultsWithSource(1, address, {
				expectedSource: baseline.source,
			}),
		).rejects.toMatchObject({ reason: "source-changed" });
		await expect(
			vault.fetchVaultFactoriesWithSource(1, [address], {
				expectedSource: baseline.source,
			}),
		).rejects.toMatchObject({ reason: "source-changed" });
		expect(graph).toHaveBeenCalledTimes(3);
		urls[1] = false;
		await expect(
			account.fetchAccountVaultsWithSource(1, address),
		).rejects.toMatchObject({ reason: "disabled" });
		await expect(
			vault.fetchVaultFactoriesWithSource(1, [address]),
		).rejects.toMatchObject({ reason: "disabled" });
		expect(graph).toHaveBeenCalledTimes(3);
	});

	it.each([
		"setter",
		"property",
	] as const)("honors custom query %s overrides without claiming provenance", async (method) => {
		const { account, vault, resolver, graph, urls } = setup();
		urls[1] = false;
		const accountQuery = vi.fn(async () => ({
			data: { trackingActiveAccount: null },
		}));
		const vaultQuery = vi.fn(async () => ({ id: address, factory: address }));
		if (method === "setter") {
			account.setQueryAccountVaults(accountQuery);
			vault.setQueryVaultFactories(vaultQuery);
		} else {
			account.queryAccountVaults = accountQuery;
			vault.queryVaultFactories = vaultQuery;
		}
		await expect(
			account.fetchAccountVaultsWithSource(1, address),
		).resolves.toEqual({ value: {} });
		await expect(
			vault.fetchVaultFactoriesWithSource(1, [address]),
		).resolves.toEqual({ value: [{ id: address, factory: address }] });
		await expect(
			account.fetchAccountVaultsWithSource(1, address, {
				expectedSource: first,
			}),
		).rejects.toMatchObject({ reason: "source-changed" });
		await expect(
			vault.fetchVaultFactoriesWithSource(1, [address], {
				expectedSource: first,
			}),
		).rejects.toMatchObject({ reason: "source-changed" });
		expect(accountQuery).toHaveBeenCalledTimes(1);
		expect(vaultQuery).toHaveBeenCalledTimes(1);
		expect(resolver.resolve).not.toHaveBeenCalled();
		expect(graph).not.toHaveBeenCalled();
	});

	it.each([
		true,
		false,
	])("prioritizes explicit disable for built-in reads with resolver=%s", async (hasResolver) => {
		const graph = graphFetch();
		const resolver = { resolve: vi.fn(async () => first) };
		const config = {
			subgraphURLs: { 1: false as const },
			...(hasResolver ? { resolver } : {}),
		};
		const account = new AccountVaultsSubgraphAdapter(config);
		const vault = new VaultTypeSubgraphAdapter(config);
		for (const expectedSource of [undefined, first]) {
			await expect(
				account.fetchAccountVaultsWithSource(1, address, { expectedSource }),
			).rejects.toMatchObject({ reason: "disabled" });
			await expect(
				vault.fetchVaultFactoriesWithSource(1, [address], { expectedSource }),
			).rejects.toMatchObject({ reason: "disabled" });
			await expect(
				vault.fetchVaultFactoriesWithSource(1, [], { expectedSource }),
			).rejects.toMatchObject({ reason: "disabled" });
		}
		expect(graph).not.toHaveBeenCalled();
		expect(resolver.resolve).not.toHaveBeenCalled();
	});

	it("does not claim catalog provenance without a resolver", async () => {
		const graph = graphFetch();
		const account = new AccountVaultsSubgraphAdapter({
			subgraphURLs: { 1: "/direct" },
		});
		const vault = new VaultTypeSubgraphAdapter({
			subgraphURLs: { 1: "/direct" },
		});
		await expect(
			account.fetchAccountVaultsWithSource(1, address),
		).resolves.toEqual({ value: {} });
		await expect(
			vault.fetchVaultFactoriesWithSource(1, [address]),
		).resolves.toEqual({ value: [] });
		await expect(
			account.fetchAccountVaultsWithSource(1, address, {
				expectedSource: first,
			}),
		).rejects.toMatchObject({ reason: "source-changed" });
		await expect(
			vault.fetchVaultFactoriesWithSource(1, [address], {
				expectedSource: first,
			}),
		).rejects.toMatchObject({ reason: "source-changed" });
		expect(graph).toHaveBeenCalledTimes(2);
	});

	it("validates every source-aware page and does not return a partial result", async () => {
		const { account, vault, graph } = setup();
		const accounts = Array.from({ length: 1001 }, (_, i) =>
			getAddress(`0x${(BigInt(i + 1) << 8n).toString(16).padStart(40, "0")}`),
		);
		let page = 0;
		graph.mockImplementation(async () =>
			json({
				data: {
					_meta: {
						deployment: ++page % 2 ? first.deploymentId : second.deploymentId,
					},
					trackingActiveAccounts: [],
					vaults: [],
				},
			}),
		);
		const results = await Promise.allSettled(
			accounts.map((target) =>
				account.fetchAccountVaultsWithSource(1, target, {
					expectedSource: first,
				}),
			),
		);
		for (const result of results)
			expect(result).toMatchObject({
				status: "rejected",
				reason: { reason: "source-changed" },
			});
		await expect(
			vault.fetchVaultFactoriesWithSource(1, accounts, {
				expectedSource: first,
			}),
		).rejects.toMatchObject({ reason: "source-changed" });
		expect(graph).toHaveBeenCalledTimes(4);
	});
});


describe("imported deployment metadata", () => {
	it("resolves imports and preserves deployment checks without build provenance", async () => {
		const imported = { ...active };
		delete (imported as Partial<typeof active>).sourceCommit;
		delete (imported as Partial<typeof active>).startBlock;
		const resolver = createSubgraphCatalogResolver({ catalog: catalog(imported) });
		expect(await resolver.resolve(1, "account-vault-discovery")).toEqual({ endpoint: active.endpoint, deploymentId: active.deploymentId });
		const fetch = graphFetch();
		const adapter = new AccountVaultsSubgraphAdapter({ subgraphURLs: {}, resolver });
		const baseline = await adapter.fetchAccountVaultsWithSource(1, address);
		expect(baseline.source).toEqual({ endpoint: active.endpoint, deploymentId: active.deploymentId });
		fetch.mockResolvedValue(json({ data: { trackingActiveAccounts: [], _meta: { deployment: "wrong-deployment" } } }));
		await expect(adapter.fetchAccountVaults(1, address)).rejects.toMatchObject({ reason: "source-changed" });
	});
	it.each([{ sourceCommit: null }, { sourceCommit: "" }, { sourceCommit: 1 }, { startBlock: null }, { startBlock: "0" }, { startBlock: -1 }, { startBlock: Number.MAX_SAFE_INTEGER + 1 }])("rejects malformed supplied build metadata: %j", async change => {
		await expect(createSubgraphCatalogResolver({ catalog: catalog({ ...active, ...change }) }).resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "invalid" });
	});
});
