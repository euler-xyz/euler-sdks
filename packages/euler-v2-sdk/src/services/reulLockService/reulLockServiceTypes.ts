import type { Address } from "viem";
import type { TransactionPlan } from "../executionService/index.js";

export interface REULLock {
	/** Lock maturity timestamp used by the rEUL contract. */
	timestamp: bigint;
	/** Total rEUL amount in the lock. */
	amount: bigint;
	/** EUL amount currently unlockable for this lock. */
	unlockableAmount: bigint;
	/** EUL amount burned when unlocking this lock at the current time. */
	amountToBeBurned: bigint;
}

export interface FetchREULLocksArgs {
	/** Chain whose rEUL contract should be queried. */
	chainId: number;
	/** Account whose rEUL locks should be fetched. */
	account: Address;
	/** Optional rEUL token address override for custom deployment metadata. */
	rEulAddress?: Address;
	/** Number of per-lock withdraw amount calls to issue concurrently. */
	batchSize?: number;
}

export interface BuildUnlockREULPlanArgs {
	/** Chain where the rEUL unlock transaction will be sent. */
	chainId: number;
	/** Recipient/account argument passed to `withdrawToByLockTimestamp`. */
	account: Address;
	/** Lock timestamp to unlock. */
	lockTimestamp: bigint;
	/** Optional rEUL token address override for custom deployment metadata. */
	rEulAddress?: Address;
	/** Contract `allowRemainderLoss` argument; defaults to true. */
	allowRemainderLoss?: boolean;
}

export interface IREULLockService {
	/** Fetch all rEUL locks and their current withdraw amounts for an account. */
	fetchLocks(args: FetchREULLocksArgs): Promise<REULLock[]>;
	/** Build a direct contract-call transaction plan for one rEUL lock unlock. */
	buildUnlockPlan(args: BuildUnlockREULPlanArgs): TransactionPlan;
}
