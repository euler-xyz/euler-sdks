import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
	type Hex,
	getAddress,
	maxUint256,
	toHex,
} from "viem";
import {
	computePermit2StateDiff,
	getApprovalOverrides,
} from "../src/utils/stateOverrides/approvalOverrides.js";
import { computeAllowanceSlot } from "../src/utils/stateOverrides/slotHints.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN = "0x00000000000000000000000000000000000000bb" as const;
const SPENDER = "0x00000000000000000000000000000000000000cc" as const;
const PERMIT2 = "0x00000000000000000000000000000000000000dd" as const;
const PROBE_OWNER = "0x1111111111111111111111111111111111111111" as const;

afterEach(() => {
	vi.restoreAllMocks();
});

test("getApprovalOverrides discovers allowance slots from access-list candidates", async () => {
	const expectedSlot =
		"0x0000000000000000000000000000000000000000000000000000000000001234" as Hex;
	const decoySlot =
		"0x0000000000000000000000000000000000000000000000000000000000005678" as Hex;
	const permit2StateDiff = computePermit2StateDiff(ACCOUNT, [[TOKEN, SPENDER]]);
	const expectedValue = toHex(maxUint256, { size: 32 });
	const requestPayloads: Array<Record<string, unknown>> = [];

	const client = {
		chain: { id: 1 },
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
	assert.equal(requestPayloads[0]!.gas, "0x989680");
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

test("getApprovalOverrides falls back to raw slot probing after access-list failure", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});

	const token = "0x00000000000000000000000000000000000000b1" as const;
	const slotIndex = 2n;
	const probeSlot = computeAllowanceSlot(PROBE_OWNER, PERMIT2, slotIndex);
	const expectedSlot = computeAllowanceSlot(ACCOUNT, PERMIT2, slotIndex);
	const expectedValue = toHex(maxUint256, { size: 32 });
	let requestCount = 0;

	const client = {
		chain: { id: 1 },
		request: async () => {
			requestCount += 1;
			throw new Error("eth_createAccessList unavailable");
		},
		readContract: async ({
			stateOverride,
		}: {
			stateOverride?: Array<{
				stateDiff?: Array<{ slot: Hex; value: Hex }>;
			}>;
		}) => {
			const slot = stateOverride?.[0]?.stateDiff?.[0]?.slot;
			return slot === probeSlot ? maxUint256 : 0n;
		},
	};

	const overrides = await getApprovalOverrides(
		client as never,
		ACCOUNT,
		[[token, SPENDER]],
		PERMIT2,
	);

	assert.equal(requestCount, 1);
	assert.deepEqual(overrides, [
		{
			address: PERMIT2,
			stateDiff: computePermit2StateDiff(ACCOUNT, [[token, SPENDER]]),
		},
		{
			address: getAddress(token),
			stateDiff: [{ slot: expectedSlot, value: expectedValue }],
		},
	]);
});

test("getApprovalOverrides does not retry access-list after raw probing fails", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});

	const token = "0x00000000000000000000000000000000000000b2" as const;
	let requestCount = 0;

	const client = {
		chain: { id: 1 },
		request: async () => {
			requestCount += 1;
			throw new Error("eth_createAccessList unavailable");
		},
		readContract: async () => 0n,
	};

	const overrides = await getApprovalOverrides(
		client as never,
		ACCOUNT,
		[[token, SPENDER]],
		PERMIT2,
	);

	assert.equal(requestCount, 1);
	assert.deepEqual(overrides, [
		{
			address: PERMIT2,
			stateDiff: computePermit2StateDiff(ACCOUNT, [[token, SPENDER]]),
		},
	]);
});
