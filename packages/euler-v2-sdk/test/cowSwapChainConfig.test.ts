import assert from "node:assert/strict";
import { test } from "vitest";
import { getCowSwapChainConfig } from "../src/services/executionService/index.js";

test("returns the BSC CoW Swap deployment config", () => {
	assert.deepEqual(getCowSwapChainConfig(56), {
		orderbookUrl: "https://api.cow.fi/bnb",
		settlementContract: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
		vaultRelayer: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
		openPositionWrapper: "0x64C26b3A182826fe2AB8c04C8Caf40B0c4Bf9a66",
		closePositionWrapper: "0x4f4CE927188637b4a1d91350c3114F4BD301dd02",
		collateralSwapWrapper: "0xCC054CD4b814a2caEb63C6F6A446435480a383F3",
	});
});
