import { Address, getAddress } from "viem";
import {
  SecuritizeCollateralVault,
  ISecuritizeCollateralVault,
} from "../../../entities/SecuritizeCollateralVault.js";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService, VaultFetchOptions } from "../index.js";
import type { IPriceService } from "../../priceService/index.js";

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
  > {}

export class SecuritizeVaultService implements ISecuritizeVaultService {
  private priceService?: IPriceService;

  constructor(
    private readonly dataSource: ISecuritizeCollateralDataSource,
    private readonly deploymentService: DeploymentService
  ) {}

  setPriceService(service: IPriceService): void {
    this.priceService = service;
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
    if (options?.fetchMarketPrices) {
      await this.populateMarketPrices([entity]);
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
    if (options?.fetchMarketPrices) {
      await this.populateMarketPrices(entities);
    }
    return entities;
  }

  private async populateMarketPrices(
    vaults: SecuritizeCollateralVault[]
  ): Promise<void> {
    if (!this.priceService) return;

    await Promise.all(
      vaults.map(async (v) => {
        v.marketPriceUsd = await v
          .fetchAssetMarketPriceUsd(this.priceService!)
          .catch(() => undefined);
      })
    );
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
