import assert from "node:assert/strict";
import test from "node:test";
import { type Abi, encodeFunctionData } from "viem";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import {
	extractApprovalRequirements,
	extractBalanceRequirements,
} from "../src/utils/stateOverrides/getStateOverrides.js";

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN_IN = "0x00000000000000000000000000000000000000bb" as const;
const SWAPPER = "0x00000000000000000000000000000000000000cc" as const;
const VERIFIER = "0x00000000000000000000000000000000000000dd" as const;
const RECEIVER = "0x00000000000000000000000000000000000000ee" as const;
const VAULT_IN = "0x00000000000000000000000000000000000000ff" as const;
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

test("deposit-with-swap-from-wallet emits explicit state override requirements", () => {
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

	assert.deepEqual(extractBalanceRequirements(plan, ACCOUNT), [[TOKEN_IN, AMOUNT]]);
	assert.deepEqual(extractApprovalRequirements(plan, ACCOUNT), [[TOKEN_IN, VERIFIER]]);
});
