import { IWalletDataSource, AssetWithSpenders } from "../walletService.js";
import { ProviderService } from "../../providerService/index.js";
import { DeploymentService } from "../../deploymentService/index.js";
import { Address, getAddress, erc20Abi } from "viem";
import { IWallet, WalletAsset, AssetAllowances } from "../../../entities/Wallet.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../utils/buildQuery.js";

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

export class WalletOnchainDataSource implements IWalletDataSource {
  constructor(
    private readonly providerService: ProviderService,
    private readonly deploymentService: DeploymentService,
    buildQuery?: BuildQueryFn,
  ) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
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
  ): Promise<IWallet | undefined> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const permit2Address = deployment.addresses.coreAddrs.permit2;

    try {
      const walletAssets: WalletAsset[] = [];

      // Fetch all data in parallel
      const assetResults = await Promise.all(
        assetsWithSpenders.map(async ({ asset, spenders }) => {
          const assetAddress = getAddress(asset);

          const [balance, ...spenderResults] = await Promise.all([
            this.queryBalanceOf(provider, assetAddress, account).catch(() => undefined),
            ...spenders.flatMap((spender) => [
              this.queryAllowance(provider, assetAddress, account, spender).catch(() => 0n),
              this.queryAllowance(provider, assetAddress, account, permit2Address).catch(() => 0n),
              this.queryPermit2Allowance(provider, permit2Address, account, assetAddress, spender).catch(() => [0n, 0, 0] as unknown as readonly [bigint, number, number]),
            ]),
          ]);

          return { assetAddress, balance, spenders, spenderResults };
        })
      );

      for (const { assetAddress, balance, spenders, spenderResults } of assetResults) {
        if (balance === undefined) {
          console.error(`Failed to fetch balance for ${account} and asset ${assetAddress}`);
          continue;
        }

        const allowances: Record<Address, AssetAllowances> = {};
        for (let i = 0; i < spenders.length; i++) {
          const spender = spenders[i];
          if (!spender) continue;

          const assetForVault = (spenderResults[i * 3] ?? 0n) as bigint;
          const assetForPermit2 = (spenderResults[i * 3 + 1] ?? 0n) as bigint;
          const permit2Result = spenderResults[i * 3 + 2] as readonly [bigint, number, number];

          const assetForVaultInPermit2 = permit2Result?.[0] ?? 0n;
          const permit2ExpirationTime = Number(permit2Result?.[1] ?? 0);

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

      return {
        chainId,
        account,
        assets: walletAssets,
      };
    } catch (error) {
      console.error(`Failed to fetch wallet info for ${account}:`, error);
      return undefined;
    }
  }
}
