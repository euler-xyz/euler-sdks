import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { getAddress } from "viem";
import { FeeFlowService } from "../src/services/feeFlowService/feeFlowService.js";

const CONTROLLER = getAddress("0x0000000000000000000000000000000000000011");
const UTIL = getAddress("0x0000000000000000000000000000000000000012");
const PAYMENT_TOKEN = getAddress(
	"0x0000000000000000000000000000000000000013",
);
const PAYMENT_RECEIVER = getAddress(
	"0x0000000000000000000000000000000000000014",
);
const ACCOUNT = getAddress("0x0000000000000000000000000000000000000015");
const VAULT = getAddress("0x0000000000000000000000000000000000000016");
const OTHER_RECEIVER = getAddress(
	"0x0000000000000000000000000000000000000017",
);

function createService(options: {
	epochId?: number;
	protocolFeeReceiver?: `0x${string}`;
	protocolFeeShare?: bigint;
	accumulatedFeesAssets?: bigint;
	heldShares?: bigint;
} = {}) {
	const {
		epochId = 7,
		protocolFeeReceiver = CONTROLLER,
		protocolFeeShare = 1_000n,
		accumulatedFeesAssets = 100n,
		heldShares = 0n,
	} = options;
	const multicall = vi.fn(
		async ({ contracts }: { contracts: Array<{ functionName: string }> }) => {
			if (contracts.length === 7) {
				return [
					{ locked: 0, epochId, initPrice: 1_000n, startTime: 100 },
					500n,
					PAYMENT_TOKEN,
					PAYMENT_RECEIVER,
					3_600n,
					9_000n,
					10n,
				];
			}

			return contracts.map((contract) => {
				switch (contract.functionName) {
					case "protocolFeeReceiver":
						return protocolFeeReceiver;
					case "protocolFeeShare":
						return protocolFeeShare;
					case "accumulatedFeesAssets":
						return accumulatedFeesAssets;
					case "balanceOf":
						return heldShares;
					default:
						throw new Error(`unexpected function ${contract.functionName}`);
				}
			});
		},
	);
	const service = new FeeFlowService({
		feeFlowControllerAddress: CONTROLLER,
		feeFlowControllerUtilAddress: UTIL,
	});
	service.setProviderService({
		getProvider: () => ({ multicall }),
	} as never);

	return { service, multicall };
}

test("FeeFlow buy planning binds the displayed epoch and fresh inventory", async () => {
	const { service } = createService();
	const plan = await service.buildBuyPlan({
		chainId: 1,
		account: ACCOUNT,
		vaults: [VAULT, VAULT],
		expectedEpochId: 7,
	});

	assert.equal(plan.length, 2);
	assert.deepEqual(plan[0], {
		type: "requiredApproval",
		token: PAYMENT_TOKEN,
		owner: ACCOUNT,
		spender: UTIL,
		amount: 500n,
	});
	assert.equal(plan[1]?.type, "contractCall");
	if (plan[1]?.type !== "contractCall") throw new Error("expected contractCall");
	assert.equal(plan[1].functionName, "buy");
	assert.deepEqual(plan[1].args.slice(0, 3), [[VAULT], ACCOUNT, 7n]);
});

test("FeeFlow buy planning rejects a changed epoch before using stale selections", async () => {
	const { service, multicall } = createService({ epochId: 8 });

	await assert.rejects(
		() =>
			service.buildBuyPlan({
				chainId: 1,
				account: ACCOUNT,
				vaults: [VAULT],
				expectedEpochId: 7,
			}),
		/FeeFlow epoch changed from 7 to 8/,
	);
	assert.equal(multicall.mock.calls.length, 1);
});

test("FeeFlow buy planning rejects empty selected-vault inventory", async () => {
	const { service } = createService({
		protocolFeeShare: 0n,
		accumulatedFeesAssets: 0n,
		heldShares: 0n,
	});

	await assert.rejects(
		() =>
			service.buildBuyPlan({
				chainId: 1,
				account: ACCOUNT,
				vaults: [VAULT],
				expectedEpochId: 7,
			}),
		new RegExp(`FeeFlow inventory is stale or empty for: ${VAULT}`),
	);
});

test("FeeFlow buy planning rejects vaults whose protocol receiver changed", async () => {
	const { service } = createService({
		protocolFeeReceiver: OTHER_RECEIVER,
		heldShares: 100n,
	});

	await assert.rejects(
		() =>
			service.buildBuyPlan({
				chainId: 1,
				account: ACCOUNT,
				vaults: [VAULT],
				expectedEpochId: 7,
			}),
		/FeeFlow inventory is stale or empty/,
	);
});
