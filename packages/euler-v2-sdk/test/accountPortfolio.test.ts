import assert from "node:assert/strict";
import { type Address, getAddress, zeroAddress } from "viem";
import { test } from "vitest";
import {
	Account,
	type IAccount,
	type IAccountPosition,
	type ISubAccount,
} from "../src/entities/Account.js";
import { Portfolio } from "../src/entities/Portfolio.js";
import { PortfolioService } from "../src/services/portfolioService/index.js";
import type { IAccountService } from "../src/services/accountService/index.js";
import {
	getFreeSubAccounts,
	getSubAccountAddress,
	getSubAccountId,
	isBorrowControllerCompatible,
	isSubAccount,
	selectBorrowCompatibleSubAccount,
} from "../src/utils/subAccounts.js";

const owner = getAddress("0x1000000000000000000000000000000000000000");
const subAccount = getAddress("0x1000000000000000000000000000000000000001");
const secondSubAccount = getAddress("0x1000000000000000000000000000000000000002");
const thirdSubAccount = getAddress("0x1000000000000000000000000000000000000003");
const fourthSubAccount = getAddress("0x1000000000000000000000000000000000000004");
const maxSubAccount = getAddress("0x1000000000000000000000000000000000000100");
const borrowVault = getAddress("0x2000000000000000000000000000000000000000");
const collateralVault = getAddress("0x3000000000000000000000000000000000000000");
const savingsVault = getAddress("0x4000000000000000000000000000000000000000");
const mixedVault = getAddress("0x5000000000000000000000000000000000000000");
const fallbackCollateralVault = getAddress("0x6000000000000000000000000000000000000000");
const otherBorrowVault = getAddress("0x8000000000000000000000000000000000000000");

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
	enabledControllers: string[] = [],
): ISubAccount<any> {
	return {
		timestamp: 0,
		account: getAddress(account),
		owner,
		lastAccountStatusCheckTimestamp: 0,
		enabledControllers: enabledControllers.map((address) => getAddress(address)),
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

function populatedAccount(args: IAccount<any>) {
	return new Account({
		...args,
		populated: { vaults: true, marketPrices: true, ...args.populated },
	});
}

test("sub-account helpers find free and borrow-compatible addresses", () => {
	assert.equal(getSubAccountAddress(owner, 256), maxSubAccount);
	assert.equal(getSubAccountId(owner, maxSubAccount), 256);
	assert.equal(isSubAccount(owner, maxSubAccount), true);
	assert.deepEqual(getFreeSubAccounts(owner, [subAccount], { endId: 2 }), [
		secondSubAccount,
	]);
	assert.equal(isBorrowControllerCompatible([], borrowVault), true);
	assert.equal(
		isBorrowControllerCompatible([borrowVault], borrowVault),
		true,
	);
	assert.equal(
		isBorrowControllerCompatible([otherBorrowVault], borrowVault),
		false,
	);
	assert.equal(
		selectBorrowCompatibleSubAccount(
			[
				{
					subAccount: thirdSubAccount,
					enabledControllers: [otherBorrowVault],
				},
				{
					subAccount: fourthSubAccount,
					enabledControllers: [borrowVault],
				},
			],
			borrowVault,
		),
		fourthSubAccount,
	);
});

test("portfolio splits savings and borrows across sub-accounts", () => {
	const account = populatedAccount({
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

	const portfolio = new Portfolio(account);

	assert.deepEqual(
		portfolio.borrows.map((borrow) => borrow.borrow.vaultAddress),
		[borrowVault, mixedVault],
	);
	assert.deepEqual(
		portfolio.borrows[0]?.collaterals.map(
			(collateral) => collateral.vaultAddress,
		),
		[collateralVault],
	);
	assert.deepEqual(
		portfolio.savings.map((saving) => saving.position.vaultAddress),
		[savingsVault, mixedVault, savingsVault],
	);
});

test("account selects the next sub-account for new positions", () => {
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(borrowVault, {
					borrowed: 100n,
					account: subAccount,
				}),
			]),
			[secondSubAccount]: subAccountData(secondSubAccount, [
				position(savingsVault, {
					account: secondSubAccount,
					assets: 100n,
					shares: 100n,
				}),
			]),
			[thirdSubAccount]: subAccountData(
				thirdSubAccount,
				[],
				[],
				[otherBorrowVault],
			),
			[fourthSubAccount]: subAccountData(
				fourthSubAccount,
				[],
				[],
				[borrowVault],
			),
		},
	});

	assert.deepEqual(account.getFreeSubAccounts({ endId: 4 }), [
		thirdSubAccount,
		fourthSubAccount,
	]);
	assert.equal(account.getNextSubAccount(), secondSubAccount);
	assert.equal(
		account.getNextSubAccount({ borrowVault, endId: 4 }),
		fourthSubAccount,
	);
	assert.equal(
		account.getNewSubAccount({ borrowVault, endId: 4 }),
		fourthSubAccount,
	);
});

test("portfolio sub-account selection respects its position filter", () => {
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(borrowVault, {
					borrowed: 100n,
					account: subAccount,
				}),
			]),
			[secondSubAccount]: subAccountData(secondSubAccount, [
				position(savingsVault, {
					account: secondSubAccount,
					assets: 100n,
					shares: 100n,
				}),
			]),
			[thirdSubAccount]: subAccountData(
				thirdSubAccount,
				[],
				[],
				[otherBorrowVault],
			),
			[fourthSubAccount]: subAccountData(
				fourthSubAccount,
				[],
				[],
				[borrowVault],
			),
		},
	});
	const portfolio = new Portfolio(account, {
		positionFilter: (position) => position.vaultAddress !== savingsVault,
	});

	assert.equal(
		account.getNextSubAccount({ borrowVault, endId: 4 }),
		fourthSubAccount,
	);
	assert.equal(
		portfolio.getNextSubAccount({ borrowVault, endId: 4 }),
		secondSubAccount,
	);
	assert.deepEqual(portfolio.getFreeSubAccounts({ endId: 4 }), [
		secondSubAccount,
		thirdSubAccount,
		fourthSubAccount,
	]);
});

test("portfolio uses enabled collaterals as defensive borrow collateral fallback", () => {
	const account = populatedAccount({
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

	const portfolio = new Portfolio(account);

	assert.deepEqual(
		portfolio.borrows[0]?.collaterals.map(
			(collateral) => collateral.vaultAddress,
		),
		[fallbackCollateralVault],
	);
	assert.deepEqual(portfolio.savings, []);
});

test("portfolio treats all-zero liquidity collaterals as collateral usage", () => {
	const account = populatedAccount({
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

	const portfolio = new Portfolio(account);

	assert.deepEqual(
		portfolio.borrows[0]?.collaterals.map(
			(collateral) => collateral.vaultAddress,
		),
		[collateralVault],
	);
	assert.deepEqual(portfolio.savings, []);
});

test("portfolio permanently filters positions from lists and metrics", () => {
	const verified = vault(savingsVault, {
		eulerLabel: { vault: {}, entities: [], products: [], points: [] },
		interestRates: { supplyAPY: "0.10", borrowAPY: "0" },
	});
	const unverified = vault(collateralVault, {
		interestRates: { supplyAPY: "0.30", borrowAPY: "0" },
	});
	const borrow = vault(borrowVault, {
		eulerLabel: { vault: {}, entities: [], products: [], points: [] },
		interestRates: { supplyAPY: "0", borrowAPY: "0.05" },
	});
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(savingsVault, {
					vault: verified,
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
				position(collateralVault, {
					vault: unverified,
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
				position(borrowVault, {
					vault: borrow,
					borrowed: 50n,
					borrowedValueUsd: usd(50),
				}),
			]),
		},
	});

	const portfolio = new Portfolio(account, {
		positionFilter: (pos, { account: portfolioAccount }) =>
			portfolioAccount === account && Boolean((pos.vault as any)?.eulerLabel),
	});

	assert.deepEqual(
		portfolio.savings.map((saving) => saving.position.vaultAddress),
		[savingsVault],
	);
	assert.equal(portfolio.totalSuppliedValueUsd, usd(100));
	assert.equal(portfolio.totalBorrowedValueUsd, usd(50));
	assert.equal(portfolio.netApy, (100 * 0.1 - 50 * 0.05) / 100);
	assert.equal(portfolio.roe, (100 * 0.1 - 50 * 0.05) / 50);
});

test("portfolio does not expose filtered borrow collateral as savings", () => {
	const labelled = { vault: {}, entities: [], products: [], points: [] };
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(collateralVault, {
					vault: vault(collateralVault, { eulerLabel: labelled }),
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
				position(borrowVault, {
					vault: vault(borrowVault),
					borrowed: 50n,
					borrowedValueUsd: usd(50),
					liquidity: {
						vaultAddress: borrowVault,
						unitOfAccount: zeroAddress,
						daysToLiquidation: 0,
						liabilityValue: {
							borrowing: 50n,
							liquidation: 50n,
							oracleMid: 50n,
						},
						totalCollateralValue: {
							borrowing: 100n,
							liquidation: 100n,
							oracleMid: 100n,
						},
						collaterals: [
							{
								address: collateralVault,
								value: {
									borrowing: 100n,
									liquidation: 100n,
									oracleMid: 100n,
								},
							},
						],
					},
				}),
				position(savingsVault, {
					vault: vault(savingsVault, { eulerLabel: labelled }),
					shares: 10n,
					assets: 10n,
					suppliedValueUsd: usd(10),
				}),
			]),
		},
	});

	const portfolio = new Portfolio(account, {
		positionFilter: (pos) => Boolean((pos.vault as any)?.eulerLabel),
	});

	assert.deepEqual(
		portfolio.savings.map((saving) => saving.position.vaultAddress),
		[savingsVault],
	);
	assert.deepEqual(portfolio.borrows, []);
	assert.equal(portfolio.totalSuppliedValueUsd, usd(10));
});

test("portfolio getters reflect account position mutations", () => {
	const account = populatedAccount({
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
					suppliedValueUsd: usd(100),
				}),
			]),
		},
	});
	const portfolio = new Portfolio(account);

	assert.equal(portfolio.totalSuppliedValueUsd, usd(100));
	account.getPosition(subAccount, savingsVault)!.suppliedValueUsd = usd(125);
	assert.equal(portfolio.totalSuppliedValueUsd, usd(125));
});

test("portfolio service fetches populated accounts and forwards position filter", async () => {
	let observedOptions: unknown;
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(savingsVault, {
					vault: vault(savingsVault, {
						eulerLabel: { vault: {}, entities: [], products: [], points: [] },
					}),
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
			]),
		},
	});
	const accountService = {
		async fetchAccount(
			_chainId: number,
			_address: Address,
			options?: unknown,
		) {
			observedOptions = options;
			return { result: account, errors: [] };
		},
		async fetchSubAccount() {
			return { result: undefined, errors: [] };
		},
		async populateVaults() {
			return { result: [], errors: [] };
		},
	} satisfies IAccountService<any>;
	const service = new PortfolioService(accountService);
	const fetched = await service.fetchPortfolio(1, owner, {
		positionFilter: (pos, { account: portfolioAccount }) =>
			portfolioAccount === account && pos.assets > 0n,
	});

	assert.equal(fetched.result.totalSuppliedValueUsd, usd(100));
	assert.deepEqual(observedOptions, {
		populateAll: true,
	});
});

test("portfolio computes net APY and ROE from supplied and borrowed value", () => {
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

	const portfolio = new Portfolio(populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(
				subAccount,
				[
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
				],
				[collateralVault],
			),
		},
	}));

	// Net yield = 200*(5%+2%) - 100*(8%-1%) + 100*(4%+1%) = 12.
	assert.equal(portfolio.netApy, 12 / 300);
	assert.equal(portfolio.roe, 12 / 200);
	assert.deepEqual(portfolio.apyBreakdown, {
		lending: 14 / 300,
		borrowing: -8 / 300,
		rewards: 6 / 300,
		intrinsicApy: 0,
		total: 12 / 300,
	});
	assert.deepEqual(portfolio.roeBreakdown, {
		lending: 14 / 200,
		borrowing: -8 / 200,
		rewards: 6 / 200,
		intrinsicApy: 0,
		total: 12 / 200,
	});

	const saving = portfolio.savings.find(
		(position) => position.position.vaultAddress === savingsVault,
	)!;
	assert.equal(saving.apy, 0.05);
	assert.deepEqual(saving.apyBreakdown, {
		lending: 0.04,
		borrowing: 0,
		rewards: 0.01,
		intrinsicApy: 0,
		total: 0.05,
	});

	const borrowPosition = portfolio.borrows[0]!;
	assert.equal(borrowPosition.multiplier, 2);
	assert.equal(borrowPosition.netApy, 7 / 200);
	assert.equal(borrowPosition.roe, 7 / 100);
	assert.deepEqual(borrowPosition.apyBreakdown, {
		lending: 10 / 200,
		borrowing: -8 / 200,
		rewards: 5 / 200,
		intrinsicApy: 0,
		total: 7 / 200,
	});
	assert.deepEqual(borrowPosition.roeBreakdown, {
		lending: 10 / 100,
		borrowing: -8 / 100,
		rewards: 5 / 100,
		intrinsicApy: 0,
		total: 7 / 100,
	});
});

test("portfolio applies intrinsic APY", () => {
	const intrinsicVault = vault(savingsVault, {
		interestRates: { supplyAPY: "0.10", borrowAPY: "0" },
		intrinsicApy: {
			apy: 5,
			provider: "test",
		},
	});

	const portfolio = new Portfolio(populatedAccount({
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
	}));

	assert.equal(portfolio.netApy, 0.1 + 1.1 * 0.05);
	assert.equal(portfolio.roe, 0.1 + 1.1 * 0.05);
	assert.deepEqual(portfolio.savings[0]?.apyBreakdown, {
		lending: 0.1,
		borrowing: 0,
		rewards: 0,
		intrinsicApy: 1.1 * 0.05,
		total: 0.1 + 1.1 * 0.05,
	});
});

test("portfolio uses EulerEarn supplyApy1h for yield metrics", () => {
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

	const portfolio = new Portfolio(populatedAccount({
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
	}));

	assert.equal(portfolio.netApy, 0.08);
	assert.equal(portfolio.roe, 0.08);
});

test("portfolio yield metrics return undefined without populated USD positions", () => {
	const portfolio = new Portfolio(populatedAccount({
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
	}));

	assert.equal(portfolio.netApy, undefined);
	assert.equal(portfolio.roe, undefined);
});

test("portfolio treats populated positions without APY data as zero yield", () => {
	const portfolio = new Portfolio(populatedAccount({
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
	}));

	assert.equal(portfolio.totalSuppliedValueUsd, usd(100));
	assert.equal(portfolio.totalBorrowedValueUsd, usd(50));
	assert.equal(portfolio.netAssetValueUsd, usd(50));
	assert.equal(portfolio.netApy, 0);
	assert.equal(portfolio.roe, 0);
});

test("portfolio yield metrics return zero when equity is not positive", () => {
	const portfolio = new Portfolio(populatedAccount({
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
	}));

	assert.equal(portfolio.netApy, 0);
	assert.equal(portfolio.roe, 0);
});
