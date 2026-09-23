import assert from "node:assert/strict";
import { test } from "vitest";
import type { Address } from "viem";
import { convertVault } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.js";
import { EulerEarnV3Adapter } from "../src/services/vaults/eulerEarnService/adapters/eulerEarnV3Adapter.js";
import type { DataIssue } from "../src/utils/entityDiagnostics.js";

const VAULT = "0x0000000000000000000000000000000000000abc" as Address;
const ASSET = "0x0000000000000000000000000000000000000def" as Address;
const QUOTE = "0x0000000000000000000000000000000000000348" as Address;
const BTC_REFERENCE_ASSET =
	"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const STRATEGY = "0x0000000000000000000000000000000000000123" as Address;
const NON_WITHDRAW_QUEUE_STRATEGY =
	"0x0000000000000000000000000000000000000456" as Address;

function defaultAppliedPaths(errors: DataIssue[]): string[] {
	return errors
		.filter((issue) => issue.code === "DEFAULT_APPLIED")
		.flatMap((issue) => issue.locations.map((location) => location.path));
}

test("EVault V3 converter normalizes BTC reference precision without optional-field warnings", () => {
	const errors: DataIssue[] = [];

	const vault = convertVault(
		{
			chainId: 1,
			address: VAULT,
			name: "Vault",
			symbol: "eTEST",
			decimals: 18,
			shares: {
				address: VAULT,
			},
			asset: {
				address: ASSET,
				decimals: 18,
			},
			dToken: "0x0000000000000000000000000000000000000001",
			oracle: {
				oracle: "0x0000000000000000000000000000000000000002",
				name: "EulerRouter",
				adapters: [],
				resolvedVaults: [],
			},
			unitOfAccount: {
				address: BTC_REFERENCE_ASSET,
				decimals: 8,
			},
			creator: "0x0000000000000000000000000000000000000003",
			governorAdmin: "0x0000000000000000000000000000000000000004",
			totalShares: "0",
			totalAssets: "0",
			totalBorrows: "0",
			totalBorrowed: "0",
			totalCash: "0",
			fees: null,
			hooks: null,
			caps: null,
			liquidation: null,
			interestRates: null,
			interestRateModel: null,
			balanceTracker: null,
			evcCompatibleAsset: null,
			oraclePriceRaw: null,
			timestamp: "1970-01-01T00:00:01.000Z",
		},
		[
			{
				collateral: ASSET,
				borrowLTV: "0",
				liquidationLTV: "0",
				initialLiquidationLTV: "0",
				targetTimestamp: "1970-01-01T00:00:01.000Z",
				rampDuration: 0,
				oraclePriceRaw: null,
			},
		],
		errors,
		VAULT,
	);

	assert.deepEqual(defaultAppliedPaths(errors), []);
	assert.equal(vault.unitOfAccount?.decimals, 18);
});

test("EulerEarn V3 converter does not warn for optional absent APY and pending fields", async () => {
	const adapter = new EulerEarnV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3EulerEarnDetail(async () => ({
		data: {
			chainId: 1,
			address: VAULT,
			name: "Earn",
			symbol: "eEarn",
			decimals: 18,
			asset: {
				address: ASSET,
				decimals: 6,
			},
			totalAssets: "0",
			totalShares: "0",
			supplyApy: null,
			governance: {
				owner: "0x0000000000000000000000000000000000000005",
				creator: "0x0000000000000000000000000000000000000006",
				curator: "0x0000000000000000000000000000000000000007",
				guardian: "0x0000000000000000000000000000000000000008",
				feeReceiver: "0x0000000000000000000000000000000000000009",
				timelock: 0,
			},
			strategies: [
				{
					address: STRATEGY,
					inWithdrawQueue: true,
					withdrawQueueIndex: 0,
					allocatedAssets: "0",
					availableAssets: "0",
					allocationCap: {
						current: "0",
						pending: "0",
					},
				},
				{
					address: NON_WITHDRAW_QUEUE_STRATEGY,
					inWithdrawQueue: false,
					allocatedAssets: "1",
					availableAssets: "1",
					allocationCap: {
						current: "1",
						pending: "0",
					},
				},
			],
			snapshotTimestamp: "1970-01-01T00:00:01.000Z",
		},
	}));

	const fetched = await adapter.fetchVaults(1, [VAULT]);
	const [vault] = fetched.result;

	assert.equal(fetched.result.length, 1);
	assert.ok(vault);
	assert.deepEqual(
		vault.strategies.map((strategy) => strategy.address),
		[STRATEGY, NON_WITHDRAW_QUEUE_STRATEGY],
	);
	assert.deepEqual(vault.withdrawQueue, [STRATEGY]);
	assert.deepEqual(defaultAppliedPaths(fetched.errors), []);
});
