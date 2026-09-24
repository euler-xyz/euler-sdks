import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, toHex, maxUint256, type StateOverride } from "viem";
import { mergeStateOverrides } from "../src/utils/stateOverrides/mergeStateOverrides.js";
import { deriveStateOverrides } from "../src/utils/stateOverrides/getStateOverrides.js";
import { computePermit2StateDiff } from "../src/utils/stateOverrides/approvalOverrides.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import type { TransactionPlan } from "../src/services/executionService/executionServiceTypes.js";

const OWNER = getAddress("0x00000000000000000000000000000000000000aa");
const TOKEN = getAddress("0x00000000000000000000000000000000000000bb");
const SPENDER = getAddress("0x00000000000000000000000000000000000000cc");
const PERMIT2 = getAddress("0x00000000000000000000000000000000000000dd");
const slot = (n: number) => toHex(n, { size: 32 });

test("override composition preserves code, replaces full storage, and patches storage in order", () => {
	const overrides: StateOverride = [
		{ address: OWNER, balance: 9n, nonce: 1, code: "0x6000", stateDiff: [{ slot: slot(1), value: slot(3) }] },
		{ address: OWNER, state: [{ slot: slot(2), value: slot(4) }] },
		{ address: OWNER, balance: 0n, nonce: 0, stateDiff: [{ slot: slot(2), value: slot(5) }, { slot: slot(3), value: slot(6) }] },
	];
	const original = structuredClone(overrides);
	assert.deepEqual(mergeStateOverrides(overrides), [{
		address: OWNER, balance: 0n, nonce: 0, code: "0x6000",
		state: [{ slot: slot(2), value: slot(5) }, { slot: slot(3), value: slot(6) }],
	}]);
	assert.deepEqual(overrides, original);
	assert.deepEqual(mergeStateOverrides([
		{ address: OWNER, code: "0x6000", stateDiff: [{ slot: slot(1), value: slot(3) }] },
		{ address: OWNER, code: "0x", stateDiff: [{ slot: slot(1), value: slot(4) }] },
	]), [{ address: OWNER, code: "0x", stateDiff: [{ slot: slot(1), value: slot(4) }] }]);
	assert.deepEqual(mergeStateOverrides([{ address: OWNER, state: [] }]), [{ address: OWNER, state: [] }]);
	assert.throws(() => mergeStateOverrides([{ address: OWNER, state: [], stateDiff: [] }] as never), /both state and stateDiff/);
});

test("noAllowanceOverride always emits Permit2 storage without probing ERC20 allowances", async () => {
	const plan: TransactionPlan = [{ type: "requiredApproval", owner: OWNER, token: TOKEN, spender: SPENDER, amount: 10n }];
	let reads = 0;
	const client = {
		chain: { id: 1 },
		readContract: async () => { reads++; throw new Error("unexpected token read"); },
		request: async () => { reads++; throw new Error("unexpected slot probe"); },
	};
	const service = new ExecutionService({
		getDeployment: () => ({ addresses: { coreAddrs: { permit2: PERMIT2 } } }),
	} as never, undefined, { getProvider: () => client } as never);
	const expected = [{ address: PERMIT2, stateDiff: computePermit2StateDiff(OWNER, [[TOKEN, SPENDER]]) }];
	for (const noBalanceOverride of [false, true]) {
		const options = { noAllowanceOverride: true, noBalanceOverride, nativeBalance: 0n, wallet: { balances: { [TOKEN]: 10n } } };
		assert.deepEqual(await deriveStateOverrides(client as never, plan, OWNER, { ...options, permit2Address: PERMIT2 }), expected);
		assert.deepEqual(await service.deriveStateOverrides(1, OWNER, plan, options), expected);
	}
	assert.equal(reads, 0);
});


test("deposit-all retains real balances even alongside fixed amounts for the same token", async () => {
	for (const amounts of [[maxUint256], [10n, maxUint256], [maxUint256, 10n], [maxUint256, maxUint256]]) {
		const plan: TransactionPlan = amounts.map((amount) => ({ type: "requiredApproval", owner: OWNER, token: TOKEN, spender: SPENDER, amount }));
		let reads = 0;
		const client = { chain: { id: 1 }, readContract: async () => { reads++; return 10n; } };
		const service = new ExecutionService({ getDeployment: () => ({ addresses: { coreAddrs: { permit2: PERMIT2 } } }) } as never,
			undefined, { getProvider: () => client } as never);
		const options = { nativeBalance: 0n, noAllowanceOverride: true };
		const standalone = await deriveStateOverrides(client as never, plan, OWNER, { ...options, permit2Address: PERMIT2 });
		const integrated = await service.deriveStateOverrides(1, OWNER, plan, options);
		for (const overrides of [standalone, integrated]) {
			assert.equal(overrides.some((override) => override.address === TOKEN), false);
			assert.equal(overrides.length, 1);
			assert.equal(overrides[0].address, PERMIT2);
		}
		assert.equal(reads, 0, "no balance forging or probing for balance-dependent operation");
	}
});
