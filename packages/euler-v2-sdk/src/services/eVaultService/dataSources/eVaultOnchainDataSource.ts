import { IEVaultDataSource } from "../eVaultService.js";
import { ProviderService } from "../../providerService.js";
import { IABIService } from "../../abiService.js";
import { DeploymentService } from "../../deploymentService.js";
import { Address } from "viem";
import { EVault, IEVault } from "../../../entities/EVault.js";
import { VaultInfoFull } from "./eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "./vaultInfoConverter.js";

export class EVaultOnchainDataSource implements IEVaultDataSource {
  constructor(private readonly providerService: ProviderService, private readonly abiService: IABIService, private readonly deploymentService: DeploymentService) {}

  async fetchVaults(chainId: number, vaults: Address[]): Promise<IEVault[]> {
    const provider = this.providerService.getProvider(chainId);
    const abi = await this.abiService.getABI(chainId, "VaultLens");
    const vaultLensAddress = this.deploymentService.getDeployment(chainId).addresses.lensAddrs.vaultLens;
    const results = await provider.multicall({
      contracts: vaults.map(vault => ({
        address: vaultLensAddress,
        abi,
        functionName: "getVaultInfoFull",
        args: [vault],
      })),
    });

    const parsedVaults: IEVault[] = results.map((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        const vaultInfo = callResult.result as VaultInfoFull;
        return convertVaultInfoFullToIEVault(vaultInfo);
      }

      throw new Error(
        `Failed to fetch vault data for ${vaults[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return parsedVaults.map(vault => new EVault(vault));
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

    return [...new Set(addresses)];
  }
}