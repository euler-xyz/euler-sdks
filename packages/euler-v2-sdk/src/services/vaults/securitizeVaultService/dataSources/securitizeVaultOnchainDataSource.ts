import type { ISecuritizeCollateralDataSource } from "../securitizeVaultService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { Address, type Abi } from "viem";
import { ISecuritizeCollateralVault } from "../../../../entities/SecuritizeCollateralVault.js";
import { VaultInfoERC4626 } from "./securitizeVaultLensTypes.js";
import { convertToISecuritizeCollateralVault } from "./securitizeVaultInfoConverter.js";
import { utilsLensAbi } from "./abis/utilsLensAbi.js";
import { erc4626EvcCollateralSecuritizeAbi } from "./abis/erc4626EvcCollateralSecuritizeAbi.js";

export class SecuritizeVaultOnchainDataSource
  implements ISecuritizeCollateralDataSource
{
  constructor(
    private readonly providerService: ProviderService,
    private readonly deploymentService: DeploymentService
  ) {}

  async fetchVaults(
    chainId: number,
    vaults: Address[]
  ): Promise<ISecuritizeCollateralVault[]> {
    if (vaults.length === 0) return [];

    const provider = this.providerService.getProvider(chainId);
    const utilsLensAddress = this.deploymentService.getDeployment(chainId)
      .addresses.lensAddrs.utilsLens;

    const contracts: {
      address: Address;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
    }[] = [];

    for (const vault of vaults) {
      contracts.push({
        address: utilsLensAddress,
        abi: utilsLensAbi as Abi,
        functionName: "getVaultInfoERC4626",
        args: [vault],
      });
    }
    for (const vault of vaults) {
      contracts.push({
        address: vault,
        abi: erc4626EvcCollateralSecuritizeAbi as Abi,
        functionName: "governorAdmin",
      });
    }
    for (const vault of vaults) {
      contracts.push({
        address: vault,
        abi: erc4626EvcCollateralSecuritizeAbi as Abi,
        functionName: "supplyCapResolved",
      });
    }

    const results = await provider.multicall({ contracts });

    const n = vaults.length;
    const parsed: ISecuritizeCollateralVault[] = [];

    for (let i = 0; i < n; i++) {
      const infoResult = results[i];
      const governorResult = results[n + i];
      const supplyCapResult = results[2 * n + i];

      if (
        infoResult?.status !== "success" ||
        infoResult.result == null ||
        governorResult?.status !== "success" ||
        governorResult.result == null ||
        supplyCapResult?.status !== "success" ||
        supplyCapResult.result == null
      ) {
        const err = [
          infoResult?.status !== "success" && infoResult?.error?.message,
          governorResult?.status !== "success" && governorResult?.error?.message,
          supplyCapResult?.status !== "success" &&
            supplyCapResult?.error?.message,
        ]
          .filter(Boolean)
          .join("; ");
        throw new Error(
          `Failed to fetch Securitize vault data for ${vaults[i]}: ${err || "Unknown error"}`
        );
      }

      const vaultInfo = infoResult.result as unknown as VaultInfoERC4626;
      const governor = governorResult.result as `0x${string}`;
      const supplyCap = supplyCapResult.result as bigint;

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
