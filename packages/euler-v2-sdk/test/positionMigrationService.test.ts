import assert from "node:assert/strict";
import {
	decodeFunctionData,
	encodeFunctionData,
	getAddress,
	hashTypedData,
	maxUint256,
	toHex,
} from "viem";
import { test } from "vitest";
import { PositionMigrationService } from "../src/services/positionMigrationService/positionMigrationService.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import { hashMigrationAuthorizationItem } from "../src/services/executionService/migrationAuthorization.js";
import type { EVCBatchItem } from "../src/services/executionService/index.js";
import type {
	BuildConnectorMigrationBatchArgs,
	GetMigrationPositionArgs,
	MigrationAuthorizationRequest,
	MigrationPosition,
	MigrationTarget,
	PositionMigrationConnector,
	SignedMigrationAuthorization,
} from "../src/services/positionMigrationService/index.js";
import type { MetamorphoPermitTypedDataRequest } from "../src/services/positionMigrationService/connectors/metamorpho/metamorphoConnectorTypes.js";
import { aaveATokenAbi } from "../src/services/positionMigrationService/connectors/aave/abis/aaveV3Abi.js";
import { morphoBlueAbi } from "../src/services/positionMigrationService/connectors/morpho/abis/morphoBlueAbi.js";
import type { AaveATokenApprovalTransactionRequest } from "../src/services/positionMigrationService/connectors/aave/aaveConnectorTypes.js";
import { computeAllowanceSlot } from "../src/utils/stateOverrides/index.js";
import type { BuildQueryFn } from "../src/utils/buildQuery.js";
import type { EulerSDKQueryName } from "../src/utils/queryNames.js";

const CHAIN_ID = 8453;
const OWNER = "0x0000000000000000000000000000000000001001" as const;
const DEBT_ASSET = "0x0000000000000000000000000000000000001002" as const;
const COLLATERAL_ASSET = "0x0000000000000000000000000000000000001003" as const;

function createTarget(id: string): MigrationTarget {
	return {
		connectorId: "aave",
		protocol: "Aave V3",
		id,
		chainId: CHAIN_ID,
		ref: {},
		debt: { asset: getAddress(DEBT_ASSET), symbol: "USDC", decimals: 6 },
		collateral: {
			asset: getAddress(COLLATERAL_ASSET),
			symbol: "WETH",
			decimals: 18,
		},
	};
}

function createConnector(args: {
	id: "aave" | "morpho";
	targets?: MigrationTarget[];
	error?: Error;
}): PositionMigrationConnector {
	return {
		id: args.id,
		protocol: args.id === "aave" ? "Aave V3" : "Morpho",
		name: args.id === "aave" ? "Aave V3" : "Morpho",
		listTargets: async () => {
			if (args.error) throw args.error;
			return args.targets ?? [];
		},
		getPosition: async (
			_args: GetMigrationPositionArgs,
		): Promise<MigrationPosition> => {
			throw new Error("not implemented");
		},
		buildMigrationBatch: (): EVCBatchItem[] => [],
	};
}

function createService(
	connectors: PositionMigrationConnector[],
	buildQuery?: BuildQueryFn,
) {
	return new PositionMigrationService(
		{} as never,
		{ convertBatchItemsToPlan: () => [] } as never,
		{ includeDefaultConnectors: false, connectors },
		buildQuery,
	);
}

function createBuildQueryRecorder() {
	const calls: Array<{ queryName: string; args: unknown[] }> = [];
	const buildQuery: BuildQueryFn = (queryName, fn) =>
		(async (...args: unknown[]) => {
			calls.push({ queryName, args });
			return fn(...args);
		}) as typeof fn;

	return { buildQuery, calls };
}

const listTargetArgs = {
	chainId: CHAIN_ID,
	debtAsset: getAddress(DEBT_ASSET),
	collateralAsset: getAddress(COLLATERAL_ASSET),
} as const;

test("listTargets returns successful connector targets when another connector fails", async () => {
	const target = createTarget("aave:target");
	const service = createService([
		createConnector({
			id: "morpho",
			error: new Error("Morpho unavailable"),
		}),
		createConnector({ id: "aave", targets: [target] }),
	]);

	const targets = await service.listTargets(listTargetArgs);

	assert.deepEqual(targets, [target]);
});

test("listTargets returns empty when at least one connector succeeds with no targets", async () => {
	const service = createService([
		createConnector({
			id: "morpho",
			error: new Error("Morpho unavailable"),
		}),
		createConnector({ id: "aave", targets: [] }),
	]);

	const targets = await service.listTargets(listTargetArgs);

	assert.deepEqual(targets, []);
});

test("listTargets throws when all matching connectors fail", async () => {
	const service = createService([
		createConnector({
			id: "morpho",
			error: new Error("Morpho unavailable"),
		}),
		createConnector({
			id: "aave",
			error: new Error("Aave unavailable"),
		}),
	]);

	await assert.rejects(
		() => service.listTargets(listTargetArgs),
		/Morpho unavailable/,
	);
});

test("listTargets preserves direct connector errors", async () => {
	const service = createService([
		createConnector({
			id: "morpho",
			error: new Error("Morpho unavailable"),
		}),
		createConnector({ id: "aave", targets: [createTarget("aave:target")] }),
	]);

	await assert.rejects(
		() => service.listTargets({ ...listTargetArgs, connectorId: "morpho" }),
		/Morpho unavailable/,
	);
});

const migrationPosition: MigrationPosition = {
	connectorId: "morpho",
	protocol: "Morpho",
	id: "morpho:position",
	chainId: CHAIN_ID,
	owner: getAddress(OWNER),
	ref: {},
	debt: { asset: getAddress(DEBT_ASSET), amount: 1n },
	collateral: { asset: getAddress(COLLATERAL_ASSET), amount: 2n },
	raw: {},
};

const morphoAuthorizationRequest: MigrationAuthorizationRequest = {
	kind: "typedData",
	connectorId: "morpho",
	protocol: "Morpho",
	chainId: CHAIN_ID,
	owner: getAddress(OWNER),
	typedData: {
		domain: {
			name: "Morpho Blue",
			chainId: CHAIN_ID,
			verifyingContract: "0x0000000000000000000000000000000000002001",
		},
		types: {
			Authorization: [
				{ name: "authorizer", type: "address" },
				{ name: "authorized", type: "address" },
				{ name: "isAuthorized", type: "bool" },
				{ name: "nonce", type: "uint256" },
				{ name: "deadline", type: "uint256" },
			],
		},
		primaryType: "Authorization",
		message: {
			authorizer: getAddress(OWNER),
			authorized: "0x0000000000000000000000000000000000002002",
			isAuthorized: true,
			nonce: 0n,
			deadline: 1n,
		},
	},
};

test("migration authorization slots bind the reviewed item and typed-data hash", async () => {
	const message = morphoAuthorizationRequest.kind === "typedData"
		? morphoAuthorizationRequest.typedData.message
		: undefined;
	assert.ok(message);
	const stubItem: EVCBatchItem = {
		targetContract: getAddress(
			String(morphoAuthorizationRequest.kind === "typedData"
				? morphoAuthorizationRequest.typedData.domain.verifyingContract
				: ""),
		),
		onBehalfOfAccount: getAddress(OWNER),
		value: 0n,
		data: encodeFunctionData({
			abi: morphoBlueAbi,
			functionName: "setAuthorizationWithSig",
			args: [
				{
					authorizer: getAddress(String(message.authorizer)),
					authorized: getAddress(String(message.authorized)),
					isAuthorized: Boolean(message.isAuthorized),
					nonce: BigInt(message.nonce as bigint),
					deadline: BigInt(message.deadline as bigint),
				},
				{
					v: 27,
					r: `0x${"00".repeat(32)}`,
					s: `0x${"00".repeat(32)}`,
				},
			],
		}),
	};
	const service = createService([]);
	const slots = await service.prepareMigrationAuthorizationSlots({
		previewPlan: [{ type: "evcBatch", items: [stubItem] }],
		authorizationRequest: morphoAuthorizationRequest,
	});

	assert.equal(slots.length, 1);
	assert.deepEqual(slots[0], {
		authorizationRequestIndex: 0,
		planItemIndex: 0,
		batchItemIndex: 0,
		typedDataHash:
			morphoAuthorizationRequest.kind === "typedData"
				? hashTypedData(morphoAuthorizationRequest.typedData)
				: undefined,
		reviewedItemHash: hashMigrationAuthorizationItem(stubItem),
		abiArgumentPath: [
			"migration-signature-v2",
			"morpho-authorization",
			morphoAuthorizationRequest.kind === "typedData"
				? hashTypedData(morphoAuthorizationRequest.typedData)
				: undefined,
			hashMigrationAuthorizationItem(stubItem),
			1,
			0,
			1,
			2,
		],
	});

	const executionService = new ExecutionService({} as never);
	const signature = `0x${"11".repeat(64)}1b` as const;
	const finalized = executionService.encodeMigrationAuthorizationCall({
		chainId: CHAIN_ID,
		signer: getAddress(OWNER),
		typedDataHash: slots[0]!.typedDataHash,
		abiArgumentPath: slots[0]!.abiArgumentPath,
		reviewedItem: stubItem,
		signature,
	});
	const decoded = decodeFunctionData({
		abi: morphoBlueAbi,
		data: finalized.data,
	});
	assert.equal(decoded.functionName, "setAuthorizationWithSig");
	assert.equal(decoded.args[1].v, 27);
	assert.equal(decoded.args[1].r, `0x${"11".repeat(32)}`);
	assert.equal(decoded.args[1].s, `0x${"11".repeat(32)}`);
	assert.throws(
		() =>
			executionService.encodeMigrationAuthorizationCall({
				chainId: CHAIN_ID,
				signer: getAddress(OWNER),
				typedDataHash: `0x${"ff".repeat(32)}`,
				abiArgumentPath: slots[0]!.abiArgumentPath,
				reviewedItem: stubItem,
				signature,
			}),
		/typed-data hash changed/,
	);
	assert.throws(
		() =>
			executionService.encodeMigrationAuthorizationCall({
				chainId: CHAIN_ID,
				signer: getAddress(OWNER),
				typedDataHash: slots[0]!.typedDataHash,
				abiArgumentPath: slots[0]!.abiArgumentPath,
				reviewedItem: {
					...stubItem,
					targetContract: "0x00000000000000000000000000000000000020ff",
				},
				signature,
			}),
		/reviewed item changed/,
	);
	assert.throws(
		() =>
			executionService.encodeMigrationAuthorizationCall({
				chainId: CHAIN_ID,
				signer: getAddress(OWNER),
				typedDataHash: slots[0]!.typedDataHash,
				abiArgumentPath: slots[0]!.abiArgumentPath,
				reviewedItem: {
					...stubItem,
					data: encodeFunctionData({
						abi: morphoBlueAbi,
						functionName: "setAuthorizationWithSig",
						args: [
							{
								authorizer: getAddress(String(message.authorizer)),
								authorized:
									"0x00000000000000000000000000000000000020ff",
								isAuthorized: Boolean(message.isAuthorized),
								nonce: BigInt(message.nonce as bigint),
								deadline: BigInt(message.deadline as bigint),
							},
							{
								v: 27,
								r: `0x${"00".repeat(32)}`,
								s: `0x${"00".repeat(32)}`,
							},
						],
					}),
				},
				signature,
			}),
		/reviewed item changed/,
	);
	assert.throws(
		() =>
			executionService.encodeMigrationAuthorizationCall({
				chainId: CHAIN_ID,
				signer: getAddress(OWNER),
				typedDataHash: slots[0]!.typedDataHash,
				abiArgumentPath: slots[0]!.abiArgumentPath,
				reviewedItem: stubItem,
				signature: `0x${"11".repeat(64)}02`,
			}),
		/recovery ID is invalid/,
	);
	await assert.rejects(
		service.prepareMigrationAuthorizationSlots({
			previewPlan: [{ type: "evcBatch", items: [stubItem] }],
			authorizationRequest: {
				...morphoAuthorizationRequest,
				owner: "0x00000000000000000000000000000000000020ff",
			},
		}),
		/has 0 matching preview slots/,
	);
});

test("position migration read APIs are routed through buildQuery", async () => {
	const target = createTarget("morpho:target");
	const connector: PositionMigrationConnector = {
		id: "morpho",
		protocol: "Morpho",
		name: "Morpho",
		listTargets: async () => [target],
		getPosition: async () => migrationPosition,
		getAuthorization: async () => morphoAuthorizationRequest,
		buildMigrationBatch: () => [],
	};
	const { buildQuery, calls } = createBuildQueryRecorder();
	const service = createService([connector], buildQuery);

	await service.listTargets(listTargetArgs);
	await service.getPosition({
		connectorId: "morpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		positionRef: migrationPosition.ref,
	});
	await service.getAuthorization({
		direction: "external-to-euler",
		connectorId: "morpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: migrationPosition,
	});

	assert.deepEqual(
		calls.map((call) => call.queryName),
		["queryListTargets", "queryGetPosition", "queryGetAuthorization"],
	);
});

test("every PositionMigrationService query field is declared in EulerSDKQueryName", () => {
	const service = createService([]);
	const queryFields = Object.getOwnPropertyNames(service)
		.filter((name) => name.startsWith("query"))
		.sort();

	// The annotation ties each name to the EulerSDKQueryName union; consumers
	// key per-query cache policy off that union, so a query field missing from
	// it silently falls back to the consumer's default caching. If this
	// assertion fails, a query field was added or removed without updating
	// queryNames.ts — change the union together with this list.
	const declared: EulerSDKQueryName[] = [
		"queryEulerSourceVaultAssets",
		"queryEulerTargetVaultData",
		"queryGetAuthorization",
		"queryGetPosition",
		"queryListPositions",
		"queryListTargets",
	];

	assert.deepEqual(queryFields, [...declared].sort());
});

test("position migration Euler validation reads are routed through buildQuery", async () => {
	const borrowVault = getAddress("0x0000000000000000000000000000000000003001");
	const collateralVault = getAddress(
		"0x0000000000000000000000000000000000003002",
	);
	const multicallResponses = [
		[getAddress(DEBT_ASSET), 1],
		[getAddress(DEBT_ASSET), getAddress(COLLATERAL_ASSET)],
	];
	let multicallIndex = 0;
	const providerService = {
		getProvider: () => ({
			readContract: async () => getAddress(COLLATERAL_ASSET),
			multicall: async () => multicallResponses[multicallIndex++],
		}),
	};
	const connector: PositionMigrationConnector = {
		id: "morpho",
		protocol: "Morpho",
		name: "Morpho",
		getPosition: async () => migrationPosition,
		buildMigrationBatch: () => [],
	};
	const { buildQuery, calls } = createBuildQueryRecorder();
	const service = new PositionMigrationService(
		providerService as never,
		{
			convertBatchItemsToPlan: () => [],
			encodeDisableController: () =>
				({
					targetContract: borrowVault,
					data: "0x",
				}) as unknown as EVCBatchItem,
		} as never,
		{ includeDefaultConnectors: false, connectors: [connector] },
		buildQuery,
	);

	await service.buildMigrationBatch({
		direction: "external-to-euler",
		connectorId: "morpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: migrationPosition,
		target: {
			eulerAccount: getAddress(OWNER),
			borrowVault,
			collateralVault,
		},
	});
	await service.buildMigrationBatch({
		direction: "euler-to-external",
		connectorId: "morpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: migrationPosition,
		source: {
			eulerAccount: getAddress(OWNER),
			borrowVault,
			collateralVault,
		},
	});

	assert.deepEqual(
		calls.map((call) => call.queryName),
		["queryEulerTargetVaultData", "queryEulerSourceVaultAssets"],
	);
});

function createMorphoSimulationConnector(args: {
	onBuild?: (args: BuildConnectorMigrationBatchArgs) => void;
	onGetAuthorization?: () => void;
} = {}): PositionMigrationConnector {
	return {
		id: "morpho",
		protocol: "Morpho",
		name: "Morpho",
		getPosition: async () => migrationPosition,
		getAuthorization: async () => {
			args.onGetAuthorization?.();
			throw new Error("connector authorization should not be fetched");
		},
		buildMigrationBatch: (buildArgs) => {
			args.onBuild?.(buildArgs);
			return [];
		},
	};
}

test("planMigrationSimulation reuses a provided authorization request", async () => {
	let getAuthorizationCalls = 0;
	let builtAuthorization: SignedMigrationAuthorization | undefined;
	let builtSkipAuthorizationCheck: boolean | undefined;
	const service = createService([
		createMorphoSimulationConnector({
			onGetAuthorization: () => {
				getAuthorizationCalls++;
			},
			onBuild: (args) => {
				builtAuthorization = args.authorization;
				builtSkipAuthorizationCheck = args.skipAuthorizationCheck;
			},
		}),
	]);

	const result = await service.planMigrationSimulation({
		direction: "external-to-euler",
		connectorId: "morpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: migrationPosition,
		positionRef: migrationPosition.ref,
		target: {
			eulerAccount: getAddress(OWNER),
			collateralVault: "0x0000000000000000000000000000000000003001",
		},
		authorizationRequest: morphoAuthorizationRequest,
		validateEulerVaults: false,
	});

	assert.equal(getAuthorizationCalls, 0);
	assert.equal(builtAuthorization?.request, morphoAuthorizationRequest);
	assert.equal(builtSkipAuthorizationCheck, true);
	assert.equal(result.stateOverrides.length, 1);
	assert.equal(result.authorizationRequest, morphoAuthorizationRequest);
});

test("planMigrationSimulation reuses a provided signed authorization request", async () => {
	let getAuthorizationCalls = 0;
	let builtAuthorization: SignedMigrationAuthorization | undefined;
	let builtSkipAuthorizationCheck: boolean | undefined;
	const service = createService([
		createMorphoSimulationConnector({
			onGetAuthorization: () => {
				getAuthorizationCalls++;
			},
			onBuild: (args) => {
				builtAuthorization = args.authorization;
				builtSkipAuthorizationCheck = args.skipAuthorizationCheck;
			},
		}),
	]);
	const authorization: SignedMigrationAuthorization = {
		request: morphoAuthorizationRequest,
		signature: `0x${"11".repeat(65)}`,
	};

	const result = await service.planMigrationSimulation({
		direction: "external-to-euler",
		connectorId: "morpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: migrationPosition,
		positionRef: migrationPosition.ref,
		target: {
			eulerAccount: getAddress(OWNER),
			collateralVault: "0x0000000000000000000000000000000000003001",
		},
		authorization,
		validateEulerVaults: false,
	});

	assert.equal(getAuthorizationCalls, 0);
	assert.equal(builtAuthorization?.request, morphoAuthorizationRequest);
	assert.equal(builtSkipAuthorizationCheck, true);
	assert.equal(result.stateOverrides.length, 1);
});

test("planMigrationSimulation returns a stub-signed preview plan and the resolved authorization request", async () => {
	const morphoContract = getAddress(
		"0x0000000000000000000000000000000000002001",
	);
	const authItem = {
		targetContract: morphoContract,
		data: "0x8069218f00",
	} as unknown as EVCBatchItem;
	const otherItem = {
		targetContract: getAddress("0x0000000000000000000000000000000000004001"),
		data: "0xdeadbeef",
	} as unknown as EVCBatchItem;
	let builtAuthorization: SignedMigrationAuthorization | undefined;
	let builtSkipAuthorizationCheck: boolean | undefined;
	const connector: PositionMigrationConnector = {
		id: "morpho",
		protocol: "Morpho",
		name: "Morpho",
		getPosition: async () => migrationPosition,
		getAuthorization: async () => morphoAuthorizationRequest,
		buildMigrationBatch: (buildArgs) => {
			builtAuthorization = buildArgs.authorization;
			builtSkipAuthorizationCheck = buildArgs.skipAuthorizationCheck;
			return [authItem, otherItem];
		},
	};
	const service = new PositionMigrationService(
		{} as never,
		{
			convertBatchItemsToPlan: (items: EVCBatchItem[]) => items,
		} as never,
		{ includeDefaultConnectors: false, connectors: [connector] },
	);

	const result = await service.planMigrationSimulation({
		direction: "external-to-euler",
		connectorId: "morpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: migrationPosition,
		target: {
			eulerAccount: getAddress(OWNER),
			collateralVault: "0x0000000000000000000000000000000000003001",
		},
		validateEulerVaults: false,
	});

	// The internally resolved request is surfaced to the caller.
	assert.equal(result.authorizationRequest, morphoAuthorizationRequest);
	// The single batch build ran with a stub-signed authorization.
	assert.equal(builtAuthorization?.request, morphoAuthorizationRequest);
	assert.equal(builtAuthorization?.signature, `0x${"00".repeat(65)}`);
	assert.equal(builtSkipAuthorizationCheck, true);
	// Preview plan keeps the authorization item; simulation plan filters it
	// and relies on the state override instead.
	assert.deepEqual(result.previewPlan as unknown as EVCBatchItem[], [
		authItem,
		otherItem,
	]);
	assert.deepEqual(result.plan as unknown as EVCBatchItem[], [otherItem]);
	assert.equal(result.stateOverrides.length, 1);
});

test("planMigrationSimulation applies transaction grants without embedding them in the batch", async () => {
	const aToken = getAddress(
		"0x0000000000000000000000000000000000002101",
	);
	const swapVerifier = getAddress(
		"0x0000000000000000000000000000000000002102",
	);
	const request: AaveATokenApprovalTransactionRequest = {
		kind: "transaction",
		authorizationType: "aTokenApproval",
		connectorId: "aave",
		protocol: "Aave V3",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		token: aToken,
		call: {
			to: aToken,
			abi: aaveATokenAbi,
			functionName: "approve",
			args: [swapVerifier, 2n],
		},
		revocation: {
			to: aToken,
			abi: aaveATokenAbi,
			functionName: "approve",
			args: [swapVerifier, 1n],
		},
	};
	const migrationItem = {
		targetContract: getAddress(
			"0x0000000000000000000000000000000000004001",
		),
		data: "0xdeadbeef",
	} as unknown as EVCBatchItem;
	let builtArgs: BuildConnectorMigrationBatchArgs | undefined;
	const connector: PositionMigrationConnector = {
		id: "aave",
		protocol: "Aave V3",
		name: "Aave V3",
		getPosition: async () => ({ ...migrationPosition, connectorId: "aave" }),
		getAuthorization: async () => request,
		buildMigrationBatch: (args) => {
			builtArgs = args;
			return [migrationItem];
		},
	};
	const service = new PositionMigrationService(
		{} as never,
		{
			convertBatchItemsToPlan: (items: EVCBatchItem[]) => items,
		} as never,
		{ includeDefaultConnectors: false, connectors: [connector] },
	);

	const result = await service.planMigrationSimulation({
		direction: "external-to-euler",
		connectorId: "aave",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: { ...migrationPosition, connectorId: "aave" },
		target: {
			eulerAccount: getAddress(OWNER),
			collateralVault: "0x0000000000000000000000000000000000003001",
		},
		authorizationKind: "transaction",
		validateEulerVaults: false,
	});

	assert.equal(builtArgs?.authorization, undefined);
	assert.equal(builtArgs?.authorizationRequest, request);
	assert.equal(builtArgs?.skipAuthorizationCheck, true);
	assert.deepEqual(result.plan as unknown as EVCBatchItem[], [migrationItem]);
	assert.deepEqual(result.previewPlan as unknown as EVCBatchItem[], [
		migrationItem,
	]);
	assert.equal(result.authorizationRequest, request);
	assert.equal(result.stateOverrides.length, 1);
	const override = result.stateOverrides[0]!;
	assert.equal(getAddress(override.address), aToken);
	assert.equal(
		override.stateDiff?.[0]?.slot,
		computeAllowanceSlot(getAddress(OWNER), swapVerifier, 53n),
	);
	assert.equal(
		override.stateDiff?.[0]?.value,
		toHex(2n, { size: 32 }),
	);
});

const METAMORPHO_VAULT = getAddress(
	"0x0000000000000000000000000000000000005001",
);
const METAMORPHO_SPENDER = getAddress(
	"0x0000000000000000000000000000000000005002",
);

const metamorphoMigrationPosition: MigrationPosition = {
	connectorId: "metamorpho",
	protocol: "Morpho Vaults",
	id: `metamorpho:${METAMORPHO_VAULT}:supply`,
	chainId: CHAIN_ID,
	owner: getAddress(OWNER),
	ref: { vault: METAMORPHO_VAULT, version: "v2" },
	debt: { asset: getAddress(COLLATERAL_ASSET), amount: 0n },
	collateral: { asset: getAddress(COLLATERAL_ASSET), amount: 2n },
	raw: {},
};

const metamorphoPermitRequest: MetamorphoPermitTypedDataRequest = {
	kind: "typedData",
	authorizationType: "metamorphoPermit",
	connectorId: "metamorpho",
	protocol: "Morpho Vaults",
	chainId: CHAIN_ID,
	owner: getAddress(OWNER),
	token: METAMORPHO_VAULT,
	allowanceSlotIndex: 13n,
	typedData: {
		domain: { chainId: CHAIN_ID, verifyingContract: METAMORPHO_VAULT },
		types: {
			Permit: [
				{ name: "owner", type: "address" },
				{ name: "spender", type: "address" },
				{ name: "value", type: "uint256" },
				{ name: "nonce", type: "uint256" },
				{ name: "deadline", type: "uint256" },
			],
		},
		primaryType: "Permit",
		message: {
			owner: getAddress(OWNER),
			spender: METAMORPHO_SPENDER,
			value: 2n,
			nonce: 0n,
			deadline: 1n,
		},
	},
};

test("planMigrationSimulation stubs metamorpho permits with an allowance slot override", async () => {
	const permitItem = {
		targetContract: METAMORPHO_VAULT,
		data: "0xd505accf00",
	} as unknown as EVCBatchItem;
	const otherItem = {
		targetContract: getAddress("0x0000000000000000000000000000000000004001"),
		data: "0xdeadbeef",
	} as unknown as EVCBatchItem;
	const connector: PositionMigrationConnector = {
		id: "metamorpho",
		protocol: "Morpho Vaults",
		name: "Morpho Vaults",
		getPosition: async () => metamorphoMigrationPosition,
		getAuthorization: async () => metamorphoPermitRequest,
		buildMigrationBatch: () => [permitItem, otherItem],
	};
	const service = new PositionMigrationService(
		{} as never,
		{
			convertBatchItemsToPlan: (items: EVCBatchItem[]) => items,
		} as never,
		{ includeDefaultConnectors: false, connectors: [connector] },
	);

	const result = await service.planMigrationSimulation({
		direction: "external-to-euler",
		connectorId: "metamorpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: metamorphoMigrationPosition,
		target: {
			eulerAccount: getAddress(OWNER),
			collateralVault: "0x0000000000000000000000000000000000003001",
		},
		validateEulerVaults: false,
	});

	assert.equal(result.stateOverrides.length, 1);
	const override = result.stateOverrides[0]!;
	assert.equal(getAddress(override.address), METAMORPHO_VAULT);
	assert.equal(
		override.stateDiff?.[0]?.slot,
		computeAllowanceSlot(getAddress(OWNER), METAMORPHO_SPENDER, 13n),
	);
	assert.equal(
		override.stateDiff?.[0]?.value,
		toHex(maxUint256, { size: 32 }),
	);
	// Simulation plan drops the permit item (state override replaces it);
	// the preview plan keeps the stub-signed permit call.
	assert.deepEqual(result.plan as unknown as EVCBatchItem[], [otherItem]);
	assert.deepEqual(result.previewPlan as unknown as EVCBatchItem[], [
		permitItem,
		otherItem,
	]);
	assert.equal(result.authorizationRequest, metamorphoPermitRequest);
});

test("metamorpho migrations are gated to the external-to-euler direction", async () => {
	const connector: PositionMigrationConnector = {
		id: "metamorpho",
		protocol: "Morpho Vaults",
		name: "Morpho Vaults",
		getPosition: async () => metamorphoMigrationPosition,
		buildMigrationBatch: () => [],
	};
	const service = createService([connector]);

	await assert.rejects(
		service.buildMigrationBatch({
			direction: "euler-to-external",
			connectorId: "metamorpho",
			chainId: CHAIN_ID,
			owner: getAddress(OWNER),
			position: metamorphoMigrationPosition,
			validateEulerVaults: false,
		}),
		/temporarily disabled/,
	);

	const items = await service.buildMigrationBatch({
		direction: "external-to-euler",
		connectorId: "metamorpho",
		chainId: CHAIN_ID,
		owner: getAddress(OWNER),
		position: metamorphoMigrationPosition,
		target: {
			eulerAccount: getAddress(OWNER),
			collateralVault: "0x0000000000000000000000000000000000003001",
		},
		validateEulerVaults: false,
	});
	assert.deepEqual(items, []);
});
