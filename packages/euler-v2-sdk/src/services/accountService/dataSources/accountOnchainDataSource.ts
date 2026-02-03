import { IAccountDataSource } from "../accountService.js";
import { ProviderService } from "../../providerService/index.js";
import { DeploymentService } from "../../deploymentService/index.js";
import { Address, getAddress } from "viem";
import { IAccount, SubAccount } from "../../../entities/Account.js";
import { VaultAccountInfo, EVCAccountInfo } from "./accountLensTypes.js";
import { convertToSubAccount } from "./accountInfoConverter.js";
import { AccountVaults } from "./accountVaultsSubgraphDataSource.js";
import { accountLensAbi } from "./abis/accountLensAbi.js";

export interface IAccountVaultsDataSource {
  getAccountVaults(chainId: number, account: Address): Promise<AccountVaults>;
}

export class AccountOnchainDataSource implements IAccountDataSource {
  constructor(
    private readonly providerService: ProviderService,
    private readonly deploymentService: DeploymentService,
    private readonly positionsDataSource: IAccountVaultsDataSource
  ) {}

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
    const evcAccountInfoResult = await provider.readContract({
      address: accountLensAddress,
      abi: accountLensAbi,
      functionName: "getEVCAccountInfo",
      args: [evc, subAccount],
    });

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

    // Fetch vault account info for all vaults
    const vaultAccountInfoCalls = vaults.map((vault) => ({
      address: accountLensAddress,
      abi: accountLensAbi,
      functionName: "getVaultAccountInfo" as const,
      args: [subAccount, vault],
    }));

    const vaultResults = await provider.multicall({
      contracts: vaultAccountInfoCalls,
    });

    const vaultAccountInfos: VaultAccountInfo[] = vaultResults.map((result, idx) => {
      if (!result || result.status !== "success" || !result.result) {
        throw new Error(
          `Failed to fetch vault account info for ${subAccount} in vault ${vaults[idx]}: ${result?.error?.message || "Unknown error"}`
        );
      }

      return result.result as VaultAccountInfo;
    });

    const fullSubAccount = convertToSubAccount(evcAccountInfo, vaultAccountInfos);
    return {
      ...fullSubAccount,
      isLockdownMode: evcAccountInfo.isLockdownMode,
      isPermitDisabledMode: evcAccountInfo.isPermitDisabledMode,
    };
  }
}
