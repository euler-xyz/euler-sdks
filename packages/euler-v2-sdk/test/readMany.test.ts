import assert from "node:assert/strict";
import {
	type Hex,
	createPublicClient,
	custom,
	decodeFunctionData,
	encodeFunctionResult,
	getAddress,
	multicall3Abi,
	numberToHex,
} from "viem";
import { mainnet } from "viem/chains";
import { test } from "vitest";

import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { pinClientToBlock } from "../src/utils/blockPin.js";
import { MULTICALL3_ADDRESS, readMany } from "../src/utils/readMany.js";

const HASH =
	"0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const A = "0x00000000000000000000000000000000000000a1" as const;
const B = "0x00000000000000000000000000000000000000b2" as const;
const EVC = "0x00000000000000000000000000000000000000ec" as const;
const CALLER = "0x00000000000000000000000000000000000000ca" as const;
const OK = `0x${"00".repeat(31)}01` as Hex;
const REVERT = "0x08c379a0deadbeef" as Hex;

type Seen = { method: string; params: unknown };

function makeClient(seen: Seen[], answer: (params: unknown[]) => Hex) {
	return createPublicClient({
		chain: mainnet,
		transport: custom({
			request: async ({ method, params }: { method: string; params?: unknown }) => {
				seen.push({ method, params });
				if (method === "eth_call") return answer(params as unknown[]);
				throw new Error(`unexpected ${method}`);
			},
		}),
	});
}

const aggregate3Answer = () =>
	encodeFunctionResult({
		abi: multicall3Abi,
		functionName: "aggregate3",
		result: [
			{ success: true, returnData: OK },
			{ success: false, returnData: REVERT },
		],
	});

const batchSimulationAnswer = () =>
	encodeFunctionResult({
		abi: ethereumVaultConnectorAbi,
		functionName: "batchSimulation",
		result: [
			[
				{ success: true, result: OK },
				{ success: false, result: REVERT },
			],
			[],
			[],
		],
	});

test("multicall3 carrier bundles items into one aggregate3 call and keeps revert bytes", async () => {
	const seen: Seen[] = [];
	const client = makeClient(seen, aggregate3Answer);

	const out = await readMany(client, [
		{ to: A, data: "0x01" },
		{ to: B, data: "0x02" },
	]);

	assert.deepEqual(out, [
		{ success: true, data: OK },
		{ success: false, data: REVERT },
	]);
	assert.equal(seen.length, 1);
	const [request] = seen[0]!.params as [{ to: string; data: Hex }];
	assert.equal(request.to.toLowerCase(), mainnet.contracts.multicall3.address.toLowerCase());
	const decoded = decodeFunctionData({ abi: multicall3Abi, data: request.data });
	assert.equal(decoded.functionName, "aggregate3");
	// viem decodes addresses checksummed
	assert.deepEqual(decoded.args[0], [
		{ target: getAddress(A), allowFailure: true, callData: "0x01" },
		{ target: getAddress(B), allowFailure: true, callData: "0x02" },
	]);
});

test("multicall3 carrier honours an explicit address and falls back to the canonical one", async () => {
	const seen: Seen[] = [];
	const chainless = createPublicClient({
		transport: custom({
			request: async ({ method, params }: { method: string; params?: unknown }) => {
				seen.push({ method, params });
				return aggregate3Answer();
			},
		}),
	});

	await readMany(chainless, [{ to: A, data: "0x01" }, { to: B, data: "0x02" }]);
	assert.equal((seen[0]!.params as [{ to: string }])[0].to.toLowerCase(), MULTICALL3_ADDRESS.toLowerCase());

	await readMany(chainless, [{ to: A, data: "0x01" }, { to: B, data: "0x02" }], {
		carrier: "multicall3",
		multicall3Address: CALLER,
	});
	assert.equal((seen[1]!.params as [{ to: string }])[0].to.toLowerCase(), CALLER.toLowerCase());
});

test("multicall3 carrier refuses items that carry value", async () => {
	const client = makeClient([], aggregate3Answer);

	await assert.rejects(
		() => readMany(client, [{ to: A, data: "0x01", value: 1n }]),
		/value/,
	);
});

test("evc carrier bundles items into one batchSimulation call with the summed value", async () => {
	const seen: Seen[] = [];
	const client = makeClient(seen, batchSimulationAnswer);

	const out = await readMany(
		client,
		[
			{ to: A, data: "0x01", value: 5n },
			{ to: B, data: "0x02" },
		],
		{ carrier: "evc", evcAddress: EVC, onBehalfOfAccount: CALLER },
	);

	assert.deepEqual(out, [
		{ success: true, data: OK },
		{ success: false, data: REVERT },
	]);
	const [request] = seen[0]!.params as [{ to: string; data: Hex; value: Hex }];
	assert.equal(request.to.toLowerCase(), EVC.toLowerCase());
	assert.equal(request.value, numberToHex(5n));
	const decoded = decodeFunctionData({ abi: ethereumVaultConnectorAbi, data: request.data });
	assert.equal(decoded.functionName, "batchSimulation");
	assert.deepEqual(decoded.args[0], [
		{ targetContract: getAddress(A), onBehalfOfAccount: getAddress(CALLER), value: 5n, data: "0x01" },
		{ targetContract: getAddress(B), onBehalfOfAccount: getAddress(CALLER), value: 0n, data: "0x02" },
	]);
});

test("evc carrier defaults onBehalfOfAccount to the zero address", async () => {
	const seen: Seen[] = [];
	const client = makeClient(seen, batchSimulationAnswer);

	await readMany(client, [{ to: A, data: "0x01" }, { to: B, data: "0x02" }], {
		carrier: "evc",
		evcAddress: EVC,
	});

	const [request] = seen[0]!.params as [{ data: Hex }];
	const decoded = decodeFunctionData({ abi: ethereumVaultConnectorAbi, data: request.data });
	assert.equal(
		(decoded.args[0] as { onBehalfOfAccount: string }[])[0]!.onBehalfOfAccount,
		"0x0000000000000000000000000000000000000000",
	);
});

test("both carriers read at the client's pin", async () => {
	const seen: Seen[] = [];
	const pinned = pinClientToBlock(
		makeClient(seen, (params) => {
			const [{ to }] = params as [{ to: string }];
			return to.toLowerCase() === EVC.toLowerCase() ? batchSimulationAnswer() : aggregate3Answer();
		}),
		{ blockHash: HASH, requireCanonical: true },
	);
	const items = [{ to: A, data: "0x01" as Hex }, { to: B, data: "0x02" as Hex }];

	await readMany(pinned, items);
	await readMany(pinned, items, { carrier: "evc", evcAddress: EVC });

	for (const entry of seen) {
		assert.deepEqual((entry.params as unknown[])[1], { blockHash: HASH, requireCanonical: true });
	}
});

test("an empty item list makes no request, and an empty answer is an error", async () => {
	const seen: Seen[] = [];
	const client = makeClient(seen, () => "0x");

	assert.deepEqual(await readMany(client, []), []);
	assert.equal(seen.length, 0);
	await assert.rejects(() => readMany(client, [{ to: A, data: "0x01" }]), /empty/);
	await assert.rejects(
		() => readMany(client, [{ to: A, data: "0x01" }], { carrier: "evc", evcAddress: EVC }),
		/empty/,
	);
});
