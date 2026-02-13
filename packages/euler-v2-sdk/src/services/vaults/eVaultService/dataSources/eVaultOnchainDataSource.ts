import { IEVaultDataSource } from "../eVaultService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { Address } from "viem";
import { EVault, IEVault } from "../../../../entities/EVault.js";
import { VaultInfoFull } from "./eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "./vaultInfoConverter.js";
import { vaultLensAbi } from "./abis/vaultLensAbi.js";
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

export class EVaultOnchainDataSource implements IEVaultDataSource {
  constructor(private readonly providerService: ProviderService, private readonly deploymentService: DeploymentService, buildQuery?: BuildQueryFn) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryVaultInfoFull = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    vaultLensAddress: Address,
    vault: Address
  ) => {
    return provider.readContract({
      address: vaultLensAddress,
      abi: vaultLensAbi,
      functionName: "getVaultInfoFull",
      args: [vault],
    });
  };

  setQueryVaultInfoFull(fn: typeof this.queryVaultInfoFull): void {
    this.queryVaultInfoFull = fn;
  }

  queryVerifiedArray = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    perspective: Address
  ) => {
    return provider.readContract({
      address: perspective,
      abi: verifiedArrayAbi,
      functionName: "verifiedArray",
    });
  };

  setQueryVerifiedArray(fn: typeof this.queryVerifiedArray): void {
    this.queryVerifiedArray = fn;
  }

  async fetchVaults(chainId: number, vaults: Address[]): Promise<IEVault[]> {
    const provider = this.providerService.getProvider(chainId);
    const vaultLensAddress = this.deploymentService.getDeployment(chainId).addresses.lensAddrs.vaultLens;
    const results = await Promise.all(
      vaults.map(vault => this.queryVaultInfoFull(provider, vaultLensAddress, vault))
    );

    const parsedVaults: IEVault[] = results.map((result, idx) => {
      const vaultInfo = result as unknown as VaultInfoFull;
      return convertVaultInfoFullToIEVault(vaultInfo, chainId);
    });

    return parsedVaults.map(vault => new EVault(vault));
  }

  async fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]> {
    const provider = this.providerService.getProvider(chainId);

    const results = await Promise.all(
      perspectives.map(perspective => this.queryVerifiedArray(provider, perspective))
    );

    const addresses: Address[] = results.flatMap(result => result as Address[]);

    return [...new Set(addresses)];
  }
}