import { getAddress, type Address } from "viem";
import { EVault, type IEVault } from "../../../entities/EVault.js";
import {
	selectLeafAdaptersForPair,
	sortOracleAdapters,
} from "../../../utils/oracle.js";
import type { DeploymentService } from "../../deploymentService/index.js";
import type {
	FetchAllVaultsArgs,
	IVaultService,
	VaultFilter,
} from "../index.js";
import type {
	IVaultMetaService,
	VaultEntity,
} from "../vaultMetaService/index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IIntrinsicApyService } from "../../intrinsicApyService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";
import type {
	DataIssue,
	ServiceResult,
} from "../../../utils/entityDiagnostics.js";
import {
	compressDataIssues,
	dataIssueLocation,
	replaceDataIssueLocations,
	vaultCollateralDiagnosticOwner,
	vaultDiagnosticOwner,
	withPathPrefix,
} from "../../../utils/entityDiagnostics.js";

export interface IEVaultAdapter {
	fetchVaults(
		chainId: number,
		vault: Address[],
	): Promise<ServiceResult<(IEVault | undefined)[]>>;
	fetchAllVaults(
		chainId: number,
	): Promise<ServiceResult<(IEVault | undefined)[]>>;
	fetchVerifiedVaultsAddresses(
		chainId: number,
		perspectives: Address[],
	): Promise<Address[]>;
}

export enum StandardEVaultPerspectives {
	GOVERNED = "governedPerspective",
	FACTORY = "evkFactoryPerspective",
	EDGE = "edgeFactoryPerspective",
	ESCROW = "escrowedCollateralPerspective",
}

export interface EVaultFetchOptions {
	/** When true, enables all supported populate steps and overrides granular populate flags. */
	populateAll?: boolean;
	populateCollaterals?: boolean;
	populateMarketPrices?: boolean;
	populateRewards?: boolean;
	populateIntrinsicApy?: boolean;
	populateLabels?: boolean;
}

export interface IEVaultService
	extends IVaultService<EVault, StandardEVaultPerspectives> {
	fetchVault(
		chainId: number,
		vault: Address,
		options?: EVaultFetchOptions,
	): Promise<ServiceResult<EVault | undefined>>;
	fetchVaults(
		chainId: number,
		vaults: Address[],
		options?: EVaultFetchOptions,
	): Promise<ServiceResult<(EVault | undefined)[]>>;
	/**
	 * Fetches all discoverable EVaults.
	 * The optional async `filter` runs after the first fetch and before populate/enrichment work,
	 * so rejected vaults are skipped before additional resources are spent on them.
	 */
	fetchAllVaults(
		chainId: number,
		args?: FetchAllVaultsArgs<EVault, EVaultFetchOptions>,
	): Promise<ServiceResult<(EVault | undefined)[]>>;
	populateCollaterals(eVaults: EVault[]): Promise<DataIssue[]>;
	populateMarketPrices(eVaults: EVault[]): Promise<DataIssue[]>;
	populateRewards(eVaults: EVault[]): Promise<DataIssue[]>;
	populateIntrinsicApy(eVaults: EVault[]): Promise<DataIssue[]>;
	populateLabels(eVaults: EVault[]): Promise<DataIssue[]>;
}

export class EVaultService implements IEVaultService {
	private vaultMetaService?: IVaultMetaService;
	private priceService?: IPriceService;
	private rewardsService?: IRewardsService;
	private intrinsicApyService?: IIntrinsicApyService;
	private eulerLabelsService?: IEulerLabelsService;

	constructor(
		private adapter: IEVaultAdapter,
		private deploymentService: DeploymentService,
	) {}

	setAdapter(adapter: IEVaultAdapter): void {
		this.adapter = adapter;
	}

	setVaultMetaService(service: IVaultMetaService): void {
		this.vaultMetaService = service;
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
			.eVaultFactory;
	}

	async fetchVault(
		chainId: number,
		vault: Address,
		options?: EVaultFetchOptions,
	): Promise<ServiceResult<EVault | undefined>> {
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
				source: "eVaultService",
				originalValue: getAddress(vault),
			});
		}
		return { result, errors: compressDataIssues(errors) };
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
		options?: EVaultFetchOptions,
	): Promise<ServiceResult<(EVault | undefined)[]>> {
		const fetched = await this.adapter.fetchVaults(chainId, vaults);
		return this.hydrateFetchedVaults(
			fetched,
			this.resolveFetchOptions(options),
		);
	}

	async fetchAllVaults(
		chainId: number,
		args?: FetchAllVaultsArgs<EVault, EVaultFetchOptions>,
	): Promise<ServiceResult<(EVault | undefined)[]>> {
		const fetched = await this.adapter.fetchAllVaults(chainId);
		return this.hydrateFetchedVaults(
			fetched,
			this.resolveFetchOptions(args?.options),
			args?.filter,
		);
	}

	private async hydrateFetchedVaults(
		fetched: ServiceResult<(IEVault | undefined)[]>,
		resolvedOptions: EVaultFetchOptions,
		filter?: VaultFilter<EVault>,
	): Promise<ServiceResult<(EVault | undefined)[]>> {
		const errors: DataIssue[] = [...fetched.errors];
		const eVaults = fetched.result.map((vault) =>
			vault ? new EVault(vault) : undefined,
		);
		const included = filter
			? await Promise.all(
					eVaults.map(async (vault) => (vault ? await filter(vault) : false)),
				)
			: eVaults.map((vault) => vault !== undefined);
		const result = eVaults.map((vault, index) =>
			vault && included[index] ? vault : undefined,
		);
		const resolvedVaults = result.filter(
			(vault): vault is EVault => vault !== undefined,
		);

		if (resolvedOptions.populateCollaterals) {
			errors.push(...(await this.populateCollaterals(resolvedVaults)));
		}
		await Promise.all([
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

	async populateCollaterals(eVaults: EVault[]): Promise<DataIssue[]> {
		if (!this.vaultMetaService || eVaults.length === 0) return [];
		const errors: DataIssue[] = [];

		const occurrencesByAddress = new Map<
			string,
			Array<{ vaultIndex: number; collateralIndex: number }>
		>();

		eVaults.forEach((eVault, vaultIndex) => {
			eVault.collaterals.forEach((collateral, collateralIndex) => {
				const key = collateral.address.toLowerCase();
				const list = occurrencesByAddress.get(key) ?? [];
				list.push({ vaultIndex, collateralIndex });
				occurrencesByAddress.set(key, list);
			});
		});

		const allCollateralAddresses = [...occurrencesByAddress.keys()].map(
			(address) => getAddress(address),
		);

		if (allCollateralAddresses.length === 0) {
			for (const eVault of eVaults) {
				eVault.populated.collaterals = true;
			}
			return errors;
		}

		const chainId = eVaults[0]!.chainId;
		let collateralVaults: (VaultEntity | undefined)[];

		try {
			const fetched = await this.vaultMetaService.fetchVaults(
				chainId,
				allCollateralAddresses,
			);
			collateralVaults = fetched.result;

			for (const issue of fetched.errors) {
				let mapped = false;
				for (const location of issue.locations) {
					if (location.owner.kind !== "vault") continue;
					const address = location.owner.address;
					const occurrences =
						occurrencesByAddress
							.get(address.toLowerCase())
							?.map((occurrence) => ({ address, occurrence })) ?? [];
					for (const { address, occurrence } of occurrences) {
						const parentVault = eVaults[occurrence.vaultIndex];
						if (!parentVault) continue;
						mapped = true;
						errors.push(
							replaceDataIssueLocations(
								issue,
								issue.locations.flatMap((location) => {
									if (location.owner.kind !== "vault") return [location];
									if (
										location.owner.address.toLowerCase() !==
										address.toLowerCase()
									) {
										return [];
									}
									return [
										{
											owner: vaultCollateralDiagnosticOwner(
												chainId,
												parentVault.address,
												address,
											),
											path: withPathPrefix(location.path, "$.vault"),
										},
									];
								}),
							),
						);
					}
				}
				if (!mapped) errors.push(issue);
			}
		} catch (error) {
			collateralVaults = allCollateralAddresses.map(() => undefined);

			for (const addr of allCollateralAddresses) {
				const occurrences = occurrencesByAddress.get(addr.toLowerCase()) ?? [];
				for (const occurrence of occurrences) {
					errors.push({
						code: "SOURCE_UNAVAILABLE",
						severity: "warning",
						message: `Failed to fetch collateral vault ${getAddress(addr)}.`,
						locations: [
							dataIssueLocation(
								vaultCollateralDiagnosticOwner(
									chainId,
									eVaults[occurrence.vaultIndex]?.address ?? getAddress(addr),
									getAddress(addr),
								),
								"$.vault",
							),
						],
						source: "vaultMetaService",
						originalValue:
							error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		const vaultByAddress = new Map(
			collateralVaults
				.filter((v) => v !== undefined)
				.map((v) => [(v as { address: Address }).address.toLowerCase(), v]),
		);

		for (const eVault of eVaults) {
			for (const collateral of eVault.collaterals) {
				collateral.vault = vaultByAddress.get(collateral.address.toLowerCase());
				if (!collateral.vault) {
					collateral.oracleAdapters = [];
					continue;
				}

				if (!eVault.unitOfAccount) {
					collateral.oracleAdapters = [];
					continue;
				}

				const quoteAddress = eVault.unitOfAccount.address;
				const byAsset = selectLeafAdaptersForPair(
					eVault.oracle.adapters,
					collateral.vault.asset.address,
					quoteAddress,
				);
				const byVault = selectLeafAdaptersForPair(
					eVault.oracle.adapters,
					collateral.address,
					quoteAddress,
				);
				const deduped = new Map<string, (typeof byAsset)[number]>();
				[...byAsset, ...byVault].forEach((adapter) => {
					const key = `${adapter.oracle.toLowerCase()}:${adapter.base.toLowerCase()}:${adapter.quote.toLowerCase()}`;
					if (!deduped.has(key)) deduped.set(key, adapter);
				});
				collateral.oracleAdapters = sortOracleAdapters([...deduped.values()]);
			}
			eVault.populated.collaterals = true;
		}
		return errors;
	}

	async populateMarketPrices(eVaults: EVault[]): Promise<DataIssue[]> {
		if (!this.priceService || eVaults.length === 0) return [];
		const errors: DataIssue[] = [];

		await Promise.all(
			eVaults.map(async (eVault) => {
				// Vault asset USD price
				try {
					const priced =
						await this.priceService!.fetchAssetUsdPriceWithDiagnostics(
							eVault,
							"$.marketPriceUsd",
						);
					eVault.marketPriceUsd = priced.result?.amountOutMid;
					errors.push(...priced.errors);
				} catch (error) {
					errors.push({
						code: "SOURCE_UNAVAILABLE",
						severity: "warning",
						message: "Failed to populate asset market price.",
						locations: [
							dataIssueLocation(
								vaultDiagnosticOwner(eVault.chainId, eVault.address),
								"$.marketPriceUsd",
							),
						],
						source: "priceService",
						originalValue:
							error instanceof Error ? error.message : String(error),
					});
					eVault.marketPriceUsd = undefined;
				}

				// Collateral USD prices (requires resolved vault)
				await Promise.all(
					eVault.collaterals.map(async (collateral) => {
						if (!collateral.vault) return;
						try {
							const priced =
								await this.priceService!.fetchCollateralUsdPriceWithDiagnostics(
									eVault,
									collateral.vault,
									"$.marketPriceUsd",
								);
							collateral.marketPriceUsd = priced.result?.amountOutMid;
							errors.push(...priced.errors);
						} catch (error) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message: "Failed to populate collateral market price.",
								locations: [
									dataIssueLocation(
										vaultCollateralDiagnosticOwner(
											eVault.chainId,
											eVault.address,
											collateral.address,
										),
										"$.marketPriceUsd",
									),
								],
								source: "priceService",
								originalValue:
									error instanceof Error ? error.message : String(error),
							});
							collateral.marketPriceUsd = undefined;
						}
					}),
				);
				eVault.populated.marketPrices = true;
			}),
		);
		return errors;
	}

	async populateRewards(eVaults: EVault[]): Promise<DataIssue[]> {
		if (!this.rewardsService || eVaults.length === 0) return [];
		try {
			await this.rewardsService.populateRewards(eVaults);
			return [];
		} catch (error) {
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "Failed to populate rewards.",
					locations: eVaults.map((vault) =>
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

	async populateIntrinsicApy(eVaults: EVault[]): Promise<DataIssue[]> {
		if (!this.intrinsicApyService || eVaults.length === 0) return [];
		try {
			await this.intrinsicApyService.populateIntrinsicApy(eVaults);
			return [];
		} catch (error) {
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "Failed to populate intrinsic APY.",
					locations: eVaults.map((vault) =>
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

	async populateLabels(eVaults: EVault[]): Promise<DataIssue[]> {
		if (!this.eulerLabelsService || eVaults.length === 0) return [];
		try {
			await this.eulerLabelsService.populateLabels(eVaults);
			return [];
		} catch (error) {
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "warning",
					message: "Failed to populate labels.",
					locations: eVaults.map((vault) =>
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
		perspectives: (StandardEVaultPerspectives | Address)[],
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
					perspective as StandardEVaultPerspectives
				]
			) {
				throw new Error(`Perspective address not found for ${perspective}`);
			}

			return deployment.addresses.peripheryAddrs[
				perspective as StandardEVaultPerspectives
			] as Address;
		});
		return this.adapter.fetchVerifiedVaultsAddresses(
			chainId,
			perspectiveAddresses,
		);
	}

	async fetchVerifiedVaults(
		chainId: number,
		perspectives: (StandardEVaultPerspectives | Address)[],
		options?: EVaultFetchOptions,
	): Promise<ServiceResult<(EVault | undefined)[]>> {
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
		options?: EVaultFetchOptions,
	): EVaultFetchOptions {
		if (!options?.populateAll) return options ?? {};
		return {
			...options,
			populateCollaterals: true,
			populateMarketPrices: true,
			populateRewards: true,
			populateIntrinsicApy: true,
			populateLabels: true,
		};
	}
}
