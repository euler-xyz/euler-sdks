import assert from "node:assert/strict";
import { getAddress, maxUint256, toHex } from "viem";
import { test } from "vitest";
import { PositionMigrationService } from "../src/services/positionMigrationService/positionMigrationService.js";
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
import { computeAllowanceSlot } from "../src/utils/stateOverrides/index.js";

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

function createService(connectors: PositionMigrationConnector[]) {
	return new PositionMigrationService(
		{} as never,
		{ convertBatchItemsToPlan: () => [] } as never,
		{ includeDefaultConnectors: false, connectors },
	);
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
