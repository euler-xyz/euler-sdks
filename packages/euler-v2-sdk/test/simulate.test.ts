import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { getAddress, type Abi } from "viem";
import { estimateContractGas } from "viem/actions";
import { ExecutionService } from "../src/services/executionService/executionService.js";
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

function createExecutionService() {
	const provider = { id: "provider" };
	return new ExecutionService(
		{
			getDeployment: () => ({
				addresses: {
					coreAddrs: {
						evc: EVC,
						permit2: "0x0000000000000000000000000000000000000012",
					},
					lensAddrs: {
						accountLens: "0x0000000000000000000000000000000000000013",
						vaultLens: "0x0000000000000000000000000000000000000014",
						eulerEarnVaultLens:
							"0x0000000000000000000000000000000000000015",
					},
				},
			}),
		} as never,
		undefined,
		{
			getProvider: () => provider,
		} as never,
		{} as never,
	);
}

beforeEach(() => {
	vi.mocked(estimateContractGas).mockReset();
});

test("estimateGasForTransactionPlan estimates executable plan items", async () => {
	const service = createExecutionService();
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
		{ stateOverrides: false },
	);

	assert.equal(estimatedGas, 24n);
	assert.equal(vi.mocked(estimateContractGas).mock.calls.length, 2);

	const [, evcEstimate] = vi.mocked(estimateContractGas).mock.calls[0]!;
	assert.equal(evcEstimate.account, CHECKSUM_ACCOUNT);
	assert.equal(evcEstimate.address, EVC);
	assert.equal(evcEstimate.functionName, "batch");
	assert.deepEqual(evcEstimate.args, [[batchItem]]);
	assert.equal(evcEstimate.value, 2n);
	assert.equal(evcEstimate.stateOverride, undefined);

	const [, contractEstimate] = vi.mocked(estimateContractGas).mock.calls[1]!;
	assert.equal(contractEstimate.account, CHECKSUM_ACCOUNT);
	assert.equal(contractEstimate.address, TARGET);
	assert.equal(contractEstimate.functionName, "doThing");
	assert.deepEqual(contractEstimate.args, [7n]);
	assert.equal(contractEstimate.value, 3n);
	assert.equal(contractEstimate.stateOverride, undefined);
});

test("estimateGasForTransactionPlan propagates viem estimation errors", async () => {
	const service = createExecutionService();
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
		() =>
			service.estimateGasForTransactionPlan(1, ACCOUNT, plan, {
				stateOverrides: false,
			}),
		expected,
	);
});

test("simulation helpers fail clearly when provider service is not configured", async () => {
	const service = new ExecutionService({
		getDeployment: () => ({
			addresses: {
				coreAddrs: {
					evc: EVC,
					permit2: "0x0000000000000000000000000000000000000012",
				},
			},
		}),
	} as never);

	await assert.rejects(
		() => service.estimateGasForTransactionPlan(1, ACCOUNT, []),
		/providerService/,
	);
});

test("simulateTransactionPlan reports direct allowance deficits from spender allowance", async () => {
	const service = new ExecutionService(
		{
			getDeployment: () => ({
				addresses: {
					coreAddrs: {
						evc: EVC,
						permit2: "0x0000000000000000000000000000000000000012",
					},
					lensAddrs: {
						accountLens: "0x0000000000000000000000000000000000000013",
						vaultLens: "0x0000000000000000000000000000000000000014",
						eulerEarnVaultLens:
							"0x0000000000000000000000000000000000000015",
					},
				},
			}),
		} as never,
		{
			fetchWallet: async () => ({
				result: {
					getAsset: () => ({
						balance: 1_000n,
						allowances: {
							[SPENDER]: {
								assetForVault: 40n,
								assetForPermit2: 95n,
								assetForVaultInPermit2: 1_000n,
								permit2ExpirationTime: Math.floor(Date.now() / 1000) + 60,
							},
						},
					}),
				},
			}),
		} as never,
		{
			getProvider: () => ({
				simulateContract: async () => {
					throw new Error("stop after diagnostics");
				},
			}),
		} as never,
		{
			fetchVaultTypes: async () => ({}),
		} as never,
	);
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
			items: [
				{
					targetContract: TARGET,
					onBehalfOfAccount: ACCOUNT,
					value: 0n,
					data: "0x1234",
				},
			],
		},
	];

	const result = await service.simulateTransactionPlan(1, ACCOUNT, plan, {
		stateOverrides: false,
	});

	assert.deepEqual(result.insufficientDirectAllowances, [
		{ token: TOKEN, amount: 60n },
	]);
	assert.equal(result.insufficientPermit2Allowances, undefined);
});
