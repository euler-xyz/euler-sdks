import assert from "node:assert/strict";
import { getAddress, zeroAddress } from "viem";
import { test } from "vitest";
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
	overrides: Partial<IAccountPosition<any>> = {},
): IAccountPosition<any> {
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
	positions: IAccountPosition<any>[],
	enabledCollaterals: string[] = [],
): ISubAccount<any> {
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

function usd(value: number): bigint {
	return BigInt(Math.round(value * 1e6)) * 10n ** 12n;
}

function vault(address: string, overrides: Record<string, unknown> = {}) {
	return {
		address: getAddress(address),
		...overrides,
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

test("account computes portfolio net APY and ROE from supplied and borrowed value", () => {
	const collateral = vault(collateralVault, {
		interestRates: { supplyAPY: "0.05", borrowAPY: "0" },
		rewards: {
			totalRewardsApr: 0.02,
			campaigns: [
				{
					campaignId: "supply",
					source: "merkl",
					action: "LEND",
					apr: 0.02,
					rewardTokenSymbol: "EUL",
				},
			],
		},
	});
	const borrow = vault(borrowVault, {
		interestRates: { supplyAPY: "0", borrowAPY: "0.08" },
		rewards: {
			totalRewardsApr: 0.01,
			campaigns: [
				{
					campaignId: "borrow",
					source: "merkl",
					action: "BORROW",
					apr: 0.01,
					rewardTokenSymbol: "EUL",
				},
			],
		},
	});
	const savings = vault(savingsVault, {
		interestRates: { supplyAPY: "0.04", borrowAPY: "0" },
		rewards: {
			totalRewardsApr: 0.01,
			campaigns: [
				{
					campaignId: "savings",
					source: "merkl",
					action: "LEND",
					apr: 0.01,
					rewardTokenSymbol: "EUL",
				},
			],
		},
	});

	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(collateralVault, {
					vault: collateral,
					shares: 200n,
					assets: 200n,
					suppliedValueUsd: usd(200),
				}),
				position(borrowVault, {
					vault: borrow,
					borrowed: 100n,
					borrowedValueUsd: usd(100),
				}),
				position(savingsVault, {
					vault: savings,
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
			]),
		},
	});

	// Net yield = 200*(5%+2%) - 100*(8%-1%) + 100*(4%+1%) = 12.
	assert.equal(account.netApy, 12 / 300);
	assert.equal(account.roe, 12 / 200);
});

test("account applies intrinsic APY with the euler-lite formula", () => {
	const intrinsicVault = vault(savingsVault, {
		interestRates: { supplyAPY: "0.10", borrowAPY: "0" },
		intrinsicApy: {
			apy: 5,
			provider: "test",
		},
	});

	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(savingsVault, {
					vault: intrinsicVault,
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
			]),
		},
	});

	assert.equal(account.netApy, 0.1 + 1.1 * 0.05);
	assert.equal(account.roe, 0.1 + 1.1 * 0.05);
});

test("account uses EulerEarn supplyApy1h for account yield metrics", () => {
	const eulerEarn = vault(savingsVault, {
		supplyApy1h: 0.075,
		rewards: {
			campaigns: [
				{
					campaignId: "earn-supply",
					source: "merkl",
					action: "LEND",
					apr: 0.005,
					rewardTokenSymbol: "EUL",
				},
			],
		},
	});

	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(savingsVault, {
					vault: eulerEarn,
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
			]),
		},
	});

	assert.equal(account.netApy, 0.08);
	assert.equal(account.roe, 0.08);
});

test("account yield metrics return undefined without populated USD positions", () => {
	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(savingsVault, {
					vault: vault(savingsVault, {
						interestRates: { supplyAPY: "0.10", borrowAPY: "0" },
					}),
					shares: 100n,
					assets: 100n,
				}),
			]),
		},
	});

	assert.equal(account.netApy, undefined);
	assert.equal(account.roe, undefined);
});

test("account treats populated positions without APY data as zero yield", () => {
	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(collateralVault, {
					vault: vault(collateralVault),
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
				position(borrowVault, {
					vault: vault(borrowVault),
					borrowed: 50n,
					borrowedValueUsd: usd(50),
				}),
			]),
		},
	});

	assert.equal(account.totalSuppliedValueUsd, usd(100));
	assert.equal(account.totalBorrowedValueUsd, usd(50));
	assert.equal(account.netAssetValueUsd, usd(50));
	assert.equal(account.netApy, 0);
	assert.equal(account.roe, 0);
});

test("account yield metrics return zero when equity is not positive", () => {
	const account = new Account({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(borrowVault, {
					vault: vault(borrowVault, {
						interestRates: { supplyAPY: "0", borrowAPY: "0.08" },
					}),
					borrowed: 100n,
					borrowedValueUsd: usd(100),
				}),
			]),
		},
	});

	assert.equal(account.netApy, 0);
	assert.equal(account.roe, 0);
});
