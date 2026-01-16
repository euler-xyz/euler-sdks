import { IEulerEarnDataSource } from "../eulerEarnService.js";
import { ProviderService } from "../../providerService.js";
import { IABIService } from "../../abiService.js";
import { DeploymentService } from "../../deploymentService.js";
import { Address } from "viem";
import { EulerEarn, IEulerEarn } from "../../../entities/EulerEarn.js";
import { EulerEarnVaultInfoFull } from "./eulerEarnLensTypes.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "./eulerEarnInfoConverter.js";

export class EulerEarnOnchainDataSource implements IEulerEarnDataSource {
  constructor(
    private readonly providerService: ProviderService,
    private readonly abiService: IABIService,
    private readonly deploymentService: DeploymentService
  ) {}

  async fetchVaults(chainId: number, vaults: Address[]): Promise<IEulerEarn[]> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const lensAddress = deployment.addresses.lensAddrs.eulerEarnVaultLens;
    const abi = await this.abiService.getABI(chainId, "EulerEarnVaultLens");
    const results = await provider.multicall({
      contracts: vaults.map(vault => ({
        address: lensAddress,
        abi,
        functionName: "getVaultInfoFull",
        args: [vault],
      })),
    });

    const parsedVaults: IEulerEarn[] = results.map((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        const vaultInfo = callResult.result as EulerEarnVaultInfoFull;
        return convertEulerEarnVaultInfoFullToIEulerEarn(vaultInfo, chainId);
      }

      throw new Error(
        `Failed to fetch vault data for ${vaults[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return parsedVaults.map(vault => new EulerEarn(vault));
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

