import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createQueryCacheBuildQuery } from "../src/utils/buildQuery.js";

afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function startOverlappingQueries() {
	const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
	const older = deferred<string>();
	const newer = deferred<string>();
	const fetch = vi
		.fn()
		.mockReturnValueOnce(older.promise)
		.mockReturnValueOnce(newer.promise);
	const query = createQueryCacheBuildQuery({ ttlMs: 10, failureTtlMs: 20 })(
		"queryOverlapping",
		fetch,
		{},
	);
	const olderRead = query("same-key");
	clock.mockReturnValue(1_011);
	const newerRead = query("same-key");
	return { older, newer, olderRead, newerRead, query, fetch };
}

test("an expired slow query cannot overwrite a newer cached result", async () => {
	const { older, newer, olderRead, newerRead, query, fetch } =
		startOverlappingQueries();
	newer.resolve("new");
	assert.equal(await newerRead, "new");
	older.resolve("old");
	assert.equal(await olderRead, "old");
	assert.equal(await query("same-key"), "new");
	assert.equal(fetch.mock.calls.length, 2);
});

test("an expired slow query cannot replace the newer in-flight request", async () => {
	const { older, newer, olderRead, newerRead, query, fetch } =
		startOverlappingQueries();
	older.resolve("old");
	assert.equal(await olderRead, "old");
	const sharedRead = query("same-key");
	newer.resolve("new");
	assert.equal(await newerRead, "new");
	assert.equal(await sharedRead, "new");
	assert.equal(fetch.mock.calls.length, 2);
});

test("an expired slow query cannot overwrite a newer cached failure", async () => {
	const { older, newer, olderRead, newerRead, query, fetch } =
		startOverlappingQueries();
	const failure = new Error("new request failed");
	const rejectedRead = assert.rejects(newerRead, failure);
	newer.reject(failure);
	await rejectedRead;
	older.resolve("old");
	assert.equal(await olderRead, "old");
	await assert.rejects(query("same-key"), failure);
	assert.equal(fetch.mock.calls.length, 2);
});
