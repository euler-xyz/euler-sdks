import { IWalletDataSource } from "../walletService.js";
import { ProviderService } from "../../providerService/index.js";
import { IABIService } from "../../abiService/index.js";
import { DeploymentService } from "../../deploymentService/index.js";
import { Address, getAddress, erc20Abi } from "viem";
import { IWallet, WalletAsset, AssetAllowances } from "../../../entities/Wallet.js";

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
    private readonly abiService: IABIService,
    private readonly deploymentService: DeploymentService
  ) {}

  async fetchWallet(
    chainId: number,
    account: Address,
    asset: Address,
    spenders: Address[]
  ): Promise<IWallet | undefined> {
    const provider = this.providerService.getProvider(chainId);
    const deployment = this.deploymentService.getDeployment(chainId);
    const permit2Address = deployment.addresses.coreAddrs.permit2;
    const assetAddress = getAddress(asset);

    try {
      // Build multicall contracts array
      const contracts = [
        // Balance call
        {
          address: assetAddress,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [account],
        },
        // For each spender, fetch:
        // 1. ERC20 allowance from asset to spender (vault)
        // 2. ERC20 allowance from asset to permit2
        // 3. Permit2 allowance from user to spender through permit2
        ...spenders.flatMap((spender) => [
          // assetForVault
          {
            address: assetAddress,
            abi: erc20Abi,
            functionName: "allowance" as const,
            args: [account, spender],
          },
          // assetForPermit2
          {
            address: assetAddress,
            abi: erc20Abi,
            functionName: "allowance" as const,
            args: [account, permit2Address],
          },
          // assetForVaultInPermit2 and expiration
          {
            address: permit2Address,
            abi: permit2AllowanceAbi,
            functionName: "allowance" as const,
            args: [account, assetAddress, spender],
          },
        ]),
      ];

      // Execute multicall
      const results = await provider.multicall({ contracts });

      // Parse balance result
      const balanceResult = results[0];
      if (!balanceResult || balanceResult.status !== "success" || !balanceResult.result) {
        throw new Error(`Failed to fetch balance for ${account} and asset ${asset}`);
      }
      const balance = balanceResult.result as bigint;

      // Parse allowance results for each spender
      const allowances: Record<Address, AssetAllowances> = {};
      for (let i = 0; i < spenders.length; i++) {
        const spender = spenders[i];
        if (!spender) continue;

        // Each spender has 3 calls: assetForVault, assetForPermit2, permit2Allowance
        const baseIndex = 1 + i * 3;
        
        const assetForVaultResult = results[baseIndex];
        const assetForPermit2Result = results[baseIndex + 1];
        const permit2AllowanceResult = results[baseIndex + 2];

        const assetForVault = 
          assetForVaultResult && assetForVaultResult.status === "success" && assetForVaultResult.result !== undefined
            ? (assetForVaultResult.result as bigint)
            : 0n;

        const assetForPermit2 = 
          assetForPermit2Result && assetForPermit2Result.status === "success" && assetForPermit2Result.result !== undefined
            ? (assetForPermit2Result.result as bigint)
            : 0n;

        let assetForVaultInPermit2 = 0n;
        let permit2ExpirationTime = 0;

        if (permit2AllowanceResult && permit2AllowanceResult.status === "success" && permit2AllowanceResult.result) {
          const result = permit2AllowanceResult.result;
          if (Array.isArray(result) && result.length >= 2) {
            assetForVaultInPermit2 = result[0] as bigint;
            permit2ExpirationTime = Number(result[1]);
          }
        }

        allowances[getAddress(spender)] = {
          assetForVault,
          assetForPermit2,
          assetForVaultInPermit2,
          permit2ExpirationTime,
        };
      }

      const walletAsset: WalletAsset = {
        account,
        asset: assetAddress,
        balance,
        allowances,
      };

      return {
        account,
        assets: [walletAsset],
      };
    } catch (error) {
      console.error(`Failed to fetch wallet info for ${account} and asset ${asset}:`, error);
      return undefined;
    }
  }
}
