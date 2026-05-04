import {
	encodeFunctionData,
	maxUint256,
	type Abi,
	type Address,
	type Hash,
	type Hex,
	type TransactionReceipt,
} from "viem";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type { IExecutionService } from "./executionService.js";
import type {
	EVCBatchItem,
	PermitSingleTypedData,
	TransactionPlan,
	TransactionPlanItem,
} from "./executionServiceTypes.js";
import { flattenBatchEntries } from "./executionServiceTypes.js";
import {
	decodeSmartContractErrors,
	type DecodedSmartContractError,
} from "../../utils/decodeSmartContractErrors.js";

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

export type TransactionPlanExecutionStatus =
	| "approval"
	| "permit2Signature"
	| "evcBatch"
	| "contractCall"
	| "completed";

export type TransactionPlanExecutionProgress = {
	completed: number;
	total: number;
	item?: TransactionPlanItem;
	status?: TransactionPlanExecutionStatus;
	hash?: Hash;
};

export type TransactionPlanExecutionResult = {
	plan: TransactionPlan;
	hashes: Hash[];
	receipts: TransactionReceipt[];
};

export type TransactionPlanPublicClient = {
	waitForTransactionReceipt: (parameters: {
		hash: Hash;
	}) => Promise<TransactionReceipt>;
	readContract: (
		parameters: any,
	) => Promise<unknown>;
};

export type TransactionPlanTransactionRequest = {
	to: Address;
	data: Hex;
	value?: bigint;
};

export type TransactionPlanSignTypedDataRequest = PermitSingleTypedData;

export type ExecuteTransactionPlanArgs = {
	plan: TransactionPlan;
	chainId: number;
	account: Address;
	sendTransaction: (
		parameters: TransactionPlanTransactionRequest,
	) => Promise<Hash>;
	signTypedData?: (
		parameters: TransactionPlanSignTypedDataRequest,
	) => Promise<Hex>;
	/** Defaults to true. When enabled, unresolved approvals prefer the Permit2 path. */
	usePermit2?: boolean;
	/** Defaults to false. When enabled, newly created approvals use max allowance values. */
	unlimitedApproval?: boolean;
	onProgress?: (progress: TransactionPlanExecutionProgress) => void;
};

export type ExecuteTransactionPlanInternalArgs = ExecuteTransactionPlanArgs & {
	plan: TransactionPlan;
	executionService: IExecutionService;
	deploymentService: IDeploymentService;
	providerService: ProviderService;
};

export class TransactionPlanExecutionError extends Error {
	readonly decodedErrors: DecodedSmartContractError[];
	readonly originalError: unknown;

	constructor(
		message: string,
		originalError: unknown,
		decodedErrors: DecodedSmartContractError[],
	) {
		super(message);
		this.name = "TransactionPlanExecutionError";
		this.originalError = originalError;
		this.decodedErrors = decodedErrors;
	}
}

function approvalAmountLabel(amount: bigint): string {
	return amount === maxUint256 ? "unlimited" : amount.toString();
}

async function waitForSuccessfulReceipt(
	publicClient: TransactionPlanPublicClient,
	hash: Hash,
): Promise<TransactionReceipt> {
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== "success") {
		throw new Error(`Transaction ${hash} reverted`);
	}
	return receipt;
}

async function maybeResolveApprovals(
	args: ExecuteTransactionPlanInternalArgs,
): Promise<TransactionPlan> {
	return args.executionService.resolveRequiredApprovals({
		plan: args.plan,
		chainId: args.chainId,
		account: args.account,
		usePermit2: args.usePermit2,
		unlimitedApproval: args.unlimitedApproval,
	});
}

async function executeWithDecodedErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		const decoded = await decodeSmartContractErrors(error);
		if (decoded.length > 0) {
			throw new TransactionPlanExecutionError(
				"Transaction plan execution failed",
				error,
				decoded,
			);
		}
		throw error;
	}
}

/**
 * Execute a transaction plan: resolves approvals, collects Permit2 signatures,
 * sends approval/EVC-batch/contract-call items sequentially, waits for each
 * receipt, and returns all hashes and receipts. Permit2 signatures collected
 * during a `requiredApproval` are prepended to the next `evcBatch` item.
 */
export async function executeTransactionPlan(
	args: ExecuteTransactionPlanInternalArgs,
): Promise<TransactionPlanExecutionResult> {
	const publicClient = args.providerService.getProvider(args.chainId);
	const plan = await maybeResolveApprovals(args);

	const hashes: Hash[] = [];
	const receipts: TransactionReceipt[] = [];
	const permit2BatchItems: EVCBatchItem[] = [];
	let completed = 0;

	const emitProgress = (
		item?: TransactionPlanItem,
		status?: TransactionPlanExecutionStatus,
		hash?: Hash,
	) => {
		args.onProgress?.({ completed, total: plan.length, item, status, hash });
	};

	await executeWithDecodedErrors(async () => {
		for (const item of plan) {
			if (item.type === "requiredApproval") {
				if (!item.resolved?.length) {
					completed += 1;
					emitProgress(item, "completed");
					continue;
				}

				for (const resolvedItem of item.resolved) {
					if (resolvedItem.type === "approve") {
						emitProgress(item, "approval");
						const hash = await args.sendTransaction({
							to: resolvedItem.token,
							data: resolvedItem.data,
						});
						hashes.push(hash);
						const receipt = await waitForSuccessfulReceipt(publicClient, hash);
						receipts.push(receipt);
						emitProgress(item, "approval", hash);
						continue;
					}

					emitProgress(item, "permit2Signature");
					if (!args.signTypedData) {
						throw new Error(
							"ExecutionService.executeTransactionPlan requires signTypedData when Permit2 approval is needed",
						);
					}
					const permit2Address =
						args.deploymentService.getDeployment(args.chainId).addresses.coreAddrs
							.permit2;
					const allowance = (await publicClient.readContract({
						address: permit2Address,
						abi: PERMIT2_ALLOWANCE_ABI,
						functionName: "allowance",
						args: [resolvedItem.owner, resolvedItem.token, resolvedItem.spender],
					})) as readonly [bigint, number | bigint, number | bigint];
					const nonce = Number(allowance[2]);
					const typedData = args.executionService.getPermit2TypedData({
						chainId: args.chainId,
						token: resolvedItem.token,
						amount: resolvedItem.amount,
						spender: resolvedItem.spender,
						nonce,
					});
					const signature = await args.signTypedData({
						...typedData,
					});
					permit2BatchItems.push(
						args.executionService.encodePermit2Call({
							chainId: args.chainId,
							owner: resolvedItem.owner,
							message: typedData.message,
							signature,
						}),
					);
				}

				completed += 1;
				emitProgress(item, "completed");
				continue;
			}

			if (item.type === "evcBatch") {
				emitProgress(item, "evcBatch");
				const batchItems = [
					...permit2BatchItems,
					...flattenBatchEntries(item.items),
				];
				const evcAddress =
					args.deploymentService.getDeployment(args.chainId).addresses.coreAddrs
						.evc;
				const data = args.executionService.encodeBatch(batchItems);
				const value = batchItems.reduce((sum, batchItem) => sum + batchItem.value, 0n);
				const hash = await args.sendTransaction({
					to: evcAddress,
					data,
					value,
				});
				hashes.push(hash);
				const receipt = await waitForSuccessfulReceipt(publicClient, hash);
				receipts.push(receipt);
				permit2BatchItems.length = 0;
				completed += 1;
				emitProgress(item, "completed", hash);
				continue;
			}

			if (item.chainId !== args.chainId) {
				throw new Error(
					`Plan item targets chain ${item.chainId}, but executor is configured for chain ${args.chainId}`,
				);
			}

			emitProgress(item, "contractCall");
			const data = encodeFunctionData({
				abi: item.abi,
				functionName: item.functionName,
				args: item.args,
			});
			const hash = await args.sendTransaction({
				to: item.to,
				data,
				value: item.value,
			});
			hashes.push(hash);
			const receipt = await waitForSuccessfulReceipt(publicClient, hash);
			receipts.push(receipt);
			permit2BatchItems.length = 0;
			completed += 1;
			emitProgress(item, "completed", hash);
		}
	});

	return { plan, hashes, receipts };
}

export { approvalAmountLabel };
