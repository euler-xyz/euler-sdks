import { type Address, getAddress } from "viem";
import type { EVault } from "../../../entities/EVault.js";
import type { EulerEarn } from "../../../entities/EulerEarn.js";
import type { SecuritizeCollateralVault } from "../../../entities/SecuritizeCollateralVault.js";
import { VaultType } from "../../../utils/types.js";
import type {
	FetchAllVaultsArgs,
	IVaultService,
	VaultFetchOptions,
} from "../index.js";
import type { IVaultTypeAdapter } from "./adapters/IVaultTypeAdapter.js";
import type { StandardEVaultPerspectives } from "../eVaultService/index.js";
import type { StandardEulerEarnPerspectives } from "../eulerEarnService/index.js";
import type {
	DataIssue,
	ServiceResult,
} from "../../../utils/entityDiagnostics.js";
import {
	compressDataIssues,
	dataIssueLocation,
	serviceDiagnosticOwner,
	vaultDiagnosticOwner,
} from "../../../utils/entityDiagnostics.js";

export type VaultMetaPerspective =
	| StandardEulerEarnPerspectives
	| StandardEVaultPerspectives
	| Address;

/** Default union of vault entity types (EVault, Euler Earn, SecuritizeCollateral). Extend this when registering additional vault services. */
export type VaultEntity = EVault | EulerEarn | SecuritizeCollateralVault;

/** Type guard: narrows VaultEntity to EVault. */
export function isEVault(v: unknown): v is EVault {
	return (
		typeof v === "object" &&
		v !== null &&
		"type" in v &&
		(v as { type?: unknown }).type === VaultType.EVault
	);
}

/** Type guard: narrows VaultEntity to EulerEarn. */
export function isEulerEarn(v: unknown): v is EulerEarn {
	return (
		typeof v === "object" &&
		v !== null &&
		"type" in v &&
		(v as { type?: unknown }).type === VaultType.EulerEarn
	);
}

/** Type guard: narrows VaultEntity to SecuritizeCollateralVault. */
export function isSecuritizeCollateralVault(
	v: unknown,
): v is SecuritizeCollateralVault {
	return (
		typeof v === "object" &&
		v !== null &&
		"type" in v &&
		(v as { type?: unknown }).type === VaultType.SecuritizeCollateral
	);
}

/** A vault service that can be registered with VaultMetaService. Use TEntity to extend the meta service return type (e.g. EVault | EulerEarn | CustomVault). */
export type RegisteredVaultService<TEntity = VaultEntity> = IVaultService<
	TEntity,
	string
>;

/** Extendable vault type: built-in (e.g. VaultType.EVault, VaultType.EulerEarn) or custom string when adding vault services with a type. */
export type VaultTypeString = string;

/** A vault service optionally tagged with a type for getFactoryByType(chainId, type). Use { type, service } when adding custom vault types. */
export type VaultServiceEntry<TEntity = VaultEntity> =
	| RegisteredVaultService<TEntity>
	| { type: VaultTypeString; service: RegisteredVaultService<TEntity> };

/** Meta vault service; TEntity is the union of all registered vault entity types (default EVault | EulerEarn). Extend with a wider union when registering more services. */
export interface IVaultMetaService<TEntity = VaultEntity>
	extends Omit<IVaultService<TEntity, VaultMetaPerspective>, "factory"> {
	/** Register a vault service; use { type, service } to make the type available to getFactoryByType(chainId, type). */
	registerVaultService(entry: VaultServiceEntry<TEntity>): void;
	/** Returns vault type for the given vault address, or undefined if unknown. */
	fetchVaultType(
		chainId: number,
		vault: Address,
	): Promise<VaultTypeString | undefined>;
	/** Returns vault types for the given vault addresses (keyed by normalized vault address). */
	fetchVaultTypes(
		chainId: number,
		vaults: Address[],
	): Promise<Partial<Record<Address, VaultTypeString>>>;
	/** Returns the factory address for the given chain and vault type, or undefined if the type is not registered. */
	getFactoryByType(chainId: number, type: VaultTypeString): Address | undefined;
}

export interface VaultMetaServiceConfig<TEntity = VaultEntity> {
	vaultTypeAdapter: IVaultTypeAdapter;
	/** Initial vault services. Use { type, service } to register a vault type for getFactoryByType(chainId, type). */
	vaultServices?: VaultServiceEntry<TEntity>[];
}

export class VaultMetaService<TEntity = VaultEntity>
	implements IVaultMetaService<TEntity>
{
	private readonly vaultServicesList: RegisteredVaultService<TEntity>[] = [];
	private readonly typeToService = new Map<
		string,
		RegisteredVaultService<TEntity>
	>();
	private readonly serviceToType = new Map<
		RegisteredVaultService<TEntity>,
		string
	>();

	constructor(private config: VaultMetaServiceConfig<TEntity>) {
		if (config.vaultServices?.length) {
			for (const entry of config.vaultServices) {
				if ("type" in entry && "service" in entry) {
					this.typeToService.set(entry.type, entry.service);
					this.serviceToType.set(entry.service, entry.type);
					this.vaultServicesList.push(entry.service);
				} else {
					this.vaultServicesList.push(entry as RegisteredVaultService<TEntity>);
				}
			}
		}
	}

	setVaultTypeAdapter(adapter: IVaultTypeAdapter): void {
		this.config = { ...this.config, vaultTypeAdapter: adapter };
	}

	/** Register a vault service; use { type, service } to make the type available to getFactoryByType(chainId, type). */
	registerVaultService(entry: VaultServiceEntry<TEntity>): void {
		if ("type" in entry && "service" in entry) {
			this.typeToService.set(entry.type, entry.service);
			this.serviceToType.set(entry.service, entry.type);
			this.vaultServicesList.push(entry.service);
		} else {
			this.vaultServicesList.push(entry as RegisteredVaultService<TEntity>);
		}
	}

	private get vaultServices(): readonly RegisteredVaultService<TEntity>[] {
		return this.vaultServicesList;
	}

	private getFactoryToServiceMap(
		chainId: number,
	): Map<string, RegisteredVaultService<TEntity>> {
		const map = new Map<string, RegisteredVaultService<TEntity>>();
		for (const service of this.vaultServices) {
			const factory = getAddress(service.factory(chainId));
			map.set(factory, service);
		}
		return map;
	}

	private getServiceByResolvedType(
		chainId: number,
		resolvedType: string,
	): RegisteredVaultService<TEntity> | undefined {
		const typedService = this.typeToService.get(resolvedType);
		if (typedService) return typedService;

		try {
			return this.getFactoryToServiceMap(chainId).get(getAddress(resolvedType));
		} catch {
			return undefined;
		}
	}

	private getServiceLabel(service: RegisteredVaultService<TEntity>): string {
		const registeredType = this.serviceToType.get(service);
		if (registeredType) return registeredType;

		const constructorName = (service as { constructor?: { name?: string } })
			.constructor?.name;
		if (constructorName && constructorName !== "Object") return constructorName;

		return "unknownVaultService";
	}

	private async fetchVaultToService(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<Map<Address, RegisteredVaultService<TEntity>>> {
		if (vaultAddresses.length === 0) return new Map();
		const map = new Map<Address, RegisteredVaultService<TEntity>>();
		const typeResults = await this.config.vaultTypeAdapter.fetchVaultTypes(
			chainId,
			vaultAddresses,
		);
		for (const { id, type } of typeResults) {
			const service = this.getServiceByResolvedType(chainId, type);
			if (!service) continue;
			map.set(getAddress(id), service);
		}
		return map;
	}

	getFactoryByType(chainId: number, type: string): Address | undefined {
		const service = this.typeToService.get(type);
		return service?.factory(chainId);
	}

	async fetchVault(
		chainId: number,
		vault: Address,
		options?: VaultFetchOptions,
	): Promise<ServiceResult<TEntity | undefined>> {
		const fetched = await this.fetchVaults(chainId, [vault], options);
		const result = fetched.result[0];
		const errors = [...fetched.errors];
		if (result === undefined) {
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "error",
				message: `Vault not found for ${getAddress(vault)}.`,
				locations: [
					dataIssueLocation(vaultDiagnosticOwner(chainId, getAddress(vault))),
				],
				source: "vaultMetaService",
				originalValue: getAddress(vault),
			});
		}
		return {
			result,
			errors: compressDataIssues(errors),
		};
	}

	async fetchVaultType(
		chainId: number,
		vault: Address,
	): Promise<VaultTypeString | undefined> {
		const vaultToService = await this.fetchVaultToService(chainId, [vault]);
		const service = vaultToService.get(getAddress(vault));
		if (!service) return undefined;
		return this.serviceToType.get(service);
	}

	async fetchVaultTypes(
		chainId: number,
		vaults: Address[],
	): Promise<Partial<Record<Address, VaultTypeString>>> {
		if (vaults.length === 0) return {};

		const vaultToService = await this.fetchVaultToService(chainId, vaults);
		const out: Partial<Record<Address, VaultTypeString>> = {};
		for (const vault of vaults) {
			const key = getAddress(vault);
			const service = vaultToService.get(key);
			if (!service) continue;
			const type = this.serviceToType.get(service);
			if (!type) continue;
			out[key as Address] = type;
		}
		return out;
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
		options?: VaultFetchOptions,
	): Promise<ServiceResult<(TEntity | undefined)[]>> {
		if (vaults.length === 0) return { result: [], errors: [] };
		const errors: DataIssue[] = [];
		const vaultToService = await this.fetchVaultToService(chainId, vaults);
		const result: (TEntity | undefined)[] = Array.from(
			{ length: vaults.length },
			() => undefined,
		);
		const serviceToAddresses = new Map<
			RegisteredVaultService<TEntity>,
			Array<{ address: Address; index: number }>
		>();
		for (const [index, v] of vaults.entries()) {
			const service = vaultToService.get(getAddress(v));
			if (service) {
				const list = serviceToAddresses.get(service) ?? [];
				list.push({ address: v, index });
				serviceToAddresses.set(service, list);
			} else {
				errors.push({
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: `No registered vault service for ${getAddress(v)}.`,
					locations: [
						dataIssueLocation(vaultDiagnosticOwner(chainId, getAddress(v))),
					],
					source: "vaultTypeAdapter",
					originalValue: getAddress(v),
				});
			}
		}

		await Promise.all(
			Array.from(serviceToAddresses.entries()).map(
				async ([service, entries]) => {
					try {
						const addresses = entries.map((entry) => entry.address);
						const entities = await service.fetchVaults(
							chainId,
							addresses,
							options,
						);
						errors.push(...entities.errors);
						for (const [entryIndex, entry] of entries.entries()) {
							const entity = entities.result[entryIndex];
							if (entity === undefined) {
								errors.push({
									code: "SOURCE_UNAVAILABLE",
									severity: "warning",
									message: `Failed to fetch vault ${getAddress(entry.address)}.`,
									locations: [
										dataIssueLocation(
											vaultDiagnosticOwner(chainId, getAddress(entry.address)),
										),
									],
									source: "vaultService",
									originalValue: getAddress(entry.address),
								});
								continue;
							}
							result[entry.index] = entity;
						}
					} catch (error) {
						for (const entry of entries) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message: `Failed to fetch vault ${getAddress(entry.address)}.`,
								locations: [
									dataIssueLocation(
										vaultDiagnosticOwner(chainId, getAddress(entry.address)),
									),
								],
								source: "vaultService",
								originalValue:
									error instanceof Error ? error.message : String(error),
							});
						}
					}
				},
			),
		);
		return { result, errors: compressDataIssues(errors) };
	}

	async fetchVerifiedVaultAddresses(
		chainId: number,
		perspectives: VaultMetaPerspective[],
	): Promise<Address[]> {
		if (perspectives.length === 0) return [];
		const allAddrs = await Promise.all(
			this.vaultServices.map((service) =>
				service.fetchVerifiedVaultAddresses(
					chainId,
					perspectives as (string | Address)[],
				),
			),
		);
		const seen = new Set<string>();
		const merged: Address[] = [];
		for (const addrs of allAddrs) {
			for (const a of addrs) {
				const key = getAddress(a);
				if (seen.has(key)) continue;
				seen.add(key);
				merged.push(a);
			}
		}
		return merged;
	}

	async fetchVerifiedVaults(
		chainId: number,
		perspectives: VaultMetaPerspective[],
		options?: VaultFetchOptions,
	): Promise<ServiceResult<(TEntity | undefined)[]>> {
		const addresses = await this.fetchVerifiedVaultAddresses(
			chainId,
			perspectives,
		);
		const fetched = await this.fetchVaults(chainId, addresses, options);
		return {
			...fetched,
			errors: compressDataIssues(fetched.errors),
		};
	}

	/**
	 * Fetches all discoverable vaults across registered vault services.
	 * The optional async `filter` runs after the first fetch in each service and before populate/enrichment work,
	 * so rejected vaults are skipped before additional resources are spent on them.
	 */
	async fetchAllVaults(
		chainId: number,
		args?: FetchAllVaultsArgs<TEntity, VaultFetchOptions>,
	): Promise<ServiceResult<(TEntity | undefined)[]>> {
		const allFetched = await Promise.allSettled(
			this.vaultServices.map((service) =>
				service.fetchAllVaults(
					chainId,
					args as FetchAllVaultsArgs<TEntity, VaultFetchOptions>,
				),
			),
		);

		const errors: DataIssue[] = [];
		const results: ServiceResult<(TEntity | undefined)[]>[] = [];

		for (const [index, entry] of allFetched.entries()) {
			if (entry.status === "fulfilled") {
				results.push(entry.value);
				continue;
			}

			const service = this.vaultServices[index];
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "warning",
				message: `Failed to fetch all vaults for ${service ? this.getServiceLabel(service) : "unknownVaultService"}.`,
				locations: [
					dataIssueLocation(
						serviceDiagnosticOwner(
							"vaultMetaService",
							chainId,
							"fetchAllVaults",
						),
					),
				],
				source: "vaultMetaService",
				originalValue:
					entry.reason instanceof Error
						? entry.reason.message
						: String(entry.reason),
			});
		}

		return {
			result: results.flatMap((entry) => entry.result),
			errors: compressDataIssues([
				...errors,
				...results.flatMap((entry) => entry.errors),
			]),
		};
	}
}
