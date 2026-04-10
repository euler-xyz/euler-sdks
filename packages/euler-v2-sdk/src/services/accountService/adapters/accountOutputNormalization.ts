import { type Address, getAddress } from "viem";
import type {
	IAccount,
	IAccountLiquidity,
	IAccountPosition,
	ISubAccount,
} from "../../../entities/Account.js";

function normalizeAddressArray(addresses: Address[]): Address[] {
	return addresses.map((address) => getAddress(address));
}

function normalizeLiquidity<
	TVaultEntity extends { address: Address } | never = never,
>(
	liquidity: IAccountLiquidity<TVaultEntity>,
): IAccountLiquidity<TVaultEntity> {
	return {
		...liquidity,
		vaultAddress: getAddress(liquidity.vaultAddress),
		unitOfAccount: getAddress(liquidity.unitOfAccount),
		collaterals: liquidity.collaterals.map((collateral) => ({
			...collateral,
			address: getAddress(collateral.address),
		})),
	};
}

function normalizePosition<
	TVaultEntity extends { address: Address } | never = never,
>(
	position: IAccountPosition<TVaultEntity>,
): IAccountPosition<TVaultEntity> {
	return {
		...position,
		account: getAddress(position.account),
		vaultAddress: getAddress(position.vaultAddress),
		asset: getAddress(position.asset),
		liquidity: position.liquidity
			? normalizeLiquidity(position.liquidity)
			: undefined,
	};
}

export function normalizeSubAccountOutput<
	TVaultEntity extends { address: Address } | never = never,
>(
	subAccount: ISubAccount<TVaultEntity>,
): ISubAccount<TVaultEntity> {
	return {
		...subAccount,
		account: getAddress(subAccount.account),
		owner: getAddress(subAccount.owner),
		enabledControllers: normalizeAddressArray(subAccount.enabledControllers),
		enabledCollaterals: normalizeAddressArray(subAccount.enabledCollaterals),
		positions: subAccount.positions.map((position) =>
			normalizePosition(position),
		),
	};
}

export function normalizeAccountOutput<
	TVaultEntity extends { address: Address } | never = never,
>(
	account: IAccount<TVaultEntity>,
): IAccount<TVaultEntity> {
	const subAccounts = Object.fromEntries(
		Object.entries(account.subAccounts ?? {}).map(([subAccountAddress, subAccount]) => {
			if (!subAccount) return [getAddress(subAccountAddress), subAccount];
			const normalized = normalizeSubAccountOutput(subAccount);
			return [normalized.account, normalized];
		}),
	) as Partial<Record<Address, ISubAccount<TVaultEntity>>>;

	return {
		...account,
		owner: getAddress(account.owner),
		subAccounts,
	};
}
