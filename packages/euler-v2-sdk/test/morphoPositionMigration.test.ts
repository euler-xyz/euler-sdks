import assert from "node:assert/strict";
import {
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
import type { EVCBatchItem } from "../src/services/executionService/index.js";
import {
	MorphoPositionMigrationConnector,
	MORPHO_CONNECTOR_ID,
	MORPHO_PROTOCOL,
} from "../src/services/positionMigrationService/connectors/morpho/morphoConnector.js";
import { morphoBlueAbi } from "../src/services/positionMigrationService/connectors/morpho/abis/morphoBlueAbi.js";
import type {
	MorphoMarketParams,
	MorphoMigrationPosition,
} from "../src/services/positionMigrationService/connectors/morpho/morphoConnectorTypes.js";
import {
	SwapVerificationType,
	type SwapQuote,
} from "../src/services/swapService/index.js";
import {
	GENERIC_HANDLER_DATA_ABI,
	SWAPPER_HANDLER_GENERIC,
	createEulerSourceAccount,
	decodeSwapperMulticall,
	getEulerCollateralSourceCall,
	getVerifyAmountMinAndDepositAmount,
	getVerifyDebtMaxCall,
} from "./helpers/positionMigration.js";

const CHAIN_ID = 8453;
const OWNER = "0x0000000000000000000000000000000000000b01" as const;
const EULER_ACCOUNT = "0x0000000000000000000000000000000000000b02" as const;
const DEBT_VAULT = "0x0000000000000000000000000000000000000b03" as const;
const COLLATERAL_VAULT = "0x0000000000000000000000000000000000000b04" as const;
const SWAPPER = "0x0000000000000000000000000000000000000b05" as const;
const SWAP_VERIFIER = "0x0000000000000000000000000000000000000b06" as const;
const MORPHO = "0x0000000000000000000000000000000000000b07" as const;
const COLLATERAL_ASSET = "0x0000000000000000000000000000000000000b08" as const;
const DEBT_ASSET = "0x0000000000000000000000000000000000000b09" as const;
const ORACLE = "0x0000000000000000000000000000000000000b0a" as const;
const IRM = "0x0000000000000000000000000000000000000b0b" as const;
const QUOTE_ASSET = "0x0000000000000000000000000000000000000b0c" as const;
const MARKET_ID = `0x${"11".repeat(32)}` as Hex;

const marketParams: MorphoMarketParams = {
	loanToken: getAddress(DEBT_ASSET),
	collateralToken: getAddress(COLLATERAL_ASSET),
	oracle: getAddress(ORACLE),
	irm: getAddress(IRM),
	lltv: 860000000000000000n,
};

function createConnector(
	args: {
		isAuthorized?: boolean;
		onReadContract?: (functionName?: string) => void;
		morphoGraphqlTimeoutMs?: number;
		fetchFn?: typeof fetch;
	} = {},
) {
	return new MorphoPositionMigrationConnector(
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
					if (functionName === "isAuthorized") return args.isAuthorized ?? true;
					if (functionName === "nonce") return 0n;
					if (functionName === "debtOf") return 1_000n;
					if (functionName === "balanceOf") return 2_000n;
					if (functionName === "convertToAssets") return 2_000n;
					return true;
				},
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
		{
			morphoAddresses: { [CHAIN_ID]: MORPHO },
			morphoGraphqlTimeoutMs: args.morphoGraphqlTimeoutMs,
			fetchFn: args.fetchFn,
		},
	);
}

function createMorphoPosition(): MorphoMigrationPosition {
	return {
		connectorId: MORPHO_CONNECTOR_ID,
		protocol: MORPHO_PROTOCOL,
		id: "morpho:test",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		ref: marketParams,
		debt: {
			asset: getAddress(DEBT_ASSET),
			amount: 1_000n,
		},
		collateral: {
			asset: getAddress(COLLATERAL_ASSET),
			amount: 2_000n,
		},
		raw: {
			marketId: MARKET_ID,
			owner: getAddress(OWNER),
			supplyShares: 0n,
			borrowShares: 1_000n,
			collateral: 2_000n,
			borrowAssets: 1_000n,
			market: {
				totalSupplyAssets: 0n,
				totalSupplyShares: 0n,
				totalBorrowAssets: 0n,
				totalBorrowShares: 0n,
				lastUpdate: 0n,
				fee: 0n,
			},
			marketParams,
		},
	};
}

function createSwapQuote(): SwapQuote {
	const quoteCall = encodeFunctionData({
		abi: swapperAbi,
		functionName: "sweep",
		args: [QUOTE_ASSET, 123n, OWNER],
	});

	return {
		amountIn: "123",
		amountInMax: "124",
		amountOut: "456",
		amountOutMin: "455",
		accountIn: EULER_ACCOUNT,
		accountOut: EULER_ACCOUNT,
		vaultIn: DEBT_VAULT,
		receiver: SWAPPER,
		tokenIn: {
			address: QUOTE_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Quote Asset",
			symbol: "QUOTE",
		},
		tokenOut: {
			address: QUOTE_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Quote Asset",
			symbol: "QUOTE",
		},
		slippage: 0.5,
		swap: {
			swapperAddress: SWAPPER,
			swapperData: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [[quoteCall]],
			}),
			multicallItems: [{ functionName: "sweep", args: [], data: quoteCall }],
		},
		verify: {
			verifierAddress: SWAP_VERIFIER,
			verifierData: "0x",
			type: "debtMax",
			vault: DEBT_VAULT,
			account: EULER_ACCOUNT,
			amount: "0",
			deadline: 0,
		},
		route: [{ providerName: "test" }],
	} as SwapQuote;
}

function createDebtSwapQuote(): SwapQuote {
	const swapCall = encodeFunctionData({
		abi: swapperAbi,
		functionName: "swap",
		args: [
			{
				handler: SWAPPER_HANDLER_GENERIC,
				mode: 0n,
				account: EULER_ACCOUNT,
				tokenIn: QUOTE_ASSET,
				tokenOut: DEBT_ASSET,
				vaultIn: DEBT_VAULT,
				accountIn: EULER_ACCOUNT,
				receiver: SWAPPER,
				amountOut: 0n,
				data: "0x",
			},
		],
	});

	return {
		amountIn: "123",
		amountInMax: "124",
		amountOut: "456",
		amountOutMin: "455",
		accountIn: EULER_ACCOUNT,
		accountOut: EULER_ACCOUNT,
		vaultIn: DEBT_VAULT,
		receiver: SWAPPER,
		tokenIn: {
			address: QUOTE_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Quote Asset",
			symbol: "QUOTE",
		},
		tokenOut: {
			address: DEBT_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Debt Asset",
			symbol: "DEBT",
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
			verifierAddress: SWAP_VERIFIER,
			verifierData: "0x",
			type: "debtMax",
			vault: DEBT_VAULT,
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
	const amountOut = "456";
	const amountOutMin = "455";
	const verifierVault = args.verifierVault ?? COLLATERAL_VAULT;
	const verifierAccount = args.verifierAccount ?? EULER_ACCOUNT;
	const quoteCall = encodeFunctionData({
		abi: swapperAbi,
		functionName: "sweep",
		args: [QUOTE_ASSET, 123n, OWNER],
	});

	return {
		amountIn: "123",
		amountInMax: "124",
		amountOut,
		amountOutMin,
		accountIn: EULER_ACCOUNT,
		accountOut: args.accountOut ?? EULER_ACCOUNT,
		vaultIn: DEBT_VAULT,
		receiver: COLLATERAL_VAULT,
		tokenIn: {
			address: QUOTE_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Quote Asset",
			symbol: "QUOTE",
		},
		tokenOut: {
			address: QUOTE_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Quote Asset",
			symbol: "QUOTE",
		},
		slippage: 0.5,
		swap: {
			swapperAddress: SWAPPER,
			swapperData: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [[quoteCall]],
			}),
			multicallItems: [{ functionName: "sweep", args: [], data: quoteCall }],
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

function decodeSwapperFunctionName(data: Hex): string {
	return decodeFunctionData({ abi: swapperAbi, data }).functionName;
}

function getMorphoWithdraw(item: EVCBatchItem):
	| { amount: bigint; receiver: Address }
	| undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "morphoWithdrawCollateralForSender") return undefined;
	const [, , amount, receiver] = decoded.args as [
		Address,
		MorphoMarketParams,
		bigint,
		Address,
	];
	return { amount, receiver: getAddress(receiver) };
}

function getMorphoSupplyCollateralAmount(item: EVCBatchItem): bigint | undefined {
	for (const call of decodeSwapperMulticall(item, SWAPPER)) {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: call });
		if (decoded.functionName !== "swap") continue;
		const [params] = decoded.args;
		const [target, payload] = decodeAbiParameters(
			GENERIC_HANDLER_DATA_ABI,
			params.data,
		) as [Address, Hex];
		if (getAddress(target) !== getAddress(MORPHO)) continue;
		const morpho = decodeFunctionData({ abi: morphoBlueAbi, data: payload });
		if (morpho.functionName !== "supplyCollateral") continue;
		const [, amount] = morpho.args as [
			MorphoMarketParams,
			bigint,
			Address,
			Hex,
		];
		return amount;
	}
	return undefined;
}

function getMorphoBorrowAmount(item: EVCBatchItem): bigint | undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "morphoBorrowForSender") return undefined;
	const [, , amount] = decoded.args as [
		Address,
		MorphoMarketParams,
		bigint,
		Address,
	];
	return amount;
}

test("Morpho target lookup aborts an unresponsive GraphQL request", async () => {
	let receivedSignal = false;
	const fetchFn = ((_input, init) =>
		new Promise<Response>((_resolve, reject) => {
			const signal = init?.signal;
			receivedSignal = !!signal;
			if (!signal) {
				reject(new Error("missing abort signal"));
				return;
			}
			signal.addEventListener(
				"abort",
				() => reject(new Error("morpho graphql request aborted")),
				{ once: true },
			);
		})) as typeof fetch;
	const connector = createConnector({
		fetchFn,
		morphoGraphqlTimeoutMs: 1,
	});

	await assert.rejects(
		connector.listTargets({
			chainId: CHAIN_ID,
			debtAsset: DEBT_ASSET,
			collateralAsset: COLLATERAL_ASSET,
		}),
		/morpho graphql request aborted/,
	);
	assert.equal(receivedSignal, true);
});

test("Morpho inbound no-swap migration deposits through SwapVerifier with the source collateral amount", async () => {
	const connector = createConnector();
	const position = createMorphoPosition();

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

	const withdraw = items
		.map((item) => getMorphoWithdraw(item))
		.find((value) => value !== undefined);
	const verifyDepositAmount = items
		.map((item) =>
			getVerifyAmountMinAndDepositAmount(item, {
				swapVerifier: SWAP_VERIFIER,
				vault: COLLATERAL_VAULT,
				receiver: EULER_ACCOUNT,
			}),
		)
		.find((amount) => amount !== undefined);

	assert.deepEqual(withdraw, {
		amount: position.raw.collateral,
		receiver: getAddress(SWAP_VERIFIER),
	});
	assert.equal(verifyDepositAmount, position.raw.collateral);
	assert.equal(
		items.some((item) => {
			if (getAddress(item.targetContract) !== getAddress(SWAPPER)) return false;
			try {
				return (
					decodeFunctionData({ abi: swapperAbi, data: item.data }).functionName ===
					"deposit"
				);
			} catch {
				return false;
			}
		}),
		false,
	);
});

test("Morpho inbound no-swap migration does not use target minimum as the withdrawal amount", async () => {
	const connector = createConnector();
	const position = createMorphoPosition();
	const minCollateralAssets = 1_500n;

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

	const withdraw = items
		.map((item) => getMorphoWithdraw(item))
		.find((value) => value !== undefined);
	const verifyDepositAmount = items
		.map((item) =>
			getVerifyAmountMinAndDepositAmount(item, {
				swapVerifier: SWAP_VERIFIER,
				vault: COLLATERAL_VAULT,
				receiver: EULER_ACCOUNT,
			}),
		)
		.find((amount) => amount !== undefined);

	assert.deepEqual(withdraw, {
		amount: position.raw.collateral,
		receiver: getAddress(SWAP_VERIFIER),
	});
	assert.equal(verifyDepositAmount, minCollateralAssets);
});

test("Morpho simulation authorization skips duplicate authorization read", async () => {
	let authorizationReads = 0;
	const connector = createConnector({
		isAuthorized: false,
		onReadContract: (functionName) => {
			if (functionName === "isAuthorized") authorizationReads++;
		},
	});
	const position = createMorphoPosition();

	const authorizationRequest = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: MORPHO_CONNECTOR_ID,
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
	assert.equal(authorizationReads, 1);

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

	assert.equal(authorizationReads, 1);
});

test("Morpho outgoing migration verifies the Euler source debt is fully repaid", async () => {
	const connector = createConnector();
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
		position: createMorphoPosition(),
		account,
		source: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		deadline: 123n,
	});

	const verifyDebtMax = items
		.map((item) => getVerifyDebtMaxCall(item, SWAP_VERIFIER))
		.find((value) => value !== undefined);

	assert.deepEqual(verifyDebtMax, {
		vault: getAddress(DEBT_VAULT),
		account: getAddress(EULER_ACCOUNT),
		amountMax: 0n,
		deadline: 123n,
	});
});

test("Morpho outgoing migration reads source amounts from the supplied account snapshot", async () => {
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
		position: createMorphoPosition(),
		account,
		source: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
	});

	const supplyAmount = items
		.map((item) => getMorphoSupplyCollateralAmount(item))
		.find((amount) => amount !== undefined);
	const borrowAmount = items
		.map((item) => getMorphoBorrowAmount(item))
		.find((amount) => amount !== undefined);
	const sourceCall = items
		.map((item) => getEulerCollateralSourceCall(item, COLLATERAL_VAULT))
		.find((call) => call !== undefined);

	assert.equal(supplyAmount, 4_000n);
	assert.equal(borrowAmount, 1_501n);
	assert.deepEqual(sourceCall, {
		functionName: "redeem",
		shares: 3_900n,
		receiver: getAddress(SWAPPER),
		owner: getAddress(EULER_ACCOUNT),
	});
});

test("Morpho outgoing migration requires source amounts or an account snapshot", async () => {
	const connector = createConnector();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "euler-to-external",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createMorphoPosition(),
			source: {
				eulerAccount: EULER_ACCOUNT,
				borrowVault: DEBT_VAULT,
				collateralVault: COLLATERAL_VAULT,
			},
		}),
		/source debt amount requires source\.debtAmount or an account snapshot/,
	);
});

test("Morpho outgoing migration rejects supplied swap quotes", async () => {
	const connector = createConnector();
	const swapQuote = createSwapQuote();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "euler-to-external",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createMorphoPosition(),
			source: {
				eulerAccount: EULER_ACCOUNT,
				borrowVault: DEBT_VAULT,
				collateralVault: COLLATERAL_VAULT,
			},
			collateralSwapQuote: swapQuote,
			debtSwapQuote: swapQuote,
			deadline: 123n,
		}),
		/Morpho Euler to Morpho migration does not support swaps/,
	);
});

test("Morpho inbound debt swap sweeps output token and repays leftover input token", async () => {
	const connector = createConnector();

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMorphoPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		debtSwapQuote: createDebtSwapQuote(),
		collateralSwapQuote: createCollateralSwapQuote(),
	});

	const calls = items.flatMap((item) => decodeSwapperMulticall(item, SWAPPER));
	assert.deepEqual(calls.map(decodeSwapperFunctionName), [
		"swap",
		"swap",
		"sweep",
		"multicall",
		"repay",
	]);
	const sweep = decodeFunctionData({ abi: swapperAbi, data: calls[2]! });
	assert.equal(sweep.functionName, "sweep");
	const [token, amountMin, to] = sweep.args as [Address, bigint, Address];
	assert.equal(getAddress(token), getAddress(DEBT_ASSET));
	assert.equal(amountMin, 0n);
	assert.equal(getAddress(to), getAddress(OWNER));

	const repay = decodeFunctionData({ abi: swapperAbi, data: calls[4]! });
	assert.equal(repay.functionName, "repay");
	const [repayToken, repayVault, repayAmount, repayAccount] = repay.args as [
		Address,
		Address,
		bigint,
		Address,
	];
	assert.equal(getAddress(repayToken), getAddress(QUOTE_ASSET));
	assert.equal(getAddress(repayVault), getAddress(DEBT_VAULT));
	assert.equal(repayAmount, 124n);
	assert.equal(getAddress(repayAccount), getAddress(EULER_ACCOUNT));
});

test("Morpho inbound collateral swap validates verifier calldata against the migration target", async () => {
	const connector = createConnector();
	const tamperedVerifierData = encodeFunctionData({
		abi: swapVerifierAbi,
		functionName: "verifyAmountMinAndSkim",
		args: [OWNER, EULER_ACCOUNT, 455n, 123n],
	});

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createMorphoPosition(),
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

test("Morpho authorization can be requested as a plain setAuthorization transaction", async () => {
	const connector = createConnector({ isAuthorized: false });

	const authorization = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMorphoPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		authorizationKind: "transaction",
	});

	assert.ok(authorization);
	assert.equal(authorization.kind, "transaction");
	assert.equal(authorization.authorizationType, "morphoAuthorization");
	assert.equal(getAddress(authorization.call.to), getAddress(MORPHO));
	assert.equal(authorization.call.functionName, "setAuthorization");
	assert.deepEqual(authorization.call.args, [SWAP_VERIFIER, true]);
	assert.equal(authorization.revocation?.functionName, "setAuthorization");
	assert.deepEqual(authorization.revocation?.args, [SWAP_VERIFIER, false]);
});

test("Morpho transaction authorization reads no nonce", async () => {
	const readFunctions: (string | undefined)[] = [];
	const connector = createConnector({
		isAuthorized: false,
		onReadContract: (functionName) => readFunctions.push(functionName),
	});

	await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMorphoPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		authorizationKind: "transaction",
	});

	// setAuthorization is msg.sender-authenticated, so it consumes no nonce.
	assert.ok(!readFunctions.includes("nonce"));
});

test("Morpho transaction authorization is skipped when already authorized", async () => {
	// An authorization we did not grant is not ours to revoke, so
	// removeAuthorizationAfterMigration must not conjure a disable request.
	const connector = createConnector({ isAuthorized: true });

	const authorization = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMorphoPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		removeAuthorizationAfterMigration: true,
		authorizationKind: "transaction",
	});

	assert.equal(authorization, undefined);
});

test("Morpho transaction authorization carries its revocation without postMigrationAuthorization", async () => {
	const connector = createConnector({ isAuthorized: false });

	const authorization = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMorphoPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			borrowVault: DEBT_VAULT,
			collateralVault: COLLATERAL_VAULT,
		},
		removeAuthorizationAfterMigration: true,
		authorizationKind: "transaction",
	});

	assert.ok(authorization);
	// The in-batch disable needs a signature this form cannot supply; the
	// revocation is sent as its own transaction instead.
	assert.equal(authorization.postMigrationAuthorization, undefined);
	assert.deepEqual(authorization.revocation?.args, [SWAP_VERIFIER, false]);
});
