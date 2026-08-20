import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
	decodeFunctionData,
	encodeFunctionData,
	encodeFunctionResult,
	getAddress,
	type Address,
	type Abi,
} from "viem";
import { estimateContractGas } from "viem/actions";
import { Account } from "../src/entities/Account.js";
import type { IABIService } from "../src/services/abiService/index.js";
import { accountLensAbi } from "../src/services/accountService/adapters/accountOnchainAdapter/abis/accountLensAbi.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "../src/services/executionService/abis/eVaultAbi.js";
import { swapVerifierAbi } from "../src/services/executionService/abis/swapVerifierAbi.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import { extractBalanceRequirements } from "../src/services/executionService/simulate.js";
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
const UTILS_LENS = "0x0000000000000000000000000000000000000017" as const;
const SECURITIZE_VAULT = "0x0000000000000000000000000000000000000018" as const;
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

const erc20BalanceAbi = [
	{
		type: "function",
		name: "balanceOf",
		stateMutability: "view",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const satisfies Abi;

const merklClaimAbi = [
	{
		type: "function",
		name: "claim",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "users", type: "address[]" },
			{ name: "tokens", type: "address[]" },
			{ name: "amounts", type: "uint256[]" },
			{ name: "proofs", type: "bytes32[][]" },
		],
		outputs: [],
	},
] as const satisfies Abi;

const reulLockAbi = [
	{
		type: "function",
		name: "withdrawToByLockTimestamp",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "account", type: "address" },
			{ name: "lockTimestamp", type: "uint256" },
			{ name: "allowRemainderLoss", type: "bool" },
		],
		outputs: [{ name: "success", type: "bool" }],
	},
] as const satisfies Abi;

function createExecutionService(
	provider: object = { id: "provider" },
	vaultMetaService: object = {},
) {
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
						utilsLens: UTILS_LENS,
					},
				},
			}),
		} as never,
		undefined,
		{
			getProvider: () => provider,
		} as never,
		vaultMetaService as never,
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
	abiService?: IABIService,
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
						utilsLens: UTILS_LENS,
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
	if (abiService) service.setABIService(abiService);

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

async function simulateAndCollectWalletBalanceReads(
	plan: TransactionPlan,
	options: {
		eulToken?: Address;
		readUnderlying?: Address;
	} = {},
): Promise<Set<string>> {
	const simulateContract = vi.fn(
		async ({ args }: { args: readonly [EVCBatchItem[]] }) => {
			const fullBatch = args[0];
			return {
				result: [
					fullBatch.map((item) => {
						try {
							const decoded = decodeFunctionData({
								abi: erc20BalanceAbi,
								data: item.data,
							});
							if (decoded.functionName === "balanceOf") {
								return {
									success: true,
									result: encodeFunctionResult({
										abi: erc20BalanceAbi,
										functionName: "balanceOf",
										result: 0n,
									}),
								};
							}
						} catch {}
						return { success: false, result: "0x" };
					}),
					[],
					[],
				],
			};
		},
	);
	const provider = {
		simulateContract,
		multicall: vi.fn(async () => []),
		readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
			if (functionName === "underlying" && options.readUnderlying) {
				return options.readUnderlying;
			}
			throw new Error("read unavailable");
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
						utilsLens: UTILS_LENS,
					},
					tokenAddrs: options.eulToken ? { EUL: options.eulToken } : {},
				},
			}),
		} as never,
		undefined,
		{ getProvider: () => provider } as never,
		{
			fetchVaultTypes: async () => ({}),
		} as never,
	);

	await service.simulateTransactionPlan(1, CHECKSUM_ACCOUNT, plan, {
		stateOverrides: false,
	});

	const fullBatch = simulateContract.mock.calls[0]?.[0].args[0] ?? [];
	const walletBalanceReads = new Set<string>();
	for (const item of fullBatch) {
		try {
			const decoded = decodeFunctionData({
				abi: erc20BalanceAbi,
				data: item.data,
			});
			if (decoded.functionName === "balanceOf") {
				walletBalanceReads.add(getAddress(item.targetContract));
			}
		} catch {}
	}
	return walletBalanceReads;
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

test("simulateTransactionPlan returns a non-simulatable result for a direct contract call", async () => {
	const simulateContract = vi.fn();
	const service = createExecutionService({ simulateContract });
	const plan: TransactionPlan = [
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

	const result = await service.simulateTransactionPlan(1, ACCOUNT, plan, {
			stateOverrides: false,
		});
	assert.deepEqual(result, {
		simulatedAccounts: [],
		simulatedVaults: [],
		canExecute: false,
	});
	assert.equal(simulateContract.mock.calls.length, 0);
});

test("simulateTransactionPlan simulates an independent direct call from the wallet", async () => {
	const simulateContract = vi.fn(async () => ({ result: undefined }));
	const service = createExecutionService({ simulateContract });
	const plan: TransactionPlan = [
		{
			type: "contractCall",
			chainId: 1,
			to: TARGET,
			abi: testAbi,
			functionName: "doThing",
			args: [7n],
			value: 3n,
			simulationMode: "independent",
		},
	];

	const result = await service.simulateTransactionPlan(1, ACCOUNT, plan, {
		stateOverrides: false,
	});
	assert.deepEqual(result, {
		simulatedAccounts: [],
		simulatedVaults: [],
		canExecute: true,
	});
	assert.equal(simulateContract.mock.calls.length, 1);
	assert.deepEqual(simulateContract.mock.calls[0]?.[0], {
		address: TARGET,
		abi: testAbi,
		functionName: "doThing",
		args: [7n],
		value: 3n,
		account: CHECKSUM_ACCOUNT,
		stateOverride: undefined,
	});
});

test("simulateTransactionPlan fails closed when an independent direct call reverts", async () => {
	const simulateContract = vi.fn(async () => {
		throw new Error("claim reverted");
	});
	const service = createExecutionService({ simulateContract });
	const plan: TransactionPlan = [
		{
			type: "contractCall",
			chainId: 1,
			to: TARGET,
			abi: testAbi,
			functionName: "doThing",
			args: [7n],
			value: 3n,
			simulationMode: "independent",
		},
	];

	const result = await service.simulateTransactionPlan(1, ACCOUNT, plan, {
		stateOverrides: false,
	});
	assert.equal(result.canExecute, false);
	assert.match(String(result.simulationError?.error), /claim reverted/);
});

test("simulateTransactionPlan rejects a mixed plan before simulating only its EVC batch", async () => {
	const simulateContract = vi.fn();
	const service = createExecutionService({ simulateContract });
	const plan: TransactionPlan = [
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

	await assert.rejects(
		service.simulateTransactionPlan(1, ACCOUNT, plan, {
			stateOverrides: false,
		}),
		/transaction plan item 1 \(contractCall\).*refusing to return a partial result/,
	);
	assert.equal(simulateContract.mock.calls.length, 0);
});

test("simulateTransactionPlan covers an independent direct call in a mixed plan", async () => {
	const simulateContract = vi.fn(async (request: {
		address: Address;
		functionName: string;
		args: readonly unknown[];
	}) => {
		if (getAddress(request.address) === getAddress(TARGET)) {
			return { result: undefined };
		}
		const fullBatch = request.args[0] as EVCBatchItem[];
		return {
			result: [
				fullBatch.map((item) => ({
					success:
						getAddress(item.targetContract) !== getAddress(ACCOUNT_LENS),
					result: "0x",
				})),
				[],
				[],
			],
		};
	});
	const service = createExecutionService(
		{ simulateContract },
		{ fetchVaultTypes: async () => ({}) },
	);
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					targetContract: EVC,
					onBehalfOfAccount: ACCOUNT,
					value: 0n,
					data: "0x1234",
				},
			],
		},
		{
			type: "contractCall",
			chainId: 1,
			to: TARGET,
			abi: testAbi,
			functionName: "doThing",
			args: [7n],
			value: 3n,
			simulationMode: "independent",
		},
	];

	const result = await service.simulateTransactionPlan(1, ACCOUNT, plan, {
		stateOverrides: false,
	});
	assert.equal(result.canExecute, true);
	assert.equal(simulateContract.mock.calls.length, 2);
	assert.equal(simulateContract.mock.calls[0]?.[0].functionName, "doThing");
	assert.equal(simulateContract.mock.calls[1]?.[0].functionName, "batchSimulation");
});

test("simulateTransactionPlan tracks operation wallet balance tokens", async () => {
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					type: "operation",
					name: "Claim rewards",
					walletBalanceTokens: [TOKEN],
					items: [
						{
							targetContract: TARGET,
							onBehalfOfAccount: ACCOUNT,
							value: 0n,
							data: encodeFunctionData({
								abi: testAbi,
								functionName: "doThing",
								args: [1n],
							}),
						},
					],
				},
			],
		},
	];

	const reads = await simulateAndCollectWalletBalanceReads(plan);

	assert.ok(reads.has(getAddress(TOKEN)));
});

test("simulateTransactionPlan tracks required approval wallet balance tokens", async () => {
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
					type: "operation",
					name: "depositWithSwapFromWallet",
					items: [
						{
							targetContract: TARGET,
							onBehalfOfAccount: ACCOUNT,
							value: 0n,
							data: encodeFunctionData({
								abi: testAbi,
								functionName: "doThing",
								args: [1n],
							}),
						},
					],
				},
			],
		},
	];

	const reads = await simulateAndCollectWalletBalanceReads(plan);

	assert.ok(reads.has(getAddress(TOKEN)));
});

test("simulateTransactionPlan nets required approval shortfalls from wallet balance layers", async () => {
	const layerBalances = [0n, 150n, 50n];
	let balanceReadIndex = 0;
	const simulateContract = vi.fn(
		async ({ args }: { args: readonly [EVCBatchItem[]] }) => {
			const fullBatch = args[0];
			return {
				result: [
					fullBatch.map((item) => {
						if (getAddress(item.targetContract) === getAddress(ACCOUNT_LENS)) {
							return { success: false, result: "0x" };
						}
						try {
							const decoded = decodeFunctionData({
								abi: erc20BalanceAbi,
								data: item.data,
							});
							if (
								decoded.functionName === "balanceOf" &&
								getAddress(item.targetContract) === getAddress(TOKEN)
							) {
								const balance =
									layerBalances[Math.min(balanceReadIndex, layerBalances.length - 1)]!;
								balanceReadIndex++;
								return {
									success: true,
									result: encodeFunctionResult({
										abi: erc20BalanceAbi,
										functionName: "balanceOf",
										result: balance,
									}),
								};
							}
						} catch {}
						return { success: true, result: "0x" };
					}),
					[],
					[],
				],
			};
		},
	);
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
						utilsLens: UTILS_LENS,
					},
				},
			}),
		} as never,
		{
			fetchWallet: async () => ({
				result: {
					getAsset: () => ({
						balance: 0n,
						allowances: {
							[SPENDER]: {
								assetForVault: 1_000n,
								assetForVaultInPermit2: 1_000n,
								permit2ExpirationTime: Math.floor(Date.now() / 1000) + 60,
							},
						},
					}),
					getBalance: () => 0n,
				},
			}),
		} as never,
		{
			getProvider: () => ({
				simulateContract,
				multicall: vi.fn(async () => []),
				readContract: vi.fn(async () => {
					throw new Error("read unavailable");
				}),
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
					type: "operation",
					name: "withdraw",
					items: [
						{
							targetContract: TARGET,
							onBehalfOfAccount: ACCOUNT,
							value: 0n,
							data: encodeFunctionData({
								abi: testAbi,
								functionName: "doThing",
								args: [1n],
							}),
						},
					],
				},
				{
					type: "operation",
					name: "depositWithSwapFromWallet",
					items: [
						{
							targetContract: TARGET,
							onBehalfOfAccount: ACCOUNT,
							value: 0n,
							data: encodeFunctionData({
								abi: testAbi,
								functionName: "doThing",
								args: [2n],
							}),
						},
					],
				},
			],
		},
	];

	const result = await service.simulateTransactionPlan(1, ACCOUNT, plan, {
		stateOverrides: false,
	});

	assert.equal(balanceReadIndex, 3);
	assert.equal(result.insufficientWalletAssets, undefined);
});

test("simulateTransactionPlan tracks Merkl claim reward tokens", async () => {
	const proof =
		"0x1111111111111111111111111111111111111111111111111111111111111111" as const;
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					type: "operation",
					name: "Claim rewards",
					items: [
						{
							targetContract: TARGET,
							onBehalfOfAccount: ACCOUNT,
							value: 0n,
							data: encodeFunctionData({
								abi: merklClaimAbi,
								functionName: "claim",
								args: [[ACCOUNT], [TOKEN], [1n], [[proof]]],
							}),
						},
					],
				},
			],
		},
	];

	const reads = await simulateAndCollectWalletBalanceReads(plan);

	assert.ok(reads.has(getAddress(TOKEN)));
});

test("simulateTransactionPlan tracks swap-verifier wallet output tokens", async () => {
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					type: "operation",
					name: "withdrawAndSwap",
					items: [
						{
							targetContract: TARGET,
							onBehalfOfAccount: ACCOUNT,
							value: 0n,
							data: encodeFunctionData({
								abi: swapVerifierAbi,
								functionName: "verifyAmountMinAndTransfer",
								args: [TOKEN, ACCOUNT, 1n, 9999999999n],
							}),
						},
					],
				},
			],
		},
	];

	const reads = await simulateAndCollectWalletBalanceReads(plan);

	assert.ok(reads.has(getAddress(TOKEN)));
});

test("simulateTransactionPlan tracks EUL balance for rEUL unlocks", async () => {
	const eulToken = getAddress("0x0000000000000000000000000000000000000017");
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					type: "operation",
					name: "Unlock rEUL",
					items: [
						{
							targetContract: TARGET,
							onBehalfOfAccount: ACCOUNT,
							value: 0n,
							data: encodeFunctionData({
								abi: reulLockAbi,
								functionName: "withdrawToByLockTimestamp",
								args: [ACCOUNT, 1n, true],
							}),
						},
					],
				},
			],
		},
	];

	const reads = await simulateAndCollectWalletBalanceReads(plan, { eulToken });

	assert.ok(reads.has(eulToken));
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
						utilsLens: UTILS_LENS,
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

test("simulateTransactionPlan loads the AccountLens ABI through ABIService", async () => {
	const fetchABI = vi.fn(async () => accountLensAbi);
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
						args: [ACCOUNT, TARGET],
					}),
				},
			],
		},
	];

	await simulateAndCollectVaultAccountReads(plan, undefined, { fetchABI });

	assert.deepEqual(fetchABI.mock.calls, [[1, "AccountLens"]]);
});

test("simulateTransactionPlan still simulates when the AccountLens ABI fetch fails", async () => {
	const fetchABI = vi.fn(async () => {
		throw new Error("Failed to fetch ABI (503 Service Unavailable)");
	});
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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
						args: [ACCOUNT, TARGET],
					}),
				},
			],
		},
	];

	try {
		// The lens reads are still encoded, using the bundled ABI.
		const vaultAccountReads = await simulateAndCollectVaultAccountReads(
			plan,
			undefined,
			{ fetchABI } as never,
		);

		assert.ok(
			vaultAccountReads.has(`${CHECKSUM_ACCOUNT}:${getAddress(TARGET)}`),
		);
		assert.equal(warn.mock.calls.length, 1);
	} finally {
		warn.mockRestore();
	}
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

test("simulateTransactionPlan reads vault account info for EVC enabled collateral", async () => {
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
						args: [ACCOUNT, TARGET],
					}),
				},
			],
		},
	];

	const vaultAccountReads = await simulateAndCollectVaultAccountReads(plan);

	assert.ok(vaultAccountReads.has(`${CHECKSUM_ACCOUNT}:${getAddress(TARGET)}`));
});

test("simulateTransactionPlan reads Securitize vault info on behalf of the owner", async () => {
	const actionData = encodeFunctionData({
		abi: testAbi,
		functionName: "doThing",
		args: [1n],
	});
	const simulateContract = vi.fn(
		async ({ args }: { args: readonly [EVCBatchItem[]] }) => {
			const fullBatch = args[0];
			return {
				result: [
					fullBatch.map((item) => ({
						success:
							getAddress(item.targetContract) === getAddress(SECURITIZE_VAULT) &&
							item.data === actionData,
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
						utilsLens: UTILS_LENS,
					},
				},
			}),
		} as never,
		undefined,
		{ getProvider: () => provider } as never,
		{
			fetchVaultTypes: async () => ({
				[getAddress(SECURITIZE_VAULT)]: VaultType.SecuritizeCollateral,
			}),
		} as never,
	);
	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					targetContract: SECURITIZE_VAULT,
					onBehalfOfAccount: CHECKSUM_ACCOUNT,
					value: 0n,
					data: actionData,
				},
			],
		},
	];

	await service.simulateTransactionPlan(1, CHECKSUM_ACCOUNT, plan, {
		stateOverrides: false,
	});

	const fullBatch = simulateContract.mock.calls[0]?.[0].args[0] ?? [];
	const securitizeReadItems = fullBatch.filter(
		(item) =>
			getAddress(item.targetContract) === getAddress(UTILS_LENS) ||
			(getAddress(item.targetContract) === getAddress(SECURITIZE_VAULT) &&
				item.data !== actionData),
	);

	assert.equal(securitizeReadItems.length, 6);
	assert.deepEqual(
		securitizeReadItems.map((item) => getAddress(item.onBehalfOfAccount)),
		Array.from({ length: 6 }, () => CHECKSUM_ACCOUNT),
	);
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

const emptyLiquidityInfo = {
	queryFailure: false,
	queryFailureReason: "0x" as const,
	account: CHECKSUM_ACCOUNT,
	vault: getAddress(TARGET),
	unitOfAccount: getAddress(TOKEN),
	timeToLiquidation: 0n,
	liabilityValueBorrowing: 0n,
	liabilityValueLiquidation: 0n,
	collateralValueBorrowing: 0n,
	collateralValueLiquidation: 0n,
	collateralValueRaw: 0n,
	collaterals: [],
	collateralValuesBorrowing: [],
	collateralValuesLiquidation: [],
	collateralValuesRaw: [],
};

/** A `VaultAccountInfo` whose whole-vault read the lens reports as failed. */
const failedVaultAccountInfo = (reason: `0x${string}`) => ({
	queryFailure: true,
	queryFailureReason: reason,
	timestamp: 0n,
	account: CHECKSUM_ACCOUNT,
	vault: getAddress(TARGET),
	asset: getAddress(TOKEN),
	assetsAccount: 0n,
	shares: 0n,
	assets: 0n,
	borrowed: 0n,
	assetAllowanceVault: 0n,
	assetAllowanceVaultPermit2: 0n,
	assetAllowanceExpirationVaultPermit2: 0n,
	assetAllowancePermit2: 0n,
	balanceForwarderEnabled: false,
	isController: false,
	isCollateral: false,
	liquidityInfo: emptyLiquidityInfo,
});

const evcAccountInfo = () => ({
	timestamp: 0n,
	evc: getAddress(EVC),
	account: CHECKSUM_ACCOUNT,
	addressPrefix: `0x${"11".repeat(19)}` as const,
	owner: CHECKSUM_ACCOUNT,
	isLockdownMode: false,
	isPermitDisabledMode: false,
	lastAccountStatusCheckTimestamp: 0n,
	enabledControllers: [],
	enabledCollaterals: [getAddress(TARGET)],
});

/**
 * Simulates a plan whose action items all succeed, while every AccountLens
 * `getVaultAccountInfo` read returns in-band `queryFailure`.
 */
async function simulateWithFailedVaultAccountReads(reason: `0x${string}`) {
	const provider = {
		simulateContract: vi.fn(
			async ({ args }: { args: readonly [EVCBatchItem[]] }) => ({
				result: [
					args[0].map((item) => {
						if (getAddress(item.targetContract) !== getAddress(ACCOUNT_LENS)) {
							// Action items succeed, so nothing but the lens failure can
							// hold `canExecute` down. Other lens reads are left failing,
							// as elsewhere in this file — they degrade to "no entity".
							const isAction =
								getAddress(item.targetContract) === getAddress(TARGET) ||
								getAddress(item.targetContract) === getAddress(VERIFIER);
							return { success: isAction, result: "0x" };
						}
						const decoded = decodeFunctionData({
							abi: accountLensAbi,
							data: item.data,
						});
						if (decoded.functionName === "getEVCAccountInfo") {
							return {
								success: true,
								result: encodeFunctionResult({
									abi: accountLensAbi,
									functionName: "getEVCAccountInfo",
									result: evcAccountInfo() as never,
								}),
							};
						}
						if (decoded.functionName === "getVaultAccountInfo") {
							return {
								success: true,
								result: encodeFunctionResult({
									abi: accountLensAbi,
									functionName: "getVaultAccountInfo",
									result: failedVaultAccountInfo(reason) as never,
								}),
							};
						}
						return { success: true, result: "0x" };
					}),
					[],
					[],
				],
			}),
		),
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
						utilsLens: UTILS_LENS,
					},
				},
			}),
		} as never,
		undefined,
		{ getProvider: () => provider } as never,
		{
			fetchVaultTypes: async () => ({ [getAddress(TARGET)]: VaultType.EVault }),
		} as never,
	);

	const plan: TransactionPlan = [
		{
			type: "evcBatch",
			items: [
				{
					targetContract: TARGET,
					onBehalfOfAccount: ACCOUNT,
					value: 0n,
					data: encodeFunctionData({
						abi: eVaultAbi,
						functionName: "deposit",
						args: [100n, ACCOUNT],
					}),
				},
			],
		},
	];

	return service.simulateTransactionPlan(1, CHECKSUM_ACCOUNT, plan, {
		stateOverrides: false,
	});
}

test("simulateTransactionPlan exposes an in-band lens vault-read failure", async () => {
	// The lens reports whole-vault failure in-band, so the EVC batch item
	// succeeds and nothing lands in `failedBatchItems`. Without
	// `snapshotReadFailures` the dropped position is indistinguishable from a
	// position the account does not hold.
	const reason = "0xdeadbeef" as const;

	const result = await simulateWithFailedVaultAccountReads(reason);

	assert.equal(result.failedBatchItems, undefined);
	assert.equal(result.accountStatusErrors, undefined);
	assert.equal(result.vaultStatusErrors, undefined);
	assert.equal(result.canExecute, true);

	const failures = result.snapshotReadFailures ?? [];
	assert.ok(failures.length > 0, "expected the lens failure to be reported");
	const inBand = failures.filter((failure) => failure.cause === "inBand");
	assert.ok(inBand.length > 0, "expected an in-band failure");
	for (const failure of inBand) {
		assert.equal(failure.kind, "vaultAccount");
		assert.equal(failure.subAccount, CHECKSUM_ACCOUNT);
		assert.equal(failure.vault, getAddress(TARGET));
		assert.equal(failure.reason, reason);
		assert.ok(typeof failure.layerIndex === "number");
	}

	// Incompleteness is visible precisely because the position is absent: the
	// final layer holds no position for the vault the lens could not report.
	const finalAccount = result.simulatedAccounts.at(-1);
	const positions = Object.values(finalAccount?.subAccounts ?? {}).flatMap(
		(subAccount) => subAccount?.positions ?? [],
	);
	assert.equal(
		positions.some(
			(position) => getAddress(position.vaultAddress) === getAddress(TARGET),
		),
		false,
	);
	// Every layer that read the vault reported the failure, so a consumer cannot
	// trust any layer's position set without checking.
	assert.ok(
		new Set(inBand.map((failure) => failure.layerIndex)).size >= 1,
		"expected per-layer attribution",
	);
});

/** Simulates a plan where every AccountLens read reverts. */
async function simulateTransactionPlanWithFailingLensReads(
	plan: TransactionPlan,
) {
	const provider = {
		simulateContract: vi.fn(
			async ({ args }: { args: readonly [EVCBatchItem[]] }) => ({
				result: [
					args[0].map((item) => ({
						success:
							getAddress(item.targetContract) === getAddress(TARGET) ||
							getAddress(item.targetContract) === getAddress(VERIFIER),
						result: "0x",
					})),
					[],
					[],
				],
			}),
		),
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
						utilsLens: UTILS_LENS,
					},
				},
			}),
		} as never,
		undefined,
		{ getProvider: () => provider } as never,
		{
			fetchVaultTypes: async () => ({ [getAddress(TARGET)]: VaultType.EVault }),
		} as never,
	);

	return service.simulateTransactionPlan(1, CHECKSUM_ACCOUNT, plan, {
		stateOverrides: false,
	});
}

test("simulateTransactionPlan exposes a reverted lens vault-read", async () => {
	// `rawBatchResults` covers only the action positions, so a reverted lens read
	// cannot reach `failedBatchItems` either. It drops a position just as the
	// in-band failure does and must be just as visible.
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
						args: [ACCOUNT, TARGET],
					}),
				},
			],
		},
	];

	const result = await simulateTransactionPlanWithFailingLensReads(plan);

	const failures = result.snapshotReadFailures ?? [];
	const reverted = failures.filter(
		(failure) => failure.kind === "vaultAccount" && failure.cause === "revert",
	);
	assert.ok(reverted.length > 0, "expected a reverted vault read to be reported");
	assert.ok(
		reverted.some(
			(failure) =>
				failure.subAccount === CHECKSUM_ACCOUNT &&
				failure.vault === getAddress(TARGET),
		),
	);
});

test("extractBalanceRequirements sums a token's approvals across spenders", () => {
	// Same token pulled by two different spenders (e.g. supplying it into two
	// vaults) — the wallet must fund the total, so the forge requirement is the
	// sum, not the largest single approval. Forging only the max would let the
	// second pull revert mid-simulation with E_InsufficientBalance.
	const SPENDER_B = "0x00000000000000000000000000000000000000c2" as const;
	const OTHER_OWNER = "0x00000000000000000000000000000000000000f1" as const;
	const plan: TransactionPlan = [
		{ type: "requiredApproval", token: TOKEN, owner: ACCOUNT, spender: SPENDER, amount: 50n },
		{ type: "requiredApproval", token: TOKEN, owner: ACCOUNT, spender: SPENDER_B, amount: 50n },
		// A different owner's approval must not count toward this account.
		{ type: "requiredApproval", token: TOKEN, owner: OTHER_OWNER, spender: SPENDER, amount: 999n },
	];

	const requirements = extractBalanceRequirements(plan, ACCOUNT);

	assert.deepEqual(requirements, [[getAddress(TOKEN), 100n]]);
});
