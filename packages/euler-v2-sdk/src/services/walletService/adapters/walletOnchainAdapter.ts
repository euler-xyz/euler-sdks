import { IWalletAdapter, AssetWithSpenders } from "../walletService.js";
import { ProviderService } from "../../providerService/index.js";
import { DeploymentService } from "../../deploymentService/index.js";
import { Address, getAddress, erc20Abi } from "viem";
import { IWallet, WalletAsset, AssetAllowances } from "../../../entities/Wallet.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../utils/buildQuery.js";
import {
  type DataIssue,
  type ServiceResult,
} from "../../../utils/entityDiagnostics.js";
import { numberLikeToSafeFiniteNumber } from "../../../utils/normalization.js";

// Permit2 IAllowanceTransfer.allowance function ABI
const permit2AllowanceAbi = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    stateMutability: "view",
  },
] as const;

export class WalletOnchainAdapter implements IWalletAdapter {
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

  queryBalanceOf = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    asset: Address,
    account: Address
  ): Promise<bigint> => {
    return provider.readContract({
      address: asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  };

  setQueryBalanceOf(fn: typeof this.queryBalanceOf): void {
    this.queryBalanceOf = fn;
  }

  queryAllowance = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    asset: Address,
    owner: Address,
    spender: Address
  ): Promise<bigint> => {
    return provider.readContract({
      address: asset,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    });
  };

  setQueryAllowance(fn: typeof this.queryAllowance): void {
    this.queryAllowance = fn;
  }

  queryPermit2Allowance = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    permit2Address: Address,
    owner: Address,
    asset: Address,
    spender: Address
  ): Promise<readonly [bigint, number, number]> => {
    return provider.readContract({
      address: permit2Address,
      abi: permit2AllowanceAbi,
      functionName: "allowance",
      args: [owner, asset, spender],
    });
  };

  setQueryPermit2Allowance(fn: typeof this.queryPermit2Allowance): void {
    this.queryPermit2Allowance = fn;
  }

  async fetchWallet(
    chainId: number,
    account: Address,
    assetsWithSpenders: AssetWithSpenders[]
  ): Promise<ServiceResult<IWallet | undefined>> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const permit2Address = deployment.addresses.coreAddrs.permit2;
    const errors: DataIssue[] = [];

    try {
      const walletAssets: WalletAsset[] = [];

      // Fetch all data in parallel
      const assetResults = await Promise.all(
        assetsWithSpenders.map(async ({ asset, spenders }, assetIdx) => {
          const assetAddress = getAddress(asset);

          const balanceResult = await this.queryBalanceOf(provider, assetAddress, account)
            .then((value) => ({ value, failed: false as const }))
            .catch(() => ({ value: undefined, failed: true as const }));

          const spenderResults = await Promise.all(
            spenders.map(async (spender, spenderIdx) => {
              const assetForVault = await this.queryAllowance(provider, assetAddress, account, spender)
                .then((value) => ({ value, failed: false as const }))
                .catch(() => ({ value: 0n, failed: true as const }));

              const assetForPermit2 = await this.queryAllowance(provider, assetAddress, account, permit2Address)
                .then((value) => ({ value, failed: false as const }))
                .catch(() => ({ value: 0n, failed: true as const }));

              const permit2Allowance = await this.queryPermit2Allowance(
                provider,
                permit2Address,
                account,
                assetAddress,
                spender
              )
                .then((value) => ({ value, failed: false as const }))
                .catch(
                  () =>
                    ({
                      value: [0n, 0, 0] as unknown as readonly [bigint, number, number],
                      failed: true as const,
                    })
                );

              if (assetForVault.failed) {
                errors.push({
                  code: "SOURCE_UNAVAILABLE",
                  severity: "warning",
                  message: "Failed to fetch asset allowance for spender; defaulted to 0.",
                  path: `$.assets[${assetIdx}].allowances[${spenderIdx}].assetForVault`,
                  source: "erc20.allowance",
                  normalizedValue: "0",
                });
              }
              if (assetForPermit2.failed) {
                errors.push({
                  code: "SOURCE_UNAVAILABLE",
                  severity: "warning",
                  message: "Failed to fetch Permit2 allowance approval; defaulted to 0.",
                  path: `$.assets[${assetIdx}].allowances[${spenderIdx}].assetForPermit2`,
                  source: "erc20.allowance",
                  normalizedValue: "0",
                });
              }
              if (permit2Allowance.failed) {
                errors.push({
                  code: "SOURCE_UNAVAILABLE",
                  severity: "warning",
                  message: "Failed to fetch Permit2 spender allowance; defaulted to 0.",
                  path: `$.assets[${assetIdx}].allowances[${spenderIdx}].assetForVaultInPermit2`,
                  source: "permit2.allowance",
                  normalizedValue: "0",
                });
              }

              return { spender, assetForVault, assetForPermit2, permit2Allowance };
            })
          );

          return { assetAddress, balanceResult, spenders, spenderResults };
        })
      );

      for (const { assetAddress, balanceResult, spenders, spenderResults } of assetResults) {
        const balance = balanceResult.value;
        if (balance === undefined) {
          errors.push({
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: "Failed to fetch asset balance; asset entry omitted from wallet result.",
            path: "$.assets",
            source: "erc20.balanceOf",
            originalValue: assetAddress,
            normalizedValue: "asset-omitted",
          });
          console.error(`Failed to fetch balance for ${account} and asset ${assetAddress}`);
          continue;
        }

        const allowances: Record<Address, AssetAllowances> = {};
        for (let i = 0; i < spenders.length; i++) {
          const spender = spenders[i];
          if (!spender) continue;

          const result = spenderResults[i];
          if (!result) continue;
          const assetForVault = result.assetForVault.value;
          const assetForPermit2 = result.assetForPermit2.value;
          const permit2Result = result.permit2Allowance.value;

          const assetForVaultInPermit2 = permit2Result?.[0] ?? 0n;
          const permit2ExpirationTime = numberLikeToSafeFiniteNumber(
            (permit2Result?.[1] ?? 0) as bigint | number,
            {
              path: `$.assets.allowances[${i}].permit2ExpirationTime`,
              errors,
              source: "permit2.allowance",
              fallback: 0,
            }
          );

          allowances[getAddress(spender)] = {
            assetForVault,
            assetForPermit2,
            assetForVaultInPermit2,
            permit2ExpirationTime,
          };
        }

        walletAssets.push({
          account,
          asset: assetAddress,
          balance,
          allowances,
        });
      }

      return { result: {
        chainId,
        account,
        assets: walletAssets,
      }, errors };
    } catch (error) {
      console.error(`Failed to fetch wallet info for ${account}:`, error);
      errors.push({
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to fetch wallet info.",
        path: "$",
        source: "walletOnchainAdapter",
        originalValue: error instanceof Error ? error.message : String(error),
      });
      return { result: undefined, errors };
    }
  }
}
