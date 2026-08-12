import type { Address, Hex, PublicClient } from "viem";
import type { AddressOrAccount } from "../entities/Account.js";
import type { EVault } from "../entities/EVault.js";
import type { EulerSDK } from "../sdk/sdk.js";
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

/** A plugin failure that makes continuing with the unmodified plan unsafe. */
export class PluginExecutionFatalError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "PluginExecutionFatalError";
	}
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

export type PluginSDK = EulerSDK<any>;

/**
 * Per-plugin prefetched data, keyed by plugin `name`. Plugins that participate
 * in prefetching populate their slot via `prefetch(...)`; downstream methods
 * (`getReadPrepend`, `processPlan`) consume their slot via `prefetch[this.name]`.
 *
 * Known SDK plugins type their slot explicitly. The index signature lets
 * external plugins register their own keyed payloads without changing this
 * interface.
 */
export type PythPluginPrefetch = {
	entries: Array<{
		pythAddress: Address;
		feedIds: Hex[];
		updates: Hex[];
		fee: bigint;
	}>;
};

export type KeyringPluginPrefetch = {
	/** Plan targets already classified by this payload, including non-vaults. */
	targetAddresses?: Set<Address>;
	gatedVaults: Map<
		Address,
		{
			hookTarget: Address;
			policyId: number;
			keyring: Address;
		} | null
	>;
};

export type PluginPrefetchData = {
	pyth?: PythPluginPrefetch;
	keyring?: KeyringPluginPrefetch;
	[pluginName: string]: unknown;
};

export interface EulerPlugin {
	name: string;
	/**
	 * Optional form-level prefetch hook. Called once with the same arguments as
	 * processPlan; the returned value is stored at `prefetch[plugin.name]` and
	 * passed back to getReadPrepend/processPlan to avoid per-call network I/O.
	 * Return undefined to opt out of prefetch (or to signal no useful data).
	 */
	prefetch?(
		plan: TransactionPlan,
		account: AddressOrAccount,
		chainId: number,
		sdk: PluginSDK,
	): Promise<unknown>;
	/** Return batch items to prepend when simulating lens reads. null = not relevant for these vaults. */
	getReadPrepend?(
		ctx: ReadPluginContext,
		prefetch?: PluginPrefetchData,
	): Promise<PluginBatchItems | null>;
	/** Transform a transaction plan (e.g. prepend oracle updates, resolve approvals). */
	processPlan?(
		plan: TransactionPlan,
		account: AddressOrAccount,
		chainId: number,
		sdk: PluginSDK,
		prefetch?: PluginPrefetchData,
	): Promise<TransactionPlan>;
	/** Decode a batch item that this plugin produced. Return null if the item is not from this plugin. */
	decodeBatchItem?(item: EVCBatchItem): BatchItemDescription | null;
}

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
