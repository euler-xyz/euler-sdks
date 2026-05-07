import { getAddress, maxInt256 } from "viem";
import type {
	ISubAccount,
	IAccountLiquidity,
	DaysToLiquidation,
} from "../../../../entities/Account.js";
import { AccountPosition } from "../../../../entities/Account.js";
import type {
	EVCAccountInfo,
	VaultAccountInfo,
	AccountLiquidityInfo,
} from "./accountLensTypes.js";
import type { DataIssue } from "../../../../utils/entityDiagnostics.js";
import {
	accountPositionCollateralDiagnosticOwner,
	accountPositionDiagnosticOwner,
	dataIssueLocation,
	subAccountDiagnosticOwner,
} from "../../../../utils/entityDiagnostics.js";
import { bigintToSafeNumber } from "../../../../utils/normalization.js";

/**
 * Converts AccountLens's AccountLiquidityInfo object to an IAccountLiquidity object
 * @param liquidityInfo - The AccountLiquidityInfo object to convert
 * @returns The IAccountLiquidity object
 */
function convertAccountLiquidityInfoToAccountLiquidity(
	liquidityInfo: AccountLiquidityInfo,
	chainId: number,
	account: `0x${string}`,
	positionVault: `0x${string}`,
	errors: DataIssue[],
): IAccountLiquidity {
	const positionOwner = accountPositionDiagnosticOwner(
		chainId,
		account,
		positionVault,
	);
	const liabilityValue = {
		borrowing: liquidityInfo.liabilityValueBorrowing,
		liquidation: liquidityInfo.liabilityValueLiquidation,
		oracleMid: liquidityInfo.liabilityValueLiquidation, // vault liquidation value is oraclemid
	};

	const totalCollateralValue = {
		borrowing: liquidityInfo.collateralValueBorrowing,
		liquidation: liquidityInfo.collateralValueLiquidation,
		oracleMid: liquidityInfo.collateralValueRaw,
	};

	const hasCollateralValue = liquidityInfo.collaterals.some((_, idx) => {
		const borrowing = liquidityInfo.collateralValuesBorrowing[idx] ?? 0n;
		const liquidation = liquidityInfo.collateralValuesLiquidation[idx] ?? 0n;
		const oracleMid = liquidityInfo.collateralValuesRaw[idx] ?? 0n;
		return borrowing !== 0n || liquidation !== 0n || oracleMid !== 0n;
	});

	const collaterals = liquidityInfo.collaterals.flatMap((collateral, idx) => {
		const collateralAddress = getAddress(collateral);
		const borrowing = liquidityInfo.collateralValuesBorrowing[idx];
		const liquidation = liquidityInfo.collateralValuesLiquidation[idx];
		const oracleMid = liquidityInfo.collateralValuesRaw[idx];

		if (borrowing === undefined) {
			errors.push({
				code: "DEFAULT_APPLIED",
				severity: "warning",
				message: "Missing collateral borrowing value; defaulted to 0.",
				locations: [
					dataIssueLocation(
						accountPositionCollateralDiagnosticOwner(
							chainId,
							account,
							positionVault,
							collateralAddress,
						),
						"$.value.borrowing",
					),
				],
				source: "accountLens",
				normalizedValue: "0",
			});
		}
		if (liquidation === undefined) {
			errors.push({
				code: "DEFAULT_APPLIED",
				severity: "warning",
				message: "Missing collateral liquidation value; defaulted to 0.",
				locations: [
					dataIssueLocation(
						accountPositionCollateralDiagnosticOwner(
							chainId,
							account,
							positionVault,
							collateralAddress,
						),
						"$.value.liquidation",
					),
				],
				source: "accountLens",
				normalizedValue: "0",
			});
		}
		if (oracleMid === undefined) {
			errors.push({
				code: "DEFAULT_APPLIED",
				severity: "warning",
				message: "Missing collateral oracleMid value; defaulted to 0.",
				locations: [
					dataIssueLocation(
						accountPositionCollateralDiagnosticOwner(
							chainId,
							account,
							positionVault,
							collateralAddress,
						),
						"$.value.oracleMid",
					),
				],
				source: "accountLens",
				normalizedValue: "0",
			});
		}

		const value = {
			borrowing: borrowing ?? 0n,
			liquidation: liquidation ?? 0n,
			oracleMid: oracleMid ?? 0n,
		};

		if (
			hasCollateralValue &&
			value.borrowing === 0n &&
			value.liquidation === 0n &&
			value.oracleMid === 0n
		) {
			return [];
		}

		return [
			{
				address: collateralAddress,
				value,
			},
		];
	});

	let daysToLiquidation: DaysToLiquidation = "Infinity";
	if (liquidityInfo.timeToLiquidation !== maxInt256) {
		if (liquidityInfo.timeToLiquidation === maxInt256 - 1n) {
			daysToLiquidation = "MoreThanAYear";
		} else {
			daysToLiquidation = bigintToSafeNumber(liquidityInfo.timeToLiquidation, {
				path: "$.daysToLiquidation",
				errors,
				source: "accountLens",
				owner: positionOwner,
			});
		}
	}

	return {
		vaultAddress: getAddress(liquidityInfo.vault),
		unitOfAccount: getAddress(liquidityInfo.unitOfAccount),
		daysToLiquidation,
		liabilityValue,
		totalCollateralValue,
		collaterals,
	};
}

/**
 * Converts AccountLens's VaultAccountInfo object to an AccountPosition object
 * @param vaultAccountInfo - The VaultAccountInfo object to convert
 * @returns The AccountPosition object
 */
export function convertVaultAccountInfoToAccountPosition(
	vaultAccountInfo: VaultAccountInfo,
	chainId: number,
	errors: DataIssue[],
): AccountPosition {
	let liquidity: IAccountLiquidity | undefined;
	if (vaultAccountInfo.borrowed !== 0n) {
		if (vaultAccountInfo.liquidityInfo.queryFailure) {
			const message = `Failed to fetch liquidity for position ${vaultAccountInfo.vault} for sub-account ${vaultAccountInfo.account}: ${vaultAccountInfo.liquidityInfo.queryFailureReason}`;
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "warning",
				message,
				locations: [
					dataIssueLocation(
						accountPositionDiagnosticOwner(
							chainId,
							getAddress(vaultAccountInfo.account),
							getAddress(vaultAccountInfo.vault),
						),
						"$.liquidity",
					),
				],
				source: "accountLens",
				originalValue: vaultAccountInfo.liquidityInfo.queryFailureReason,
			});
		} else {
			liquidity = convertAccountLiquidityInfoToAccountLiquidity(
				vaultAccountInfo.liquidityInfo,
				chainId,
				getAddress(vaultAccountInfo.account),
				getAddress(vaultAccountInfo.vault),
				errors,
			);
		}
	}

	const positionData = {
		account: getAddress(vaultAccountInfo.account),
		vaultAddress: getAddress(vaultAccountInfo.vault),
		asset: getAddress(vaultAccountInfo.asset),
		shares: vaultAccountInfo.shares,
		assets: vaultAccountInfo.assets,
		borrowed: vaultAccountInfo.borrowed,
		isController: vaultAccountInfo.isController,
		isCollateral: vaultAccountInfo.isCollateral,
		liquidity,
		balanceForwarderEnabled: vaultAccountInfo.balanceForwarderEnabled,
	};
	return new AccountPosition(positionData);
}

/**
 * Converts AccountLens's EVCAccountInfo and VaultAccountInfo[] to a SubAccount object
 * @param evcAccountInfo - The EVCAccountInfo object
 * @param vaultAccountInfos - Array of VaultAccountInfo objects
 * @returns The SubAccount object
 */
export function convertToSubAccount(
	evcAccountInfo: EVCAccountInfo,
	vaultAccountInfos: VaultAccountInfo[],
	chainId: number,
	errors: DataIssue[],
): ISubAccount {
	const positions = vaultAccountInfos.map((info) =>
		convertVaultAccountInfoToAccountPosition(info, chainId, errors),
	);
	const subAccountData: ISubAccount = {
		timestamp: bigintToSafeNumber(evcAccountInfo.timestamp, {
			path: "$.timestamp",
			errors,
			source: "accountLens",
			owner: subAccountDiagnosticOwner(
				chainId,
				getAddress(evcAccountInfo.account),
			),
		}),
		account: getAddress(evcAccountInfo.account),
		owner: getAddress(evcAccountInfo.owner),
		lastAccountStatusCheckTimestamp: bigintToSafeNumber(
			evcAccountInfo.lastAccountStatusCheckTimestamp,
			{
				path: "$.lastAccountStatusCheckTimestamp",
				errors,
				source: "accountLens",
				owner: subAccountDiagnosticOwner(
					chainId,
					getAddress(evcAccountInfo.account),
				),
			},
		),
		enabledControllers: evcAccountInfo.enabledControllers.map(getAddress),
		enabledCollaterals: evcAccountInfo.enabledCollaterals.map(getAddress),
		positions,
	};
	return subAccountData;
}
