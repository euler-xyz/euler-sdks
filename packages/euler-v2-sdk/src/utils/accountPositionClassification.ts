import { type Address, getAddress, isAddressEqual } from "viem";
import type {
	AccountPosition,
	IHasVaultAddress,
	SubAccount,
} from "../entities/Account.js";

export type AccountPositionFilter<
	TVaultEntity extends IHasVaultAddress = IHasVaultAddress,
> = (position: AccountPosition<TVaultEntity>) => boolean;

/**
 * Resolve the active collateral positions backing a borrow position.
 *
 * This mirrors Portfolio's borrow/savings classification: prefer collateral
 * addresses from account liquidity, then fall back to enabled collaterals when
 * liquidity is unavailable. Only positions actually present on the sub-account
 * are returned, so callers do not treat enabled-but-empty collateral slots as
 * active savings/collateral.
 */
export function resolveBorrowCollateralPositions<
	TVaultEntity extends IHasVaultAddress,
>(
	subAccount: SubAccount<TVaultEntity>,
	borrow: AccountPosition<TVaultEntity>,
	positionFilter?: AccountPositionFilter<TVaultEntity>,
): AccountPosition<TVaultEntity>[] {
	return resolveBorrowCollateralVaults(subAccount, borrow).flatMap(
		(collateralAddress) => {
			const collateral = subAccount.positions.find((position) =>
				isAddressEqual(position.vaultAddress, collateralAddress),
			);
			if (!collateral) return [];
			if (positionFilter && !positionFilter(collateral)) return [];
			return [collateral];
		},
	);
}

export function resolveBorrowCollateralVaults<
	TVaultEntity extends IHasVaultAddress,
>(
	subAccount: SubAccount<TVaultEntity>,
	borrow: AccountPosition<TVaultEntity>,
): Address[] {
	const liquidityCollaterals =
		borrow.liquidity?.collaterals.map((collateral) =>
			getAddress(collateral.address),
		) ?? [];

	return liquidityCollaterals.length > 0
		? liquidityCollaterals
		: subAccount.enabledCollaterals.map((collateral) => getAddress(collateral));
}
