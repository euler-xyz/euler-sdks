import assert from "node:assert/strict";
import { test } from "vitest";
import {
	createFallbackAdapter,
	type FallbackInfo,
} from "../src/utils/fallbackAdapter.js";
import {
	dataIssueLocation,
	serviceDiagnosticOwner,
	type ServiceResult,
} from "../src/utils/entityDiagnostics.js";

interface SampleAdapter {
	fetchThing(id: number): Promise<ServiceResult<string | undefined>>;
	fetchMany(ids: number[]): Promise<ServiceResult<Array<string | undefined>>>;
	fetchPlain(id: number): Promise<string>;
	setConfig(value: string): void;
	tag: string;
}

function makeAdapter(overrides: Partial<SampleAdapter> & { tag: string }): SampleAdapter {
	const defaults: SampleAdapter = {
		tag: overrides.tag,
		fetchThing: async () => ({ result: `${overrides.tag}-default`, errors: [] }),
		fetchMany: async (ids: number[]) => ({
			result: ids.map((i) => `${overrides.tag}-${i}`),
			errors: [],
		}),
		fetchPlain: async () => `${overrides.tag}-plain`,
		setConfig: () => {},
	};
	return { ...defaults, ...overrides };
}

test("primary success returns primary result with no fallback issue", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({ result: "ok", errors: [] }),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => {
			throw new Error("should not be called");
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "p", secondary: "s" },
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "ok");
	assert.equal(out.errors.length, 0);
});

test("primary throw triggers secondary and emits FALLBACK_USED", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			throw new Error("v3 down");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "onchain-value", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "onchain-value");
	assert.equal(out.errors.length, 1);
	assert.equal(out.errors[0]!.code, "FALLBACK_USED");
	assert.equal(out.errors[0]!.severity, "info");
	assert.equal(out.errors[0]!.source, "v3");
	assert.equal(out.errors[0]!.originalValue, "v3 down");
});

test("primary returns undefined with SOURCE_UNAVAILABLE → fallback fires", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({
			result: undefined,
			errors: [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "error",
					message: "v3 timeout",
					locations: [
						dataIssueLocation(serviceDiagnosticOwner("v3", undefined, "x")),
					],
					source: "v3",
				},
			],
		}),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "recovered", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "recovered");
	assert.equal(out.errors.length, 1);
	assert.equal(out.errors[0]!.code, "FALLBACK_USED");
});

test("primary returns populated result with SOURCE_UNAVAILABLE warning → no fallback", async () => {
	let secondaryCalls = 0;
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({
			result: "ok",
			errors: [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "nested oracle missing",
					locations: [
						dataIssueLocation(serviceDiagnosticOwner("v3", undefined, "x")),
					],
					source: "v3",
				},
			],
		}),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => {
			secondaryCalls += 1;
			return { result: "should-not-be-used", errors: [] };
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "ok");
	assert.equal(out.errors.length, 1);
	assert.equal(out.errors[0]!.code, "SOURCE_UNAVAILABLE");
	assert.equal(secondaryCalls, 0);
});

test("primary returns result=undefined → fallback fires even without trigger code", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({ result: undefined, errors: [] }),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "recovered", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "recovered");
	assert.equal(out.errors[0]!.code, "FALLBACK_USED");
});

test("array result with undefined slot → fallback fires", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchMany: async () => ({
			result: ["a", undefined, "c"],
			errors: [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "error",
					message: "missing one",
					locations: [
						dataIssueLocation(serviceDiagnosticOwner("v3", undefined, "x")),
					],
					source: "v3",
				},
			],
		}),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchMany: async () => ({ result: ["A", "B", "C"], errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchMany">(
		primary,
		secondary,
		{
			methods: ["fetchMany"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchMany([1, 2, 3]);
	assert.deepEqual(out.result, ["A", "B", "C"]);
	assert.equal(out.errors[0]!.code, "FALLBACK_USED");
});

test("array result fully populated with SOURCE_UNAVAILABLE warning → no fallback", async () => {
	let secondaryCalls = 0;
	const primary = makeAdapter({
		tag: "primary",
		fetchMany: async () => ({
			result: ["a", "b", "c"],
			errors: [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "nested oracle missing on b",
					locations: [
						dataIssueLocation(serviceDiagnosticOwner("v3", undefined, "x")),
					],
					source: "v3",
				},
			],
		}),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchMany: async () => {
			secondaryCalls += 1;
			return { result: ["A", "B", "C"], errors: [] };
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchMany">(
		primary,
		secondary,
		{
			methods: ["fetchMany"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchMany([1, 2, 3]);
	assert.deepEqual(out.result, ["a", "b", "c"]);
	assert.equal(out.errors.length, 1);
	assert.equal(out.errors[0]!.code, "SOURCE_UNAVAILABLE");
	assert.equal(secondaryCalls, 0);
});

test("non-trigger error codes do not cause fallback", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({
			result: "ok-with-warning",
			errors: [
				{
					code: "COERCED_TYPE",
					severity: "warning",
					message: "string coerced",
					locations: [
						dataIssueLocation(serviceDiagnosticOwner("v3", undefined, "x")),
					],
					source: "v3",
				},
			],
		}),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => {
			throw new Error("should not be called");
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "ok-with-warning");
	assert.equal(out.errors.length, 1);
	assert.equal(out.errors[0]!.code, "COERCED_TYPE");
});

test("non-ServiceResult method falls back only on throw", async () => {
	let primaryCalls = 0;
	let secondaryCalls = 0;
	const primary = makeAdapter({
		tag: "primary",
		fetchPlain: async () => {
			primaryCalls += 1;
			throw new Error("nope");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchPlain: async () => {
			secondaryCalls += 1;
			return "recovered-plain";
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchPlain">(
		primary,
		secondary,
		{
			methods: ["fetchPlain"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchPlain(1);
	assert.equal(out, "recovered-plain");
	assert.equal(primaryCalls, 1);
	assert.equal(secondaryCalls, 1);
});

test("non-ServiceResult method success passes through, secondary not called", async () => {
	let secondaryCalls = 0;
	const primary = makeAdapter({
		tag: "primary",
		fetchPlain: async () => "primary-plain",
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchPlain: async () => {
			secondaryCalls += 1;
			return "should-not-be-used";
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchPlain">(
		primary,
		secondary,
		{
			methods: ["fetchPlain"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchPlain(1);
	assert.equal(out, "primary-plain");
	assert.equal(secondaryCalls, 0);
});

test("unwrapped methods pass through to primary", async () => {
	let primarySetCalls = 0;
	let secondarySetCalls = 0;
	const primary = makeAdapter({
		tag: "primary",
		setConfig: () => {
			primarySetCalls += 1;
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		setConfig: () => {
			secondarySetCalls += 1;
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "p", secondary: "s" },
		},
	);
	wrapped.setConfig("x");
	assert.equal(primarySetCalls, 1);
	assert.equal(secondarySetCalls, 0);
	assert.equal(wrapped.tag, "primary");
});

test("preserves secondary errors and prepends FALLBACK_USED", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			throw new Error("boom");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({
			result: "partial",
			errors: [
				{
					code: "COERCED_TYPE",
					severity: "warning",
					message: "minor issue",
					locations: [
						dataIssueLocation(
							serviceDiagnosticOwner("onchain", undefined, "x"),
						),
					],
					source: "onchain",
				},
			],
		}),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "partial");
	assert.equal(out.errors.length, 2);
	assert.equal(out.errors[0]!.code, "FALLBACK_USED");
	assert.equal(out.errors[1]!.code, "COERCED_TYPE");
});

test("preserves secondary result envelope metadata", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			throw new Error("boom");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () =>
			({
				result: "recovered",
				errors: [],
				read: { mode: "exact", blockNumber: 123n },
			}) as never,
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);

	const out = (await wrapped.fetchThing(1)) as ServiceResult<string> & {
		read: { mode: string; blockNumber: bigint };
	};
	assert.deepEqual(out.read, { mode: "exact", blockNumber: 123n });
	assert.equal(out.errors[0]?.code, "FALLBACK_USED");
});

test("circuit breaker skips primary while open", async () => {
	let primaryCalls = 0;
	let secondaryCalls = 0;
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			primaryCalls += 1;
			throw new Error("down");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => {
			secondaryCalls += 1;
			return { result: "ok", errors: [] };
		},
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			circuitBreaker: { failures: 2, cooldownMs: 60_000 },
		},
	);
	await wrapped.fetchThing(1);
	await wrapped.fetchThing(2);
	await wrapped.fetchThing(3);
	await wrapped.fetchThing(4);
	assert.equal(primaryCalls, 2);
	assert.equal(secondaryCalls, 4);
});

test("custom shouldFallback predicate is honored", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({ result: "MAYBE_BAD", errors: [] }),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "GOOD", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			shouldFallback: (r) => r.result === "MAYBE_BAD",
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "GOOD");
});

test("onFallback fires with method name, args, and primary error after fallback completes", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			throw new Error("v3 boom");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "ok", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchThing(7);
	assert.equal(calls.length, 1);
	assert.equal(calls[0]!.method, "fetchThing");
	assert.deepEqual(calls[0]!.args, [7]);
	assert.equal(calls[0]!.primaryName, "v3");
	assert.equal(calls[0]!.secondaryName, "onchain");
	assert.equal((calls[0]!.primaryError as Error).message, "v3 boom");
	assert.equal(calls[0]!.primaryIssues, undefined);
});

test("onFallback receives primaryIssues when result-code triggered fallback", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({
			result: undefined,
			errors: [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "error",
					message: "v3 timeout",
					locations: [
						dataIssueLocation(serviceDiagnosticOwner("v3", undefined, "x")),
					],
					source: "v3",
				},
			],
		}),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "rescued", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchThing(1);
	assert.equal(calls.length, 1);
	assert.equal(calls[0]!.primaryError, undefined);
	assert.equal(calls[0]!.primaryIssues?.[0]?.code, "SOURCE_UNAVAILABLE");
});

test("onFallback does not fire on primary success", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({ result: "ok", errors: [] }),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "should-not-be-used", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchThing(1);
	assert.equal(calls.length, 0);
});

test("onFallback exceptions are swallowed", async () => {
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			throw new Error("boom");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "fine", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			onFallback: () => {
				throw new Error("telemetry sink failed");
			},
		},
	);
	const out = await wrapped.fetchThing(1);
	assert.equal(out.result, "fine");
});

test("onFallback exposes trigger='primary-threw' when primary throws", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			throw new Error("boom");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "ok", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchThing(1);
	assert.equal(calls[0]!.trigger, "primary-threw");
	assert.equal(calls[0]!.missingIndices, undefined);
});

test("onFallback exposes trigger='result-undefined' when result is undefined", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({ result: undefined, errors: [] }),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "ok", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchThing(1);
	assert.equal(calls[0]!.trigger, "result-undefined");
	assert.equal(calls[0]!.missingIndices, undefined);
});

test("onFallback exposes trigger='array-missing-slots' with indices", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchMany: async () => ({
			result: ["a", undefined, "c", undefined, "e"],
			errors: [],
		}),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchMany: async () => ({ result: ["A", "B", "C", "D", "E"], errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchMany">(
		primary,
		secondary,
		{
			methods: ["fetchMany"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchMany([1, 2, 3, 4, 5]);
	assert.equal(calls[0]!.trigger, "array-missing-slots");
	assert.deepEqual(calls[0]!.missingIndices, [1, 3]);
});

test("onFallback exposes trigger='custom-shouldFallback'", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => ({ result: "BAD", errors: [] }),
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "GOOD", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			shouldFallback: (r) => r.result === "BAD",
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchThing(1);
	assert.equal(calls[0]!.trigger, "custom-shouldFallback");
});

test("onFallback exposes trigger='circuit-open' when circuit is tripped", async () => {
	const calls: FallbackInfo[] = [];
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async () => {
			throw new Error("down");
		},
	});
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async () => ({ result: "ok", errors: [] }),
	});
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
			circuitBreaker: { failures: 1, cooldownMs: 60_000 },
			onFallback: (info) => calls.push(info),
		},
	);
	await wrapped.fetchThing(1); // trips the breaker (primary-threw)
	await wrapped.fetchThing(2); // circuit-open path
	assert.equal(calls[0]!.trigger, "primary-threw");
	assert.equal(calls[1]!.trigger, "circuit-open");
});

test("args are forwarded unchanged to primary and secondary", async () => {
	let primaryArgs: unknown[] | undefined;
	let secondaryArgs: unknown[] | undefined;
	const primary = makeAdapter({
		tag: "primary",
		fetchThing: async (...args: unknown[]) => {
			primaryArgs = args;
			throw new Error("retry");
		},
	} as unknown as Partial<SampleAdapter> & { tag: string });
	const secondary = makeAdapter({
		tag: "secondary",
		fetchThing: async (...args: unknown[]) => {
			secondaryArgs = args;
			return { result: "ok", errors: [] };
		},
	} as unknown as Partial<SampleAdapter> & { tag: string });
	const wrapped = createFallbackAdapter<SampleAdapter, "fetchThing">(
		primary,
		secondary,
		{
			methods: ["fetchThing"],
			adapterNames: { primary: "v3", secondary: "onchain" },
		},
	);
	await wrapped.fetchThing(42);
	assert.deepEqual(primaryArgs, [42]);
	assert.deepEqual(secondaryArgs, [42]);
});
