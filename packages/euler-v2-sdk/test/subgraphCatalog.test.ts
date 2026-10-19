import { readFileSync } from "node:fs";
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
