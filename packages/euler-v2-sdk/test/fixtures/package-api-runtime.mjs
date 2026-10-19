import assert from "node:assert/strict";
import {
	AccountVaultsSubgraphAdapter,
	SubgraphUnavailableError,
} from "@eulerxyz/euler-v2-sdk";

const account = "0x0000000000000000000000000000000000000001";
const vault = "0x0000000000000000000000000000000000000002";
let source = { endpoint: "https://graph.example/first", deploymentId: "first" };
let now = 1_000;
let graphReads = 0;
let catalogReads = 0;
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
Date.now = () => now;
globalThis.fetch = async (input, init) => {
	if (input === "https://operator.example/catalog.json") {
		catalogReads++;
		return Response.json({
			schemaVersion: 1,
			revision: source.deploymentId,
			publishedAt: "2026-10-19T10:00:00Z",
			deployments: [
				{
					...source,
					chainId: 1,
					family: "euler-simple",
					channel: "stable",
					status: "active",
					version: "1.0.3.2",
					capabilities: ["account-vault-discovery"],
					sourceCommit: "a".repeat(40),
					startBlock: 0,
				},
			],
		});
	}
	assert.equal(
		input,
		source.endpoint,
		"all fetches must use the controlled fixture endpoints",
	);
	assert.equal(init.method, "POST");
	const request = JSON.parse(init.body);
	assert.match(request.query, /_meta\s*\{\s*deployment\s*\}/);
	assert.deepEqual(request.variables.ids, [account.substring(0, 40)]);
	graphReads++;
	return Response.json({
		data: {
			_meta: { deployment: source.deploymentId },
			trackingActiveAccounts: [
				{
					id: account.substring(0, 40),
					deposits: [account + vault.substring(2)],
					borrows: [],
				},
			],
		},
	});
};

try {
	const { baseline, next, discovery, chainId } = await import("./consumer.js");
	assert.ok(discovery instanceof AccountVaultsSubgraphAdapter);
	assert.deepEqual(baseline.source, source);
	assert.deepEqual(baseline.value, {
		[account]: { deposits: [vault], borrows: [] },
	});
	assert.deepEqual(next, baseline);
	assert.equal(catalogReads, 1);
	assert.equal(graphReads, 2);

	source = { endpoint: "https://graph.example/second", deploymentId: "second" };
	now += 60_001;
	await assert.rejects(
		discovery.fetchAccountVaultsWithSource(chainId, account, {
			expectedSource: baseline.source,
		}),
		(error) =>
			error instanceof SubgraphUnavailableError &&
			error.reason === "source-changed",
	);
	assert.equal(catalogReads, 2);
	assert.equal(
		graphReads,
		2,
		"changed provenance rejects before querying the new graph",
	);
	const restarted = await discovery.fetchAccountVaultsWithSource(
		chainId,
		account,
	);
	assert.deepEqual(restarted.source, source);
	assert.deepEqual(restarted.value, baseline.value);
	assert.equal(graphReads, 3);
	await assert.rejects(import("@eulerxyz/euler-v2-sdk/dist/src/index.js"), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
	});
} finally {
	globalThis.fetch = originalFetch;
	Date.now = originalNow;
}
