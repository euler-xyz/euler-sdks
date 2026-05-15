import assert from "node:assert/strict";
import { test } from "vitest";
import { serviceDiagnosticOwner, type DataIssue } from "../src/utils/entityDiagnostics.js";
import {
	parseOptionalNumberField,
	parseOptionalStringField,
	parseOptionalTimestampField,
	parseTimestampField,
} from "../src/utils/parsing.js";

test("parseTimestampField accepts unix seconds and ISO timestamps", () => {
	const owner = serviceDiagnosticOwner("test", 1, "timestamp");
	const errors: DataIssue[] = [];

	assert.equal(
		parseTimestampField(1_762_597_127, {
			path: "$.timestamp",
			owner,
			errors,
			source: "test",
		}),
		1_762_597_127,
	);
	assert.equal(
		parseTimestampField("2025-11-08T10:18:47.000Z", {
			path: "$.timestamp",
			owner,
			errors,
			source: "test",
		}),
		1_762_597_127,
	);
	assert.equal(errors.length, 0);
});

test("optional parsers silently default absent values but report malformed present values", () => {
	const owner = serviceDiagnosticOwner("test", 1, "optional");
	const errors: DataIssue[] = [];

	assert.equal(
		parseOptionalStringField(undefined, {
			path: "$.label",
			owner,
			errors,
			source: "test",
			fallback: "fallback",
		}),
		"fallback",
	);
	assert.equal(
		parseOptionalNumberField(null, {
			path: "$.apy",
			owner,
			errors,
			source: "test",
			fallback: 0,
		}),
		0,
	);
	assert.equal(
		parseOptionalTimestampField("", {
			path: "$.validAt",
			owner,
			errors,
			source: "test",
		}),
		0,
	);
	assert.equal(errors.length, 0);

	assert.equal(
		parseOptionalNumberField(Number.NaN, {
			path: "$.apy",
			owner,
			errors,
			source: "test",
		}),
		0,
	);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.code, "DEFAULT_APPLIED");
});
