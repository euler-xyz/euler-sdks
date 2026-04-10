import type { ISecuritizeCollateralVault } from "../../../../entities/SecuritizeCollateralVault.js";
import { type Token, VaultType } from "../../../../utils/types.js";
import type { VaultInfoERC4626 } from "./securitizeVaultLensTypes.js";
import type { DataIssue } from "../../../../utils/entityDiagnostics.js";
import { bigintToSafeNumber } from "../../../../utils/normalization.js";

function normalizeTokenString(
	value: string,
	fallback: string,
	path: string,
	entityId: `0x${string}`,
	errors: DataIssue[],
): string {
	if (value.trim() !== "") return value;
	errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Empty string at ${path}; defaulted to ${JSON.stringify(fallback)}.`,
		paths: [path],
		entityId,
		source: "securitizeLens",
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
}

export function convertToISecuritizeCollateralVault(
	vaultInfo: VaultInfoERC4626,
	governor: `0x${string}`,
	supplyCap: bigint,
	chainId: number,
	errors: DataIssue[],
): ISecuritizeCollateralVault {
	const shares: Token = {
		address: vaultInfo.vault,
		name: normalizeTokenString(
			vaultInfo.vaultName,
			"Unknown Vault",
			"$.shares.name",
			vaultInfo.vault,
			errors,
		),
		symbol: normalizeTokenString(
			vaultInfo.vaultSymbol,
			"UNKNOWN",
			"$.shares.symbol",
			vaultInfo.vault,
			errors,
		),
		decimals: bigintToSafeNumber(vaultInfo.vaultDecimals, {
			path: "$.shares.decimals",
			errors,
			source: "securitizeLens",
		}),
	};

	const asset: Token = {
		address: vaultInfo.asset,
		name: normalizeTokenString(
			vaultInfo.assetName,
			"Unknown Asset",
			"$.asset.name",
			vaultInfo.vault,
			errors,
		),
		symbol: normalizeTokenString(
			vaultInfo.assetSymbol,
			"UNKNOWN",
			"$.asset.symbol",
			vaultInfo.vault,
			errors,
		),
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
		isBorrowable: false,
		shares,
		asset,
		totalShares: vaultInfo.totalShares,
		totalAssets: vaultInfo.totalAssets,
		governor,
		supplyCap,
	};
	return result;
}
