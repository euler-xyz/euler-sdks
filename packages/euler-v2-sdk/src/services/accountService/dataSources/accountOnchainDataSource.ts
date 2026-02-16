import { IAccountDataSource } from "../accountService.js";
import { ProviderService } from "../../providerService/index.js";
import { DeploymentService } from "../../deploymentService/index.js";
import { type Address, type Abi, getAddress } from "viem";
import { IAccount, SubAccount } from "../../../entities/Account.js";
import { EVault } from "../../../entities/EVault.js";
import { VaultAccountInfo, EVCAccountInfo } from "./accountLensTypes.js";
import { convertToSubAccount } from "./accountInfoConverter.js";
import { AccountVaults } from "./accountVaultsSubgraphDataSource.js";
import { accountLensAbi } from "./abis/accountLensAbi.js";
import { vaultLensAbi } from "../../vaults/eVaultService/dataSources/abis/vaultLensAbi.js";
import type { VaultInfoFull } from "../../vaults/eVaultService/dataSources/eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "../../vaults/eVaultService/dataSources/vaultInfoConverter.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../utils/buildQuery.js";
import type { EulerPlugin, PluginBatchItems } from "../../../plugins/types.js";
import { executeBatchSimulation, BatchSimulationDataSource } from "../../../plugins/batchSimulation.js";

export interface IAccountVaultsDataSource {
  getAccountVaults(chainId: number, account: Address): Promise<AccountVaults>;
}

export class AccountOnchainDataSource implements IAccountDataSource {
  private plugins: EulerPlugin[] = [];
  private batchSimulationDataSource?: BatchSimulationDataSource;

  constructor(
    private providerService: ProviderService,
    private deploymentService: DeploymentService,
    private positionsDataSource: IAccountVaultsDataSource,
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

  setPositionsDataSource(positionsDataSource: IAccountVaultsDataSource): void {
    this.positionsDataSource = positionsDataSource;
  }

  setPlugins(plugins: EulerPlugin[]): void {
    this.plugins = plugins;
  }

  setBatchSimulationDataSource(dataSource: BatchSimulationDataSource): void {
    this.batchSimulationDataSource = dataSource;
  }

  queryEVCAccountInfo = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    accountLensAddress: Address,
    evc: Address,
    subAccount: Address
  ) => {
    return provider.readContract({
      address: accountLensAddress,
      abi: accountLensAbi,
      functionName: "getEVCAccountInfo",
      args: [evc, subAccount],
    });
  };

  setQueryEVCAccountInfo(fn: typeof this.queryEVCAccountInfo): void {
    this.queryEVCAccountInfo = fn;
  }

  queryVaultAccountInfo = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    accountLensAddress: Address,
    subAccount: Address,
    vault: Address
  ) => {
    return provider.readContract({
      address: accountLensAddress,
      abi: accountLensAbi,
      functionName: "getVaultAccountInfo",
      args: [subAccount, vault],
    });
  };

  setQueryVaultAccountInfo(fn: typeof this.queryVaultAccountInfo): void {
    this.queryVaultAccountInfo = fn;
  }

  queryVaultInfoFull = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    vaultLensAddress: Address,
    vault: Address,
    _options?: { pluginPreRead?: boolean },
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

  async fetchAccount(
    chainId: number,
    address: Address
  ): Promise<IAccount | undefined> {
    const accountVaults = await this.positionsDataSource.getAccountVaults(chainId, address);
    const subAccountAddresses = [...new Set(Object.keys(accountVaults).map((subAccountAddress) => getAddress(subAccountAddress)))];

    if (subAccountAddresses.length === 0) return undefined;

    const subAccountsArray = await Promise.all(subAccountAddresses.map(async (subAccountAddress) => {
      const vaults = [...new Set([
        ...(accountVaults?.[subAccountAddress]?.deposits ?? []),
        ...(accountVaults?.[subAccountAddress]?.borrows ?? [])
      ])].map((vault) => getAddress(vault));

      return this.fetchSubAccount(chainId, subAccountAddress, vaults);
    })).then((subAccounts) => subAccounts.filter((subAccount): subAccount is SubAccount & { isLockdownMode: boolean; isPermitDisabledMode: boolean } => subAccount !== undefined));

    const subAccounts = subAccountsArray.reduce<Record<Address, SubAccount>>((acc, sa) => {
      const { isLockdownMode: _lm, isPermitDisabledMode: _pm, ...subAccount } = sa;
      acc[getAddress(sa.account)] = subAccount;
      return acc;
    }, {});

    const mainSubAccount = subAccountsArray.find((sa) => sa.account === sa.owner);
    return {
      chainId,
      owner: address,
      isLockdownMode: mainSubAccount?.isLockdownMode ?? false,
      isPermitDisabledMode: mainSubAccount?.isPermitDisabledMode ?? false,
      subAccounts,
    };

  }

  async fetchSubAccount(chainId: number, subAccount: Address, vaults: Address[] = []): Promise<(SubAccount & { isLockdownMode: boolean; isPermitDisabledMode: boolean }) | undefined> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const accountLensAddress = deployment.addresses.lensAddrs.accountLens;
    const evc = deployment.addresses.coreAddrs.evc;

    // Get EVC account info
    const evcAccountInfoResult = await this.queryEVCAccountInfo(provider, accountLensAddress, evc, subAccount);

    if (!evcAccountInfoResult) return undefined;

    const evcAccountInfo = evcAccountInfoResult as EVCAccountInfo;

    if (vaults.length === 0) {
      const subAccountData = convertToSubAccount(evcAccountInfo, []);
      return {
        ...subAccountData,
        isLockdownMode: evcAccountInfo.isLockdownMode,
        isPermitDisabledMode: evcAccountInfo.isPermitDisabledMode,
      };
    }

    // Fetch vault account info, using batchSimulation when plugins provide prepend items
    let vaultAccountInfos: VaultAccountInfo[];

    if (this.plugins.length > 0) {
      vaultAccountInfos = await this.fetchVaultAccountInfosWithPlugins(chainId, provider, accountLensAddress, subAccount, vaults);
    } else {
      vaultAccountInfos = await Promise.all(
        vaults.map(vault => this.queryVaultAccountInfo(provider, accountLensAddress, subAccount, vault))
      ) as VaultAccountInfo[];
    }

    const fullSubAccount = convertToSubAccount(evcAccountInfo, vaultAccountInfos);
    return {
      ...fullSubAccount,
      isLockdownMode: evcAccountInfo.isLockdownMode,
      isPermitDisabledMode: evcAccountInfo.isPermitDisabledMode,
    };
  }

  /**
   * Fetch vault account infos with plugin enrichment.
   * Fetches vault data to construct EVault objects for plugin inspection,
   * then uses batchSimulation for vaults that have plugin prepend items.
   */
  private async fetchVaultAccountInfosWithPlugins(
    chainId: number,
    provider: ReturnType<ProviderService["getProvider"]>,
    accountLensAddress: Address,
    subAccount: Address,
    vaults: Address[],
  ): Promise<VaultAccountInfo[]> {
    const deployment = this.deploymentService.getDeployment(chainId);
    const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;

    // Fetch vault info to construct EVault objects for plugin prepend collection.
    // Vaults that fail the lens read are filtered out — plugins won't enrich them.
    const vaultInfoResults = await Promise.all(
      vaults.map(vault =>
        this.queryVaultInfoFull(provider, vaultLensAddress, vault, { pluginPreRead: true })
          .then((result) => new EVault(convertVaultInfoFullToIEVault(result as unknown as VaultInfoFull, chainId)))
          .catch(() => null),
      ),
    );

    const eVaults = vaultInfoResults.filter((v): v is EVault => v !== null);

    // Collect prepend items from plugins (only for successfully fetched vaults)
    const prepend = eVaults.length > 0 ? await this.collectReadPrepend(chainId, eVaults) : null;

    // If no prepend items, fall back to normal queries
    if (!prepend || prepend.items.length === 0) {
      return Promise.all(
        vaults.map(vault => this.queryVaultAccountInfo(provider, accountLensAddress, subAccount, vault))
      ) as Promise<VaultAccountInfo[]>;
    }

    // Re-fetch each vault's account info via batchSimulation with prepend items
    return Promise.all(
      vaults.map(async (vault) => {
        try {
          const result = await executeBatchSimulation<VaultAccountInfo>(
            {
              provider,
              evcAddress: deployment.addresses.coreAddrs.evc,
              prependItems: prepend.items,
              totalValue: prepend.totalValue,
              lensAddress: accountLensAddress,
              lensAbi: accountLensAbi as unknown as Abi,
              lensFunctionName: "getVaultAccountInfo",
              lensArgs: [subAccount, vault],
            },
            this.batchSimulationDataSource,
          );

          if (result) return result;
        } catch {
          // Fall back to normal query on error
        }

        return this.queryVaultAccountInfo(provider, accountLensAddress, subAccount, vault) as Promise<VaultAccountInfo>;
      }),
    );
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
}
