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
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
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
import {
	SwapVerificationType,
	type SwapQuote,
} from "../src/services/swapService/index.js";
import {
	createEulerSourceAccount,
	decodeSwapperMulticall,
} from "./helpers/positionMigration.js";

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

function createConnector(
	args: {
		allowance?: bigint;
		aTokenBalance?: bigint;
		variableDebt?: bigint;
		stableDebt?: bigint;
		onReadContract?: (functionName?: string) => void;
	} = {},
) {
	const allowance = args.allowance ?? 10_000n;
	const aTokenBalance = args.aTokenBalance ?? 2_000n;
	const variableDebt = args.variableDebt ?? 1_000n;
	const stableDebt = args.stableDebt ?? 0n;
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
					args.onReadContract?.(functionName);
					if (functionName === "borrowAllowance") return allowance;
					if (functionName === "allowance") return allowance;
					if (functionName === "debtOf") return 1_000n;
					if (functionName === "balanceOf") return 2_000n;
					if (functionName === "convertToAssets") return 2_000n;
					return allowance;
				},
				multicall: async ({
					contracts,
				}: {
					contracts: readonly {
						address?: Address;
						functionName?: string;
						args?: readonly unknown[];
					}[];
				}) =>
					contracts.map((contract) => {
						if (contract.functionName === "name") return "Aave Test Token";
						if (contract.functionName === "nonces") return 0n;
						if (contract.functionName === "getReserveData") {
							const asset = getAddress(contract.args?.[0] as Address);
							return {
								aTokenAddress:
									asset === getAddress(COLLATERAL_ASSET)
										? getAddress(A_TOKEN)
										: getAddress(DEBT_ASSET),
								stableDebtTokenAddress: getAddress(STABLE_DEBT_TOKEN),
								variableDebtTokenAddress: getAddress(VARIABLE_DEBT_TOKEN),
							};
						}
						if (contract.functionName === "balanceOf") {
							const address = getAddress(contract.address as Address);
							if (address === getAddress(A_TOKEN)) return aTokenBalance;
							if (address === getAddress(VARIABLE_DEBT_TOKEN))
								return variableDebt;
							if (address === getAddress(STABLE_DEBT_TOKEN)) return stableDebt;
						}
						return allowance;
					}),
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

function createCollateralSwapQuote(
	args: {
		verifierAddress?: Address;
		verifierVault?: Address;
		verifierAccount?: Address;
		accountOut?: Address;
		verifyAccountField?: Address;
		verifierData?: Hex;
		deadline?: bigint;
	} = {},
): SwapQuote {
	const deadline = args.deadline ?? 0n;
	const amountOut = "2000";
	const amountOutMin = "1990";
	const verifierVault = args.verifierVault ?? COLLATERAL_VAULT;
	const verifierAccount = args.verifierAccount ?? EULER_ACCOUNT;
	const swapCall = encodeFunctionData({
		abi: swapperAbi,
		functionName: "swap",
		args: [
			{
				handler: SWAPPER_HANDLER_GENERIC,
				mode: 0n,
				account: EULER_ACCOUNT,
				tokenIn: COLLATERAL_ASSET,
				tokenOut: TARGET_DEBT_ASSET,
				vaultIn: COLLATERAL_VAULT,
				accountIn: EULER_ACCOUNT,
				receiver: SWAPPER,
				amountOut: 0n,
				data: encodeAbiParameters(GENERIC_HANDLER_DATA_ABI, [SWAPPER, "0x"]),
			},
		],
	});

	return {
		amountIn: "1500",
		amountInMax: "1500",
		amountOut,
		amountOutMin,
		accountIn: EULER_ACCOUNT,
		accountOut: args.accountOut ?? EULER_ACCOUNT,
		vaultIn: COLLATERAL_VAULT,
		receiver: COLLATERAL_VAULT,
		tokenIn: {
			address: COLLATERAL_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Aave Collateral",
			symbol: "ACOL",
		},
		tokenOut: {
			address: TARGET_DEBT_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Target Collateral",
			symbol: "TCOL",
		},
		slippage: 0.5,
		swap: {
			swapperAddress: SWAPPER,
			swapperData: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [[swapCall]],
			}),
			multicallItems: [{ functionName: "swap", args: [], data: swapCall }],
		},
		verify: {
			verifierAddress: args.verifierAddress ?? SWAP_VERIFIER,
			verifierData:
				args.verifierData ??
				encodeFunctionData({
					abi: swapVerifierAbi,
					functionName: "verifyAmountMinAndSkim",
					args: [
						verifierVault,
						verifierAccount,
						BigInt(amountOutMin),
						deadline,
					],
				}),
			type: SwapVerificationType.SkimMin,
			vault: verifierVault,
			account: args.verifyAccountField ?? verifierAccount,
			amount: amountOutMin,
			deadline: Number(deadline),
		},
		route: [{ providerName: "test" }],
	} as SwapQuote;
}

function containsAavePoolCall(item: EVCBatchItem, functionName: "repay" | "withdraw") {
	return decodeSwapperMulticall(item, SWAPPER).some((call) => {
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

function getAaveRepayAmount(item: EVCBatchItem): bigint | undefined {
	for (const call of decodeSwapperMulticall(item, SWAPPER)) {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: call });
		if (decoded.functionName !== "swap") continue;
		const [params] = decoded.args;
		const [target, payload] = decodeAbiParameters(
			GENERIC_HANDLER_DATA_ABI,
			params.data,
		) as [Address, Hex];
		if (getAddress(target) !== getAddress(AAVE_POOL)) continue;
		const aave = decodeFunctionData({ abi: aaveV3PoolAbi, data: payload });
		if (aave.functionName !== "repay") continue;
		const [, amount] = aave.args as [Address, bigint, bigint, Address];
		return amount;
	}
	return undefined;
}

function getAaveSupplyAmount(item: EVCBatchItem): bigint | undefined {
	for (const call of decodeSwapperMulticall(item, SWAPPER)) {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: call });
		if (decoded.functionName !== "swap") continue;
		const [params] = decoded.args;
		const [target, payload] = decodeAbiParameters(
			GENERIC_HANDLER_DATA_ABI,
			params.data,
		) as [Address, Hex];
		if (getAddress(target) !== getAddress(AAVE_POOL)) continue;
		const aave = decodeFunctionData({ abi: aaveV3PoolAbi, data: payload });
		if (aave.functionName !== "supply") continue;
		const [, amount] = aave.args as [Address, bigint, Address, number];
		return amount;
	}
	return undefined;
}

function getAaveBorrowAmount(item: EVCBatchItem): bigint | undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "aaveBorrowForSender") return undefined;
	const [, , amount] = decoded.args as [Address, Address, bigint, Address];
	return amount;
}

function getEulerCollateralSourceCall(item: EVCBatchItem):
	| { functionName: "withdraw"; amount: bigint; receiver: Address; owner: Address }
	| { functionName: "redeem"; shares: bigint; receiver: Address; owner: Address }
	| undefined {
	if (getAddress(item.targetContract) !== getAddress(COLLATERAL_VAULT)) return undefined;
	const decoded = decodeFunctionData({ abi: eVaultAbi, data: item.data });
	if (decoded.functionName === "withdraw") {
		const [amount, receiver, owner] = decoded.args as [
			bigint,
			Address,
			Address,
		];
		return {
			functionName: "withdraw",
			amount,
			receiver: getAddress(receiver),
			owner: getAddress(owner),
		};
	}
	if (decoded.functionName === "redeem") {
		const [shares, receiver, owner] = decoded.args as [
			bigint,
			Address,
			Address,
		];
		return {
			functionName: "redeem",
			shares,
			receiver: getAddress(receiver),
			owner: getAddress(owner),
		};
	}
	return undefined;
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
	for (const call of decodeSwapperMulticall(item, SWAPPER)) {
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

test("Aave listPositions excludes positions with unsupported stable debt", async () => {
	const connector = createConnector({
		aTokenBalance: 2_000n,
		variableDebt: 1_000n,
		stableDebt: 500n,
	});

	const positions = await connector.listPositions({
		connectorId: AAVE_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		positionRefs: [
			{
				pool: AAVE_POOL,
				collateralAsset: COLLATERAL_ASSET,
				debtAsset: DEBT_ASSET,
			},
		],
	});

	assert.deepEqual(positions, []);
});

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

test("Aave inbound simulation authorization skips duplicate aToken allowance read", async () => {
	let allowanceReads = 0;
	const connector = createConnector({
		allowance: 0n,
		onReadContract: (functionName) => {
			if (functionName === "allowance") allowanceReads++;
		},
	});
	const position = createAavePosition();

	const authorizationRequest = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: AAVE_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		deadline: 123n,
	});
	assert.ok(authorizationRequest);
	assert.equal(allowanceReads, 1);

	await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		authorization: {
			request: authorizationRequest,
			signature: `0x${"11".repeat(65)}`,
		},
		skipAuthorizationCheck: true,
		deadline: 123n,
	});

	assert.equal(allowanceReads, 1);
});

test("Aave outgoing migration verifies the Euler source debt is fully repaid", async () => {
	const connector = createConnector({ allowance: 20_000n });
	const account = createEulerSourceAccount({
		chainId: CHAIN_ID,
		owner: OWNER,
		eulerAccount: EULER_ACCOUNT,
		debtVault: DEBT_VAULT,
		collateralVault: COLLATERAL_VAULT,
		debtAsset: DEBT_ASSET,
		collateralAsset: COLLATERAL_ASSET,
		debtAmount: 1_000n,
		collateralAssets: 2_000n,
		collateralShares: 2_000n,
	});

	const items = await connector.buildMigrationBatch({
		direction: "euler-to-external",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAavePosition(),
		account,
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

test("Aave outgoing migration reads source amounts from the supplied account snapshot", async () => {
	const connector = createConnector();
	const account = createEulerSourceAccount({
		chainId: CHAIN_ID,
		owner: OWNER,
		eulerAccount: EULER_ACCOUNT,
		debtVault: DEBT_VAULT,
		collateralVault: COLLATERAL_VAULT,
		debtAsset: DEBT_ASSET,
		collateralAsset: COLLATERAL_ASSET,
		debtAmount: 1_500n,
		collateralAssets: 4_000n,
		collateralShares: 3_900n,
	});

	const items = await connector.buildMigrationBatch({
		direction: "euler-to-external",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAavePosition(),
		account,
		source: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
	});

	const supplyAmount = items
		.map((item) => getAaveSupplyAmount(item))
		.find((amount) => amount !== undefined);
	const borrowAmount = items
		.map((item) => getAaveBorrowAmount(item))
		.find((amount) => amount !== undefined);
	const sourceCall = items
		.map((item) => getEulerCollateralSourceCall(item))
		.find((call) => call !== undefined);

	assert.equal(supplyAmount, 4_000n);
	assert.equal(borrowAmount, applyBuffer(1_500n, 1n));
	assert.deepEqual(sourceCall, {
		functionName: "redeem",
		shares: 3_900n,
		receiver: getAddress(SWAPPER),
		owner: getAddress(EULER_ACCOUNT),
	});
});

test("Aave outgoing migration requires source amounts or an account snapshot", async () => {
	const connector = createConnector({ allowance: 20_000n });

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
		}),
		/source debt amount requires source\.debtAmount or an account snapshot/,
	);
});

test("Aave outgoing authorization reads borrow amount from the supplied account snapshot", async () => {
	const connector = createConnector({ allowance: 0n });
	const account = createEulerSourceAccount({
		chainId: CHAIN_ID,
		owner: OWNER,
		eulerAccount: EULER_ACCOUNT,
		debtVault: DEBT_VAULT,
		collateralVault: COLLATERAL_VAULT,
		debtAsset: DEBT_ASSET,
		collateralAsset: COLLATERAL_ASSET,
		debtAmount: 1_500n,
		collateralAssets: 4_000n,
		collateralShares: 3_900n,
	});

	const authorization = await connector.getAuthorization({
		direction: "euler-to-external",
		connectorId: AAVE_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAavePosition(),
		account,
		source: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
	});

	assert.equal(authorization?.authorizationType, "variableDebtDelegation");
	assert.equal(
		authorization?.typedData.message.value,
		applyBuffer(1_500n, 1n),
	);
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
		},
		debtSwapQuote: createWrappedDebtSwapQuote(),
	});

	const preTransferItem = items.find((item) =>
		containsAavePoolCall(item, "repay"),
	);
	assert.ok(preTransferItem);

	const calls = decodeSwapperMulticall(preTransferItem, SWAPPER);
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

test("Aave inbound debt swap repays the buffered source debt amount", async () => {
	const connector = createConnector();
	const position = createAavePosition();

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		debtSwapQuote: createWrappedDebtSwapQuote(),
	});

	const repayAmount = items
		.map((item) => getAaveRepayAmount(item))
		.find((amount) => amount !== undefined);

	assert.equal(repayAmount, applyBuffer(position.raw.variableDebt, 100n));
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
		collateralSwapQuote: createCollateralSwapQuote(),
	});

	const calls = items.flatMap((item) => decodeSwapperMulticall(item, SWAPPER));
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

test("Aave inbound collateral swap validates verifier calldata against the migration target", async () => {
	const connector = createConnector();
	const tamperedVerifierData = encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyAmountMinAndSkim",
		args: [OWNER, EULER_ACCOUNT, 1990n, 123n],
	});

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createAavePosition(),
			target: {
				eulerAccount: EULER_ACCOUNT,
				borrowVault: DEBT_VAULT,
				collateralVault: COLLATERAL_VAULT,
			},
			collateralSwapQuote: createCollateralSwapQuote({
				verifierData: tamperedVerifierData,
				deadline: 123n,
			}),
			deadline: 123n,
		}),
		/SwapVerifier data mismatch/,
	);
});

function createAaveSupplyOnlyPosition(): AaveMigrationPosition {
	const position = createAavePosition();
	return {
		...position,
		ref: {
			pool: getAddress(AAVE_POOL),
			collateralAsset: getAddress(COLLATERAL_ASSET),
		},
		debt: { asset: getAddress(COLLATERAL_ASSET), amount: 0n },
		raw: {
			...position.raw,
			debtAsset: undefined,
			debtReserve: undefined,
			variableDebt: 0n,
			stableDebt: 0n,
		},
	};
}

function createTransferMinCollateralSwapQuote(
	args: { receiver?: Address } = {},
): SwapQuote {
	const base = createCollateralSwapQuote({ deadline: 123n });
	const receiver = getAddress(args.receiver ?? SWAP_VERIFIER);
	return {
		...base,
		receiver,
		transferOutputToReceiver: true,
		verify: {
			...base.verify,
			verifierData: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "verifyAmountMinAndTransfer",
				args: [TARGET_DEBT_ASSET, receiver, 1990n, 123n],
			}),
			type: SwapVerificationType.TransferMin,
			vault: receiver,
		},
	} as SwapQuote;
}

test("Aave supply-only deposit-verified collateral swap deposits into the ERC-4626 target", async () => {
	const connector = createConnector();
	const quote = createTransferMinCollateralSwapQuote();

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createAaveSupplyOnlyPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			collateralVault: COLLATERAL_VAULT,
			collateralSwapVerification: "deposit",
		},
		collateralSwapQuote: quote,
		deadline: 123n,
	});

	assert.ok(items.every((item) => item.data !== quote.verify.verifierData));
	const withdrawReceiver = items
		.map((item) => getAaveWithdrawReceiver(item))
		.find((receiver) => receiver !== undefined);
	assert.equal(withdrawReceiver, getAddress(SWAPPER));
	const verifyDepositAmount = getVerifyDepositAmount(items.at(-1)!);
	assert.equal(verifyDepositAmount, 1990n);
});

test("Aave deposit-verified collateral swap rejects positions with debt", async () => {
	const connector = createConnector();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createAavePosition(),
			target: {
				eulerAccount: EULER_ACCOUNT,
				borrowVault: DEBT_VAULT,
				collateralVault: COLLATERAL_VAULT,
				collateralSwapVerification: "deposit",
			},
			collateralSwapQuote: createTransferMinCollateralSwapQuote(),
			deadline: 123n,
		}),
		/only supported for supply-only migrations/,
	);
});

test("Aave deposit-verified collateral swap requires the SwapVerifier receiver", async () => {
	const connector = createConnector();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createAaveSupplyOnlyPosition(),
			target: {
				eulerAccount: EULER_ACCOUNT,
				collateralVault: COLLATERAL_VAULT,
				collateralSwapVerification: "deposit",
			},
			collateralSwapQuote: createTransferMinCollateralSwapQuote({
				receiver: OWNER,
			}),
			deadline: 123n,
		}),
		/swap quote receiver must be the Euler SwapVerifier/,
	);
});
