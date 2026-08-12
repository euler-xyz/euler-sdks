import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { getAddress } from "viem";
import {
	FeeFlowService,
	FEE_FLOW_BUY_UNAVAILABLE_ERROR,
} from "../src/services/feeFlowService/feeFlowService.js";

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

test("FeeFlow buy planning fails closed without atomic minimum-output enforcement", async () => {
	const { service } = createService();
	await assert.rejects(
		() =>
			service.buildBuyPlan({
				chainId: 1,
				account: ACCOUNT,
				vaults: [VAULT],
				expectedEpochId: 7,
			}),
		new RegExp(FEE_FLOW_BUY_UNAVAILABLE_ERROR),
	);
});

test("FeeFlow buy planning accepts held shares after the protocol receiver changed", async () => {
	const { service } = createService({
		protocolFeeReceiver: OTHER_RECEIVER,
		heldShares: 100n,
	});

	const inventory = await service.fetchBuyInventory(1, [VAULT]);
	assert.equal(inventory[0]?.eligible, false);
	assert.equal(inventory[0]?.hasInventory, true);
});

test("FeeFlow buy planning rejects unconverted fees after the protocol receiver changed", async () => {
	const { service } = createService({
		protocolFeeReceiver: OTHER_RECEIVER,
		heldShares: 0n,
	});

	const inventory = await service.fetchBuyInventory(1, [VAULT]);
	assert.equal(inventory[0]?.hasInventory, false);
});
