import { IEulerEarnAdapter } from "../eulerEarnService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { Address, encodeFunctionData, getAddress } from "viem";
import { EulerEarn, IEulerEarn } from "../../../../entities/EulerEarn.js";
import { EulerEarnVaultInfoFull } from "./eulerEarnLensTypes.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "./eulerEarnInfoConverter.js";
import { eulerEarnVaultLensAbi } from "./abis/eulerEarnVaultLensAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";
import type { EVCBatchItem } from "../../../executionService/executionServiceTypes.js";
import type { DataIssue, ServiceResult } from "../../../../utils/entityDiagnostics.js";
import { prefixDataIssues } from "../../../../utils/entityDiagnostics.js";

const verifiedArrayAbi = [
  {
    type: "function",
    name: "verifiedArray",
    inputs: [],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
] as const;

export const getEulerEarnVaultInfoFullLensBatchItem = (
  lensAddress: Address,
  vault: Address,
  onBehalfOfAccount: Address,
): EVCBatchItem => ({
  targetContract: lensAddress,
  onBehalfOfAccount,
  value: 0n,
  data: encodeFunctionData({
    abi: eulerEarnVaultLensAbi,
    functionName: "getVaultInfoFull",
    args: [vault],
  }),
});

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

  async fetchVaults(chainId: number, vaults: Address[]): Promise<ServiceResult<(IEulerEarn | undefined)[]>> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const lensAddress = deployment.addresses.lensAddrs.eulerEarnVaultLens;
    const errors: DataIssue[] = [];
    const parsedVaults = await Promise.all(
      vaults.map(async (vault, idx) => {
        try {
          const result = await this.queryEulerEarnVaultInfoFull(provider, lensAddress, vault);
          const vaultInfo = result as unknown as EulerEarnVaultInfoFull;
          const conversionErrors: DataIssue[] = [];
          const parsed = convertEulerEarnVaultInfoFullToIEulerEarn(vaultInfo, chainId, conversionErrors);
          errors.push(...prefixDataIssues(conversionErrors, `$.vaults[${idx}]`).map((issue) => ({
            ...issue,
            entityId: issue.entityId ?? getAddress(vault),
          })));
          return new EulerEarn(parsed);
        } catch (error) {
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: `Failed to fetch EulerEarn vault ${getAddress(vault)}.`,
            paths: [`$.vaults[${idx}]`],
            entityId: getAddress(vault),
            source: "eulerEarnLens",
            originalValue: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        }
      })
    );

    return { result: parsedVaults, errors };
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
