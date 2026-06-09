import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
	decodeFunctionData,
	encodeFunctionData,
	getAddress,
	type Abi,
} from "viem";
import { estimateContractGas } from "viem/actions";
import { Account } from "../src/entities/Account.js";
import { accountLensAbi } from "../src/services/accountService/adapters/accountOnchainAdapter/abis/accountLensAbi.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../src/services/executionService/executionServiceTypes.js";
import { getSubAccountAddress } from "../src/utils/subAccounts.js";
import { VaultType } from "../src/utils/types.js";

vi.mock("viem/actions", () => ({
	estimateContractGas: vi.fn(),
}));

const ACCOUNT = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN = "0x00000000000000000000000000000000000000bb" as const;
const SPENDER = "0x00000000000000000000000000000000000000cc" as const;
const EVC = "0x00000000000000000000000000000000000000dd" as const;
const TARGET = "0x00000000000000000000000000000000000000ee" as const;
const ACCOUNT_LENS = "0x0000000000000000000000000000000000000013" as const;
const VAULT_LENS = "0x0000000000000000000000000000000000000014" as const;
const EULER_EARN_LENS = "0x0000000000000000000000000000000000000015" as const;
const VERIFIER = "0x0000000000000000000000000000000000000016" as const;
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
						accountLens: ACCOUNT_LENS,
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

async function simulateAndCollectVaultAccountReads(
	plan: TransactionPlan,
	vaultTypes: Record<string, VaultType> = {
		[getAddress(TARGET)]: VaultType.EVault,
	},
): Promise<Set<string>> {
	const simulateContract = vi.fn(
		async ({ args }: { args: readonly [EVCBatchItem[]] }) => {
			const fullBatch = args[0];
			return {
				result: [
					fullBatch.map((item) => ({
						success:
							getAddress(item.targetContract) === getAddress(TARGET) ||
							getAddress(item.targetContract) === getAddress(VERIFIER),
						result: "0x",
					})),
					[],
					[],
				],
			};
		},
	);
	const provider = {
		simulateContract,
		multicall: vi.fn(async () => []),
		readContract: vi.fn(async () => {
			throw new Error("asset unavailable");
		}),
	};
	const service = new ExecutionService(
		{
			getDeployment: () => ({
				addresses: {
					coreAddrs: {
						evc: EVC,
						permit2: "0x0000000000000000000000000000000000000012",
					},
					lensAddrs: {
						accountLens: ACCOUNT_LENS,
						vaultLens: VAULT_LENS,
						eulerEarnVaultLens: EULER_EARN_LENS,
					},
				},
			}),
		} as never,
		undefined,
		{ getProvider: () => provider } as never,
		{
			fetchVaultTypes: async () => vaultTypes,
		} as never,
	);

	await service.simulateTransactionPlan(1, CHECKSUM_ACCOUNT, plan, {
		stateOverrides: false,
	});

	const fullBatch = simulateContract.mock.calls[0]?.[0].args[0] ?? [];
	const vaultAccountReads = new Set<string>();
	for (const item of fullBatch) {
		if (getAddress(item.targetContract) !== getAddress(ACCOUNT_LENS)) continue;
		const decoded = decodeFunctionData({
			abi: accountLensAbi,
			data: item.data,
		});
		if (decoded.functionName !== "getVaultAccountInfo") continue;
		const [subAccount, vault] = decoded.args as [string, string];
		vaultAccountReads.add(`${getAddress(subAccount)}:${getAddress(vault)}`);
	}
	return vaultAccountReads;
}

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
			items: [{ type: "operation", name: "test", items: [batchItem] }],
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

test("simulateTransactionPlan rejects CoW swap plans", async () => {
	const service = createExecutionService();
	const plan: TransactionPlan = [
		{
			type: "cowSwap",
			kind: "openPosition",
			chainId: 1,
			params: {},
		},
	];

	await assert.rejects(
		service.simulateTransactionPlan(1, ACCOUNT, plan),
		/does not support CoW swap plans/,
	);
});

test("estimateGasForTransactionPlan rejects CoW swap plans", async () => {
	const service = createExecutionService();
	const plan: TransactionPlan = [
		{
			type: "cowSwap",
			kind: "swapCollateral",
			chainId: 1,
			params: {},
		},
	];

	await assert.rejects(
		service.estimateGasForTransactionPlan(1, ACCOUNT, plan, {
			stateOverrides: false,
		}),
		/does not support CoW swap plans/,
	);
});

test("estimateGasForTransactionPlan processes plugins and accepts Account entities", async () => {
	const service = createExecutionService();
	const account = new Account({
		chainId: 1,
		owner: CHECKSUM_ACCOUNT,
		isLockdownMode: false,
		isPermitDisabledMode: false,
		subAccounts: {},
	});
	const pluginPlan: TransactionPlan = [
		{
			type: "contractCall",
			chainId: 1,
			to: TARGET,
			abi: testAbi,
			functionName: "doThing",
			args: [9n],
			value: 4n,
		},
	];
	let processorAccount: unknown;
	let processorChainId: number | undefined;
	service.setPluginProcessor(async (_plan, receivedAccount, receivedChainId) => {
		processorAccount = receivedAccount;
		processorChainId = receivedChainId;
		return pluginPlan;
	});
	vi.mocked(estimateContractGas).mockResolvedValueOnce(17n);

	const estimatedGas = await service.estimateGasForTransactionPlan(
		1,
		account,
		[],
		{ stateOverrides: false },
	);

	assert.equal(estimatedGas, 17n);
	assert.equal(processorAccount, account);
	assert.equal(processorChainId, 1);
	const [, estimate] = vi.mocked(estimateContractGas).mock.calls[0]!;
	assert.equal(estimate.account, CHECKSUM_ACCOUNT);
	assert.equal(estimate.address, TARGET);
	assert.deepEqual(estimate.args, [9n]);
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
								permit2Nonce: 0,
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

test("simulateTransactionPlan reads both sides of transferFromMax cleanup", async () => {
	const fromSubAccount = getSubAccountAddress(CHECKSUM_ACCOUNT, 1);
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					targetContract: TARGET,
					onBehalfOfAccount: fromSubAccount,
					value: 0n,
					data: encodeFunctionData({
						abi: eVaultAbi,
						functionName: "transferFromMax",
						args: [fromSubAccount, CHECKSUM_ACCOUNT],
					}),
				},
			],
		},
	];

	const vaultAccountReads = await simulateAndCollectVaultAccountReads(plan);

	assert.ok(
		vaultAccountReads.has(`${fromSubAccount}:${getAddress(TARGET)}`),
	);
	assert.ok(
		vaultAccountReads.has(`${CHECKSUM_ACCOUNT}:${getAddress(TARGET)}`),
	);
});

test("simulateTransactionPlan reads EVC account-mode candidates", async () => {
	const subAccount = getSubAccountAddress(CHECKSUM_ACCOUNT, 1);
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					targetContract: EVC,
					onBehalfOfAccount: ACCOUNT,
					value: 0n,
					data: encodeFunctionData({
						abi: ethereumVaultConnectorAbi,
						functionName: "enableCollateral",
						args: [subAccount, TARGET],
					}),
				},
				{
					targetContract: EVC,
					onBehalfOfAccount: ACCOUNT,
					value: 0n,
					data: encodeFunctionData({
						abi: ethereumVaultConnectorAbi,
						functionName: "enableController",
						args: [subAccount, TOKEN],
					}),
				},
			],
		},
	];

	const vaultAccountReads = await simulateAndCollectVaultAccountReads(plan, {
		[getAddress(TARGET)]: VaultType.EVault,
		[getAddress(TOKEN)]: VaultType.EVault,
	});

	assert.ok(vaultAccountReads.has(`${subAccount}:${getAddress(TARGET)}`));
	assert.ok(vaultAccountReads.has(`${subAccount}:${getAddress(TOKEN)}`));
});

test("simulateTransactionPlan reads liquidation and pull-debt candidates", async () => {
	const liquidator = getSubAccountAddress(CHECKSUM_ACCOUNT, 1);
	const violator = getSubAccountAddress(CHECKSUM_ACCOUNT, 2);
	const debtFrom = getSubAccountAddress(CHECKSUM_ACCOUNT, 3);
	const debtTo = getSubAccountAddress(CHECKSUM_ACCOUNT, 4);
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					targetContract: TARGET,
					onBehalfOfAccount: liquidator,
					value: 0n,
					data: encodeFunctionData({
						abi: eVaultAbi,
						functionName: "liquidate",
						args: [violator, TOKEN, 100n, 1n],
					}),
				},
				{
					targetContract: TARGET,
					onBehalfOfAccount: debtTo,
					value: 0n,
					data: encodeFunctionData({
						abi: eVaultAbi,
						functionName: "pullDebt",
						args: [50n, debtFrom],
					}),
				},
			],
		},
	];

	const vaultAccountReads = await simulateAndCollectVaultAccountReads(plan, {
		[getAddress(TARGET)]: VaultType.EVault,
		[getAddress(TOKEN)]: VaultType.EVault,
	});

	assert.ok(vaultAccountReads.has(`${violator}:${getAddress(TARGET)}`));
	assert.ok(vaultAccountReads.has(`${violator}:${getAddress(TOKEN)}`));
	assert.ok(vaultAccountReads.has(`${liquidator}:${getAddress(TOKEN)}`));
	assert.ok(vaultAccountReads.has(`${debtFrom}:${getAddress(TARGET)}`));
	assert.ok(vaultAccountReads.has(`${debtTo}:${getAddress(TARGET)}`));
});

test("simulateTransactionPlan reads swap-verifier account candidates", async () => {
	const subAccount = getSubAccountAddress(CHECKSUM_ACCOUNT, 1);
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					targetContract: VERIFIER,
					onBehalfOfAccount: subAccount,
					value: 0n,
					data: encodeFunctionData({
						abi: swapVerifierAbi,
						functionName: "verifyAmountMinAndSkim",
						args: [TARGET, subAccount, 100n, 0n],
					}),
				},
				{
					targetContract: VERIFIER,
					onBehalfOfAccount: subAccount,
					value: 0n,
					data: encodeFunctionData({
						abi: swapVerifierAbi,
						functionName: "verifyDebtMax",
						args: [TOKEN, subAccount, 100n, 0n],
					}),
				},
			],
		},
	];

	const vaultAccountReads = await simulateAndCollectVaultAccountReads(plan, {
		[getAddress(TARGET)]: VaultType.EVault,
		[getAddress(TOKEN)]: VaultType.EVault,
	});

	assert.ok(vaultAccountReads.has(`${subAccount}:${getAddress(TARGET)}`));
	assert.ok(vaultAccountReads.has(`${subAccount}:${getAddress(TOKEN)}`));
});
