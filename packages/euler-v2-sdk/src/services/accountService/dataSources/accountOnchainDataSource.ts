import { IAccountDataSource } from "../accountService.js";
import { ProviderService } from "../../providerService.js";
import { IABIService } from "../../abiService.js";
import { DeploymentService } from "../../deploymentService.js";
import { Address, getAddress } from "viem";
import { IAccount, SubAccount } from "../../../entities/Account.js";
import { VaultAccountInfo, EVCAccountInfo } from "./accountLensTypes.js";
import { convertToSubAccount } from "./accountInfoConverter.js";
import { AccountVaults } from "./accountVaultsSubgraphDataSource.js";

export interface IAccountVaultsDataSource {
  getAccountVaults(chainId: number, account: Address): Promise<AccountVaults>;
}

export class AccountOnchainDataSource implements IAccountDataSource {
  constructor(
    private readonly providerService: ProviderService,
    private readonly abiService: IABIService,
    private readonly deploymentService: DeploymentService,
    private readonly positionsDataSource: IAccountVaultsDataSource
  ) {}

  async fetchFullAccount(
    chainId: number,
    address: Address
  ): Promise<IAccount | undefined> {
    const accountVaults = await this.positionsDataSource.getAccountVaults(chainId, address);
    const subAccountAddresses = [...new Set(Object.keys(accountVaults).map((subAccountAddress) => getAddress(subAccountAddress)))];

    if (subAccountAddresses.length === 0) return undefined;

    const subAccounts = await Promise.all(subAccountAddresses.map(async (subAccountAddress) => {
      const vaults = [...new Set([
        ...(accountVaults?.[subAccountAddress]?.deposits ?? []),
        ...(accountVaults?.[subAccountAddress]?.borrows ?? [])
      ])].map((vault) => getAddress(vault));

      return this.fetchSubAccount(chainId, subAccountAddress, vaults);
    })).then((subAccounts) => subAccounts.filter((subAccount) => subAccount !== undefined) as SubAccount[]);

    return {
      chainId,
      timestamp: subAccounts[0]?.timestamp ?? 0,
      owner: address,
      subAccounts: subAccounts,
    } as IAccount;

  }

  async fetchSubAccount(chainId: number, subAccount: Address, vaults: Address[] = []): Promise<SubAccount | undefined> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const accountLensAddress = deployment.addresses.lensAddrs.accountLens;
    const abi = await this.abiService.getABI(chainId, "AccountLens");
    const evc = deployment.addresses.coreAddrs.evc;

    // Get EVC account info
    const evcAccountInfoResult = await provider.readContract({
      address: accountLensAddress,
      abi,
      functionName: "getEVCAccountInfo",
      args: [evc, subAccount],
    });

    if (!evcAccountInfoResult) return undefined;

    const evcAccountInfo = evcAccountInfoResult as EVCAccountInfo;

    if (vaults.length === 0) {
      return convertToSubAccount(evcAccountInfo, []);
    }

    // Fetch vault account info for all vaults
    const vaultAccountInfoCalls = vaults.map((vault) => ({
      address: accountLensAddress,
      abi,
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

    return convertToSubAccount(evcAccountInfo, vaultAccountInfos);
  }
}
