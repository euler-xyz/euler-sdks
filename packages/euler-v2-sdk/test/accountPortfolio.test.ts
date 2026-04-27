import test from "node:test";
import assert from "node:assert/strict";
import { getAddress, zeroAddress } from "viem";
import {
	Account,
	type IAccountPosition,
	type ISubAccount,
} from "../src/entities/Account.js";

const owner = getAddress("0x1000000000000000000000000000000000000000");
const subAccount = getAddress("0x1000000000000000000000000000000000000001");
const secondSubAccount = getAddress("0x1000000000000000000000000000000000000002");
const borrowVault = getAddress("0x2000000000000000000000000000000000000000");
const collateralVault = getAddress("0x3000000000000000000000000000000000000000");
const savingsVault = getAddress("0x4000000000000000000000000000000000000000");
const mixedVault = getAddress("0x5000000000000000000000000000000000000000");
const fallbackCollateralVault = getAddress("0x6000000000000000000000000000000000000000");

const asset = getAddress("0x7000000000000000000000000000000000000000");

function position(
	vaultAddress: string,
	overrides: Partial<IAccountPosition> = {},
): IAccountPosition {
	return {
		account: subAccount,
		vaultAddress: getAddress(vaultAddress),
		asset,
		shares: 0n,
		assets: 0n,
		borrowed: 0n,
		isController: false,
		isCollateral: false,
		balanceForwarderEnabled: false,
		...overrides,
	};
}

function subAccountData(
	account: string,
	positions: IAccountPosition[],
	enabledCollaterals: string[] = [],
): ISubAccount {
	return {
		timestamp: 0,
		account: getAddress(account),
		owner,
		lastAccountStatusCheckTimestamp: 0,
		enabledControllers: [],
		enabledCollaterals: enabledCollaterals.map((address) => getAddress(address)),
		positions,
	};
}

test("portfolio splits savings and borrows across sub-accounts", () => {
	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(borrowVault, {
					borrowed: 100n,
					isController: true,
					liquidity: {
						vaultAddress: borrowVault,
						unitOfAccount: zeroAddress,
						daysToLiquidation: "Infinity",
						liabilityValue: {
							borrowing: 100n,
							liquidation: 100n,
							oracleMid: 100n,
						},
						totalCollateralValue: {
							borrowing: 50n,
							liquidation: 50n,
							oracleMid: 50n,
						},
						collaterals: [
							{
								address: collateralVault,
								value: {
									borrowing: 50n,
									liquidation: 50n,
									oracleMid: 50n,
								},
							},
						],
					},
				}),
				position(collateralVault, {
					shares: 50n,
					assets: 50n,
					isCollateral: true,
				}),
				position(savingsVault, {
					shares: 25n,
					assets: 25n,
				}),
				position(mixedVault, {
					shares: 75n,
					assets: 75n,
					borrowed: 10n,
					isController: true,
					liquidity: {
						vaultAddress: mixedVault,
						unitOfAccount: zeroAddress,
						daysToLiquidation: "Infinity",
						liabilityValue: {
							borrowing: 10n,
							liquidation: 10n,
							oracleMid: 10n,
						},
						totalCollateralValue: {
							borrowing: 0n,
							liquidation: 0n,
							oracleMid: 0n,
						},
						collaterals: [],
					},
				}),
			]),
			[secondSubAccount]: subAccountData(secondSubAccount, [
				position(savingsVault, {
					account: secondSubAccount,
					shares: 33n,
					assets: 33n,
				}),
			]),
		},
	});

	assert.deepEqual(
		account.portfolio.borrows.map((borrow) => borrow.borrow.vaultAddress),
		[borrowVault, mixedVault],
	);
	assert.deepEqual(
		account.portfolio.borrows[0]?.collaterals.map(
			(collateral) => collateral.vaultAddress,
		),
		[collateralVault],
	);
	assert.deepEqual(
		account.portfolio.savings.map((saving) => saving.vaultAddress),
		[savingsVault, mixedVault, savingsVault],
	);
});

test("portfolio uses enabled collaterals as defensive borrow collateral fallback", () => {
	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(
				subAccount,
				[
					position(borrowVault, {
						borrowed: 100n,
						isController: true,
					}),
					position(fallbackCollateralVault, {
						shares: 50n,
						assets: 50n,
						isCollateral: true,
					}),
				],
				[fallbackCollateralVault],
			),
		},
	});

	assert.deepEqual(
		account.portfolio.borrows[0]?.collaterals.map(
			(collateral) => collateral.vaultAddress,
		),
		[fallbackCollateralVault],
	);
	assert.deepEqual(account.portfolio.savings, []);
});

test("portfolio treats all-zero liquidity collaterals as collateral usage", () => {
	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(borrowVault, {
					borrowed: 100n,
					isController: true,
					liquidity: {
						vaultAddress: borrowVault,
						unitOfAccount: zeroAddress,
						daysToLiquidation: "Infinity",
						liabilityValue: {
							borrowing: 100n,
							liquidation: 100n,
							oracleMid: 100n,
						},
						totalCollateralValue: {
							borrowing: 0n,
							liquidation: 0n,
							oracleMid: 0n,
						},
						collaterals: [
							{
								address: collateralVault,
								value: {
									borrowing: 0n,
									liquidation: 0n,
									oracleMid: 0n,
								},
							},
						],
					},
				}),
				position(collateralVault, {
					shares: 50n,
					assets: 50n,
					isCollateral: true,
				}),
			]),
		},
	});

	assert.deepEqual(
		account.portfolio.borrows[0]?.collaterals.map(
			(collateral) => collateral.vaultAddress,
		),
		[collateralVault],
	);
	assert.deepEqual(account.portfolio.savings, []);
});
