import type { ISecuritizeCollateralAdapter } from "../securitizeVaultService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { Address, encodeFunctionData, getAddress, zeroAddress } from "viem";
import { ISecuritizeCollateralVault } from "../../../../entities/SecuritizeCollateralVault.js";
import { VaultInfoERC4626 } from "./securitizeVaultLensTypes.js";
import { convertToISecuritizeCollateralVault } from "./securitizeVaultInfoConverter.js";
import { utilsLensAbi } from "./abis/utilsLensAbi.js";
import { erc4626EvcCollateralSecuritizeAbi } from "./abis/erc4626EvcCollateralSecuritizeAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";
import type { EVCBatchItem } from "../../../executionService/executionServiceTypes.js";
import type { DataIssue, ServiceResult } from "../../../../utils/entityDiagnostics.js";
import { prefixDataIssues } from "../../../../utils/entityDiagnostics.js";

export const getVaultInfoERC4626LensBatchItem = (
  utilsLensAddress: Address,
  vault: Address,
): EVCBatchItem => ({
  targetContract: utilsLensAddress,
  onBehalfOfAccount: zeroAddress,
  value: 0n,
  data: encodeFunctionData({
    abi: utilsLensAbi,
    functionName: "getVaultInfoERC4626",
    args: [vault],
  }),
});

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

  querySecuritizeVaultGovernorAdmin = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    vault: Address
  ) => {
    return provider.readContract({
      address: vault,
      abi: erc4626EvcCollateralSecuritizeAbi,
      functionName: "governorAdmin",
    });
  };

  setQuerySecuritizeVaultGovernorAdmin(fn: typeof this.querySecuritizeVaultGovernorAdmin): void {
    this.querySecuritizeVaultGovernorAdmin = fn;
  }

  querySecuritizeVaultSupplyCapResolved = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    vault: Address
  ) => {
    return provider.readContract({
      address: vault,
      abi: erc4626EvcCollateralSecuritizeAbi,
      functionName: "supplyCapResolved",
    });
  };

  setQuerySecuritizeVaultSupplyCapResolved(fn: typeof this.querySecuritizeVaultSupplyCapResolved): void {
    this.querySecuritizeVaultSupplyCapResolved = fn;
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[]
  ): Promise<ServiceResult<(ISecuritizeCollateralVault | undefined)[]>> {
    if (vaults.length === 0) return { result: [], errors: [] };
    const errors: DataIssue[] = [];

    const provider = this.providerService.getProvider(chainId);
    const utilsLensAddress = this.deploymentService.getDeployment(chainId)
      .addresses.lensAddrs.utilsLens;

    const parsed = await Promise.all(
      vaults.map(async (vault, index) => {
        try {
          const [vaultInfoRaw, governorRaw, supplyCapRaw] = await Promise.all([
            this.queryVaultInfoERC4626(provider, utilsLensAddress, vault),
            this.querySecuritizeVaultGovernorAdmin(provider, vault),
            this.querySecuritizeVaultSupplyCapResolved(provider, vault),
          ]);

          const vaultInfo = vaultInfoRaw as unknown as VaultInfoERC4626;
          const governor = governorRaw as `0x${string}`;
          const supplyCap = supplyCapRaw as bigint;

          const conversionErrors: DataIssue[] = [];
          const parsedVault = convertToISecuritizeCollateralVault(
            vaultInfo,
            governor,
            supplyCap,
            chainId,
            conversionErrors
          );
          errors.push(...prefixDataIssues(conversionErrors, `$.vaults[${index}]`).map((issue) => ({
            ...issue,
            entityId: issue.entityId ?? getAddress(vault),
          })));
          return parsedVault;
        } catch (error) {
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: `Failed to fetch securitize vault ${getAddress(vault)}.`,
            paths: [`$.vaults[${index}]`],
            entityId: getAddress(vault),
            source: "utilsLens",
            originalValue: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        }
      })
    );

    return {
      result: parsed,
      errors,
    };
  }

  async fetchVerifiedVaultsAddresses(
    _chainId: number,
    _perspectives: Address[]
  ): Promise<Address[]> {
    return [];
  }
}
