import type { Address, Hex } from "viem";

export type StorageSlot = {
	address: Address;
	slot: Hex;
};
