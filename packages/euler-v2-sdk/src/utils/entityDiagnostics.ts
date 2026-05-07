import type { Address } from "viem";

export type DataIssueSeverity = "info" | "warning" | "error";

export type DataIssueCode =
	| "COERCED_TYPE"
	| "OUT_OF_RANGE_CLAMPED"
	| "OUT_OF_RANGE_DROPPED"
	| "PRECISION_LOSS"
	| "DEFAULT_APPLIED"
	| "SOURCE_UNAVAILABLE"
	| "FALLBACK_USED"
	| "DECODE_FAILED";

export type DataIssueOwnerRef =
	| { kind: "account"; chainId: number; address: Address }
	| { kind: "subAccount"; chainId: number; address: Address }
	| {
			kind: "accountPosition";
			chainId: number;
			account: Address;
			vault: Address;
	  }
	| {
			kind: "accountPositionCollateral";
			chainId: number;
			account: Address;
			vault: Address;
			collateral: Address;
	  }
	| { kind: "asset"; chainId: number; address: Address }
	| { kind: "vault"; chainId: number; address: Address }
	| {
			kind: "vaultCollateral";
			chainId: number;
			vault: Address;
			collateral: Address;
	  }
	| {
			kind: "vaultStrategy";
			chainId: number;
			vault: Address;
			strategy: Address;
	  }
	| { kind: "wallet"; chainId: number; address: Address }
	| { kind: "walletAsset"; chainId: number; wallet: Address; asset: Address }
	| { kind: "service"; service: string; chainId?: number; id?: string };

export interface DataIssueLocation {
	owner: DataIssueOwnerRef;
	/** JSONPath-like, relative to the diagnostic owner. */
	path: string;
}

export interface DataIssue {
	code: DataIssueCode;
	severity: DataIssueSeverity;
	message: string;
	locations: DataIssueLocation[];
	source?: string;
	originalValue?: unknown;
	normalizedValue?: unknown;
}

export interface ServiceResult<T> {
	result: T;
	errors: DataIssue[];
}

export function vaultDiagnosticOwner(
	chainId: number,
	address: Address,
): DataIssueOwnerRef {
	return { kind: "vault", chainId, address };
}

export function assetDiagnosticOwner(
	chainId: number,
	address: Address,
): DataIssueOwnerRef {
	return { kind: "asset", chainId, address };
}

export function accountDiagnosticOwner(
	chainId: number,
	address: Address,
): DataIssueOwnerRef {
	return { kind: "account", chainId, address };
}

export function subAccountDiagnosticOwner(
	chainId: number,
	address: Address,
): DataIssueOwnerRef {
	return { kind: "subAccount", chainId, address };
}

export function accountPositionDiagnosticOwner(
	chainId: number,
	account: Address,
	vault: Address,
): DataIssueOwnerRef {
	return { kind: "accountPosition", chainId, account, vault };
}

export function accountPositionCollateralDiagnosticOwner(
	chainId: number,
	account: Address,
	vault: Address,
	collateral: Address,
): DataIssueOwnerRef {
	return {
		kind: "accountPositionCollateral",
		chainId,
		account,
		vault,
		collateral,
	};
}

export function vaultCollateralDiagnosticOwner(
	chainId: number,
	vault: Address,
	collateral: Address,
): DataIssueOwnerRef {
	return { kind: "vaultCollateral", chainId, vault, collateral };
}

export function vaultStrategyDiagnosticOwner(
	chainId: number,
	vault: Address,
	strategy: Address,
): DataIssueOwnerRef {
	return { kind: "vaultStrategy", chainId, vault, strategy };
}

export function walletDiagnosticOwner(
	chainId: number,
	address: Address,
): DataIssueOwnerRef {
	return { kind: "wallet", chainId, address };
}

export function walletAssetDiagnosticOwner(
	chainId: number,
	wallet: Address,
	asset: Address,
): DataIssueOwnerRef {
	return { kind: "walletAsset", chainId, wallet, asset };
}

export function serviceDiagnosticOwner(
	service: string,
	chainId?: number,
	id?: string,
): DataIssueOwnerRef {
	return { kind: "service", service, chainId, id };
}

export function dataIssueLocation(
	owner: DataIssueOwnerRef,
	path = "$",
): DataIssueLocation {
	return { owner, path: path || "$" };
}

export function withPathPrefix(path: string, prefix: string): string {
	if (!prefix || prefix === "$") return path;
	if (path === "$") return prefix;
	if (path.startsWith("$.")) return `${prefix}${path.slice(1)}`;
	if (path.startsWith("$[")) return `${prefix}${path.slice(1)}`;
	return `${prefix}.${path}`;
}

export function dataIssueOwnerKey(owner: DataIssueOwnerRef): string {
	switch (owner.kind) {
		case "account":
		case "asset":
		case "subAccount":
		case "vault":
		case "wallet":
			return `${owner.kind}:${owner.chainId}:${owner.address.toLowerCase()}`;
		case "accountPosition":
			return `${owner.kind}:${owner.chainId}:${owner.account.toLowerCase()}:${owner.vault.toLowerCase()}`;
		case "accountPositionCollateral":
			return `${owner.kind}:${owner.chainId}:${owner.account.toLowerCase()}:${owner.vault.toLowerCase()}:${owner.collateral.toLowerCase()}`;
		case "walletAsset":
			return `${owner.kind}:${owner.chainId}:${owner.wallet.toLowerCase()}:${owner.asset.toLowerCase()}`;
		case "vaultCollateral":
			return `${owner.kind}:${owner.chainId}:${owner.vault.toLowerCase()}:${owner.collateral.toLowerCase()}`;
		case "vaultStrategy":
			return `${owner.kind}:${owner.chainId}:${owner.vault.toLowerCase()}:${owner.strategy.toLowerCase()}`;
		case "service":
			return `${owner.kind}:${owner.chainId ?? "unknown"}:${owner.service}:${owner.id ?? ""}`;
	}
}

export function dataIssueLocationKey(location: DataIssueLocation): string {
	return `${dataIssueOwnerKey(location.owner)}:${location.path}`;
}

function uniqueLocations(locations: DataIssueLocation[]): DataIssueLocation[] {
	const byKey = new Map<string, DataIssueLocation>();
	for (const location of locations) {
		byKey.set(dataIssueLocationKey(location), location);
	}
	return Array.from(byKey.values());
}

export function mapDataIssueLocations(
	issue: DataIssue,
	mapLocation: (location: DataIssueLocation) => DataIssueLocation,
): DataIssue {
	return {
		...issue,
		locations: uniqueLocations(issue.locations.map(mapLocation)),
	};
}

export function replaceDataIssueLocations(
	issue: DataIssue,
	locations: DataIssueLocation[],
): DataIssue {
	return {
		...issue,
		locations: uniqueLocations(locations),
	};
}

function stableSerialize(value: unknown): string {
	if (typeof value === "bigint") return `bigint:${value.toString()}`;
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(
				([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`,
			);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value);
}

export function compressDataIssues(errors: DataIssue[]): DataIssue[] {
	const byFingerprint = new Map<string, DataIssue>();

	for (const issue of errors) {
		const fingerprint = stableSerialize({
			code: issue.code,
			severity: issue.severity,
			message: issue.message,
			source: issue.source,
			originalValue: issue.originalValue,
			normalizedValue: issue.normalizedValue,
		});
		const existing = byFingerprint.get(fingerprint);
		if (!existing) {
			byFingerprint.set(fingerprint, {
				...issue,
				locations: uniqueLocations(issue.locations),
			});
			continue;
		}

		existing.locations = uniqueLocations([
			...existing.locations,
			...issue.locations,
		]);
	}

	return Array.from(byFingerprint.values());
}
