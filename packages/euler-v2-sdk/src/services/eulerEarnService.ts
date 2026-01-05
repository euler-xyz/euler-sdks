import { EulerEarn, IEulerEarn } from "../entities/EulerEarn.js";
import { Address } from "viem";
import { ProviderService } from "./providerService.js";
import { IABIService } from "./abiService.js";
import { DeploymentService } from "./deploymentService.js";

export interface IEulerEarnDataSource {
  fetchVaults(chainId: number, vault: Address[]): Promise<IEulerEarn[]>;
  fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]>;
}

export enum StandardPerspectives {
  GOVERNED = "eulerEarnGovernedPerspective",
  FACTORY = "eulerEarnFactoryPerspective",
}

export class EulerEarnService {
  constructor(private readonly dataSource: IEulerEarnDataSource, private readonly deploymentService: DeploymentService) { }

  async fetchEulerEarn(chainId: number, vault: Address): Promise<EulerEarn> {
    const vaults = await this.dataSource.fetchVaults(chainId, [vault]);
    if (vaults.length === 0) {
      throw new Error(`Vault not found for ${vault}`);
    }
    return new EulerEarn(vaults[0]!);
  }

  async fetchEulerEarns(chainId: number, vaults: Address[]): Promise<EulerEarn[]> {
    return (await this.dataSource.fetchVaults(chainId, vaults)).map(vault => new EulerEarn(vault));
  }

  async fetchVerifiedEulerEarnAddresses(chainId: number, perspectives: (StandardPerspectives | Address)[]): Promise<Address[]> {
    if (perspectives.length === 0) {
      return [];
    }

    const perspectiveAddresses = perspectives.map(perspective => {
      if (perspective.startsWith("0x")) {
        return perspective as Address;
      }

      const deployment = this.deploymentService.getDeployment(chainId);
      if(!deployment.addresses.peripheryAddrs?.[perspective as StandardPerspectives]) {
        throw new Error(`Perspective address not found for ${perspective}`);
      }

      return deployment.addresses.peripheryAddrs[perspective as StandardPerspectives] as Address;
    });
    return this.dataSource.fetchVerifiedVaultsAddresses(chainId, perspectiveAddresses);
  }

  async fetchVerifiedEulerEarns(chainId: number, perspectives: (StandardPerspectives | Address)[]): Promise<EulerEarn[]> {
    const addresses = await this.fetchVerifiedEulerEarnAddresses(chainId, perspectives);
    return this.fetchEulerEarns(chainId, addresses);
  }
}

export class EulerEarnOnchainDataSource implements IEulerEarnDataSource {
  constructor(
    private readonly providerService: ProviderService,
    private readonly abiService: IABIService,
    private readonly deploymentService: DeploymentService
  ) {}

  async fetchVaults(chainId: number, vaults: Address[]): Promise<IEulerEarn[]> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const lensAddress = deployment.addresses.lensAddrs.eulerEarnVaultLens;
    const abi = await this.abiService.getABI(chainId, "EulerEarnVaultLens");
    const results = await provider.multicall({
      contracts: vaults.map(vault => ({
        address: lensAddress,
        abi,
        functionName: "getVaultInfoFull",
        args: [vault],
      })),
    });

    const parsedVaults: IEulerEarn[] = results.map((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        const result = callResult.result as any;
        
        // Transform the result to match IEulerEarn interface
        return {
          timestamp: result.timestamp,
          address: result.vault,
          vault: {
            name: result.vaultName,
            symbol: result.vaultSymbol,
            address: result.vault,
            decimals: result.vaultDecimals,
          },
          asset: {
            name: result.assetName,
            symbol: result.assetSymbol,
            address: result.asset,
            decimals: result.assetDecimals,
          },
          totalShares: result.totalShares,
          totalAssets: result.totalAssets,
          lostAssets: result.lostAssets,
          availableAssets: result.availableAssets,
          timelock: result.timelock,
          performanceFee: result.performanceFee,
          feeReceiver: result.feeReceiver,
          owner: result.owner,
          creator: result.creator,
          curator: result.curator,
          guardian: result.guardian,
          evc: result.evc,
          permit2: result.permit2,
          pendingTimelock: result.pendingTimelock,
          pendingTimelockValidAt: result.pendingTimelockValidAt,
          pendingGuardian: result.pendingGuardian,
          pendingGuardianValidAt: result.pendingGuardianValidAt,
          supplyQueue: result.supplyQueue,
          strategies: result.strategies.map((strategy: any) => ({
            strategy: strategy.strategy,
            allocatedAssets: strategy.allocatedAssets,
            availableAssets: strategy.availableAssets,
            currentAllocationCap: strategy.currentAllocationCap,
            pendingAllocationCap: strategy.pendingAllocationCap,
            pendingAllocationCapValidAt: strategy.pendingAllocationCapValidAt,
            removableAt: strategy.removableAt,
            info: strategy.info,
          })),
        };
      }

      throw new Error(
        `Failed to fetch vault data for ${vaults[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return parsedVaults;
  }

  async fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]> {
    const provider = this.providerService.getProvider(chainId);
    const abi = await this.abiService.getABI(chainId, "BasePerspective");

    const results = await provider.multicall({
      contracts: perspectives.map(perspective => ({
        address: perspective,
        abi,
        functionName: "verifiedArray",
      })),
    });

    const addresses: Address[] = results.flatMap((callResult, idx) => {
      if (callResult.status === "success" && callResult.result) {
        return callResult.result as Address[];
      }

      throw new Error(
        `Failed to fetch verified vaults for ${perspectives[idx]}: ${callResult.error ? callResult.error.message : "Unknown error"
        }`
      );
    });

    return addresses;
  }
}

