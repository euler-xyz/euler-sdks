import assert from "node:assert/strict";
import { test } from "vitest";

import * as sdk from "../src/index.js";

/** The consumer-facing surface a block-pinned reader builds its items from. */
test("the barrel exports the block-pinned read surface", () => {
	for (const name of [
		"pinClientToBlock",
		"getClientBlockPin",
		"readMany",
		"MULTICALL3_ADDRESS",
		"encodeEVCBatch",
		"getPerspectiveVerifiedArrayBatchItem",
		"perspectiveVerifiedArrayAbi",
		"getSecuritizeGovernorAdminBatchItem",
		"getSecuritizeSupplyCapResolvedBatchItem",
		"getVaultInfoERC4626LensBatchItem",
		"vaultLensAbi",
		"convertVaultInfoFullToIEVault",
	]) {
		assert.ok(name in sdk, `${name} is not exported`);
	}
});
