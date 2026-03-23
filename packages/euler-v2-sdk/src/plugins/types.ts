import type { Address, Hex, PublicClient } from "viem";
import type { EVault } from "../entities/EVault.js";
import type {
	BatchItemDescription,
	EVCBatchItem,
	TransactionPlan,
	TransactionPlanItem,
} from "../services/executionService/executionServiceTypes.js";

export interface PluginBatchItems {
	items: EVCBatchItem[];
	totalValue: bigint;
}

export interface ReadPluginContext {
	chainId: number;
	vaults: EVault[];
	provider: PublicClient;
}

export interface Signer {
	signTypedData(data: Record<string, unknown>): Promise<Hex>;
	sendTransaction(tx: { to: Address; data: Hex; value?: bigint }): Promise<Hex>;
}

export interface WritePluginContext extends ReadPluginContext {
	sender: Address;
	collateralAddresses?: Address[];
	signer?: Signer;
}

export interface EulerPlugin {
	name: string;
	/** Return batch items to prepend when simulating lens reads. null = not relevant for these vaults. */
	getReadPrepend?(ctx: ReadPluginContext): Promise<PluginBatchItems | null>;
	/** Transform a transaction plan (e.g. prepend oracle updates, resolve approvals). */
	processPlan?(
		plan: TransactionPlan,
		ctx: WritePluginContext,
	): Promise<TransactionPlan>;
	/** Decode a batch item that this plugin produced. Return null if the item is not from this plugin. */
	decodeBatchItem?(item: EVCBatchItem): BatchItemDescription | null;
}

export type ProcessPluginsArgs = Omit<WritePluginContext, "provider">;

/**
 * Prepend batch items to the first `evcBatch` entry in a transaction plan.
 */
export function prependToBatch(
	plan: TransactionPlan,
	items: EVCBatchItem[],
): TransactionPlan {
	if (items.length === 0) return plan;

	let prepended = false;
	return plan.map((entry: TransactionPlanItem) => {
		if (entry.type === "evcBatch" && !prepended) {
			prepended = true;
			return { ...entry, items: [...items, ...entry.items] };
		}
		return entry;
	});
}
