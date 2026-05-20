import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeAbiParameters } from "viem";
import {
	decodeIRMParams,
	type FixedCyclicalBinaryMonthlyIRMInfo,
	InterestRateModelType,
	normalizeIRMParams,
} from "../src/utils/irm.js";

test("decodeIRMParams handles FIXED_CYCLICAL_BINARY_MONTHLY", () => {
	const expected: FixedCyclicalBinaryMonthlyIRMInfo = {
		primaryRate: 1_234_567n,
		secondaryRate: 9_876_543n,
		cycleStartDay: 15n,
		secondaryDays: 5n,
	};
	const encoded = encodeAbiParameters(
		[
			{ name: "primaryRate", type: "uint256" },
			{ name: "secondaryRate", type: "uint256" },
			{ name: "cycleStartDay", type: "uint256" },
			{ name: "secondaryDays", type: "uint256" },
		],
		[
			expected.primaryRate,
			expected.secondaryRate,
			expected.cycleStartDay,
			expected.secondaryDays,
		],
	);

	const decoded = decodeIRMParams(
		InterestRateModelType.FIXED_CYCLICAL_BINARY_MONTHLY,
		encoded,
	) as FixedCyclicalBinaryMonthlyIRMInfo;

	assert.deepEqual(decoded, expected);
});

test("normalizeIRMParams accepts string/number inputs for FIXED_CYCLICAL_BINARY_MONTHLY", () => {
	const normalized = normalizeIRMParams(
		InterestRateModelType.FIXED_CYCLICAL_BINARY_MONTHLY,
		{
			primaryRate: "1",
			secondaryRate: 2,
			cycleStartDay: "15",
			secondaryDays: "5",
		},
	) as FixedCyclicalBinaryMonthlyIRMInfo;

	assert.deepEqual(normalized, {
		primaryRate: 1n,
		secondaryRate: 2n,
		cycleStartDay: 15n,
		secondaryDays: 5n,
	});
});
