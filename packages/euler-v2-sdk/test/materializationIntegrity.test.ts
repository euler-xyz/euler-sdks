import assert from "node:assert/strict";
import { test } from "vitest";
import {
	type Address,
	type Hex,
	decodeFunctionData,
	encodeFunctionData,
	erc20Abi,
	getAddress,
	hashTypedData,
} from "viem";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import type {
	EVCBatchItem,
	TransactionPlanPrepared,
} from "../src/services/executionService/executionServiceTypes.js";
import type { Permit2MaterializationInput } from "../src/services/executionService/materializedExecution.js";

const address = (n: number): Address =>
	getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const OWNER = address(1);
const EVC = address(2);
const PERMIT2 = address(3);

const service = new ExecutionService(
	{
		getDeployment: () => ({
			addresses: { coreAddrs: { evc: EVC, permit2: PERMIT2 } },
		}),
	} as never,
	{} as never,
);

function fixture(batchCount: number, permitsPerBatch: number) {
	const prepared: TransactionPlanPrepared = {
		__prepared: true,
		chainId: 1,
		account: OWNER,
		usePermit2: true,
		unlimitedApproval: false,
		plan: [],
	};
	const permit2: Permit2MaterializationInput[] = [];
	for (let batch = 0; batch < batchCount; batch++) {
		for (let permit = 0; permit < permitsPerBatch; permit++) {
			const token = address(10 + batch * 4 + permit);
			const spender = address(100 + batch);
			permit2.push({
				planItemIndex: prepared.plan.length,
				resolvedIndex: 0,
				nonce: batch * 4 + permit,
				sigDeadline: 2_000_000_000n,
				expiration: 2_000_000_000,
			});
			prepared.plan.push({
				type: "requiredApproval",
				token,
				owner: OWNER,
				spender,
				amount: 2n ** 80n + BigInt(permit),
				resolved: [
					{
						type: "permit2",
						token,
						owner: OWNER,
						spender,
						amount: 2n ** 80n + BigInt(permit),
					},
				],
			});
		}
		prepared.plan.push({
			type: "evcBatch",
			items: [
				{
					type: "operation",
					name: `operation-${batch}`,
					items: Array.from({ length: batch + 1 }, (_, i) => ({
						targetContract: address(200 + i),
						onBehalfOfAccount: OWNER,
						value: BigInt(i + batch),
						data: encodeFunctionData({
							abi: erc20Abi,
							functionName: "transfer",
							args: [address(300 + i), BigInt(i + 1)],
						}),
					})),
				},
			],
		});
		prepared.plan.push({
			type: "contractCall",
			chainId: 1,
			to: address(400 + batch),
			abi: erc20Abi,
			functionName: "approve",
			args: [address(500), 7n],
			value: 0n,
		});
	}
	return { prepared, inputs: { evcAddress: EVC, permit2 } };
}

function batchItems(data: Hex): readonly EVCBatchItem[] {
	const decoded = decodeFunctionData({ abi: ethereumVaultConnectorAbi, data });
	assert.equal(decoded.functionName, "batch");
	return decoded.args![0] as readonly EVCBatchItem[];
}

test("generated materialization cases preserve every request and non-signature call", () => {
	let cases = 0;
	for (let batches = 1; batches <= 3; batches++) {
		for (let permits = 0; permits <= 3; permits++) {
			// Variable signature lengths exercise ABI offsets as well as payload replacement.
			for (const signatureLength of [64, 65, 96]) {
				const input = fixture(batches, permits);
				const originalInput = structuredClone(input);
				const materialized = service.materializeExecution(input);
				assert.equal(materialized.requests.length, batches * 2);
				assert.equal(materialized.signatureSlots.length, batches * permits);
				assert.equal(materialized.chainId, input.prepared.chainId);
				assert.equal(materialized.from, OWNER);
				assert.equal(materialized.evcAddress, EVC);
				const executable = originalInput.prepared.plan
					.map((item, sourcePlanItemIndex) => ({ item, sourcePlanItemIndex }))
					.filter(
						({ item }) =>
							item.type === "evcBatch" || item.type === "contractCall",
					);
				for (const [
					index,
					{ item, sourcePlanItemIndex },
				] of executable.entries()) {
					const request = materialized.requests[index]!;
					assert.equal(request.requestIndex, index);
					assert.equal(request.sourcePlanItemIndex, sourcePlanItemIndex);
					assert.equal(request.kind, item.type);
					assert.equal(request.chainId, input.prepared.chainId);
					assert.equal(request.from, OWNER);
					if (item.type === "evcBatch") {
						const expected = item.items.flatMap((entry) =>
							"type" in entry ? entry.items : [entry],
						);
						const encodedItems = batchItems(request.data);
						assert.equal(encodedItems.length, permits + expected.length);
						assert.deepEqual(encodedItems.slice(permits), expected);
						assert.equal(request.to, EVC);
						assert.equal(
							request.value,
							expected.reduce((total, call) => total + call.value, 0n),
						);
					} else if (item.type === "contractCall") {
						assert.equal(request.to, item.to);
						assert.equal(request.value, item.value);
						assert.equal(
							request.data,
							encodeFunctionData({
								abi: item.abi,
								functionName: item.functionName,
								args: item.args,
							}),
						);
					}
				}
				for (const [index, slot] of materialized.signatureSlots.entries()) {
					const expectedInput = originalInput.inputs.permit2[index]!;
					const approval =
						originalInput.prepared.plan[expectedInput.planItemIndex]!;
					assert.equal(approval.type, "requiredApproval");
					if (approval.type !== "requiredApproval")
						throw new Error("expected approval fixture");
					assert.equal(slot.planItemIndex, expectedInput.planItemIndex);
					assert.equal(slot.resolvedIndex, expectedInput.resolvedIndex);
					assert.equal(slot.signer, approval.owner);
					assert.deepEqual(slot.insertion, {
						requestIndex: Math.floor(index / permits) * 2,
						batchItemIndex: index % permits,
					});
					assert.deepEqual(
						slot.typedData,
						service.getPermit2TypedData({
							chainId: input.prepared.chainId,
							token: approval.token,
							spender: approval.spender,
							amount: approval.amount,
							nonce: expectedInput.nonce,
							sigDeadline: expectedInput.sigDeadline,
							expiration: expectedInput.expiration,
						}),
					);
				}
				const reviewed = structuredClone(materialized);
				const signatures = materialized.signatureSlots.map((slot, i) => ({
					slotId: slot.slotId,
					signature:
						`0x${(i + 1).toString(16).padStart(2, "0").repeat(signatureLength)}` as Hex,
				}));
				const finalized = service.finalizeMaterializedExecution(
					materialized,
					signatures,
				);
				assert.deepEqual(input, originalInput);
				assert.deepEqual(materialized, reviewed);
				assert.equal(finalized.chainId, reviewed.chainId);
				assert.equal(finalized.from, reviewed.from);
				assert.equal(finalized.evcAddress, reviewed.evcAddress);
				assert.equal(finalized.requests.length, reviewed.requests.length);
				assert.deepEqual(
					service.finalizeMaterializedExecution(
						materialized,
						[...signatures].reverse(),
					).requests,
					finalized.requests,
					"signature values are matched by slot identity, not array order",
				);
				for (const [index, request] of finalized.requests.entries()) {
					const before = reviewed.requests[index]!;
					const slots = materialized.signatureSlots.filter(
						(slot) => slot.insertion.requestIndex === index,
					);
					assert.deepEqual({ ...request, data: before.data }, before);
					assert.deepEqual(finalized.safeCalls[index], {
						to: request.to,
						data: request.data,
						value: request.value,
					});
					if (slots.length === 0) {
						assert.equal(request.data, before.data);
						continue;
					}
					const oldItems = batchItems(before.data);
					const newItems = batchItems(request.data);
					assert.equal(newItems.length, oldItems.length);
					for (const [itemIndex, item] of newItems.entries()) {
						const slot = slots.find(
							(candidate) => candidate.insertion.batchItemIndex === itemIndex,
						);
						if (!slot) {
							assert.deepEqual(item, oldItems[itemIndex]);
							continue;
						}
						assert.equal(hashTypedData(slot.typedData), slot.typedDataHash);
						assert.deepEqual(
							item,
							service.encodePermit2Call({
								chainId: slot.chainId,
								owner: slot.signer,
								message: slot.typedData.message,
								signature: signatures.find(
									(value) => value.slotId === slot.slotId,
								)!.signature,
							}),
						);
					}
				}
				cases++;
			}
		}
	}
	assert.equal(cases, 36);
});


test("materialization rejects repeated Permit2 allowance keys before any nonce scheduling", () => {
	for (const [batches, permits] of [[1, 2], [2, 1]]) {
		const { prepared, inputs } = fixture(batches, permits);
		const approvals = prepared.plan.filter((item) => item.type === "requiredApproval");
		const first = approvals[0].resolved![0];
		const second = approvals[1].resolved![0];
		second.token = first.token;
		second.spender = first.spender;
		second.owner = first.owner.toLowerCase() as Address;
		assert.throws(() => service.materializeExecution({ prepared, inputs }), /Duplicate Permit2 allowance key/);
	}
});
