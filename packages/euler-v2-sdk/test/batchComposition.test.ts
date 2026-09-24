import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress } from "viem";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import {
	type EVCBatchItem,
	type RequiredApproval,
	type TransactionPlan,
	flattenBatchEntries,
	isEVCBatchOperation,
} from "../src/services/executionService/executionServiceTypes.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa";
const OTHER_ACCOUNT = "0x00000000000000000000000000000000000000ab";
const VAULT = "0x00000000000000000000000000000000000000bb";
const OTHER_VAULT = "0x00000000000000000000000000000000000000bc";
const EVC = "0x00000000000000000000000000000000000000cc";
const EXTERNAL = "0x00000000000000000000000000000000000000dd";

const service = new ExecutionService(
	{
		getDeployment: () => ({
			addresses: { coreAddrs: { evc: EVC } },
		}),
	} as never,
	{} as never,
);

function mergedCalls(plans: TransactionPlan[]): EVCBatchItem[] {
	return service
		.mergePlans(plans)
		.flatMap((item) =>
			item.type === "evcBatch" ? flattenBatchEntries(item.items) : [],
		);
}

function groupedPlan(items: EVCBatchItem[]): TransactionPlan {
	return [
		{
			type: "evcBatch",
			items: [
				{
					type: "operation",
					name: "intent",
					items,
					walletBalanceTokens: [VAULT],
				},
			],
		},
	];
}

function* words<T>(alphabet: readonly T[], maxLength: number): Generator<T[]> {
	yield [];
	if (maxLength === 0) return;
	for (const suffix of words(alphabet, maxLength - 1)) {
		for (const symbol of alphabet) yield [symbol, ...suffix];
	}
}

function freezeDeep<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) freezeDeep(child);
		Object.freeze(value);
	}
	return value;
}

type ModelAction =
	| { kind: "set"; key: number; enabled: boolean }
	| { kind: "observe" }
	| { kind: "callback" };

const actions: { call: EVCBatchItem; action: ModelAction }[] = [
	{
		call: service.encodeEnableCollateral(1, ACCOUNT, VAULT),
		action: { kind: "set", key: 0, enabled: true },
	},
	{
		call: service.encodeDisableCollateral(1, ACCOUNT, VAULT),
		action: { kind: "set", key: 0, enabled: false },
	},
	{
		call: {
			targetContract: EXTERNAL,
			onBehalfOfAccount: ACCOUNT,
			value: 0n,
			data: "0x01010101",
		},
		action: { kind: "observe" },
	},
	{
		call: {
			targetContract: EXTERNAL,
			onBehalfOfAccount: ACCOUNT,
			value: 0n,
			data: "0x02020202",
		},
		action: { kind: "callback" },
	},
	{
		call: service.encodeEnableCollateral(1, OTHER_ACCOUNT, VAULT),
		action: { kind: "set", key: 1, enabled: true },
	},
	{
		call: service.encodeDisableCollateral(1, ACCOUNT, OTHER_VAULT),
		action: { kind: "set", key: 2, enabled: false },
	},
];

function callKey(call: EVCBatchItem): string {
	return `${call.targetContract}:${call.onBehalfOfAccount}:${call.value}:${call.data}`;
}

const actionByCall = new Map(
	actions.map(({ call, action }) => [callKey(call), action]),
);

// This finite abstraction exercises initial-state dependence and intermediate
// observations/callbacks. It is not an EVM/EVC implementation or an on-chain proof.
function runModel(calls: EVCBatchItem[], initialMask: number) {
	const enabled = [0, 1, 2].map((bit) => (initialMask & (1 << bit)) !== 0);
	const observations: boolean[][] = [];
	let callbackCount = 0;
	for (const call of calls) {
		const action = actionByCall.get(callKey(call));
		assert.ok(action, "model call must have a specified action");
		switch (action.kind) {
			case "set":
				enabled[action.key] = action.enabled;
				break;
			case "observe":
				observations.push([...enabled]);
				break;
			case "callback":
				enabled[0] = !enabled[0];
				callbackCount++;
				break;
		}
	}
	return { enabled, observations, callbackCount };
}

test("batch composition preserves bounded observable traces for all initial collateral states", () => {
	let checkedSequences = 0;
	let checkedPartitions = 0;
	for (const word of words(actions, 4)) {
		const calls = word.map(({ call }) => call);
		// Every split covers operation/raw entry boundaries and empty batches.
		for (let split = 0; split <= calls.length; split++) {
			const actual = mergedCalls([
				groupedPlan(calls.slice(0, split)),
				[{ type: "evcBatch", items: calls.slice(split) }],
			]);
			assert.deepEqual(actual, calls, `call order changed at split ${split}`);
			checkedPartitions++;
		}
		const midpoint = Math.floor(calls.length / 2);
		const actual = mergedCalls([
			groupedPlan(calls.slice(0, midpoint)),
			groupedPlan(calls.slice(midpoint)),
		]);
		for (let initialMask = 0; initialMask < 8; initialMask++) {
			assert.deepEqual(
				runModel(actual, initialMask),
				runModel(calls, initialMask),
			);
		}
		checkedSequences++;
	}
	assert.equal(checkedSequences, 1555);
	assert.equal(checkedPartitions, 7465);
});

test("opposing transitions cannot be erased when collateral starts enabled", () => {
	const calls = [actions[0]!.call, actions[1]!.call];
	const initialMask = 1;
	assert.equal(runModel(calls, initialMask).enabled[0], false);
	assert.equal(runModel([], initialMask).enabled[0], true);
	assert.equal(
		runModel(mergedCalls(calls.map((call) => groupedPlan([call]))), initialMask)
			.enabled[0],
		false,
	);
});

test("intervening observations and callbacks prevent transition cancellation or deduplication", () => {
	const enable = actions[0]!.call;
	const disable = actions[1]!.call;
	const observe = actions[2]!.call;
	const callback = actions[3]!.call;
	const opposing = [enable, observe, disable, observe];
	assert.deepEqual(
		runModel(mergedCalls([groupedPlan(opposing)]), 0).observations,
		[
			[true, false, false],
			[false, false, false],
		],
	);
	// The callback may change collateral state, so even equal transitions on
	// either side cannot be deduplicated based on calldata alone.
	const repeated = [enable, callback, enable, observe];
	assert.equal(
		runModel(mergedCalls([groupedPlan(repeated)]), 0).enabled[0],
		true,
	);
});

test("batch composition preserves selector collisions, call context, value, and repeated controllers", () => {
	const enable = service.encodeEnableCollateral(1, ACCOUNT, VAULT);
	const disable = service.encodeDisableCollateral(1, ACCOUNT, VAULT);
	const controller = service.encodeEnableController(1, ACCOUNT, VAULT);
	const disableController = service.encodeDisableController(VAULT, ACCOUNT);
	const calls: EVCBatchItem[] = [
		{ ...enable, targetContract: EXTERNAL },
		{ ...disable, targetContract: EXTERNAL },
		{ ...enable, onBehalfOfAccount: OTHER_ACCOUNT },
		{ ...enable, value: 1n },
		{ ...disable, value: 2n },
		controller,
		controller,
		disableController,
		disableController,
		{ ...enable, data: "0x" },
	];
	assert.deepEqual(
		mergedCalls(calls.map((call) => groupedPlan([call]))),
		calls,
	);
});

test("batch composition preserves operation metadata and does not mutate inputs", () => {
	const first = actions[0]!.call;
	const second = actions[1]!.call;
	const plans: TransactionPlan[] = [
		groupedPlan([first]),
		[
			{
				type: "evcBatch",
				items: [
					{
						type: "operation",
						name: "empty",
						items: [],
						walletBalanceTokens: [],
					},
					second,
				],
			},
		],
	];
	const snapshot = structuredClone(plans);
	freezeDeep(plans);
	const result = service.mergePlans(plans);
	assert.deepEqual(plans, snapshot);
	const batch = result[0];
	assert.ok(batch?.type === "evcBatch");
	assert.deepEqual(batch.items, [
		{
			type: "operation",
			name: "intent",
			items: [first],
			walletBalanceTokens: [VAULT],
		},
		{ type: "operation", name: "empty", items: [], walletBalanceTokens: [] },
		second,
	]);
	const operation = batch.items[0];
	assert.ok(operation && isEVCBatchOperation(operation));
	operation.items.push(second);
	operation.walletBalanceTokens!.push(OTHER_VAULT);
	batch.items.push(first);
	assert.deepEqual(
		plans,
		snapshot,
		"output container changes must not change input containers",
	);
});

function approval(overrides: Partial<RequiredApproval> = {}): RequiredApproval {
	return {
		type: "requiredApproval",
		token: VAULT,
		owner: ACCOUNT,
		spender: EXTERNAL,
		amount: 3n,
		resolved: [
			{
				type: "permit2",
				token: VAULT,
				owner: ACCOUNT,
				spender: EXTERNAL,
				amount: 3n,
			},
		],
		...overrides,
	};
}

test("batch composition sums only matching approval keys, clears resolutions, and preserves first-seen order", () => {
	const first = approval();
	const otherToken = approval({ token: OTHER_VAULT, amount: 7n });
	const otherOwner = approval({ owner: OTHER_ACCOUNT, amount: 11n });
	const otherSpender = approval({ spender: EVC, amount: 13n });
	const sameKey = approval({
		token: getAddress(VAULT),
		owner: getAddress(ACCOUNT),
		spender: getAddress(EXTERNAL),
		amount: 5n,
	});
	const plans: TransactionPlan[] = [
		[first, ...groupedPlan([actions[0]!.call]), otherToken],
		[otherOwner, ...groupedPlan([actions[1]!.call]), sameKey, otherSpender],
	];
	const snapshot = structuredClone(plans);
	freezeDeep(plans);
	const result = service.mergePlans(plans);
	assert.deepEqual(result.slice(0, 4), [
		{ ...first, amount: 8n, resolved: undefined },
		{ ...otherToken, resolved: undefined },
		{ ...otherOwner, resolved: undefined },
		{ ...otherSpender, resolved: undefined },
	]);
	assert.equal(result.length, 5);
	assert.deepEqual(mergedCalls(plans), [actions[0]!.call, actions[1]!.call]);
	assert.deepEqual(plans, snapshot);
});

test("batch composition rejects independent execution boundaries instead of dropping or reordering them", () => {
	const executableItems: TransactionPlan = [
		{
			type: "contractCall",
			chainId: 1,
			to: EXTERNAL,
			abi: [],
			functionName: "callback",
			args: [],
			value: 0n,
		},
		{ type: "cowSwap", kind: "openPosition", chainId: 1, params: {} },
	];
	for (const item of executableItems) {
		const plans: TransactionPlan[] = [
			groupedPlan([actions[0]!.call]),
			[item],
			groupedPlan([actions[1]!.call]),
		];
		const snapshot = structuredClone(plans);
		freezeDeep(plans);
		assert.throws(
			() => service.mergePlans(plans),
			/cannot merge (contractCall|CoW swap) plan items/,
		);
		assert.deepEqual(plans, snapshot);
	}
	assert.deepEqual(service.mergePlans([]), []);
	assert.deepEqual(service.mergePlans([[], []]), []);
});
