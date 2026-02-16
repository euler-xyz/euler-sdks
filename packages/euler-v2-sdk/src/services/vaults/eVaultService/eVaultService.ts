import { Address } from "viem";
import { EVault, IEVault } from "../../../entities/EVault.js";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService, VaultFetchOptions } from "../index.js";
import type { IVaultMetaService } from "../vaultMetaService/index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";

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
  populateCollaterals?: boolean;
  populateMarketPrices?: boolean;
  populateRewards?: boolean;
  populateLabels?: boolean;
}

export interface IEVaultService
  extends IVaultService<EVault, StandardEVaultPerspectives> {
  fetchVault(chainId: number, vault: Address, options?: EVaultFetchOptions): Promise<EVault>;
  fetchVaults(chainId: number, vaults: Address[], options?: EVaultFetchOptions): Promise<EVault[]>;
  populateCollaterals(eVaults: EVault[]): Promise<void>;
  populateMarketPrices(eVaults: EVault[]): Promise<void>;
  populateRewards(eVaults: EVault[]): Promise<void>;
  populateLabels(eVaults: EVault[]): Promise<void>;
}

export class EVaultService implements IEVaultService {
  private vaultMetaService?: IVaultMetaService;
  private priceService?: IPriceService;
  private rewardsService?: IRewardsService;
  private eulerLabelsService?: IEulerLabelsService;

  constructor(
    private dataSource: IEVaultDataSource,
    private deploymentService: DeploymentService
  ) {}

  setDataSource(dataSource: IEVaultDataSource): void {
    this.dataSource = dataSource;
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

  setEulerLabelsService(service: IEulerLabelsService): void {
    this.eulerLabelsService = service;
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
    if (options?.populateCollaterals) {
      await this.populateCollaterals([eVault]);
    }
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices([eVault]);
    }
    if (options?.populateRewards) {
      await this.populateRewards([eVault]);
    }
    if (options?.populateLabels) {
      await this.populateLabels([eVault]);
    }
    return eVault;
  }

  async fetchVaults(chainId: number, vaults: Address[], options?: EVaultFetchOptions): Promise<EVault[]> {
    const eVaults = (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (vault) => new EVault(vault)
    );
    if (options?.populateCollaterals) {
      await this.populateCollaterals(eVaults);
    }
    if (options?.populateMarketPrices) {
      await this.populateMarketPrices(eVaults);
    }
    if (options?.populateRewards) {
      await this.populateRewards(eVaults);
    }
    if (options?.populateLabels) {
      await this.populateLabels(eVaults);
    }
    return eVaults;
  }

  async populateCollaterals(eVaults: EVault[]): Promise<void> {
    if (!this.vaultMetaService || eVaults.length === 0) return;

    const allCollateralAddresses = [
      ...new Set(
        eVaults.flatMap((v) => v.collaterals.map((c) => c.address))
      ),
    ];

    if (allCollateralAddresses.length === 0) return;

    const chainId = eVaults[0]!.chainId;
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

  async populateMarketPrices(eVaults: EVault[]): Promise<void> {
    if (!this.priceService || eVaults.length === 0) return;

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

  async populateRewards(eVaults: EVault[]): Promise<void> {
    if (!this.rewardsService || eVaults.length === 0) return;
    await this.rewardsService.populateRewards(eVaults);
  }

  async populateLabels(eVaults: EVault[]): Promise<void> {
    if (!this.eulerLabelsService || eVaults.length === 0) return;
    await this.eulerLabelsService.populateLabels(eVaults);
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
    perspectives: (StandardEVaultPerspectives | Address)[],
    options?: EVaultFetchOptions
  ): Promise<EVault[]> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses, options);
  }
}
