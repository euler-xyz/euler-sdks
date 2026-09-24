import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createQueryCacheBuildQuery } from "../src/utils/buildQuery.js";
import { createBundledCall, createCallBundler } from "../src/utils/callBundler.js";
import { REULLockService } from "../src/services/reulLockService/reulLockService.js";

afterEach(() => vi.restoreAllMocks());

test("an older slow query cannot replace a newer cached result after in-flight TTL expiry", async () => {
	let now = 0;
	vi.spyOn(Date, "now").mockImplementation(() => now);
	const resolve: Array<(value: string) => void> = [];
	const cached = createQueryCacheBuildQuery({ ttlMs: 100 })(
		"querySnapshot", () => new Promise<string>((done) => resolve.push(done)), {},
	);
	const older = cached();
	now = 101;
	const newer = cached();
	assert.equal(resolve.length, 2);
	resolve[1]!("newer snapshot");
	assert.equal(await newer, "newer snapshot");
	now = 102;
	resolve[0]!("older snapshot");
	assert.equal(await older, "older snapshot");
	assert.equal(await cached(), "newer snapshot");
	assert.equal(resolve.length, 2);
});

test("a zero-debounce saturated bundler waits for capacity instead of starving I/O", async () => {
	const tasks: Array<() => void> = [];
	vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => tasks.push(task));
	let release: (value: number[]) => void = () => {};
	let calls = 0;
	const load = createCallBundler<number, number>((keys) => {
		calls++;
		return calls === 1 ? new Promise((done) => { release = done; }) : Promise.resolve(keys);
	}, { maxBatchSize: 1, maxConcurrentBatches: 1, debounceMs: 0 });
	const first = load(1);
	const second = load(2);
	assert.equal(tasks.length, 1);
	tasks.shift()!();
	await Promise.resolve();
	assert.equal(calls, 1);
	assert.equal(tasks.length, 0, "no microtask spin while the first batch waits for I/O");
	release([1]);
	assert.equal(await first, 1);
	// Allow the batch's catch/finally chain to release capacity.
	for (let i = 0; i < 5; i++) await Promise.resolve();
	assert.equal(tasks.length, 1);
	tasks.shift()!();
	assert.equal(await second, 2);
});

test("bundler rejects synchronous failures and continues serving its queue", async () => {
	let calls = 0;
	const load = createCallBundler<number, number>((keys) => {
		if (++calls === 1) throw new Error("synchronous upstream failure");
		return Promise.resolve(keys);
	}, { maxBatchSize: 1, maxConcurrentBatches: 1, debounceMs: 0 });
	const first = load(1);
	const second = load(2);
	await assert.rejects(first, /synchronous upstream failure/);
	assert.equal(await second, 2);
});

test("batch options fail fast instead of hanging or silently truncating a result", () => {
	for (const maxBatchSize of [0, -1, 0.5, NaN]) {
		assert.throws(() => createCallBundler(async (keys) => keys, { maxBatchSize }), /maxBatchSize/);
	}
	assert.throws(() => createBundledCall(async (keys) => keys, { maxBatchSize: 1 }), /finite maxBatchSize/);
});

test("rEUL invalid batch sizes reject before any RPC request", async () => {
	const service = new REULLockService({ getProvider: () => { throw new Error("must not query"); } } as never, {} as never);
	for (const batchSize of [0, -1, 0.5, NaN, Infinity]) {
		await assert.rejects(service.fetchLocks({ chainId: 1, account: "0x0000000000000000000000000000000000000001", batchSize }), /positive safe integer/);
	}
});

test("a lens zero balance is verified because UtilsLens also returns zero for failed token reads", async () => {
 const { WalletOnchainAdapter } = await import("../src/services/walletService/adapters/walletOnchainAdapter.js");
 const asset = "0x0000000000000000000000000000000000000001" as const;
 for (const failed of [false, true]) {
  let directReads = 0;
  const provider = { readContract: async ({ functionName }: { functionName: string }) => {
   if (functionName === "tokenBalances") return [0n];
   if (functionName === "balanceOf") { directReads++; if (failed) throw new Error("token unavailable"); return 0n; }
   throw new Error("unexpected call");
  } };
  const adapter = new WalletOnchainAdapter({ getProvider: () => provider } as never, { getDeployment: () => ({ addresses: { coreAddrs: { permit2: asset }, lensAddrs: { utilsLens: asset } } }) } as never);
  const result = await adapter.fetchWallet(1, asset, [{ asset, spenders: [] }]);
  assert.equal(directReads, 1);
  assert.equal(result.result?.assets[0]?.balance, 0n);
  assert.equal(result.errors.some((issue) => issue.source === "erc20.balanceOf"), failed);
 }
});

test("fallback handles any rejection and notifies when the secondary also fails", async () => {
 const { createFallbackAdapter } = await import("../src/utils/fallbackAdapter.js");
 let notices = 0;
 let secondaryCalls = 0;
 let trigger: string | undefined;
 const adapter = createFallbackAdapter({ read: async () => { throw undefined; } }, { read: async () => { secondaryCalls++; throw new Error("secondary unavailable"); } }, { methods: ["read"], adapterNames: { primary: "a", secondary: "b" }, onFallback: (info) => { notices++; trigger = info.trigger; } });
 await assert.rejects(adapter.read(), /secondary unavailable/);
 assert.equal(secondaryCalls, 1);
 assert.equal(notices, 1);
 assert.equal(trigger, "primary-threw");
});
