import { afterEach, expect, it, vi } from "vitest";
import { createSubgraphCatalogResolver } from "../src/index.js";
const row = { chainId: 1, family: "euler-simple", channel: "stable", status: "active", version: "1.2.3", endpoint: "https://graph.example", deploymentId: "A", capabilities: ["account-vault-discovery"] };
const catalog = () => ({ schemaVersion: 1, revision: "r1", publishedAt: "2026-10-26T00:00:00Z", deployments: [row] });
afterEach(() => vi.useRealTimers());
it("cancels oversized metadata streams before consuming all chunks", async () => {
  let pulls = 0;
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const body = new ReadableStream({ pull(controller) { if (pulls++ < 5) controller.enqueue(new Uint8Array(400_000)); else controller.close(); }, cancel }, { highWaterMark: 0 });
  const resolver = createSubgraphCatalogResolver({ fetch: async () => new Response(body) });
  await expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
  expect(pulls).toBe(3); expect(cancel).toHaveBeenCalledOnce();
});
it("preserves UTF-8 across chunks and accepts exactly the configured byte limit", async () => {
  const payload = { ...catalog(), revision: "€" };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const split = bytes.indexOf(0xe2) + 1;
  const chunks = [bytes.subarray(0, split), bytes.subarray(split)];
  const body = new ReadableStream({ pull(controller) { const next = chunks.shift(); if (next) controller.enqueue(next); else controller.close(); } });
  const fetch = vi.fn(async (_url, init) => { expect(init?.redirect).toBe("error"); return new Response(body); }) as unknown as typeof globalThis.fetch;
  await expect(createSubgraphCatalogResolver({ fetch, maxResponseBytes: bytes.byteLength }).resolve(1, "account-vault-discovery")).resolves.toMatchObject({ deploymentId: "A" });
});
it("rejects multibyte metadata using bytes rather than characters", async () => {
  const payload = { ...catalog(), revision: "€".repeat(100) };
  const text = JSON.stringify(payload);
  const resolver = createSubgraphCatalogResolver({ fetch: async () => Response.json(payload), maxResponseBytes: text.length });
  await expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
});
it("bounds stalled bodies and prevents late results from refreshing the cache", async () => {
  vi.useFakeTimers();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const fetch = vi.fn().mockResolvedValue(new Response(body));
  const resolver = createSubgraphCatalogResolver({ fetch, timeoutMs: 10, retryMs: 1000 });
  const read = expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
  await vi.advanceTimersByTimeAsync(10); await read;
  expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  controller.enqueue(new TextEncoder().encode(JSON.stringify(catalog()))); controller.close();
  await Promise.resolve();
  await expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
  expect(fetch).toHaveBeenCalledOnce();
});
it.each([0, -1, 1.5, Infinity])("rejects invalid byte budgets: %s", maxResponseBytes => {
  expect(() => createSubgraphCatalogResolver({ maxResponseBytes })).toThrow();
});
