import { IEVaultAdapter } from "../eVaultService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { getAddress, type Address, type Abi, encodeFunctionData } from "viem";
import { EVault, IEVault } from "../../../../entities/EVault.js";
import { VaultInfoFull } from "./eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "./vaultInfoConverter.js";
import { vaultLensAbi } from "./abis/vaultLensAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";
import type { EulerPlugin, PluginBatchItems } from "../../../../plugins/types.js";
import { executeBatchSimulation, BatchSimulationAdapter } from "../../../../plugins/batchSimulation.js";
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

export const getVaultInfoFullLensBatchItem = (
  vaultLensAddress: Address,
  vault: Address,
  onBehalfOfAccount: Address,
): EVCBatchItem => ({
  targetContract: vaultLensAddress,
  onBehalfOfAccount,
  value: 0n,
  data: encodeFunctionData({
    abi: vaultLensAbi,
    functionName: "getVaultInfoFull",
    args: [vault],
  }),
});

export class EVaultOnchainAdapter implements IEVaultAdapter {
  private plugins: EulerPlugin[] = [];
  private batchSimulationAdapter?: BatchSimulationAdapter;

  constructor(private providerService: ProviderService, private deploymentService: DeploymentService, buildQuery?: BuildQueryFn) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  setProviderService(providerService: ProviderService): void {
    this.providerService = providerService;
  }

  setDeploymentService(deploymentService: DeploymentService): void {
    this.deploymentService = deploymentService;
  }

  setPlugins(plugins: EulerPlugin[]): void {
    this.plugins = plugins;
  }

  setBatchSimulationAdapter(adapter: BatchSimulationAdapter): void {
    this.batchSimulationAdapter = adapter;
  }

  queryEVaultInfoFull = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    vaultLensAddress: Address,
    vault: Address,
  ) => {
    return provider.readContract({
      address: vaultLensAddress,
      abi: vaultLensAbi,
      functionName: "getVaultInfoFull",
      args: [vault],
    });
  };

  setQueryEVaultInfoFull(fn: typeof this.queryEVaultInfoFull): void {
    this.queryEVaultInfoFull = fn;
  }

  queryEVaultVerifiedArray = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    perspective: Address
  ) => {
    return provider.readContract({
      address: perspective,
      abi: verifiedArrayAbi,
      functionName: "verifiedArray",
    });
  };

  setQueryEVaultVerifiedArray(fn: typeof this.queryEVaultVerifiedArray): void {
    this.queryEVaultVerifiedArray = fn;
  }

  async fetchVaults(chainId: number, vaults: Address[]): Promise<ServiceResult<(IEVault | undefined)[]>> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;
    const errors: DataIssue[] = [];

    const eVaults = await Promise.all(
      vaults.map(async (vault, index) => {
        try {
          console.log(1);
          const result = await this.queryEVaultInfoFull(provider, vaultLensAddress, vault);
          console.log(2);
          const vaultInfo = result as unknown as VaultInfoFull;
          const conversionErrors: DataIssue[] = [];
          const parsed = convertVaultInfoFullToIEVault(vaultInfo, chainId, conversionErrors);
          errors.push(...prefixDataIssues(conversionErrors, `$.vaults[${index}]`).map((issue) => ({
            ...issue,
            entityId: issue.entityId ?? getAddress(vault),
          })));
          return new EVault(parsed);
        } catch (error) {
          console.log("HERER");
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "error",
            message: `Failed to fetch eVault ${getAddress(vault)}.`,
            path: `$.vaults[${index}]`,
            entityId: getAddress(vault),
            source: "vaultLens",
            originalValue: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        }
      })
    );

    // Plugin enrichment: re-fetch vaults via batchSimulation when plugins provide prepend items
    if (this.plugins.length === 0) return { result: eVaults, errors };

    const enriched = await Promise.all(
      eVaults.map(async (eVault, vaultIndex) => {
        if (!eVault) return undefined;
        try {
          const prepend = await this.collectReadPrepend(chainId, [eVault]);
          if (!prepend || prepend.items.length === 0) return eVault;

          const result = await executeBatchSimulation<VaultInfoFull>(
            {
              provider,
              evcAddress: deployment.addresses.coreAddrs.evc,
              prependItems: prepend.items,
              totalValue: prepend.totalValue,
              lensAddress: vaultLensAddress,
              lensAbi: vaultLensAbi as unknown as Abi,
              lensFunctionName: "getVaultInfoFull",
              lensArgs: [eVault.address],
            },
            this.batchSimulationAdapter,
          );

          if (!result) return eVault;
          const conversionErrors: DataIssue[] = [];
          const parsed = convertVaultInfoFullToIEVault(result, chainId, conversionErrors);
          errors.push(...prefixDataIssues(conversionErrors, `$.vaults[${vaultIndex}]`).map((issue) => ({
            ...issue,
            entityId: issue.entityId ?? getAddress(eVault.address),
          })));
          return new EVault(parsed);
        } catch {
          return eVault;
        }
      }),
    );

    return { result: enriched, errors };
  }

  private async collectReadPrepend(chainId: number, vaults: EVault[]): Promise<PluginBatchItems | null> {
    const provider = this.providerService.getProvider(chainId);
    const allItems: PluginBatchItems = { items: [], totalValue: 0n };

    for (const plugin of this.plugins) {
      if (!plugin.getReadPrepend) continue;
      try {
        const result = await plugin.getReadPrepend({ chainId, vaults, provider });
        if (result) {
          allItems.items.push(...result.items);
          allItems.totalValue += result.totalValue;
        }
      } catch {
        // Plugin failed — skip it gracefully
      }
    }

    return allItems.items.length > 0 ? allItems : null;
  }

  async fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]> {
    const provider = this.providerService.getProvider(chainId);

    const results = await Promise.all(
      perspectives.map(perspective => this.queryEVaultVerifiedArray(provider, perspective))
    );

    const addresses: Address[] = results.flatMap(result => result as Address[]);

    return [...new Set(addresses)];
  }
}
