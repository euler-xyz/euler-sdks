import assert from "node:assert/strict";
import {
	encodeFunctionData,
	getAddress,
	zeroAddress,
	type Address,
} from "viem";
import { test } from "vitest";
import { MorphoPositionMigrationConnector } from "../src/services/positionMigrationService/connectors/morpho/morphoConnector.js";
import { AavePositionMigrationConnector } from "../src/services/positionMigrationService/connectors/aave/aaveConnector.js";
import { PositionMigrationService } from "../src/services/positionMigrationService/positionMigrationService.js";
import type {
	MigrationPosition,
	PositionMigrationConnector,
} from "../src/services/positionMigrationService/positionMigrationServiceTypes.js";
import { SwapService } from "../src/services/swapService/swapService.js";
import { assertSwapVerifierAllowed } from "../src/services/swapService/swapAllowlist.js";
import {
	SwapperMode,
	SwapVerificationType,
	type SwapQuoteRequest,
	type SwapQuote,
} from "../src/services/swapService/swapServiceTypes.js";
import { swapVerifierAbi } from "../src/services/swapService/swapVerifierAbi.js";
import { executeCowSwapTransactionPlan } from "../src/services/executionService/cowExecutor.js";
import type {
	CowSwapPlanItem,
	CowSwapCancelClosePositionPlanParams,
} from "../src/services/executionService/executionServiceTypes.js";

const address = (value: number) =>
	getAddress(`0x${value.toString(16).padStart(40, "0")}`);
const OWNER = address(1);
const TOKEN = address(2);
const COLLATERAL = address(3);
const PROTOCOL = address(4);
const VERIFIER = address(5);
const SWAPPER = address(6);
const marketParams = {
	loanToken: TOKEN,
	collateralToken: COLLATERAL,
	oracle: address(7),
	irm: address(8),
	lltv: 800_000_000_000_000_000n,
};

test("Morpho migration debt matches canonical virtual-share rounding on stored market totals", async () => {
	// morpho-blue 8e26ca6 src/libraries/SharesMathLib.sol::toAssetsUp.
	// This compares the stored snapshot, not future interest at execution time.
	for (const [shares, assets, totalShares, expected] of [
		[500_001n, 2n, 1_000_000n, 1n],
		[1_000_000n, 10n, 1_000_000n, 6n],
		[0n, 10n, 1_000_000n, 0n],
		[1n, 0n, 1n, 1n],
		[10n ** 24n, 10n ** 18n, 10n ** 24n, 10n ** 18n],
	]) {
		const connector = new MorphoPositionMigrationConnector(
			{} as never,
			{
				getProvider: () => ({
					multicall: async () => [
						[0n, shares, 100n],
						[0n, 0n, assets, totalShares, 1n, 0n],
					],
				}),
			} as never,
			{} as never,
		);
		const position = await connector.getPosition({
			connectorId: "morpho",
			chainId: 1,
			owner: OWNER,
			positionRef: marketParams,
		});
		assert.equal(
			position.debt.amount,
			expected,
			`shares=${shares}, assets=${assets}, totalShares=${totalShares}`,
		);
		assert.equal(position.raw.borrowAssets, expected);
	}
});

test("Aave positions with no stable-debt token do not call balanceOf on address zero", async () => {
	for (const stableToken of [zeroAddress, address(12)]) {
		const seen: Address[] = [];
		const connector = new AavePositionMigrationConnector(
			{} as never,
			{
				getProvider: () => ({
					multicall: async ({
						contracts,
					}: {
						contracts: { address: Address; functionName: string }[];
					}) => {
						if (contracts[0]?.functionName === "getReserveData")
							return contracts.map(() => ({
								aTokenAddress: address(10),
								variableDebtTokenAddress: address(11),
								stableDebtTokenAddress: stableToken,
							}));
						return contracts.map((contract) => {
							seen.push(contract.address);
							assert.notEqual(
								contract.address,
								zeroAddress,
								"zero address has no balanceOf return data",
							);
							return contract.address === address(10)
								? 100n
								: contract.address === address(11)
									? 50n
									: 3n;
						});
					},
				}),
			} as never,
			{} as never,
			{ graphqlEndpoint: null },
		);
		const position = await connector.getPosition({
			connectorId: "aave",
			chainId: 1,
			owner: OWNER,
			positionRef: {
				pool: PROTOCOL,
				collateralAsset: COLLATERAL,
				debtAsset: TOKEN,
			},
		});
		assert.equal(
			position.raw.stableDebt,
			stableToken === zeroAddress ? 0n : 3n,
		);
		assert.equal(position.debt.amount, stableToken === zeroAddress ? 50n : 53n);
		assert.equal(seen.length, stableToken === zeroAddress ? 2 : 3);
	}
});

const validPosition: MigrationPosition = {
	connectorId: "morpho",
	protocol: "Morpho",
	id: "position",
	chainId: 1,
	owner: OWNER,
	ref: marketParams,
	debt: { asset: TOKEN, amount: 1n },
	collateral: { asset: COLLATERAL, amount: 2n },
	raw: {},
};

test("migration refuses cached positions belonging to a different chain, owner or connector", async () => {
	for (const change of [
		{ chainId: 8453 },
		{ owner: address(99) },
		{ connectorId: "aave" },
	]) {
		for (const method of [
			"buildMigrationBatch",
			"planMigrationSimulation",
			"getAuthorization",
		] as const) {
			let connectorCalls = 0;
			const connector: PositionMigrationConnector = {
				id: "morpho",
				protocol: "Morpho",
				name: "Morpho",
				getPosition: async () => {
					throw new Error("unexpected refresh");
				},
				getAuthorization: async () => {
					connectorCalls++;
					return undefined;
				},
				buildMigrationBatch: () => {
					connectorCalls++;
					return [];
				},
			};
			const service = new PositionMigrationService(
				{} as never,
				{ convertBatchItemsToPlan: () => [] } as never,
				{ connectors: [connector] },
			);
			await assert.rejects(
				service[method]({
					connectorId: "morpho",
					direction: "external-to-euler",
					chainId: 1,
					owner: OWNER,
					position: { ...validPosition, ...change },
					validateEulerVaults: false,
				}),
				/position.*mismatch/i,
			);
			assert.equal(connectorCalls, 0);
		}
	}
});

function swapFixture(swapper: Address | undefined, verifier = VERIFIER) {
	const service = new SwapService({ swapApiUrl: "https://unused.invalid" }, {
		getDeployment: () => ({
			addresses: { peripheryAddrs: { swapper, swapVerifier: verifier } },
		}),
	} as never);
	const request: SwapQuoteRequest = {
		chainId: 1,
		origin: OWNER,
		tokenIn: TOKEN,
		tokenOut: COLLATERAL,
		amount: 100n,
		accountIn: OWNER,
		accountOut: OWNER,
		vaultIn: PROTOCOL,
		receiver: PROTOCOL,
		slippage: 1,
		swapperMode: SwapperMode.EXACT_IN,
		isRepay: false,
		targetDebt: 0n,
		currentDebt: 0n,
		deadline: 2_000_000_000,
	};
	const token = {
		chainId: 1,
		decimals: 18,
		logoURI: "",
		name: "Token",
		symbol: "T",
	};
	const quote: SwapQuote = {
		amountIn: "100",
		amountInMax: "100",
		amountOut: "100",
		amountOutMin: "99",
		slippage: 1,
		accountIn: OWNER,
		accountOut: OWNER,
		vaultIn: PROTOCOL,
		receiver: PROTOCOL,
		tokenIn: { ...token, address: TOKEN },
		tokenOut: { ...token, address: COLLATERAL },
		swap: { swapperAddress: SWAPPER, swapperData: "0x", multicallItems: [] },
		verify: {
			verifierAddress: verifier,
			type: SwapVerificationType.SkimMin,
			vault: PROTOCOL,
			account: OWNER,
			amount: "99",
			deadline: request.deadline,
			verifierData: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "verifyAmountMinAndSkim",
				args: [PROTOCOL, OWNER, 99n, BigInt(request.deadline)],
			}),
		},
		route: [{ providerName: "test" }],
	};
	service.setQuerySwapQuotes(async () => ({ success: true, data: [quote] }));
	return { service, request, quote };
}

test("fetchSwapQuotes fails closed when the chain has no usable swapper allowlist", async () => {
	for (const swapper of [undefined, zeroAddress]) {
		const { service, request } = swapFixture(swapper);
		await assert.rejects(
			service.fetchSwapQuotes(request),
			/swapper.*not configured/i,
		);
	}
	const { service, request, quote } = swapFixture(SWAPPER);
	assert.deepEqual(await service.fetchSwapQuotes(request), [quote]);
});

test("a zero configured SwapVerifier cannot be accepted as an on-chain slippage guard", async () => {
	assert.throws(
		() => assertSwapVerifierAllowed(zeroAddress, zeroAddress),
		/not configured/i,
	);
	const { service, request } = swapFixture(SWAPPER, zeroAddress);
	await assert.rejects(
		service.fetchSwapQuotes(request),
		/SwapVerifier address missing/,
	);
});

test("CoW validates every item's chain and owner before executing any preceding cancellation", async () => {
	const first: CowSwapPlanItem<CowSwapCancelClosePositionPlanParams> = {
		type: "cowSwap",
		kind: "cancelClosePosition",
		chainId: 1,
		params: { chainId: 1, owner: OWNER, nonce: 0n },
	};
	for (const invalid of [
		{ ...first, chainId: 56 },
		{ ...first, params: { ...first.params, chainId: 56 } },
		{ ...first, params: { ...first.params, owner: address(99) } },
	]) {
		let reads = 0;
		let sends = 0;
		await assert.rejects(
			executeCowSwapTransactionPlan({
				plan: [first, invalid],
				chainId: 1,
				account: OWNER,
				deploymentService: {
					getDeployment: () => ({
						addresses: { coreAddrs: { evc: PROTOCOL } },
					}),
				} as never,
				providerService: {
					getProvider: () => ({
						readContract: async () => {
							reads++;
							return 0n;
						},
						waitForTransactionReceipt: async () => ({ status: "success" }),
					}),
				} as never,
				sendTransaction: async () => {
					sends++;
					return `0x${"11".repeat(32)}`;
				},
				signTypedData: async () => {
					throw new Error("unexpected signature");
				},
			}),
			/chain|owner/i,
		);
		assert.equal(reads, 0);
		assert.equal(sends, 0);
	}
});
