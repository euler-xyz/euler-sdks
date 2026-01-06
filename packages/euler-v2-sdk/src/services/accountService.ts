import { Account, IAccount, SubAccount, Position, AccountLiquidityInfo, AddressPrefix } from "../entities/Account.js";
import { Address, getAddress } from "viem";
import { ProviderService } from "./providerService.js";
import { IABIService } from "./abiService.js";
import { DeploymentService } from "./deploymentService.js";

export interface SubAccountVaults {
  subAccount: Address;
  vaults: Address[];
}

export interface IAccountDataSource {
  fetchFullAccount(chainId: number, address: Address): Promise<IAccount | undefined>;
  fetchSubAccount(chainId: number, subAccount: Address): Promise<SubAccount | undefined>;
}

export interface IAccountVaultsDataSource {
  getAccountVaults(chainId: number, account: Address): Promise<AccountVaults>;
}

export class AccountService {
  constructor(
    private readonly dataSource: IAccountDataSource
  ) {}

  // `address` in this context can be any sub-account, not just the main account.
  async fetchFullAccount(chainId: number, address: Address): Promise<Account | undefined> {
    const accountData = await this.dataSource.fetchFullAccount(chainId, address);
    if (!accountData) return undefined;
    return new Account(
      accountData.timestamp,
      accountData.owner,
      accountData.addressPrefix,
      accountData.subAccounts
    );
  }

  async fetchSubAccount(chainId: number, subAccount: Address): Promise<SubAccount | undefined> {
    return this.dataSource.fetchSubAccount(chainId, subAccount);
  }
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
      return this.fetchSubAccount(chainId, subAccountAddress);
    })).then((subAccounts) => subAccounts.filter((subAccount) => subAccount !== undefined));

    return {
      timestamp: 0n,
      owner: address,
      addressPrefix: `0x${address.substring(0, 42)}`,
      subAccounts,
    };
  }

  async fetchSubAccount(chainId: number, subAccount: Address): Promise<SubAccount | undefined> {
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

    const evcAccountInfo = evcAccountInfoResult as {
      timestamp: bigint;
      evc: Address;
      account: Address;
      addressPrefix: `0x${string}`;
      owner: Address;
      isLockdownMode: boolean;
      isPermitDisabledMode: boolean;
      lastAccountStatusCheckTimestamp: bigint;
      enabledControllers: Address[];
      enabledCollaterals: Address[];
    };

    // Get all vaults (controllers + collaterals that aren't controllers)
    const allVaults = [...evcAccountInfo.enabledControllers];
    for (const collateral of evcAccountInfo.enabledCollaterals) {
      if (!evcAccountInfo.enabledControllers.includes(collateral)) {
        allVaults.push(collateral);
      }
    }

    if (allVaults.length === 0) {
      return {
        timestamp: evcAccountInfo.timestamp,
        addressPrefix: evcAccountInfo.addressPrefix as AddressPrefix,
        account: evcAccountInfo.account,
        owner: evcAccountInfo.owner,
        isLockdownMode: evcAccountInfo.isLockdownMode,
        isPermitDisabledMode: evcAccountInfo.isPermitDisabledMode,
        lastAccountStatusCheckTimestamp: evcAccountInfo.lastAccountStatusCheckTimestamp,
        enabledControllers: evcAccountInfo.enabledControllers,
        enabledCollaterals: evcAccountInfo.enabledCollaterals,
        positions: [],
      };
    }

    // Fetch vault account info for all vaults
    const vaultAccountInfoCalls = allVaults.map((vault) => ({
      address: accountLensAddress,
      abi,
      functionName: "getVaultAccountInfo" as const,
      args: [subAccount, vault],
    }));

    const vaultResults = await provider.multicall({
      contracts: vaultAccountInfoCalls,
    });

    const positions: Position[] = vaultResults.map((result, idx) => {
      if (!result || result.status !== "success" || !result.result) {
        throw new Error(
          `Failed to fetch vault account info for ${subAccount} in vault ${allVaults[idx]}: ${result?.error?.message || "Unknown error"}`
        );
      }

      const vaultAccountInfo = result.result as {
        timestamp: bigint;
        account: Address;
        vault: Address;
        asset: Address;
        assetsAccount: bigint;
        shares: bigint;
        assets: bigint;
        borrowed: bigint;
        assetAllowanceVault: bigint;
        assetAllowanceVaultPermit2: bigint;
        assetAllowanceExpirationVaultPermit2: bigint;
        assetAllowancePermit2: bigint;
        balanceForwarderEnabled: boolean;
        isController: boolean;
        isCollateral: boolean;
        liquidityInfo: {
          queryFailure: boolean;
          queryFailureReason: string;
          account: Address;
          vault: Address;
          unitOfAccount: Address;
          timeToLiquidation: bigint;
          liabilityValueBorrowing: bigint;
          liabilityValueLiquidation: bigint;
          collateralValueBorrowing: bigint;
          collateralValueLiquidation: bigint;
          collateralValueRaw: bigint;
          collaterals: Address[];
          collateralValuesBorrowing: bigint[];
          collateralValuesLiquidation: bigint[];
          collateralValuesRaw: bigint[];
        };
      };

      return {
        timestamp: vaultAccountInfo.timestamp,
        account: vaultAccountInfo.account,
        vault: vaultAccountInfo.vault,
        asset: vaultAccountInfo.asset,
        assetsAccount: vaultAccountInfo.assetsAccount,
        shares: vaultAccountInfo.shares,
        assets: vaultAccountInfo.assets,
        borrowed: vaultAccountInfo.borrowed,
        assetAllowanceVault: vaultAccountInfo.assetAllowanceVault,
        assetAllowanceVaultPermit2: vaultAccountInfo.assetAllowanceVaultPermit2,
        assetAllowanceExpirationVaultPermit2: vaultAccountInfo.assetAllowanceExpirationVaultPermit2,
        assetAllowancePermit2: vaultAccountInfo.assetAllowancePermit2,
        balanceForwarderEnabled: vaultAccountInfo.balanceForwarderEnabled,
        isController: vaultAccountInfo.isController,
        isCollateral: vaultAccountInfo.isCollateral,
        liquidityInfo: vaultAccountInfo.liquidityInfo as AccountLiquidityInfo,
      };
    });

    return {
      timestamp: evcAccountInfo.timestamp,
      addressPrefix: evcAccountInfo.addressPrefix as AddressPrefix,
      account: evcAccountInfo.account,
      owner: evcAccountInfo.owner,
      isLockdownMode: evcAccountInfo.isLockdownMode,
      isPermitDisabledMode: evcAccountInfo.isPermitDisabledMode,
      lastAccountStatusCheckTimestamp: evcAccountInfo.lastAccountStatusCheckTimestamp,
      enabledControllers: evcAccountInfo.enabledControllers,
      enabledCollaterals: evcAccountInfo.enabledCollaterals,
      positions,
    };
  }
}

export interface AccountVaults {
  [vault: Address]: {
    deposits: Address[];
    borrows: Address[];
  };
}
export interface AccountVaultsSubgraphDataSourceConfig {
  subgraphURLs: Record<number, string>;
}
export class AccountVaultsSubgraphDataSource implements IAccountVaultsDataSource {
  constructor(
    private readonly config: AccountVaultsSubgraphDataSourceConfig
  ) {}

  async getAccountVaults(chainId: number, account: Address): Promise<AccountVaults> {
    const parseResult = (type: "deposits" | "borrows", results: AccountVaults, data: any) => {
      data.forEach((entry: any) => {
        const subAccount = getAddress(entry.substring(0, 42));
        const vault = getAddress(`0x${entry.substring(42)}`);
        if (!results[subAccount]) {
          results[subAccount] = {
          deposits: [],
          borrows: [],
        };

        results[subAccount][type].push(vault);
      }});
    };
    const subgraphUrl = this.config.subgraphURLs[chainId];
    if (!subgraphUrl) {
      throw new Error(`Subgraph URL not found for chain ${chainId}`);
    }
    const response = await fetch(subgraphUrl, {
      method: "POST",
      body: JSON.stringify({
        query: `query AccountBorrows {
          trackingActiveAccount(id: "${account}") {
            deposits
            borrows
          }
        }`,
        operationName: 'AccountVaults',
      }),
    });
    const data = await response.json() as any;
 
    const accountVaults: AccountVaults = {};
    parseResult("deposits", accountVaults, data.data?.trackingActiveAccount?.deposits || []);
    parseResult("borrows", accountVaults, data.data?.trackingActiveAccount?.borrows || []);

    return accountVaults;
  }
}