import assert from "node:assert/strict";
import { test } from "vitest";
import { PriceService } from "../src/services/priceService/priceService.js";
import { backendPriceToBigInt } from "../src/services/priceService/backendClient.js";

const CHAIN_ID = 1;
const ASSET = "0x00000000000000000000000000000000000000aa" as const;

function createPriceService() {
	return new PriceService(
		{
			getProvider: () => ({}) as never,
		} as never,
		{
			getDeployment: () => ({
				addresses: {
					lensAddrs: {
						utilsLens: "0x00000000000000000000000000000000000000bb",
					},
				},
			}),
		} as never,
		undefined,
	);
}

test("fetchAssetUsdPriceByAddress returns backend price when available", async () => {
	const service = createPriceService();
	service.setBackendClient({
		isConfigured: true,
		queryV3Price: async () => ({ price: "12.34" }),
	} as never);
	const expectedPrice = backendPriceToBigInt("12.34");

	const price = await service.fetchAssetUsdPriceByAddress(CHAIN_ID, ASSET);

	assert.deepEqual(price, {
		amountOutMid: expectedPrice,
		amountOutAsk: expectedPrice,
		amountOutBid: expectedPrice,
		decimals: 18,
	});
});

test("fetchAssetUsdPriceByAddress falls back to on-chain asset pricing", async () => {
	const service = createPriceService();
	service.setBackendClient({
		isConfigured: true,
		queryV3Price: async () => {
			throw new Error("backend unavailable");
		},
	} as never);
	service.setQueryAssetPriceInfo(async () => ({
		queryFailure: false,
		amountOutMid: 42000000000000000000n,
	}));

	const result = await service.fetchAssetUsdPriceByAddressWithDiagnostics(
		CHAIN_ID,
		ASSET,
	);

	assert.deepEqual(result.result, {
		amountOutMid: 42000000000000000000n,
		amountOutAsk: 42000000000000000000n,
		amountOutBid: 42000000000000000000n,
		decimals: 18,
	});
	assert.equal(result.errors?.[0]?.code, "FALLBACK_USED");
});
