import assert from "node:assert/strict";
import { test } from "vitest";
import {
	type Address,
	decodeFunctionData,
	encodeFunctionData,
	getAddress,
	maxUint256,
} from "viem";
import { Account, type IAccountPosition } from "../src/entities/Account.js";
import { EulerEarn } from "../src/entities/EulerEarn.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import {
	flattenBatchEntries,
	type TransactionPlan,
} from "../src/services/executionService/executionServiceTypes.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { VaultType } from "../src/utils/types.js";

const owner = getAddress("0x1000000000000000000000000000000000000000");
const subAccount = getAddress("0x1000000000000000000000000000000000000001");
const lowerVault = "0x000000000000000000000000000000000000beef" as const;
const vault = getAddress(lowerVault);
const lowerAsset = "0x000000000000000000000000000000000000cafe" as const;
const asset = getAddress(lowerAsset);
const evc = getAddress("0x0000000000000000000000000000000000000011");

function service() {
	return new ExecutionService(
		{
			getDeployment: () => ({
				addresses: { coreAddrs: { evc } },
			}),
		} as never,
		{} as never,
	);
}

function position(
	account: Address,
	assetAddress = asset,
): IAccountPosition<any> {
	return {
		account,
		vaultAddress: vault,
		asset: assetAddress,
		shares: 1_000_000n,
		assets: 1_500_000n,
		borrowed: 100n,
		isController: true,
		isCollateral: false,
		balanceForwarderEnabled: false,
	};
}

function account(
	ownerPosition = position(owner),
	subPosition = position(subAccount),
) {
	return new Account({
		chainId: 1,
		owner,
		isLockdownMode: false,
		isPermitDisabledMode: false,
		subAccounts: Object.fromEntries(
			[ownerPosition, subPosition].map((entry) => [
				entry.account,
				{
					timestamp: 0,
					account: entry.account,
					owner,
					lastAccountStatusCheckTimestamp: 0,
					enabledControllers: [vault],
					enabledCollaterals: [],
					positions: [entry],
				},
			]),
		),
	});
}

function items(plan: TransactionPlan) {
	const batch = plan.find((entry) => entry.type === "evcBatch");
	assert.ok(batch);
	return flattenBatchEntries(batch.items);
}

function calldata(plan: TransactionPlan) {
	return encodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		functionName: "batch",
		args: [items(plan)],
	});
}

function earn() {
	return new EulerEarn({
		type: VaultType.EulerEarn,
		chainId: 1,
		address: vault,
		shares: { address: vault, decimals: 6, name: "Earn", symbol: "EARN" },
		asset: { address: asset, decimals: 6, name: "Asset", symbol: "ASSET" },
		totalShares: 1_000_000n,
		totalAssets: 2_000_000n,
		isBorrowable: false,
		lostAssets: 0n,
		availableAssets: 2_000_000n,
		performanceFee: 0.1,
		governance: {
			owner,
			creator: owner,
			curator: owner,
			guardian: owner,
			feeReceiver: owner,
			timelock: 0,
			pendingTimelock: 0,
			pendingTimelockValidAt: 0,
			pendingGuardian: owner,
			pendingGuardianValidAt: 0,
		},
		supplyQueue: [],
		withdrawQueue: [],
		strategies: [],
		timestamp: 0,
	});
}

test("borrow has identical calldata for lowercase and checksummed active controller addresses", () => {
	const execution = service();
	const args = {
		account: account(),
		vault,
		amount: 10n,
		borrowAccount: subAccount,
		receiver: owner,
	};
	const checksummed = execution.planBorrow(args);
	const lowercase = execution.planBorrow({ ...args, vault: lowerVault });
	assert.equal(calldata(lowercase), calldata(checksummed));
	assert.deepEqual(
		items(lowercase).map(
			(item) =>
				decodeFunctionData({ abi: eVaultAbi, data: item.data }).functionName,
		),
		["borrow"],
	);
});

test("same-vault deposit repayment preserves max repayment and cleanup across address casing", () => {
	const execution = service();
	for (const liabilityAssets of [0n, 1_500_000n]) {
		const args = {
			account: account(position(owner), {
				...position(subAccount),
				assets: liabilityAssets,
			}),
			liabilityVault: vault,
			liabilityAmount: maxUint256,
			receiver: subAccount,
			fromVault: vault,
			fromAccount: owner,
			cleanupOnMax: true,
		};
		const checksummed = execution.planRepayFromDeposit(args);
		const lowercase = execution.planRepayFromDeposit({
			...args,
			fromVault: lowerVault,
		});
		assert.equal(calldata(lowercase), calldata(checksummed));
		const repay = decodeFunctionData({
			abi: eVaultAbi,
			data: items(lowercase)[0]!.data,
		});
		assert.equal(repay.functionName, "repayWithShares");
		assert.deepEqual(repay.args, [maxUint256, getAddress(subAccount)]);
	}
});

test("deposit repayment compares underlying asset addresses independently of casing", () => {
	const execution = service();
	const args = {
		account: account(position(owner, lowerAsset)),
		liabilityVault: vault,
		liabilityAmount: 10n,
		receiver: subAccount,
		fromVault: vault,
		fromAccount: owner,
	};
	const plan = execution.planRepayFromDeposit(args);
	assert.equal(
		calldata(plan),
		calldata(execution.planRepayFromDeposit({ ...args, account: account() })),
	);
	assert.equal(
		decodeFunctionData({ abi: eVaultAbi, data: items(plan)[0]!.data })
			.functionName,
		"repayWithShares",
	);
});

test("EulerEarn asset-denominated redeem enforces the asset amount on chain and preserves collateral cleanup", () => {
	const execution = service();
	const earnVault = earn();
	const earnPosition = {
		...position(owner),
		vault: earnVault,
		isCollateral: true,
	};
	const args = {
		account: account(earnPosition),
		vault,
		owner,
		receiver: subAccount,
		disableCollateral: true,
	};
	const assetItems = items(
		execution.planRedeem({ ...args, assets: 1_000_000n }),
	);
	assert.equal(assetItems.length, 2);
	assert.equal(
		decodeFunctionData({
			abi: ethereumVaultConnectorAbi,
			data: assetItems[0]!.data,
		}).functionName,
		"disableCollateral",
	);
	const withdraw = decodeFunctionData({
		abi: eVaultAbi,
		data: assetItems[1]!.data,
	});
	assert.equal(withdraw.functionName, "withdraw");
	assert.deepEqual(withdraw.args, [1_000_000n, subAccount, owner]);

	for (const shares of [123_456n, maxUint256]) {
		const shareItems = items(execution.planRedeem({ ...args, shares }));
		const redeem = decodeFunctionData({
			abi: eVaultAbi,
			data: shareItems[1]!.data,
		});
		assert.equal(redeem.functionName, "redeem");
		assert.deepEqual(redeem.args, [shares, subAccount, owner]);
	}
});

test("EulerEarn previewWithdraw uses ceiling rounding over snapshot totals", () => {
	const vault = earn();
	for (const assets of [0n, 1n, 3n, 1_000_000n]) {
		const shares = vault.previewWithdraw(assets);
		assert.ok(vault.convertToAssets(shares) >= assets);
		if (shares > 0n) assert.ok(vault.convertToAssets(shares - 1n) < assets);
	}
	assert.equal(vault.previewWithdraw(1_000_000n), 666_667n);
	assert.equal(vault.convertToShares(1_000_000n), 666_666n);
});
