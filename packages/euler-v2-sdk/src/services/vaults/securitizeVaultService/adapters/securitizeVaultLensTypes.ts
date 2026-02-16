import { Address } from "viem";

/** TypeScript equivalent of VaultInfoERC4626 from evk-periphery LensTypes.sol (UtilsLens.getVaultInfoERC4626). */
export interface VaultInfoERC4626 {
  timestamp: bigint;
  vault: Address;
  vaultName: string;
  vaultSymbol: string;
  vaultDecimals: bigint;
  asset: Address;
  assetName: string;
  assetSymbol: string;
  assetDecimals: bigint;
  totalShares: bigint;
  totalAssets: bigint;
  isEVault: boolean;
}
