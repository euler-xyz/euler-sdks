import { EulerEarn, IEulerEarn } from "../../../entities/EulerEarn.js";
import { Address } from "viem";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService } from "../index.js";
import type { IEVaultService, EVaultFetchOptions } from "../eVaultService/index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IIntrinsicApyService } from "../../intrinsicApyService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";
import type { DataIssue, ServiceResult } from "../../../utils/entityDiagnostics.js";
import { withPathPrefix } from "../../../utils/entityDiagnostics.js";

export interface IEulerEarnAdapter {
  fetchVaults(chainId: number, vault: Address[]): Promise<ServiceResult<IEulerEarn[]>>;
  fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]>;
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
    options?: EulerEarnFetchOptions
  ): Promise<ServiceResult<EulerEarn>>;
  fetchVaults(
    chainId: number,
    vaults: Address[],
    options?: EulerEarnFetchOptions
  ): Promise<ServiceResult<EulerEarn[]>>;
  populateStrategyVaults(
    eulerEarns: EulerEarn[],
    eVaultFetchOptions?: EVaultFetchOptions
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

  constructor(
    private adapter: IEulerEarnAdapter,
    private deploymentService: DeploymentService,
    private eVaultService?: IEVaultService
  ) {}

  setAdapter(adapter: IEulerEarnAdapter): void {
    this.adapter = adapter;
  }

  setDeploymentService(deploymentService: DeploymentService): void {
    this.deploymentService = deploymentService;
  }

  setEVaultService(eVaultService: IEVaultService): void {
    this.eVaultService = eVaultService;
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
    options?: EulerEarnFetchOptions
  ): Promise<ServiceResult<EulerEarn>> {
    const resolvedOptions = this.resolveFetchOptions(options);
    const fetched = await this.adapter.fetchVaults(chainId, [vault]);
    const errors: DataIssue[] = [...fetched.errors];
    if (fetched.result.length === 0) {
      throw new Error(`Vault not found for ${vault}`);
    }
    const eulerEarn = new EulerEarn(fetched.result[0]!);
    if (resolvedOptions.populateStrategyVaults) {
      errors.push(...(await this.populateStrategyVaults([eulerEarn], resolvedOptions.eVaultFetchOptions)));
    }
    if (resolvedOptions.populateMarketPrices) {
      errors.push(...(await this.populateMarketPrices([eulerEarn])));
    }
    if (resolvedOptions.populateRewards) {
      errors.push(...(await this.populateRewards([eulerEarn])));
    }
    if (resolvedOptions.populateIntrinsicApy) {
      errors.push(...(await this.populateIntrinsicApy([eulerEarn])));
    }
    if (resolvedOptions.populateLabels) {
      errors.push(...(await this.populateLabels([eulerEarn])));
    }
    return { result: eulerEarn, errors };
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[],
    options?: EulerEarnFetchOptions
  ): Promise<ServiceResult<EulerEarn[]>> {
    const resolvedOptions = this.resolveFetchOptions(options);
    const fetched = await this.adapter.fetchVaults(chainId, vaults);
    const errors: DataIssue[] = [...fetched.errors];
    const eulerEarns = fetched.result.map(
      (vault) => new EulerEarn(vault)
    );
    if (resolvedOptions.populateStrategyVaults) {
      errors.push(...(await this.populateStrategyVaults(eulerEarns, resolvedOptions.eVaultFetchOptions)));
    }
    if (resolvedOptions.populateMarketPrices) {
      errors.push(...(await this.populateMarketPrices(eulerEarns)));
    }
    if (resolvedOptions.populateRewards) {
      errors.push(...(await this.populateRewards(eulerEarns)));
    }
    if (resolvedOptions.populateIntrinsicApy) {
      errors.push(...(await this.populateIntrinsicApy(eulerEarns)));
    }
    if (resolvedOptions.populateLabels) {
      errors.push(...(await this.populateLabels(eulerEarns)));
    }
    return { result: eulerEarns, errors };
  }

  async populateStrategyVaults(
    eulerEarns: EulerEarn[],
    eVaultFetchOptions?: EVaultFetchOptions
  ): Promise<DataIssue[]> {
    if (!this.eVaultService || eulerEarns.length === 0) return [];
    const errors: DataIssue[] = [];

    const allStrategyAddresses = [
      ...new Set(
        eulerEarns.flatMap((ee) => ee.strategies.map((s) => s.address))
      ),
    ];

    if (allStrategyAddresses.length === 0) return errors;

    const chainId = eulerEarns[0]!.chainId;
    const eVaults = await Promise.all(
      allStrategyAddresses.map(async (addr, index) => {
        try {
          const fetched = await this.eVaultService!.fetchVault(chainId, addr, eVaultFetchOptions);
          errors.push(...fetched.errors.map((issue) => ({
            ...issue,
            path: withPathPrefix(issue.path, `$.strategyVaults[${index}]`),
          })));
          return fetched.result;
        } catch (error) {
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: "Failed to fetch strategy vault.",
            path: `$.strategyVaults[${index}]`,
            source: "eVaultService",
            originalValue: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        }
      })
    );

    const eVaultByAddress = new Map(
      eVaults
        .filter((v) => v !== undefined)
        .map((v) => [v.address.toLowerCase(), v])
    );

    for (const ee of eulerEarns) {
      for (const strategy of ee.strategies) {
        strategy.vault = eVaultByAddress.get(strategy.address.toLowerCase());
      }
    }
    return errors;
  }

  async populateMarketPrices(
    eulerEarns: EulerEarn[]
  ): Promise<DataIssue[]> {
    if (!this.priceService || eulerEarns.length === 0) return [];
    const errors: DataIssue[] = [];

    await Promise.all(
      eulerEarns.map(async (ee, index) => {
        try {
          ee.marketPriceUsd = await ee.fetchAssetMarketPriceUsd(this.priceService!);
        } catch (error) {
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: "Failed to populate asset market price.",
            path: `$.eulerEarns[${index}].marketPriceUsd`,
            source: "priceService",
            originalValue: error instanceof Error ? error.message : String(error),
          });
          ee.marketPriceUsd = undefined;
        }
      })
    );
    return errors;
  }

  async populateRewards(eulerEarns: EulerEarn[]): Promise<DataIssue[]> {
    if (!this.rewardsService || eulerEarns.length === 0) return [];
    try {
      await this.rewardsService.populateRewards(eulerEarns);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate rewards.",
        path: "$",
        source: "rewardsService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async populateIntrinsicApy(eulerEarns: EulerEarn[]): Promise<DataIssue[]> {
    if (!this.intrinsicApyService || eulerEarns.length === 0) return [];
    try {
      await this.intrinsicApyService.populateIntrinsicApy(eulerEarns);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate intrinsic APY.",
        path: "$",
        source: "intrinsicApyService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async populateLabels(eulerEarns: EulerEarn[]): Promise<DataIssue[]> {
    if (!this.eulerLabelsService || eulerEarns.length === 0) return [];
    try {
      await this.eulerLabelsService.populateLabels(eulerEarns);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate labels.",
        path: "$",
        source: "eulerLabelsService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async fetchVerifiedVaultAddresses(
    chainId: number,
    perspectives: (StandardEulerEarnPerspectives | Address)[]
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
      perspectiveAddresses
    );
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardEulerEarnPerspectives | Address)[],
    options?: EulerEarnFetchOptions
  ): Promise<ServiceResult<EulerEarn[]>> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses, options);
  }

  private resolveFetchOptions(options?: EulerEarnFetchOptions): EulerEarnFetchOptions {
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
