import assert from "node:assert/strict";
import { test } from "vitest";
import { type Address, zeroAddress } from "viem";

import { EulerEarnOnchainAdapter } from "../src/services/vaults/eulerEarnService/adapters/eulerEarnOnchainAdapter.js";
import type { EulerEarnVaultInfoFull } from "../src/services/vaults/eulerEarnService/adapters/eulerEarnLensTypes.js";

const CHAIN_ID = 1;
const VAULT = "0x0000000000000000000000000000000000000abc" as Address;
const ASSET = "0x0000000000000000000000000000000000000def" as Address;
const LENS = "0x0000000000000000000000000000000000000123" as Address;

function makeVaultInfo(): EulerEarnVaultInfoFull {
	return {
		timestamp: 1_010n,
		vault: VAULT,
		vaultName: "Earn",
		vaultSymbol: "eEarn",
		vaultDecimals: 18n,
		asset: ASSET,
		assetName: "Asset",
		assetSymbol: "AST",
		assetDecimals: 18n,
		totalShares: 1_000_000n,
		totalAssets: 1_000_000n,
		lostAssets: 0n,
		availableAssets: 1_000_000n,
		timelock: 0n,
		performanceFee: 0n,
		feeReceiver: zeroAddress,
		owner: zeroAddress,
		creator: zeroAddress,
		curator: zeroAddress,
		guardian: zeroAddress,
		evc: zeroAddress,
		permit2: zeroAddress,
		pendingTimelock: 0n,
		pendingTimelockValidAt: 0n,
		pendingGuardian: zeroAddress,
		pendingGuardianValidAt: 0n,
		supplyQueue: [],
		strategies: [],
	};
}

test("EulerEarn onchain adapter samples the latest block at least 60 seconds back", async () => {
	const provider = {};
	const adapter = new EulerEarnOnchainAdapter(
		{ getProvider: () => provider } as never,
		{
			getDeployment: () => ({
				addresses: { lensAddrs: { eulerEarnVaultLens: LENS } },
			}),
		} as never,
	);
	const rateReadBlocks: bigint[] = [];

	adapter.setQueryBlockNumber(async () => 106n);
	adapter.setQueryBlock(async (_provider, blockNumber) => ({
		timestamp: BigInt(Number(blockNumber) * 10),
	}));
	adapter.setQueryEulerEarnVaultInfoFull(async () => makeVaultInfo());
	adapter.setQueryEulerEarnConvertToAssets(
		async (_provider, _vault, _shares, blockNumber) => {
			assert.ok(blockNumber !== undefined);
			rateReadBlocks.push(blockNumber);
			return blockNumber === 101n ? 1_000_001n : 1_000_000n;
		},
	);

	const fetched = await adapter.fetchVaults(CHAIN_ID, [VAULT]);
	const vault = fetched.result[0];

	assert.deepEqual(fetched.errors, []);
	assert.deepEqual(rateReadBlocks, [101n, 95n]);
	assert.equal(typeof vault?.supplyApy, "number");
	assert.ok((vault?.supplyApy ?? 0) > 0);
});
