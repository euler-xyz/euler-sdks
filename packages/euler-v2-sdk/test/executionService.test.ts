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
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN_IN = "0x00000000000000000000000000000000000000bb" as const;
const SWAPPER = "0x00000000000000000000000000000000000000cc" as const;
const VERIFIER = "0x00000000000000000000000000000000000000dd" as const;
const RECEIVER = "0x00000000000000000000000000000000000000ee" as const;
const VAULT_IN = "0x00000000000000000000000000000000000000ff" as const;
const SOURCE_ACCOUNT = "0x0000000000000000000000000000000000000a01" as const;
const SOURCE_VAULT = "0x0000000000000000000000000000000000000a02" as const;
const LIABILITY_VAULT = "0x0000000000000000000000000000000000000a03" as const;
const SAME_ASSET = "0x0000000000000000000000000000000000000a04" as const;
const MAINNET_USDT = getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7");
const COLLATERAL_VAULT = "0x0000000000000000000000000000000000000a05" as const;
const DESTINATION_VAULT = "0x0000000000000000000000000000000000000a06" as const;
const NEW_LIABILITY_VAULT = "0x0000000000000000000000000000000000000a07" as const;
const AMOUNT = 12345n;

function createExecutionService() {
	return new ExecutionService(
		{
			getDeployment: () => ({
				addresses: {
					coreAddrs: {
						evc: "0x0000000000000000000000000000000000000011",
						permit2: "0x0000000000000000000000000000000000000012",
					},
				},
			}),
		} as never,
		{} as never,
	);
}

function createSwapQuote() {
	return {
		amountIn: AMOUNT.toString(),
		amountInMax: AMOUNT.toString(),
		amountOut: "9988",
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
			verifierData: "0x5678",
			vault: RECEIVER,
			account: ACCOUNT,
			amount: "9900",
			deadline: 123,
		},
		route: [{ providerName: "OpenOcean" }],
	};
}

function createTransferSwapQuote() {
	return {
		...createSwapQuote(),
		verify: {
			type: "transferMin",
			verifierAddress: VERIFIER,
			verifierData: "0x9abc",
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
		amountOutMin: AMOUNT.toString(),
		accountIn: SOURCE_ACCOUNT,
		accountOut: RECEIVER,
		vaultIn: SOURCE_VAULT,
		receiver: LIABILITY_VAULT,
		verify: {
			type: "debtMax",
			verifierAddress: VERIFIER,
			verifierData: "0x5678",
			vault: LIABILITY_VAULT,
			account: RECEIVER,
			amount: AMOUNT.toString(),
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

function createSameAssetMigrationAccount() {
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

	assert.equal(plan[1].items[0]?.targetContract, VERIFIER);
	assert.equal(plan[1].items[1]?.targetContract, SWAPPER);
	assert.equal(plan[1].items[2]?.targetContract, VERIFIER);

	const transfer = decodeFunctionData({
		abi: swapVerifierAbi,
		data: plan[1].items[0]?.data ?? "0x",
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

	const repay = plan[0].items[0];
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

	const items = plan[0].items;
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
				},
			},
		}),
	} as never;

	const resolved = service.resolveRequiredApprovalsWithWallet({
		plan: [...plan],
		chainId: 1,
		wallet,
		usePermit2: false,
		unlimitedApproval: false,
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

	const items = plan[0].items;
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

	const items = plan[0].items;
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

	const items = plan[0].items;
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

	assert.equal(plan[0].items.length, 4);
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
	assert.equal(plan[1]?.type, "evcBatch");
	if (plan[1]?.type !== "evcBatch") {
		throw new Error("expected evcBatch");
	}

	const items = plan[1].items;
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

	assert.equal(plan[1].items.length, 2);
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

	const items = plan[0].items;
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

	assert.equal(plan[0].items.length, 4);
});

test("same-asset collateral migration withdraws, skims, and rotates collateral flags", () => {
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

	const items = plan[0].items;
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
	assert.deepEqual(skim.args, [AMOUNT, getAddress(RECEIVER)]);

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

	const items = plan[0].items;
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
