import { EVault, IEVault } from "../entities/eVault.js";
import { Address } from "viem";
import { ProviderService } from "./providerService.js";
import { IABIService } from "./abiService.js";
import { DeploymentService } from "./deploymentService.js";

export interface IEVaultDataSource {
  fetchVaults(chainId: number, vault: Address[]): Promise<IEVault[]>;
  fetchVerifiedVaults(chainId: number, perspectives: Address[]): Promise<IEVault[]>;
}

export enum StandardPerspectives {
  GOVERNED = "governedPerspective",
  FACTORY = "evkFactoryPerspective",
  EDGE = "edgeFactoryPerspective",
  ESCROW = "escrowedCollateralPerspective",
}

export class EVaultService {
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

  async fetchVerifiedEVaults(chainId: number, perspectives: (StandardPerspectives | Address)[]): Promise<EVault[]> {
    if (perspectives.length === 0) {
      return [];
    }

    const perspectiveAddresses = perspectives.map(perspective => {
      if (perspective.startsWith("0x")) {
        return perspective as Address;
      }

      const deployment = this.deploymentService.getDeployment(chainId);
      if(!deployment.addresses.peripheryAddrs?.[perspective as StandardPerspectives]) {
        throw new Error(`Perspective address not found for ${perspective}`);
      }

      return deployment.addresses.peripheryAddrs[perspective as StandardPerspectives];
    });
    const vaults = await this.dataSource.fetchVerifiedVaults(chainId, perspectiveAddresses as Address[]);
    return vaults.map(vault => new EVault(vault));
  }

}

export class EVaultOnchainDataSource implements IEVaultDataSource {
  constructor(private readonly providerService: ProviderService, private readonly abiService: IABIService) {}

  async fetchVaults(chainId: number, vaults: Address[]): Promise<IEVault[]> {
    const provider = this.providerService.getProvider(chainId);
    const abi = await this.abiService.getABI(chainId, "VaultLens");
    const results = await provider.multicall({
      contracts: vaults.map(vault => ({
        address: vault,
        abi,
        functionName: "getVaultInfoFull",
        args: [vault],
      })),
    });

    const parsedVaults: IEVault[] = results.map((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        return callResult.result as IEVault;
      }

      throw new Error(
        `Failed to fetch vault data for ${vaults[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return parsedVaults;
  }

  async fetchVerifiedVaults(chainId: number, perspectives: Address[]): Promise<IEVault[]> {
    const provider = this.providerService.getProvider(chainId);
    const abi = await this.abiService.getABI(chainId, "BasePerspective");

    const results = await provider.multicall({
      contracts: perspectives.map(perspective => ({
        address: perspective,
        abi,
        functionName: "verifiedArray",
      })),
    });

    let verifiedVaults: Address[] = results.flatMap((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        return callResult.result as Address[];
      }

      throw new Error(
        `Failed to fetch verified vaults for ${perspectives[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return this.fetchVaults(chainId, verifiedVaults);
  }
}