import {
	type Address,
	type Hex,
	type PublicClient,
	decodeFunctionResult,
	encodeFunctionData,
	multicall3Abi,
	zeroAddress,
} from "viem";
import { ethereumVaultConnectorAbi } from "../services/executionService/abis/ethereumVaultConnectorAbi.js";
import type { EVCBatchItem } from "../services/executionService/executionServiceTypes.js";

/** Multicall3's canonical deployment address, the same on every supported chain. */
export const MULTICALL3_ADDRESS: Address =
	"0xcA11bde05977b3631167028862bE2a173976CA11";

export interface ReadManyItem {
	to: Address;
	data: Hex;
	/** Native value to forward; only the `evc` carrier can carry it. */
	value?: bigint;
}

/** One item's outcome: the return data on success, the revert data otherwise. Never thrown. */
export interface ReadManyResult {
	success: boolean;
	data: Hex;
}

export type ReadManyOptions =
	| {
			/** Multicall3 `aggregate3` with `allowFailure` — for pure views. Default. */
			carrier?: "multicall3";
			/** Defaults to the client chain's Multicall3, then the canonical address. */
			multicall3Address?: Address;
	  }
	| {
			/** EVC `batchSimulation` — for items that carry value, such as Pyth updates. */
			carrier: "evc";
			evcAddress: Address;
			/** `onBehalfOfAccount` for every batch item; defaults to the zero address. */
			onBehalfOfAccount?: Address;
	  };

interface BatchItemResult {
	success: boolean;
	result: Hex;
}

/**
 * Bundles many reads into one `eth_call`, answering each item with its own
 * success flag and bytes so one revert never hides the rest. The read is made
 * through `client`, so a client from `pinClientToBlock` answers every item at
 * its pin.
 */
export async function readMany(
	client: PublicClient,
	items: ReadManyItem[],
	options: ReadManyOptions = {},
): Promise<ReadManyResult[]> {
	if (items.length === 0) return [];
	return options.carrier === "evc"
		? readManyThroughEvc(client, items, options)
		: readManyThroughMulticall3(client, items, options);
}

async function readManyThroughMulticall3(
	client: PublicClient,
	items: ReadManyItem[],
	options: Extract<ReadManyOptions, { carrier?: "multicall3" }>,
): Promise<ReadManyResult[]> {
	if (items.some((item) => (item.value ?? 0n) > 0n)) {
		throw new Error(
			"readMany: the multicall3 carrier cannot carry value; use the evc carrier for items that do.",
		);
	}
	const to =
		options.multicall3Address ??
		client.chain?.contracts?.multicall3?.address ??
		MULTICALL3_ADDRESS;
	const { data } = await client.call({
		to,
		data: encodeFunctionData({
			abi: multicall3Abi,
			functionName: "aggregate3",
			args: [
				items.map((item) => ({
					target: item.to,
					allowFailure: true,
					callData: item.data,
				})),
			],
		}),
	});
	if (!data || data === "0x") {
		throw new Error("readMany: empty response from Multicall3.aggregate3.");
	}
	const results = decodeFunctionResult({
		abi: multicall3Abi,
		functionName: "aggregate3",
		data,
	});
	return results.map((result) => ({
		success: result.success,
		data: result.returnData,
	}));
}

async function readManyThroughEvc(
	client: PublicClient,
	items: ReadManyItem[],
	options: Extract<ReadManyOptions, { carrier: "evc" }>,
): Promise<ReadManyResult[]> {
	const onBehalfOfAccount = options.onBehalfOfAccount ?? zeroAddress;
	const batchItems: EVCBatchItem[] = items.map((item) => ({
		targetContract: item.to,
		onBehalfOfAccount,
		value: item.value ?? 0n,
		data: item.data,
	}));
	const value = batchItems.reduce((sum, item) => sum + item.value, 0n);
	const { data } = await client.call({
		to: options.evcAddress,
		data: encodeFunctionData({
			abi: ethereumVaultConnectorAbi,
			functionName: "batchSimulation",
			args: [batchItems],
		}),
		value,
	});
	if (!data || data === "0x") {
		throw new Error("readMany: empty response from EVC.batchSimulation.");
	}
	const [results] = decodeFunctionResult({
		abi: ethereumVaultConnectorAbi,
		functionName: "batchSimulation",
		data,
	}) as unknown as [BatchItemResult[]];
	return results.map((result) => ({
		success: result.success,
		data: result.result,
	}));
}
