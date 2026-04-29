import {
	encodeFunctionData,
	maxUint256,
	type Abi,
	type Address,
	type Hash,
	type TransactionReceipt,
} from "viem";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { IExecutionService } from "./executionService.js";
import type {
	EVCBatchItem,
	TransactionPlan,
	TransactionPlanItem,
} from "./executionServiceTypes.js";
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
	chain?: unknown;
	waitForTransactionReceipt: (parameters: {
		hash: Hash;
	}) => Promise<TransactionReceipt>;
	readContract: (
		parameters: any,
	) => Promise<unknown>;
};

export type TransactionPlanWalletClient = {
	sendTransaction: (parameters: any) => Promise<Hash>;
	signTypedData: (parameters: any) => Promise<Hash>;
};

export type ExecuteTransactionPlanArgs = {
	plan: TransactionPlan;
	executionService: IExecutionService;
	deploymentService: IDeploymentService;
	chainId: number;
	account: Address;
	walletClient: TransactionPlanWalletClient;
	publicClient: TransactionPlanPublicClient;
	chain?: unknown;
	usePermit2?: boolean;
	unlimitedApproval?: boolean;
	resolveApprovals?: boolean;
	onProgress?: (progress: TransactionPlanExecutionProgress) => void;
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

function getChain(args: ExecuteTransactionPlanArgs): unknown {
	const chain = args.chain ?? args.publicClient.chain;
	if (!chain) {
		throw new Error(
			"A chain must be provided when the public client has no chain configured",
		);
	}
	return chain;
}

function shouldResolveApprovals(
	plan: TransactionPlan,
	resolveApprovals: boolean,
): boolean {
	return (
		resolveApprovals &&
		plan.some(
			(item) => item.type === "requiredApproval" && item.resolved === undefined,
		)
	);
}

async function maybeResolveApprovals(
	args: ExecuteTransactionPlanArgs,
): Promise<TransactionPlan> {
	const resolveApprovals = args.resolveApprovals ?? true;
	if (!shouldResolveApprovals(args.plan, resolveApprovals)) return args.plan;

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
 * Execute a transaction plan without applying SDK plugins or app-level plan transformers.
 *
 * The lifecycle mirrors the reusable part of Euler Lite's executeTxPlan flow:
 * resolve approvals when needed, collect Permit2 signatures, send approvals and
 * executable plan items sequentially, wait for each receipt before continuing,
 * and return all hashes/receipts.
 */
export async function executeTransactionPlan(
	args: ExecuteTransactionPlanArgs,
): Promise<TransactionPlanExecutionResult> {
	const chain = getChain(args);
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
						const hash = await args.walletClient.sendTransaction({
							to: resolvedItem.token,
							data: resolvedItem.data,
							account: args.account,
							chain,
						});
						hashes.push(hash);
						const receipt = await waitForSuccessfulReceipt(args.publicClient, hash);
						receipts.push(receipt);
						emitProgress(item, "approval", hash);
						continue;
					}

					emitProgress(item, "permit2Signature");
					const permit2Address =
						args.deploymentService.getDeployment(args.chainId).addresses.coreAddrs
							.permit2;
					const allowance = (await args.publicClient.readContract({
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
					const signature = await args.walletClient.signTypedData({
						...typedData,
						account: args.account,
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
				const batchItems = [...permit2BatchItems, ...item.items];
				const evcAddress =
					args.deploymentService.getDeployment(args.chainId).addresses.coreAddrs
						.evc;
				const data = args.executionService.encodeBatch(batchItems);
				const value = batchItems.reduce((sum, batchItem) => sum + batchItem.value, 0n);
				const hash = await args.walletClient.sendTransaction({
					to: evcAddress,
					data,
					value,
					account: args.account,
					chain,
				});
				hashes.push(hash);
				const receipt = await waitForSuccessfulReceipt(args.publicClient, hash);
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
			const hash = await args.walletClient.sendTransaction({
				to: item.to,
				data,
				value: item.value,
				account: args.account,
				chain,
			});
			hashes.push(hash);
			const receipt = await waitForSuccessfulReceipt(args.publicClient, hash);
			receipts.push(receipt);
			permit2BatchItems.length = 0;
			completed += 1;
			emitProgress(item, "completed", hash);
		}
	});

	return { plan, hashes, receipts };
}

export { approvalAmountLabel };
