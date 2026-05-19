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
import { validateSwapQuoteSlippageData } from "../src/services/swapService/swapVerification.js";

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

function createDeploymentService(
	swapVerifier?: string,
	swapper: string | undefined = SWAPPER,
): IDeploymentService {
	return {
		getDeploymentChainIds: () => [CHAIN_ID],
		getDeployment: () =>
			({
				chainId: CHAIN_ID,
				addresses: {
					peripheryAddrs: {
						swapVerifier,
						swapper,
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
		accountIn: "0x0000000000000000000000000000000000000000",
		accountOut: "0x0000000000000000000000000000000000000000",
		vaultIn: "0x0000000000000000000000000000000000000000",
		receiver: RECEIVER,
		verify: {
			verifierAddress,
			verifierData: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "verifyAmountMinAndTransfer",
				args: [TOKEN_OUT, RECEIVER, AMOUNT_OUT_MIN, BigInt(DEADLINE)],
			}),
			type: SwapVerificationType.TransferMin,
			vault: RECEIVER,
			account: "0x0000000000000000000000000000000000000000",
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

test.each([
	{
		name: "tokenIn",
		mutate: (quote: SwapQuote) => {
			quote.tokenIn.address = OTHER_VERIFIER;
		},
		error: /Swap quote tokenIn mismatch/,
	},
	{
		name: "tokenIn.chainId",
		mutate: (quote: SwapQuote) => {
			quote.tokenIn.chainId = CHAIN_ID + 1;
		},
		error: /Swap quote tokenIn\.chainId mismatch/,
	},
	{
		name: "tokenOut",
		mutate: (quote: SwapQuote) => {
			quote.tokenOut.address = OTHER_VERIFIER;
		},
		error: /Swap quote tokenOut mismatch/,
	},
	{
		name: "tokenOut.chainId",
		mutate: (quote: SwapQuote) => {
			quote.tokenOut.chainId = CHAIN_ID + 1;
		},
		error: /Swap quote tokenOut\.chainId mismatch/,
	},
	{
		name: "accountIn",
		mutate: (quote: SwapQuote) => {
			quote.accountIn = OTHER_VERIFIER;
		},
		error: /Swap quote accountIn mismatch/,
	},
	{
		name: "accountOut",
		mutate: (quote: SwapQuote) => {
			quote.accountOut = OTHER_VERIFIER;
		},
		error: /Swap quote accountOut mismatch/,
	},
	{
		name: "vaultIn",
		mutate: (quote: SwapQuote) => {
			quote.vaultIn = OTHER_VERIFIER;
		},
		error: /Swap quote vaultIn mismatch/,
	},
	{
		name: "receiver",
		mutate: (quote: SwapQuote) => {
			quote.receiver = OTHER_VERIFIER;
		},
		error: /Swap quote receiver mismatch/,
	},
	{
		name: "amountIn",
		mutate: (quote: SwapQuote) => {
			quote.amountIn = (AMOUNT_IN + 1n).toString();
		},
		error: /Swap quote amountIn mismatch/,
	},
	{
		name: "transferOutputToReceiver",
		mutate: (quote: SwapQuote) => {
			quote.transferOutputToReceiver = true;
		},
		error: /Swap quote transferOutputToReceiver mismatch/,
	},
	{
		name: "swap.swapperAddress",
		mutate: (quote: SwapQuote) => {
			quote.swap.swapperAddress = OTHER_VERIFIER;
		},
		error: /Swap quote swap\.swapperAddress mismatch/,
	},
	{
		name: "verify.type",
		mutate: (quote: SwapQuote) => {
			quote.verify.type = SwapVerificationType.DebtMax;
		},
		error: /Swap quote verify\.type mismatch/,
	},
	{
		name: "verify.vault",
		mutate: (quote: SwapQuote) => {
			quote.verify.vault = OTHER_VERIFIER;
		},
		error: /Swap quote verify\.vault mismatch/,
	},
	{
		name: "verify.account",
		mutate: (quote: SwapQuote) => {
			quote.verify.account = OTHER_VERIFIER;
		},
		error: /Swap quote verify\.account mismatch/,
	},
	{
		name: "verify.amount",
		mutate: (quote: SwapQuote) => {
			quote.verify.amount = (AMOUNT_OUT_MIN - 1n).toString();
		},
		error: /Swap quote verify\.amount mismatch/,
	},
	{
		name: "verify.deadline",
		mutate: (quote: SwapQuote) => {
			quote.verify.deadline = DEADLINE + 1;
		},
		error: /Swap quote verify\.deadline mismatch/,
	},
])("fetchSwapQuotes rejects returned $name that does not match request", async ({
	mutate,
	error,
}) => {
	const quote = createQuote();
	mutate(quote);
	const service = createSwapService(quote);

	await assert.rejects(() => service.fetchSwapQuotes(createRequest()), error);
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

test("fetchSwapQuotes rejects exact-out quotes explicitly before querying", async () => {
	let queried = false;
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async () => {
		queried = true;
		return { success: true, data: [createQuote()] };
	});

	await assert.rejects(
		() =>
			service.fetchSwapQuotes({
				...createRequest(),
				amount: AMOUNT_OUT,
				swapperMode: SwapperMode.EXACT_OUT,
			}),
		/EXACT_OUT swap quotes are not supported/,
	);
	assert.equal(queried, false);
});

test("exact-out slippage validation rejects amountInMax above requested slippage", () => {
	assert.throws(
		() =>
			validateSwapQuoteSlippageData(
				{ slippage: 0.5, swapperMode: SwapperMode.EXACT_OUT },
				createQuote({ amountInMax: AMOUNT_IN_MAX + 2n }),
			),
		/amountInMax exceeds requested slippage/,
	);
});

test("exact-out slippage validation allows 0.01% multiplicative divergence for amountInMax", () => {
	assert.doesNotThrow(() =>
		validateSwapQuoteSlippageData(
			{ slippage: 0.5, swapperMode: SwapperMode.EXACT_OUT },
			createQuote({ amountInMax: AMOUNT_IN_MAX + 1n }),
		),
	);
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
	assert.equal(params.has("providerExtraData"), false);
});

test("fetchSwapQuotes serializes and validates CoW provider data", async () => {
	let requestedUrl = "";
	const quote = {
		...createQuote(),
		route: [{ providerName: "cow" }],
		providerData: {
			quoteId: "7",
			sellAmount: "990",
			feeAmount: "10",
			buyAmount: AMOUNT_OUT.toString(),
		},
	};
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async (url) => {
		requestedUrl = url;
		return { success: true, data: [quote] };
	});

	const quotes = await service.fetchSwapQuotes({
		...createRequest(),
		provider: "cow",
		providerExtraData: {
			type: "openPosition",
			appData: "cow-app-data",
		},
	});

	assert.equal(quotes[0], quote);
	assert.equal(quotes[0]?.providerData?.quoteId, 7);
	const params = new URL(requestedUrl).searchParams;
	assert.deepEqual(JSON.parse(params.get("providerExtraData") ?? "{}"), {
		type: "openPosition",
		appData: "cow-app-data",
	});
});

test("fetchSwapQuotes reports detailed CoW provider amount mismatches", async () => {
	const quote = {
		...createQuote(),
		route: [{ providerName: "cow" }],
		providerData: {
			quoteId: 7,
			sellAmount: "1000",
			feeAmount: "10",
			buyAmount: AMOUNT_OUT.toString(),
		},
	};
	const service = createSwapService(quote);

	await assert.rejects(
		() =>
			service.fetchSwapQuotes({
				...createRequest(),
				provider: "cow",
				providerExtraData: {
					type: "openPosition",
					appData: "cow-app-data",
				},
			}),
		/Swap quote validation failed \(quote #1, route=cow, amountIn=1000, amountOut=950, providerData=.*CoW quote providerData sell total mismatch: providerData\.sellAmount \(1000\) \+ providerData\.feeAmount \(10\) = 1010, expected 1000/,
	);
});

test("fetchDepositQuote builds collateral-swap CoW provider data when provider is unset", async () => {
	let requestedUrl = "";
	const quote = {
		...createQuote(),
		route: [{ providerName: "cow" }],
		providerData: {
			quoteId: 7,
			sellAmount: "120",
			feeAmount: "3",
			buyAmount: AMOUNT_OUT.toString(),
		},
	};
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async (url) => {
		requestedUrl = url;
		return { success: true, data: [quote] };
	});

	await service.fetchDepositQuote({
		chainId: CHAIN_ID,
		fromVault: VAULT_IN,
		toVault: RECEIVER,
		fromAccount: ACCOUNT_IN,
		toAccount: ACCOUNT_OUT,
		fromAsset: TOKEN_IN,
		toAsset: TOKEN_OUT,
		amount: AMOUNT_IN,
		origin: ORIGIN,
		slippage: 0.5,
		deadline: DEADLINE,
		cowSwap: {
			type: "collateralSwap",
			owner: ORIGIN,
			sharesAmount: 123n,
			disableSourceCollateral: true,
		},
	});

	const params = new URL(requestedUrl).searchParams;
	assert.equal(params.has("provider"), false);
	const providerExtraData = JSON.parse(
		params.get("providerExtraData") ?? "{}",
	);
	assert.equal(providerExtraData.type, "collateralSwap");
	assert.equal(providerExtraData.swapCollateralSharesAmountIn, "123");
	assert.equal(typeof providerExtraData.appData, "string");
});

test("fetchDepositQuote accepts non-CoW quotes when CoW data is attached without provider filter", async () => {
	let requestedUrl = "";
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async (url) => {
		requestedUrl = url;
		return { success: true, data: [createQuote()] };
	});

	const quotes = await service.fetchDepositQuote({
		chainId: CHAIN_ID,
		fromVault: VAULT_IN,
		toVault: RECEIVER,
		fromAccount: ACCOUNT_IN,
		toAccount: ACCOUNT_OUT,
		fromAsset: TOKEN_IN,
		toAsset: TOKEN_OUT,
		amount: AMOUNT_IN,
		origin: ORIGIN,
		slippage: 0.5,
		deadline: DEADLINE,
		cowSwap: {
			type: "openPosition",
			owner: ORIGIN,
			collateralVault: VAULT_IN,
			collateralAmount: 100n,
		},
	});

	assert.equal(quotes[0]?.route[0]?.providerName, "test");
	const params = new URL(requestedUrl).searchParams;
	assert.equal(JSON.parse(params.get("providerExtraData") ?? "{}").type, "openPosition");
});

test("fetchDepositQuote rejects non-CoW quote when CoW provider is explicit", async () => {
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async () => ({ success: true, data: [createQuote()] }));

	await assert.rejects(
		() =>
			service.fetchDepositQuote({
				chainId: CHAIN_ID,
				fromVault: VAULT_IN,
				toVault: RECEIVER,
				fromAccount: ACCOUNT_IN,
				toAccount: ACCOUNT_OUT,
				fromAsset: TOKEN_IN,
				toAsset: TOKEN_OUT,
				amount: AMOUNT_IN,
				origin: ORIGIN,
				slippage: 0.5,
				deadline: DEADLINE,
				provider: "cow",
				cowSwap: {
					type: "openPosition",
					owner: ORIGIN,
					collateralVault: VAULT_IN,
					collateralAmount: 100n,
				},
			}),
		/CoW quote route must include cow/,
	);
});

test("fetchDepositQuote skips generated CoW provider data for explicit non-CoW provider", async () => {
	let requestedUrl = "";
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async (url) => {
		requestedUrl = url;
		return { success: true, data: [createQuote()] };
	});

	await service.fetchDepositQuote({
		chainId: CHAIN_ID,
		fromVault: VAULT_IN,
		toVault: RECEIVER,
		fromAccount: ACCOUNT_IN,
		toAccount: ACCOUNT_OUT,
		fromAsset: TOKEN_IN,
		toAsset: TOKEN_OUT,
		amount: AMOUNT_IN,
		origin: ORIGIN,
		slippage: 0.5,
		deadline: DEADLINE,
		provider: "1inch",
		cowSwap: {
			type: "collateralSwap",
			owner: ORIGIN,
			sharesAmount: 123n,
		},
	});

	const params = new URL(requestedUrl).searchParams;
	assert.equal(params.get("provider"), "1inch");
	assert.equal(params.has("providerExtraData"), false);
});

test("fetchRepayQuotes builds close-position CoW provider data for CoW provider", async () => {
	let requestedUrl = "";
	const quote = {
		...createTargetDebtQuote({ targetDebt: 0n }),
		route: [{ providerName: "cow" }],
		providerData: {
			quoteId: 8,
			sellAmount: "500",
			feeAmount: "0",
			buyAmount: AMOUNT_IN.toString(),
		},
	};
	const service = new SwapService(
		{ swapApiUrl: "https://swap.example" },
		createDeploymentService(VERIFIER),
	);
	service.setQuerySwapQuotes(async (url) => {
		requestedUrl = url;
		return { success: true, data: [quote] };
	});

	await service.fetchRepayQuotes({
		chainId: CHAIN_ID,
		fromVault: VAULT_IN,
		fromAsset: TOKEN_IN,
		fromAccount: ACCOUNT_IN,
		liabilityVault: RECEIVER,
		liabilityAsset: TOKEN_OUT,
		currentDebt: AMOUNT_IN,
		toAccount: ACCOUNT_OUT,
		origin: ORIGIN,
		swapperMode: SwapperMode.TARGET_DEBT,
		liabilityAmount: AMOUNT_IN,
		slippage: 0.5,
		deadline: DEADLINE,
		provider: "cow",
		cowSwap: {
			type: "closePosition",
			owner: ORIGIN,
			collateralSharesAmount: 500n,
		},
	});

	const params = new URL(requestedUrl).searchParams;
	assert.equal(params.get("provider"), "cow");
	const providerExtraData = JSON.parse(
		params.get("providerExtraData") ?? "{}",
	);
	assert.equal(providerExtraData.type, "closePosition");
	assert.equal(typeof providerExtraData.appData, "string");
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
