import { Address, getAddress } from "viem";
import {
  SecuritizeCollateralVault,
  ISecuritizeCollateralVault,
} from "../../../entities/SecuritizeCollateralVault.js";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService, VaultFetchOptions } from "../index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";

export interface ISecuritizeCollateralDataSource {
  fetchVaults(
    chainId: number,
    vault: Address[]
  ): Promise<ISecuritizeCollateralVault[]>;
  fetchVerifiedVaultsAddresses(
    chainId: number,
    perspectives: Address[]
  ): Promise<Address[]>;
}

/** No standard perspectives for Securitize collateral vaults; use fetchVault(s) with known addresses. */
export type StandardSecuritizeCollateralPerspectives = never;

export interface ISecuritizeVaultService
  extends IVaultService<
    SecuritizeCollateralVault,
    StandardSecuritizeCollateralPerspectives | Address
  > {
  populateMarketPrices(vaults: SecuritizeCollateralVault[]): Promise<void>;
  populateRewards(vaults: SecuritizeCollateralVault[]): Promise<void>;
  populateLabels(vaults: SecuritizeCollateralVault[]): Promise<void>;
}

export class SecuritizeVaultService implements ISecuritizeVaultService {
  private priceService?: IPriceService;
  private rewardsService?: IRewardsService;
  private eulerLabelsService?: IEulerLabelsService;

  constructor(
    private dataSource: ISecuritizeCollateralDataSource,
    private deploymentService: DeploymentService
  ) {}

  setDataSource(dataSource: ISecuritizeCollateralDataSource): void {
    this.dataSource = dataSource;
  }

  setDeploymentService(deploymentService: DeploymentService): void {
    this.deploymentService = deploymentService;
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
    // TODO fix this
    return getAddress("0x5f51d980f15fe6075ae30394dc35de57a4f76cbb");
  }

  async fetchVault(
    chainId: number,
    vault: Address,
    options?: VaultFetchOptions
  ): Promise<SecuritizeCollateralVault> {
    const vaults = await this.dataSource.fetchVaults(chainId, [vault]);
    if (vaults.length === 0) {
      throw new Error(`Securitize vault not found for ${vault}`);
    }
    const entity = new SecuritizeCollateralVault(vaults[0]!);
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices([entity]);
    }
    if (options?.populateRewards) {
      await this.populateRewards([entity]);
    }
    if (options?.populateLabels) {
      await this.populateLabels([entity]);
    }
    return entity;
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[],
    options?: VaultFetchOptions
  ): Promise<SecuritizeCollateralVault[]> {
    const entities = (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (v) => new SecuritizeCollateralVault(v)
    );
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices(entities);
    }
    if (options?.populateRewards) {
      await this.populateRewards(entities);
    }
    if (options?.populateLabels) {
      await this.populateLabels(entities);
    }
    return entities;
  }

  async populateMarketPrices(
    vaults: SecuritizeCollateralVault[]
  ): Promise<void> {
    if (!this.priceService || vaults.length === 0) return;

    await Promise.all(
      vaults.map(async (v) => {
        v.marketPriceUsd = await v
          .fetchAssetMarketPriceUsd(this.priceService!)
          .catch(() => undefined);
      })
    );
  }

  async populateRewards(vaults: SecuritizeCollateralVault[]): Promise<void> {
    if (!this.rewardsService || vaults.length === 0) return;
    await this.rewardsService.populateRewards(vaults);
  }

  async populateLabels(vaults: SecuritizeCollateralVault[]): Promise<void> {
    if (!this.eulerLabelsService || vaults.length === 0) return;
    await this.eulerLabelsService.populateLabels(vaults);
  }

  async fetchVerifiedVaultAddresses(
    _chainId: number,
    _perspectives: (StandardSecuritizeCollateralPerspectives | Address)[]
  ): Promise<Address[]> {
    // TODO fix this
    return [];
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardSecuritizeCollateralPerspectives | Address)[],
    options?: VaultFetchOptions
  ): Promise<SecuritizeCollateralVault[]> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses, options);
  }
}
