import assert from "node:assert/strict";
import { getAddress } from "viem";
import { afterEach, test, vi } from "vitest";
import { AccountVaultsSubgraphAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import { VaultTypeSubgraphAdapter } from "../src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.js";
import { createQueryCacheBuildQuery } from "../src/utils/buildQuery.js";
import { getAddressPrefix } from "../src/utils/subAccounts.js";

const account = getAddress("0x1000000000000000000000000000000000000000");
const vault = getAddress("0x2000000000000000000000000000000000000000");
const factory = getAddress("0x3000000000000000000000000000000000000000");
const config = {
	subgraphURLs: {
		1: "https://example.invalid/healthy",
		2: "https://example.invalid/failing",
	},
};
const accountVaults = { [account]: { deposits: [vault], borrows: [] } };

afterEach(() => vi.unstubAllGlobals());

function accountRow(address = account) {
	return {
		id: getAddressPrefix(address).toLowerCase(),
		deposits: [`${address}${vault.slice(2)}`],
		borrows: [],
	};
}

for (const kind of ["account", "vault type"] as const) {
	for (const failure of ["HTTP", "GraphQL", "malformed data", "network"] as const) {
		test(`${kind} batches isolate ${failure} failures by chain and cache the healthy result`, async () => {
			const fetch = vi.fn(async (url: string) => {
				if (url === config.subgraphURLs[2]) {
					if (failure === "network") throw new Error("Network unavailable");
					return Response.json(
						failure === "GraphQL"
							? { errors: [{ message: "Indexer unavailable" }] }
							: {},
						{ status: failure === "HTTP" ? 502 : 200 },
					);
				}
				assert.equal(url, config.subgraphURLs[1]);
				return Response.json({
					data: {
						trackingActiveAccounts: [accountRow()],
						vaults: [{ id: vault, factory }],
					},
				});
			});
			vi.stubGlobal("fetch", fetch);
			const buildQuery = createQueryCacheBuildQuery({
				ttlMs: 60_000,
				failureTtlMs: 60_000,
			});
			const adapter =
				kind === "account"
					? new AccountVaultsSubgraphAdapter(config, buildQuery)
					: new VaultTypeSubgraphAdapter(config, buildQuery);
			const read = (chainId: number) =>
				adapter instanceof AccountVaultsSubgraphAdapter
					? adapter.fetchAccountVaults(chainId, account)
					: adapter.fetchVaultType(chainId, vault);
			const expected = kind === "account" ? accountVaults : factory;

			const [failed, healthy] = await Promise.allSettled([read(2), read(1)]);
			assert.equal(failed?.status, "rejected");
			assert.deepEqual(healthy, { status: "fulfilled", value: expected });
			assert.equal(fetch.mock.calls.length, 2);

			assert.deepEqual(await read(1), expected);
			await assert.rejects(read(2));
			assert.equal(fetch.mock.calls.length, 2);
		});
	}
}

for (const failSecondChunk of [false, true]) {
	test(`account discovery ${failSecondChunk ? "rejects every key on a chain with a failed later chunk" : "loads every account beyond the subgraph default and maximum page sizes"}`, async () => {
		const accounts = Array.from({ length: 1001 }, (_, index) =>
			getAddress(`0x${(BigInt(index + 1) << 8n).toString(16).padStart(40, "0")}`),
		);
		const accountsByPrefix = new Map(
			accounts.map((address) => [getAddressPrefix(address).toLowerCase(), address]),
		);
		let accountChunkCount = 0;
		const fetch = vi.fn(async (url: string, init: RequestInit) => {
			if (url === config.subgraphURLs[1]) {
				return Response.json({ data: { trackingActiveAccounts: [accountRow()] } });
			}
			assert.equal(url, config.subgraphURLs[2]);
			accountChunkCount += 1;
			if (failSecondChunk && accountChunkCount === 2) {
				return Response.json({ error: "Indexer unavailable" }, { status: 503 });
			}
			const request = JSON.parse(String(init.body)) as {
				query: string;
				variables: { ids: string[] };
			};
			const first = Number(
				request.query.match(/trackingActiveAccounts\(first:\s*(\d+)/)?.[1] ?? 100,
			);
			assert.ok(first <= 1000);
			const rows = request.variables.ids.slice(0, first).map((id) => {
				const address = accountsByPrefix.get(id.toLowerCase());
				assert.ok(address);
				return accountRow(address);
			});
			return Response.json({ data: { trackingActiveAccounts: rows } });
		});
		vi.stubGlobal("fetch", fetch);
		const adapter = new AccountVaultsSubgraphAdapter(
			config,
			createQueryCacheBuildQuery({ ttlMs: 60_000, failureTtlMs: 60_000 }),
		);
		const results = await Promise.allSettled([
			...accounts.map((address) => adapter.fetchAccountVaults(2, address)),
			adapter.fetchAccountVaults(1, account),
		]);
		assert.deepEqual(results.at(-1), {
			status: "fulfilled",
			value: accountVaults,
		});
		for (const [index, address] of accounts.entries()) {
			const result = results[index];
			if (failSecondChunk) {
				assert.equal(result?.status, "rejected");
				if (result?.status === "rejected") {
					assert.match(String(result.reason), /Account vaults subgraph 503/);
				}
			} else {
				assert.deepEqual(result, {
					status: "fulfilled",
					value: { [address]: { deposits: [vault], borrows: [] } },
				});
			}
		}
		assert.equal(accountChunkCount, 2);
		assert.equal(fetch.mock.calls.length, 3);
		assert.deepEqual(await adapter.fetchAccountVaults(1, account), accountVaults);
		assert.equal(fetch.mock.calls.length, 3);
	});
}
