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

export function getEVaultFixtures(): any[] {
	const fixtures = vaultReport.snapshots.onchain.flatMap((snapshot) =>
		snapshot.vaults
			.filter((vault) => vault.type === "EVault")
			.map((vault) => clone(reviveSnapshot(vault.value))),
	);
	if (fixtures.length === 0) {
		throw new Error("Generated corpus contains no EVault fixtures.");
	}
	return fixtures;
}

function findEVault(predicate: (vault: any) => boolean) {
	const found = getEVaultFixtures().find(predicate);
	if (!found) {
		throw new Error("Expected EVault fixture was not found in generated corpus.");
	}
	return found;
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
