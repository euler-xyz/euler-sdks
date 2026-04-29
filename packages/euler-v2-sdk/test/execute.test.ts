import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeFunctionData, erc20Abi, getAddress, type Hex } from "viem";
import {
	ExecutionService,
	executeTransactionPlan,
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
		publicClient,
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
		{ type: "evcBatch", items: [batchItem] },
	];

	const result = await executeTransactionPlan({
		plan,
		executionService,
		deploymentService,
		chainId: 1,
		account: ACCOUNT,
		walletClient,
		publicClient,
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
		publicClient,
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
		chainId: 1,
		account: ACCOUNT,
		walletClient,
		publicClient,
	});

	assert.equal(sent.length, 1);
	assert.ok(!("gas" in (sent[0] as Record<string, unknown>)));
	assert.equal(encodedBatchInputs.length, 1);
	assert.deepEqual(encodedBatchInputs[0], [permitBatchItem, batchItem]);
});

test("ExecutionService.executeTransactionPlan executes through the service instance", async () => {
	const { deploymentService, publicClient, walletClient, sent, waits } =
		createExecutorMocks();
	const executionService = new ExecutionService(deploymentService);
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
		walletClient,
		publicClient,
	});

	assert.equal(sent.length, 1);
	assert.equal(waits.length, 1);
	assert.deepEqual(result.hashes, waits);
	assert.equal((sent[0] as { to: Hex }).to, EVC);
});
