import { getAddress, type Address } from "viem";
import { EVault, type IEVault } from "../../../entities/EVault.js";
import { selectLeafAdaptersForPair } from "../../../utils/oracle.js";
import type { DeploymentService } from "../../deploymentService/index.js";
import type {
	FetchAllVaultsArgs,
	IVaultService,
	VaultFilter,
} from "../index.js";
import type { IVaultMetaService, VaultEntity } from "../vaultMetaService/index.js";
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
	mapDataIssuePaths,
	normalizeTopLevelVaultArrayPath,
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
	populateCollaterals(
		eVaults: EVault[],
		getVaultPathPrefix?: (vaultIndex: number) => string,
	): Promise<DataIssue[]>;
	populateMarketPrices(
		eVaults: EVault[],
		getVaultPathPrefix?: (vaultIndex: number) => string,
	): Promise<DataIssue[]>;
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
		const errors = fetched.errors.map((issue) =>
			mapDataIssuePaths(issue, normalizeTopLevelVaultArrayPath),
		);
		if (result === undefined) {
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "error",
				message: `Vault not found for ${getAddress(vault)}.`,
				paths: ["$"],
				entityId: getAddress(vault),
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
			errors.push(
				...(await this.populateCollaterals(
					resolvedVaults,
					(vaultIndex) => `$.eVaults[${vaultIndex}]`,
				)),
			);
		}
		await Promise.all([
			(async () => {
				if (resolvedOptions.populateMarketPrices) {
					errors.push(
						...(await this.populateMarketPrices(
							resolvedVaults,
							(vaultIndex) => `$.eVaults[${vaultIndex}]`,
						)),
					);
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

	async populateCollaterals(
		eVaults: EVault[],
		getVaultPathPrefix: (vaultIndex: number) => string = (vaultIndex) =>
			`$.eVaults[${vaultIndex}]`,
	): Promise<DataIssue[]> {
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
		const collateralPathPrefix = (
			vaultIndex: number,
			collateralIndex: number,
		) => `${getVaultPathPrefix(vaultIndex)}.collaterals[${collateralIndex}].vault`;
		const remapCollateralPath = (
			path: string,
			vaultIndex: number,
			collateralIndex: number,
		) => {
			const prefix = collateralPathPrefix(vaultIndex, collateralIndex);
			return path.replace(/^\$\.vaults\[\d+\]/, prefix);
		};

		let collateralVaults: (VaultEntity | undefined)[];

		try {
			const fetched = await this.vaultMetaService.fetchVaults(
				chainId,
				allCollateralAddresses,
			);
			collateralVaults = fetched.result;

			for (const issue of fetched.errors) {
				const issueOccurrences = issue.paths.flatMap((path) => {
					const match = path.match(/^\$\.vaults\[(\d+)\]/);
					if (!match) return [];

					const index = Number(match[1]);
					const address = allCollateralAddresses[index];
					if (!address) return [];

					return (
						occurrencesByAddress.get(address.toLowerCase())?.map((occurrence) => ({
							address,
							occurrence,
						})) ?? []
					);
				});

				if (issueOccurrences.length === 0) {
					errors.push(issue);
					continue;
				}

				for (const { address, occurrence } of issueOccurrences) {
					errors.push({
						...mapDataIssuePaths(issue, (path) =>
							remapCollateralPath(
								path,
								occurrence.vaultIndex,
								occurrence.collateralIndex,
							),
						),
						entityId: issue.entityId ?? getAddress(address),
					});
				}
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
						paths: [
							collateralPathPrefix(
								occurrence.vaultIndex,
								occurrence.collateralIndex,
							),
						],
						entityId: getAddress(addr),
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

				const collateralAsset = collateral.vault.asset.address;
				const collateralVault = collateral.address;
				const quote = eVault.unitOfAccount.address;
				const byAsset = selectLeafAdaptersForPair(
					eVault.oracle.adapters,
					collateralAsset,
					quote,
				);
				const byVault = selectLeafAdaptersForPair(
					eVault.oracle.adapters,
					collateralVault,
					quote,
				);
				const deduped = new Map<string, (typeof byAsset)[number]>();
				[...byAsset, ...byVault].forEach((adapter) => {
					const key = `${adapter.oracle.toLowerCase()}:${adapter.base.toLowerCase()}:${adapter.quote.toLowerCase()}`;
					if (!deduped.has(key)) deduped.set(key, adapter);
				});
				collateral.oracleAdapters = [...deduped.values()];
			}
			eVault.populated.collaterals = true;
		}
		return errors;
	}

	async populateMarketPrices(
		eVaults: EVault[],
		getVaultPathPrefix: (vaultIndex: number) => string = (vaultIndex) =>
			`$.eVaults[${vaultIndex}]`,
	): Promise<DataIssue[]> {
		if (!this.priceService || eVaults.length === 0) return [];
		const errors: DataIssue[] = [];

		await Promise.all(
			eVaults.map(async (eVault, vaultIndex) => {
				const vaultPath = getVaultPathPrefix(vaultIndex);
				// Vault asset USD price
				try {
					const priced =
						await this.priceService!.fetchAssetUsdPriceWithDiagnostics(
							eVault,
							`${vaultPath}.marketPriceUsd`,
						);
					eVault.marketPriceUsd = priced.result?.amountOutMid;
					errors.push(...priced.errors);
				} catch (error) {
					errors.push({
						code: "SOURCE_UNAVAILABLE",
						severity: "warning",
						message: "Failed to populate asset market price.",
						paths: [`${vaultPath}.marketPriceUsd`],
						entityId: eVault.asset.address,
						source: "priceService",
						originalValue:
							error instanceof Error ? error.message : String(error),
					});
					eVault.marketPriceUsd = undefined;
				}

				// Collateral USD prices (requires resolved vault)
				await Promise.all(
					eVault.collaterals.map(async (collateral, collateralIndex) => {
						if (!collateral.vault) return;
						try {
							const priced =
								await this.priceService!.fetchCollateralUsdPriceWithDiagnostics(
									eVault,
									collateral.vault,
									`${vaultPath}.collaterals[${collateralIndex}].marketPriceUsd`,
								);
							collateral.marketPriceUsd = priced.result?.amountOutMid;
							errors.push(...priced.errors);
						} catch (error) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message: "Failed to populate collateral market price.",
								paths: [
									`${vaultPath}.collaterals[${collateralIndex}].marketPriceUsd`,
								],
								entityId: collateral.vault?.asset.address ?? collateral.address,
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
					paths: ["$"],
					entityId: eVaults[0]?.address,
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
					paths: ["$"],
					entityId: eVaults[0]?.address,
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
					paths: ["$"],
					entityId: eVaults[0]?.address,
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
			errors: compressDataIssues(
				fetched.errors.map((issue) =>
					mapDataIssuePaths(issue, normalizeTopLevelVaultArrayPath),
				),
			),
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
