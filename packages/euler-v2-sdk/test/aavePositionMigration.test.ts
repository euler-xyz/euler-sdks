import assert from "node:assert/strict";
import {
	encodeAbiParameters,
	decodeAbiParameters,
	decodeFunctionData,
	encodeFunctionData,
	getAddress,
	type Address,
	type Hex,
} from "viem";
import { test } from "vitest";
import { swapperAbi } from "../src/services/executionService/abis/swapperAbi.js";
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import {
	AavePositionMigrationConnector,
	AAVE_CONNECTOR_ID,
	AAVE_PROTOCOL,
} from "../src/services/positionMigrationService/connectors/aave/aaveConnector.js";
import { aaveV3PoolAbi } from "../src/services/positionMigrationService/connectors/aave/abis/aaveV3Abi.js";
import type { AaveMigrationPosition } from "../src/services/positionMigrationService/connectors/aave/aaveConnectorTypes.js";
import type { EVCBatchItem } from "../src/services/executionService/index.js";
import type { SwapQuote } from "../src/services/swapService/index.js";

const CHAIN_ID = 8453;
const OWNER = "0x0000000000000000000000000000000000000a01" as const;
const EULER_ACCOUNT = "0x0000000000000000000000000000000000000a02" as const;
const DEBT_VAULT = "0x0000000000000000000000000000000000000a03" as const;
const COLLATERAL_VAULT = "0x0000000000000000000000000000000000000a04" as const;
const SWAPPER = "0x0000000000000000000000000000000000000a05" as const;
const SWAP_VERIFIER = "0x0000000000000000000000000000000000000a06" as const;
const AAVE_POOL = "0x0000000000000000000000000000000000000a07" as const;
const A_TOKEN = "0x0000000000000000000000000000000000000a08" as const;
const COLLATERAL_ASSET = "0x0000000000000000000000000000000000000a09" as const;
const DEBT_ASSET = "0x0000000000000000000000000000000000000a0a" as const;
const STABLE_DEBT_TOKEN = "0x0000000000000000000000000000000000000a0b" as const;
const VARIABLE_DEBT_TOKEN = "0x0000000000000000000000000000000000000a0c" as const;
const TARGET_DEBT_ASSET = "0x0000000000000000000000000000000000000a0d" as const;
const BPS_SCALE = 10_000n;
const A_TOKEN_TRANSFER_BUFFER_BPS = 1n;
const SWAPPER_HANDLER_GENERIC =
	"0x47656e6572696300000000000000000000000000000000000000000000000000" as const;

const GENERIC_HANDLER_DATA_ABI = [
	{ name: "target", type: "address" },
	{ name: "payload", type: "bytes" },
] as const;

function createConnector(args: { allowance?: bigint } = {}) {
	const allowance = args.allowance ?? 10_000n;
	return new AavePositionMigrationConnector(
		{
			getDeployment: () => ({
				addresses: {
					peripheryAddrs: {
						swapper: SWAPPER,
						swapVerifier: SWAP_VERIFIER,
					},
				},
			}),
		} as never,
		{
			getProvider: () => ({
				readContract: async ({ functionName }: { functionName?: string }) => {
					if (functionName === "borrowAllowance") return allowance;
					if (functionName === "allowance") return allowance;
					if (functionName === "debtOf") return 1_000n;
					if (functionName === "balanceOf") return 2_000n;
					if (functionName === "convertToAssets") return 2_000n;
					return allowance;
				},
				multicall: async () => ["Aave Test Token", 0n],
			}),
		} as never,
		{
			encodeEnableController: (
				_chainId: number,
				account: Address,
				vault: Address,
			): EVCBatchItem => ({
				targetContract: vault,
				onBehalfOfAccount: account,
				value: 0n,
				data: "0x11111111",
			}),
			encodeEnableCollateral: (
				_chainId: number,
				account: Address,
				vault: Address,
			): EVCBatchItem => ({
				targetContract: vault,
				onBehalfOfAccount: account,
				value: 0n,
				data: "0x22222222",
			}),
		} as never,
	);
}

function createAavePosition(): AaveMigrationPosition {
	return {
		connectorId: AAVE_CONNECTOR_ID,
		protocol: AAVE_PROTOCOL,
		id: "aave:test",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		ref: {
			pool: getAddress(AAVE_POOL),
			collateralAsset: getAddress(COLLATERAL_ASSET),
			debtAsset: getAddress(DEBT_ASSET),
		},
		debt: {
			asset: getAddress(DEBT_ASSET),
			amount: 1_000n,
		},
		collateral: {
			asset: getAddress(COLLATERAL_ASSET),
			amount: 2_000n,
		},
		raw: {
			id: "aave:test",
			owner: getAddress(OWNER),
			pool: getAddress(AAVE_POOL),
			collateralAsset: getAddress(COLLATERAL_ASSET),
			debtAsset: getAddress(DEBT_ASSET),
			collateralReserve: {
				aTokenAddress: getAddress(A_TOKEN),
				stableDebtTokenAddress: getAddress(STABLE_DEBT_TOKEN),
				variableDebtTokenAddress: getAddress(VARIABLE_DEBT_TOKEN),
			},
			debtReserve: {
				aTokenAddress: getAddress(DEBT_ASSET),
				stableDebtTokenAddress: getAddress(STABLE_DEBT_TOKEN),
				variableDebtTokenAddress: getAddress(VARIABLE_DEBT_TOKEN),
			},
			aTokenBalance: 2_000n,
			stableDebt: 0n,
			variableDebt: 1_000n,
		},
	};
}

function applyBuffer(amount: bigint, bufferBps: bigint): bigint {
	return (amount * (BPS_SCALE + bufferBps) + BPS_SCALE - 1n) / BPS_SCALE;
}

function decodeSwapperMulticall(item: EVCBatchItem): Hex[] {
	if (getAddress(item.targetContract) !== getAddress(SWAPPER)) return [];
	try {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: item.data });
		if (decoded.functionName !== "multicall") return [];
		const [calls] = decoded.args as [readonly Hex[]];
		return [...calls];
	} catch {
		return [];
	}
}

function decodeSwapperFunctionName(data: Hex): string {
	return decodeFunctionData({ abi: swapperAbi, data }).functionName;
}

function encodeQuoteSwapCall(): Hex {
	return encodeFunctionData({
		abi: swapperAbi,
		functionName: "swap",
		args: [
			{
				handler: SWAPPER_HANDLER_GENERIC,
				mode: 0n,
				account: EULER_ACCOUNT,
				tokenIn: TARGET_DEBT_ASSET,
				tokenOut: DEBT_ASSET,
				vaultIn: DEBT_VAULT,
				accountIn: EULER_ACCOUNT,
				receiver: SWAPPER,
				amountOut: 0n,
				data: encodeAbiParameters(GENERIC_HANDLER_DATA_ABI, [SWAPPER, "0x"]),
			},
		],
	});
}

function createWrappedDebtSwapQuote(): SwapQuote {
	const swapCall = encodeQuoteSwapCall();
	const repayCall = encodeFunctionData({
		abi: swapperAbi,
		functionName: "repay",
		args: [DEBT_ASSET, SWAPPER, 1_000n, EULER_ACCOUNT],
	});
	const depositCall = encodeFunctionData({
		abi: swapperAbi,
		functionName: "deposit",
		args: [DEBT_ASSET, SWAPPER, 5n, OWNER],
	});

	return {
		amountIn: "1234",
		amountInMax: "1250",
		amountOut: "1000",
		amountOutMin: "995",
		accountIn: EULER_ACCOUNT,
		accountOut: EULER_ACCOUNT,
		vaultIn: DEBT_VAULT,
		receiver: SWAPPER,
		tokenIn: {
			address: TARGET_DEBT_ASSET,
			chainId: CHAIN_ID,
			decimals: 8,
			logoURI: "",
			name: "Target Debt",
			symbol: "TDEBT",
		},
		tokenOut: {
			address: DEBT_ASSET,
			chainId: CHAIN_ID,
			decimals: 6,
			logoURI: "",
			name: "Aave Debt",
			symbol: "ADEBT",
		},
		slippage: 0.5,
		swap: {
			swapperAddress: SWAPPER,
			swapperData: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [[swapCall, repayCall, depositCall]],
			}),
			multicallItems: [
				{ functionName: "swap", args: [], data: swapCall },
				{ functionName: "repay", args: [], data: repayCall },
				{ functionName: "deposit", args: [], data: depositCall },
			],
		},
		verify: {
			verifierAddress: SWAP_VERIFIER,
			verifierData: "0x",
			type: "debtMax",
			vault: SWAPPER,
			account: EULER_ACCOUNT,
			amount: "0",
			deadline: 0,
		},
		route: [{ providerName: "test" }],
	} as SwapQuote;
}

function containsAavePoolCall(item: EVCBatchItem, functionName: "repay" | "withdraw") {
	return decodeSwapperMulticall(item).some((call) => {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: call });
		if (decoded.functionName !== "swap") return false;
		const [params] = decoded.args;
		const [target, payload] = decodeAbiParameters(
			GENERIC_HANDLER_DATA_ABI,
			params.data,
		) as [Address, Hex];
		if (getAddress(target) !== getAddress(AAVE_POOL)) return false;
		return decodeFunctionData({
			abi: aaveV3PoolAbi,
			data: payload,
		}).functionName === functionName;
	});
}

function isATokenTransferFromSender(item: EVCBatchItem) {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) return false;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "transferBalanceFromSender") return false;
	const [token] = decoded.args as [Address, bigint, Address];
	return getAddress(token) === getAddress(A_TOKEN);
}

function getATokenTransferAmount(item: EVCBatchItem): bigint | undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "transferBalanceFromSender") return undefined;
	const [token, amount] = decoded.args as [Address, bigint, Address];
	return getAddress(token) === getAddress(A_TOKEN) ? amount : undefined;
}

function getAaveWithdrawReceiver(item: EVCBatchItem): Address | undefined {
	for (const call of decodeSwapperMulticall(item)) {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: call });
		if (decoded.functionName !== "swap") continue;
		const [params] = decoded.args;
		const [target, payload] = decodeAbiParameters(
			GENERIC_HANDLER_DATA_ABI,
			params.data,
		) as [Address, Hex];
		if (getAddress(target) !== getAddress(AAVE_POOL)) continue;
		const aave = decodeFunctionData({ abi: aaveV3PoolAbi, data: payload });
		if (aave.functionName !== "withdraw") continue;
		const [, , receiver] = aave.args as [Address, bigint, Address];
		return getAddress(receiver);
	}
	return undefined;
}

function getVerifyDepositAmount(item: EVCBatchItem): bigint | undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "verifyAmountMinAndDeposit") return undefined;
	const [vault, receiver, amountMin] = decoded.args as [
		Address,
		Address,
		bigint,
		bigint,
	];
	if (getAddress(vault) !== getAddress(COLLATERAL_VAULT)) return undefined;
	if (getAddress(receiver) !== getAddress(EULER_ACCOUNT)) return undefined;
	return amountMin;
}

function getVerifyDebtMax(item: EVCBatchItem):
	| { vault: Address; account: Address; amountMax: bigint; deadline: bigint }
	| undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "verifyDebtMax") return undefined;
	const [vault, account, amountMax, deadline] = decoded.args as [
		Address,
		Address,
		bigint,
		bigint,
	];
	return {
		vault: getAddress(vault),
		account: getAddress(account),
		amountMax,
		deadline,
	};
}

test("Aave inbound migration repays Aave debt before transferring aToken collateral", async () => {
	const connector = createConnector();

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAavePosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
			repayExcessDebt: false,
		},
	});

	const repayIndex = items.findIndex((item) =>
		containsAavePoolCall(item, "repay"),
	);
	const transferIndex = items.findIndex(isATokenTransferFromSender);
	const withdrawIndex = items.findIndex((item) =>
		containsAavePoolCall(item, "withdraw"),
	);

	assert.notEqual(repayIndex, -1);
	assert.notEqual(transferIndex, -1);
	assert.notEqual(withdrawIndex, -1);
	assert.ok(repayIndex < transferIndex);
	assert.ok(transferIndex < withdrawIndex);
});

test("Aave inbound no-swap migration buffers the aToken transfer cap without raising deposit minimum", async () => {
	const position = createAavePosition();
	const bufferedCollateralAmount = applyBuffer(
		position.raw.aTokenBalance,
		A_TOKEN_TRANSFER_BUFFER_BPS,
	);
	const connectorRequiringPermit = createConnector({
		allowance: position.raw.aTokenBalance,
	});

	const authorization = await connectorRequiringPermit.getAuthorization({
		direction: "external-to-euler",
		connectorId: AAVE_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
			repayExcessDebt: false,
		},
		deadline: 123n,
	});

	assert.ok(authorization);
	assert.equal(authorization.authorizationType, "aTokenPermit");
	assert.equal(authorization.typedData.message.value, bufferedCollateralAmount);

	const connector = createConnector();
	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
			repayExcessDebt: false,
		},
		deadline: 123n,
	});

	const transferAmount = items
		.map((item) => getATokenTransferAmount(item))
		.find((amount) => amount !== undefined);
	const withdrawReceiver = items
		.map((item) => getAaveWithdrawReceiver(item))
		.find((receiver) => receiver !== undefined);
	const verifyDepositAmount = items
		.map((item) => getVerifyDepositAmount(item))
		.find((amount) => amount !== undefined);

	assert.equal(transferAmount, bufferedCollateralAmount);
	assert.equal(withdrawReceiver, getAddress(SWAP_VERIFIER));
	assert.equal(verifyDepositAmount, position.raw.aTokenBalance);
});

test("Aave inbound migration does not use target minimum as the aToken transfer cap", async () => {
	const position = createAavePosition();
	const bufferedCollateralAmount = applyBuffer(
		position.raw.aTokenBalance,
		A_TOKEN_TRANSFER_BUFFER_BPS,
	);
	const minCollateralAssets = 1_500n;
	const connectorRequiringPermit = createConnector({ allowance: 0n });

	const authorization = await connectorRequiringPermit.getAuthorization({
		direction: "external-to-euler",
		connectorId: AAVE_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
			minCollateralAssets,
			repayExcessDebt: false,
		},
		deadline: 123n,
	});

	assert.ok(authorization);
	assert.equal(authorization.authorizationType, "aTokenPermit");
	assert.equal(authorization.typedData.message.value, bufferedCollateralAmount);

	const connector = createConnector();
	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
			minCollateralAssets,
			repayExcessDebt: false,
		},
		deadline: 123n,
	});

	const transferAmount = items
		.map((item) => getATokenTransferAmount(item))
		.find((amount) => amount !== undefined);
	const verifyDepositAmount = items
		.map((item) => getVerifyDepositAmount(item))
		.find((amount) => amount !== undefined);

	assert.equal(transferAmount, bufferedCollateralAmount);
	assert.equal(verifyDepositAmount, minCollateralAssets);
});

test("Aave outgoing migration verifies the Euler source debt is fully repaid", async () => {
	const connector = createConnector({ allowance: 20_000n });

	const items = await connector.buildMigrationBatch({
		direction: "euler-to-external",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAavePosition(),
		source: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		deadline: 123n,
	});

	const verifyDebtMax = items
		.map((item) => getVerifyDebtMax(item))
		.find((value) => value !== undefined);

	assert.deepEqual(verifyDebtMax, {
		vault: getAddress(DEBT_VAULT),
		account: getAddress(EULER_ACCOUNT),
		amountMax: 0n,
		deadline: 123n,
	});
});

test("Aave outgoing migration rejects supplied swap quotes", async () => {
	const connector = createConnector({ allowance: 20_000n });
	const swapQuote = createWrappedDebtSwapQuote();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "euler-to-external",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createAavePosition(),
			source: {
				eulerAccount: EULER_ACCOUNT,
				borrowVault: DEBT_VAULT,
				collateralVault: COLLATERAL_VAULT,
			},
			collateralSwapQuote: swapQuote,
			debtSwapQuote: swapQuote,
			deadline: 123n,
		}),
		/Aave Euler to Aave migration does not support swaps/,
	);
});

test("Aave inbound debt swap strips Euler repay wrapper calls before Aave repay", async () => {
	const connector = createConnector();

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAavePosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
			repayExcessDebt: false,
		},
		debtSwapQuote: createWrappedDebtSwapQuote(),
	});

	const preTransferItem = items.find((item) =>
		containsAavePoolCall(item, "repay"),
	);
	assert.ok(preTransferItem);

	const calls = decodeSwapperMulticall(preTransferItem);
	assert.deepEqual(calls.map(decodeSwapperFunctionName), [
		"swap",
		"swap",
		"sweep",
	]);
	assert.equal(calls[0], encodeQuoteSwapCall());
	const sweep = decodeFunctionData({ abi: swapperAbi, data: calls[2]! });
	assert.equal(sweep.functionName, "sweep");
	const [token, amountMin, to] = sweep.args as [Address, bigint, Address];
	assert.equal(getAddress(token), getAddress(DEBT_ASSET));
	assert.equal(amountMin, 0n);
	assert.equal(getAddress(to), getAddress(OWNER));
});

test("Aave inbound debt swap repays leftover input token", async () => {
	const connector = createConnector();

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAavePosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		debtSwapQuote: createWrappedDebtSwapQuote(),
		collateralSwapQuote: createWrappedDebtSwapQuote(),
	});

	const calls = items.flatMap(decodeSwapperMulticall);
	const repay = decodeFunctionData({
		abi: swapperAbi,
		data: calls.at(-1)!,
	});
	assert.equal(repay.functionName, "repay");
	const [token, vault, amount, account] = repay.args as [
		Address,
		Address,
		bigint,
		Address,
	];
	assert.equal(getAddress(token), getAddress(TARGET_DEBT_ASSET));
	assert.equal(getAddress(vault), getAddress(DEBT_VAULT));
	assert.equal(amount, 1250n);
	assert.equal(getAddress(account), getAddress(EULER_ACCOUNT));
});
