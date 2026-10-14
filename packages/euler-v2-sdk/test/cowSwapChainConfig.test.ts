import assert from "node:assert/strict";
import { test } from "vitest";
import { isAddress, zeroAddress } from "viem";
import { getCowSwapChainConfig } from "../src/services/executionService/index.js";
import { COWSWAP_CHAIN_CONFIG } from "../src/services/executionService/cowSwapHelpers.js";

test("every CoW Swap chain config has an https orderbook and distinct checksummed contracts", () => {
	for (const [chainId, config] of Object.entries(COWSWAP_CHAIN_CONFIG)) {
		const { orderbookUrl, ...contracts } = config;
		const wrappers = [
			contracts.openPositionWrapper,
			contracts.closePositionWrapper,
			contracts.collateralSwapWrapper,
		];

		assert.equal(getCowSwapChainConfig(Number(chainId)), config);
		assert.equal(new URL(orderbookUrl).protocol, "https:");
		assert.equal(orderbookUrl.endsWith("/"), false);
		for (const address of Object.values(contracts)) {
			assert.ok(isAddress(address), `${chainId}: ${address}`);
			assert.notEqual(address, zeroAddress);
		}
		assert.equal(new Set(wrappers).size, wrappers.length);
	}
});

test("has no CoW Swap config for a chain without an entry", () => {
	assert.equal(getCowSwapChainConfig(777001), undefined);
});
