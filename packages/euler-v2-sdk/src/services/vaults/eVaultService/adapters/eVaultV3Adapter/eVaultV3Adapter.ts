import { type Address, getAddress } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../../utils/buildQuery.js";
import { createCallBundler } from "../../../../../utils/callBundler.js";
import {
	type DataIssue,
	compressDataIssues,
	prefixDataIssues,
	type ServiceResult,
} from "../../../../../utils/entityDiagnostics.js";
import type { IEVault } from "../../../../../entities/EVault.js";
import type { EVaultV3AdapterConfig } from "../../eVaultServiceConfig.js";
import type { IEVaultAdapter } from "../../eVaultService.js";
import { convertVault } from "./eVaultV3AdapterConversions.js";
import type {
	V3ListEnvelope,
	V3VaultBatchRequest,
	V3VaultBatchResponse,
	V3VaultDetailWithIncludes,
	V3VaultListRow,
} from "./eVaultV3AdapterTypes.js";

const unsupportedError = new Error("unsupported");
const BATCH_LIMIT = 1000;

export class EVaultV3Adapter implements IEVaultAdapter {
	constructor(
		private config: EVaultV3AdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: EVaultV3AdapterConfig): void {
		this.config = config;
	}

	private getHeaders(contentType?: string): Record<string, string> {
		return {
			Accept: "application/json",
			...(contentType ? { "Content-Type": contentType } : {}),
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	private buildUrl(
		endpoint: string,
		path: string,
		search?: Record<string, string>,
	): string {
		const normalizedEndpoint = endpoint.replace(/\/+$/, "");
		const joined =
			normalizedEndpoint.startsWith("http://") ||
			normalizedEndpoint.startsWith("https://")
				? new URL(path, `${normalizedEndpoint}/`).toString()
				: `${normalizedEndpoint}${path}`;

		if (!search || Object.keys(search).length === 0) return joined;

		const params = new URLSearchParams(search);
		return `${joined}?${params.toString()}`;
	}

	queryV3EVaultDetail = createCallBundler(
		async (
			keys: { address: Address; chainId: number }[],
		): Promise<(V3VaultDetailWithIncludes | undefined)[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const addresses = byChain.get(key.chainId) ?? [];
				addresses.push(getAddress(key.address));
				byChain.set(key.chainId, addresses);
			}

			const chainResults = new Map<number, Map<string, V3VaultDetailWithIncludes>>();

			for (const [chainId, addresses] of byChain) {
				const resolved = new Map<string, V3VaultDetailWithIncludes>();
				const dedupedAddresses = [
					...new Set(addresses.map((address) => getAddress(address))),
				];

				for (
					let offset = 0;
					offset < dedupedAddresses.length;
					offset += BATCH_LIMIT
				) {
					const requestBody: V3VaultBatchRequest = {
						chainId,
						addresses: dedupedAddresses.slice(offset, offset + BATCH_LIMIT),
						include: ["collaterals"],
					};
					const url = this.buildUrl(this.config.endpoint, "/v3/evk/vaults/batch");
					const response = await fetch(url, {
						method: "POST",
						headers: this.getHeaders("application/json"),
						body: JSON.stringify(requestBody),
					});
					if (!response.ok) {
						throw new Error(
							`eVaultV3 batch ${response.status} ${response.statusText}`,
						);
					}
					const batch = (await response.json()) as V3VaultBatchResponse;
					for (const detail of batch.data ?? []) {
						resolved.set(getAddress(detail.address).toLowerCase(), detail);
					}
				}

				chainResults.set(chainId, resolved);
			}

			return keys.map((key) =>
				chainResults
					.get(key.chainId)
					?.get(getAddress(key.address).toLowerCase()),
			);
		},
	);

	setQueryV3EVaultDetail(fn: typeof this.queryV3EVaultDetail): void {
		this.queryV3EVaultDetail = fn;
	}

	queryV3EVaultList = async (
		endpoint: string,
		chainId: number,
		offset: number,
		limit: number,
	): Promise<V3ListEnvelope<V3VaultListRow> | V3VaultListRow[]> => {
		const url = this.buildUrl(endpoint, "/v3/evk/vaults", {
			chainId: String(chainId),
			offset: String(offset),
			limit: String(limit),
		});

		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok) {
			throw new Error(`eVaultV3 list ${response.status} ${response.statusText}`);
		}
		return response.json() as Promise<
			V3ListEnvelope<V3VaultListRow> | V3VaultListRow[]
		>;
	};

	setQueryV3EVaultList(fn: typeof this.queryV3EVaultList): void {
		this.queryV3EVaultList = fn;
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
	): Promise<ServiceResult<(IEVault | undefined)[]>> {
		console.time("EVaultV3Adapter.fetchVaults");
		try {
			const results: Array<{ result: IEVault | undefined; errors: DataIssue[] }> =
				await Promise.all(
					vaults.map(async (vault, index) => {
						const errors: DataIssue[] = [];
						let detail: V3VaultDetailWithIncludes | undefined;

						try {
							detail = await this.queryV3EVaultDetail({ address: vault, chainId });
						} catch (error) {
							return {
								result: undefined,
								errors: [
									{
										code: "SOURCE_UNAVAILABLE",
										severity: "warning",
										message: `Failed to fetch eVault ${getAddress(vault)}.`,
										paths: [`$.vaults[${index}]`],
										entityId: getAddress(vault),
										source: "eVaultV3",
										originalValue:
											error instanceof Error ? error.message : String(error),
									},
								],
							};
						}

						if (!detail) {
							return {
								result: undefined,
								errors: [
									{
										code: "SOURCE_UNAVAILABLE",
										severity: "warning",
										message: `Vault detail missing for ${getAddress(vault)}.`,
										paths: [`$.vaults[${index}]`],
										entityId: getAddress(vault),
										source: "eVaultV3",
									},
								],
							};
						}

						try {
							return {
								result: convertVault(
									detail,
									detail.collaterals ?? [],
									errors,
									vault,
								),
								errors: prefixDataIssues(errors, `$.vaults[${index}]`).map(
									(issue) => ({
										...issue,
										entityId: issue.entityId ?? getAddress(vault),
									}),
								),
							};
						} catch (error) {
							return {
								result: undefined,
								errors: [
									{
										code: "DECODE_FAILED",
										severity: "warning",
										message: `Failed to decode eVault ${getAddress(vault)}.`,
										paths: [`$.vaults[${index}]`],
										entityId: getAddress(vault),
										source: "eVaultV3",
										originalValue:
											error instanceof Error ? error.message : String(error),
									},
								],
							};
						}
					}),
				);

			return {
				result: results.map((entry) => entry.result),
				errors: compressDataIssues(results.flatMap((entry) => entry.errors)),
			};
		} finally {
			console.timeEnd("EVaultV3Adapter.fetchVaults");
		}
	}

	async fetchVerifiedVaultsAddresses(
		_chainId: number,
		_perspectives: Address[],
	): Promise<Address[]> {
		throw unsupportedError;
	}

	async fetchAllVaults(
		chainId: number,
	): Promise<ServiceResult<(IEVault | undefined)[]>> {
		const limit = 200;
		let offset = 0;
		const addresses: Address[] = [];

		while (true) {
			const response = await this.queryV3EVaultList(
				this.config.endpoint,
				chainId,
				offset,
				limit,
			);
			const rows = Array.isArray(response) ? response : (response.data ?? []);

			addresses.push(
				...rows.map((row) => getAddress(row.address)),
			);

			if (Array.isArray(response)) {
				if (rows.length < limit) break;
				offset += rows.length;
				continue;
			}

			const total = response.meta?.total;
			const batchSize = rows.length;
			const effectiveLimit = response.meta?.limit ?? limit;
			if (batchSize === 0) break;
			offset += batchSize;
			if (total !== undefined && offset >= total) break;
			if (effectiveLimit === 0 || batchSize < effectiveLimit) break;
		}

		return this.fetchVaults(chainId, [...new Set(addresses)]);
	}
}
