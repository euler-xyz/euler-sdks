import { IEulerEarnDataSource } from "../eulerEarnService.js";
import { ProviderService } from "../../providerService/index.js";
import { DeploymentService } from "../../deploymentService/index.js";
import { Address } from "viem";
import { EulerEarn, IEulerEarn } from "../../../entities/EulerEarn.js";
import { EulerEarnVaultInfoFull } from "./eulerEarnLensTypes.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "./eulerEarnInfoConverter.js";
import { eulerEarnVaultLensAbi } from "./abis/eulerEarnVaultLensAbi.js";

const verifiedArrayAbi = [
  {
    type: "function",
    name: "verifiedArray",
    inputs: [],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
] as const;

export class EulerEarnOnchainDataSource implements IEulerEarnDataSource {
  constructor(
    private readonly providerService: ProviderService,
    private readonly deploymentService: DeploymentService
  ) {}

  async fetchVaults(chainId: number, vaults: Address[]): Promise<IEulerEarn[]> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const lensAddress = deployment.addresses.lensAddrs.eulerEarnVaultLens;
    const results = await provider.multicall({
      contracts: vaults.map(vault => ({
        address: lensAddress,
        abi: eulerEarnVaultLensAbi,
        functionName: "getVaultInfoFull",
        args: [vault],
      })),
    });

    const parsedVaults: IEulerEarn[] = results.map((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        const vaultInfo = callResult.result as unknown as EulerEarnVaultInfoFull;
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

    const results = await provider.multicall({
      contracts: perspectives.map(perspective => ({
        address: perspective,
        abi: verifiedArrayAbi,
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

