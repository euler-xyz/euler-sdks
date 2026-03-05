import { getAddress, type Address } from "viem";
import { EVault, IEVault } from "../../../entities/EVault.js";
import { selectLeafAdaptersForPair } from "../../../utils/oracle.js";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService, VaultFetchOptions } from "../index.js";
import type { IVaultMetaService } from "../vaultMetaService/index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IIntrinsicApyService } from "../../intrinsicApyService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";
import type { DataIssue, ServiceResult } from "../../../utils/entityDiagnostics.js";
import { withPathPrefix } from "../../../utils/entityDiagnostics.js";

export interface IEVaultAdapter {
  fetchVaults(chainId: number, vault: Address[]): Promise<ServiceResult<(IEVault | undefined)[]>>;
  fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]>;
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
    options?: EVaultFetchOptions
  ): Promise<ServiceResult<EVault>>;
  fetchVaults(
    chainId: number,
    vaults: Address[],
    options?: EVaultFetchOptions
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
    private deploymentService: DeploymentService
  ) {}

  setAdapter(adapter: IEVaultAdapter): void {
    this.adapter = adapter;
  }

  setDeploymentService(deploymentService: DeploymentService): void {
    this.deploymentService = deploymentService;
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
    options?: EVaultFetchOptions
  ): Promise<ServiceResult<EVault>> {
    const resolvedOptions = this.resolveFetchOptions(options);
    const fetched = await this.adapter.fetchVaults(chainId, [vault]);
    const errors: DataIssue[] = [...fetched.errors];
    const fetchedVault = fetched.result[0];
    if (!fetchedVault) {
      throw new Error(`Vault not found for ${vault}`);
    }
    const eVault = new EVault(fetchedVault);

    if (resolvedOptions.populateCollaterals) {
      errors.push(...(await this.populateCollaterals([eVault])));
    }
    if (resolvedOptions.populateMarketPrices) {
      errors.push(...(await this.populateMarketPrices([eVault])));
    }
    if (resolvedOptions.populateRewards) {
      errors.push(...(await this.populateRewards([eVault])));
    }
    if (resolvedOptions.populateIntrinsicApy) {
      errors.push(...(await this.populateIntrinsicApy([eVault])));
    }
    if (resolvedOptions.populateLabels) {
      errors.push(...(await this.populateLabels([eVault])));
    }
    return { result: eVault, errors };
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[],
    options?: EVaultFetchOptions
  ): Promise<ServiceResult<(EVault | undefined)[]>> {
    const resolvedOptions = this.resolveFetchOptions(options);
    const fetched = await this.adapter.fetchVaults(chainId, vaults);
    const errors: DataIssue[] = [...fetched.errors];
    const eVaults = fetched.result.map((vault) =>
      vault ? new EVault(vault) : undefined
    );
    const resolvedVaults = eVaults.filter((vault): vault is EVault => vault !== undefined);

    if (resolvedOptions.populateCollaterals) {
      errors.push(...(await this.populateCollaterals(resolvedVaults)));
    }
    if (resolvedOptions.populateMarketPrices) {
      errors.push(...(await this.populateMarketPrices(resolvedVaults)));
    }
    if (resolvedOptions.populateRewards) {
      errors.push(...(await this.populateRewards(resolvedVaults)));
    }
    if (resolvedOptions.populateIntrinsicApy) {
      errors.push(...(await this.populateIntrinsicApy(resolvedVaults)));
    }
    if (resolvedOptions.populateLabels) {
      errors.push(...(await this.populateLabels(resolvedVaults)));
    }
    return { result: eVaults, errors };
  }

  async populateCollaterals(eVaults: EVault[]): Promise<DataIssue[]> {
    if (!this.vaultMetaService || eVaults.length === 0) return [];
    const errors: DataIssue[] = [];

    const allCollateralAddresses = [
      ...new Set(
        eVaults.flatMap((v) => v.collaterals.map((c) => c.address))
      ),
    ];

    if (allCollateralAddresses.length === 0) return errors;

    const chainId = eVaults[0]!.chainId;
    const collateralVaults = await Promise.all(
      allCollateralAddresses.map(async (addr, index) => {
        try {
          const fetched = await this.vaultMetaService!.fetchVault(chainId, addr);
          errors.push(...fetched.errors.map((issue) => ({
            ...issue,
            path: withPathPrefix(issue.path, `$.collateralVaults[${index}]`),
            entityId: issue.entityId ?? getAddress(addr),
          })));
          return fetched.result;
        } catch (error) {
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: `Failed to fetch collateral vault ${getAddress(addr)}.`,
            path: `$.collateralVaults[${index}]`,
            entityId: getAddress(addr),
            source: "vaultMetaService",
            originalValue: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        }
      })
    );

    const vaultByAddress = new Map(
      collateralVaults
        .filter((v) => v !== undefined)
        .map((v) => [(v as { address: Address }).address.toLowerCase(), v])
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
    }
    return errors;
  }

  async populateMarketPrices(eVaults: EVault[]): Promise<DataIssue[]> {
    if (!this.priceService || eVaults.length === 0) return [];
    const errors: DataIssue[] = [];

    await Promise.all(
      eVaults.map(async (eVault, vaultIndex) => {
        // Vault asset USD price
        try {
          const priced = await this.priceService!.getAssetUsdPriceWithDiagnostics(
            eVault,
            `$.eVaults[${vaultIndex}].marketPriceUsd`
          );
          eVault.marketPriceUsd = priced.result?.amountOutMid;
          errors.push(...priced.errors);
        } catch (error) {
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: "Failed to populate asset market price.",
            path: `$.eVaults[${vaultIndex}].marketPriceUsd`,
            entityId: eVault.asset.address,
            source: "priceService",
            originalValue: error instanceof Error ? error.message : String(error),
          });
          eVault.marketPriceUsd = undefined;
        }

        // Collateral USD prices (requires resolved vault)
        await Promise.all(
          eVault.collaterals.map(async (collateral, collateralIndex) => {
            if (!collateral.vault) return;
            try {
              const priced = await this.priceService!.getCollateralUsdPriceWithDiagnostics(
                eVault,
                collateral.vault,
                `$.eVaults[${vaultIndex}].collaterals[${collateralIndex}].marketPriceUsd`
              );
              collateral.marketPriceUsd = priced.result?.amountOutMid;
              errors.push(...priced.errors);
            } catch (error) {
              errors.push({
                code: "SOURCE_UNAVAILABLE",
                severity: "warning",
                message: "Failed to populate collateral market price.",
                path: `$.eVaults[${vaultIndex}].collaterals[${collateralIndex}].marketPriceUsd`,
                entityId: collateral.vault?.asset.address ?? collateral.address,
                source: "priceService",
                originalValue: error instanceof Error ? error.message : String(error),
              });
              collateral.marketPriceUsd = undefined;
            }
          })
        );
      })
    );
    return errors;
  }

  async populateRewards(eVaults: EVault[]): Promise<DataIssue[]> {
    if (!this.rewardsService || eVaults.length === 0) return [];
    try {
      await this.rewardsService.populateRewards(eVaults);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate rewards.",
        path: "$",
        entityId: eVaults[0]?.address,
        source: "rewardsService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async populateIntrinsicApy(eVaults: EVault[]): Promise<DataIssue[]> {
    if (!this.intrinsicApyService || eVaults.length === 0) return [];
    try {
      await this.intrinsicApyService.populateIntrinsicApy(eVaults);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate intrinsic APY.",
        path: "$",
        entityId: eVaults[0]?.address,
        source: "intrinsicApyService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async populateLabels(eVaults: EVault[]): Promise<DataIssue[]> {
    if (!this.eulerLabelsService || eVaults.length === 0) return [];
    try {
      await this.eulerLabelsService.populateLabels(eVaults);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate labels.",
        path: "$",
        entityId: eVaults[0]?.address,
        source: "eulerLabelsService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async fetchVerifiedVaultAddresses(
    chainId: number,
    perspectives: (StandardEVaultPerspectives | Address)[]
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
      perspectiveAddresses
    );
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardEVaultPerspectives | Address)[],
    options?: EVaultFetchOptions
  ): Promise<ServiceResult<(EVault | undefined)[]>> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses, options);
  }

  private resolveFetchOptions(options?: EVaultFetchOptions): EVaultFetchOptions {
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
