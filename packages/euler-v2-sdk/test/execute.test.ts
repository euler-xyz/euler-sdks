import assert from "node:assert/strict";
import { test } from "vitest";
import {
	decodeFunctionData,
	encodeFunctionData,
	erc20Abi,
	getAddress,
	type Hex,
} from "viem";
import {
	cancelCowSwapOrder,
	ExecutionService,
	executeTransactionPlan,
	fetchCowSwapOrderStatus,
	getCowSwapOrderExplorerUrl,
	pollCowSwapOrderStatus,
	type CowSwapOpenPositionPlanParams,
	type CowSwapPlanItem,
	type EVCBatchItem,
	type TransactionPlan,
} from "../src/services/executionService/index.js";

const ACCOUNT = getAddress("0x00000000000000000000000000000000000000aA");
const TOKEN = getAddress("0x00000000000000000000000000000000000000bB");
const SPENDER = getAddress("0x00000000000000000000000000000000000000cC");
const EVC = getAddress("0x00000000000000000000000000000000000000dD");
const PERMIT2 = getAddress("0x00000000000000000000000000000000000000Ee");
const TARGET = getAddress("0x00000000000000000000000000000000000000Ff");

function receipt(hash: Hex) {
	return { status: "success", transactionHash: hash } as never;
}

function createExecutorMocks() {
	const sent: unknown[] = [];
	const waits: Hex[] = [];
	const encodedBatchInputs: EVCBatchItem[][] = [];
	const permitBatchItem: EVCBatchItem = {
		targetContract: PERMIT2,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xpermit",
	};

	const publicClient = {
		chain: {
			id: 1,
			name: "mainnet",
			nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
			rpcUrls: { default: { http: ["http://localhost"] } },
		},
		waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => {
			waits.push(hash);
			return receipt(hash);
		},
		readContract: async () => [0n, 0, 7] as const,
	} as never;
	const walletClient = {
		sendTransaction: async (request: unknown) => {
			sent.push(request);
			return `0x${sent.length.toString().padStart(64, "0")}` as Hex;
		},
		signTypedData: async () => "0xsignature" as Hex,
	} as never;
	const deploymentService = {
		getDeployment: () => ({
			addresses: { coreAddrs: { evc: EVC, permit2: PERMIT2 } },
		}),
	} as never;
	const providerService = {
		getProvider: () => publicClient,
	} as never;
	const walletService = {
		fetchWallet: async () => ({ result: {} }),
	} as never;
	const executionService = {
		resolveRequiredApprovals: async ({ plan }: { plan: TransactionPlan }) => plan,
		encodeBatch: (items: EVCBatchItem[]) => {
			encodedBatchInputs.push(items);
			return "0xbatch" as Hex;
		},
		getPermit2TypedData: () => ({
			domain: { name: "Permit2" },
			types: {
				PermitSingle: [{ name: "details", type: "PermitDetails" }],
				PermitDetails: [
					{ name: "token", type: "address" },
					{ name: "amount", type: "uint160" },
					{ name: "expiration", type: "uint48" },
					{ name: "nonce", type: "uint48" },
				],
			},
			primaryType: "PermitSingle",
			message: {
				details: {
					token: TOKEN,
					amount: 10n,
					expiration: 0,
					nonce: 7,
				},
				spender: SPENDER,
				sigDeadline: 0,
			},
		}),
		encodePermit2Call: () => permitBatchItem,
	} as never;

	return {
		executionService,
		deploymentService,
		providerService,
		walletService,
		publicClient,
		walletClient,
		sent,
		waits,
		encodedBatchInputs,
		permitBatchItem,
	};
}

test("executeTransactionPlan sends approvals before the EVC batch and waits for each receipt", async () => {
	const {
		executionService,
		deploymentService,
		providerService,
		walletClient,
		sent,
		waits,
		encodedBatchInputs,
	} = createExecutorMocks();
	const batchItem: EVCBatchItem = {
		targetContract: TARGET,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0x1234",
	};
	const plan: TransactionPlan = [
		{
			type: "requiredApproval",
			token: TOKEN,
			owner: ACCOUNT,
			spender: SPENDER,
			amount: 10n,
			resolved: [
				{
					type: "approve",
					token: TOKEN,
					owner: ACCOUNT,
					spender: SPENDER,
					amount: 10n,
					data: encodeFunctionData({
						abi: erc20Abi,
						functionName: "approve",
						args: [SPENDER, 10n],
					}),
				},
			],
		},
		{
			type: "evcBatch",
			items: [{ type: "operation", name: "test", items: [batchItem] }],
		},
	];

	const result = await executeTransactionPlan({
		plan,
		executionService,
		deploymentService,
		providerService,
		chainId: 1,
		account: ACCOUNT,
		sendTransaction: walletClient.sendTransaction,
	});

	assert.equal(sent.length, 2);
	assert.equal(waits.length, 2);
	assert.ok(!("gas" in (sent[0] as Record<string, unknown>)));
	assert.ok(!("gas" in (sent[1] as Record<string, unknown>)));
	assert.deepEqual(result.hashes, waits);
	assert.equal(encodedBatchInputs.length, 1);
	assert.deepEqual(encodedBatchInputs[0], [batchItem]);
});

test("executeTransactionPlan prepends signed Permit2 calls to the next EVC batch", async () => {
	const {
		executionService,
		deploymentService,
		providerService,
		walletClient,
		sent,
		encodedBatchInputs,
		permitBatchItem,
	} = createExecutorMocks();
	const batchItem: EVCBatchItem = {
		targetContract: TARGET,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0x1234",
	};
	const plan: TransactionPlan = [
		{
			type: "requiredApproval",
			token: TOKEN,
			owner: ACCOUNT,
			spender: SPENDER,
			amount: 10n,
			resolved: [
				{
					type: "permit2",
					token: TOKEN,
					owner: ACCOUNT,
					spender: SPENDER,
					amount: 10n,
				},
			],
		},
		{ type: "evcBatch", items: [batchItem] },
	];

	await executeTransactionPlan({
		plan,
		executionService,
		deploymentService,
		providerService,
		chainId: 1,
		account: ACCOUNT,
		sendTransaction: walletClient.sendTransaction,
		signTypedData: walletClient.signTypedData,
	});

	assert.equal(sent.length, 1);
	assert.ok(!("gas" in (sent[0] as Record<string, unknown>)));
	assert.equal(encodedBatchInputs.length, 1);
	assert.deepEqual(encodedBatchInputs[0], [permitBatchItem, batchItem]);
});

test("ExecutionService.executeTransactionPlan executes through the service instance", async () => {
	const { deploymentService, providerService, walletService, walletClient, sent, waits } =
		createExecutorMocks();
	const executionService = new ExecutionService(
		deploymentService,
		walletService,
		providerService,
	);
	const batchItem: EVCBatchItem = {
		targetContract: TARGET,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0x1234",
	};

	const result = await executionService.executeTransactionPlan({
		plan: [{ type: "evcBatch", items: [batchItem] }],
		chainId: 1,
		account: ACCOUNT,
		sendTransaction: walletClient.sendTransaction,
	});

	assert.equal(sent.length, 1);
	assert.equal(waits.length, 1);
	assert.deepEqual(result.hashes, waits);
	assert.equal((sent[0] as { to: Hex }).to, EVC);
});

test("executeTransactionPlan rejects CoW swap plans", async () => {
	const { executionService, deploymentService, providerService, walletClient } =
		createExecutorMocks();
	const cowPlanItem: CowSwapPlanItem = {
		type: "cowSwap",
		kind: "openPosition",
		chainId: 1,
		params: {},
	};

	await assert.rejects(
		executeTransactionPlan({
			plan: [cowPlanItem],
			executionService,
			deploymentService,
			providerService,
			chainId: 1,
			account: ACCOUNT,
			sendTransaction: walletClient.sendTransaction,
		}),
		/does not support CoW swap plans/,
	);
});

test("ExecutionService.executeCowSwapTransactionPlan submits a CoW order", async () => {
	const { deploymentService, walletService, walletClient } = createExecutorMocks();
	const deadline = 1_800_000_000;
	const cowPlanItem: CowSwapPlanItem<CowSwapOpenPositionPlanParams> = {
		type: "cowSwap",
		kind: "openPosition",
		chainId: 1,
		params: {
			chainId: 1,
			sellToken: TOKEN,
			buyToken: TARGET,
			sellAmount: 10n,
			buyAmount: 20n,
			feeAmount: 0n,
			quoteId: 123,
			slippageBips: 50,
			validTo: deadline,
			collateralToken: TOKEN,
			wrapper: {
				owner: ACCOUNT,
				account: ACCOUNT,
				deadline,
				collateralVault: SPENDER,
				borrowVault: TARGET,
				collateralAmount: 5n,
				borrowAmount: 10n,
			},
		},
	};
	let submittedBody: Record<string, unknown> | undefined;
	const progress: string[] = [];
	const publicClient = {
		waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => receipt(hash),
		readContract: async (parameters: { functionName?: string }) => {
			if (parameters.functionName === "allowance") return 100n;
			if (parameters.functionName === "getNonce") return 1n;
			if (parameters.functionName === "encodePermitData") return "0x1234";
			throw new Error(`Unexpected readContract ${parameters.functionName}`);
		},
	} as never;
	const providerService = {
		getProvider: () => publicClient,
	} as never;
	const executionService = new ExecutionService(
		deploymentService,
		walletService,
		providerService,
	);
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (_url, init) => {
		submittedBody = JSON.parse(String(init?.body));
		return new Response(JSON.stringify({ uid: "0xorderuid" }), {
			status: 201,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;

	try {
		const result = await executionService.executeCowSwapTransactionPlan({
			plan: [cowPlanItem],
			chainId: 1,
			account: ACCOUNT,
			sendTransaction: walletClient.sendTransaction,
			signTypedData: async () => `0x${"11".repeat(64)}1b` as Hex,
			onProgress: ({ status }) => {
				if (status) progress.push(status);
			},
		});

		assert.deepEqual(result.orderUids, ["0xorderuid"]);
		assert.equal(submittedBody?.quoteId, 123);
		assert.equal(submittedBody?.sellAmount, "10");
		assert.equal(submittedBody?.buyAmount, "20");
		assert.deepEqual(progress, [
			"approval",
			"signPermit",
			"signOrder",
			"submitOrder",
			"completed",
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("fetchCowSwapOrderStatus combines CoW competition and lifecycle status", async () => {
	const originalFetch = globalThis.fetch;
	const urls: string[] = [];
	globalThis.fetch = (async (input) => {
		const url = String(input);
		urls.push(url);
		if (url.endsWith("/status")) {
			return new Response(JSON.stringify({ type: "active" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		return new Response(JSON.stringify({ status: "fulfilled" }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;

	try {
		const status = await fetchCowSwapOrderStatus({
			orderUid: "0xorderuid",
			orderbookUrl: "https://cow.example",
		});

		assert.equal(status.type, "fulfilled");
		assert.equal(status.competitionType, "active");
		assert.equal(status.orderType, "fulfilled");
		assert.equal(status.terminal, true);
		assert.deepEqual(urls.sort(), [
			"https://cow.example/api/v1/orders/0xorderuid",
			"https://cow.example/api/v1/orders/0xorderuid/status",
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("getCowSwapOrderExplorerUrl builds CoW Explorer order links", () => {
	assert.equal(
		getCowSwapOrderExplorerUrl("0xorderuid"),
		"https://explorer.cow.fi/orders/0xorderuid",
	);
});

test("pollCowSwapOrderStatus resolves when the order becomes terminal", async () => {
	const originalFetch = globalThis.fetch;
	let lifecycleCalls = 0;
	const seen: string[] = [];
	globalThis.fetch = (async (input) => {
		const url = String(input);
		if (url.endsWith("/status")) {
			return new Response(JSON.stringify({ type: "open" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		lifecycleCalls += 1;
		return new Response(
			JSON.stringify({ status: lifecycleCalls === 1 ? "open" : "cancelled" }),
			{
				status: 200,
				headers: { "content-type": "application/json" },
			},
		);
	}) as typeof fetch;

	try {
		const status = await pollCowSwapOrderStatus({
			orderUid: "0xorderuid",
			orderbookUrl: "https://cow.example",
			intervalMs: 1,
			timeoutMs: 100,
			onStatus: (nextStatus) => seen.push(nextStatus.type),
		});

		assert.equal(status.type, "cancelled");
		assert.deepEqual(seen, ["open", "cancelled"]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("cancelCowSwapOrder signs cancellation typed data and submits DELETE", async () => {
	const originalFetch = globalThis.fetch;
	let submittedBody: Record<string, unknown> | undefined;
	globalThis.fetch = (async (_input, init) => {
		assert.equal(init?.method, "DELETE");
		submittedBody = JSON.parse(String(init?.body));
		return new Response(null, { status: 200 });
	}) as typeof fetch;

	try {
		let typedData:
			| {
					domain: Record<string, unknown>;
					primaryType: string;
					message: Record<string, unknown>;
			  }
			| undefined;
		await cancelCowSwapOrder({
			orderUid: "0xorderuid",
			chainId: 1,
			orderbookUrl: "https://cow.example",
			signTypedData: async (request) => {
				typedData = request;
				return "0xcancel" as Hex;
			},
		});

		assert.equal(typedData?.primaryType, "OrderCancellations");
		assert.equal(
			typedData?.domain.verifyingContract,
			"0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
		);
		assert.deepEqual(typedData?.message.orderUids, ["0xorderuid"]);
		assert.deepEqual(submittedBody, {
			orderUids: ["0xorderuid"],
			signature: "0xcancel",
			signingScheme: "eip712",
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("ExecutionService.executeCowSwapTransactionPlan invalidates close-position CoW permit nonce", async () => {
	const { deploymentService, walletService, walletClient, sent } =
		createExecutorMocks();
	const publicClient = {
		waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => receipt(hash),
		readContract: async (parameters: { functionName?: string }) => {
			if (parameters.functionName === "getNonce") return 17n;
			throw new Error(`Unexpected readContract ${parameters.functionName}`);
		},
	} as never;
	const providerService = {
		getProvider: () => publicClient,
	} as never;
	const executionService = new ExecutionService(
		deploymentService,
		walletService,
		providerService,
	);

	const plan = executionService.planCancelClosePositionWithCow({
		chainId: 1,
		owner: ACCOUNT,
		nonce: 17n,
	});
	const progress: string[] = [];
	const result = await executionService.executeCowSwapTransactionPlan({
		plan,
		chainId: 1,
		account: ACCOUNT,
		sendTransaction: walletClient.sendTransaction,
		signTypedData: async () => "0xunused" as Hex,
		onProgress: ({ status }) => {
			if (status) progress.push(status);
		},
	});

	assert.deepEqual(progress, ["cancelPermit", "cancelPermit", "completed"]);
	assert.equal(result.hashes.length, 1);
	assert.equal(result.orderUids.length, 0);
	assert.equal(result.results[0]?.permitCancellation?.nonce, 17n);
	const tx = sent[0] as { to: Hex; data: Hex };
	assert.equal(tx.to, EVC);
	const decoded = decodeFunctionData({
		abi: [
			{
				type: "function",
				name: "setNonce",
				inputs: [
					{ name: "addressPrefix", type: "bytes19" },
					{ name: "nonceNamespace", type: "uint256" },
					{ name: "nonce", type: "uint256" },
				],
				outputs: [],
				stateMutability: "payable",
			},
		],
		data: tx.data,
	});
	assert.equal(decoded.functionName, "setNonce");
	assert.equal(decoded.args[2], 18n);
});

test("ExecutionService.executeTransactionPlan rejects CoW plan items", async () => {
	const { deploymentService, providerService, walletService, walletClient } =
		createExecutorMocks();
	const executionService = new ExecutionService(
		deploymentService,
		walletService,
		providerService,
	);

	await assert.rejects(
		executionService.executeTransactionPlan({
			plan: [
				{
					type: "cowSwap",
					kind: "openPosition",
					chainId: 1,
					params: {},
				},
				{
					type: "requiredApproval",
					token: TOKEN,
					owner: ACCOUNT,
					spender: SPENDER,
					amount: 10n,
				},
			],
			chainId: 1,
			account: ACCOUNT,
			sendTransaction: walletClient.sendTransaction,
		}),
		/does not support CoW swap plans/,
	);
});
