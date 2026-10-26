import { afterEach, describe, expect, it, vi } from "vitest";
import { type Address, getAddress } from "viem";
import { AccountVaultsSubgraphAdapter, VaultTypeSubgraphAdapter, createQueryCacheBuildQuery, withSubgraphQueries, type BuildQueryFn, type SubgraphQueryOptions } from "../src/index.js";

const address = "0x0000000000000000000000000000000000000001" as const;
const owners = (count: number) => Array.from({ length: count }, (_, i) => `0x${(i + 1).toString(16).padStart(38, "0")}00` as Address);
const pass: BuildQueryFn = (_name, fn) => fn;
const page = (ids: string[], deployment = "A", block = 100) => ({ data: { _meta: { deployment, block: { number: block } }, trackingActiveAccounts: ids.map(id => ({ id, deposits: [`${id}00${address.slice(2)}`], borrows: [] })), vaults: ids.map(id => ({ id, factory: address })) } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

for (const mode of ["native adapters", "query decorator"] as const) {
  describe(mode, () => {
    const adapters = (fetch: typeof globalThis.fetch) => {
      const queryOptions: SubgraphQueryOptions = { fetch, includeMeta: true, getResponseIdentity: response => response.headers.get("x-fork-source") ?? undefined };
      const config = { subgraphURLs: { 1: "/private/proxy" }, ...(mode === "native adapters" ? { queryOptions } : {}) };
      const build = mode === "native adapters" ? pass : withSubgraphQueries(pass, config.subgraphURLs, queryOptions);
      return { accounts: new AccountVaultsSubgraphAdapter(config, build), factories: new VaultTypeSubgraphAdapter(config, build) };
    };
    it("uses injected private transport and discovers 1001 owners with bounded pages", async () => {
      let calls = 0;
      const fetch = vi.fn(async (url, init) => {
        expect(url).toBe("/private/proxy");
        const { query, variables: { ids } } = JSON.parse(String(init?.body));
        expect(query).toContain("first: 1000");
        expect(ids.length).toBeLessThanOrEqual(1000);
        calls++;
        return Response.json(page(ids, "A", calls === 2 ? 90 : 100), { headers: { "x-fork-source": "opaque" } });
      }) as unknown as typeof globalThis.fetch;
      vi.stubGlobal("fetch", vi.fn(() => { throw new Error("default transport must not run"); }));
      const { accounts } = adapters(fetch);
      const inputs = owners(1001);
      const results = await Promise.all(inputs.map(owner => accounts.fetchAccountVaults(1, owner)));
      expect(results).toEqual(inputs.map(owner => ({ [getAddress(owner)]: { deposits: [address], borrows: [] } })));
      expect(calls).toBe(2);
    });
    it.each(["header", "deployment"])("rejects a changed %s between factory pages", async (kind) => {
      let calls = 0;
      const fetch = vi.fn(async (_url, init) => {
        const { variables: { ids } } = JSON.parse(String(init?.body));
        calls++;
        return Response.json(page(ids, kind === "deployment" && calls === 2 ? "B" : "A"), { headers: { "x-fork-source": kind === "header" && calls === 2 ? "B" : "A" } });
      }) as unknown as typeof globalThis.fetch;
      const { factories } = adapters(fetch);
      await expect(factories.fetchVaultFactories(1, owners(1001))).rejects.toMatchObject({ reason: "source-changed" });
      expect(calls).toBe(2);
    });
    it.each([
      { errors: [{ message: "unavailable" }] },
      { errors: "malformed", data: { trackingActiveAccounts: [] } },
      { data: { trackingActiveAccounts: [{ id: address.slice(0, 40), deposits: ["invalid"], borrows: [] }] } },
    ])("rejects malformed account payloads: %j", async payload => {
      const { accounts } = adapters(async () => Response.json(payload));
      await expect(accounts.fetchAccountVaults(1, address)).rejects.toThrow();
    });
    it("rejects unexpected factory rows instead of accepting an unrelated result", async () => {
      const { factories } = adapters(async () => Response.json({ data: { vaults: [{ id: owners(1)[0], factory: address }] } }));
      await expect(factories.fetchVaultFactories(1, [address])).rejects.toThrow("Vault type subgraph returned malformed vault data.");
    });
  });
}

describe("application cache and source policies", () => {
  it("resolves dynamic sources before the caller cache and keeps new older indexed data usable", async () => {
    let deploymentId = "A";
    const fetch = vi.fn(async () => Response.json({ data: { _meta: { deployment: deploymentId, block: { number: deploymentId === "A" ? 100 : 90 } }, trackingActiveAccounts: [] } }));
    const build = withSubgraphQueries(createQueryCacheBuildQuery(), async () => ({ endpoint: "/proxy", deploymentId }), { fetch });
    const adapter = new AccountVaultsSubgraphAdapter({ subgraphURLs: { 1: "/proxy" } }, build);
    await adapter.fetchAccountVaults(1, address);
    await adapter.fetchAccountVaults(1, address);
    expect(fetch).toHaveBeenCalledTimes(1);
    deploymentId = "B";
    await expect(adapter.fetchAccountVaults(1, address)).resolves.toEqual({});
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  describe.each(["accounts", "factories"] as const)("configured and proxy identity for %s", kind => {
    it.each([
      { headers: ["proxy-A", "proxy-A"], rejected: false },
      { headers: [undefined, undefined], rejected: false },
      { headers: ["proxy-A", "proxy-B"], rejected: true },
      { headers: ["proxy-A", undefined], rejected: true },
      { headers: [undefined, "proxy-A"], rejected: true },
    ])("checks proxy identity independently across pages: $headers", async ({ headers, rejected }) => {
      let calls = 0;
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        const { variables: { ids } } = JSON.parse(String(init?.body));
        const header = headers[calls++];
        return Response.json(page(ids, "A", calls === 2 ? 90 : 100), {
          headers: header === undefined ? {} : { "x-fork-source": header },
        });
      });
      const getResponseIdentity = vi.fn((response: Response) => response.headers.get("x-fork-source") ?? undefined);
      const build = withSubgraphQueries(pass, async () => ({
        endpoint: "/private/proxy",
        identity: "configured-source",
        deploymentId: "A",
      }), { fetch, includeMeta: true, getResponseIdentity });
      const config = { subgraphURLs: { 1: "/private/proxy" } };
      const inputs = owners(1001);
      const accounts = new AccountVaultsSubgraphAdapter(config, build);
      const factories = new VaultTypeSubgraphAdapter(config, build);
      const reads = kind === "accounts"
        ? inputs.map(owner => accounts.fetchAccountVaults(1, owner))
        : [factories.fetchVaultFactories(1, inputs)];
      const results = await Promise.allSettled(reads);
      expect(results.every(result => rejected
        ? result.status === "rejected" && result.reason.reason === "source-changed"
        : result.status === "fulfilled")).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(getResponseIdentity).toHaveBeenCalledTimes(2);
    });
  });
  it("preserves caller TTL and null-key opt-out", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const fetch = vi.fn(async () => Response.json({ data: { trackingActiveAccounts: [] } }));
    const build = withSubgraphQueries(createQueryCacheBuildQuery({ ttlMs: 1000 }), { 1: "/proxy" }, { fetch });
    const fn = async (_key: { chainId: number; account: Address }) => null;
    const key = { chainId: 1, account: address };
    const cached = build("queryAccountVaults", fn, {});
    await cached(key); await cached(key);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1000); await cached(key);
    expect(fetch).toHaveBeenCalledTimes(2);
    const getCacheKey = vi.fn(() => null);
    const uncached = build("queryAccountVaults", fn, {}, { getCacheKey });
    await uncached(key); await uncached(key);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(getCacheKey).toHaveBeenCalledWith([key]);
  });
  it("isolates chains, explicit disables and unrelated query overrides", async () => {
    const fetch = vi.fn(async () => Response.json({ data: { trackingActiveAccounts: [] } }));
    const build = withSubgraphQueries(pass, { 1: "/proxy", 2: false }, { fetch });
    const query = build("queryAccountVaults", async (_key: { chainId: number; account: Address }) => null, {});
    const results = await Promise.allSettled([query({ chainId: 1, account: address }), query({ chainId: 2, account: address }), query({ chainId: 3, account: address })]);
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]).toMatchObject({ status: "rejected", reason: { reason: "disabled" } });
    expect(results[2]).toMatchObject({ status: "rejected", reason: { reason: "missing" } });
    expect(fetch).toHaveBeenCalledOnce();
    const custom = vi.fn(async () => "custom labels");
    expect(build("queryPublicLabels", custom, {})).toBe(custom);
    await expect(custom()).resolves.toBe("custom labels");
  });
});

it("source decoration supports new chains and takes precedence over an adapter catalog", async () => {
  const resolver = { resolve: vi.fn(async () => { throw new Error("adapter catalog must not run"); }) };
  const sources = vi.fn(async (_chainId: number, capability: string) => ({ endpoint: `/fork/${capability}`, deploymentId: "fork" }));
  const fetch = vi.fn(async (_url, init) => {
    const { variables: { ids } } = JSON.parse(String(init?.body));
    return Response.json(page(ids, "fork"));
  }) as unknown as typeof globalThis.fetch;
  const build = withSubgraphQueries(createQueryCacheBuildQuery(), sources, { fetch });
  const accounts = new AccountVaultsSubgraphAdapter({ subgraphURLs: {}, resolver }, build);
  const factories = new VaultTypeSubgraphAdapter({ subgraphURLs: {} }, build);
  const account = owners(1)[0]!;
  await expect(accounts.fetchAccountVaultsWithSource(99999, account)).resolves.toMatchObject({ value: { [account]: { deposits: [address] } } });
  await expect(factories.fetchVaultFactories(99999, [address])).resolves.toEqual([{ id: address, factory: address }]);
  expect(sources).toHaveBeenCalledWith(99999, "account-vault-discovery");
  expect(sources).toHaveBeenCalledWith(99999, "vault-factory-lookup");
  expect(resolver.resolve).not.toHaveBeenCalled();
  await expect(accounts.fetchAccountVaultsWithSource(99999, account, { expectedSource: { endpoint: "other", deploymentId: "other" } })).rejects.toMatchObject({ reason: "source-changed" });
});
