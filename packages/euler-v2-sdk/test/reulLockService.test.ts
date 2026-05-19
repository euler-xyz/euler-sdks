import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, type Address } from "viem";

import {
	REULLockService,
} from "../src/services/reulLockService/index.js";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";

const ACCOUNT = getAddress("0x00000000000000000000000000000000000000aa");
const REUL = getAddress("0x00000000000000000000000000000000000000bb");
const OVERRIDE_REUL = getAddress(
	"0x00000000000000000000000000000000000000cc",
);

function createDeploymentService(rEulAddress: Address | null = REUL) {
	return {
		getDeploymentChainIds: () => [1],
		getDeployment: () => ({
			chainId: 1,
			addresses: {
				coreAddrs: {},
				tokenAddrs: rEulAddress ? { rEUL: rEulAddress } : {},
			},
		}),
		addDeployment: () => undefined,
	};
}

test("fetchLocks reads locked rEUL amounts and per-lock withdraw amounts", async () => {
	const calls: { functionName: string; args: readonly unknown[] }[] = [];
	const providerService = {
		getProvider: () => ({
			readContract: async ({ functionName, args }: any) => {
				calls.push({ functionName, args });
				if (functionName === "getLockedAmounts") {
					return [
						[100n, 200n],
						[1_000n, 2_000n],
					];
				}
				if (functionName === "getWithdrawAmountsByLockTimestamp") {
					const timestamp = args[1] as bigint;
					return timestamp === 100n ? [900n, 100n] : [1_500n, 500n];
				}
				throw new Error(`unexpected function ${functionName}`);
			},
		}),
		getSupportedChainIds: () => [1],
	};
	const service = new REULLockService(
		providerService as never,
		createDeploymentService() as never,
	);

	const locks = await service.fetchLocks({
		chainId: 1,
		account: ACCOUNT,
		batchSize: 1,
	});

	assert.deepEqual(locks, [
		{
			timestamp: 100n,
			amount: 1_000n,
			unlockableAmount: 900n,
			amountToBeBurned: 100n,
		},
		{
			timestamp: 200n,
			amount: 2_000n,
			unlockableAmount: 1_500n,
			amountToBeBurned: 500n,
		},
	]);
	assert.deepEqual(
		calls.map((call) => [call.functionName, call.args]),
		[
			["getLockedAmounts", [ACCOUNT]],
			["getWithdrawAmountsByLockTimestamp", [ACCOUNT, 100n]],
			["getWithdrawAmountsByLockTimestamp", [ACCOUNT, 200n]],
		],
	);
});

test("buildUnlockPlan creates the rEUL unlock contract call", () => {
	const service = new REULLockService(
		{ getProvider: () => undefined } as never,
		createDeploymentService() as never,
	);

	const plan = service.buildUnlockPlan({
		chainId: 1,
		account: ACCOUNT,
		lockTimestamp: 123n,
	});

	assert.equal(plan.length, 1);
	assert.equal(plan[0]?.type, "contractCall");
	if (plan[0]?.type !== "contractCall") {
		throw new Error("expected contractCall");
	}

	assert.equal(plan[0].chainId, 1);
	assert.equal(plan[0].to, REUL);
	assert.equal(plan[0].value, 0n);
	assert.equal(plan[0].functionName, "withdrawToByLockTimestamp");
	assert.deepEqual(plan[0].args, [ACCOUNT, 123n, true]);
});

test("buildUnlockPlan supports explicit rEUL address and remainder-loss override", () => {
	const service = new REULLockService(
		{ getProvider: () => undefined } as never,
		createDeploymentService(null) as never,
	);

	const plan = service.buildUnlockPlan({
		chainId: 1,
		account: ACCOUNT,
		lockTimestamp: 456n,
		rEulAddress: OVERRIDE_REUL,
		allowRemainderLoss: false,
	});

	assert.equal(plan[0]?.type, "contractCall");
	if (plan[0]?.type !== "contractCall") {
		throw new Error("expected contractCall");
	}
	assert.equal(plan[0].to, OVERRIDE_REUL);
	assert.deepEqual(plan[0].args, [ACCOUNT, 456n, false]);
});

test("rEUL address is required when deployment metadata does not provide it", () => {
	const service = new REULLockService(
		{ getProvider: () => undefined } as never,
		createDeploymentService(null) as never,
	);

	assert.throws(
		() =>
			service.buildUnlockPlan({
				chainId: 1,
				account: ACCOUNT,
				lockTimestamp: 123n,
			}),
		/rEUL token address not configured/,
	);
});

test("buildEulerSDK exposes reulLockService and allows overrides", async () => {
	const override = new REULLockService(
		{ getProvider: () => undefined } as never,
		createDeploymentService() as never,
	);

	const sdk = await buildEulerSDK({
		rpcUrls: {},
		servicesOverrides: {
			deploymentService: createDeploymentService() as never,
			providerService: {
				getProvider: () => undefined,
				getSupportedChainIds: () => [1],
			} as never,
			reulLockService: override,
		},
	});

	assert.equal(sdk.reulLockService, override);
});
