import { type Address, type Hex, type PublicClient, getAddress } from "viem";

type CallParams = {
	data: Hex;
	to: Address;
	from?: Address;
	gas?: Hex;
};

const DEFAULT_ACCESS_LIST_GAS = "0x989680" as const; // 10,000,000

/**
 * Discover storage slots accessed by a call using eth_createAccessList.
 * Works on all nodes including Anvil (unlike debug_traceCall with prestateTracer).
 *
 * @returns Map from contract address to list of storage slots accessed
 */
export async function getAccessedSlots(
	client: PublicClient,
	params: CallParams,
): Promise<Map<Address, Hex[]>> {
	const tx = {
		to: params.to,
		data: params.data,
		gas: params.gas ?? DEFAULT_ACCESS_LIST_GAS,
		...(params.from ? { from: params.from } : {}),
	};

	const result = (await client.request({
		method: "eth_createAccessList" as any,
		params: [tx, "latest"] as any,
	})) as any;

	const map = new Map<Address, Hex[]>();
	for (const entry of result.accessList || []) {
		map.set(getAddress(entry.address), (entry.storageKeys || []) as Hex[]);
	}
	return map;
}
