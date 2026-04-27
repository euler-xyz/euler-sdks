import test from "node:test";
import assert from "node:assert/strict";
import { getAddress, maxInt256, zeroAddress } from "viem";
import { convertVaultAccountInfoToAccountPosition } from "../src/services/accountService/adapters/accountOnchainAdapter/accountInfoConverter.js";
import { AccountV3Adapter } from "../src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import type { VaultAccountInfo } from "../src/services/accountService/adapters/accountOnchainAdapter/accountLensTypes.js";

const account = getAddress("0x1000000000000000000000000000000000000000");
const borrowVault = getAddress("0x2000000000000000000000000000000000000000");
const asset = getAddress("0x3000000000000000000000000000000000000000");
const collateralWithValue = getAddress("0x4000000000000000000000000000000000000000");
const collateralWithoutValue = getAddress("0x5000000000000000000000000000000000000000");

test("on-chain account liquidity filters zero-value collaterals", () => {
	const position = convertVaultAccountInfoToAccountPosition(
		{
			timestamp: 0n,
			account,
			vault: borrowVault,
			asset,
			assetsAccount: 0n,
			shares: 0n,
			assets: 0n,
			borrowed: 100n,
			assetAllowanceVault: 0n,
			assetAllowanceVaultPermit2: 0n,
			assetAllowanceExpirationVaultPermit2: 0n,
			assetAllowancePermit2: 0n,
			balanceForwarderEnabled: false,
			isController: true,
			isCollateral: false,
			liquidityInfo: {
				queryFailure: false,
				queryFailureReason: "0x",
				account,
				vault: borrowVault,
				unitOfAccount: zeroAddress,
				timeToLiquidation: maxInt256,
				liabilityValueBorrowing: 100n,
				liabilityValueLiquidation: 100n,
				collateralValueBorrowing: 50n,
				collateralValueLiquidation: 50n,
				collateralValueRaw: 50n,
				collaterals: [collateralWithValue, collateralWithoutValue],
				collateralValuesBorrowing: [50n, 0n],
				collateralValuesLiquidation: [50n, 0n],
				collateralValuesRaw: [50n, 0n],
			},
		} satisfies VaultAccountInfo,
		[],
	);

	assert.deepEqual(
		position.liquidity?.collaterals.map((collateral) => collateral.address),
		[collateralWithValue],
	);
});

test("V3 account liquidity filters zero-value collaterals", async () => {
	const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3AccountPositions(async () => ({
		data: [
			{
				chainId: 1,
				account,
				vault: borrowVault,
				asset,
				shares: "0",
				assets: "0",
				borrowed: "100",
				isController: true,
				isCollateral: false,
				balanceForwarderEnabled: false,
				liquidity: {
					vaultAddress: borrowVault,
					unitOfAccount: zeroAddress,
					daysToLiquidation: "Infinity",
					liabilityValue: {
						borrowing: "100",
						liquidation: "100",
						oracleMid: "100",
					},
					totalCollateralValue: {
						borrowing: "50",
						liquidation: "50",
						oracleMid: "50",
					},
					collaterals: [
						{
							address: collateralWithValue,
							value: {
								borrowing: "50",
								liquidation: "50",
								oracleMid: "50",
							},
						},
						{
							address: collateralWithoutValue,
							value: {
								borrowing: "0",
								liquidation: "0",
								oracleMid: "0",
							},
						},
					],
				},
				subAccount: {
					owner: account,
					timestamp: 0,
					lastAccountStatusCheckTimestamp: 0,
					enabledControllers: [borrowVault],
					enabledCollaterals: [collateralWithValue, collateralWithoutValue],
					isLockdownMode: false,
					isPermitDisabledMode: false,
				},
			},
		],
	}));

	const fetched = await adapter.fetchAccount(1, account);
	const subAccount = fetched.result?.subAccounts[account];
	const position = subAccount?.positions[0];

	assert.deepEqual(
		position?.liquidity?.collaterals.map((collateral) => collateral.address),
		[collateralWithValue],
	);
});
