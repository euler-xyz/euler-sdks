import {
	type Abi,
	type Address,
	decodeFunctionData,
	encodeFunctionData,
	encodePacked,
	getAddress,
	hashTypedData,
	keccak256,
	type Hash,
	type Hex,
	type TransactionReceipt,
} from "viem";
import type { AddressOrAccount } from "../../entities/Account.js";
import {
	type DecodedSmartContractError,
	decodeSmartContractErrors,
} from "../../utils/decodeSmartContractErrors.js";
import type { ProviderService } from "../providerService/index.js";
import { ethereumVaultConnectorAbi } from "./abis/ethereumVaultConnectorAbi.js";
import type {
	EVCBatchItem,
	PermitSingleTypedData,
	TransactionPlanPrepared,
} from "./executionServiceTypes.js";
import {
	assertNoCowSwapPlanItems,
	flattenBatchEntries,
} from "./executionServiceTypes.js";

const PLACEHOLDER_SIGNATURE = `0x${"00".repeat(65)}` as Hex;

const PERMIT2_ALLOWANCE_ABI = [
	{
		name: "allowance",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "token", type: "address" },
			{ name: "spender", type: "address" },
		],
		outputs: [
			{ name: "amount", type: "uint160" },
			{ name: "expiration", type: "uint48" },
			{ name: "nonce", type: "uint48" },
		],
	},
] as const satisfies Abi;

export type Permit2MaterializationInput = {
	planItemIndex: number;
	resolvedIndex: number;
	nonce: number;
	sigDeadline: bigint;
	expiration: number;
};

export type MaterializeExecutionArgs = {
	prepared: TransactionPlanPrepared;
	inputs: {
		evcAddress: Address;
		permit2: readonly Permit2MaterializationInput[];
	};
};

export type MaterializedExecutionRequestKind =
	| "approval"
	| "evcBatch"
	| "contractCall";

/** Exact transaction template sealed before dynamic signatures are collected. */
export type MaterializedExecutionRequest = {
	requestIndex: number;
	sourcePlanItemIndex: number;
	kind: MaterializedExecutionRequestKind;
	chainId: number;
	from: Address;
	to: Address;
	data: Hex;
	value: bigint;
};

export type MaterializedSafeCall = Pick<
	MaterializedExecutionRequest,
	"to" | "data" | "value"
>;

export type MaterializedPermit2SignatureSlot = {
	slotId: Hash;
	kind: "permit2";
	signer: Address;
	chainId: number;
	planItemIndex: number;
	resolvedIndex: number;
	nonce: number;
	validUntil: bigint;
	typedDataHash: Hash;
	typedData: PermitSingleTypedData;
	insertion: {
		requestIndex: number;
		batchItemIndex: number;
	};
};

export type MaterializedExecution = {
	readonly __materialized: true;
	readonly chainId: number;
	readonly from: Address;
	readonly evcAddress: Address;
	readonly requests: readonly MaterializedExecutionRequest[];
	readonly signatureSlots: readonly MaterializedPermit2SignatureSlot[];
	readonly safeCalls: readonly MaterializedSafeCall[];
};

export type MaterializedSignatureValue = {
	slotId: Hash;
	signature: Hex;
};

/**
 * A finalized request vector supplied as trusted application input. The SDK
 * does not authenticate this artifact. The application must cover the complete
 * artifact with its accepted review digest before passing it to
 * `executeMaterialized`.
 */
export type FinalizedMaterializedExecution = {
	readonly __materialized: true;
	/** Structural discriminator only; this is not a security seal. */
	readonly __finalized: true;
	readonly chainId: number;
	readonly from: Address;
	readonly evcAddress: Address;
	readonly requests: readonly MaterializedExecutionRequest[];
	readonly signatureSlots: readonly MaterializedPermit2SignatureSlot[];
	readonly signatureValues: readonly MaterializedSignatureValue[];
	readonly safeCalls: readonly MaterializedSafeCall[];
};

export type MaterializedExecutionProgress = {
	completed: number;
	total: number;
	request?: MaterializedExecutionRequest;
	status: "signature" | "transaction" | "completed";
	hash?: Hash;
};

export type ExecuteMaterializedOptions = {
	sendTransaction: (request: MaterializedExecutionRequest) => Promise<Hash>;
	signTypedData?: (typedData: PermitSingleTypedData) => Promise<Hex>;
	revalidate?: {
		permit2NonceMustEqualPinned?: boolean;
	};
	/** Awaited immediately before every signature wallet prompt. */
	onBeforeSignature?: (
		slot: MaterializedPermit2SignatureSlot,
		index: number,
	) => Promise<void> | void;
	/** Awaited after all signatures are inserted and before the first signed batch. */
	onFinalized?: (
		execution: FinalizedMaterializedExecution,
	) => Promise<void> | void;
	/** Awaited immediately before every transaction wallet prompt. */
	onBeforeStep?: (
		request: MaterializedExecutionRequest,
		index: number,
	) => Promise<void> | void;
	/** Awaited after broadcast and before receipt polling. */
	onTransactionHash?: (
		request: MaterializedExecutionRequest,
		index: number,
		hash: Hash,
	) => Promise<void> | void;
	/** Awaited after a successful receipt and before the next wallet prompt. */
	onAfterStep?: (
		request: MaterializedExecutionRequest,
		index: number,
		hash: Hash,
		receipt: TransactionReceipt,
	) => Promise<void> | void;
	onProgress?: (progress: MaterializedExecutionProgress) => void;
};

export type MaterializedExecutionResult = {
	execution: FinalizedMaterializedExecution;
	hashes: Hash[];
	receipts: TransactionReceipt[];
};

export interface MaterializedExecutionEncoder {
	getPermit2TypedData(args: {
		chainId: number;
		token: Address;
		amount: bigint;
		spender: Address;
		nonce: number;
		sigDeadline: bigint;
		expiration: number;
	}): PermitSingleTypedData;
	encodePermit2Call(args: {
		chainId: number;
		owner: Address;
		message: PermitSingleTypedData["message"];
		signature: Hex;
	}): EVCBatchItem;
	encodeBatch(items: EVCBatchItem[]): Hex;
}

export class MaterializedExecutionError extends Error {
	readonly decodedErrors: DecodedSmartContractError[];
	readonly originalError: unknown;

	constructor(
		message: string,
		originalError: unknown,
		decodedErrors: DecodedSmartContractError[],
	) {
		super(message);
		this.name = "MaterializedExecutionError";
		this.originalError = originalError;
		this.decodedErrors = decodedErrors;
	}
}

export class MaterializedTransactionRevertedError extends Error {
	readonly hash: Hash;

	constructor(hash: Hash) {
		super(`Transaction ${hash} reverted`);
		this.name = "MaterializedTransactionRevertedError";
		this.hash = hash;
	}
}

function ownerOf(account: AddressOrAccount): Address {
	return getAddress(typeof account === "string" ? account : account.owner);
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}

function cloneTypedData(typedData: PermitSingleTypedData): PermitSingleTypedData {
	return {
		domain: { ...typedData.domain },
		types: {
			PermitDetails: [
				{ ...typedData.types.PermitDetails[0] },
				{ ...typedData.types.PermitDetails[1] },
				{ ...typedData.types.PermitDetails[2] },
				{ ...typedData.types.PermitDetails[3] },
			],
			PermitSingle: [
				{ ...typedData.types.PermitSingle[0] },
				{ ...typedData.types.PermitSingle[1] },
				{ ...typedData.types.PermitSingle[2] },
			],
		},
		primaryType: "PermitSingle",
		message: {
			details: { ...typedData.message.details },
			spender: typedData.message.spender,
			sigDeadline: typedData.message.sigDeadline,
		},
	};
}

function inputKey(planItemIndex: number, resolvedIndex: number): string {
	return `${planItemIndex}:${resolvedIndex}`;
}

function assertMaterializationInput(input: Permit2MaterializationInput): void {
	if (
		!Number.isSafeInteger(input.planItemIndex) ||
		input.planItemIndex < 0 ||
		!Number.isSafeInteger(input.resolvedIndex) ||
		input.resolvedIndex < 0
	) {
		throw new Error("Permit2 materialization coordinates are invalid");
	}
	if (!Number.isSafeInteger(input.nonce) || input.nonce < 0) {
		throw new Error("Permit2 materialization nonce is invalid");
	}
	if (input.sigDeadline <= 0n) {
		throw new Error("Permit2 materialization signature deadline is invalid");
	}
	if (!Number.isSafeInteger(input.expiration) || input.expiration <= 0) {
		throw new Error("Permit2 materialization expiration is invalid");
	}
}

function decodeBatchItems(data: Hex): EVCBatchItem[] {
	const decoded = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data,
	});
	if (decoded.functionName !== "batch") {
		throw new Error("Materialized EVC request does not encode batch()");
	}
	return decoded.args[0].map((item) => ({
		targetContract: getAddress(item.targetContract),
		onBehalfOfAccount: getAddress(item.onBehalfOfAccount),
		value: item.value,
		data: item.data,
	}));
}

function makeSafeCalls(
	requests: readonly MaterializedExecutionRequest[],
): MaterializedSafeCall[] {
	return requests.map(({ to, data, value }) => ({ to, data, value }));
}

/**
 * Purely compose a prepared plan into deterministic transaction templates.
 * All live values used by composition are explicit inputs. Permit2 signatures
 * are represented by typed signature slots and a fixed placeholder.
 */
export function materializeExecution(
	encoder: MaterializedExecutionEncoder,
	args: MaterializeExecutionArgs,
): MaterializedExecution {
	const { prepared, inputs } = args;
	assertNoCowSwapPlanItems(prepared.plan, "materializeExecution");
	const from = ownerOf(prepared.account);
	const evcAddress = getAddress(inputs.evcAddress);
	const permitInputs = new Map<string, Permit2MaterializationInput>();
	for (const input of inputs.permit2) {
		assertMaterializationInput(input);
		const key = inputKey(input.planItemIndex, input.resolvedIndex);
		if (permitInputs.has(key)) {
			throw new Error(`Duplicate Permit2 materialization input ${key}`);
		}
		permitInputs.set(key, input);
	}

	const requests: MaterializedExecutionRequest[] = [];
	const signatureSlots: MaterializedPermit2SignatureSlot[] = [];
	const pendingPermitItems: Array<{
		planItemIndex: number;
		resolvedIndex: number;
		item: EVCBatchItem;
		slot: Omit<
			MaterializedPermit2SignatureSlot,
			"insertion" | "slotId"
		>;
	}> = [];
	const consumedPermitInputs = new Set<string>();

	for (const [planItemIndex, item] of prepared.plan.entries()) {
		if (item.type === "cowSwap") {
			throw new Error(
				"ExecutionService.materializeExecution does not support CoW swap plans",
			);
		}
		if (item.type === "requiredApproval") {
			if (!item.resolved) {
				throw new Error(`Approval at plan item ${planItemIndex} is unresolved`);
			}
			for (const [resolvedIndex, resolved] of item.resolved.entries()) {
				if (resolved.type === "approve") {
					requests.push({
						requestIndex: requests.length,
						sourcePlanItemIndex: planItemIndex,
						kind: "approval",
						chainId: prepared.chainId,
						from,
						to: getAddress(resolved.token),
						data: resolved.data,
						value: 0n,
					});
					continue;
				}

				const key = inputKey(planItemIndex, resolvedIndex);
				const input = permitInputs.get(key);
				if (!input) {
					throw new Error(`Permit2 materialization input ${key} is missing`);
				}
				consumedPermitInputs.add(key);
				const typedData = cloneTypedData(
					encoder.getPermit2TypedData({
						chainId: prepared.chainId,
						token: getAddress(resolved.token),
						amount: resolved.amount,
						spender: getAddress(resolved.spender),
						nonce: input.nonce,
						sigDeadline: input.sigDeadline,
						expiration: input.expiration,
					}),
				);
				const typedDataHash = hashTypedData(typedData);
				pendingPermitItems.push({
					planItemIndex,
					resolvedIndex,
					item: encoder.encodePermit2Call({
						chainId: prepared.chainId,
						owner: getAddress(resolved.owner),
						message: typedData.message,
						signature: PLACEHOLDER_SIGNATURE,
					}),
					slot: {
						kind: "permit2",
						signer: getAddress(resolved.owner),
						chainId: prepared.chainId,
						planItemIndex,
						resolvedIndex,
						nonce: input.nonce,
						validUntil: input.sigDeadline,
						typedDataHash,
						typedData,
					},
				});
			}
			continue;
		}

		if (item.type === "evcBatch") {
			const batchItems = [
				...pendingPermitItems.map((pending) => pending.item),
				...flattenBatchEntries(item.items),
			];
			const requestIndex = requests.length;
			requests.push({
				requestIndex,
				sourcePlanItemIndex: planItemIndex,
				kind: "evcBatch",
				chainId: prepared.chainId,
				from,
				to: evcAddress,
				data: encoder.encodeBatch(batchItems),
				value: batchItems.reduce((sum, batchItem) => sum + batchItem.value, 0n),
			});
			for (const [batchItemIndex, pending] of pendingPermitItems.entries()) {
				const slotId = keccak256(
					encodePacked(
						["bytes32", "uint256", "uint256", "uint256", "uint256"],
						[
							pending.slot.typedDataHash,
							BigInt(pending.planItemIndex),
							BigInt(pending.resolvedIndex),
							BigInt(requestIndex),
							BigInt(batchItemIndex),
						],
					),
				);
				signatureSlots.push({
					...pending.slot,
					slotId,
					insertion: { requestIndex, batchItemIndex },
				});
			}
			pendingPermitItems.length = 0;
			continue;
		}

		if (pendingPermitItems.length > 0) {
			throw new Error("Permit2 signature has no following EVC batch insertion point");
		}
		if (item.chainId !== prepared.chainId) {
			throw new Error(
				`Plan item targets chain ${item.chainId}, but materialization targets chain ${prepared.chainId}`,
			);
		}
		requests.push({
			requestIndex: requests.length,
			sourcePlanItemIndex: planItemIndex,
			kind: "contractCall",
			chainId: prepared.chainId,
			from,
			to: getAddress(item.to),
			data: encodeFunctionData({
				abi: item.abi,
				functionName: item.functionName,
				args: item.args,
			}),
			value: item.value,
		});
	}

	if (pendingPermitItems.length > 0) {
		throw new Error("Permit2 signature has no following EVC batch insertion point");
	}
	if (consumedPermitInputs.size !== permitInputs.size) {
		const unused = [...permitInputs.keys()].filter(
			(key) => !consumedPermitInputs.has(key),
		);
		throw new Error(`Unused Permit2 materialization inputs: ${unused.join(", ")}`);
	}

	return deepFreeze({
		__materialized: true,
		chainId: prepared.chainId,
		from,
		evcAddress,
		requests,
		signatureSlots,
		safeCalls: makeSafeCalls(requests),
	});
}

/** Purely insert the exact provided signatures without changing any other byte. */
export function finalizeMaterializedExecution(
	encoder: MaterializedExecutionEncoder,
	materialized: MaterializedExecution,
	signatures: readonly MaterializedSignatureValue[],
): FinalizedMaterializedExecution {
	if (signatures.length !== materialized.signatureSlots.length) {
		throw new Error("Signature values do not exactly match materialized slots");
	}
	const signatureById = new Map(signatures.map((value) => [value.slotId, value]));
	if (signatureById.size !== signatures.length) {
		throw new Error("Duplicate materialized signature value");
	}
	for (const slot of materialized.signatureSlots) {
		if (!signatureById.has(slot.slotId)) {
			throw new Error(`Materialized signature ${slot.slotId} is missing`);
		}
		if (hashTypedData(slot.typedData) !== slot.typedDataHash) {
			throw new Error(`Materialized signature slot ${slot.slotId} was mutated`);
		}
	}

	const requests = materialized.requests.map((request) => ({ ...request }));
	for (const [requestIndex, request] of requests.entries()) {
		const slots = materialized.signatureSlots.filter(
			(slot) => slot.insertion.requestIndex === requestIndex,
		);
		if (slots.length === 0) continue;
		if (request.kind !== "evcBatch") {
			throw new Error("Materialized signature points outside an EVC batch");
		}
		const batchItems = decodeBatchItems(request.data);
		if (encoder.encodeBatch(batchItems) !== request.data) {
			throw new Error("Materialized EVC request is not canonically encoded");
		}
		for (const slot of slots) {
			const signature = signatureById.get(slot.slotId);
			const reviewedItem = batchItems[slot.insertion.batchItemIndex];
			if (!signature || !reviewedItem) {
				throw new Error("Materialized signature insertion point is invalid");
			}
			const expectedPlaceholder = encoder.encodePermit2Call({
				chainId: slot.chainId,
				owner: slot.signer,
				message: slot.typedData.message,
				signature: PLACEHOLDER_SIGNATURE,
			});
			if (
				reviewedItem.targetContract !== expectedPlaceholder.targetContract ||
				reviewedItem.onBehalfOfAccount !== expectedPlaceholder.onBehalfOfAccount ||
				reviewedItem.value !== expectedPlaceholder.value ||
				reviewedItem.data !== expectedPlaceholder.data
			) {
				throw new Error("Materialized Permit2 placeholder was mutated");
			}
			batchItems[slot.insertion.batchItemIndex] = encoder.encodePermit2Call({
				chainId: slot.chainId,
				owner: slot.signer,
				message: slot.typedData.message,
				signature: signature.signature,
			});
		}
		request.data = encoder.encodeBatch(batchItems);
		request.value = batchItems.reduce((sum, item) => sum + item.value, 0n);
	}

	return deepFreeze({
		__materialized: true,
		__finalized: true,
		chainId: materialized.chainId,
		from: materialized.from,
		evcAddress: materialized.evcAddress,
		requests,
		signatureSlots: materialized.signatureSlots.map((slot) => ({ ...slot })),
		signatureValues: signatures.map((value) => ({ ...value })),
		safeCalls: makeSafeCalls(requests),
	});
}

async function executeWithDecodedErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof MaterializedTransactionRevertedError) throw error;
		const decoded = await decodeSmartContractErrors(error);
		if (decoded.length > 0) {
			throw new MaterializedExecutionError(
				"Materialized execution failed",
				error,
				decoded,
			);
		}
		throw error;
	}
}

function permit2Address(slot: MaterializedPermit2SignatureSlot): Address {
	const verifyingContract = slot.typedData.domain.verifyingContract;
	if (typeof verifyingContract !== "string") {
		throw new Error("Materialized Permit2 domain has no verifying contract");
	}
	return getAddress(verifyingContract);
}

async function assertPinnedPermit2Nonce(
	providerService: ProviderService,
	slot: MaterializedPermit2SignatureSlot,
): Promise<void> {
	const publicClient = providerService.getProvider(slot.chainId);
	const allowance = (await publicClient.readContract({
		address: permit2Address(slot),
		abi: PERMIT2_ALLOWANCE_ABI,
		functionName: "allowance",
		args: [
			slot.signer,
			slot.typedData.message.details.token,
			slot.typedData.message.spender,
		],
	})) as readonly [bigint, number | bigint, number | bigint];
	if (Number(allowance[2]) !== slot.nonce) {
		throw new Error("Permit2 nonce changed after materialization");
	}
}

/**
 * Dispatch static prerequisites that precede the first signed batch, collect
 * the declared signatures, finalize a new immutable request vector, then
 * dispatch its remaining exact requests. No transaction is recomposed during
 * dispatch. A supplied FinalizedMaterializedExecution is not authenticated by
 * the SDK; this function assumes the application already authenticated the
 * complete finalized input against its accepted review digest.
 */
export async function executeMaterialized(
	encoder: MaterializedExecutionEncoder,
	providerService: ProviderService,
	materialized: MaterializedExecution | FinalizedMaterializedExecution,
	options: ExecuteMaterializedOptions,
): Promise<MaterializedExecutionResult> {
	const publicClient = providerService.getProvider(materialized.chainId);
	const alreadyFinalized =
		"__finalized" in materialized && materialized.__finalized === true;
	const firstSignedRequestIndex = materialized.signatureSlots.length
		? Math.min(
				...materialized.signatureSlots.map(
					(slot) => slot.insertion.requestIndex,
				),
			)
		: 0;
	let execution: FinalizedMaterializedExecution | undefined = alreadyFinalized
		? materialized
		: undefined;
	const hashes: Hash[] = [];
	const receipts: TransactionReceipt[] = [];
	const dispatchRequest = async (
		request: MaterializedExecutionRequest,
		index: number,
	): Promise<void> => {
		if (options.revalidate?.permit2NonceMustEqualPinned) {
			for (const slot of materialized.signatureSlots) {
				if (slot.insertion.requestIndex === index) {
					await assertPinnedPermit2Nonce(providerService, slot);
				}
			}
		}
		await options.onBeforeStep?.(request, index);
		options.onProgress?.({
			completed: hashes.length,
			total: materialized.requests.length,
			request,
			status: "transaction",
		});
		const hash = await options.sendTransaction(request);
		hashes.push(hash);
		await options.onTransactionHash?.(request, index, hash);
		const receipt = await publicClient.waitForTransactionReceipt({ hash });
		if (receipt.status !== "success") {
			throw new MaterializedTransactionRevertedError(hash);
		}
		receipts.push(receipt);
		await options.onAfterStep?.(request, index, hash, receipt);
		options.onProgress?.({
			completed: hashes.length,
			total: materialized.requests.length,
			request,
			status: "transaction",
			hash,
		});
	};

	await executeWithDecodedErrors(async () => {
		let nextRequestIndex = 0;
		if (
			options.revalidate?.permit2NonceMustEqualPinned &&
			materialized.signatureSlots.length > 0 &&
			(alreadyFinalized || firstSignedRequestIndex > 0)
		) {
			for (const slot of materialized.signatureSlots) {
				await assertPinnedPermit2Nonce(providerService, slot);
			}
		}
		if (!alreadyFinalized) {
			for (; nextRequestIndex < firstSignedRequestIndex; nextRequestIndex++) {
				await dispatchRequest(
					materialized.requests[nextRequestIndex]!,
					nextRequestIndex,
				);
			}

			const signatures: MaterializedSignatureValue[] = [];
			options.onProgress?.({
				completed: hashes.length,
				total: materialized.requests.length,
				status: "signature",
			});
			for (const [index, slot] of materialized.signatureSlots.entries()) {
				if (!options.signTypedData) {
					throw new Error(
						"ExecutionService.executeMaterialized requires signTypedData when Permit2 approval is needed",
					);
				}
				if (options.revalidate?.permit2NonceMustEqualPinned) {
					await assertPinnedPermit2Nonce(providerService, slot);
				}
				await options.onBeforeSignature?.(slot, index);
				const signature = await options.signTypedData(slot.typedData);
				signatures.push({ slotId: slot.slotId, signature });
			}
			execution = finalizeMaterializedExecution(
				encoder,
				materialized,
				signatures,
			);
		}

		if (!execution) throw new Error("Materialized execution was not finalized");
		await options.onFinalized?.(execution);
		for (; nextRequestIndex < execution.requests.length; nextRequestIndex++) {
			await dispatchRequest(execution.requests[nextRequestIndex]!, nextRequestIndex);
		}
	});
	if (!execution) throw new Error("Materialized execution was not finalized");
	options.onProgress?.({
		completed: execution.requests.length,
		total: execution.requests.length,
		status: "completed",
	});
	return { execution, hashes, receipts };
}
