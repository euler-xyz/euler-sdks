import assert from "node:assert/strict";
import { test } from "vitest";
import { PythPluginAdapter } from "../src/plugins/pyth/pythPlugin.js";

const GOOD_FEED =
	"0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" as const;
const MISSING_FEED =
	"0x70cd05521e3bdeaee2cadc1360f0d95397f03275f273199be35a029114f53a3b" as const;

function getRequestedIds(url: string): string[] {
	return new URL(url).searchParams.getAll("ids[]");
}

test("PythPluginAdapter retries Hermes 404s without missing price ids", async () => {
	const requestedIds: string[][] = [];

	const fetchFn = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		const ids = getRequestedIds(url);
		requestedIds.push(ids);

		if (ids.includes(MISSING_FEED)) {
			return new Response(`Price ids not found: ${MISSING_FEED}`, {
				status: 404,
			});
		}

		return Response.json({
			binary: {
				encoding: "hex",
				data: ["abc123"],
			},
		});
	}) as typeof fetch;

	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		fetchFn,
	);
	const updateData = await adapter.queryPythUpdateData([
		GOOD_FEED,
		MISSING_FEED,
	]);

	assert.deepEqual(updateData, ["0xabc123"]);
	assert.deepEqual(requestedIds, [[GOOD_FEED, MISSING_FEED], [GOOD_FEED]]);
});

test("PythPluginAdapter returns no update data when all Hermes ids are missing", async () => {
	const requestedIds: string[][] = [];

	const fetchFn = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		const ids = getRequestedIds(url);
		requestedIds.push(ids);

		return new Response(`Price ids not found: ${ids.join(", ")}`, {
			status: 404,
		});
	}) as typeof fetch;

	const adapter = new PythPluginAdapter(
		"https://hermes.pyth.network",
		undefined,
		fetchFn,
	);
	const updateData = await adapter.queryPythUpdateData([MISSING_FEED]);

	assert.deepEqual(updateData, []);
	assert.deepEqual(requestedIds, [[MISSING_FEED]]);
});
