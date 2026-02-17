import { IEVaultAdapter } from "../eVaultService.js";
import { ProviderService } from "../../../providerService/index.js";
import { DeploymentService } from "../../../deploymentService/index.js";
import { type Address, type Abi } from "viem";
import { EVault, IEVault } from "../../../../entities/EVault.js";
import { VaultInfoFull } from "./eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "./vaultInfoConverter.js";
import { vaultLensAbi } from "./abis/vaultLensAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";
import type { EulerPlugin, PluginBatchItems } from "../../../../plugins/types.js";
import { executeBatchSimulation, BatchSimulationAdapter } from "../../../../plugins/batchSimulation.js";

const verifiedArrayAbi = [
  {
    type: "function",
    name: "verifiedArray",
    inputs: [],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
] as const;

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

  queryVaultInfoFull = async (
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
    const deployment = this.deploymentService.getDeployment(chainId);
    const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;

    const results = await Promise.all(
      vaults.map(vault => this.queryVaultInfoFull(provider, vaultLensAddress, vault))
    );

    const parsedVaults: IEVault[] = results.map((result) => {
      const vaultInfo = result as unknown as VaultInfoFull;
      return convertVaultInfoFullToIEVault(vaultInfo, chainId);
    });

    const eVaults = parsedVaults.map(vault => new EVault(vault));

    // Plugin enrichment: re-fetch vaults via batchSimulation when plugins provide prepend items
    if (this.plugins.length === 0) return eVaults;

    const enriched = await Promise.all(
      eVaults.map(async (eVault) => {
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
          return new EVault(convertVaultInfoFullToIEVault(result, chainId));
        } catch {
          return eVault;
        }
      }),
    );

    return enriched;
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
      perspectives.map(perspective => this.queryVerifiedArray(provider, perspective))
    );

    const addresses: Address[] = results.flatMap(result => result as Address[]);

    return [...new Set(addresses)];
  }
}