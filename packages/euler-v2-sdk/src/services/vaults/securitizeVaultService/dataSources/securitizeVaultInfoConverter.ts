import { ISecuritizeCollateralVault } from "../../../../entities/SecuritizeCollateralVault.js";
import { Token, VaultType } from "../../../../utils/types.js";
import type { VaultInfoERC4626 } from "./securitizeVaultLensTypes.js";

export function convertToISecuritizeCollateralVault(
  vaultInfo: VaultInfoERC4626,
  governor: `0x${string}`,
  supplyCap: bigint,
  chainId: number
): ISecuritizeCollateralVault {
  const shares: Token = {
    address: vaultInfo.vault,
    name: vaultInfo.vaultName,
    symbol: vaultInfo.vaultSymbol,
    decimals: Number(vaultInfo.vaultDecimals),
  };

  const asset: Token = {
    address: vaultInfo.asset,
    name: vaultInfo.assetName,
    symbol: vaultInfo.assetSymbol,
    decimals: Number(vaultInfo.assetDecimals),
  };

  return {
    type: VaultType.SecuritizeCollateral,
    chainId,
    address: vaultInfo.vault,
    shares,
    asset,
    totalShares: vaultInfo.totalShares,
    totalAssets: vaultInfo.totalAssets,
    governor,
    supplyCap,
  };
}
