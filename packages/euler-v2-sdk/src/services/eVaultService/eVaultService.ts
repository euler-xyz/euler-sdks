import { Address } from "viem";
import { EVault, IEVault } from "../../entities/EVault.js";
import { DeploymentService } from "../deploymentService/index.js";

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

export interface IEVaultService {
  fetchEVault(chainId: number, vault: Address): Promise<EVault>;
  fetchEVaults(chainId: number, vaults: Address[]): Promise<EVault[]>;
  fetchVerifiedEVaultsAddresses(chainId: number, perspectives: (StandardEVaultPerspectives | Address)[]): Promise<Address[]>;
  fetchVerifiedEVaults(chainId: number, perspectives: (StandardEVaultPerspectives | Address)[]): Promise<EVault[]>;
}

export class EVaultService implements IEVaultService {
  constructor(private readonly dataSource: IEVaultDataSource, private readonly deploymentService: DeploymentService) { }

  async fetchEVault(chainId: number, vault: Address): Promise<EVault> {
    const vaults = await this.dataSource.fetchVaults(chainId, [vault]);
    if (vaults.length === 0) {
      throw new Error(`Vault not found for ${vault}`);
    }
    return new EVault(vaults[0]!);
  }

  async fetchEVaults(chainId: number, vaults: Address[]): Promise<EVault[]> {
    return (await this.dataSource.fetchVaults(chainId, vaults)).map(vault => new EVault(vault));
  }

  async fetchVerifiedEVaultsAddresses(chainId: number, perspectives: (StandardEVaultPerspectives | Address)[]): Promise<Address[]> {
    if (perspectives.length === 0) {
      return [];
    }

    const perspectiveAddresses = perspectives.map(perspective => {
      if (perspective.startsWith("0x")) {
        return perspective as Address;
      }

      const deployment = this.deploymentService.getDeployment(chainId);
      if(!deployment.addresses.peripheryAddrs?.[perspective as StandardEVaultPerspectives]) {
        throw new Error(`Perspective address not found for ${perspective}`);
      }

      return deployment.addresses.peripheryAddrs[perspective as StandardEVaultPerspectives] as Address;
    });
    return this.dataSource.fetchVerifiedVaultsAddresses(chainId, perspectiveAddresses);
  }

  async fetchVerifiedEVaults(chainId: number, perspectives: (StandardEVaultPerspectives | Address)[]): Promise<EVault[]> {
    const addresses = await this.fetchVerifiedEVaultsAddresses(chainId, perspectives);
    return this.fetchEVaults(chainId, addresses);
  }
}
