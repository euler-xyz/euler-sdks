import type { ISecuritizeCollateralAdapter } from "../securitizeVaultService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { Address } from "viem";
import { ISecuritizeCollateralVault } from "../../../../entities/SecuritizeCollateralVault.js";
import { VaultInfoERC4626 } from "./securitizeVaultLensTypes.js";
import { convertToISecuritizeCollateralVault } from "./securitizeVaultInfoConverter.js";
import { utilsLensAbi } from "./abis/utilsLensAbi.js";
import { erc4626EvcCollateralSecuritizeAbi } from "./abis/erc4626EvcCollateralSecuritizeAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";

export class SecuritizeVaultOnchainAdapter
  implements ISecuritizeCollateralAdapter
{
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

  queryVaultInfoERC4626 = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    utilsLensAddress: Address,
    vault: Address
  ) => {
    return provider.readContract({
      address: utilsLensAddress,
      abi: utilsLensAbi,
      functionName: "getVaultInfoERC4626",
      args: [vault],
    });
  };

  setQueryVaultInfoERC4626(fn: typeof this.queryVaultInfoERC4626): void {
    this.queryVaultInfoERC4626 = fn;
  }

  queryGovernorAdmin = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    vault: Address
  ) => {
    return provider.readContract({
      address: vault,
      abi: erc4626EvcCollateralSecuritizeAbi,
      functionName: "governorAdmin",
    });
  };

  setQueryGovernorAdmin(fn: typeof this.queryGovernorAdmin): void {
    this.queryGovernorAdmin = fn;
  }

  querySupplyCapResolved = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    vault: Address
  ) => {
    return provider.readContract({
      address: vault,
      abi: erc4626EvcCollateralSecuritizeAbi,
      functionName: "supplyCapResolved",
    });
  };

  setQuerySupplyCapResolved(fn: typeof this.querySupplyCapResolved): void {
    this.querySupplyCapResolved = fn;
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[]
  ): Promise<ISecuritizeCollateralVault[]> {
    if (vaults.length === 0) return [];

    const provider = this.providerService.getProvider(chainId);
    const utilsLensAddress = this.deploymentService.getDeployment(chainId)
      .addresses.lensAddrs.utilsLens;

    const [infoResults, governorResults, supplyCapResults] = await Promise.all([
      Promise.all(vaults.map(vault => this.queryVaultInfoERC4626(provider, utilsLensAddress, vault))),
      Promise.all(vaults.map(vault => this.queryGovernorAdmin(provider, vault))),
      Promise.all(vaults.map(vault => this.querySupplyCapResolved(provider, vault))),
    ]);

    const parsed: ISecuritizeCollateralVault[] = [];

    for (let i = 0; i < vaults.length; i++) {
      const vaultInfo = infoResults[i] as unknown as VaultInfoERC4626;
      const governor = governorResults[i] as `0x${string}`;
      const supplyCap = supplyCapResults[i] as bigint;

      parsed.push(
        convertToISecuritizeCollateralVault(
          vaultInfo,
          governor,
          supplyCap,
          chainId
        )
      );
    }

    return parsed;
  }

  async fetchVerifiedVaultsAddresses(
    _chainId: number,
    _perspectives: Address[]
  ): Promise<Address[]> {
    return [];
  }
}
