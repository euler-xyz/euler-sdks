import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeFunctionData } from "viem";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";
import {
	SwapService,
	SwapperMode,
	SwapVerificationType,
	type SwapQuote,
	type SwapQuoteRequest,
} from "../src/services/swapService/index.js";
import { swapVerifierAbi } from "../src/services/swapService/swapVerifierAbi.js";

const CHAIN_ID = 1;
const ACCOUNT_IN = "0x00000000000000000000000000000000000000aa";
const ACCOUNT_OUT = "0x00000000000000000000000000000000000000bb";
const TOKEN_IN = "0x00000000000000000000000000000000000000cc";
const TOKEN_OUT = "0x00000000000000000000000000000000000000dd";
const VAULT_IN = "0x00000000000000000000000000000000000000ee";
const RECEIVER = "0x00000000000000000000000000000000000000ff";
const ORIGIN = "0x0000000000000000000000000000000000000011";
const SWAPPER = "0x0000000000000000000000000000000000000022";
const VERIFIER = "0x0000000000000000000000000000000000000033";
const OTHER_VERIFIER = "0x0000000000000000000000000000000000000044";
const DEADLINE = 123456;
const AMOUNT_IN = 1000n;
const AMOUNT_OUT_MIN = 900n;

function createDeploymentService(swapVerifier?: string): IDeploymentService {
	return {
		getDeploymentChainIds: () => [CHAIN_ID],
		getDeployment: () =>
			({
				chainId: CHAIN_ID,
				addresses: {
					peripheryAddrs: {
						swapVerifier,
					},
				},
			}) as never,
		addDeployment: () => {},
	};
}

function createRequest(): SwapQuoteRequest {
	return {
		chainId: CHAIN_ID,
		tokenIn: TOKEN_IN,
		tokenOut: TOKEN_OUT,
		accountIn: ACCOUNT_IN,
		accountOut: ACCOUNT_OUT,
		amount: AMOUNT_IN,
		vaultIn: VAULT_IN,
		receiver: RECEIVER,
		origin: ORIGIN,
		slippage: 0.5,
		swapperMode: SwapperMode.EXACT_IN,
		isRepay: false,
		targetDebt: 0n,
		currentDebt: 0n,
		deadline: DEADLINE,
	};
}

function createQuote(verifierAddress = VERIFIER): SwapQuote {
	return {
		amountIn: AMOUNT_IN.toString(),
		amountInMax: AMOUNT_IN.toString(),
		amountOut: "950",
		amountOutMin: AMOUNT_OUT_MIN.toString(),
		accountIn: ACCOUNT_IN,
		accountOut: ACCOUNT_OUT,
		vaultIn: VAULT_IN,
		receiver: RECEIVER,
		tokenIn: {
			address: TOKEN_IN,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Token In",
			symbol: "TIN",
		},
		tokenOut: {
			address: TOKEN_OUT,
			chainId: CHAIN_ID,
			decimals: 6,
			logoURI: "",
			name: "Token Out",
			symbol: "TOUT",
		},
		slippage: 0.5,
		swap: {
			swapperAddress: SWAPPER,
			swapperData: "0x",
			multicallItems: [],
		},
		verify: {
			verifierAddress,
			verifierData: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "verifyAmountMinAndSkim",
				args: [RECEIVER, ACCOUNT_OUT, AMOUNT_OUT_MIN, BigInt(DEADLINE)],
			}),
			type: SwapVerificationType.SkimMin,
			vault: RECEIVER,
			account: ACCOUNT_OUT,
			amount: AMOUNT_OUT_MIN.toString(),
			deadline: DEADLINE,
		},
		route: [{ providerName: "test" }],
	};
}

function createSwapService(
	quote: SwapQuote,
	deploymentService = createDeploymentService(VERIFIER),
) {
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		deploymentService,
	);
	service.setQuerySwapQuotes(async () => ({ success: true, data: [quote] }));
	return service;
}

test("fetchSwapQuotes accepts verifier address from deployment service", async () => {
	const quote = createQuote();
	const service = createSwapService(quote);

	const quotes = await service.fetchSwapQuotes(createRequest());

	assert.equal(quotes[0], quote);
});

test("fetchSwapQuotes rejects verifier address that differs from deployment service", async () => {
	const service = createSwapService(createQuote(OTHER_VERIFIER));

	await assert.rejects(
		() => service.fetchSwapQuotes(createRequest()),
		/SwapVerifier address mismatch/,
	);
});

test("fetchSwapQuotes rejects when deployment has no swap verifier address", async () => {
	const service = createSwapService(
		createQuote(),
		createDeploymentService(undefined),
	);

	await assert.rejects(
		() => service.fetchSwapQuotes(createRequest()),
		/SwapVerifier address missing for chainId 1/,
	);
});
