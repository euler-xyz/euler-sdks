import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { type Hex, getAddress, maxUint256, toHex } from "viem";
import { getBalanceOverrides } from "../src/utils/stateOverrides/balanceOverrides.js";
import { computeBalanceSlot } from "../src/utils/stateOverrides/slotHints.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN = "0x00000000000000000000000000000000000000ba" as const;
const PROBE_OWNER = "0x1111111111111111111111111111111111111111" as const;

afterEach(() => {
	vi.restoreAllMocks();
});

test("getBalanceOverrides tries access-list before raw slot probing and falls back to raw", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});

	const requiredAmount = 123n;
	const slotIndex = 3n;
	const probeSlot = computeBalanceSlot(PROBE_OWNER, slotIndex);
	const expectedSlot = computeBalanceSlot(ACCOUNT, slotIndex);
	const expectedValue = toHex(requiredAmount, { size: 32 });
	const events: string[] = [];

	const client = {
		chain: { id: 1 },
		request: async ({ method }: { method: string }) => {
			events.push(`request:${method}`);
			throw new Error("eth_createAccessList unavailable");
		},
		readContract: async ({
			functionName,
			stateOverride,
		}: {
			functionName: string;
			stateOverride?: Array<{
				stateDiff?: Array<{ slot: Hex; value: Hex }>;
			}>;
		}) => {
			const slot = stateOverride?.[0]?.stateDiff?.[0]?.slot;
			events.push(slot ? `read:${functionName}:override` : `read:${functionName}:live`);
			return slot === probeSlot ? maxUint256 : 0n;
		},
	};

	const overrides = await getBalanceOverrides(
		client as never,
		ACCOUNT,
		[[TOKEN, requiredAmount]],
	);

	const accessListIndex = events.indexOf("request:eth_createAccessList");
	const firstOverrideReadIndex = events.indexOf("read:balanceOf:override");
	assert.equal(events[0], "read:balanceOf:live");
	assert.ok(accessListIndex > 0);
	assert.ok(firstOverrideReadIndex > accessListIndex);
	assert.deepEqual(overrides, [
		{
			address: getAddress(TOKEN),
			stateDiff: [{ slot: expectedSlot, value: expectedValue }],
		},
	]);
});

test("getBalanceOverrides falls back to raw probing when access-list has no token slots", async () => {
	const token = "0x00000000000000000000000000000000000000bb" as const;
	const requiredAmount = 456n;
	const slotIndex = 4n;
	const probeSlot = computeBalanceSlot(PROBE_OWNER, slotIndex);
	const expectedSlot = computeBalanceSlot(ACCOUNT, slotIndex);
	const expectedValue = toHex(requiredAmount, { size: 32 });

	const client = {
		chain: { id: 1 },
		request: async () => ({
			accessList: [],
		}),
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

	const overrides = await getBalanceOverrides(
		client as never,
		ACCOUNT,
		[[token, requiredAmount]],
	);

	assert.deepEqual(overrides, [
		{
			address: getAddress(token),
			stateDiff: [{ slot: expectedSlot, value: expectedValue }],
		},
	]);
});
