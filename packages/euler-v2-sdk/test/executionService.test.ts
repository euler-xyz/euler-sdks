import assert from "node:assert/strict";
import { test } from "vitest";
import { type Abi, decodeFunctionData, encodeFunctionData, getAddress } from "viem";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";

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

function createRepayFromDepositAccount() {
	return {
		owner: ACCOUNT,
		chainId: 1,
		getPosition: (account: string, vault: string) => {
			if (account === RECEIVER && vault === LIABILITY_VAULT) {
				return {
					asset: SAME_ASSET,
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

test("describeBatch decodes app-provided extra ABIs item-by-item", () => {
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
