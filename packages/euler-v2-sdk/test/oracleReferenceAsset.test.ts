import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeOracleReferenceAssetDecimals } from "../src/services/vaults/eVaultService/adapters/oracleReferenceAsset.js";

const NON_BTC_REFERENCE_ASSET =
	"0x0000000000000000000000000000000000000001" as const;

test("non-BTC reference assets preserve their metadata decimals", () => {
	assert.equal(
		normalizeOracleReferenceAssetDecimals(NON_BTC_REFERENCE_ASSET, 6),
		6,
	);
});
