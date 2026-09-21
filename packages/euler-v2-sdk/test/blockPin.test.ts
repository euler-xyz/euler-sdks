import assert from "node:assert/strict";
import {
	type Hex,
	createPublicClient,
	custom,
	decodeFunctionData,
	encodeFunctionResult,
	multicall3Abi,
	numberToHex,
	parseAbi,
} from "viem";
import { mainnet } from "viem/chains";
import { test } from "vitest";

import {
	type BlockPin,
	getClientBlockPin,
	pinClientToBlock,
} from "../src/utils/blockPin.js";
import { serializeQueryArgs } from "../src/utils/buildQuery.js";

const HASH =
	"0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const TARGET = "0x00000000000000000000000000000000000000ee" as const;
const WORD = `0x${"00".repeat(31)}2a` as Hex; // uint256 42
const totalSupplyAbi = parseAbi(["function totalSupply() view returns (uint256)"]);

type Seen = { method: string; params: unknown };

/** A client whose transport records every JSON-RPC request it forwards. */
function makeClient(seen: Seen[], batch?: { multicall: boolean }) {
	return createPublicClient({
		chain: mainnet,
		...(batch ? { batch } : {}),
		transport: custom({
			request: async ({ method, params }: { method: string; params?: unknown }) => {
				seen.push({ method, params });
				switch (method) {
					case "eth_chainId":
						return "0x1";
					case "eth_blockNumber":
						return "0x10";
					case "eth_getBalance":
					case "eth_getTransactionCount":
						return "0x0";
					case "eth_getCode":
						return "0x";
					case "eth_getStorageAt":
						return WORD;
					case "eth_call": {
						const [{ to, data }] = params as [{ to: string; data: Hex }];
						// viem's multicall batching lands on Multicall3: answer aggregate3
						// with one word per bundled call
						if (to.toLowerCase() === mainnet.contracts.multicall3.address.toLowerCase()) {
							const { args } = decodeFunctionData({ abi: multicall3Abi, data });
							const calls = args[0] as readonly unknown[];
							return encodeFunctionResult({
								abi: multicall3Abi,
								functionName: "aggregate3",
								result: calls.map(() => ({ success: true, returnData: WORD })),
							});
						}
						return WORD;
					}
					default:
						throw new Error(`unexpected ${method}`);
				}
			},
		}),
	});
}

const lastCall = (seen: Seen[]) =>
	seen.filter((entry) => entry.method === "eth_call").at(-1)!.params as unknown[];

test("a hash pin sends eth_call with the EIP-1898 block object verbatim", async () => {
	const seen: Seen[] = [];
	const pinned = pinClientToBlock(makeClient(seen), {
		blockHash: HASH,
		requireCanonical: true,
	});

	await pinned.call({ to: TARGET, data: "0x18160ddd" });

	const params = lastCall(seen);
	assert.deepEqual(params[0], { data: "0x18160ddd", to: TARGET });
	assert.deepEqual(params[1], { blockHash: HASH, requireCanonical: true });
	assert.equal(params.length, 2);
});

test("a number pin sends the block number as hex", async () => {
	const seen: Seen[] = [];
	const pinned = pinClientToBlock(makeClient(seen), { blockNumber: 100n });

	await pinned.call({ to: TARGET, data: "0x18160ddd" });

	assert.equal(lastCall(seen)[1], numberToHex(100n));
});

test("requireCanonical is omitted from the block object when not given", async () => {
	const seen: Seen[] = [];
	const pinned = pinClientToBlock(makeClient(seen), { blockHash: HASH });

	await pinned.call({ to: TARGET, data: "0x18160ddd" });

	assert.deepEqual(lastCall(seen)[1], { blockHash: HASH });
});

test("readContract and viem's Multicall3 batching are pinned like a raw call", async () => {
	const seen: Seen[] = [];
	const pin: BlockPin = { blockHash: HASH, requireCanonical: true };
	const pinned = pinClientToBlock(makeClient(seen), pin);

	const supply = await pinned.readContract({
		address: TARGET,
		abi: totalSupplyAbi,
		functionName: "totalSupply",
	});
	assert.equal(supply, 42n);
	assert.deepEqual(lastCall(seen)[1], { blockHash: HASH, requireCanonical: true });

	const [viaMulticall] = await pinned.multicall({
		contracts: [{ address: TARGET, abi: totalSupplyAbi, functionName: "totalSupply" }],
		allowFailure: false,
	});
	assert.equal(viaMulticall, 42n);
	const [request, block] = lastCall(seen) as [{ to: string }, unknown];
	assert.equal(request.to.toLowerCase(), mainnet.contracts.multicall3.address.toLowerCase());
	assert.deepEqual(block, { blockHash: HASH, requireCanonical: true });
});

test("viem's batch.multicall coalescing runs through the pin as one aggregate3", async () => {
	const seen: Seen[] = [];
	// the SDK's provider clients enable viem's multicall batching: concurrent
	// readContract calls are coalesced at the action layer into one aggregate3
	const pinned = pinClientToBlock(makeClient(seen, { multicall: true }), {
		blockHash: HASH,
		requireCanonical: true,
	});
	const other = "0x00000000000000000000000000000000000000ef" as const;

	const supplies = await Promise.all([
		pinned.readContract({ address: TARGET, abi: totalSupplyAbi, functionName: "totalSupply" }),
		pinned.readContract({ address: other, abi: totalSupplyAbi, functionName: "totalSupply" }),
	]);

	assert.deepEqual(supplies, [42n, 42n]);
	const calls = seen.filter((entry) => entry.method === "eth_call");
	assert.equal(calls.length, 1, "two reads must coalesce into one eth_call");
	const [request, block] = calls[0]!.params as [{ to: string; data: Hex }, unknown];
	assert.equal(request.to.toLowerCase(), mainnet.contracts.multicall3.address.toLowerCase());
	const { args } = decodeFunctionData({ abi: multicall3Abi, data: request.data });
	assert.equal((args[0] as readonly unknown[]).length, 2);
	assert.deepEqual(block, { blockHash: HASH, requireCanonical: true });
});

test("state reads with a block argument are pinned at the right position", async () => {
	const seen: Seen[] = [];
	const pinned = pinClientToBlock(makeClient(seen), { blockNumber: 7n });
	const block = numberToHex(7n);

	await pinned.getBalance({ address: TARGET });
	await pinned.getCode({ address: TARGET });
	await pinned.getTransactionCount({ address: TARGET });
	await pinned.getStorageAt({ address: TARGET, slot: "0x0" });

	const byMethod = Object.fromEntries(seen.map((entry) => [entry.method, entry.params as unknown[]]));
	assert.equal(byMethod.eth_getBalance![1], block);
	assert.equal(byMethod.eth_getCode![1], block);
	assert.equal(byMethod.eth_getTransactionCount![1], block);
	assert.equal(byMethod.eth_getStorageAt![2], block);
});

test("methods without a block argument pass through untouched", async () => {
	const seen: Seen[] = [];
	const pinned = pinClientToBlock(makeClient(seen), { blockNumber: 7n });

	assert.equal(await pinned.getBlockNumber({ cacheTime: 0 }), 16n);
	assert.equal(await pinned.getChainId(), 1);

	for (const entry of seen) {
		assert.ok(
			entry.params === undefined || (Array.isArray(entry.params) && entry.params.length === 0),
			`${entry.method} gained parameters`,
		);
	}
});

test("the pin is readable off the client and carried into cache keys", async () => {
	const seen: Seen[] = [];
	const client = makeClient(seen);
	const atHash = pinClientToBlock(client, { blockHash: HASH, requireCanonical: true });
	const atNumber = pinClientToBlock(client, { blockNumber: 7n });

	assert.deepEqual(getClientBlockPin(atHash), { blockHash: HASH, requireCanonical: true });
	assert.equal(getClientBlockPin(client), undefined);
	assert.equal(atHash.chain?.id, 1);

	const keys = new Set([
		serializeQueryArgs([client, TARGET]),
		serializeQueryArgs([atHash, TARGET]),
		serializeQueryArgs([atNumber, TARGET]),
	]);
	assert.equal(keys.size, 3, "pinned and unpinned reads must not share a cache entry");
	assert.match(serializeQueryArgs([atHash, TARGET]) ?? "", /1111111111/);
});

test("a pinned client leaves the original client unpinned", async () => {
	const seen: Seen[] = [];
	const client = makeClient(seen);
	pinClientToBlock(client, { blockHash: HASH });

	await client.call({ to: TARGET, data: "0x18160ddd" });

	assert.equal(lastCall(seen)[1], "latest");
});
