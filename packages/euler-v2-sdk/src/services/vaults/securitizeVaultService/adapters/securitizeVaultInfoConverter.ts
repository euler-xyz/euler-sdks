import type { ISecuritizeCollateralVault } from "../../../../entities/SecuritizeCollateralVault.js";
import { type Token, VaultType } from "../../../../utils/types.js";
import type { VaultInfoERC4626 } from "./securitizeVaultLensTypes.js";
import type { DataIssue } from "../../../../utils/entityDiagnostics.js";
import { bigintToSafeNumber } from "../../../../utils/normalization.js";

export function convertToISecuritizeCollateralVault(
	vaultInfo: VaultInfoERC4626,
	governor: `0x${string}`,
	supplyCap: bigint,
	chainId: number,
	errors: DataIssue[],
): ISecuritizeCollateralVault {
	const shares: Token = {
		address: vaultInfo.vault,
		name: vaultInfo.vaultName,
		symbol: vaultInfo.vaultSymbol,
		decimals: bigintToSafeNumber(vaultInfo.vaultDecimals, {
			path: "$.shares.decimals",
			errors,
			source: "securitizeLens",
		}),
	};

	const asset: Token = {
		address: vaultInfo.asset,
		name: vaultInfo.assetName,
		symbol: vaultInfo.assetSymbol,
		decimals: bigintToSafeNumber(vaultInfo.assetDecimals, {
			path: "$.asset.decimals",
			errors,
			source: "securitizeLens",
		}),
	};

	const result: ISecuritizeCollateralVault = {
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
	return result;
}
