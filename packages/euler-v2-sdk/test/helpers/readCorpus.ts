import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress, type Address } from "viem";

type SnapshotSpecial =
	| { __type: "bigint"; value: string }
	| { __type: "undefined" };

type VaultReport = {
	snapshots: {
		onchain: Array<{
			vaults: Array<{
				address: Address;
				type?: string;
				value: unknown;
			}>;
		}>;
	};
};

type AccountReport = {
	snapshots: {
		onchain: {
			accounts: Array<{
				address: Address;
				value: unknown;
			}>;
		};
	};
};

function reviveSnapshot<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((entry) => reviveSnapshot(entry)) as T;
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	const maybeSpecial = value as SnapshotSpecial;
	if (maybeSpecial.__type === "bigint") {
		return BigInt(maybeSpecial.value) as T;
	}
	if (maybeSpecial.__type === "undefined") {
		return undefined as T;
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, reviveSnapshot(entry)]),
	) as T;
}

function loadJson<T>(filename: string): T {
	return JSON.parse(
		readFileSync(
			join(import.meta.dirname, "..", "fixtures", "generated", filename),
			"utf8",
		),
	) as T;
}

const vaultReport = loadJson<VaultReport>("fetch-all-vaults-mainnet.json");
const accountReport = loadJson<AccountReport>("fetch-accounts-mainnet.json");

function clone<T>(value: T): T {
	return structuredClone(value);
}

function findEVault(predicate: (vault: any) => boolean) {
	for (const snapshot of vaultReport.snapshots.onchain) {
		for (const vault of snapshot.vaults) {
			if (vault.type !== "EVault") continue;
			const revived = reviveSnapshot(vault.value);
			if (predicate(revived)) return clone(revived);
		}
	}
	throw new Error("Expected EVault fixture was not found in generated corpus.");
}

export function getPlainEVaultFixture() {
	return findEVault((vault) => Array.isArray(vault.collaterals) && vault.collaterals.length === 0);
}

export function getCollateralizedEVaultFixture() {
	return findEVault(
		(vault) =>
			Array.isArray(vault.collaterals) &&
			vault.collaterals.length > 0 &&
			vault.collaterals.some(
				(collateral: any) =>
					Number(collateral.borrowLTV ?? 0) > 0 ||
					Number(collateral.liquidationLTV ?? 0) > 0,
			),
	);
}

export function getAccountFixture(index = 0) {
	const raw = accountReport.snapshots.onchain.accounts[index];
	if (!raw) throw new Error(`Account fixture ${index} not found.`);
	return clone(reviveSnapshot(raw.value));
}

export function normalizeAddress(value: Address): Address {
	return getAddress(value);
}
