import { Address } from "viem";
import { EVault, IEVault } from "../../../entities/EVault.js";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService } from "../index.js";
import type { IVaultMetaService } from "../vaultMetaService/index.js";
import type { IPriceService } from "../../priceService/index.js";

export interface IEVaultDataSource {
  fetchVaults(chainId: number, vault: Address[]): Promise<IEVault[]>;
  fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]>;
}

export enum StandardEVaultPerspectives {
  GOVERNED = "governedPerspective",
  FACTORY = "evkFactoryPerspective",
  EDGE = "edgeFactoryPerspective",
  ESCROW = "escrowedCollateralPerspective",
}

export interface EVaultFetchOptions {
  resolveCollaterals?: boolean;
  fetchMarketPrices?: boolean;
}

export interface IEVaultService
  extends IVaultService<EVault, StandardEVaultPerspectives> {
  fetchVault(chainId: number, vault: Address, options?: EVaultFetchOptions): Promise<EVault>;
  fetchVaults(chainId: number, vaults: Address[], options?: EVaultFetchOptions): Promise<EVault[]>;
}

export class EVaultService implements IEVaultService {
  private vaultMetaService?: IVaultMetaService;
  private priceService?: IPriceService;

  constructor(
    private readonly dataSource: IEVaultDataSource,
    private readonly deploymentService: DeploymentService
  ) {}

  setVaultMetaService(service: IVaultMetaService): void {
    this.vaultMetaService = service;
  }

  setPriceService(service: IPriceService): void {
    this.priceService = service;
  }

  factory(chainId: number): Address {
    return this.deploymentService.getDeployment(chainId).addresses.coreAddrs
      .eVaultFactory;
  }

  async fetchVault(chainId: number, vault: Address, options?: EVaultFetchOptions): Promise<EVault> {
    const vaults = await this.dataSource.fetchVaults(chainId, [vault]);
    if (vaults.length === 0) {
      throw new Error(`Vault not found for ${vault}`);
    }
    const eVault = new EVault(vaults[0]!);
    if (options?.resolveCollaterals) {
      await this.populateCollateralVaults(chainId, [eVault]);
    }
    if (options?.fetchMarketPrices) {
      await this.populateMarketPrices([eVault]);
    }
    return eVault;
  }

  async fetchVaults(chainId: number, vaults: Address[], options?: EVaultFetchOptions): Promise<EVault[]> {
    const eVaults = (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (vault) => new EVault(vault)
    );
    if (options?.resolveCollaterals) {
      await this.populateCollateralVaults(chainId, eVaults);
    }
    if (options?.fetchMarketPrices) {
      await this.populateMarketPrices(eVaults);
    }
    return eVaults;
  }

  private async populateCollateralVaults(
    chainId: number,
    eVaults: EVault[]
  ): Promise<void> {
    if (!this.vaultMetaService) return;

    const allCollateralAddresses = [
      ...new Set(
        eVaults.flatMap((v) => v.collaterals.map((c) => c.address))
      ),
    ];

    if (allCollateralAddresses.length === 0) return;

    const collateralVaults = await Promise.all(
      allCollateralAddresses.map((addr) =>
        this.vaultMetaService!.fetchVault(chainId, addr).catch(() => undefined)
      )
    );

    const vaultByAddress = new Map(
      collateralVaults
        .filter((v) => v !== undefined)
        .map((v) => [(v as { address: Address }).address.toLowerCase(), v])
    );

    for (const eVault of eVaults) {
      for (const collateral of eVault.collaterals) {
        collateral.vault = vaultByAddress.get(collateral.address.toLowerCase());
      }
    }
  }

  private async populateMarketPrices(eVaults: EVault[]): Promise<void> {
    if (!this.priceService) return;

    await Promise.all(
      eVaults.map(async (eVault) => {
        // Vault asset USD price
        eVault.marketPriceUsd = await eVault
          .fetchAssetMarketPriceUsd(this.priceService!)
          .catch(() => undefined);

        // Collateral USD prices (requires resolved vault)
        await Promise.all(
          eVault.collaterals.map(async (collateral) => {
            if (!collateral.vault) return;
            const price = await this.priceService!
              .getCollateralUsdPrice(eVault, collateral.vault)
              .catch(() => undefined);
            collateral.marketPriceUsd = price?.amountOutMid;
          })
        );
      })
    );
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
    return this.dataSource.fetchVerifiedVaultsAddresses(
      chainId,
      perspectiveAddresses
    );
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardEVaultPerspectives | Address)[]
  ): Promise<EVault[]> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses);
  }
}
