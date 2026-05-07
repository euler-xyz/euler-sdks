import { EulerEarn, type IEulerEarn } from "../../../entities/EulerEarn.js";
import { type Address, getAddress } from "viem";
import type { DeploymentService } from "../../deploymentService/index.js";
import type {
	FetchAllVaultsArgs,
	IVaultService,
	VaultFilter,
} from "../index.js";
import type {
	IEVaultService,
	EVaultFetchOptions,
} from "../eVaultService/index.js";
import type {
	IVaultMetaService,
	VaultEntity,
} from "../vaultMetaService/index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IIntrinsicApyService } from "../../intrinsicApyService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";
import { VaultType } from "../../../utils/types.js";
import type {
	DataIssue,
	ServiceResult,
} from "../../../utils/entityDiagnostics.js";
import {
	compressDataIssues,
	dataIssueLocation,
	mapDataIssueLocations,
	vaultDiagnosticOwner,
	vaultStrategyDiagnosticOwner,
	withPathPrefix,
} from "../../../utils/entityDiagnostics.js";

export interface IEulerEarnAdapter {
	fetchVaults(
		chainId: number,
		vault: Address[],
	): Promise<ServiceResult<(IEulerEarn | undefined)[]>>;
	fetchAllVaults(
		chainId: number,
	): Promise<ServiceResult<(IEulerEarn | undefined)[]>>;
	fetchVerifiedVaultsAddresses(
		chainId: number,
		perspectives: Address[],
	): Promise<Address[]>;
}

export enum StandardEulerEarnPerspectives {
	GOVERNED = "eulerEarnGovernedPerspective",
	FACTORY = "eulerEarnFactoryPerspective",
}

export interface EulerEarnFetchOptions {
	/** When true, enables all supported populate steps and overrides granular populate flags. */
	populateAll?: boolean;
	populateStrategyVaults?: boolean;
	populateMarketPrices?: boolean;
	populateRewards?: boolean;
	populateIntrinsicApy?: boolean;
	populateLabels?: boolean;
	/** Options forwarded to EVaultService when populating strategy vaults. */
	eVaultFetchOptions?: EVaultFetchOptions;
}

export interface IEulerEarnService
	extends IVaultService<EulerEarn, StandardEulerEarnPerspectives> {
	fetchVault(
		chainId: number,
		vault: Address,
		options?: EulerEarnFetchOptions,
	): Promise<ServiceResult<EulerEarn | undefined>>;
	fetchVaults(
		chainId: number,
		vaults: Address[],
		options?: EulerEarnFetchOptions,
	): Promise<ServiceResult<(EulerEarn | undefined)[]>>;
	/**
	 * Fetches all discoverable EulerEarn vaults.
	 * The optional async `filter` runs after the first fetch and before populate/enrichment work,
	 * so rejected vaults are skipped before additional resources are spent on them.
	 */
	fetchAllVaults(
		chainId: number,
		args?: FetchAllVaultsArgs<EulerEarn, EulerEarnFetchOptions>,
	): Promise<ServiceResult<(EulerEarn | undefined)[]>>;
	populateStrategyVaults(
		eulerEarns: EulerEarn[],
		eVaultFetchOptions?: EVaultFetchOptions,
	): Promise<DataIssue[]>;
	populateMarketPrices(eulerEarns: EulerEarn[]): Promise<DataIssue[]>;
	populateRewards(eulerEarns: EulerEarn[]): Promise<DataIssue[]>;
	populateIntrinsicApy(eulerEarns: EulerEarn[]): Promise<DataIssue[]>;
	populateLabels(eulerEarns: EulerEarn[]): Promise<DataIssue[]>;
}

export class EulerEarnService implements IEulerEarnService {
	private priceService?: IPriceService;
	private rewardsService?: IRewardsService;
	private intrinsicApyService?: IIntrinsicApyService;
	private eulerLabelsService?: IEulerLabelsService;
	private vaultMetaService?: IVaultMetaService<VaultEntity>;

	constructor(
		private adapter: IEulerEarnAdapter,
		private deploymentService: DeploymentService,
		public eVaultService?: IEVaultService,
	) {}

	setAdapter(adapter: IEulerEarnAdapter): void {
		this.adapter = adapter;
	}

	setEVaultService(eVaultService: IEVaultService): void {
		this.eVaultService = eVaultService;
	}

	setVaultMetaService(vaultMetaService: IVaultMetaService<VaultEntity>): void {
		this.vaultMetaService = vaultMetaService;
	}

	setPriceService(service: IPriceService): void {
		this.priceService = service;
	}

	setRewardsService(service: IRewardsService): void {
		this.rewardsService = service;
	}

	setIntrinsicApyService(service: IIntrinsicApyService): void {
		this.intrinsicApyService = service;
	}

	setEulerLabelsService(service: IEulerLabelsService): void {
		this.eulerLabelsService = service;
	}

	factory(chainId: number): Address {
		return this.deploymentService.getDeployment(chainId).addresses.coreAddrs
			.eulerEarnFactory;
	}

	async fetchVault(
		chainId: number,
		vault: Address,
		options?: EulerEarnFetchOptions,
	): Promise<ServiceResult<EulerEarn | undefined>> {
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
				source: "eulerEarnService",
				originalValue: getAddress(vault),
			});
		}
		return { result, errors: compressDataIssues(errors) };
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
		options?: EulerEarnFetchOptions,
	): Promise<ServiceResult<(EulerEarn | undefined)[]>> {
		const fetched = await this.adapter.fetchVaults(chainId, vaults);
		return this.hydrateFetchedVaults(
			fetched,
			this.resolveFetchOptions(options),
		);
	}

	async fetchAllVaults(
		chainId: number,
		args?: FetchAllVaultsArgs<EulerEarn, EulerEarnFetchOptions>,
	): Promise<ServiceResult<(EulerEarn | undefined)[]>> {
		const fetched = await this.adapter.fetchAllVaults(chainId);
		return this.hydrateFetchedVaults(
			fetched,
			this.resolveFetchOptions(args?.options),
			args?.filter,
		);
	}

	private async hydrateFetchedVaults(
		fetched: ServiceResult<(IEulerEarn | undefined)[]>,
		resolvedOptions: EulerEarnFetchOptions,
		filter?: VaultFilter<EulerEarn>,
	): Promise<ServiceResult<(EulerEarn | undefined)[]>> {
		const errors: DataIssue[] = [...fetched.errors];
		const eulerEarns = fetched.result.map((vault) =>
			vault ? new EulerEarn(vault) : undefined,
		);
		const included = filter
			? await Promise.all(
					eulerEarns.map(async (vault) =>
						vault ? await filter(vault) : false,
					),
				)
			: eulerEarns.map((vault) => vault !== undefined);
		const result = eulerEarns.map((vault, index) =>
			vault && included[index] ? vault : undefined,
		);
		const resolvedVaults = result.filter(
			(vault): vault is EulerEarn => vault !== undefined,
		);
		await Promise.all([
			(async () => {
				if (resolvedOptions.populateStrategyVaults) {
					errors.push(
						...(await this.populateStrategyVaults(
							resolvedVaults,
							resolvedOptions.eVaultFetchOptions,
						)),
					);
				}
			})(),
			(async () => {
				if (resolvedOptions.populateMarketPrices) {
					errors.push(...(await this.populateMarketPrices(resolvedVaults)));
				}
			})(),
			(async () => {
				if (resolvedOptions.populateRewards) {
					errors.push(...(await this.populateRewards(resolvedVaults)));
				}
			})(),
			(async () => {
				if (resolvedOptions.populateIntrinsicApy) {
					errors.push(...(await this.populateIntrinsicApy(resolvedVaults)));
				}
			})(),
			(async () => {
				if (resolvedOptions.populateLabels) {
					errors.push(...(await this.populateLabels(resolvedVaults)));
				}
			})(),
		]);
		return { result, errors: compressDataIssues(errors) };
	}

	async populateStrategyVaults(
		eulerEarns: EulerEarn[],
		eVaultFetchOptions?: EVaultFetchOptions,
	): Promise<DataIssue[]> {
		if (!this.vaultMetaService || eulerEarns.length === 0) return [];
		const errors: DataIssue[] = [];

		const occurrencesByAddress = new Map<
			string,
			Array<{ vaultIndex: number; strategyIndex: number }>
		>();

		eulerEarns.forEach((ee, vaultIndex) => {
			ee.strategies.forEach((strategy, strategyIndex) => {
				if (strategy.vaultType === VaultType.Unknown) return;
				const key = strategy.address.toLowerCase();
				const list = occurrencesByAddress.get(key) ?? [];
				list.push({ vaultIndex, strategyIndex });
				occurrencesByAddress.set(key, list);
			});
		});

		const allStrategyAddresses = [...occurrencesByAddress.keys()].map(
			(address) => getAddress(address),
		);

		if (allStrategyAddresses.length === 0) {
			for (const ee of eulerEarns) {
				ee.populated.strategyVaults = true;
			}
			return errors;
		}

		const chainId = eulerEarns[0]!.chainId;
		const fetchedVaults = await Promise.all(
			allStrategyAddresses.map(async (addr) => {
				const key = addr.toLowerCase();
				const occurrences = occurrencesByAddress.get(key) ?? [];
				try {
					const fetched = await this.vaultMetaService!.fetchVault(
						chainId,
						addr,
						eVaultFetchOptions,
					);
					for (const issue of fetched.errors) {
						for (const occurrence of occurrences) {
							const parentVault = eulerEarns[occurrence.vaultIndex];
							if (!parentVault) continue;
							errors.push(
								mapDataIssueLocations(issue, (location) =>
									location.owner.kind === "vault" &&
									location.owner.address.toLowerCase() === key
										? {
												owner: vaultStrategyDiagnosticOwner(
													chainId,
													parentVault.address,
													getAddress(addr),
												),
												path: withPathPrefix(location.path, "$.vault"),
											}
										: location,
								),
							);
						}
					}
					return fetched.result;
				} catch (error) {
					for (const occurrence of occurrences) {
						const parentVault = eulerEarns[occurrence.vaultIndex];
						if (!parentVault) continue;
						errors.push({
							code: "SOURCE_UNAVAILABLE",
							severity: "warning",
							message: `Failed to fetch strategy vault ${getAddress(addr)}.`,
							locations: [
								dataIssueLocation(
									vaultStrategyDiagnosticOwner(
										chainId,
										parentVault.address,
										getAddress(addr),
									),
									"$.vault",
								),
							],
							source: "eVaultService",
							originalValue:
								error instanceof Error ? error.message : String(error),
						});
					}
					return undefined;
				}
			}),
		);

		const vaultByAddress = new Map(
			fetchedVaults
				.filter((v) => v !== undefined)
				.map((v) => [v.address.toLowerCase(), v]),
		);

		for (const ee of eulerEarns) {
			for (const strategy of ee.strategies) {
				if (strategy.vaultType === VaultType.Unknown) continue;
				strategy.vault = vaultByAddress.get(strategy.address.toLowerCase());
			}
			ee.populated.strategyVaults = true;
		}
		return errors;
	}

	async populateMarketPrices(eulerEarns: EulerEarn[]): Promise<DataIssue[]> {
		if (!this.priceService || eulerEarns.length === 0) return [];
		const errors: DataIssue[] = [];

		await Promise.all(
			eulerEarns.map(async (ee) => {
				const eeErrors = await ee.populateMarketPrices(this.priceService!);
				errors.push(...eeErrors);
			}),
		);
		return errors;
	}

	async populateRewards(eulerEarns: EulerEarn[]): Promise<DataIssue[]> {
		if (!this.rewardsService || eulerEarns.length === 0) return [];
		try {
			await this.rewardsService.populateRewards(eulerEarns);
			return [];
		} catch (error) {
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "Failed to populate rewards.",
					locations: eulerEarns.map((vault) =>
						dataIssueLocation(
							vaultDiagnosticOwner(vault.chainId, vault.address),
							"$.rewards",
						),
					),
					source: "rewardsService",
					originalValue: error instanceof Error ? error.message : String(error),
				},
			];
		}
	}

	async populateIntrinsicApy(eulerEarns: EulerEarn[]): Promise<DataIssue[]> {
		if (!this.intrinsicApyService || eulerEarns.length === 0) return [];
		try {
			await this.intrinsicApyService.populateIntrinsicApy(eulerEarns);
			return [];
		} catch (error) {
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "Failed to populate intrinsic APY.",
					locations: eulerEarns.map((vault) =>
						dataIssueLocation(
							vaultDiagnosticOwner(vault.chainId, vault.address),
							"$.intrinsicApy",
						),
					),
					source: "intrinsicApyService",
					originalValue: error instanceof Error ? error.message : String(error),
				},
			];
		}
	}

	async populateLabels(eulerEarns: EulerEarn[]): Promise<DataIssue[]> {
		if (!this.eulerLabelsService || eulerEarns.length === 0) return [];
		try {
			await this.eulerLabelsService.populateLabels(eulerEarns);
			return [];
		} catch (error) {
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "Failed to populate labels.",
					locations: eulerEarns.map((vault) =>
						dataIssueLocation(
							vaultDiagnosticOwner(vault.chainId, vault.address),
							"$.eulerLabel",
						),
					),
					source: "eulerLabelsService",
					originalValue: error instanceof Error ? error.message : String(error),
				},
			];
		}
	}

	async fetchVerifiedVaultAddresses(
		chainId: number,
		perspectives: (StandardEulerEarnPerspectives | Address)[],
	): Promise<Address[]> {
		if (perspectives.length === 0) {
			return [];
		}

		const perspectiveAddresses = perspectives.map((perspective) => {
			if (perspective.startsWith("0x")) {
				return perspective as Address;
			}

			const deployment = this.deploymentService.getDeployment(chainId);
			if (
				!deployment.addresses.peripheryAddrs?.[
					perspective as StandardEulerEarnPerspectives
				]
			) {
				throw new Error(`Perspective address not found for ${perspective}`);
			}

			return deployment.addresses.peripheryAddrs[
				perspective as StandardEulerEarnPerspectives
			] as Address;
		});
		return this.adapter.fetchVerifiedVaultsAddresses(
			chainId,
			perspectiveAddresses,
		);
	}

	async fetchVerifiedVaults(
		chainId: number,
		perspectives: (StandardEulerEarnPerspectives | Address)[],
		options?: EulerEarnFetchOptions,
	): Promise<ServiceResult<(EulerEarn | undefined)[]>> {
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

	private resolveFetchOptions(
		options?: EulerEarnFetchOptions,
	): EulerEarnFetchOptions {
		const resolved = options ?? {};
		if (!resolved.populateAll) return resolved;
		return {
			...resolved,
			populateStrategyVaults: true,
			populateMarketPrices: true,
			populateRewards: true,
			populateIntrinsicApy: true,
			populateLabels: true,
			eVaultFetchOptions: {
				...(resolved.eVaultFetchOptions ?? {}),
				populateAll: true,
			},
		};
	}
}
