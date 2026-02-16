import { EulerEarn, IEulerEarn } from "../../../entities/EulerEarn.js";
import { Address } from "viem";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService } from "../index.js";
import type { IEVaultService, EVaultFetchOptions } from "../eVaultService/index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";

export interface IEulerEarnDataSource {
  fetchVaults(chainId: number, vault: Address[]): Promise<IEulerEarn[]>;
  fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]>;
}

export enum StandardEulerEarnPerspectives {
  GOVERNED = "eulerEarnGovernedPerspective",
  FACTORY = "eulerEarnFactoryPerspective",
}

export interface EulerEarnFetchOptions {
  populateStrategyVaults?: boolean;
  populateMarketPrices?: boolean;
  populateRewards?: boolean;
  populateLabels?: boolean;
  /** Options forwarded to EVaultService when populating strategy vaults. */
  eVaultFetchOptions?: EVaultFetchOptions;
}

export interface IEulerEarnService
  extends IVaultService<EulerEarn, StandardEulerEarnPerspectives> {
  fetchVault(chainId: number, vault: Address, options?: EulerEarnFetchOptions): Promise<EulerEarn>;
  fetchVaults(chainId: number, vaults: Address[], options?: EulerEarnFetchOptions): Promise<EulerEarn[]>;
  populateStrategyVaults(eulerEarns: EulerEarn[], eVaultFetchOptions?: EVaultFetchOptions): Promise<void>;
  populateMarketPrices(eulerEarns: EulerEarn[]): Promise<void>;
  populateRewards(eulerEarns: EulerEarn[]): Promise<void>;
  populateLabels(eulerEarns: EulerEarn[]): Promise<void>;
}

export class EulerEarnService implements IEulerEarnService {
  private priceService?: IPriceService;
  private rewardsService?: IRewardsService;
  private eulerLabelsService?: IEulerLabelsService;

  constructor(
    private dataSource: IEulerEarnDataSource,
    private deploymentService: DeploymentService,
    private eVaultService?: IEVaultService
  ) {}

  setDataSource(dataSource: IEulerEarnDataSource): void {
    this.dataSource = dataSource;
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

  setEulerLabelsService(service: IEulerLabelsService): void {
    this.eulerLabelsService = service;
  }

  factory(chainId: number): Address {
    return this.deploymentService.getDeployment(chainId).addresses.coreAddrs
      .eulerEarnFactory;
  }

  async fetchVault(chainId: number, vault: Address, options?: EulerEarnFetchOptions): Promise<EulerEarn> {
    const vaults = await this.dataSource.fetchVaults(chainId, [vault]);
    if (vaults.length === 0) {
      throw new Error(`Vault not found for ${vault}`);
    }
    const eulerEarn = new EulerEarn(vaults[0]!);
    if (options?.populateStrategyVaults) {
      await this.populateStrategyVaults([eulerEarn], options?.eVaultFetchOptions);
    }
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices([eulerEarn]);
    }
    if (options?.populateRewards) {
      await this.populateRewards([eulerEarn]);
    }
    if (options?.populateLabels) {
      await this.populateLabels([eulerEarn]);
    }
    return eulerEarn;
  }

  async fetchVaults(chainId: number, vaults: Address[], options?: EulerEarnFetchOptions): Promise<EulerEarn[]> {
    const eulerEarns = (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (vault) => new EulerEarn(vault)
    );
    if (options?.populateStrategyVaults) {
      await this.populateStrategyVaults(eulerEarns, options?.eVaultFetchOptions);
    }
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices(eulerEarns);
    }
    if (options?.populateRewards) {
      await this.populateRewards(eulerEarns);
    }
    if (options?.populateLabels) {
      await this.populateLabels(eulerEarns);
    }
    return eulerEarns;
  }

  async populateStrategyVaults(
    eulerEarns: EulerEarn[],
    eVaultFetchOptions?: EVaultFetchOptions
  ): Promise<void> {
    if (!this.eVaultService || eulerEarns.length === 0) return;

    const allStrategyAddresses = [
      ...new Set(
        eulerEarns.flatMap((ee) => ee.strategies.map((s) => s.address))
      ),
    ];

    if (allStrategyAddresses.length === 0) return;

    const chainId = eulerEarns[0]!.chainId;
    const eVaults = await Promise.all(
      allStrategyAddresses.map((addr) =>
        this.eVaultService!.fetchVault(chainId, addr, eVaultFetchOptions).catch(() => undefined)
      )
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
  }

  async populateMarketPrices(
    eulerEarns: EulerEarn[]
  ): Promise<void> {
    if (!this.priceService || eulerEarns.length === 0) return;

    await Promise.all(
      eulerEarns.map(async (ee) => {
        ee.marketPriceUsd = await ee
          .fetchAssetMarketPriceUsd(this.priceService!)
          .catch(() => undefined);
      })
    );
  }

  async populateRewards(eulerEarns: EulerEarn[]): Promise<void> {
    if (!this.rewardsService || eulerEarns.length === 0) return;
    await this.rewardsService.populateRewards(eulerEarns);
  }

  async populateLabels(eulerEarns: EulerEarn[]): Promise<void> {
    if (!this.eulerLabelsService || eulerEarns.length === 0) return;
    await this.eulerLabelsService.populateLabels(eulerEarns);
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
    return this.dataSource.fetchVerifiedVaultsAddresses(
      chainId,
      perspectiveAddresses
    );
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardEulerEarnPerspectives | Address)[],
    options?: EulerEarnFetchOptions
  ): Promise<EulerEarn[]> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses, options);
  }
}
