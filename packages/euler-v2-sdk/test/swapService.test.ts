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
const AMOUNT_IN_MAX = 1005n;
const AMOUNT_OUT = 950n;
const AMOUNT_OUT_MIN = 945n;

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

function encodeSkimVerifierData(amountOutMin: bigint) {
	return encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyAmountMinAndSkim",
		args: [RECEIVER, ACCOUNT_OUT, amountOutMin, BigInt(DEADLINE)],
	});
}

function encodeDebtVerifierData(amountMax: bigint) {
	return encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyDebtMax",
		args: [RECEIVER, ACCOUNT_OUT, amountMax, BigInt(DEADLINE)],
	});
}

function createQuote({
	verifierAddress = VERIFIER,
	amountIn = AMOUNT_IN,
	amountInMax = AMOUNT_IN_MAX,
	amountOut = AMOUNT_OUT,
	amountOutMin = AMOUNT_OUT_MIN,
}: {
	verifierAddress?: string;
	amountIn?: bigint;
	amountInMax?: bigint;
	amountOut?: bigint;
	amountOutMin?: bigint;
} = {}): SwapQuote {
	return {
		amountIn: amountIn.toString(),
		amountInMax: amountInMax.toString(),
		amountOut: amountOut.toString(),
		amountOutMin: amountOutMin.toString(),
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
			verifierData: encodeSkimVerifierData(amountOutMin),
			type: SwapVerificationType.SkimMin,
			vault: RECEIVER,
			account: ACCOUNT_OUT,
			amount: amountOutMin.toString(),
			deadline: DEADLINE,
		},
		route: [{ providerName: "test" }],
	};
}

function createTargetDebtQuote({
	amountIn = AMOUNT_IN,
	amountInMax = AMOUNT_IN_MAX,
	targetDebt = 0n,
}: {
	amountIn?: bigint;
	amountInMax?: bigint;
	targetDebt?: bigint;
} = {}): SwapQuote {
	return {
		...createQuote({ amountIn, amountInMax }),
		verify: {
			verifierAddress: VERIFIER,
			verifierData: encodeDebtVerifierData(targetDebt),
			type: SwapVerificationType.DebtMax,
			vault: RECEIVER,
			account: ACCOUNT_OUT,
			amount: targetDebt.toString(),
			deadline: DEADLINE,
		},
	};
}

function createTransferQuote(verifierAddress = VERIFIER): SwapQuote {
	return {
		...createQuote({ verifierAddress }),
		verify: {
			verifierAddress,
			verifierData: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "verifyAmountMinAndTransfer",
				args: [TOKEN_OUT, RECEIVER, AMOUNT_OUT_MIN, BigInt(DEADLINE)],
			}),
			type: SwapVerificationType.TransferMin,
			vault: TOKEN_OUT,
			account: RECEIVER,
			amount: AMOUNT_OUT_MIN.toString(),
			deadline: DEADLINE,
		},
		transferOutputToReceiver: true,
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
	const service = createSwapService(
		createQuote({ verifierAddress: OTHER_VERIFIER }),
	);

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

test("fetchSwapQuotes rejects verifier calldata that does not match quote fields", async () => {
	const quote = createQuote();
	quote.verify.verifierData = encodeSkimVerifierData(AMOUNT_OUT_MIN - 1n);
	const service = createSwapService(quote);

	await assert.rejects(
		() => service.fetchSwapQuotes(createRequest()),
		/SwapVerifier data mismatch/,
	);
});

test("fetchSwapQuotes rejects amountOutMin below requested slippage", async () => {
	const looseAmountOutMin = AMOUNT_OUT_MIN - 2n;
	const service = createSwapService(
		createQuote({ amountOutMin: looseAmountOutMin }),
	);

	await assert.rejects(
		() => service.fetchSwapQuotes(createRequest()),
		/amountOutMin exceeds requested slippage/,
	);
});

test("fetchSwapQuotes allows 0.01% multiplicative divergence for amountOutMin", async () => {
	const toleratedAmountOutMin = AMOUNT_OUT_MIN - 1n;
	const quote = createQuote({ amountOutMin: toleratedAmountOutMin });
	const service = createSwapService(quote);

	const quotes = await service.fetchSwapQuotes(createRequest());

	assert.equal(quotes[0], quote);
});

test("fetchSwapQuotes rejects amountInMax above requested slippage for target-debt quotes", async () => {
	const quote = createTargetDebtQuote({ amountInMax: AMOUNT_IN_MAX + 2n });
	const service = createSwapService(quote);
	const request = {
		...createRequest(),
		swapperMode: SwapperMode.TARGET_DEBT,
		isRepay: true,
		targetDebt: 0n,
	};

	await assert.rejects(
		() => service.fetchSwapQuotes(request),
		/amountInMax exceeds requested slippage/,
	);
});

test("fetchSwapQuotes allows 0.01% multiplicative divergence for amountInMax", async () => {
	const quote = createTargetDebtQuote({ amountInMax: AMOUNT_IN_MAX + 1n });
	const service = createSwapService(quote);
	const request = {
		...createRequest(),
		swapperMode: SwapperMode.TARGET_DEBT,
		isRepay: true,
		targetDebt: 0n,
	};

	const quotes = await service.fetchSwapQuotes(request);

	assert.equal(quotes[0], quote);
});

test("fetchWalletSwapQuote builds transfer-output request and validates transfer verifier data", async () => {
	let requestedUrl = "";
	const quote = createTransferQuote();
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async (url) => {
		requestedUrl = url;
		return { success: true, data: [quote] };
	});

	const quotes = await service.fetchWalletSwapQuote({
		chainId: CHAIN_ID,
		fromAsset: TOKEN_IN,
		toAsset: TOKEN_OUT,
		amount: AMOUNT_IN,
		receiver: RECEIVER,
		origin: ORIGIN,
		slippage: 0.5,
		deadline: DEADLINE,
	});

	assert.equal(quotes[0], quote);

	const params = new URL(requestedUrl).searchParams;
	assert.equal(
		params.get("transferOutputToReceiver"),
		"true",
	);
	assert.equal(params.get("skipSweepDepositOut"), "true");
	assert.equal(params.get("unusedInputReceiver"), ORIGIN);
	assert.equal(
		params.get("vaultIn"),
		"0x0000000000000000000000000000000000000000",
	);
	assert.equal(
		params.get("accountIn"),
		"0x0000000000000000000000000000000000000000",
	);
	assert.equal(
		params.get("accountOut"),
		"0x0000000000000000000000000000000000000000",
	);
});

test("fetchWalletSwapQuote rejects non-finite slippage before querying", async () => {
	let queried = false;
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async () => {
		queried = true;
		return { success: true, data: [createTransferQuote()] };
	});

	await assert.rejects(
		() =>
			service.fetchWalletSwapQuote({
				chainId: CHAIN_ID,
				fromAsset: TOKEN_IN,
				toAsset: TOKEN_OUT,
				amount: AMOUNT_IN,
				receiver: RECEIVER,
				origin: ORIGIN,
				slippage: Number.NaN,
			}),
		/Valid slippage between 0 and 50%/,
	);
	assert.equal(queried, false);
});

test("fetchWalletSwapQuote rejects empty quote responses", async () => {
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async () => ({ success: true, data: [] }));

	await assert.rejects(
		() =>
			service.fetchWalletSwapQuote({
				chainId: CHAIN_ID,
				fromAsset: TOKEN_IN,
				toAsset: TOKEN_OUT,
				amount: AMOUNT_IN,
				receiver: RECEIVER,
				origin: ORIGIN,
				slippage: 0.5,
			}),
		/No swap quotes available/,
	);
});
