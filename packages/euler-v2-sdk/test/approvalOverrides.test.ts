import assert from "node:assert/strict";
import test from "node:test";
import {
	type Address,
	type Hex,
	encodePacked,
	hexToBigInt,
	keccak256,
	maxUint256,
	toHex,
} from "viem";
import {
	computePermit2StateDiff,
	getApprovalOverrides,
} from "../src/utils/stateOverrides/approvalOverrides.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN = "0x00000000000000000000000000000000000000bb" as const;
const SPENDER = "0x00000000000000000000000000000000000000cc" as const;
const PERMIT2 = "0x00000000000000000000000000000000000000dd" as const;

function computeAllowanceSlot(
	owner: Address,
	spender: Address,
	slotIndex: bigint,
): Hex {
	const baseSlot = keccak256(
		encodePacked(["uint256", "uint256"], [hexToBigInt(owner), slotIndex]),
	);

	return keccak256(
		encodePacked(
			["uint256", "uint256"],
			[hexToBigInt(spender), hexToBigInt(baseSlot)],
		),
	);
}

test("getApprovalOverrides passes from to access-list discovery and falls back to slot scanning with cache reuse", async () => {
	const expectedSlotIndex = 2n;
	const expectedSlot = computeAllowanceSlot(
		ACCOUNT,
		PERMIT2,
		expectedSlotIndex,
	);
	const permit2StateDiff = computePermit2StateDiff(ACCOUNT, [[TOKEN, SPENDER]]);
	const expectedValue = toHex(maxUint256, { size: 32 });
	const requestPayloads: Array<Record<string, unknown>> = [];
	const attemptedSlots: Hex[] = [];

	const client = {
		chain: { id: 1 },
		request: async ({
			params,
		}: {
			params: [Record<string, unknown>, string];
		}) => {
			requestPayloads.push(params[0]);
			throw new Error("eth_createAccessList unsupported");
		},
		readContract: async ({
			stateOverride,
		}: {
			stateOverride?: Array<{
				stateDiff?: Array<{ slot: Hex; value: Hex }>;
			}>;
		}) => {
			const slot = stateOverride?.[0]?.stateDiff?.[0]?.slot;
			if (!slot) {
				return 0n;
			}

			attemptedSlots.push(slot);
			return slot === expectedSlot ? maxUint256 : 0n;
		},
	};

	const originalWarn = console.warn;
	console.warn = () => {};

	try {
		const firstOverrides = await getApprovalOverrides(
			client as never,
			ACCOUNT,
			[[TOKEN, SPENDER]],
			PERMIT2,
		);

		assert.equal(requestPayloads[0]?.from, ACCOUNT);
		assert.deepEqual(firstOverrides, [
			{
				address: PERMIT2,
				stateDiff: permit2StateDiff,
			},
			{
				address: TOKEN,
				stateDiff: [{ slot: expectedSlot, value: expectedValue }],
			},
		]);
		assert.deepEqual(attemptedSlots, [
			computeAllowanceSlot(ACCOUNT, PERMIT2, 0n),
			computeAllowanceSlot(ACCOUNT, PERMIT2, 1n),
			expectedSlot,
		]);

		attemptedSlots.length = 0;

		const secondOverrides = await getApprovalOverrides(
			client as never,
			ACCOUNT,
			[[TOKEN, SPENDER]],
			PERMIT2,
		);

		assert.deepEqual(secondOverrides, firstOverrides);
		assert.deepEqual(attemptedSlots, [expectedSlot]);
	} finally {
		console.warn = originalWarn;
	}
});
