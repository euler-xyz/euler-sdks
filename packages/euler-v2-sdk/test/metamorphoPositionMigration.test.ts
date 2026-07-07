import assert from "node:assert/strict";
import {
	decodeAbiParameters,
	decodeFunctionData,
	encodeAbiParameters,
	encodeFunctionData,
	getAddress,
	zeroAddress,
	type Address,
	type Hex,
} from "viem";
import { test } from "vitest";
import { swapperAbi } from "../src/services/executionService/abis/swapperAbi.js";
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import type { EVCBatchItem } from "../src/services/executionService/index.js";
import { metamorphoAbi } from "../src/services/positionMigrationService/connectors/metamorpho/abis/metamorphoAbi.js";
import {
	METAMORPHO_CONNECTOR_ID,
	METAMORPHO_PROTOCOL,
	MetamorphoPositionMigrationConnector,
} from "../src/services/positionMigrationService/connectors/metamorpho/metamorphoConnector.js";
import type {
	MetamorphoMigrationPosition,
	MetamorphoVaultVersion,
} from "../src/services/positionMigrationService/connectors/metamorpho/metamorphoConnectorTypes.js";
import {
	SwapVerificationType,
	type SwapQuote,
} from "../src/services/swapService/index.js";

const CHAIN_ID = 8453;
const OWNER = "0x0000000000000000000000000000000000000b01" as const;
const EULER_ACCOUNT = "0x0000000000000000000000000000000000000b02" as const;
const COLLATERAL_VAULT = "0x0000000000000000000000000000000000000b03" as const;
const EARN_VAULT = "0x0000000000000000000000000000000000000b04" as const;
const SWAPPER = "0x0000000000000000000000000000000000000b05" as const;
const SWAP_VERIFIER = "0x0000000000000000000000000000000000000b06" as const;
const METAMORPHO_VAULT = "0x0000000000000000000000000000000000000b07" as const;
const UNDERLYING = "0x0000000000000000000000000000000000000b08" as const;
const TARGET_ASSET = "0x0000000000000000000000000000000000000b09" as const;
const SHARE_BALANCE = 2_000n;
const ASSETS = 2_100n;
const NONCE = 7n;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;
const SWAPPER_HANDLER_GENERIC =
	"0x47656e6572696300000000000000000000000000000000000000000000000000" as const;

const GENERIC_HANDLER_DATA_ABI = [
	{ name: "target", type: "address" },
	{ name: "payload", type: "bytes" },
] as const;

function createConnector(args: { allowance?: bigint } = {}) {
	const allowance = args.allowance ?? 10_000n;
	return new MetamorphoPositionMigrationConnector(
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
					if (functionName === "allowance") return allowance;
					if (functionName === "nonces") return NONCE;
					if (functionName === "eip712Domain") {
						return [
							"0x0f",
							"",
							"1",
							BigInt(CHAIN_ID),
							METAMORPHO_VAULT,
							ZERO_HASH,
							[],
						];
					}
					return 0n;
				},
				multicall: async ({
					contracts,
				}: {
					contracts: { functionName: string }[];
				}) =>
					contracts.map((contract) => {
						switch (contract.functionName) {
							case "balanceOf":
								return SHARE_BALANCE;
							case "asset":
								return UNDERLYING;
							case "convertToAssets":
								return ASSETS;
							case "symbol":
								return "USDC";
							case "decimals":
								return 6;
							default:
								return 0n;
						}
					}),
			}),
		} as never,
		{} as never,
	);
}

function createMetamorphoPosition(
	version: MetamorphoVaultVersion = "v1",
): MetamorphoMigrationPosition {
	return {
		connectorId: METAMORPHO_CONNECTOR_ID,
		protocol: METAMORPHO_PROTOCOL,
		id: `metamorpho:${getAddress(METAMORPHO_VAULT)}:supply`,
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		ref: {
			vault: getAddress(METAMORPHO_VAULT),
			version,
		},
		debt: {
			asset: getAddress(UNDERLYING),
			amount: 0n,
		},
		collateral: {
			asset: getAddress(UNDERLYING),
			amount: ASSETS,
			shares: SHARE_BALANCE,
		},
		raw: {
			id: `metamorpho:${getAddress(METAMORPHO_VAULT)}:supply`,
			owner: getAddress(OWNER),
			vault: getAddress(METAMORPHO_VAULT),
			version,
			shareBalance: SHARE_BALANCE,
			assets: ASSETS,
			underlying: getAddress(UNDERLYING),
			underlyingSymbol: "USDC",
			underlyingDecimals: 6,
		},
	};
}

function createCollateralSwapQuote(
	args: {
		verifierData?: Hex;
		deadline?: bigint;
		transferOutputToReceiver?: boolean;
		receiver?: Address;
	} = {},
): SwapQuote {
	const deadline = args.deadline ?? 123n;
	const amountOut = "2000";
	const amountOutMin = "1990";
	const transferOutputToReceiver = args.transferOutputToReceiver ?? false;
	const receiver =
		args.receiver ??
		(transferOutputToReceiver ? SWAP_VERIFIER : COLLATERAL_VAULT);
	const swapCall = encodeFunctionData({
		abi: swapperAbi,
		functionName: "swap",
		args: [
			{
				handler: SWAPPER_HANDLER_GENERIC,
				mode: 0n,
				account: EULER_ACCOUNT,
				tokenIn: UNDERLYING,
				tokenOut: TARGET_ASSET,
				vaultIn: COLLATERAL_VAULT,
				accountIn: EULER_ACCOUNT,
				receiver: SWAPPER,
				amountOut: 0n,
				data: encodeAbiParameters(GENERIC_HANDLER_DATA_ABI, [SWAPPER, "0x"]),
			},
		],
	});

	return {
		amountIn: "2100",
		amountInMax: "2100",
		amountOut,
		amountOutMin,
		accountIn: EULER_ACCOUNT,
		accountOut: EULER_ACCOUNT,
		vaultIn: COLLATERAL_VAULT,
		receiver,
		tokenIn: {
			address: UNDERLYING,
			chainId: CHAIN_ID,
			decimals: 6,
			logoURI: "",
			name: "Morpho Underlying",
			symbol: "USDC",
		},
		tokenOut: {
			address: TARGET_ASSET,
			chainId: CHAIN_ID,
			decimals: 18,
			logoURI: "",
			name: "Target Asset",
			symbol: "TGT",
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
			verifierData:
				args.verifierData ??
				(transferOutputToReceiver
					? encodeFunctionData({
							abi: swapVerifierAbi,
							functionName: "verifyAmountMinAndTransfer",
							args: [TARGET_ASSET, receiver, BigInt(amountOutMin), deadline],
						})
					: encodeFunctionData({
							abi: swapVerifierAbi,
							functionName: "verifyAmountMinAndSkim",
							args: [
								COLLATERAL_VAULT,
								EULER_ACCOUNT,
								BigInt(amountOutMin),
								deadline,
							],
						})),
			type: transferOutputToReceiver
				? SwapVerificationType.TransferMin
				: SwapVerificationType.SkimMin,
			vault: transferOutputToReceiver ? receiver : COLLATERAL_VAULT,
			account: transferOutputToReceiver ? zeroAddress : EULER_ACCOUNT,
			amount: amountOutMin,
			deadline: Number(deadline),
		},
		route: [{ providerName: "test" }],
		...(transferOutputToReceiver ? { transferOutputToReceiver: true } : {}),
	} as SwapQuote;
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

function getRedeemCall(item: EVCBatchItem):
	| { shares: bigint; receiver: Address; owner: Address }
	| undefined {
	for (const call of decodeSwapperMulticall(item)) {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: call });
		if (decoded.functionName !== "swap") continue;
		const [params] = decoded.args;
		const [target, payload] = decodeAbiParameters(
			GENERIC_HANDLER_DATA_ABI,
			params.data,
		) as [Address, Hex];
		if (getAddress(target) !== getAddress(METAMORPHO_VAULT)) continue;
		const vaultCall = decodeFunctionData({ abi: metamorphoAbi, data: payload });
		if (vaultCall.functionName !== "redeem") continue;
		const [shares, receiver, owner] = vaultCall.args as [
			bigint,
			Address,
			Address,
		];
		return {
			shares,
			receiver: getAddress(receiver),
			owner: getAddress(owner),
		};
	}
	return undefined;
}

function getShareTransferFromSender(item: EVCBatchItem):
	| { token: Address; amount: bigint; to: Address }
	| undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) {
		return undefined;
	}
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "transferBalanceFromSender") return undefined;
	const [token, amount, to] = decoded.args as [Address, bigint, Address];
	return { token: getAddress(token), amount, to: getAddress(to) };
}

function getPermitCall(item: EVCBatchItem):
	| { owner: Address; spender: Address; value: bigint; deadline: bigint }
	| undefined {
	if (getAddress(item.targetContract) !== getAddress(METAMORPHO_VAULT)) {
		return undefined;
	}
	const decoded = decodeFunctionData({ abi: metamorphoAbi, data: item.data });
	if (decoded.functionName !== "permit") return undefined;
	const [owner, spender, value, deadline] = decoded.args as [
		Address,
		Address,
		bigint,
		bigint,
	];
	return {
		owner: getAddress(owner),
		spender: getAddress(spender),
		value,
		deadline,
	};
}

function getVerifyDeposit(item: EVCBatchItem):
	| { vault: Address; receiver: Address; amountMin: bigint; deadline: bigint }
	| undefined {
	if (getAddress(item.targetContract) !== getAddress(SWAP_VERIFIER)) {
		return undefined;
	}
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "verifyAmountMinAndDeposit") return undefined;
	const [vault, receiver, amountMin, deadline] = decoded.args as [
		Address,
		Address,
		bigint,
		bigint,
	];
	return {
		vault: getAddress(vault),
		receiver: getAddress(receiver),
		amountMin,
		deadline,
	};
}

test("Metamorpho getPosition reads share balance, assets and underlying", async () => {
	const connector = createConnector();

	const position = await connector.getPosition({
		connectorId: METAMORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		positionRef: { vault: METAMORPHO_VAULT, version: "v1" },
	});

	assert.equal(position.id, `metamorpho:${getAddress(METAMORPHO_VAULT)}:supply`);
	assert.equal(position.debt.amount, 0n);
	assert.equal(position.debt.asset, getAddress(UNDERLYING));
	assert.equal(position.collateral.amount, ASSETS);
	assert.equal(position.collateral.shares, SHARE_BALANCE);
	assert.equal(position.raw.underlyingSymbol, "USDC");
	assert.equal(position.raw.underlyingDecimals, 6);
});

test("Metamorpho inbound migration orders permit, share transfer, redeem and deposit", async () => {
	const connector = createConnector({ allowance: 0n });
	const position = createMetamorphoPosition();

	const authorizationRequest = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: METAMORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		deadline: 123n,
	});
	assert.ok(authorizationRequest);

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			collateralVault: COLLATERAL_VAULT,
		},
		authorization: {
			request: authorizationRequest,
			signature: `0x${"11".repeat(65)}`,
		},
		deadline: 123n,
	});

	assert.equal(items.length, 4);
	const permit = getPermitCall(items[0]!);
	assert.deepEqual(permit, {
		owner: getAddress(OWNER),
		spender: getAddress(SWAP_VERIFIER),
		value: SHARE_BALANCE,
		deadline: 123n,
	});
	const transfer = getShareTransferFromSender(items[1]!);
	assert.deepEqual(transfer, {
		token: getAddress(METAMORPHO_VAULT),
		amount: SHARE_BALANCE,
		to: getAddress(SWAPPER),
	});
	const redeem = getRedeemCall(items[2]!);
	assert.deepEqual(redeem, {
		shares: SHARE_BALANCE,
		receiver: getAddress(SWAP_VERIFIER),
		owner: getAddress(SWAPPER),
	});
	const deposit = getVerifyDeposit(items[3]!);
	assert.deepEqual(deposit, {
		vault: getAddress(COLLATERAL_VAULT),
		receiver: getAddress(EULER_ACCOUNT),
		amountMin: ASSETS,
		deadline: 123n,
	});
});

test("Metamorpho inbound migration skips the permit when allowance is sufficient", async () => {
	const connector = createConnector();
	const position = createMetamorphoPosition();

	const authorizationRequest = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: METAMORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
	});
	assert.equal(authorizationRequest, undefined);

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position,
		target: {
			eulerAccount: EULER_ACCOUNT,
			collateralVault: COLLATERAL_VAULT,
		},
		deadline: 123n,
	});

	assert.equal(items.length, 3);
	assert.ok(getShareTransferFromSender(items[0]!));
});

test("Metamorpho v1 authorization derives the domain from eip712Domain (empty name)", async () => {
	const connector = createConnector({ allowance: 0n });

	const request = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: METAMORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMetamorphoPosition("v1"),
		deadline: 123n,
	});

	assert.ok(request);
	assert.equal(request.authorizationType, "metamorphoPermit");
	assert.equal(request.token, getAddress(METAMORPHO_VAULT));
	assert.equal(request.allowanceSlotIndex, 1n);
	assert.deepEqual(request.typedData.domain, {
		name: "",
		version: "1",
		chainId: CHAIN_ID,
		verifyingContract: getAddress(METAMORPHO_VAULT),
	});
	assert.equal(request.typedData.primaryType, "Permit");
	assert.equal(request.typedData.message.owner, getAddress(OWNER));
	assert.equal(request.typedData.message.spender, getAddress(SWAP_VERIFIER));
	assert.equal(request.typedData.message.value, SHARE_BALANCE);
	assert.equal(request.typedData.message.nonce, NONCE);
	assert.equal(request.typedData.message.deadline, 123n);
});

test("Metamorpho v2 authorization uses the minimal chainId+verifyingContract domain", async () => {
	const connector = createConnector({ allowance: 0n });

	const request = await connector.getAuthorization({
		direction: "external-to-euler",
		connectorId: METAMORPHO_CONNECTOR_ID,
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMetamorphoPosition("v2"),
	});

	assert.ok(request);
	assert.equal(request.allowanceSlotIndex, 13n);
	assert.deepEqual(request.typedData.domain, {
		chainId: CHAIN_ID,
		verifyingContract: getAddress(METAMORPHO_VAULT),
	});
});

test("Metamorpho migration rejects outbound direction and debt artifacts", async () => {
	const connector = createConnector();
	const position = createMetamorphoPosition();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "euler-to-external",
			chainId: CHAIN_ID,
			owner: OWNER,
			position,
		}),
		/does not support direction/,
	);
	await assert.rejects(
		connector.getAuthorization({
			direction: "euler-to-external",
			connectorId: METAMORPHO_CONNECTOR_ID,
			chainId: CHAIN_ID,
			owner: OWNER,
			position,
		}),
		/does not support direction/,
	);
	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position,
			target: {
				eulerAccount: EULER_ACCOUNT,
				collateralVault: COLLATERAL_VAULT,
			},
			debtSwapQuote: createCollateralSwapQuote(),
		}),
		/has no debt to swap/,
	);
	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position,
			target: {
				eulerAccount: EULER_ACCOUNT,
				borrowVault: COLLATERAL_VAULT,
				collateralVault: COLLATERAL_VAULT,
			},
		}),
		/does not support a borrow vault/,
	);
});

test("Metamorpho collateral swap (skim) redeems to the Swapper and emits the quote verifier item", async () => {
	const connector = createConnector();
	const quote = createCollateralSwapQuote({ deadline: 123n });

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMetamorphoPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			collateralVault: COLLATERAL_VAULT,
		},
		collateralSwapQuote: quote,
		deadline: 123n,
	});

	const redeem = getRedeemCall(items[1]!);
	assert.equal(redeem?.receiver, getAddress(SWAPPER));
	const swapperCalls = decodeSwapperMulticall(items[1]!);
	assert.equal(swapperCalls.length, 2);
	assert.equal(swapperCalls[1], quote.swap.swapperData);
	const verifyItem = items.at(-1)!;
	assert.equal(getAddress(verifyItem.targetContract), getAddress(SWAP_VERIFIER));
	assert.equal(verifyItem.data, quote.verify.verifierData);
});

test("Metamorpho collateral swap validates verifier calldata against the migration target", async () => {
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
			position: createMetamorphoPosition(),
			target: {
				eulerAccount: EULER_ACCOUNT,
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

test("Metamorpho deposit-verified collateral swap deposits into the ERC-4626 target", async () => {
	const connector = createConnector();
	const quote = createCollateralSwapQuote({
		transferOutputToReceiver: true,
		deadline: 123n,
	});

	const items = await connector.buildMigrationBatch({
		direction: "external-to-euler",
		chainId: CHAIN_ID,
		owner: OWNER,
		position: createMetamorphoPosition(),
		target: {
			eulerAccount: EULER_ACCOUNT,
			collateralVault: EARN_VAULT,
			collateralSwapVerification: "deposit",
		},
		collateralSwapQuote: quote,
		deadline: 123n,
	});

	const redeem = getRedeemCall(items[1]!);
	assert.equal(redeem?.receiver, getAddress(SWAPPER));
	assert.ok(items.every((item) => item.data !== quote.verify.verifierData));
	const deposit = getVerifyDeposit(items.at(-1)!);
	assert.deepEqual(deposit, {
		vault: getAddress(EARN_VAULT),
		receiver: getAddress(EULER_ACCOUNT),
		amountMin: 1990n,
		deadline: 123n,
	});
	assert.equal(items.at(-1)!.onBehalfOfAccount, getAddress(OWNER));
});

test("Metamorpho deposit-verified collateral swap requires transferOutputToReceiver quotes", async () => {
	const connector = createConnector();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createMetamorphoPosition(),
			target: {
				eulerAccount: EULER_ACCOUNT,
				collateralVault: EARN_VAULT,
				collateralSwapVerification: "deposit",
			},
			collateralSwapQuote: createCollateralSwapQuote({ deadline: 123n }),
			deadline: 123n,
		}),
		/must be requested with transferOutputToReceiver/,
	);
});

test("Metamorpho deposit-verified collateral swap requires the SwapVerifier receiver", async () => {
	const connector = createConnector();

	await assert.rejects(
		connector.buildMigrationBatch({
			direction: "external-to-euler",
			chainId: CHAIN_ID,
			owner: OWNER,
			position: createMetamorphoPosition(),
			target: {
				eulerAccount: EULER_ACCOUNT,
				collateralVault: EARN_VAULT,
				collateralSwapVerification: "deposit",
			},
			collateralSwapQuote: createCollateralSwapQuote({
				transferOutputToReceiver: true,
				receiver: OWNER,
				deadline: 123n,
			}),
			deadline: 123n,
		}),
		/swap quote receiver must be the Euler SwapVerifier/,
	);
});
