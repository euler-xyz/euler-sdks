import {
	type Abi,
	type Address,
	type ContractFunctionArgs,
	type ContractFunctionName,
	type ContractFunctionReturnType,
	type Hex,
	type PublicClient,
	decodeFunctionResult,
	encodeFunctionData,
	zeroAddress,
} from "viem";
import type { EVCBatchItem } from "../../services/executionService/executionServiceTypes.js";

type ViewName<abi extends Abi> = ContractFunctionName<abi, "pure" | "view">;

/**
 * One lens view, packaged three ways: as calldata for a bundle (`batchItem`),
 * as the decoder for that bundle's answer (`decode`), and as a single read
 * (`read`). None takes a block argument: read through a client from
 * `pinClientToBlock` and every form answers at its pin.
 */
export interface LensRead<abi extends Abi, name extends ViewName<abi>> {
	abi: abi;
	functionName: name;
	/** The read as an EVC batch item; `to`/`data` also feed `readMany`. */
	batchItem(
		lens: Address,
		args: ContractFunctionArgs<abi, "pure" | "view", name>,
		onBehalfOfAccount?: Address,
	): EVCBatchItem;
	/** Decodes the bytes a successful `batchItem` read answered with. */
	decode(data: Hex): ContractFunctionReturnType<abi, "pure" | "view", name>;
	/** One read through `client`. */
	read(
		client: PublicClient,
		lens: Address,
		args: ContractFunctionArgs<abi, "pure" | "view", name>,
	): Promise<ContractFunctionReturnType<abi, "pure" | "view", name>>;
}

/** Packages one view of `abi` as a `LensRead`; the bundled lens sets are built with it. */
export function defineLensRead<abi extends Abi, name extends ViewName<abi>>(
	abi: abi,
	functionName: name,
): LensRead<abi, name> {
	return {
		abi,
		functionName,
		batchItem: (lens, args, onBehalfOfAccount = zeroAddress) => ({
			targetContract: lens,
			onBehalfOfAccount,
			value: 0n,
			data: encodeFunctionData({ abi, functionName, args } as never),
		}),
		decode: (data) =>
			decodeFunctionResult({ abi, functionName, data } as never) as never,
		read: (client, lens, args) =>
			client.readContract({
				address: lens,
				abi,
				functionName,
				args,
			} as never) as never,
	};
}
