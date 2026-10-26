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
it.each(["fulfilled", "rejected", "pending"])("cancels stalled bodies and releases readers on every timeout: %s cancellation", async mode => {
  vi.useFakeTimers();
  const bodies: ReadableStream<Uint8Array>[] = [];
  const cancel = vi.fn(() => mode === "pending" ? new Promise<void>(() => {})
    : mode === "rejected" ? Promise.reject(new Error("cancel failed")) : Promise.resolve());
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel });
    bodies.push(body);
    return new Response(body);
  });
  const resolver = createSubgraphCatalogResolver({ fetch, timeoutMs: 10, retryMs: 0 });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const read = expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
    await vi.advanceTimersByTimeAsync(10);
    await read;
    expect(fetch).toHaveBeenCalledTimes(attempt);
    expect(fetch.mock.calls[attempt - 1][1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(attempt);
    expect(bodies.every(body => !body.locked)).toBe(true);
  }
});
it("cancels a body arriving after timeout without reading it or refreshing the cache", async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(resolve => { finish = resolve; }));
  const resolver = createSubgraphCatalogResolver({ fetch, timeoutMs: 10, retryMs: 1000 });
  const read = expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
  await vi.advanceTimersByTimeAsync(10);
  await read;
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    controller.enqueue(new TextEncoder().encode(JSON.stringify(catalog())));
    controller.close();
  });
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  finish(new Response(body));
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledOnce();
  expect(pull).not.toHaveBeenCalled();
  expect(body.locked).toBe(false);
  await expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
  expect(fetch).toHaveBeenCalledOnce();
});
it("cancels an unsuccessful HTTP response without awaiting its cancellation", async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const body = new ReadableStream<Uint8Array>({ cancel });
  const resolver = createSubgraphCatalogResolver({ fetch: async () => new Response(body, { status: 503 }) });
  await expect(resolver.resolve(1, "account-vault-discovery")).rejects.toMatchObject({ reason: "source-failed" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});
it.each([0, -1, 1.5, Infinity])("rejects invalid byte budgets: %s", maxResponseBytes => {
  expect(() => createSubgraphCatalogResolver({ maxResponseBytes })).toThrow();
});
