import { IEulerEarnAdapter } from "../eulerEarnService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { Address } from "viem";
import { EulerEarn, IEulerEarn } from "../../../../entities/EulerEarn.js";
import { EulerEarnVaultInfoFull } from "./eulerEarnLensTypes.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "./eulerEarnInfoConverter.js";
import { eulerEarnVaultLensAbi } from "./abis/eulerEarnVaultLensAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";

const verifiedArrayAbi = [
  {
    type: "function",
    name: "verifiedArray",
    inputs: [],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
] as const;

export class EulerEarnOnchainAdapter implements IEulerEarnAdapter {
  constructor(
    private providerService: ProviderService,
    private deploymentService: DeploymentService,
    buildQuery?: BuildQueryFn,
  ) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  setProviderService(providerService: ProviderService): void {
    this.providerService = providerService;
  }

  setDeploymentService(deploymentService: DeploymentService): void {
    this.deploymentService = deploymentService;
  }

  queryEulerEarnVaultInfoFull = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    lensAddress: Address,
    vault: Address
  ) => {
    return provider.readContract({
      address: lensAddress,
      abi: eulerEarnVaultLensAbi,
      functionName: "getVaultInfoFull",
      args: [vault],
    });
  };

  setQueryEulerEarnVaultInfoFull(fn: typeof this.queryEulerEarnVaultInfoFull): void {
    this.queryEulerEarnVaultInfoFull = fn;
  }

  queryEulerEarnVerifiedArray = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    perspective: Address
  ) => {
    return provider.readContract({
      address: perspective,
      abi: verifiedArrayAbi,
      functionName: "verifiedArray",
    });
  };

  setQueryEulerEarnVerifiedArray(fn: typeof this.queryEulerEarnVerifiedArray): void {
    this.queryEulerEarnVerifiedArray = fn;
  }

  async fetchVaults(chainId: number, vaults: Address[]): Promise<IEulerEarn[]> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const lensAddress = deployment.addresses.lensAddrs.eulerEarnVaultLens;
    const results = await Promise.all(
      vaults.map(vault => this.queryEulerEarnVaultInfoFull(provider, lensAddress, vault))
    );

    const parsedVaults: IEulerEarn[] = results.map((result, idx) => {
      const vaultInfo = result as unknown as EulerEarnVaultInfoFull;
      return convertEulerEarnVaultInfoFullToIEulerEarn(vaultInfo, chainId);
    });

    return parsedVaults.map(vault => new EulerEarn(vault));
  }

  async fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]> {
    const provider = this.providerService.getProvider(chainId);

    const results = await Promise.all(
      perspectives.map(perspective => this.queryEulerEarnVerifiedArray(provider, perspective))
    );

    const addresses: Address[] = results.flatMap(result => result as Address[]);

    return addresses;
  }
}

