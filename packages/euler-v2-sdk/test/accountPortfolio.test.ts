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
import { VaultRewardInfo } from "../src/services/rewardsService/vaultRewardInfo.js";
import {
	AccountService,
	type IAccountAdapter,
	type IAccountService,
} from "../src/services/accountService/index.js";
import { PortfolioService } from "../src/services/portfolioService/index.js";
import {
	getFreeSubAccounts,
	getSubAccountAddress,
	getSubAccountId,
	isBorrowControllerCompatible,
	isSubAccount,
	selectBorrowCompatibleSubAccount,
} from "../src/utils/subAccounts.js";
import { computeSubAccountRoe } from "../src/utils/accountComputations.js";

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

function usd(value: number): number {
	return value;
}

function vault(address: string, overrides: Record<string, unknown> = {}) {
	const result: Record<string, unknown> = {
		address: getAddress(address),
		...overrides,
	};
	const rawRewards = (overrides as { rewards?: unknown }).rewards as
		| { campaigns?: unknown[] }
		| undefined;
	if (rawRewards && !(rawRewards instanceof VaultRewardInfo)) {
		result.rewards = new VaultRewardInfo({
			campaigns: (rawRewards.campaigns ?? []) as never,
		});
	}
	return result;
}

function pricedVault(address: string, marketPriceUsd = 1, decimals = 6) {
	return vault(address, {
		marketPriceUsd,
		asset: { decimals },
	});
}

function populatedAccount(args: IAccount<any>) {
	return new Account({
		...args,
		populated: { vaults: true, marketPrices: true, ...args.populated },
	});
}

test("Account constructor normalizes sub-account map keys", () => {
	const lowerSubAccount =
		"0x8a54c278d117854486db0f6460d901a180fff517" as Address;
	const checksumSubAccount = getAddress(lowerSubAccount);
	const account = new Account({
		chainId: 1,
		owner,
		isLockdownMode: false,
		isPermitDisabledMode: false,
		subAccounts: {
			[lowerSubAccount]: subAccountData(checksumSubAccount, []),
		},
	});

	assert.equal(account.subAccounts[lowerSubAccount], undefined);
	assert.equal(account.subAccounts[checksumSubAccount]?.account, checksumSubAccount);
	assert.equal(account.getSubAccount(lowerSubAccount)?.account, checksumSubAccount);
});

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
							liquidation: 61735n,
							oracleMid: 100000n,
						},
						collaterals: [
							{
								address: collateralVault,
								value: {
									borrowing: 50n,
									liquidation: 61735n,
									oracleMid: 100000n,
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
	assert.equal(portfolio.borrows[0]?.accountLiquidationLTV, 0.6174);
	assert.deepEqual(
		portfolio.savings.map((saving) => saving.position.vaultAddress),
		[savingsVault, mixedVault, savingsVault],
	);
});

test("portfolio reports zero LTVs when liability has no valued collateral", () => {
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
						daysToLiquidation: -1,
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
						collaterals: [],
					},
				}),
			]),
		},
	});

	const portfolio = new Portfolio(account);
	const borrow = portfolio.borrows[0];

	assert.equal(account.subAccounts[subAccount]?.currentLTV, 0n);
	assert.equal(account.subAccounts[subAccount]?.liquidationLTV, 0n);
	assert.equal(borrow?.userLTV, 0n);
	assert.equal(borrow?.currentLTV, 0n);
	assert.equal(borrow?.accountLiquidationLTV, 0);
	assert.equal(borrow?.liquidatable, true);
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

test("account can attach a fresh sub-account snapshot before selection", () => {
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {},
	});

	assert.equal(account.getNewSubAccount({ borrowVault, endId: 3 }), subAccount);

	account.setSubAccount(subAccountData(subAccount, [], [], [otherBorrowVault]));
	account.setSubAccount(subAccountData(secondSubAccount, [], [], [borrowVault]));

	assert.equal(
		account.getNewSubAccount({ borrowVault, endId: 3 }),
		secondSubAccount,
	);
});

test("account service checks free sub-account controller snapshots in chunks", async () => {
	const checked: Address[] = [];
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {},
	});
	const adapter: IAccountAdapter = {
		async fetchAccount(chainId, address) {
			return {
				result: {
					chainId,
					owner: getAddress(address),
					subAccounts: {},
				},
				errors: [],
			};
		},
		async fetchSubAccount(_chainId, account) {
			const normalizedAccount = getAddress(account);
			checked.push(normalizedAccount);
			const subAccountId = getSubAccountId(owner, normalizedAccount);
			return {
				result: subAccountData(
					normalizedAccount,
					[],
					[],
					subAccountId === 27 ? [borrowVault] : [otherBorrowVault],
				),
				errors: [],
			};
		},
	};
	const service = new AccountService(adapter, {} as never);

	const resolved = await service.resolveNewSubAccount(1, owner, {
		account,
		borrowVault,
		endId: 60,
		fetchOptions: { populateVaults: false },
	});

	const compatibleSubAccount = getSubAccountAddress(owner, 27);
	assert.equal(resolved.result, compatibleSubAccount);
	assert.equal(account.getSubAccount(compatibleSubAccount), undefined);
	assert.equal(checked.length, 50);
	assert.equal(checked[0], subAccount);
	assert.equal(checked[49], getSubAccountAddress(owner, 50));
	assert.equal(checked.includes(getSubAccountAddress(owner, 51)), false);
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

test("portfolio chooses the largest oracle-value collateral as primary borrow collateral", () => {
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
							borrowing: 100n,
							liquidation: 100n,
							oracleMid: 100n,
						},
						collaterals: [
							{
								address: collateralVault,
								value: {
									borrowing: 20n,
									liquidation: 20n,
									oracleMid: 20n,
								},
							},
							{
								address: fallbackCollateralVault,
								value: {
									borrowing: 80n,
									liquidation: 80n,
									oracleMid: 80n,
								},
							},
						],
					},
				}),
				position(collateralVault, {
					shares: 1_000n,
					assets: 1_000n,
					isCollateral: true,
				}),
				position(fallbackCollateralVault, {
					shares: 1n,
					assets: 1n,
					isCollateral: true,
				}),
			]),
		},
	});

	const portfolioBorrow = new Portfolio(account).borrows[0];

	assert.deepEqual(
		portfolioBorrow?.collaterals.map(
			(collateral) => collateral.vaultAddress,
		),
		[fallbackCollateralVault, collateralVault],
	);
	assert.equal(
		portfolioBorrow?.collateral?.vaultAddress,
		fallbackCollateralVault,
	);
	assert.deepEqual(portfolioBorrow?.collateralVaults, [
		fallbackCollateralVault,
		collateralVault,
	]);
	assert.equal(portfolioBorrow?.supplied, 1n);
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
	assert.equal(portfolio.getNetApy(), (100 * 0.1 - 50 * 0.05) / 100);
	assert.equal(portfolio.getRoe(), (100 * 0.1 - 50 * 0.05) / 50);
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
		interestRates: { supplyAPY: "5", borrowAPY: "0" },
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
		interestRates: { supplyAPY: "0", borrowAPY: "8" },
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
		interestRates: { supplyAPY: "4", borrowAPY: "0" },
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
	assert.equal(portfolio.getNetApy(), 4);
	assert.equal(portfolio.getRoe(), 6);
	assert.deepEqual(portfolio.getNetApyBreakdown(), {
		lending: 14 / 3,
		borrowing: -8 / 3,
		rewards: 2,
		intrinsicApy: 0,
		total: 4,
	});
	assert.deepEqual(portfolio.getRoeBreakdown(), {
		lending: 7,
		borrowing: -4,
		rewards: 3,
		intrinsicApy: 0,
		total: 6,
	});

	const saving = portfolio.savings.find(
		(position) => position.position.vaultAddress === savingsVault,
	)!;
	assert.equal(saving.apy, 5);
	assert.equal(saving.apyBreakdown?.total, 5);
	assert.deepEqual(saving.apyBreakdown, {
		lending: 4,
		borrowing: 0,
		rewards: 1,
		intrinsicApy: 0,
		total: 5,
	});

	const borrowPosition = portfolio.borrows[0]!;
	assert.equal(borrowPosition.multiplier, 2);
	assert.equal(borrowPosition.netApy, 3.5);
	assert.equal(borrowPosition.roe, 7);
	assert.equal(borrowPosition.apyBreakdown?.total, 3.5);
	assert.equal(borrowPosition.roeBreakdown?.total, 7);
	assert.deepEqual(borrowPosition.apyBreakdown, {
		lending: 5,
		borrowing: -4,
		rewards: 2.5,
		intrinsicApy: 0,
		total: 3.5,
	});
	assert.deepEqual(borrowPosition.roeBreakdown, {
		lending: 10,
		borrowing: -8,
		rewards: 5,
		intrinsicApy: 0,
		total: 7,
	});
});

test("portfolio borrow breakdown picks up BORROW_COLLATERAL rewards on collateral match", () => {
	const otherCollateral = getAddress(
		"0x9000000000000000000000000000000000000000",
	);
	const collateral = vault(collateralVault, {
		interestRates: { supplyAPY: "5", borrowAPY: "0" },
	});
	const borrow = vault(borrowVault, {
		interestRates: { supplyAPY: "0", borrowAPY: "8" },
		rewards: {
			campaigns: [
				{
					campaignId: "borrow",
					source: "merkl",
					action: "BORROW",
					apr: 0.01,
					rewardTokenSymbol: "EUL",
				},
				{
					campaignId: "collat-match",
					source: "merkl",
					action: "BORROW_COLLATERAL",
					apr: 0.03,
					rewardTokenSymbol: "EUL",
					collateralAddress: collateralVault,
				},
				{
					campaignId: "collat-mismatch",
					source: "merkl",
					action: "BORROW_COLLATERAL",
					apr: 0.07,
					rewardTokenSymbol: "EUL",
					collateralAddress: otherCollateral,
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
				],
				[collateralVault],
			),
		},
	}));

	const borrowPosition = portfolio.borrows[0]!;
	// Borrow leg rewards = BORROW (1%) + BORROW_COLLATERAL (matching 3%) = 4%.
	// The mismatching 7% campaign must NOT count.
	// Net APY denominator is supplied (200). Rewards contribution = 100*4% / 200 = 2.
	assert.equal(borrowPosition.apyBreakdown?.rewards, 2);
	// ROE denominator is equity (200-100=100). Rewards contribution = 100*4% / 100 = 4.
	assert.equal(borrowPosition.roeBreakdown?.rewards, 4);
});

test("portfolio borrow breakdown picks up LOOPING rewards on multiplier match", () => {
	const collateral = vault(collateralVault, {
		interestRates: { supplyAPY: "0", borrowAPY: "0" },
	});
	const borrow = vault(borrowVault, {
		interestRates: { supplyAPY: "0", borrowAPY: "0" },
		rewards: {
			campaigns: [
				// In range (multiplier 2 falls in [1.5, 3]).
				{
					campaignId: "loop-in-range",
					source: "merkl",
					action: "LOOPING",
					apr: 0.05,
					rewardTokenSymbol: "EUL",
					collateralAddress: collateralVault,
					minMultiplier: 1.5,
					maxMultiplier: 3,
				},
				// Below range (multiplier 2 < min 4).
				{
					campaignId: "loop-too-low",
					source: "merkl",
					action: "LOOPING",
					apr: 0.10,
					rewardTokenSymbol: "EUL",
					collateralAddress: collateralVault,
					minMultiplier: 4,
				},
				// Collateral mismatch.
				{
					campaignId: "loop-wrong-collat",
					source: "merkl",
					action: "LOOPING",
					apr: 0.20,
					rewardTokenSymbol: "EUL",
					collateralAddress: getAddress(
						"0x9000000000000000000000000000000000000000",
					),
				},
			],
		},
	});

	// Collateral 200, borrow 100 → multiplier = 2, equity = 100.
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
				],
				[collateralVault],
			),
		},
	}));

	const borrowPosition = portfolio.borrows[0]!;
	assert.equal(borrowPosition.multiplier, 2);
	// LOOPING is paid on equity (100), apr 5% → looping yield = 100 * 5 = 500.
	// Net APY denominator is supplied (200). Rewards = 500 / 200 = 2.5.
	assert.equal(borrowPosition.apyBreakdown?.rewards, 2.5);
	// ROE denominator is equity (100). Rewards = 500 / 100 = 5.
	assert.equal(borrowPosition.roeBreakdown?.rewards, 5);
});

test("subAccount ROE picks up BORROW_COLLATERAL rewards", () => {
	const collateral = vault(collateralVault, {
		interestRates: { supplyAPY: "0", borrowAPY: "0" },
	});
	const borrow = vault(borrowVault, {
		interestRates: { supplyAPY: "0", borrowAPY: "0" },
		rewards: {
			campaigns: [
				{
					campaignId: "collat-match",
					source: "merkl",
					action: "BORROW_COLLATERAL",
					apr: 0.04,
					rewardTokenSymbol: "EUL",
					collateralAddress: collateralVault,
				},
			],
		},
	});

	const account = populatedAccount({
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
				],
				[collateralVault],
			),
		},
	});

	const sa = Object.values(account.subAccounts!)[0]!;
	const roe = computeSubAccountRoe(sa, undefined);
	// 100 borrow * 4% BORROW_COLLATERAL / 100 equity = 4.
	assert.equal(roe?.rewards, 4);
	assert.equal(roe?.total, 4);
});

test("portfolio breakdowns drop whitelisted-ineligible rewards for a non-eligible viewer", () => {
	const viewerEligible = getAddress(
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	);
	const viewerOther = getAddress(
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	);

	const savings = vault(savingsVault, {
		interestRates: { supplyAPY: "4", borrowAPY: "0" },
		rewards: {
			campaigns: [
				{
					campaignId: "open",
					source: "merkl",
					action: "LEND",
					apr: 0.01,
					rewardTokenSymbol: "EUL",
				},
				{
					campaignId: "gated",
					source: "merkl",
					action: "LEND",
					apr: 0.02,
					rewardTokenSymbol: "EUL",
					whitelist: [viewerEligible.toLowerCase()],
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
					vault: savings,
					shares: 100n,
					assets: 100n,
					suppliedValueUsd: usd(100),
				}),
			]),
		},
	}));

	// Headline (no viewer): both campaigns count → rewards = 1% + 2% = 3%.
	const headline = portfolio.getNetApyBreakdown();
	assert.equal(headline?.rewards, 3);
	assert.equal(headline?.total, 4 + 3);

	// Eligible viewer: still both campaigns.
	const eligible = portfolio.getNetApyBreakdown({ viewer: viewerEligible });
	assert.equal(eligible?.rewards, 3);
	assert.equal(eligible?.total, 7);

	// Non-eligible viewer: only the open campaign counts → rewards = 1%.
	const filtered = portfolio.getNetApyBreakdown({ viewer: viewerOther });
	assert.equal(filtered?.rewards, 1);
	assert.equal(filtered?.total, 4 + 1);

	// Additivity holds under viewer: lending + borrowing + rewards + intrinsicApy === total.
	const sumComponents = (b: { lending: number; borrowing: number; rewards: number; intrinsicApy: number; total: number; }) =>
		b.lending + b.borrowing + b.rewards + b.intrinsicApy;
	assert.equal(sumComponents(headline!), headline?.total);
	assert.equal(sumComponents(eligible!), eligible?.total);
	assert.equal(sumComponents(filtered!), filtered?.total);

	// Scalar conveniences agree with the breakdowns.
	assert.equal(portfolio.getNetApy({ viewer: viewerOther }), filtered?.total);
	assert.equal(portfolio.getRoe({ viewer: viewerOther }), filtered?.total);

	// Default-view getters mirror the no-viewer method call.
	assert.equal(portfolio.netApy, headline?.total);
	assert.equal(portfolio.apyBreakdown?.rewards, headline?.rewards);

	// Per-position breakdowns: default-view is headline, opts.viewer filters.
	const saving = portfolio.savings[0]!;
	assert.equal(saving.apyBreakdown?.rewards, 3);
	assert.equal(saving.getApyBreakdown({ viewer: viewerEligible })?.rewards, 3);
	assert.equal(saving.getApyBreakdown({ viewer: viewerOther })?.rewards, 1);
});

test("portfolio applies intrinsic APY", () => {
	const intrinsicVault = vault(savingsVault, {
		interestRates: { supplyAPY: 10, borrowAPY: 0 },
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

	assert.equal(portfolio.getNetApy(), 10 + 1.1 * 5);
	assert.equal(portfolio.getRoe(), 10 + 1.1 * 5);
	assert.deepEqual(portfolio.savings[0]?.apyBreakdown, {
		lending: 10,
		borrowing: 0,
		rewards: 0,
		intrinsicApy: 1.1 * 5,
		total: 10 + 1.1 * 5,
	});
});

test("portfolio uses EulerEarn supplyApy1h for yield metrics", () => {
	const eulerEarn = vault(savingsVault, {
		supplyApy1h: 7.5,
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

	assert.equal(portfolio.getNetApy(), 8);
	assert.equal(portfolio.getRoe(), 8);
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

	assert.equal(portfolio.getNetApy(), undefined);
	assert.equal(portfolio.getRoe(), undefined);
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
	assert.equal(portfolio.getNetApy(), 0);
	assert.equal(portfolio.getRoe(), 0);
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

	assert.equal(portfolio.getNetApy(), 0);
	assert.equal(portfolio.getRoe(), 0);
});

test("account market price population treats missing collateral position as zero value", async () => {
	const emptyCollateralVault = getAddress(
		"0x9000000000000000000000000000000000000000",
	);
	const account = populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(subAccount, [
				position(collateralVault, {
					vault: pricedVault(collateralVault),
					assets: 2_000000n,
					isCollateral: true,
				}),
				position(borrowVault, {
					vault: vault(borrowVault, {
						marketPriceUsd: 1,
						asset: { decimals: 6 },
						collaterals: [
							{ address: collateralVault, marketPriceUsd: 0.25 },
							{ address: emptyCollateralVault, marketPriceUsd: 0.25 },
						],
					}),
					borrowed: 1_000000n,
					isController: true,
					liquidity: {
						vaultAddress: borrowVault,
						vault: pricedVault(borrowVault),
						unitOfAccount: zeroAddress,
						daysToLiquidation: "Infinity",
						liabilityValue: {
							borrowing: 1n,
							liquidation: 1n,
							oracleMid: 1n,
						},
						totalCollateralValue: {
							borrowing: 2n,
							liquidation: 2n,
							oracleMid: 2n,
						},
						collaterals: [
							{
								address: collateralVault,
								vault: pricedVault(collateralVault),
								value: {
									borrowing: 2n,
									liquidation: 2n,
									oracleMid: 2n,
								},
							},
							{
								address: emptyCollateralVault,
								vault: pricedVault(emptyCollateralVault),
								value: {
									borrowing: 0n,
									liquidation: 0n,
									oracleMid: 0n,
								},
							},
						],
					},
				}),
			]),
		},
	});

	await account.populateMarketPrices({} as any);

	const borrow = account.getPosition(subAccount, borrowVault)!;
	assert.equal(borrow.borrowedValueUsd, 1);
	assert.equal(borrow.liquidity!.collaterals[0]!.marketPriceUsd, 1);
	assert.equal(borrow.liquidity!.collaterals[0]!.valueUsd, 2);
	assert.equal(borrow.liquidity!.collaterals[1]!.valueUsd, 0);
	assert.equal(borrow.liquidity!.totalCollateralValueUsd, 2);
});

test("portfolio borrow values fall back to raw position values when liquidity is unavailable", () => {
	const portfolio = new Portfolio(populatedAccount({
		chainId: 1,
		owner,
		subAccounts: {
			[subAccount]: subAccountData(
				subAccount,
				[
					position(collateralVault, {
						vault: pricedVault(collateralVault),
						assets: 2_000000n,
						isCollateral: true,
						suppliedValueUsd: usd(2),
					}),
					position(borrowVault, {
						vault: pricedVault(borrowVault),
						borrowed: 1_000000n,
						isController: true,
						borrowedValueUsd: usd(1),
					}),
				],
				[collateralVault],
				[borrowVault],
			),
		},
	}));

	const borrow = portfolio.borrows[0]!;
	assert.equal(borrow.liabilityValueUsd, 1);
	assert.equal(borrow.totalCollateralValueUsd, 2);
});
