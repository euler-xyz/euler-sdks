import type { AddressPrefix } from "../entities/Account.js";
import { type Address, getAddress, isAddressEqual, pad, toHex } from "viem";

export const SUB_ACCOUNT_MIN_ID = 1;
export const SUB_ACCOUNT_MAX_ID = 256;

export interface GetFreeSubAccountsOptions {
	startId?: number;
	endId?: number;
}

export interface BorrowCompatibleSubAccountCandidate {
	subAccount: Address;
	enabledControllers: readonly Address[];
}

export function getSubAccountId(primary: Address, subAccount: Address) {
	const xor = Number(BigInt(primary) ^ BigInt(subAccount));
	if (xor > SUB_ACCOUNT_MAX_ID) {
		throw new Error("Addresses are not related");
	}
	return xor;
}

export function getSubAccountAddress(primary: Address, subAccountId: number) {
	if (!Number.isInteger(subAccountId) || subAccountId < 0) {
		throw new Error("Sub account ID must be a non-negative integer");
	}
	if (subAccountId > SUB_ACCOUNT_MAX_ID) {
		throw new Error("Sub account ID too large");
	}
	return getAddress(
		pad(toHex(BigInt(primary) ^ BigInt(subAccountId)), {
			size: 20,
		}),
	);
}

export function isSubAccount(primary: Address, subAccount: Address) {
	return Number(BigInt(primary) ^ BigInt(subAccount)) <= SUB_ACCOUNT_MAX_ID;
}

export function getAddressPrefix(address: Address) {
	return address.substring(0, 40) as AddressPrefix;
}

export function getFreeSubAccounts(
	primary: Address,
	occupiedSubAccounts: readonly Address[],
	options: GetFreeSubAccountsOptions = {},
): Address[] {
	const startId = options.startId ?? SUB_ACCOUNT_MIN_ID;
	const endId = options.endId ?? SUB_ACCOUNT_MAX_ID;

	if (!Number.isInteger(startId) || !Number.isInteger(endId)) {
		throw new Error("Sub account ID range must use integer values");
	}
	if (startId < 0 || endId < startId) {
		throw new Error("Invalid sub account ID range");
	}
	if (endId > SUB_ACCOUNT_MAX_ID) {
		throw new Error("Sub account ID too large");
	}

	const owner = getAddress(primary);
	const occupied = new Set(
		occupiedSubAccounts.map((subAccount) => getAddress(subAccount)),
	);
	const freeSubAccounts: Address[] = [];

	for (let id = startId; id <= endId; id++) {
		const subAccount = getSubAccountAddress(owner, id);
		if (!occupied.has(subAccount)) {
			freeSubAccounts.push(subAccount);
		}
	}

	return freeSubAccounts;
}

export function isBorrowControllerCompatible(
	enabledControllers: readonly Address[],
	borrowVault: Address,
): boolean {
	const vault = getAddress(borrowVault);
	return (
		enabledControllers.length === 0 ||
		enabledControllers.every((controller) => isAddressEqual(controller, vault))
	);
}

export function selectBorrowCompatibleSubAccount(
	candidates: readonly BorrowCompatibleSubAccountCandidate[],
	borrowVault: Address,
): Address | undefined {
	const candidate = candidates.find(({ enabledControllers }) =>
		isBorrowControllerCompatible(enabledControllers, borrowVault),
	);
	return candidate ? getAddress(candidate.subAccount) : undefined;
}
