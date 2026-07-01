import assert from "node:assert/strict";
import { getAddress } from "viem";
import { test } from "vitest";
import { PositionMigrationService } from "../src/services/positionMigrationService/positionMigrationService.js";
import type { EVCBatchItem } from "../src/services/executionService/index.js";
import type {
	GetMigrationPositionArgs,
	MigrationPosition,
	MigrationTarget,
	PositionMigrationConnector,
} from "../src/services/positionMigrationService/index.js";

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
		{} as never,
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
