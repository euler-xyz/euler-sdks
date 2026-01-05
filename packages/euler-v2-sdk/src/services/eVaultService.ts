import { EVault, IEVault } from "../entities/EVault.js";
import { Address } from "viem";
import { ProviderService } from "./providerService.js";
import { IABIService } from "./abiService.js";
import { DeploymentService } from "./deploymentService.js";
import { decodeOracleInfo, OracleDetailedInfo } from "../utils/oracle.js";

export interface IEVaultDataSource {
  fetchVaults(chainId: number, vault: Address[]): Promise<IEVault[]>;
  fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]>;
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

  async fetchVerifiedEVaultsAddresses(chainId: number, perspectives: (StandardPerspectives | Address)[]): Promise<Address[]> {
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

      return deployment.addresses.peripheryAddrs[perspective as StandardPerspectives] as Address;
    });
    return this.dataSource.fetchVerifiedVaultsAddresses(chainId, perspectiveAddresses);
  }

  async fetchVerifiedEVaults(chainId: number, perspectives: (StandardPerspectives | Address)[]): Promise<EVault[]> {
    const addresses = await this.fetchVerifiedEVaultsAddresses(chainId, perspectives);
    return this.fetchEVaults(chainId, addresses);
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
        const result = callResult.result as any;
        const decodedOracleInfo = decodeOracleInfo(result.oracleInfo);
        const decodedBackupAssetOracleInfo = decodeOracleInfo(result.backupAssetOracleInfo);
        return new EVault({
          ...result,
          oracleInfo: decodedOracleInfo,
          backupAssetOracleInfo: decodedBackupAssetOracleInfo,
        });
      }

      throw new Error(
        `Failed to fetch vault data for ${vaults[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return parsedVaults;
  }

  async fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]> {
    const provider = this.providerService.getProvider(chainId);
    const abi = await this.abiService.getABI(chainId, "BasePerspective");

    const results = await provider.multicall({
      contracts: perspectives.map(perspective => ({
        address: perspective,
        abi,
        functionName: "verifiedArray",
      })),
    });

    const addresses: Address[] = results.flatMap((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        return callResult.result as Address[];
      }

      throw new Error(
        `Failed to fetch verified vaults for ${perspectives[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return addresses;
  }
}