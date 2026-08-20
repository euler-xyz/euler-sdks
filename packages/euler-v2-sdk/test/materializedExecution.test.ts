import assert from "node:assert/strict";
import { test } from "vitest";
import {
	decodeFunctionData,
	encodeFunctionData,
	erc20Abi,
	type Hash,
	type Hex,
} from "viem";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import type { TransactionPlanPrepared } from "../src/services/executionService/executionServiceTypes.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN = "0x00000000000000000000000000000000000000bb" as const;
const SPENDER = "0x00000000000000000000000000000000000000cc" as const;
const VAULT = "0x00000000000000000000000000000000000000dd" as const;
const EVC = "0x0000000000000000000000000000000000000011" as const;
const PERMIT2 = "0x0000000000000000000000000000000000000012" as const;
const SIGNATURE = `0x${"11".repeat(65)}` as Hex;
const TX_HASH = `0x${"22".repeat(32)}` as Hash;

function createService(providerService?: unknown) {
	return new ExecutionService(
		{
			getDeployment: () => ({
				addresses: { coreAddrs: { evc: EVC, permit2: PERMIT2 } },
			}),
		} as never,
		{} as never,
		providerService as never,
	);
}

function createPrepared(): TransactionPlanPrepared {
	return {
		__prepared: true,
		chainId: 1,
		account: ACCOUNT,
		usePermit2: true,
		unlimitedApproval: false,
		plan: [
			{
				type: "requiredApproval",
				token: TOKEN,
				owner: ACCOUNT,
				spender: SPENDER,
				amount: 123n,
				resolved: [
					{
						type: "permit2",
						token: TOKEN,
						owner: ACCOUNT,
						spender: SPENDER,
						amount: 123n,
					},
				],
			},
			{
				type: "evcBatch",
				items: [
					{
						targetContract: VAULT,
						onBehalfOfAccount: ACCOUNT,
						value: 0n,
						data: encodeFunctionData({
							abi: eVaultAbi,
							functionName: "touch",
							args: [],
						}),
					},
				],
			},
			{
				type: "contractCall",
				chainId: 1,
				to: TOKEN,
				abi: erc20Abi,
				functionName: "approve",
				args: [SPENDER, 7n],
				value: 0n,
			},
		],
	};
}

const inputs = {
	evcAddress: EVC,
	permit2: [
		{
			planItemIndex: 0,
			resolvedIndex: 0,
			nonce: 7,
			sigDeadline: 2_000_000_000n,
			expiration: 2_000_000_000,
		},
	],
} as const;

test("materializeExecution is deterministic and has no hidden live inputs", () => {
	const service = createService();
	const first = service.materializeExecution({ prepared: createPrepared(), inputs });
	const second = service.materializeExecution({ prepared: createPrepared(), inputs });

	assert.deepEqual(first, second);
	assert.equal(first.requests.length, 2);
	assert.equal(first.requests[0]?.to, EVC);
	assert.equal(first.requests[0]?.value, 0n);
	assert.equal(first.signatureSlots.length, 1);
	assert.equal(first.signatureSlots[0]?.nonce, 7);
	assert.equal(first.signatureSlots[0]?.validUntil, 2_000_000_000n);
	assert.equal(first.safeCalls[0]?.data, first.requests[0]?.data);
	assert.equal(Object.isFrozen(first), true);
	assert.equal(Object.isFrozen(first.requests), true);
	assert.equal(Object.isFrozen(first.signatureSlots[0]?.typedData), true);
});

test("finalizeMaterializedExecution changes only the declared signature slot", () => {
	const service = createService();
	const materialized = service.materializeExecution({
		prepared: createPrepared(),
		inputs,
	});
	const reviewedData = materialized.requests.map((request) => request.data);
	const slot = materialized.signatureSlots[0];
	assert.ok(slot);

	const finalized = service.finalizeMaterializedExecution(materialized, [
		{ slotId: slot.slotId, signature: SIGNATURE },
	]);

	assert.deepEqual(
		materialized.requests.map((request) => request.data),
		reviewedData,
		"finalization must not mutate the reviewed template",
	);
	assert.notEqual(finalized.requests[0]?.data, materialized.requests[0]?.data);
	assert.equal(finalized.requests[1]?.data, materialized.requests[1]?.data);
	const decoded = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: finalized.requests[0]?.data ?? "0x",
	});
	assert.equal(decoded.functionName, "batch");
	assert.equal(finalized.safeCalls[0]?.data, finalized.requests[0]?.data);
	assert.equal(Object.isFrozen(finalized), true);
});

test("executeMaterialized awaits the durable hook before every wallet prompt", async () => {
	const events: string[] = [];
	const provider = {
		readContract: async () => [0n, 0n, 7n] as const,
		waitForTransactionReceipt: async () => ({ status: "success" as const }),
	};
	const service = createService({ getProvider: () => provider });
	const materialized = service.materializeExecution({
		prepared: createPrepared(),
		inputs,
	});

	const result = await service.executeMaterialized(materialized, {
		revalidate: { permit2NonceMustEqualPinned: true },
		onBeforeSignature: async () => {
			await Promise.resolve();
			events.push("signature-persisted");
		},
		signTypedData: async () => {
			events.push("signature-wallet");
			return SIGNATURE;
		},
		onFinalized: async () => {
			await Promise.resolve();
			events.push("finalized-persisted");
		},
		onBeforeStep: async (_request, index) => {
			await Promise.resolve();
			events.push(`dispatch-${index}-persisted`);
		},
		sendTransaction: async (request) => {
			events.push(`wallet-${request.requestIndex}`);
			return TX_HASH;
		},
	});

	assert.deepEqual(events, [
		"signature-persisted",
		"signature-wallet",
		"finalized-persisted",
		"dispatch-0-persisted",
		"wallet-0",
		"dispatch-1-persisted",
		"wallet-1",
	]);
	assert.deepEqual(result.hashes, [TX_HASH, TX_HASH]);
	assert.equal(result.receipts.length, 2);
});

test("executeMaterialized preserves prerequisite then signature then batch sequencing", async () => {
	const events: string[] = [];
	const prepared = createPrepared();
	const approval = prepared.plan[0];
	assert.equal(approval?.type, "requiredApproval");
	if (approval?.type !== "requiredApproval") return;
	approval.resolved = [
		{
			type: "approve",
			token: TOKEN,
			owner: ACCOUNT,
			spender: PERMIT2,
			amount: 123n,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [PERMIT2, 123n],
			}),
		},
		approval.resolved?.[0]!,
	];
	const provider = {
		readContract: async () => [0n, 0n, 7n] as const,
		waitForTransactionReceipt: async () => ({ status: "success" as const }),
	};
	const service = createService({ getProvider: () => provider });
	const materialized = service.materializeExecution({
		prepared,
		inputs: {
			...inputs,
			permit2: [{ ...inputs.permit2[0], resolvedIndex: 1 }],
		},
	});

	await service.executeMaterialized(materialized, {
		onBeforeSignature: () => {
			events.push("signature-persisted");
		},
		signTypedData: async () => {
			events.push("signature-wallet");
			return SIGNATURE;
		},
		onFinalized: () => {
			events.push("finalized");
		},
		onBeforeStep: (_request, index) => {
			events.push(`before-${index}`);
		},
		sendTransaction: async (request) => {
			events.push(`wallet-${request.requestIndex}`);
			return TX_HASH;
		},
		onAfterStep: (_request, index) => {
			events.push(`after-${index}`);
		},
	});

	assert.deepEqual(events, [
		"before-0",
		"wallet-0",
		"after-0",
		"signature-persisted",
		"signature-wallet",
		"finalized",
		"before-1",
		"wallet-1",
		"after-1",
		"before-2",
		"wallet-2",
		"after-2",
	]);
});

test("executeMaterialized rejects nonce drift before the signature wallet opens", async () => {
	let signaturePrompts = 0;
	let transactionPrompts = 0;
	const service = createService({
		getProvider: () => ({
			readContract: async () => [0n, 0n, 8n] as const,
			waitForTransactionReceipt: async () => ({ status: "success" as const }),
		}),
	});
	const materialized = service.materializeExecution({
		prepared: createPrepared(),
		inputs,
	});

	await assert.rejects(
		service.executeMaterialized(materialized, {
			revalidate: { permit2NonceMustEqualPinned: true },
			signTypedData: async () => {
				signaturePrompts += 1;
				return SIGNATURE;
			},
			sendTransaction: async () => {
				transactionPrompts += 1;
				return TX_HASH;
			},
		}),
		/Permit2 nonce changed after materialization/,
	);
	assert.equal(signaturePrompts, 0);
	assert.equal(transactionPrompts, 0);
});

test("executeMaterialized dispatches an already-finalized vector byte-identically", async () => {
	const events: string[] = [];
	const provider = {
		waitForTransactionReceipt: async () => ({ status: "success" as const }),
	};
	const service = createService({ getProvider: () => provider });
	const materialized = service.materializeExecution({
		prepared: createPrepared(),
		inputs,
	});
	const slot = materialized.signatureSlots[0];
	assert.ok(slot);
	const finalized = service.finalizeMaterializedExecution(materialized, [
		{ slotId: slot.slotId, signature: SIGNATURE },
	]);
	const before = finalized.requests.map((request) => ({ ...request }));

	const result = await service.executeMaterialized(finalized, {
		onBeforeSignature: () => {
			throw new Error("already-finalized execution must not prompt for a signature");
		},
		onBeforeStep: async (_request, index) => {
			events.push(`before-${index}`);
		},
		sendTransaction: async (request) => {
			assert.deepEqual(request, before[request.requestIndex]);
			events.push(`wallet-${request.requestIndex}`);
			return TX_HASH;
		},
		onAfterStep: async (_request, index) => {
			events.push(`after-${index}`);
		},
	});

	assert.deepEqual(finalized.requests, before);
	assert.equal(result.execution, finalized);
	assert.deepEqual(events, [
		"before-0",
		"wallet-0",
		"after-0",
		"before-1",
		"wallet-1",
		"after-1",
	]);
});

test("materializeExecution rejects missing, extra, and unconsumed Permit2 slots", () => {
	const service = createService();
	assert.throws(
		() =>
			service.materializeExecution({
				prepared: createPrepared(),
				inputs: { evcAddress: EVC, permit2: [] },
			}),
		/Permit2 materialization input 0:0 is missing/,
	);
	assert.throws(
		() =>
			service.materializeExecution({
				prepared: createPrepared(),
				inputs: {
					evcAddress: EVC,
					permit2: [
						...inputs.permit2,
						{
							...inputs.permit2[0],
							planItemIndex: 9,
						},
					],
				},
			}),
		/Unused Permit2 materialization inputs: 9:0/,
	);
});
