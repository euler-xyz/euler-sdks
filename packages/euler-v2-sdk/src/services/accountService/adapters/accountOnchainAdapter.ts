import { IAccountAdapter } from "../accountService.js";
import { ProviderService } from "../../providerService/index.js";
import { DeploymentService } from "../../deploymentService/index.js";
import { type Address, type Abi, encodeFunctionData, getAddress } from "viem";
import { IAccount, type ISubAccount } from "../../../entities/Account.js";
import { EVault } from "../../../entities/EVault.js";
import { VaultAccountInfo, EVCAccountInfo } from "./accountLensTypes.js";
import { convertToSubAccount } from "./accountInfoConverter.js";
import { AccountVaults } from "./accountVaultsSubgraphAdapter.js";
import { accountLensAbi } from "./abis/accountLensAbi.js";
import { vaultLensAbi } from "../../vaults/eVaultService/adapters/abis/vaultLensAbi.js";
import type { VaultInfoFull } from "../../vaults/eVaultService/adapters/eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "../../vaults/eVaultService/adapters/vaultInfoConverter.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../utils/buildQuery.js";
import type { EulerPlugin, PluginBatchItems } from "../../../plugins/types.js";
import { executeBatchSimulation, BatchSimulationAdapter } from "../../../plugins/batchSimulation.js";
import type { EVCBatchItem } from "../../executionService/executionServiceTypes.js";
import { type DataIssue, type ServiceResult, prefixDataIssues } from "../../../utils/entityDiagnostics.js";

export const getEVCAccountInfoLensBatchItem = (
  accountLensAddress: Address,
  evc: Address,
  subAccount: Address,
  onBehalfOfAccount: Address,
): EVCBatchItem => ({
  targetContract: accountLensAddress,
  onBehalfOfAccount,
  value: 0n,
  data: encodeFunctionData({
    abi: accountLensAbi,
    functionName: "getEVCAccountInfo",
    args: [evc, subAccount],
  }),
});

export const getVaultAccountInfoLensBatchItem = (
  accountLensAddress: Address,
  subAccount: Address,
  vault: Address,
  onBehalfOfAccount: Address,
): EVCBatchItem => ({
  targetContract: accountLensAddress,
  onBehalfOfAccount,
  value: 0n,
  data: encodeFunctionData({
    abi: accountLensAbi,
    functionName: "getVaultAccountInfo",
    args: [subAccount, vault],
  }),
});

export interface IAccountVaultsAdapter {
  getAccountVaults(chainId: number, account: Address): Promise<AccountVaults>;
}

export class AccountOnchainAdapter implements IAccountAdapter {
  private plugins: EulerPlugin[] = [];
  private batchSimulationAdapter?: BatchSimulationAdapter;

  constructor(
    private providerService: ProviderService,
    private deploymentService: DeploymentService,
    private positionsAdapter: IAccountVaultsAdapter,
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

  setPositionsAdapter(positionsAdapter: IAccountVaultsAdapter): void {
    this.positionsAdapter = positionsAdapter;
  }

  setPlugins(plugins: EulerPlugin[]): void {
    this.plugins = plugins;
  }

  setBatchSimulationAdapter(adapter: BatchSimulationAdapter): void {
    this.batchSimulationAdapter = adapter;
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

  async fetchAccount(
    chainId: number,
    address: Address
  ): Promise<ServiceResult<IAccount | undefined>> {
    const errors: DataIssue[] = [];
    const accountVaults = await this.positionsAdapter.getAccountVaults(chainId, address);
    const subAccountAddresses = [...new Set(Object.keys(accountVaults).map((subAccountAddress) => getAddress(subAccountAddress)))];

    if (subAccountAddresses.length === 0) return { result: undefined, errors };

    const subAccountsArray = await Promise.all(subAccountAddresses.map(async (subAccountAddress) => {
      const vaults = [...new Set([
        ...(accountVaults?.[subAccountAddress]?.deposits ?? []),
        ...(accountVaults?.[subAccountAddress]?.borrows ?? [])
      ])].map((vault) => getAddress(vault));

      return this.fetchSubAccount(chainId, subAccountAddress, vaults);
    }));
    const validSubs = subAccountsArray
      .map((entry, idx) => {
        const subAccountAddress = subAccountAddresses[idx];
        errors.push(
          ...prefixDataIssues(entry.errors, `$.subAccounts[${entry.result?.account ?? subAccountAddress ?? "unknown"}]`).map((issue) => ({
            ...issue,
            entityId: issue.entityId ?? entry.result?.account ?? subAccountAddress,
          }))
        );
        return entry.result;
      })
      .filter((subAccount): subAccount is ISubAccount & { isLockdownMode: boolean; isPermitDisabledMode: boolean } => subAccount !== undefined);

    const subAccounts = validSubs.reduce<Record<Address, ISubAccount>>((acc, sa) => {
      const { isLockdownMode: _lm, isPermitDisabledMode: _pm, ...subAccount } = sa;
      acc[getAddress(sa.account)] = subAccount;
      return acc;
    }, {});

    const mainSubAccount = validSubs.find((sa) => sa.account === sa.owner);
    return {
      result: {
      chainId,
      owner: address,
      isLockdownMode: mainSubAccount?.isLockdownMode ?? false,
      isPermitDisabledMode: mainSubAccount?.isPermitDisabledMode ?? false,
      subAccounts,
    },
      errors,
    };

  }

  async fetchSubAccount(chainId: number, subAccount: Address, vaults: Address[] = []): Promise<ServiceResult<(ISubAccount & { isLockdownMode: boolean; isPermitDisabledMode: boolean }) | undefined>> {
    const errors: DataIssue[] = [];
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const accountLensAddress = deployment.addresses.lensAddrs.accountLens;
    const evc = deployment.addresses.coreAddrs.evc;

    // Get EVC account info
    const evcAccountInfoResult = await this.queryEVCAccountInfo(provider, accountLensAddress, evc, subAccount);

    if (!evcAccountInfoResult) return { result: undefined, errors };

    const evcAccountInfo = evcAccountInfoResult as EVCAccountInfo;

    if (vaults.length === 0) {
      return {
        result: this.buildSubAccount(evcAccountInfo, [], errors),
        errors,
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

    return {
      result: this.buildSubAccount(evcAccountInfo, vaultAccountInfos, errors),
      errors,
    };
  }

  buildSubAccount(
    evcAccountInfo: EVCAccountInfo,
    vaultAccountInfos: VaultAccountInfo[],
    errors: DataIssue[],
  ): ISubAccount & { isLockdownMode: boolean; isPermitDisabledMode: boolean } {
    const subAccountData = convertToSubAccount(evcAccountInfo, vaultAccountInfos, errors);
    return {
      ...subAccountData,
      isLockdownMode: evcAccountInfo.isLockdownMode,
      isPermitDisabledMode: evcAccountInfo.isPermitDisabledMode,
    };
  }

  buildAccount(
    chainId: number,
    owner: Address,
    subAccounts: ISubAccount[],
    enabledCollaterals: Address[],
    enabledControllers: Address[],
    isLockdownMode: boolean,
    isPermitDisabledMode: boolean,
  ): IAccount {
    const map = subAccounts.reduce<Record<Address, ISubAccount>>((acc, sa) => {
      acc[getAddress(sa.account)] = sa;
      return acc;
    }, {});

    const main = map[getAddress(owner)];
    if (main) {
      main.enabledCollaterals = enabledCollaterals;
      main.enabledControllers = enabledControllers;
    }

    return {
      chainId,
      owner: getAddress(owner),
      isLockdownMode,
      isPermitDisabledMode,
      subAccounts: map,
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
        this.queryEVaultInfoFull(provider, vaultLensAddress, vault)
          .then((result) => new EVault(convertVaultInfoFullToIEVault(result as unknown as VaultInfoFull, chainId, [])))
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
            this.batchSimulationAdapter,
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
