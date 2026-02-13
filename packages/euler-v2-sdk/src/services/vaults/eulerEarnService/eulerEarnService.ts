import { EulerEarn, IEulerEarn } from "../../../entities/EulerEarn.js";
import { Address } from "viem";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService } from "../index.js";
import type { IEVaultService } from "../eVaultService/index.js";
import type { IPriceService } from "../../priceService/index.js";

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
  /** Level 2: when populating strategy vaults, also resolve their collaterals. */
  populateCollaterals?: boolean;
}

export interface IEulerEarnService
  extends IVaultService<EulerEarn, StandardEulerEarnPerspectives> {
  fetchVault(chainId: number, vault: Address, options?: EulerEarnFetchOptions): Promise<EulerEarn>;
  fetchVaults(chainId: number, vaults: Address[], options?: EulerEarnFetchOptions): Promise<EulerEarn[]>;
  populateStrategyVaults(eulerEarns: EulerEarn[], options?: { populateCollaterals?: boolean }): Promise<void>;
  populateMarketPrices(eulerEarns: EulerEarn[]): Promise<void>;
}

export class EulerEarnService implements IEulerEarnService {
  private priceService?: IPriceService;

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
      await this.populateStrategyVaults([eulerEarn], { populateCollaterals: options?.populateCollaterals });
    }
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices([eulerEarn]);
    }
    return eulerEarn;
  }

  async fetchVaults(chainId: number, vaults: Address[], options?: EulerEarnFetchOptions): Promise<EulerEarn[]> {
    const eulerEarns = (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (vault) => new EulerEarn(vault)
    );
    if (options?.populateStrategyVaults) {
      await this.populateStrategyVaults(eulerEarns, { populateCollaterals: options?.populateCollaterals });
    }
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices(eulerEarns);
    }
    return eulerEarns;
  }

  async populateStrategyVaults(
    eulerEarns: EulerEarn[],
    options?: { populateCollaterals?: boolean }
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
        this.eVaultService!.fetchVault(chainId, addr, {
          populateCollaterals: options?.populateCollaterals,
        }).catch(() => undefined)
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
