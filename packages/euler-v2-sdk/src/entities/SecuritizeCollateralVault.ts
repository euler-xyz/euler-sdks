import { Address } from "viem";
import {
  ERC4626Vault,
  IERC4626Vault,
  IERC4626VaultConversion,
} from "./ERC4626Vault.js";

export interface ISecuritizeCollateralVault extends IERC4626Vault {
  governor: Address;
  supplyCap: bigint;
}

export class SecuritizeCollateralVault
  extends ERC4626Vault
  implements ISecuritizeCollateralVault, IERC4626VaultConversion
{
  governor: Address;
  supplyCap: bigint;

  constructor(args: ISecuritizeCollateralVault) {
    super(args);
    this.governor = args.governor;
    this.supplyCap = args.supplyCap;
  }

  /** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
  override convertToAssets(shares: bigint): bigint {
    return shares;
  }

  /** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
  override convertToShares(assets: bigint): bigint {
    return assets;
  }
}
