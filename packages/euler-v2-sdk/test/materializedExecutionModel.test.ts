import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeFunctionData, erc20Abi, type Hash, type Hex } from "viem";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import type { TransactionPlanPrepared } from "../src/services/executionService/executionServiceTypes.js";
import type {
	FinalizedMaterializedExecution,
	MaterializedExecution,
	MaterializedExecutionRequest,
} from "../src/services/executionService/materializedExecution.js";

// Executable trace checks for the safety abstraction in
// formal/tla/MaterializedExecution.tla. These run the actual SDK executor; they
// do not claim a machine-checked refinement between TypeScript and TLA+.
const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN = "0x00000000000000000000000000000000000000bb" as const;
const SECOND_TOKEN = "0x00000000000000000000000000000000000000bc" as const;
const SPENDER = "0x00000000000000000000000000000000000000cc" as const;
const EVC = "0x0000000000000000000000000000000000000011" as const;
const PERMIT2 = "0x0000000000000000000000000000000000000012" as const;
const SIGNATURE = `0x${"11".repeat(65)}` as Hex;
const hashFor = (index: number) =>
	`0x${(index + 1).toString(16).padStart(64, "0")}` as Hash;

type Shape = {
	prefix: number;
	signatures: number;
	suffix: number;
	finalized: boolean;
	revalidate: boolean;
};
type Event = { phase: string; index?: number };

function preparedFor(shape: Shape): TransactionPlanPrepared {
	const resolved = [
		...Array.from({ length: shape.prefix }, () => ({
			type: "approve" as const,
			token: TOKEN,
			owner: ACCOUNT,
			spender: PERMIT2,
			amount: 123n,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [PERMIT2, 123n],
			}),
		})),
		...Array.from({ length: shape.signatures }, (_, index) => ({
			type: "permit2" as const,
			token: index === 0 ? TOKEN : SECOND_TOKEN,
			owner: ACCOUNT,
			spender: SPENDER,
			amount: 123n,
		})),
	];
	return {
		__prepared: true,
		chainId: 1,
		account: ACCOUNT,
		usePermit2: true,
		unlimitedApproval: false,
		plan: [
			...(resolved.length
				? [
						{
							type: "requiredApproval" as const,
							token: TOKEN,
							owner: ACCOUNT,
							spender: SPENDER,
							amount: 123n,
							resolved,
						},
					]
				: []),
			...(shape.signatures ? [{ type: "evcBatch" as const, items: [] }] : []),
			...Array.from({ length: shape.suffix }, () => ({
				type: "contractCall" as const,
				chainId: 1,
				to: TOKEN,
				abi: erc20Abi,
				functionName: "approve",
				args: [SPENDER, 7n],
				value: 0n,
			})),
		],
	};
}

function fixture(
	shape: Shape,
	options: {
		failAt?: number;
		revertAt?: number;
		nonceRead?: (readIndex: number) => number;
		boundary?: (event: Event) => Promise<void>;
	} = {},
) {
	const events: Event[] = [];
	const dispatched: MaterializedExecutionRequest[] = [];
	const receipts = new Set<number>();
	const afterSteps = new Set<number>();
	let signed = 0;
	let finalizedHook = false;
	let nonceReads = 0;
	let finalVector: FinalizedMaterializedExecution | undefined;
	const enter = (event: Event) => {
		events.push(event);
		if (events.length - 1 === options.failAt) {
			throw new Error(`injected ${event.phase}`);
		}
	};
	const boundary = async (event: Event) => {
		enter(event);
		await options.boundary?.(event);
	};
	const provider = {
		readContract: async () => {
			const index = nonceReads++;
			await boundary({ phase: "nonce", index });
			return [0n, 0n, BigInt(options.nonceRead?.(index) ?? 7)] as const;
		},
		waitForTransactionReceipt: async ({ hash }: { hash: Hash }) => {
			const index = Number(BigInt(hash)) - 1;
			await boundary({ phase: "receipt", index });
			if (index === options.revertAt) return { status: "reverted" as const };
			receipts.add(index);
			return { status: "success" as const };
		},
	};
	const service = new ExecutionService(
		{
			getDeployment: () => ({
				addresses: { coreAddrs: { evc: EVC, permit2: PERMIT2 } },
			}),
		} as never,
		{} as never,
		{ getProvider: () => provider } as never,
	);
	const template = service.materializeExecution({
		prepared: preparedFor(shape),
		inputs: {
			evcAddress: EVC,
			permit2: Array.from({ length: shape.signatures }, (_, index) => ({
				planItemIndex: 0,
				resolvedIndex: shape.prefix + index,
				nonce: 7,
				sigDeadline: 2_000_000_000n,
				expiration: 2_000_000_000,
			})),
		},
	});
	const materialized: MaterializedExecution | FinalizedMaterializedExecution =
		shape.finalized
			? service.finalizeMaterializedExecution(
					template,
					template.signatureSlots.map((slot) => ({
						slotId: slot.slotId,
						signature: SIGNATURE,
					})),
				)
			: template;
	const run = () =>
		service.executeMaterialized(materialized, {
			revalidate: { permit2NonceMustEqualPinned: shape.revalidate },
			onBeforeSignature: async (_slot, index) =>
				boundary({ phase: "beforeSignature", index }),
			signTypedData: async () => {
				await boundary({ phase: "sign", index: signed });
				signed++;
				return SIGNATURE;
			},
			onFinalized: async (execution) => {
				await boundary({ phase: "finalized" });
				finalVector = execution;
				finalizedHook = true;
			},
			onBeforeStep: async (_request, index) =>
				boundary({ phase: "beforeStep", index }),
			sendTransaction: async (request) => {
				// TLA+ RequestOrder, PrerequisiteSuccess, HookGate and signature gate
				// checked at each real dispatch, including every injected failure run.
				assert.equal(request.requestIndex, dispatched.length);
				for (let index = 0; index < request.requestIndex; index++) {
					assert.ok(
						receipts.has(index),
						"dispatch needs prior successful receipt",
					);
					assert.ok(
						afterSteps.has(index),
						"dispatch needs prior after-step hook",
					);
				}
				if (
					!shape.signatures ||
					request.requestIndex >= shape.prefix ||
					shape.finalized
				) {
					assert.ok(
						finalizedHook,
						"signed calls need successful finalization hook",
					);
					assert.equal(
						shape.finalized ? shape.signatures : signed,
						shape.signatures,
					);
				}
				dispatched.push(request);
				await boundary({ phase: "send", index: request.requestIndex });
				return hashFor(request.requestIndex);
			},
			onTransactionHash: async (_request, index) =>
				boundary({ phase: "hash", index }),
			onAfterStep: async (_request, index) => {
				await boundary({ phase: "afterStep", index });
				afterSteps.add(index);
			},
			onProgress: (progress) => {
				if (progress.status === "completed") {
					// CompletedOnlyAfterSuccess includes the zero-request case.
					assert.equal(receipts.size, materialized.requests.length);
					assert.equal(afterSteps.size, materialized.requests.length);
					assert.ok(finalizedHook);
				}
				enter({
					phase:
						progress.status === "transaction"
							? progress.hash
								? "afterProgress"
								: "beforeProgress"
							: progress.status,
					...(progress.request ? { index: progress.request.requestIndex } : {}),
				});
			},
		});
	return {
		run,
		events,
		dispatched,
		receipts,
		afterSteps,
		materialized,
		get finalVector() {
			return finalVector;
		},
	};
}

const shapes: Shape[] = [
	{ prefix: 0, signatures: 0, suffix: 0 },
	{ prefix: 0, signatures: 0, suffix: 3 },
	{ prefix: 0, signatures: 1, suffix: 1 },
	{ prefix: 0, signatures: 2, suffix: 1 },
	{ prefix: 1, signatures: 1, suffix: 1 },
	{ prefix: 2, signatures: 2, suffix: 1 },
].flatMap((shape) =>
	[false, true].flatMap((finalized) =>
		[false, true].map((revalidate) => ({ ...shape, finalized, revalidate })),
	),
);

for (const shape of shapes) {
	const name = `${shape.prefix} prerequisites/${shape.signatures} signatures/${shape.suffix} calls; finalized=${shape.finalized}, revalidate=${shape.revalidate}`;
	test(`executor safety trace and every failure boundary: ${name}`, async () => {
		const success = fixture(shape);
		const result = await success.run();
		assert.deepEqual(success.dispatched, result.execution.requests);
		assert.deepEqual(
			result.hashes,
			result.execution.requests.map((request) => hashFor(request.requestIndex)),
		);
		assert.equal(result.receipts.length, result.execution.requests.length);
		assert.equal(success.events.at(-1)?.phase, "completed");
		assert.ok(success.finalVector);

		// Every reached external operation and hook is independently made to
		// fail. No subsequent signature, transaction or completion may occur.
		for (let failAt = 0; failAt < success.events.length; failAt++) {
			const failed = fixture(shape, { failAt });
			await assert.rejects(failed.run(), /injected/);
			assert.deepEqual(
				failed.events,
				success.events.slice(0, failAt + 1),
				`execution continued or reordered around failure ${failAt}`,
			);
		}
		for (let revertAt = 0; revertAt < success.dispatched.length; revertAt++) {
			const reverted = fixture(shape, { revertAt });
			await assert.rejects(reverted.run(), /reverted/);
			assert.equal(reverted.dispatched.length, revertAt + 1);
			assert.equal(reverted.receipts.size, revertAt);
			assert.equal(reverted.events.at(-1)?.phase, "receipt");
		}
	});
}

test("unresolved receipt and boundary hooks prevent every later wallet prompt", async () => {
	const shape = {
		prefix: 1,
		signatures: 1,
		suffix: 1,
		finalized: false,
		revalidate: true,
	};
	for (const phase of [
		"beforeStep",
		"hash",
		"receipt",
		"afterStep",
		"beforeSignature",
		"finalized",
	]) {
		let release!: () => void;
		let started!: () => void;
		const atGate = new Promise<void>((resolve) => {
			started = resolve;
		});
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let blocked = false;
		const run = fixture(shape, {
			boundary: async (event) => {
				if (event.phase === phase && !blocked) {
					blocked = true;
					started();
					await gate;
				}
			},
		});
		const pending = run.run();
		await atGate;
		const stopped = [...run.events];
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.deepEqual(run.events, stopped, `${phase} was not awaited`);
		release();
		await pending;
		assert.equal(run.events.at(-1)?.phase, "completed");
	}
});

test("each enabled nonce check blocks on drift, including before static prerequisites", async () => {
	const shape = {
		prefix: 1,
		signatures: 2,
		suffix: 1,
		finalized: false,
		revalidate: true,
	};
	const baseline = fixture(shape);
	await baseline.run();
	const reads = baseline.events.filter((event) => event.phase === "nonce");
	assert.equal(reads.length, 6); // two initial, two before signing, two before dispatch
	assert.deepEqual(reads.map((read) => read.index), [0, 1, 2, 3, 4, 5]);
	for (const read of reads) {
		const drift = fixture(shape, {
			nonceRead: (index) => (index === read.index ? 8 : 7),
		});
		await assert.rejects(drift.run(), /nonce changed/);
		const position = baseline.events.findIndex(
			(event) => event.phase === "nonce" && event.index === read.index,
		);
		assert.deepEqual(drift.events, baseline.events.slice(0, position + 1));
	}
});

test("nonce validation is a snapshot: drift in the following hook can still reach broadcast", async () => {
	let nonce = 7;
	const run = fixture(
		{ prefix: 0, signatures: 1, suffix: 1, finalized: false, revalidate: true },
		{
			nonceRead: () => nonce,
			boundary: async (event) => {
				if (event.phase === "beforeStep" && event.index === 0) nonce = 8;
			},
			// Model the contract rejecting a now-stale signed request.
			revertAt: 0,
		},
	);
	await assert.rejects(run.run(), /reverted/);
	assert.equal(nonce, 8);
	assert.equal(run.dispatched.length, 1);
	assert.equal(run.receipts.size, 0);
});

test("broadcast side effects may survive a rejected send promise; execution never advances", async () => {
	let chainMayHaveAccepted = false;
	const run = fixture(
		{
			prefix: 1,
			signatures: 1,
			suffix: 1,
			finalized: false,
			revalidate: false,
		},
		{
			boundary: async (event) => {
				if (event.phase === "send") {
					chainMayHaveAccepted = true;
					throw new Error("transport disconnected after forwarding");
				}
			},
		},
	);
	await assert.rejects(run.run(), /transport disconnected/);
	assert.ok(chainMayHaveAccepted);
	assert.equal(run.dispatched.length, 1);
	assert.equal(run.receipts.size, 0);
	assert.equal(run.events.at(-1)?.phase, "send");
});
