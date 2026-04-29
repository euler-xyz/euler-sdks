import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { getAddress, type Abi, type StateOverride } from "viem";
import { estimateContractGas } from "viem/actions";
import { SimulationService } from "../src/services/simulationService/simulationService.js";
import type { TransactionPlan } from "../src/services/executionService/executionServiceTypes.js";

vi.mock("viem/actions", () => ({
	estimateContractGas: vi.fn(),
}));

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN = "0x00000000000000000000000000000000000000bb" as const;
const SPENDER = "0x00000000000000000000000000000000000000cc" as const;
const EVC = "0x00000000000000000000000000000000000000dd" as const;
const TARGET = "0x00000000000000000000000000000000000000ee" as const;
const CHECKSUM_ACCOUNT = getAddress(ACCOUNT);

const testAbi = [
	{
		type: "function",
		name: "doThing",
		stateMutability: "payable",
		inputs: [{ name: "amount", type: "uint256" }],
		outputs: [],
	},
] as const satisfies Abi;

function createSimulationService() {
	const provider = { id: "provider" };
	return new SimulationService(
		{
			getProvider: () => provider,
		} as never,
		{
			getDeployment: () => ({
				addresses: {
					coreAddrs: {
						evc: EVC,
						permit2: "0x0000000000000000000000000000000000000012",
					},
				},
			}),
		} as never,
		{} as never,
		{} as never,
	);
}

beforeEach(() => {
	vi.mocked(estimateContractGas).mockReset();
});

test("estimateGasForTransactionPlan estimates executable plan items with shared state override", async () => {
	const service = createSimulationService();
	const stateOverride = [
		{ address: ACCOUNT, balance: 1_000_000n },
	] satisfies StateOverride;
	service.deriveStateOverrides = vi.fn(async () => stateOverride);
	vi.mocked(estimateContractGas)
		.mockResolvedValueOnce(11n)
		.mockResolvedValueOnce(13n);

	const batchItem = {
		targetContract: TARGET,
		onBehalfOfAccount: ACCOUNT,
		value: 2n,
		data: "0x1234",
	} as const;
	const plan: TransactionPlan = [
		{
			type: "requiredApproval",
			token: TOKEN,
			owner: ACCOUNT,
			spender: SPENDER,
			amount: 100n,
		},
		{
			type: "evcBatch",
			items: [batchItem],
		},
		{
			type: "contractCall",
			chainId: 1,
			to: TARGET,
			abi: testAbi,
			functionName: "doThing",
			args: [7n],
			value: 3n,
		},
	];

	const estimatedGas = await service.estimateGasForTransactionPlan(
		1,
		ACCOUNT,
		plan,
	);

	assert.equal(estimatedGas, 24n);
	assert.equal(vi.mocked(service.deriveStateOverrides).mock.calls.length, 1);
	assert.equal(vi.mocked(estimateContractGas).mock.calls.length, 2);

	const [, evcEstimate] = vi.mocked(estimateContractGas).mock.calls[0]!;
	assert.equal(evcEstimate.account, CHECKSUM_ACCOUNT);
	assert.equal(evcEstimate.address, EVC);
	assert.equal(evcEstimate.functionName, "batch");
	assert.deepEqual(evcEstimate.args, [[batchItem]]);
	assert.equal(evcEstimate.value, 2n);
	assert.equal(evcEstimate.stateOverride, stateOverride);

	const [, contractEstimate] = vi.mocked(estimateContractGas).mock.calls[1]!;
	assert.equal(contractEstimate.account, CHECKSUM_ACCOUNT);
	assert.equal(contractEstimate.address, TARGET);
	assert.equal(contractEstimate.functionName, "doThing");
	assert.deepEqual(contractEstimate.args, [7n]);
	assert.equal(contractEstimate.value, 3n);
	assert.equal(contractEstimate.stateOverride, stateOverride);
});

test("estimateGasForTransactionPlan propagates viem estimation errors", async () => {
	const service = createSimulationService();
	service.deriveStateOverrides = vi.fn(async () => []);
	const expected = new Error("execution reverted");
	vi.mocked(estimateContractGas).mockRejectedValueOnce(expected);

	const plan: TransactionPlan = [
		{
			type: "contractCall",
			chainId: 1,
			to: TARGET,
			abi: testAbi,
			functionName: "doThing",
			args: [7n],
			value: 0n,
		},
	];

	await assert.rejects(
		() => service.estimateGasForTransactionPlan(1, ACCOUNT, plan),
		expected,
	);
});
