import assert from "node:assert/strict";
import { getAddress, maxInt256, zeroAddress } from "viem";
import { test } from "vitest";
import { convertVaultAccountInfoToAccountPosition } from "../src/services/accountService/adapters/accountOnchainAdapter/accountInfoConverter.js";
import { AccountV3Adapter } from "../src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import type { VaultAccountInfo } from "../src/services/accountService/adapters/accountOnchainAdapter/accountLensTypes.js";

const account = getAddress("0x1000000000000000000000000000000000000000");
const borrowVault = getAddress("0x2000000000000000000000000000000000000000");
const asset = getAddress("0x3000000000000000000000000000000000000000");
const collateralWithValue = getAddress("0x4000000000000000000000000000000000000000");
const collateralWithoutValue = getAddress("0x5000000000000000000000000000000000000000");

function createVaultAccountInfo({
	collateralValueBorrowing,
	collateralValueLiquidation,
	collateralValueRaw,
	collateralValuesBorrowing,
	collateralValuesLiquidation,
	collateralValuesRaw,
}: {
	collateralValueBorrowing: bigint;
	collateralValueLiquidation: bigint;
	collateralValueRaw: bigint;
	collateralValuesBorrowing: bigint[];
	collateralValuesLiquidation: bigint[];
	collateralValuesRaw: bigint[];
}): VaultAccountInfo {
	return {
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
				collateralValueBorrowing,
				collateralValueLiquidation,
				collateralValueRaw,
				collaterals: [collateralWithValue, collateralWithoutValue],
				collateralValuesBorrowing,
				collateralValuesLiquidation,
				collateralValuesRaw,
			},
	};
}

test("on-chain account liquidity filters zero-value collaterals when another collateral has value", () => {
	const position = convertVaultAccountInfoToAccountPosition(
		createVaultAccountInfo({
			collateralValueBorrowing: 50n,
			collateralValueLiquidation: 50n,
			collateralValueRaw: 50n,
			collateralValuesBorrowing: [50n, 0n],
			collateralValuesLiquidation: [50n, 0n],
			collateralValuesRaw: [50n, 0n],
		}),
		[],
	);

	assert.deepEqual(
		position.liquidity?.collaterals.map((collateral) => collateral.address),
		[collateralWithValue],
	);
});

test("on-chain account liquidity preserves all-zero collaterals", () => {
	const position = convertVaultAccountInfoToAccountPosition(
		createVaultAccountInfo({
			collateralValueBorrowing: 0n,
			collateralValueLiquidation: 0n,
			collateralValueRaw: 0n,
			collateralValuesBorrowing: [0n, 0n],
			collateralValuesLiquidation: [0n, 0n],
			collateralValuesRaw: [0n, 0n],
		}),
		[],
	);

	assert.deepEqual(
		position.liquidity?.collaterals.map((collateral) => collateral.address),
		[collateralWithValue, collateralWithoutValue],
	);
});

function createV3AccountPosition({
	totalCollateralValue,
	collateralValues,
}: {
	totalCollateralValue: string;
	collateralValues: [string, string];
}) {
	return {
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
				borrowing: totalCollateralValue,
				liquidation: totalCollateralValue,
				oracleMid: totalCollateralValue,
			},
			collaterals: [
				{
					address: collateralWithValue,
					value: {
						borrowing: collateralValues[0],
						liquidation: collateralValues[0],
						oracleMid: collateralValues[0],
					},
				},
				{
					address: collateralWithoutValue,
					value: {
						borrowing: collateralValues[1],
						liquidation: collateralValues[1],
						oracleMid: collateralValues[1],
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
	};
}

async function fetchV3LiquidityCollateralAddresses(
	positionData: ReturnType<typeof createV3AccountPosition>,
) {
	const adapter = new AccountV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3AccountPositions(async () => ({
		data: [positionData],
	}));

	const fetched = await adapter.fetchAccount(1, account);
	const subAccount = fetched.result?.subAccounts[account];
	const position = subAccount?.positions[0];
	return position?.liquidity?.collaterals.map((collateral) => collateral.address);
}

test("V3 account liquidity filters zero-value collaterals when another collateral has value", async () => {
	assert.deepEqual(
		await fetchV3LiquidityCollateralAddresses(
			createV3AccountPosition({
				totalCollateralValue: "50",
				collateralValues: ["50", "0"],
			}),
		),
		[collateralWithValue],
	);
});

test("V3 account liquidity preserves all-zero collaterals", async () => {
	assert.deepEqual(
		await fetchV3LiquidityCollateralAddresses(
			createV3AccountPosition({
				totalCollateralValue: "0",
				collateralValues: ["0", "0"],
			}),
		),
		[collateralWithValue, collateralWithoutValue],
	);
});
