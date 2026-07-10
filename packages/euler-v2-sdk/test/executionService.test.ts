import assert from "node:assert/strict";
import { test } from "vitest";
import {
	type Abi,
	decodeFunctionData,
	encodeFunctionData,
	erc20Abi,
	getAddress,
	maxUint256,
} from "viem";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import {
	type CowSwapPlanItem,
	flattenBatchEntries,
	type EVCBatchItem,
	type TransactionPlan,
} from "../src/services/executionService/executionServiceTypes.js";
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { VaultType } from "../src/utils/types.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN_IN = "0x00000000000000000000000000000000000000bb" as const;
const SWAPPER = "0x00000000000000000000000000000000000000cc" as const;
const VERIFIER = "0x00000000000000000000000000000000000000dd" as const;
const RECEIVER = "0x00000000000000000000000000000000000000ee" as const;
const VAULT_IN = "0x00000000000000000000000000000000000000ff" as const;
const EVC = "0x0000000000000000000000000000000000000011" as const;
const SOURCE_ACCOUNT = "0x0000000000000000000000000000000000000a01" as const;
const SOURCE_VAULT = "0x0000000000000000000000000000000000000a02" as const;
const LIABILITY_VAULT = "0x0000000000000000000000000000000000000a03" as const;
const SAME_ASSET = "0x0000000000000000000000000000000000000a04" as const;
const MAINNET_USDT = getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7");
const COLLATERAL_VAULT = "0x0000000000000000000000000000000000000a05" as const;
const DESTINATION_VAULT = "0x0000000000000000000000000000000000000a06" as const;
const NEW_LIABILITY_VAULT = "0x0000000000000000000000000000000000000a07" as const;
const PERMIT2 = "0x0000000000000000000000000000000000000012" as const;
const AMOUNT = 12345n;

function createExecutionService() {
	return new ExecutionService(
		{
			getDeployment: () => ({
				addresses: {
					coreAddrs: {
						evc: EVC,
						permit2: PERMIT2,
					},
				},
			}),
		} as never,
		{} as never,
	);
}

function createBatchItem(
	targetContract = VAULT_IN,
	onBehalfOfAccount = ACCOUNT,
): EVCBatchItem {
	return {
		targetContract,
		onBehalfOfAccount,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "touch",
			args: [],
		}),
	};
}

function decodeBatchFunctionName(item: EVCBatchItem): string {
	const abi = item.targetContract === EVC ? ethereumVaultConnectorAbi : eVaultAbi;
	return decodeFunctionData({ abi, data: item.data }).functionName;
}

function getOnlyEvcBatchItems(plan: TransactionPlan): EVCBatchItem[] {
	const batch = plan.find((item) => item.type === "evcBatch");
	assert.equal(batch?.type, "evcBatch");
	if (batch?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	return flattenBatchEntries(batch.items);
}

function encodeSkimVerifierData(
	vault = RECEIVER,
	account = ACCOUNT,
	amount = 9900n,
	deadline = 123n,
) {
	return encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyAmountMinAndSkim",
		args: [vault, account, amount, deadline],
	});
}

function encodeTransferVerifierData(
	asset = RECEIVER,
	receiver = RECEIVER,
	amount = 9900n,
	deadline = 123n,
) {
	return encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyAmountMinAndTransfer",
		args: [asset, receiver, amount, deadline],
	});
}

function encodeDebtVerifierData(
	vault = LIABILITY_VAULT,
	account = RECEIVER,
	amount = AMOUNT,
	deadline = 123n,
) {
	return encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyDebtMax",
		args: [vault, account, amount, deadline],
	});
}

function createSwapQuote() {
	return {
		amountIn: AMOUNT.toString(),
		amountInMax: AMOUNT.toString(),
		amountOut: "9950",
		amountOutMin: "9900",
		accountIn: ACCOUNT,
		accountOut: ACCOUNT,
		vaultIn: VAULT_IN,
		receiver: RECEIVER,
		tokenIn: {
			address: TOKEN_IN,
			name: "Wrapped Ether",
			symbol: "WETH",
			decimals: 18,
			chainId: 1,
			meta: undefined,
		},
		tokenOut: {
			address: RECEIVER,
			name: "USD Coin",
			symbol: "USDC",
			decimals: 6,
			chainId: 1,
			meta: undefined,
		},
		slippage: 0.5,
		swap: {
			swapperAddress: SWAPPER,
			swapperData: "0x1234",
			multicallItems: [],
		},
		verify: {
			type: "skimMin",
			verifierAddress: VERIFIER,
			verifierData: encodeSkimVerifierData(),
			vault: RECEIVER,
			account: ACCOUNT,
			amount: "9900",
			deadline: 123,
		},
		route: [{ providerName: "OpenOcean" }],
	};
}

function createCowSwapQuote() {
	return {
		...createSwapQuote(),
		route: [{ providerName: "CoW Swap" }],
		providerData: {
			quoteId: 42,
			sellAmount: "1000",
			buyAmount: "2000",
			feeAmount: "7",
		},
	};
}

function createTransferSwapQuote() {
	return {
		...createSwapQuote(),
		verify: {
			type: "transferMin",
			verifierAddress: VERIFIER,
			verifierData: encodeTransferVerifierData(RECEIVER, RECEIVER),
			vault: RECEIVER,
			account: ACCOUNT,
			amount: "9900",
			deadline: 123,
		},
		transferOutputToReceiver: true,
	};
}

function createRepaySwapQuote() {
	return {
		...createSwapQuote(),
		amountOut: AMOUNT.toString(),
		amountOutMin: AMOUNT.toString(),
		accountIn: SOURCE_ACCOUNT,
		accountOut: RECEIVER,
		vaultIn: SOURCE_VAULT,
		receiver: LIABILITY_VAULT,
		verify: {
			type: "debtMax",
			verifierAddress: VERIFIER,
			verifierData: encodeDebtVerifierData(),
			vault: LIABILITY_VAULT,
			account: RECEIVER,
			amount: AMOUNT.toString(),
			deadline: 123,
		},
	};
}

function createWalletRepaySwapQuote() {
	return {
		...createRepaySwapQuote(),
		verify: {
			type: "debtMax",
			verifierAddress: VERIFIER,
			verifierData: encodeDebtVerifierData(LIABILITY_VAULT, RECEIVER, 0n),
			vault: LIABILITY_VAULT,
			account: RECEIVER,
			amount: "0",
			deadline: 123,
		},
	};
}

function createRepayFromDepositAccount({
	liabilityAssets = 77n,
}: { liabilityAssets?: bigint } = {}) {
	return {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (account: string, vault: string) => {
			if (account === RECEIVER && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: liabilityAssets,
					borrowed: AMOUNT,
				};
			}
			if (account === SOURCE_ACCOUNT && vault === SOURCE_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: AMOUNT * 2n,
				};
			}
			if (account === SOURCE_ACCOUNT && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: AMOUNT * 2n,
				};
			}
			return undefined;
		},
		getSubAccount: (account: string) => {
			if (account === RECEIVER) {
				return {
					enabledCollaterals: [COLLATERAL_VAULT],
					positions: [
						{
							account: RECEIVER,
							vaultAddress: COLLATERAL_VAULT,
							vault: { type: VaultType.EVault, address: COLLATERAL_VAULT },
							asset: SAME_ASSET,
							assets: AMOUNT,
							shares: AMOUNT,
						},
					],
				};
			}
			return undefined;
		},
	} as never;
}

function createSameAssetMigrationAccount({
	oldLiabilityAssets = 0n,
	oldLiabilityShares = 0n,
}: {
	oldLiabilityAssets?: bigint;
	oldLiabilityShares?: bigint;
} = {}) {
	return {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (account: string, vault: string) => {
			if (account !== RECEIVER) return undefined;
			if (vault === SOURCE_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: AMOUNT,
					shares: AMOUNT + 10n,
				};
			}
			if (vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: oldLiabilityAssets,
					shares: oldLiabilityShares,
					borrowed: AMOUNT,
				};
			}
			return undefined;
		},
		isCollateralEnabled: (account: string, vault: string) =>
			account === RECEIVER && vault === SOURCE_VAULT,
		isControllerEnabled: (account: string, vault: string) =>
			account === RECEIVER && vault === LIABILITY_VAULT,
	} as never;
}

test("describeBatch preserves decoded items even when one batch item is unknown", () => {
	const service = createExecutionService();
	const batch = [
		{
			targetContract: VERIFIER,
			onBehalfOfAccount: ACCOUNT,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "transferFromSender",
				args: [TOKEN_IN, AMOUNT, SWAPPER],
			}),
		},
		{
			targetContract: SWAPPER,
			onBehalfOfAccount: ACCOUNT,
			value: 0n,
			data: "0xdeadbeef",
		},
	] as const;

	assert.deepEqual(service.describeBatch(batch), [
		{
			targetContract: VERIFIER,
			onBehalfOfAccount: ACCOUNT,
			functionName: "transferFromSender",
        args: {
          token: TOKEN_IN,
          amount: AMOUNT,
          to: SWAPPER,
        },
      },
		{
			targetContract: SWAPPER,
			onBehalfOfAccount: ACCOUNT,
			functionName: "Unknown",
			args: {},
		},
	]);
});

test("describeBatch decodes caller-provided extra ABIs item-by-item", () => {
  const service = createExecutionService();
  const tosAbi = [
    {
      type: "function",
      name: "signTermsOfUse",
      stateMutability: "nonpayable",
      inputs: [
        { name: "terms", type: "string" },
        { name: "termsHash", type: "bytes32" },
      ],
      outputs: [],
    },
  ] as const satisfies Abi;
  const batch = [
    {
      targetContract: "0x0000000000000000000000000000000000000013",
      onBehalfOfAccount: ACCOUNT,
      value: 0n,
      data: encodeFunctionData({
        abi: tosAbi,
        functionName: "signTermsOfUse",
        args: [
          "Terms",
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        ],
      }),
    },
  ];

  const described = service.describeBatch(batch, [tosAbi]);

	assert.equal(described[0]?.functionName, "signTermsOfUse");
	assert.deepEqual(described[0]?.args, {
		terms: "Terms",
		termsHash:
			"0x1111111111111111111111111111111111111111111111111111111111111111",
	});
});

test("describeBatch preserves operation groupings while decoding child items", () => {
	const service = createExecutionService();
	const batchItem = createBatchItem(VAULT_IN);

	assert.deepEqual(
		service.describeBatch([{ type: "operation", name: "test", items: [batchItem] }]),
		[
			{
				type: "operation",
				name: "test",
				items: [
					{
						targetContract: VAULT_IN,
						onBehalfOfAccount: ACCOUNT,
						functionName: "touch",
						args: {},
					},
				],
			},
		],
	);
});

test("convertBatchItemsToPlan groups encoded batch items into an operation when named", () => {
	const service = createExecutionService();
	const first = createBatchItem(VAULT_IN);
	const second = createBatchItem(SOURCE_VAULT);

	const plan = service.convertBatchItemsToPlan([first, second], "operation");

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	const planItem = plan[0];
	const operation = planItem.items[0];

	assert.equal(planItem.items.length, 1);
	assert.equal(
		operation && "type" in operation ? operation.type : undefined,
		"operation",
	);
	assert.equal(
		operation && "type" in operation ? operation.name : undefined,
		"operation",
	);
	assert.deepEqual(flattenBatchEntries(planItem.items), [first, second]);
});

test("convertBatchItemsToPlan wraps raw batch items without creating an operation", () => {
	const service = createExecutionService();
	const first = createBatchItem(VAULT_IN);
	const second = createBatchItem(SOURCE_VAULT);

	const plan = service.convertBatchItemsToPlan([first, second]);

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	assert.deepEqual(plan[0].items, [first, second]);
});

test("convertBatchItemsToPlan wraps batch items in an operation when a name is provided", () => {
	const service = createExecutionService();
	const first = createBatchItem(VAULT_IN);
	const second = createBatchItem(SOURCE_VAULT);

	const plan = service.convertBatchItemsToPlan([first, second], "custom");

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	assert.equal(plan[0].items.length, 1);
	const operation = plan[0].items[0];
	assert.equal(
		operation && "type" in operation ? operation.type : undefined,
		"operation",
	);
	assert.equal(
		operation && "type" in operation ? operation.name : undefined,
		"custom",
	);
	assert.deepEqual(flattenBatchEntries(plan[0].items), [first, second]);
});

test("addBatchItemToPlan appends a raw batch item to the last batch", () => {
	const service = createExecutionService();
	const first = createBatchItem(VAULT_IN);
	const second = createBatchItem(SOURCE_VAULT);
	const plan = service.convertBatchItemsToPlan([first]);

	const updated = service.addBatchItemToPlan(plan, second);

	assert.equal(updated, plan);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	assert.equal(plan[0].items.length, 2);
	assert.equal(plan[0].items[1], second);
	assert.deepEqual(flattenBatchEntries(plan[0].items), [first, second]);
});

test("mergePlans preserves operation groupings while concatenating adjacent batches", () => {
	const service = createExecutionService();
	const first = createBatchItem(VAULT_IN);
	const extra = createBatchItem(SOURCE_VAULT);
	const second = createBatchItem(LIABILITY_VAULT);
	const firstPlan: TransactionPlan = service.convertBatchItemsToPlan([first], "first");
	const secondPlan: TransactionPlan = service.convertBatchItemsToPlan([second], "second");
	service.addBatchItemToPlan(firstPlan, extra);

	const merged = service.mergePlans([firstPlan, secondPlan]);

	assert.equal(merged.length, 1);
	assert.equal(merged[0]?.type, "evcBatch");
	if (merged[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	assert.equal(merged[0].items.length, 3);
	const firstEntry = merged[0].items[0];
	const lastEntry = merged[0].items[2];
	assert.equal(
		firstEntry && "type" in firstEntry ? firstEntry.type : undefined,
		"operation",
	);
	assert.equal(
		firstEntry && "type" in firstEntry ? firstEntry.name : undefined,
		"first",
	);
	assert.equal(merged[0].items[1], extra);
	assert.equal(
		lastEntry && "type" in lastEntry ? lastEntry.type : undefined,
		"operation",
	);
	assert.equal(
		lastEntry && "type" in lastEntry ? lastEntry.name : undefined,
		"second",
	);
	assert.deepEqual(flattenBatchEntries(merged[0].items), [first, extra, second]);
});

test("mergePlans preserves operation wallet balance token metadata", () => {
	const service = createExecutionService();
	const first = createBatchItem(VAULT_IN);
	const second = createBatchItem(LIABILITY_VAULT);
	const firstPlan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					type: "operation",
					name: "claim",
					items: [first],
					walletBalanceTokens: [TOKEN_IN],
				},
			],
		},
	];
	const secondPlan = service.convertBatchItemsToPlan([second], "second");

	const merged = service.mergePlans([firstPlan, secondPlan]);

	assert.equal(merged[0]?.type, "evcBatch");
	if (merged[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	const firstEntry = merged[0].items[0];
	assert.equal(
		firstEntry && "type" in firstEntry ? firstEntry.type : undefined,
		"operation",
	);
	assert.deepEqual(
		firstEntry && "type" in firstEntry
			? firstEntry.walletBalanceTokens
			: undefined,
		[TOKEN_IN],
	);
});

test("mergePlans collapses collateral state transitions to the resulting action", () => {
	const service = createExecutionService();
	const enable = service.encodeEnableCollateral(1, ACCOUNT, COLLATERAL_VAULT);
	const disable = service.encodeDisableCollateral(1, ACCOUNT, COLLATERAL_VAULT);

	const cancelled = service.mergePlans([
		service.convertBatchItemsToPlan([enable]),
		service.convertBatchItemsToPlan([disable]),
	]);
	assert.deepEqual(cancelled, []);

	const enabled = service.mergePlans([
		service.convertBatchItemsToPlan([enable]),
		service.convertBatchItemsToPlan([disable]),
		service.convertBatchItemsToPlan([enable]),
	]);
	assert.equal(enabled.length, 1);
	assert.equal(enabled[0]?.type, "evcBatch");
	if (enabled[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	assert.deepEqual(flattenBatchEntries(enabled[0].items), [enable]);
});

test("mergePlans deduplicates repeated controller transitions without cancelling opposites", () => {
	const service = createExecutionService();
	const enable = service.encodeEnableController(1, ACCOUNT, LIABILITY_VAULT);
	const disable = service.encodeDisableController(LIABILITY_VAULT, ACCOUNT);

	const merged = service.mergePlans([
		service.convertBatchItemsToPlan([enable]),
		service.convertBatchItemsToPlan([enable]),
		service.convertBatchItemsToPlan([disable]),
		service.convertBatchItemsToPlan([disable]),
		service.convertBatchItemsToPlan([enable]),
	]);

	assert.equal(merged.length, 1);
	assert.equal(merged[0]?.type, "evcBatch");
	if (merged[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	assert.deepEqual(flattenBatchEntries(merged[0].items), [
		enable,
		disable,
		enable,
	]);
});

test("mergePlans rejects contract calls because call boundaries need manual merging", () => {
	const service = createExecutionService();
	const plan: TransactionPlan = [
		{
			type: "contractCall",
			chainId: 1,
			to: TOKEN_IN,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [ACCOUNT],
			value: 0n,
		},
	];

	assert.throws(
		() => service.mergePlans([plan]),
		/cannot merge contractCall plan items/,
	);
});

test("planCleanup matches Lite stale collateral and controller cleanup policy", () => {
	const service = createExecutionService();
	const account = {
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [LIABILITY_VAULT],
			enabledCollaterals: [COLLATERAL_VAULT, DESTINATION_VAULT],
			positions: [
				{
					vaultAddress: LIABILITY_VAULT,
					assets: 0n,
					shares: 0n,
					borrowed: AMOUNT,
				},
				{
					vaultAddress: COLLATERAL_VAULT,
					assets: AMOUNT,
					shares: AMOUNT,
					borrowed: 0n,
				},
			],
		}),
	} as never;

	const plan = service.planCleanup({ account, subAccount: RECEIVER });

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 1);
	const disableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(disableCollateral.functionName, "disableCollateral");
	assert.deepEqual(disableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(DESTINATION_VAULT),
	]);
});

test("planCleanup disables all collaterals and controllers when no borrows remain", () => {
	const service = createExecutionService();
	const account = {
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [LIABILITY_VAULT],
			enabledCollaterals: [COLLATERAL_VAULT],
			positions: [
				{
					vaultAddress: COLLATERAL_VAULT,
					assets: AMOUNT,
					shares: AMOUNT,
					borrowed: 0n,
				},
			],
		}),
	} as never;

	const plan = service.planCleanup({ account, subAccount: RECEIVER });

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 2);

	const disableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(disableCollateral.functionName, "disableCollateral");

	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(disableController.functionName, "disableController");
	assert.equal(items[1]?.targetContract, LIABILITY_VAULT);
	assert.equal(items[1]?.onBehalfOfAccount, RECEIVER);
});

test("planCleanup disables all stale collaterals when no controllers are enabled", () => {
	const service = createExecutionService();
	const account = {
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [],
			enabledCollaterals: [COLLATERAL_VAULT, DESTINATION_VAULT],
			positions: [],
		}),
	} as never;

	const plan = service.planCleanup({ account, subAccount: RECEIVER });

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 2);
	for (const item of items) {
		const decoded = decodeFunctionData({
			abi: ethereumVaultConnectorAbi,
			data: item.data,
		});
		assert.equal(decoded.functionName, "disableCollateral");
	}
});

test("deposit supports native wrapping before the vault deposit", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		isCollateralEnabled: () => false,
	} as never;
	const plan = service.planDeposit({
		account,
		vault: VAULT_IN,
		amount: AMOUNT,
		receiver: ACCOUNT,
		asset: TOKEN_IN,
		wrappedNativeInfo: {
			wrappedTokenAddress: TOKEN_IN,
			nativeAmount: AMOUNT,
		},
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 3);
	assert.equal(items[0]?.targetContract, TOKEN_IN);
	assert.equal(items[0]?.value, AMOUNT);

	const transfer = decodeFunctionData({
		abi: erc20Abi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(transfer.functionName, "transfer");
	assert.deepEqual(transfer.args, [getAddress(ACCOUNT), AMOUNT]);

	const deposit = decodeFunctionData({
		abi: eVaultAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(deposit.functionName, "deposit");
	assert.deepEqual(deposit.args, [AMOUNT, getAddress(ACCOUNT)]);
});

test("redeem accepts assets and converts to shares from account vault state", () => {
	const service = createExecutionService();
	const assets = 123_456n;
	const totalAssets = 5_000_000n;
	const totalShares = 7_000_000n;
	const virtualDeposit = 1_000_000n;
	// previewWithdraw rounds shares UP so redeem(shares) yields at least `assets`.
	// Mirror the on-chain Math.mulDiv(Rounding.Ceil) using the virtual-deposit-
	// adjusted totals, matching ExecutionService.resolveRedeemShares.
	const numerator = assets * (totalShares + virtualDeposit);
	const denominator = totalAssets + virtualDeposit;
	const expectedShares = (numerator + denominator - 1n) / denominator;
	const account = {
		chainId: 1,
		getPosition: () => ({
			isCollateral: false,
			vault: {
				address: VAULT_IN,
				convertToShares: (value: bigint) =>
					(value * (totalShares + virtualDeposit)) /
					(totalAssets + virtualDeposit),
				previewWithdraw: (value: bigint) => {
					const num = value * (totalShares + virtualDeposit);
					const den = totalAssets + virtualDeposit;
					return (num + den - 1n) / den;
				},
			},
		}),
	} as never;

	const plan = service.planRedeem({
		account,
		vault: VAULT_IN,
		assets,
		owner: ACCOUNT,
		receiver: RECEIVER,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 1);
	const redeem = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(redeem.functionName, "redeem");
	assert.deepEqual(redeem.args, [
		expectedShares,
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);
});

test("deposit-with-swap-from-wallet emits explicit required approval", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		isCollateralEnabled: () => false,
	} as never;
	const plan = service.planDepositWithSwapFromWallet({
		account,
		swapQuote: createSwapQuote(),
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
		enableCollateral: true,
	});

	assert.deepEqual(plan[0], {
		type: "requiredApproval",
		token: TOKEN_IN,
		owner: ACCOUNT,
		spender: VERIFIER,
		amount: AMOUNT,
	});
});

test("swap-from-wallet emits explicit required approval and wallet-swap batch", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
	} as never;
	const plan = service.planSwapFromWallet({
		account,
		swapQuote: createTransferSwapQuote(),
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
	});

	assert.deepEqual(plan[0], {
		type: "requiredApproval",
		token: TOKEN_IN,
		owner: ACCOUNT,
		spender: VERIFIER,
		amount: AMOUNT,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const batchItems = flattenBatchEntries(plan[1].items);
	assert.equal(batchItems[0]?.targetContract, VERIFIER);
	assert.equal(batchItems[1]?.targetContract, SWAPPER);
	assert.equal(batchItems[2]?.targetContract, VERIFIER);

	const transfer = decodeFunctionData({
		abi: swapVerifierAbi,
		data: batchItems[0]?.data ?? "0x",
	});
	assert.equal(transfer.functionName, "transferFromSender");
	assert.deepEqual(transfer.args, [TOKEN_IN, AMOUNT, SWAPPER]);
});

test("swap-from-wallet rejects non-transfer verifier quotes", () => {
	const service = createExecutionService();

	assert.throws(
		() =>
			service.encodeSwapFromWallet({
				chainId: 1,
				swapQuote: createSwapQuote() as never,
				amount: AMOUNT,
				sender: ACCOUNT,
			}),
		/Invalid swap quote type for wallet swap/,
	);
});

test("swap-from-wallet trusts verifier calldata supplied in the quote", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
	} as never;
	const quote = createTransferSwapQuote();
	quote.verify.verifierData = encodeTransferVerifierData(RECEIVER, RECEIVER, 1n);

	const plan = service.planSwapFromWallet({
		account,
		swapQuote: quote,
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const batchItems = flattenBatchEntries(plan[1].items);
	assert.equal(batchItems[2]?.data, quote.verify.verifierData);
});

test("swap-and-borrow-from-wallet builds wallet swap, collateral, controller, and borrow calls", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		isCollateralEnabled: () => false,
		isControllerEnabled: () => false,
		getCurrentController: () => undefined,
	} as never;
	const plan = service.planSwapAndBorrowFromWallet({
		account,
		swapQuote: createSwapQuote() as never,
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
		borrowVault: LIABILITY_VAULT,
		borrowAmount: AMOUNT + 1n,
		borrowAccount: RECEIVER,
		collateralVault: DESTINATION_VAULT,
		wrappedNativeInfo: {
			wrappedTokenAddress: TOKEN_IN,
			nativeAmount: 99n,
		},
	});

	assert.deepEqual(plan[0], {
		type: "requiredApproval",
		token: TOKEN_IN,
		owner: ACCOUNT,
		spender: VERIFIER,
		amount: AMOUNT,
	});
	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 8);
	assert.equal(items[0]?.targetContract, TOKEN_IN);
	assert.equal(items[0]?.value, 99n);

	const nativeTransfer = decodeFunctionData({
		abi: erc20Abi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(nativeTransfer.functionName, "transfer");
	assert.deepEqual(nativeTransfer.args, [getAddress(ACCOUNT), 99n]);

	const transferFromSender = decodeFunctionData({
		abi: swapVerifierAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(transferFromSender.functionName, "transferFromSender");

	const enableController = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[5]?.data ?? "0x",
	});
	assert.equal(enableController.functionName, "enableController");
	assert.deepEqual(enableController.args, [
		getAddress(RECEIVER),
		getAddress(LIABILITY_VAULT),
	]);

	const enableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[6]?.data ?? "0x",
	});
	assert.equal(enableCollateral.functionName, "enableCollateral");
	assert.deepEqual(enableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(DESTINATION_VAULT),
	]);

	const borrow = decodeFunctionData({
		abi: eVaultAbi,
		data: items[7]?.data ?? "0x",
	});
	assert.equal(borrow.functionName, "borrow");
	assert.deepEqual(borrow.args, [AMOUNT + 1n, getAddress(ACCOUNT)]);
});

test("swap-and-borrow-from-wallet prepends stale-state cleanup by default", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [LIABILITY_VAULT],
			enabledCollaterals: [COLLATERAL_VAULT, DESTINATION_VAULT],
			positions: [],
		}),
		isCollateralEnabled: (_account: string, vault: string) =>
			vault === DESTINATION_VAULT,
		isControllerEnabled: () => true,
		getCurrentController: () => LIABILITY_VAULT,
	} as never;

	const plan = service.planSwapAndBorrowFromWallet({
		account,
		swapQuote: createSwapQuote() as never,
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
		borrowVault: LIABILITY_VAULT,
		borrowAmount: AMOUNT + 1n,
		borrowAccount: RECEIVER,
		collateralVault: DESTINATION_VAULT,
	});

	const items = getOnlyEvcBatchItems(plan);
	assert.deepEqual(items.slice(0, 3).map(decodeBatchFunctionName), [
		"disableCollateral",
		"disableCollateral",
		"disableController",
	]);
	assert.deepEqual(items.slice(-3).map(decodeBatchFunctionName), [
		"enableController",
		"enableCollateral",
		"borrow",
	]);
});

test("swap-and-repay-from-wallet builds wallet swap repay and full cleanup", () => {
	const service = createExecutionService();
	const plan = service.planSwapAndRepayFromWallet({
		account: createRepayFromDepositAccount(),
		swapQuote: createWalletRepaySwapQuote() as never,
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
		liabilityVault: LIABILITY_VAULT,
		repayAccount: RECEIVER,
		cleanupOnMax: true,
	});

	assert.equal(plan[0]?.type, "requiredApproval");
	if (plan[0]?.type !== "requiredApproval") {
		throw new Error("expected approval");
	}
	assert.equal(plan[0].spender, VERIFIER);

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 6);

	const verifier = decodeFunctionData({
		abi: swapVerifierAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(verifier.functionName, "verifyDebtMax");
	assert.deepEqual(verifier.args, [
		getAddress(LIABILITY_VAULT),
		getAddress(RECEIVER),
		0n,
		123n,
	]);

	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(disableController.functionName, "disableController");
});

test("swap-and-repay-from-wallet full repay skips cleanup by default", () => {
	const service = createExecutionService();
	const plan = service.planSwapAndRepayFromWallet({
		account: createRepayFromDepositAccount(),
		swapQuote: createWalletRepaySwapQuote() as never,
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
		liabilityVault: LIABILITY_VAULT,
		repayAccount: RECEIVER,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	assert.equal(flattenBatchEntries(plan[1].items).length, 4);
});

test("swap-and-repay-from-wallet partial repay skips cleanup even when requested", () => {
	const service = createExecutionService();
	const plan = service.planSwapAndRepayFromWallet({
		account: createRepayFromDepositAccount(),
		swapQuote: {
			...createWalletRepaySwapQuote(),
			amountOutMin: (AMOUNT - 1n).toString(),
		} as never,
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
		liabilityVault: LIABILITY_VAULT,
		repayAccount: RECEIVER,
		cleanupOnMax: true,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 3);

	const transfer = decodeFunctionData({
		abi: swapVerifierAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(transfer.functionName, "transferFromSender");
	assert.equal(items[1]?.targetContract, SWAPPER);
	const verifier = decodeFunctionData({
		abi: swapVerifierAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(verifier.functionName, "verifyDebtMax");
});

test("swap-and-repay-from-wallet main-account full cleanup disables collateral without transfer", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (accountAddress: string, vault: string) => {
			if (accountAddress === ACCOUNT && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: 77n,
					borrowed: AMOUNT,
				};
			}
			return undefined;
		},
		getSubAccount: (accountAddress: string) => {
			if (accountAddress === ACCOUNT) {
				return {
					enabledCollaterals: [COLLATERAL_VAULT],
					positions: [
						{
							account: ACCOUNT,
							vaultAddress: COLLATERAL_VAULT,
							vault: { type: VaultType.EVault, address: COLLATERAL_VAULT },
							asset: SAME_ASSET,
							assets: AMOUNT,
							shares: AMOUNT,
						},
					],
				};
			}
			return undefined;
		},
	} as never;
	const plan = service.planSwapAndRepayFromWallet({
		account,
		swapQuote: {
			...createWalletRepaySwapQuote(),
			accountOut: ACCOUNT,
			verify: {
				...createWalletRepaySwapQuote().verify,
				account: ACCOUNT,
				verifierData: encodeDebtVerifierData(LIABILITY_VAULT, ACCOUNT, 0n),
			},
		} as never,
		amount: AMOUNT,
		tokenIn: TOKEN_IN,
		liabilityVault: LIABILITY_VAULT,
		repayAccount: ACCOUNT,
		cleanupOnMax: true,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 5);
	const calls = items.map((item) => {
		if (item.targetContract === VERIFIER) {
			return decodeFunctionData({ abi: swapVerifierAbi, data: item.data })
				.functionName;
		}
		if (item.targetContract === SWAPPER) return "swapper";
		const abi =
			item.targetContract === COLLATERAL_VAULT
				? eVaultAbi
				: [...eVaultAbi, ...ethereumVaultConnectorAbi];
		return decodeFunctionData({ abi, data: item.data }).functionName;
	});
	assert.deepEqual(calls, [
		"transferFromSender",
		"swapper",
		"verifyDebtMax",
		"disableController",
		"disableCollateral",
	]);
});

test("swap-debt disables the old liability controller when the swap fully repays it", () => {
	const service = createExecutionService();
	const quote = {
		...createRepaySwapQuote(),
		accountIn: RECEIVER,
		accountOut: RECEIVER,
		vaultIn: NEW_LIABILITY_VAULT,
		receiver: LIABILITY_VAULT,
		amountOutMin: AMOUNT.toString(),
		verify: {
			type: "debtMax",
			verifierAddress: VERIFIER,
			verifierData: encodeDebtVerifierData(LIABILITY_VAULT, RECEIVER, 0n),
			vault: LIABILITY_VAULT,
			account: RECEIVER,
			amount: "0",
			deadline: 123,
		},
	};
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (accountAddress: string, vault: string) => {
			if (accountAddress === RECEIVER && vault === LIABILITY_VAULT) {
				return { borrowed: AMOUNT };
			}
			return undefined;
		},
		isControllerEnabled: (accountAddress: string, vault: string) =>
			accountAddress === RECEIVER && vault === NEW_LIABILITY_VAULT,
	} as never;

	const plan = service.planSwapDebt({
		account,
		swapQuote: quote as never,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}
	const items = flattenBatchEntries(plan[0].items);
	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items.at(-1)?.data ?? "0x",
	});

	assert.equal(disableController.functionName, "disableController");
	assert.equal(items.at(-1)?.targetContract, LIABILITY_VAULT);
	assert.equal(items.at(-1)?.onBehalfOfAccount, RECEIVER);
});

test("debt swap disables the old liability controller when verifier targets zero debt", () => {
	const service = createExecutionService();
	const quote = {
		...createRepaySwapQuote(),
		accountIn: RECEIVER,
		accountOut: RECEIVER,
		vaultIn: NEW_LIABILITY_VAULT,
		receiver: LIABILITY_VAULT,
		amountOut: (AMOUNT + 2n).toString(),
		amountOutMin: (AMOUNT - 3n).toString(),
		verify: {
			type: "debtMax",
			verifierAddress: VERIFIER,
			verifierData: encodeDebtVerifierData(LIABILITY_VAULT, RECEIVER, 0n),
			vault: LIABILITY_VAULT,
			account: RECEIVER,
			amount: "0",
			deadline: 123,
		},
	};
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (accountAddress: string, vault: string) => {
			if (accountAddress === RECEIVER && vault === LIABILITY_VAULT) {
				return { borrowed: AMOUNT };
			}
			return undefined;
		},
		isControllerEnabled: (accountAddress: string, vault: string) =>
			accountAddress === RECEIVER && vault === NEW_LIABILITY_VAULT,
	} as never;

	const plan = service.planSwapDebt({
		account,
		swapQuote: quote as never,
	});

	const items = getOnlyEvcBatchItems(plan);
	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items.at(-1)?.data ?? "0x",
	});

	assert.equal(disableController.functionName, "disableController");
	assert.equal(items.at(-1)?.targetContract, LIABILITY_VAULT);
	assert.equal(items.at(-1)?.onBehalfOfAccount, RECEIVER);
});

test("withdraw-and-swap and redeem-and-swap withdraw to swapper and verify transfer output", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
	} as never;
	const withdrawPlan = service.planWithdrawAndSwap({
		account,
		vault: VAULT_IN,
		assets: AMOUNT,
		owner: SOURCE_ACCOUNT,
		swapQuote: {
			...createTransferSwapQuote(),
			accountIn: SOURCE_ACCOUNT,
			vaultIn: VAULT_IN,
		} as never,
	});
	const redeemPlan = service.planRedeemAndSwap({
		account,
		vault: VAULT_IN,
		shares: AMOUNT + 2n,
		owner: SOURCE_ACCOUNT,
		swapQuote: {
			...createTransferSwapQuote(),
			accountIn: SOURCE_ACCOUNT,
			vaultIn: VAULT_IN,
		} as never,
	});

	assert.equal(withdrawPlan[0]?.type, "evcBatch");
	assert.equal(redeemPlan[0]?.type, "evcBatch");
	if (
		withdrawPlan[0]?.type !== "evcBatch" ||
		redeemPlan[0]?.type !== "evcBatch"
	) {
		throw new Error("expected evcBatch");
	}

	const withdrawItems = flattenBatchEntries(withdrawPlan[0].items);
	const withdraw = decodeFunctionData({
		abi: eVaultAbi,
		data: withdrawItems[0]?.data ?? "0x",
	});
	assert.equal(withdraw.functionName, "withdraw");
	assert.deepEqual(withdraw.args, [
		AMOUNT,
		getAddress(SWAPPER),
		getAddress(SOURCE_ACCOUNT),
	]);
	assert.equal(withdrawItems[2]?.onBehalfOfAccount, ACCOUNT);

	const redeemItems = flattenBatchEntries(redeemPlan[0].items);
	const redeem = decodeFunctionData({
		abi: eVaultAbi,
		data: redeemItems[0]?.data ?? "0x",
	});
	assert.equal(redeem.functionName, "redeem");
	assert.deepEqual(redeem.args, [
		AMOUNT + 2n,
		getAddress(SWAPPER),
		getAddress(SOURCE_ACCOUNT),
	]);
	assert.equal(redeemItems[2]?.onBehalfOfAccount, ACCOUNT);
});

test("repay-from-deposit same-vault path preserves source account", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromDeposit({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: AMOUNT,
		receiver: RECEIVER,
		fromVault: LIABILITY_VAULT,
		fromAccount: SOURCE_ACCOUNT,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const repay = flattenBatchEntries(plan[0].items)[0];
	assert.equal(repay?.targetContract, LIABILITY_VAULT);
	assert.equal(repay?.onBehalfOfAccount, SOURCE_ACCOUNT);

	const decoded = decodeFunctionData({
		abi: eVaultAbi,
		data: repay?.data ?? "0x",
	});
	assert.equal(decoded.functionName, "repayWithShares");
	assert.deepEqual(decoded.args, [AMOUNT, getAddress(RECEIVER)]);
});

test("repay-from-deposit same-asset different-vault path uses skim and repayWithShares", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromDeposit({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: AMOUNT,
		receiver: RECEIVER,
		fromVault: SOURCE_VAULT,
		fromAccount: SOURCE_ACCOUNT,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 3);

	const withdraw = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(items[0]?.targetContract, SOURCE_VAULT);
	assert.equal(items[0]?.onBehalfOfAccount, SOURCE_ACCOUNT);
	assert.equal(withdraw.functionName, "withdraw");
	assert.deepEqual(withdraw.args, [
		AMOUNT,
		getAddress(LIABILITY_VAULT),
		getAddress(SOURCE_ACCOUNT),
	]);

	const skim = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(items[1]?.targetContract, LIABILITY_VAULT);
	assert.equal(items[1]?.onBehalfOfAccount, RECEIVER);
	assert.equal(skim.functionName, "skim");
	assert.deepEqual(skim.args, [AMOUNT, getAddress(RECEIVER)]);

	const repay = decodeFunctionData({
		abi: eVaultAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(items[2]?.targetContract, LIABILITY_VAULT);
	assert.equal(items[2]?.onBehalfOfAccount, RECEIVER);
	assert.equal(repay.functionName, "repayWithShares");
	assert.deepEqual(repay.args, [AMOUNT - 1n, getAddress(RECEIVER)]);
});

test("resolveRequiredApprovals resets mainnet USDT allowance before direct approval", () => {
	const service = createExecutionService();
	const staleAllowance = 1n;
	const plan = [
		{
			type: "requiredApproval",
			token: MAINNET_USDT,
			owner: ACCOUNT,
			spender: VAULT_IN,
			amount: AMOUNT,
		},
	] as const;
	const wallet = {
		chainId: 1,
		account: ACCOUNT,
		getAsset: () => ({
			account: ACCOUNT,
			asset: MAINNET_USDT,
			balance: AMOUNT,
			allowances: {
				[VAULT_IN]: {
					assetForVault: staleAllowance,
					assetForPermit2: 0n,
					assetForVaultInPermit2: 0n,
					permit2ExpirationTime: 0,
					permit2Nonce: 0,
				},
			},
		}),
	} as never;

	const resolved = service.resolveRequiredApprovalsWithWallet({
		plan: [...plan],
		chainId: 1,
		wallet,
		usePermit2: false,
	});
	const approval = resolved[0];
	assert.equal(approval?.type, "requiredApproval");
	if (approval?.type !== "requiredApproval") {
		throw new Error("expected requiredApproval");
	}

	assert.equal(approval.resolved?.length, 2);
	assert.deepEqual(
		approval.resolved?.map((item) =>
			item.type === "approve"
				? decodeFunctionData({ abi: erc20Abi, data: item.data }).args
				: [],
		),
		[
			[VAULT_IN, 0n],
			[VAULT_IN, AMOUNT],
		],
	);
});

test("resolveRequiredApprovalsWithWallet defaults to Lite Permit2 approval sizing", () => {
	const service = createExecutionService();
	const plan = [
		{
			type: "requiredApproval",
			token: TOKEN_IN,
			owner: ACCOUNT,
			spender: VAULT_IN,
			amount: AMOUNT,
		},
	] as const;
	const wallet = {
		chainId: 1,
		account: ACCOUNT,
		getAsset: () => ({
			account: ACCOUNT,
			asset: TOKEN_IN,
			balance: AMOUNT,
			allowances: {
				[VAULT_IN]: {
					assetForVault: 0n,
					assetForPermit2: 0n,
					assetForVaultInPermit2: 0n,
					permit2ExpirationTime: 0,
					permit2Nonce: 0,
				},
			},
		}),
	} as never;

	const resolved = service.resolveRequiredApprovalsWithWallet({
		plan: [...plan],
		chainId: 1,
		wallet,
	});
	const approval = resolved[0];
	assert.equal(approval?.type, "requiredApproval");
	if (approval?.type !== "requiredApproval") {
		throw new Error("expected requiredApproval");
	}

	assert.equal(approval.resolved?.length, 2);
	const [erc20Approval, permit2Approval] = approval.resolved ?? [];
	assert.equal(erc20Approval?.type, "approve");
	if (erc20Approval?.type !== "approve") {
		throw new Error("expected ERC20 approval");
	}
	assert.deepEqual(
		decodeFunctionData({ abi: erc20Abi, data: erc20Approval.data }).args,
		[PERMIT2, maxUint256],
	);
	assert.deepEqual(permit2Approval, {
		type: "permit2",
		token: TOKEN_IN,
		owner: ACCOUNT,
		spender: VAULT_IN,
		amount: AMOUNT,
	});
});

test("resolveRequiredApprovalsWithWallet skips Permit2 when direct vault allowance already covers amount", () => {
	const service = createExecutionService();
	const plan = [
		{
			type: "requiredApproval",
			token: TOKEN_IN,
			owner: ACCOUNT,
			spender: VAULT_IN,
			amount: AMOUNT,
		},
	] as const;
	const wallet = {
		chainId: 1,
		account: ACCOUNT,
		getAsset: () => ({
			account: ACCOUNT,
			asset: TOKEN_IN,
			balance: AMOUNT,
			allowances: {
				[VAULT_IN]: {
					// Existing direct ERC-20 allowance fully covers the borrow.
					assetForVault: AMOUNT,
					assetForPermit2: 0n,
					assetForVaultInPermit2: 0n,
					permit2ExpirationTime: 0,
					permit2Nonce: 0,
				},
			},
		}),
	} as never;

	const resolved = service.resolveRequiredApprovalsWithWallet({
		plan: [...plan],
		chainId: 1,
		wallet,
	});
	const approval = resolved[0];
	assert.equal(approval?.type, "requiredApproval");
	if (approval?.type !== "requiredApproval") {
		throw new Error("expected requiredApproval");
	}
	assert.deepEqual(approval.resolved, []);
});

test("getPermit2TypedData defaults Permit2 expiration to the signature window", () => {
	const service = createExecutionService();
	const before = BigInt(Math.floor(Date.now() / 1000)) + 60n * 60n;
	const typedData = service.getPermit2TypedData({
		chainId: 1,
		token: TOKEN_IN,
		amount: AMOUNT,
		spender: VAULT_IN,
		nonce: 7,
	});
	const after = BigInt(Math.floor(Date.now() / 1000)) + 60n * 60n;

	assert.ok(BigInt(typedData.message.details.expiration) >= before);
	assert.ok(BigInt(typedData.message.details.expiration) <= after);
	assert.ok(BigInt(typedData.message.sigDeadline) >= before);
	assert.ok(BigInt(typedData.message.sigDeadline) <= after);
	assert.equal(
		BigInt(typedData.message.details.expiration),
		BigInt(typedData.message.sigDeadline),
	);
});

test("repay-from-deposit different-vault full repay preserves pre-existing liability deposit", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromDeposit({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: RECEIVER,
		fromVault: SOURCE_VAULT,
		fromAccount: SOURCE_ACCOUNT,
		cleanupOnMax: true,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	const amountWithInterest = (AMOUNT * 10_001n) / 10_000n;
	assert.equal(items.length, 7);

	const withdraw = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(withdraw.functionName, "withdraw");
	assert.deepEqual(withdraw.args, [
		amountWithInterest,
		getAddress(LIABILITY_VAULT),
		getAddress(SOURCE_ACCOUNT),
	]);

	const skimToLiability = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(skimToLiability.functionName, "skim");
	assert.deepEqual(skimToLiability.args, [
		amountWithInterest,
		getAddress(RECEIVER),
	]);

	const repay = decodeFunctionData({
		abi: eVaultAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(repay.functionName, "repayWithShares");
	assert.deepEqual(repay.args, [maxUint256, getAddress(RECEIVER)]);

	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(disableController.functionName, "disableController");

	const disableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[4]?.data ?? "0x",
	});
	assert.equal(disableCollateral.functionName, "disableCollateral");
	assert.deepEqual(disableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(COLLATERAL_VAULT),
	]);

	const transferCollateral = decodeFunctionData({
		abi: eVaultAbi,
		data: items[5]?.data ?? "0x",
	});
	assert.equal(transferCollateral.functionName, "transferFromMax");
	assert.deepEqual(transferCollateral.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);

	const transferSource = decodeFunctionData({
		abi: eVaultAbi,
		data: items[6]?.data ?? "0x",
	});
	assert.equal(transferSource.functionName, "transferFromMax");
	assert.deepEqual(transferSource.args, [
		getAddress(SOURCE_ACCOUNT),
		getAddress(ACCOUNT),
	]);
});

test("repay-from-deposit different-vault full repay sweeps cushion without pre-existing liability deposit", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromDeposit({
		account: createRepayFromDepositAccount({ liabilityAssets: 0n }),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: RECEIVER,
		fromVault: SOURCE_VAULT,
		fromAccount: SOURCE_ACCOUNT,
		cleanupOnMax: true,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 9);

	const redeemLeftovers = decodeFunctionData({
		abi: eVaultAbi,
		data: items[4]?.data ?? "0x",
	});
	assert.equal(redeemLeftovers.functionName, "redeem");
	assert.deepEqual(redeemLeftovers.args, [
		maxUint256,
		getAddress(SOURCE_VAULT),
		getAddress(RECEIVER),
	]);

	const skimBack = decodeFunctionData({
		abi: eVaultAbi,
		data: items[5]?.data ?? "0x",
	});
	assert.equal(skimBack.functionName, "skim");
	assert.deepEqual(skimBack.args, [maxUint256, getAddress(SOURCE_ACCOUNT)]);
});

test("repay-from-deposit same-vault full repay cleans up collateral and source shares", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromDeposit({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: RECEIVER,
		fromVault: LIABILITY_VAULT,
		fromAccount: SOURCE_ACCOUNT,
		cleanupOnMax: true,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 5);

	const repay = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(repay.functionName, "repayWithShares");
	assert.deepEqual(repay.args, [maxUint256, getAddress(RECEIVER)]);

	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(disableController.functionName, "disableController");

	const disableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(disableCollateral.functionName, "disableCollateral");
	assert.deepEqual(disableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(COLLATERAL_VAULT),
	]);

	const transferCollateral = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(transferCollateral.functionName, "transferFromMax");
	assert.deepEqual(transferCollateral.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);

	const transferSource = decodeFunctionData({
		abi: eVaultAbi,
		data: items[4]?.data ?? "0x",
	});
	assert.equal(transferSource.functionName, "transferFromMax");
	assert.deepEqual(transferSource.args, [
		getAddress(SOURCE_ACCOUNT),
		getAddress(ACCOUNT),
	]);
});

test("repay-from-deposit full repay skips planner cleanup by default", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromDeposit({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: RECEIVER,
		fromVault: SOURCE_VAULT,
		fromAccount: SOURCE_ACCOUNT,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	assert.equal(flattenBatchEntries(plan[0].items).length, 4);
});

test("repay-from-deposit partial repay skips cleanup even when requested", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromDeposit({
		account: createRepayFromDepositAccount({ liabilityAssets: 0n }),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: AMOUNT,
		receiver: RECEIVER,
		fromVault: SOURCE_VAULT,
		fromAccount: SOURCE_ACCOUNT,
		cleanupOnMax: true,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 3);
	assert.deepEqual(
		items.map(
			(item) =>
				decodeFunctionData({
					abi: eVaultAbi,
					data: item.data,
				}).functionName,
		),
		["withdraw", "skim", "repayWithShares"],
	);
});

test("repay-from-deposit full cleanup skips source-share transfer when source is owner", () => {
	const service = createExecutionService();
	const account = {
		...createRepayFromDepositAccount(),
		getPosition: (accountAddress: string, vault: string) => {
			if (accountAddress === RECEIVER && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: 77n,
					borrowed: AMOUNT,
				};
			}
			if (accountAddress === ACCOUNT && vault === SOURCE_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: AMOUNT * 2n,
				};
			}
			return undefined;
		},
	} as never;
	const plan = service.planRepayFromDeposit({
		account,
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: RECEIVER,
		fromVault: SOURCE_VAULT,
		fromAccount: ACCOUNT,
		cleanupOnMax: true,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 6);
	const transferCalls = items
		.filter(
			(item) =>
				item.targetContract === COLLATERAL_VAULT ||
				item.targetContract === SOURCE_VAULT,
		)
		.map((item) => ({
			item,
			decoded: decodeFunctionData({ abi: eVaultAbi, data: item.data }),
		}))
		.filter(({ decoded }) => decoded.functionName === "transferFromMax");

	assert.equal(transferCalls.length, 1);
	assert.deepEqual(transferCalls[0]?.decoded.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);
});

test("repay-from-wallet full repay cleans up active collaterals when requested", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromWallet({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: RECEIVER,
		cleanupOnMax: true,
	});

	assert.equal(plan.length, 2);
	assert.deepEqual(plan[0], {
		type: "requiredApproval",
		token: SAME_ASSET,
		owner: ACCOUNT,
		spender: LIABILITY_VAULT,
		amount: (AMOUNT * 10_001n) / 10_000n,
	});
	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 4);

	const repay = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(repay.functionName, "repay");
	assert.deepEqual(repay.args, [maxUint256, getAddress(RECEIVER)]);

	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(disableController.functionName, "disableController");

	const disableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(disableCollateral.functionName, "disableCollateral");
	assert.deepEqual(disableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(COLLATERAL_VAULT),
	]);

	const transferCollateral = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(transferCollateral.functionName, "transferFromMax");
	assert.deepEqual(transferCollateral.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);
});

test("repay-from-wallet full repay skips cleanup by default", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromWallet({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: RECEIVER,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	assert.equal(flattenBatchEntries(plan[1].items).length, 2);
});

test("repay-from-wallet partial repay skips cleanup even when requested", () => {
	const service = createExecutionService();
	const plan = service.planRepayFromWallet({
		account: createRepayFromDepositAccount(),
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: AMOUNT,
		receiver: RECEIVER,
		cleanupOnMax: true,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 1);
	const repay = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(repay.functionName, "repay");
	assert.deepEqual(repay.args, [AMOUNT, getAddress(RECEIVER)]);
});

test("repay-from-wallet main-account full cleanup disables collateral without transfer", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (accountAddress: string, vault: string) => {
			if (accountAddress === ACCOUNT && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: 77n,
					borrowed: AMOUNT,
				};
			}
			return undefined;
		},
		getSubAccount: (accountAddress: string) => {
			if (accountAddress === ACCOUNT) {
				return {
					enabledCollaterals: [COLLATERAL_VAULT],
					positions: [
						{
							account: ACCOUNT,
							vaultAddress: COLLATERAL_VAULT,
							vault: { type: VaultType.EVault, address: COLLATERAL_VAULT },
							asset: SAME_ASSET,
							assets: AMOUNT,
							shares: AMOUNT,
						},
					],
				};
			}
			return undefined;
		},
	} as never;
	const plan = service.planRepayFromWallet({
		account,
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: maxUint256,
		receiver: ACCOUNT,
		cleanupOnMax: true,
	});

	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[1].items);
	assert.equal(items.length, 3);
	const calls = items.map((item) => {
		const abi =
			item.targetContract === COLLATERAL_VAULT
				? eVaultAbi
				: [...eVaultAbi, ...ethereumVaultConnectorAbi];
		return decodeFunctionData({ abi, data: item.data }).functionName;
	});
	assert.deepEqual(calls, ["repay", "disableController", "disableCollateral"]);
});

test("borrow can source collateral from existing savings shares", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		isCollateralEnabled: (accountAddress: string, vault: string) =>
			accountAddress === SOURCE_ACCOUNT && vault === COLLATERAL_VAULT,
		isControllerEnabled: () => false,
		getCurrentController: () => undefined,
	} as never;
	const plan = service.planBorrow({
		account,
		vault: LIABILITY_VAULT,
		amount: AMOUNT,
		borrowAccount: RECEIVER,
		receiver: ACCOUNT,
		collateral: {
			vault: COLLATERAL_VAULT,
			amount: AMOUNT + 1n,
			source: "savings",
			from: SOURCE_ACCOUNT,
			disableCollateralFrom: true,
		},
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 5);

	const disableSourceCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(disableSourceCollateral.functionName, "disableCollateral");
	assert.deepEqual(disableSourceCollateral.args, [
		getAddress(SOURCE_ACCOUNT),
		getAddress(COLLATERAL_VAULT),
	]);

	const transferShares = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(items[1]?.targetContract, COLLATERAL_VAULT);
	assert.equal(items[1]?.onBehalfOfAccount, SOURCE_ACCOUNT);
	assert.equal(transferShares.functionName, "transfer");
	assert.deepEqual(transferShares.args, [getAddress(RECEIVER), AMOUNT + 1n]);

	const enableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(enableCollateral.functionName, "enableCollateral");
	assert.deepEqual(enableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(COLLATERAL_VAULT),
	]);

	const enableController = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(enableController.functionName, "enableController");
	assert.deepEqual(enableController.args, [
		getAddress(RECEIVER),
		getAddress(LIABILITY_VAULT),
	]);

	const borrow = decodeFunctionData({
		abi: eVaultAbi,
		data: items[4]?.data ?? "0x",
	});
	assert.equal(borrow.functionName, "borrow");
	assert.deepEqual(borrow.args, [AMOUNT, getAddress(ACCOUNT)]);
});

test("borrow only cleans incompatible stale controller by default", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [DESTINATION_VAULT],
			enabledCollaterals: [COLLATERAL_VAULT, DESTINATION_VAULT],
			positions: [],
		}),
		isCollateralEnabled: (_account: string, vault: string) =>
			vault === COLLATERAL_VAULT,
		isControllerEnabled: () => false,
		getCurrentController: () => DESTINATION_VAULT,
	} as never;

	const plan = service.planBorrow({
		account,
		vault: LIABILITY_VAULT,
		amount: AMOUNT,
		borrowAccount: RECEIVER,
		receiver: ACCOUNT,
		collateral: {
			vault: COLLATERAL_VAULT,
			amount: AMOUNT,
			asset: SAME_ASSET,
		},
	});

	const items = getOnlyEvcBatchItems(plan);
	assert.deepEqual(items.map(decodeBatchFunctionName), [
		"disableController",
		"deposit",
		"enableController",
		"borrow",
	]);
});

test("borrow preserves existing collaterals when no controller is enabled", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [],
			enabledCollaterals: [COLLATERAL_VAULT, DESTINATION_VAULT],
			positions: [],
		}),
		isCollateralEnabled: () => false,
		isControllerEnabled: () => false,
		getCurrentController: () => undefined,
	} as never;

	const plan = service.planBorrow({
		account,
		vault: LIABILITY_VAULT,
		amount: AMOUNT,
		borrowAccount: RECEIVER,
		receiver: ACCOUNT,
	});

	const items = getOnlyEvcBatchItems(plan);
	assert.deepEqual(items.map(decodeBatchFunctionName), [
		"enableController",
		"borrow",
	]);
});

test("borrow can skip automatic cleanup", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [LIABILITY_VAULT],
			enabledCollaterals: [COLLATERAL_VAULT],
			positions: [],
		}),
		isCollateralEnabled: (_account: string, vault: string) =>
			vault === COLLATERAL_VAULT,
		isControllerEnabled: () => true,
		getCurrentController: () => LIABILITY_VAULT,
	} as never;

	const plan = service.planBorrow({
		account,
		vault: LIABILITY_VAULT,
		amount: AMOUNT,
		borrowAccount: RECEIVER,
		receiver: ACCOUNT,
		collateral: {
			vault: COLLATERAL_VAULT,
			amount: AMOUNT,
			asset: SAME_ASSET,
		},
		skipCleanup: true,
	});

	const items = getOnlyEvcBatchItems(plan);
	assert.deepEqual(items.map(decodeBatchFunctionName), ["deposit", "borrow"]);
});

test("same-asset multiply can source supply from savings shares", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		isCollateralEnabled: () => false,
		isControllerEnabled: () => false,
		getCurrentController: () => undefined,
	} as never;
	const plan = service.planMultiplySameAsset({
		account,
		collateralVault: COLLATERAL_VAULT,
		collateralAmount: AMOUNT,
		collateralAsset: SAME_ASSET,
		collateralShareSource: {
			from: SOURCE_ACCOUNT,
			shares: AMOUNT + 2n,
		},
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: AMOUNT,
		longVault: DESTINATION_VAULT,
		receiver: RECEIVER,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 6);

	const transferShares = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(items[0]?.targetContract, COLLATERAL_VAULT);
	assert.equal(items[0]?.onBehalfOfAccount, SOURCE_ACCOUNT);
	assert.equal(transferShares.functionName, "transfer");
	assert.deepEqual(transferShares.args, [getAddress(RECEIVER), AMOUNT + 2n]);

	const enableSupplyCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(enableSupplyCollateral.functionName, "enableCollateral");
	assert.deepEqual(enableSupplyCollateral.args, [
		getAddress(RECEIVER),
		getAddress(COLLATERAL_VAULT),
	]);

	const enableController = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(enableController.functionName, "enableController");

	const borrow = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(borrow.functionName, "borrow");
	assert.deepEqual(borrow.args, [AMOUNT, getAddress(DESTINATION_VAULT)]);

	const skim = decodeFunctionData({
		abi: eVaultAbi,
		data: items[4]?.data ?? "0x",
	});
	assert.equal(skim.functionName, "skim");
	assert.deepEqual(skim.args, [AMOUNT, getAddress(RECEIVER)]);

	const enableLongCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[5]?.data ?? "0x",
	});
	assert.equal(enableLongCollateral.functionName, "enableCollateral");
	assert.deepEqual(enableLongCollateral.args, [
		getAddress(RECEIVER),
		getAddress(DESTINATION_VAULT),
	]);
});

test("same-asset multiply prepends stale-state cleanup by default", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [LIABILITY_VAULT],
			enabledCollaterals: [COLLATERAL_VAULT, DESTINATION_VAULT],
			positions: [],
		}),
		isCollateralEnabled: (_account: string, vault: string) =>
			vault === COLLATERAL_VAULT || vault === DESTINATION_VAULT,
		isControllerEnabled: () => true,
		getCurrentController: () => LIABILITY_VAULT,
	} as never;

	const plan = service.planMultiplySameAsset({
		account,
		collateralVault: COLLATERAL_VAULT,
		collateralAmount: AMOUNT,
		collateralAsset: SAME_ASSET,
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: AMOUNT,
		longVault: DESTINATION_VAULT,
		receiver: RECEIVER,
	});

	const items = getOnlyEvcBatchItems(plan);
	assert.deepEqual(items.map(decodeBatchFunctionName), [
		"disableCollateral",
		"disableCollateral",
		"disableController",
		"enableCollateral",
		"deposit",
		"enableController",
		"borrow",
		"skim",
		"enableCollateral",
	]);
	assert.equal(items[2]?.targetContract, LIABILITY_VAULT);
	assert.equal(items[2]?.onBehalfOfAccount, RECEIVER);
});

test("same-asset multiply can skip automatic cleanup", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getSubAccount: () => ({
			enabledControllers: [LIABILITY_VAULT],
			enabledCollaterals: [COLLATERAL_VAULT, DESTINATION_VAULT],
			positions: [],
		}),
		isCollateralEnabled: (_account: string, vault: string) =>
			vault === COLLATERAL_VAULT || vault === DESTINATION_VAULT,
		isControllerEnabled: () => true,
		getCurrentController: () => LIABILITY_VAULT,
	} as never;

	const plan = service.planMultiplySameAsset({
		account,
		collateralVault: COLLATERAL_VAULT,
		collateralAmount: AMOUNT,
		collateralAsset: SAME_ASSET,
		liabilityVault: LIABILITY_VAULT,
		liabilityAmount: AMOUNT,
		longVault: DESTINATION_VAULT,
		receiver: RECEIVER,
		skipCleanup: true,
	});

	const items = getOnlyEvcBatchItems(plan);
	assert.deepEqual(items.map(decodeBatchFunctionName), [
		"deposit",
		"borrow",
		"skim",
	]);
});

test("swap multiply can source supply from savings shares", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		isCollateralEnabled: () => false,
		isControllerEnabled: () => false,
		getCurrentController: () => undefined,
	} as never;
	const plan = service.planMultiplyWithSwap({
		account,
		collateralVault: COLLATERAL_VAULT,
		collateralAmount: AMOUNT,
		collateralAsset: SAME_ASSET,
		collateralShareSource: {
			from: SOURCE_ACCOUNT,
			shares: AMOUNT + 3n,
		},
		swapQuote: createSwapQuote() as never,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 7);

	const transferShares = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(items[0]?.targetContract, COLLATERAL_VAULT);
	assert.equal(items[0]?.onBehalfOfAccount, SOURCE_ACCOUNT);
	assert.equal(transferShares.functionName, "transfer");
	assert.deepEqual(transferShares.args, [getAddress(ACCOUNT), AMOUNT + 3n]);

	const borrow = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(borrow.functionName, "borrow");
	assert.deepEqual(borrow.args, [AMOUNT, getAddress(SWAPPER)]);

	assert.equal(items[4]?.targetContract, SWAPPER);
	assert.equal(items[5]?.targetContract, VERIFIER);

	const enableLongCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[6]?.data ?? "0x",
	});
	assert.equal(enableLongCollateral.functionName, "enableCollateral");
	assert.deepEqual(enableLongCollateral.args, [
		getAddress(ACCOUNT),
		getAddress(RECEIVER),
	]);
});

test("generic swap-quote plan functions reject CoW quotes", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		isCollateralEnabled: () => false,
		isControllerEnabled: () => false,
		getCurrentController: () => undefined,
		getPosition: () => ({ assets: AMOUNT, shares: AMOUNT, borrowed: AMOUNT }),
	} as never;

	assert.throws(
		() =>
			service.planMultiplyWithSwap({
				account,
				collateralVault: COLLATERAL_VAULT,
				collateralAmount: AMOUNT,
				collateralAsset: SAME_ASSET,
				swapQuote: createCowSwapQuote() as never,
			}),
		/Use planOpenPositionWithCoW instead/,
	);
	assert.throws(
		() =>
			service.planSwapCollateral({
				account,
				swapQuote: createCowSwapQuote() as never,
			}),
		/Use planSwapCollateralWithCoW instead/,
	);
	assert.throws(
		() =>
			service.planRepayWithSwap({
				account,
				swapQuote: createCowSwapQuote() as never,
			}),
		/Use planClosePositionWithCow instead/,
	);
});

test("CoW plan functions build CoW plan items from raw provider order amounts", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: () => ({ assets: 1000n, shares: 1010n, borrowed: AMOUNT }),
	} as never;
	const quote = createCowSwapQuote() as never;

	const openPlan = service.planOpenPositionWithCoW({
		account,
		collateralVault: COLLATERAL_VAULT,
		collateralAmount: 5n,
		collateralAsset: SAME_ASSET,
		swapQuote: quote,
		slippage: 0.5,
		validTo: 1234,
	});
	const openItem = openPlan[0] as CowSwapPlanItem;
	assert.equal(openItem.type, "cowSwap");
	assert.equal(openItem.kind, "openPosition");
	assert.deepEqual(openItem.params, {
		chainId: 1,
		sellToken: TOKEN_IN,
		buyToken: RECEIVER,
		sellAmount: 1007n,
		buyAmount: 1990n,
		feeAmount: 7n,
		quoteId: 42,
		slippageBips: 50,
		validTo: 1234,
		collateralToken: SAME_ASSET,
		wrapper: {
			owner: ACCOUNT,
			account: ACCOUNT,
			deadline: 1234,
			collateralVault: COLLATERAL_VAULT,
			borrowVault: VAULT_IN,
			collateralAmount: 5n,
			borrowAmount: 1007n,
		},
	});

	const collateralPlan = service.planSwapCollateralWithCoW({
		account,
		swapQuote: quote,
		slippage: 0.5,
		validTo: 1234,
		disableSourceCollateral: true,
	});
	const collateralItem = collateralPlan[0] as CowSwapPlanItem;
	assert.equal(collateralItem.kind, "swapCollateral");
	assert.equal(collateralItem.params.sellAmount, 1007n);
	assert.equal(collateralItem.params.buyAmount, 1990n);
	assert.equal(
		(collateralItem.params as any).wrapper.disableSourceCollateral,
		true,
	);

	const closePlan = service.planClosePositionWithCow({
		account,
		swapQuote: quote,
		slippage: 0.5,
		validTo: 1234,
	});
	const closeItem = closePlan[0] as CowSwapPlanItem;
	assert.equal(closeItem.kind, "closePosition");
	assert.equal(closeItem.params.sellAmount, 1010n);
	assert.equal(closeItem.params.buyAmount, 2000n);
	assert.equal((closeItem.params as any).orderKind, "buy");

	const cancelPlan = service.planCancelClosePositionWithCow({
		chainId: 1,
		owner: ACCOUNT,
		nonce: 17n,
	});
	const cancelItem = cancelPlan[0] as CowSwapPlanItem;
	assert.equal(cancelItem.kind, "cancelClosePosition");
	assert.equal(cancelItem.params.owner, getAddress(ACCOUNT));
	assert.equal(cancelItem.params.nonce, 17n);
});

test("repay-with-swap full repay cleans up active collaterals and source shares when requested", () => {
	const service = createExecutionService();
	const plan = service.planRepayWithSwap({
		account: createRepayFromDepositAccount(),
		swapQuote: createRepaySwapQuote() as never,
		cleanupOnMax: true,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 7);

	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(disableController.functionName, "disableController");

	const disableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[4]?.data ?? "0x",
	});
	assert.equal(disableCollateral.functionName, "disableCollateral");
	assert.deepEqual(disableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(COLLATERAL_VAULT),
	]);

	const transferCollateral = decodeFunctionData({
		abi: eVaultAbi,
		data: items[5]?.data ?? "0x",
	});
	assert.equal(transferCollateral.functionName, "transferFromMax");
	assert.deepEqual(transferCollateral.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);

	const transferSource = decodeFunctionData({
		abi: eVaultAbi,
		data: items[6]?.data ?? "0x",
	});
	assert.equal(transferSource.functionName, "transferFromMax");
	assert.deepEqual(transferSource.args, [
		getAddress(SOURCE_ACCOUNT),
		getAddress(ACCOUNT),
	]);
});

test("repay-with-swap full repay skips cleanup by default", () => {
	const service = createExecutionService();
	const plan = service.planRepayWithSwap({
		account: createRepayFromDepositAccount(),
		swapQuote: createRepaySwapQuote() as never,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	assert.equal(flattenBatchEntries(plan[0].items).length, 4);
});

test("repay-with-swap partial repay skips cleanup even when requested", () => {
	const service = createExecutionService();
	const plan = service.planRepayWithSwap({
		account: createRepayFromDepositAccount(),
		swapQuote: {
			...createRepaySwapQuote(),
			amountOutMin: (AMOUNT - 1n).toString(),
		} as never,
		cleanupOnMax: true,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 3);
	const withdraw = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(withdraw.functionName, "withdraw");
	assert.equal(items[1]?.targetContract, SWAPPER);
	const verifier = decodeFunctionData({
		abi: swapVerifierAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(verifier.functionName, "verifyDebtMax");
});

test("repay-with-swap full cleanup skips source-share transfer when source is owner", () => {
	const service = createExecutionService();
	const account = {
		...createRepayFromDepositAccount(),
		getPosition: (accountAddress: string, vault: string) => {
			if (accountAddress === RECEIVER && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: 77n,
					borrowed: AMOUNT,
				};
			}
			if (accountAddress === ACCOUNT && vault === SOURCE_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: AMOUNT * 2n,
				};
			}
			return undefined;
		},
	} as never;
	const plan = service.planRepayWithSwap({
		account,
		swapQuote: {
			...createRepaySwapQuote(),
			accountIn: ACCOUNT,
		} as never,
		cleanupOnMax: true,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 6);
	const transferCalls = items
		.filter(
			(item) =>
				item.targetContract === COLLATERAL_VAULT ||
				item.targetContract === SOURCE_VAULT,
		)
		.map((item) => decodeFunctionData({ abi: eVaultAbi, data: item.data }))
		.filter((decoded) => decoded.functionName === "transferFromMax");

	assert.equal(transferCalls.length, 1);
	assert.deepEqual(transferCalls[0]?.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);
});

test("repay-with-swap main-account full cleanup disables collateral without transfer", () => {
	const service = createExecutionService();
	const account = {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (accountAddress: string, vault: string) => {
			if (accountAddress === ACCOUNT && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: 77n,
					borrowed: AMOUNT,
				};
			}
			if (accountAddress === SOURCE_ACCOUNT && vault === SOURCE_VAULT) {
				return {
					asset: SAME_ASSET,
					assets: AMOUNT * 2n,
				};
			}
			return undefined;
		},
		getSubAccount: (accountAddress: string) => {
			if (accountAddress === ACCOUNT) {
				return {
					enabledCollaterals: [COLLATERAL_VAULT],
					positions: [
						{
							account: ACCOUNT,
							vaultAddress: COLLATERAL_VAULT,
							vault: { type: VaultType.EVault, address: COLLATERAL_VAULT },
							asset: SAME_ASSET,
							assets: AMOUNT,
							shares: AMOUNT,
						},
					],
				};
			}
			return undefined;
		},
	} as never;
	const plan = service.planRepayWithSwap({
		account,
		swapQuote: {
			...createRepaySwapQuote(),
			accountOut: ACCOUNT,
			verify: {
				...createRepaySwapQuote().verify,
				account: ACCOUNT,
				verifierData: encodeDebtVerifierData(LIABILITY_VAULT, ACCOUNT),
			},
		} as never,
		cleanupOnMax: true,
	});

	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 6);
	const transferCalls = items
		.filter(
			(item) =>
				item.targetContract === COLLATERAL_VAULT ||
				item.targetContract === SOURCE_VAULT,
		)
		.map((item) => decodeFunctionData({ abi: eVaultAbi, data: item.data }))
		.filter((decoded) => decoded.functionName === "transferFromMax");

	assert.equal(transferCalls.length, 1);
	assert.deepEqual(transferCalls[0]?.args, [
		getAddress(SOURCE_ACCOUNT),
		getAddress(ACCOUNT),
	]);
});

test("max same-asset collateral migration redeems and skims the full unaccounted balance", () => {
	const service = createExecutionService();
	const plan = service.planMigrateSameAssetCollateral({
		account: createSameAssetMigrationAccount(),
		fromVault: SOURCE_VAULT,
		toVault: DESTINATION_VAULT,
		amount: AMOUNT,
		positionAccount: RECEIVER,
		toAsset: SAME_ASSET,
		isMax: true,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 4);

	const redeem = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(items[0]?.targetContract, SOURCE_VAULT);
	assert.equal(items[0]?.onBehalfOfAccount, RECEIVER);
	assert.equal(redeem.functionName, "redeem");
	assert.deepEqual(redeem.args, [
		AMOUNT + 10n,
		getAddress(DESTINATION_VAULT),
		getAddress(RECEIVER),
	]);

	const skim = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(items[1]?.targetContract, DESTINATION_VAULT);
	assert.equal(items[1]?.onBehalfOfAccount, RECEIVER);
	assert.equal(skim.functionName, "skim");
	assert.deepEqual(skim.args, [maxUint256, getAddress(RECEIVER)]);

	const enableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(enableCollateral.functionName, "enableCollateral");
	assert.deepEqual(enableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(DESTINATION_VAULT),
	]);

	const disableCollateral = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(disableCollateral.functionName, "disableCollateral");
	assert.deepEqual(disableCollateral.args, [
		getAddress(RECEIVER),
		getAddress(SOURCE_VAULT),
	]);
});

test("partial same-asset collateral migration withdraws and skims the requested amount", () => {
	const service = createExecutionService();
	const plan = service.planMigrateSameAssetCollateral({
		account: createSameAssetMigrationAccount(),
		fromVault: SOURCE_VAULT,
		toVault: DESTINATION_VAULT,
		amount: AMOUNT,
		positionAccount: RECEIVER,
		toAsset: SAME_ASSET,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 3);

	const withdraw = decodeFunctionData({
		abi: eVaultAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(withdraw.functionName, "withdraw");
	assert.deepEqual(withdraw.args, [
		AMOUNT,
		getAddress(DESTINATION_VAULT),
		getAddress(RECEIVER),
	]);

	const skim = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(skim.functionName, "skim");
	assert.deepEqual(skim.args, [AMOUNT, getAddress(RECEIVER)]);
});

test("same-asset debt migration borrows with cushion, repays old debt, and sweeps excess", () => {
	const service = createExecutionService();
	const plan = service.planMigrateSameAssetDebt({
		account: createSameAssetMigrationAccount(),
		oldLiabilityVault: LIABILITY_VAULT,
		newLiabilityVault: NEW_LIABILITY_VAULT,
		liabilityAccount: RECEIVER,
		newLiabilityAsset: SAME_ASSET,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	const amountWithExtra = (AMOUNT * 10_001n) / 10_000n;
	assert.equal(items.length, 8);

	const enableController = decodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		data: items[0]?.data ?? "0x",
	});
	assert.equal(enableController.functionName, "enableController");
	assert.deepEqual(enableController.args, [
		getAddress(RECEIVER),
		getAddress(NEW_LIABILITY_VAULT),
	]);

	const borrow = decodeFunctionData({
		abi: eVaultAbi,
		data: items[1]?.data ?? "0x",
	});
	assert.equal(items[1]?.targetContract, NEW_LIABILITY_VAULT);
	assert.equal(items[1]?.onBehalfOfAccount, RECEIVER);
	assert.equal(borrow.functionName, "borrow");
	assert.deepEqual(borrow.args, [
		amountWithExtra,
		getAddress(LIABILITY_VAULT),
	]);

	const skimOld = decodeFunctionData({
		abi: eVaultAbi,
		data: items[2]?.data ?? "0x",
	});
	assert.equal(skimOld.functionName, "skim");
	assert.deepEqual(skimOld.args, [amountWithExtra, getAddress(RECEIVER)]);

	const repayOld = decodeFunctionData({
		abi: eVaultAbi,
		data: items[3]?.data ?? "0x",
	});
	assert.equal(repayOld.functionName, "repayWithShares");
	assert.deepEqual(repayOld.args, [maxUint256, getAddress(RECEIVER)]);

	const disableController = decodeFunctionData({
		abi: eVaultAbi,
		data: items[4]?.data ?? "0x",
	});
	assert.equal(disableController.functionName, "disableController");

	const redeemExcess = decodeFunctionData({
		abi: eVaultAbi,
		data: items[5]?.data ?? "0x",
	});
	assert.equal(redeemExcess.functionName, "redeem");
	assert.deepEqual(redeemExcess.args, [
		maxUint256,
		getAddress(NEW_LIABILITY_VAULT),
		getAddress(RECEIVER),
	]);

	const skimNew = decodeFunctionData({
		abi: eVaultAbi,
		data: items[6]?.data ?? "0x",
	});
	assert.equal(skimNew.functionName, "skim");
	assert.deepEqual(skimNew.args, [maxUint256, getAddress(RECEIVER)]);

	const transferRemainingShares = decodeFunctionData({
		abi: eVaultAbi,
		data: items[7]?.data ?? "0x",
	});
	assert.equal(transferRemainingShares.functionName, "transferFromMax");
	assert.deepEqual(transferRemainingShares.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);
});

test("same-asset debt migration preserves pre-existing old-vault deposit", () => {
	const service = createExecutionService();
	const plan = service.planMigrateSameAssetDebt({
		account: createSameAssetMigrationAccount({ oldLiabilityAssets: 77n }),
		oldLiabilityVault: LIABILITY_VAULT,
		newLiabilityVault: NEW_LIABILITY_VAULT,
		liabilityAccount: RECEIVER,
		newLiabilityAsset: SAME_ASSET,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "evcBatch");
	if (plan[0]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = flattenBatchEntries(plan[0].items);
	assert.equal(items.length, 6);

	const transferRemainingShares = decodeFunctionData({
		abi: eVaultAbi,
		data: items[5]?.data ?? "0x",
	});
	assert.equal(transferRemainingShares.functionName, "transferFromMax");
	assert.deepEqual(transferRemainingShares.args, [
		getAddress(RECEIVER),
		getAddress(ACCOUNT),
	]);
});
