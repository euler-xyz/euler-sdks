import assert from "node:assert/strict";
import { test } from "vitest";
import {
	encodeFunctionData,
	getAddress,
	type Address,
} from "viem";
import { Account } from "../src/entities/Account.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../src/services/executionService/index.js";
import { calculateHealthCheckSets } from "../src/utils/healthCheckSets.js";

const OWNER = getAddress("0x00000000000000000000000000000000000000BB");
const CONTROLLER = getAddress("0x00000000000000000000000000000000000000DD");
const COLLATERAL = getAddress("0x00000000000000000000000000000000000000EE");
const ASSET = getAddress("0x00000000000000000000000000000000000000A1");

test("calculateHealthCheckSets snapshots batch-local controller and collateral state", () => {
	const account = new Account({
		chainId: 1,
		owner: OWNER,
		populated: { vaults: true },
		subAccounts: {
			[OWNER]: {
				timestamp: 0,
				account: OWNER,
				owner: OWNER,
				lastAccountStatusCheckTimestamp: 0,
				enabledControllers: [CONTROLLER],
				enabledCollaterals: [COLLATERAL],
				positions: [
					{
						account: OWNER,
						vaultAddress: CONTROLLER,
						vault: { address: CONTROLLER },
						asset: ASSET,
						shares: 0n,
						assets: 0n,
						borrowed: 1n,
						isController: true,
						isCollateral: false,
						balanceForwarderEnabled: false,
					},
					{
						account: OWNER,
						vaultAddress: COLLATERAL,
						vault: { address: COLLATERAL },
						asset: ASSET,
						shares: 1n,
						assets: 1n,
						borrowed: 0n,
						isController: false,
						isCollateral: true,
						balanceForwarderEnabled: false,
					},
				],
			},
		},
	});
	const batchItem = (
		targetContract: Address,
		onBehalfOfAccount: Address,
		data: EVCBatchItem["data"],
	): EVCBatchItem => ({
		targetContract,
		onBehalfOfAccount,
		value: 0n,
		data,
	});
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				batchItem(
					CONTROLLER,
					OWNER,
					encodeFunctionData({
						abi: eVaultAbi,
						functionName: "borrow",
						args: [1n, OWNER],
					}),
				),
			],
		},
		{
			type: "evcBatch",
			items: [
				batchItem(
					CONTROLLER,
					OWNER,
					encodeFunctionData({
						abi: eVaultAbi,
						functionName: "disableController",
					}),
				),
				batchItem(
					CONTROLLER,
					OWNER,
					encodeFunctionData({
						abi: eVaultAbi,
						functionName: "borrow",
						args: [1n, OWNER],
					}),
				),
			],
		},
	];

	assert.deepEqual(calculateHealthCheckSets(plan, account), [
		{
			planIndex: 0,
			accounts: [
				{
					account: OWNER,
					controllers: [CONTROLLER],
					collaterals: [COLLATERAL],
				},
			],
		},
		{
			planIndex: 1,
			accounts: [
				{
					account: OWNER,
					controllers: [],
					collaterals: [COLLATERAL],
				},
			],
		},
	]);
});
