import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AccountVaultsSubgraphAdapter,
	VaultTypeSubgraphAdapter,
	buildEulerSDK,
	createQueryCacheBuildQuery,
	withSubgraphQueries,
	type BuildQueryFn,
	type IDeploymentService,
	type SubgraphQuerySources,
	type SubgraphReadOptions,
} from "../src/index.js";

const account = "0x0000000000000000000000000000000000000100" as const;
const vault = "0x0000000000000000000000000000000000000001" as const;
const factory = "0x0000000000000000000000000000000000000002" as const;
const catalogSource = { endpoint: "https://native.example/graph", deploymentId: "native" };
const pass: BuildQueryFn = (_name, fn) => fn;
const logging = (build: BuildQueryFn, log = vi.fn()): BuildQueryFn =>
	(name, fn, target, context) => {
		const query = build(name, fn, target, context);
		return ((...args: Parameters<typeof fn>) => {
			log(name);
			return query(...args);
		}) as typeof fn;
	};
const response = (init?: RequestInit, deployment = "custom", positions = true) => {
	const { variables: { ids } } = JSON.parse(String(init?.body)) as { variables: { ids: string[] } };
	return Response.json({ data: {
		_meta: { deployment, block: { number: 100 } },
		trackingActiveAccounts: positions ? ids.map(id => ({ id, deposits: [`${id}00${vault.slice(2)}`], borrows: [] })) : [],
		vaults: ids.map(id => ({ id, factory })),
	} }, { headers: { "x-source": deployment } });
};
type Kind = "account" | "factory";
const expected = (kind: Kind) => kind === "account"
	? { [account]: { deposits: [vault], borrows: [] } }
	: [{ id: vault, factory }];
const adapter = (kind: Kind, buildQuery?: BuildQueryFn, native?: string | false) => {
	const resolve = vi.fn(async () => catalogSource);
	const config = { subgraphURLs: native === undefined ? {} : { 1: native }, resolver: { resolve } };
	const target = kind === "account"
		? new AccountVaultsSubgraphAdapter(config, buildQuery)
		: new VaultTypeSubgraphAdapter(config, buildQuery);
	return {
		target,
		resolve,
		read: () => target instanceof AccountVaultsSubgraphAdapter
			? target.fetchAccountVaults(1, account)
			: target.fetchVaultFactories(1, [vault]),
		readWithSource: (options?: SubgraphReadOptions) => target instanceof AccountVaultsSubgraphAdapter
			? target.fetchAccountVaultsWithSource(1, account, options)
			: target.fetchVaultFactoriesWithSource(1, [vault], options),
	};
};
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unexpected global fetch"); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(["account", "factory"] as const)("composed %s source queries", kind => {
	it.each([
		{ mode: "map", native: undefined },
		{ mode: "resolver", native: undefined },
		{ mode: "map", native: false },
		{ mode: "resolver", native: false },
		{ mode: "map", native: "/native-override" },
		{ mode: "resolver", native: "/native-override" },
	])("preserves $mode transport through outer wrappers with native=$native", async ({ mode, native }) => {
		const forbidden = vi.fn(() => { throw new Error("native transport must not run"); });
		vi.stubGlobal("fetch", forbidden);
		const transport = vi.fn<typeof globalThis.fetch>(async (url, init) => {
			expect(url).toBe("/private/proxy");
			expect(init).toMatchObject({ redirect: "error", headers: { authorization: "test-token" } });
			expect(init?.signal).toBeInstanceOf(AbortSignal);
			return response(init);
		});
		const getResponseIdentity = vi.fn((value: Response) => value.headers.get("x-source") ?? undefined);
		const sources: SubgraphQuerySources = mode === "map"
			? { 1: "/private/proxy" }
			: async () => ({ endpoint: "/private/proxy", deploymentId: "custom", identity: "configured" });
		const sourceBuilder = withSubgraphQueries(createQueryCacheBuildQuery(), sources, {
			fetch: (url, init) => transport(url, { ...init, headers: { ...init?.headers, authorization: "test-token" }, redirect: "error", signal: AbortSignal.timeout(1000) }),
			includeMeta: true,
			getResponseIdentity,
		});
		const outerCalls = vi.fn();
		const instance = adapter(kind, logging(logging(sourceBuilder), outerCalls), native);
		await expect(instance.read()).resolves.toEqual(expected(kind));
		await expect(instance.readWithSource()).resolves.toEqual({ value: expected(kind) });
		await expect(instance.readWithSource({ expectedSource: catalogSource })).rejects.toMatchObject({ reason: "source-changed" });
		expect(transport).toHaveBeenCalledOnce();
		expect(getResponseIdentity).toHaveBeenCalledOnce();
		expect(outerCalls).toHaveBeenCalledTimes(2);
		expect(instance.resolve).not.toHaveBeenCalled();
		expect(forbidden).not.toHaveBeenCalled();
	});

	it("preserves source overrides under an outer application cache", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => response(init));
		const source = withSubgraphQueries(pass, { 1: "/private/proxy" }, { fetch });
		const cache = createQueryCacheBuildQuery();
		const build: BuildQueryFn = (name, fn, target, context) =>
			cache(name, source(name, fn, target, context), target, context);
		const instance = adapter(kind, build);
		await expect(instance.read()).resolves.toEqual(expected(kind));
		await expect(instance.readWithSource()).resolves.toEqual({ value: expected(kind) });
		expect(fetch).toHaveBeenCalledOnce();
		expect(instance.resolve).not.toHaveBeenCalled();
	});

	it.each([false, undefined] as const)("fails closed for configured source %s instead of using the adapter catalog", async value => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const sources: SubgraphQuerySources = value === false ? { 1: false } : {};
		const instance = adapter(kind, logging(withSubgraphQueries(pass, sources, { fetch })), "/native-override");
		const reason = value === false ? "disabled" : "missing";
		await expect(instance.read()).rejects.toMatchObject({ reason });
		await expect(instance.readWithSource()).rejects.toMatchObject({ reason });
		expect(fetch).not.toHaveBeenCalled();
		expect(instance.resolve).not.toHaveBeenCalled();
	});

	it.each(["setter", "property"] as const)("preserves later %s overrides without catalog provenance", async method => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const instance = adapter(kind, logging(withSubgraphQueries(pass, { 1: false }, { fetch })), false);
		const { target } = instance;
		if (target instanceof AccountVaultsSubgraphAdapter) {
			const query = async () => ({ data: { trackingActiveAccount: { deposits: [`${account}${vault.slice(2)}`], borrows: [] } } });
			if (method === "setter") target.setQueryAccountVaults(query);
			else target.queryAccountVaults = query;
		} else {
			const query = async () => ({ id: vault, factory });
			if (method === "setter") target.setQueryVaultFactories(query);
			else target.queryVaultFactories = query;
		}
		await expect(instance.read()).resolves.toEqual(expected(kind));
		await expect(instance.readWithSource()).resolves.toEqual({ value: expected(kind) });
		await expect(instance.readWithSource({ expectedSource: catalogSource })).rejects.toMatchObject({ reason: "source-changed" });
		expect(fetch).not.toHaveBeenCalled();
		expect(instance.resolve).not.toHaveBeenCalled();
	});

	it("isolates target/query associations and preserves native catalog freshness", async () => {
		const sourceBuilder = logging(withSubgraphQueries(pass, { 1: "/private/proxy" }));
		adapter(kind, sourceBuilder);
		const native = adapter(kind, logging(createQueryCacheBuildQuery()));
		// A different query name on the same target must not change its source policy.
		sourceBuilder(kind === "account" ? "queryVaultFactories" : "queryAccountVaults", async () => undefined, native.target);
		vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (_url, init) => response(init, "native")));
		await expect(native.readWithSource()).resolves.toEqual({ value: expected(kind), source: catalogSource });
		native.resolve.mockRejectedValueOnce(new Error("retired source"));
		await expect(native.read()).rejects.toThrow("retired source");
		expect(native.resolve).toHaveBeenCalledTimes(2);
	});

	it("resolves dynamic sources before the supplied inner cache through an outer wrapper", async () => {
		let deployment = "first";
		const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => response(init, deployment));
		const build = logging(withSubgraphQueries(createQueryCacheBuildQuery(), async () => ({ endpoint: "/private/proxy", deploymentId: deployment }), { fetch }));
		const instance = adapter(kind, build);
		await instance.read();
		await instance.read();
		expect(fetch).toHaveBeenCalledOnce();
		deployment = "second";
		await instance.read();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(instance.resolve).not.toHaveBeenCalled();
	});
});

it.each(["map", "resolver"] as const)("keeps composed %s overrides in buildEulerSDK service and source-aware paths", async mode => {
	const forbidden = vi.fn(() => { throw new Error("native transport must not run"); });
	vi.stubGlobal("fetch", forbidden);
	const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => response(init, "custom", false));
	const sources: SubgraphQuerySources = mode === "map"
		? { 1: "/private/proxy" }
		: async () => ({ endpoint: "/private/proxy", deploymentId: "custom" });
	const sourceBuilder = logging(withSubgraphQueries(createQueryCacheBuildQuery(), sources, { fetch }));
	const targets: { account?: AccountVaultsSubgraphAdapter; factory?: VaultTypeSubgraphAdapter } = {};
	const buildQuery: BuildQueryFn = (name, fn, target, context) => {
		if (target instanceof AccountVaultsSubgraphAdapter) targets.account = target;
		if (target instanceof VaultTypeSubgraphAdapter) targets.factory = target;
		return sourceBuilder(name, fn, target, context);
	};
	const deploymentService: IDeploymentService = {
		getDeploymentChainIds: () => [],
		getDeployment: () => { throw new Error("not used"); },
		addDeployment: () => {},
	};
	const sdk = await buildEulerSDK({
		config: {
			accountServiceAdapter: "onchain",
			vaultTypeAdapter: "subgraph",
			subgraphCatalog: { catalog: {
				schemaVersion: 1,
				revision: "native",
				publishedAt: "2026-10-27T00:00:00Z",
				deployments: [{ chainId: 1, family: "euler-simple", channel: "stable", status: "active", version: "1.0.0", ...catalogSource, capabilities: ["account-vault-discovery", "vault-factory-lookup"] }],
			} },
		},
		buildQuery,
		servicesOverrides: { deploymentService },
	});
	await sdk.accountService.fetchAccount(1, account, { populateVaults: false });
	await sdk.vaultMetaService.fetchVaultType(1, vault);
	await expect(targets.account!.fetchAccountVaultsWithSource(1, account)).resolves.toEqual({ value: {} });
	await expect(targets.factory!.fetchVaultFactoriesWithSource(1, [vault])).resolves.toEqual({ value: [{ id: vault, factory }] });
	expect(fetch).toHaveBeenCalledTimes(2);
	expect(forbidden).not.toHaveBeenCalled();
});
