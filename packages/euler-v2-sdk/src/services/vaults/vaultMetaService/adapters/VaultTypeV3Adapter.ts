import { type Address, getAddress } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import { createCallBundler } from "../../../../utils/callBundler.js";
import { VaultType } from "../../../../utils/types.js";
import type {
	IVaultTypeAdapter,
	VaultFactoryResult,
	VaultResolvedTypeResult,
} from "./IVaultTypeAdapter.js";

type V3ResolveRequest = {
	chainId: number;
	addresses: string[];
};

type V3ResolveRow = {
	chainId: number;
	address: string;
	found: boolean;
	vaultType?: string | null;
	resource?: string | null;
	factory?: string | null;
	factoryAddress?: string | null;
};

type V3ResolveResponse = {
	data?: V3ResolveRow[];
};

type V3ResolvedVaultResult = VaultResolvedTypeResult & {
	factory?: Address;
};

export interface VaultTypeV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3staging.eul.dev`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
	/**
	 * Optional map from V3 `vaultType` values to SDK vault type strings.
	 * Defaults include `earn -> EulerEarn`, `evk -> EVault`, and `securitize -> SecuritizeCollateral`.
	 */
	typeMap?: Record<string, string>;
}

const defaultTypeMap: Record<string, string> = {
	earn: VaultType.EulerEarn,
	eulerEarn: VaultType.EulerEarn,
	evault: VaultType.EVault,
	evk: VaultType.EVault,
	vault: VaultType.EVault,
	securitize: VaultType.SecuritizeCollateral,
	securitizeCollateral: VaultType.SecuritizeCollateral,
};

const V3_VAULT_RESOLVE_BATCH_SIZE = 500;

function normalizeTypeKey(value: string): string {
	return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export class VaultTypeV3Adapter implements IVaultTypeAdapter {
	constructor(
		private config: VaultTypeV3AdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: VaultTypeV3AdapterConfig): void {
		this.config = config;
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			"Content-Type": "application/json",
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	private resolveSdkVaultType(row: V3ResolveRow): string | undefined {
		const configuredTypeMap = Object.fromEntries(
			Object.entries(this.config.typeMap ?? {}).map(([key, value]) => [
				normalizeTypeKey(key),
				value,
			]),
		);
		const mergedTypeMap = {
			...defaultTypeMap,
			...configuredTypeMap,
		};

		if (row.vaultType) {
			const mapped = mergedTypeMap[normalizeTypeKey(row.vaultType)];
			if (mapped) return mapped;
		}

		const resource = row.resource?.toLowerCase() ?? "";
		if (resource.startsWith("/v3/earn/vaults/")) return VaultType.EulerEarn;
		if (resource.startsWith("/v3/evk/vaults/")) return VaultType.EVault;
		return undefined;
	}

	private resolveFactoryAddress(row: V3ResolveRow): Address | undefined {
		const value = row.factoryAddress ?? row.factory;
		if (!value) return undefined;

		try {
			return getAddress(value);
		} catch {
			return undefined;
		}
	}

	queryV3VaultResolve = createCallBundler(
		async (
			keys: { address: Address; chainId: number }[],
		): Promise<(V3ResolvedVaultResult | undefined)[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const addresses = byChain.get(key.chainId) ?? [];
				addresses.push(key.address);
				byChain.set(key.chainId, addresses);
			}

			const chainResults = new Map<
				number,
				Map<string, V3ResolvedVaultResult>
			>();

			for (const [chainId, addresses] of byChain) {
				const uniqueAddresses = [
					...new Set(addresses.map((address) => getAddress(address))),
				];
				const url = `${this.config.endpoint.replace(/\/+$/, "")}/v3/resolve/vaults`;
				const resolved = new Map<string, V3ResolvedVaultResult>();

				for (
					let offset = 0;
					offset < uniqueAddresses.length;
					offset += V3_VAULT_RESOLVE_BATCH_SIZE
				) {
					const requestBody: V3ResolveRequest = {
						chainId,
						addresses: uniqueAddresses.slice(
							offset,
							offset + V3_VAULT_RESOLVE_BATCH_SIZE,
						),
					};
					const response = await fetch(url, {
						method: "POST",
						headers: this.getHeaders(),
						body: JSON.stringify(requestBody),
					});
					if (!response.ok) {
						throw new Error(
							`vaultTypeV3 resolve ${response.status} ${response.statusText}`,
						);
					}

					const json = (await response.json()) as V3ResolveResponse;
					for (const row of json.data ?? []) {
						if (!row.found) continue;
						const address = getAddress(row.address);
						const sdkVaultType = this.resolveSdkVaultType(row);
						const factory = this.resolveFactoryAddress(row);
						if (!sdkVaultType && !factory) continue;

						resolved.set(address.toLowerCase(), {
							id: address,
							type: sdkVaultType ?? VaultType.Unknown,
							...(factory ? { factory } : {}),
						});
					}
				}
				chainResults.set(chainId, resolved);
			}

			return keys.map((key) => {
				return chainResults
					.get(key.chainId)
					?.get(getAddress(key.address).toLowerCase());
			});
		},
	);

	setQueryV3VaultResolve(fn: typeof this.queryV3VaultResolve): void {
		this.queryV3VaultResolve = fn;
	}

	async fetchVaultType(
		chainId: number,
		vaultAddress: Address,
	): Promise<string | undefined> {
		const result = await this.queryV3VaultResolve({ address: vaultAddress, chainId });
		if (!result || result.type === VaultType.Unknown) return undefined;
		return result.type;
	}

	async fetchVaultTypes(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<VaultResolvedTypeResult[]> {
		if (vaultAddresses.length === 0) return [];

		const results = await Promise.all(
			vaultAddresses.map((address) =>
				this.queryV3VaultResolve({ address, chainId }),
			),
		);

		return results.filter(
			(result): result is VaultResolvedTypeResult =>
				result != null && result.type !== VaultType.Unknown,
		);
	}

	async fetchVaultFactories(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<VaultFactoryResult[]> {
		if (vaultAddresses.length === 0) return [];

		const results = await Promise.all(
			vaultAddresses.map((address) =>
				this.queryV3VaultResolve({ address, chainId }),
			),
		);

		return results
			.filter(
				(result): result is V3ResolvedVaultResult =>
					result != null && result.factory != null,
			)
			.map((result) => ({
				id: result.id,
				factory: result.factory!,
			}));
	}
}
