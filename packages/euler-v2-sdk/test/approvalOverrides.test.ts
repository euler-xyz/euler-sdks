import assert from "node:assert/strict";
import { test } from "vitest";
import {
	type Hex,
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

test("getApprovalOverrides discovers allowance slots from access-list candidates", async () => {
	const expectedSlot =
		"0x0000000000000000000000000000000000000000000000000000000000001234" as Hex;
	const decoySlot =
		"0x0000000000000000000000000000000000000000000000000000000000005678" as Hex;
	const permit2StateDiff = computePermit2StateDiff(ACCOUNT, [[TOKEN, SPENDER]]);
	const expectedValue = toHex(maxUint256, { size: 32 });
	const requestPayloads: Array<Record<string, unknown>> = [];

	const client = {
		request: async ({
			params,
		}: {
			params: [Record<string, unknown>, string];
		}) => {
			requestPayloads.push(params[0]);
			return {
				accessList: [
					{
						address: TOKEN,
						storageKeys: [decoySlot, expectedSlot],
					},
				],
			};
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

			return slot === expectedSlot ? maxUint256 : 0n;
		},
	};

	const overrides = await getApprovalOverrides(
		client as never,
		ACCOUNT,
		[[TOKEN, SPENDER]],
		PERMIT2,
	);

	assert.equal("from" in requestPayloads[0]!, false);
	assert.deepEqual(overrides, [
		{
			address: PERMIT2,
			stateDiff: permit2StateDiff,
		},
		{
			address: TOKEN,
			stateDiff: [{ slot: expectedSlot, value: expectedValue }],
		},
	]);
});
