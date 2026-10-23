import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
	type Address,
	getAddress,
	maxUint160,
	maxUint256,
	zeroAddress,
} from "viem";
import { Wallet, type AssetAllowances } from "../src/entities/Wallet.js";
import { assessApproval } from "../src/services/executionService/approvalRouting.js";
import { ExecutionService } from "../src/services/executionService/executionService.js";
import type {
	ApprovalTransferBehavior,
	EVCBatchItem,
	RequiredApproval,
} from "../src/services/executionService/executionServiceTypes.js";
import { VaultType } from "../src/utils/types.js";

const OWNER = getAddress("0x0000000000000000000000000000000000000001");
const TOKEN = getAddress("0x0000000000000000000000000000000000000002");
const SPENDER = getAddress("0x0000000000000000000000000000000000000003");
const PERMIT2 = getAddress("0x0000000000000000000000000000000000000004");
const EVC = getAddress("0x0000000000000000000000000000000000000005");
const LENS = getAddress("0x0000000000000000000000000000000000000006");
const OTHER_PERMIT2 = getAddress("0x0000000000000000000000000000000000000007");
const NOW = 1_800_000_000;
const evk: ApprovalTransferBehavior = {
	type: "permit2WithDirectFallback",
	permit2: PERMIT2,
};
const earn: ApprovalTransferBehavior = {
	type: "permit2WhenAuthorized",
	permit2: PERMIT2,
};
const allowances = (
	values: Partial<AssetAllowances> = {},
): AssetAllowances => ({
	assetForVault: 0n,
	assetForPermit2: 0n,
	assetForVaultInPermit2: 0n,
	permit2ExpirationTime: NOW + 3600,
	permit2Nonce: 0,
	...values,
});
const requirement = (
	behavior: ApprovalTransferBehavior | undefined,
	amount = 100n,
): RequiredApproval => ({
	type: "requiredApproval",
	token: TOKEN,
	owner: OWNER,
	spender: SPENDER,
	amount,
	transferBehavior: behavior,
});
function fixture(
	state?: AssetAllowances,
	options: { vaultType?: string; permit2?: Address; verifier?: Address } = {},
) {
	const wallet = new Wallet({
		chainId: 1,
		account: OWNER,
		assets: [
			{
				account: OWNER,
				asset: TOKEN,
				balance: maxUint256,
				allowances: state ? { [SPENDER]: state } : {},
			},
		],
	});
	const readContract = vi.fn(async () => options.permit2 ?? PERMIT2);
	const fetchVaultTypes = vi.fn(async () => ({ [SPENDER]: options.vaultType }));
	const fetchWallet = vi.fn(async () => ({ result: wallet, errors: [] }));
	const simulateContract = vi.fn(
		async ({ args }: { args: readonly [EVCBatchItem[]] }) => ({
			result: [
				args[0].map((item) => ({
					success: getAddress(item.targetContract) === EVC,
					result: "0x",
				})),
				[],
				[],
			],
		}),
	);
	const service = new ExecutionService(
		{
			getDeployment: () => ({
				addresses: {
					coreAddrs: { evc: EVC, permit2: PERMIT2 },
					peripheryAddrs: { swapVerifier: options.verifier },
					lensAddrs: {
						accountLens: LENS,
						vaultLens: LENS,
						eulerEarnVaultLens: LENS,
						utilsLens: LENS,
					},
				},
			}),
		} as never,
		{ fetchWallet },
		{ getProvider: () => ({ readContract, simulateContract }) } as never,
		{ fetchVaultTypes } as never,
	);
	return {
		service,
		wallet,
		readContract,
		fetchVaultTypes,
		fetchWallet,
		simulateContract,
	};
}
const batch = {
	type: "evcBatch",
	items: [
		{
			targetContract: EVC,
			onBehalfOfAccount: OWNER,
			value: 0n,
			data: "0x1234",
		},
	],
} as const;
afterEach(() => vi.restoreAllMocks());

for (const behavior of [evk, earn]) {
	for (const [name, state, amount, expected] of [
		["direct only", allowances({ assetForVault: 100n }), 100n, "sufficient"],
		[
			"Permit2 only",
			allowances({ assetForPermit2: 100n, assetForVaultInPermit2: 100n }),
			100n,
			"sufficient",
		],
		[
			"coexisting broken Permit2",
			allowances({
				assetForVault: 100n,
				assetForPermit2: 95n,
				assetForVaultInPermit2: 1000n,
			}),
			100n,
			behavior === evk ? "sufficient" : "insufficient",
		],
		[
			"expired with direct",
			allowances({
				assetForVault: 100n,
				assetForPermit2: 95n,
				assetForVaultInPermit2: 1000n,
				permit2ExpirationTime: NOW - 1,
			}),
			100n,
			"sufficient",
		],
		[
			"expired without direct",
			allowances({
				assetForPermit2: 100n,
				assetForVaultInPermit2: 1000n,
				permit2ExpirationTime: NOW - 1,
			}),
			100n,
			"insufficient",
		],
		[
			"zero expiration",
			allowances({
				assetForPermit2: 100n,
				assetForVaultInPermit2: 1000n,
				permit2ExpirationTime: 0,
			}),
			100n,
			"insufficient",
		],
		[
			"valid at expiration timestamp",
			allowances({
				assetForPermit2: 100n,
				assetForVaultInPermit2: 1000n,
				permit2ExpirationTime: NOW,
			}),
			100n,
			"sufficient",
		],
		[
			"failed direct read with Permit2",
			allowances({
				assetForPermit2: 100n,
				assetForVaultInPermit2: 1000n,
				failedReads: ["assetForVault"],
			}),
			100n,
			"sufficient",
		],
		[
			"failed internal read with direct",
			allowances({
				assetForVault: 100n,
				assetForPermit2: 100n,
				failedReads: ["assetForVaultInPermit2"],
			}),
			100n,
			behavior === evk ? "sufficient" : "unknown",
		],
		[
			"failed token-to-Permit2 read with direct",
			allowances({
				assetForVault: 100n,
				assetForVaultInPermit2: 1000n,
				failedReads: ["assetForPermit2"],
			}),
			100n,
			behavior === evk ? "sufficient" : "unknown",
		],
		[
			"unreadable allowances",
			allowances({
				failedReads: [
					"assetForVault",
					"assetForPermit2",
					"assetForVaultInPermit2",
				],
			}),
			100n,
			"unknown",
		],
		[
			"uint160 maximum",
			allowances({
				assetForPermit2: maxUint160,
				assetForVaultInPermit2: maxUint160,
			}),
			maxUint160,
			"sufficient",
		],
		[
			"above uint160 maximum",
			allowances({
				assetForPermit2: maxUint256,
				assetForVaultInPermit2: maxUint160,
			}),
			maxUint160 + 1n,
			"insufficient",
		],
	] as const) {
		test(`${behavior.type}: ${name} uses the same assessment in simulation and resolution`, async () => {
			vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
			const approval = requirement(behavior, amount);
			assert.equal(assessApproval(approval, state, PERMIT2).status, expected);
			const { service, wallet } = fixture(state);
			const result = await service.simulateTransactionPlan(
				1,
				OWNER,
				[approval, { ...batch, items: [...batch.items] }],
				{ stateOverrides: false },
			);
			assert.equal(result.canExecute, expected === "sufficient");
			assert.equal(
				!!result.unknownApprovalRequirements?.length,
				expected === "unknown",
			);
			service.resolveRequiredApprovalsWithWallet({
				plan: [approval],
				chainId: 1,
				wallet,
			});
			if (expected !== "sufficient") assert.ok(approval.resolved?.length);
			for (const item of approval.resolved ?? []) {
				if (item.type === "permit2") assert.ok(item.amount <= maxUint160);
			}
		});
	}
}

test("Earn repairs only token-to-Permit2 for the 100/95/1000 regression; direct-only policy reports a conflict", async () => {
	vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
	const state = allowances({
		assetForVault: 100n,
		assetForPermit2: 95n,
		assetForVaultInPermit2: 1000n,
	});
	const { service, wallet } = fixture(state);
	const approval = requirement(earn);
	service.resolveRequiredApprovalsWithWallet({
		plan: [approval],
		chainId: 1,
		wallet,
	});
	assert.deepEqual(
		approval.resolved?.map((item) => ({
			type: item.type,
			spender: item.spender,
			amount: item.amount,
		})),
		[{ type: "approve", spender: PERMIT2, amount: maxUint256 }],
	);
	assert.throws(
		() =>
			service.resolveRequiredApprovalsWithWallet({
				plan: [requirement(earn)],
				chainId: 1,
				wallet,
				usePermit2: false,
			}),
		/Approval policy conflict/,
	);
	service.resolveRequiredApprovalsWithWallet({
		plan: [requirement(evk)],
		chainId: 1,
		wallet,
		usePermit2: false,
	});
	const simulation = await service.simulateTransactionPlan(
		1,
		OWNER,
		[approval, { ...batch, items: [...batch.items] }],
		{ stateOverrides: false },
	);
	assert.deepEqual(simulation.insufficientPermit2Allowances, [
		{ token: TOKEN, amount: 5n },
	]);
	assert.equal(simulation.insufficientDirectAllowances, undefined);
	state.assetForPermit2 = maxUint256;
	const repaired = await service.simulateTransactionPlan(
		1,
		OWNER,
		[approval, { ...batch, items: [...batch.items] }],
		{ stateOverrides: false },
	);
	assert.equal(repaired.canExecute, true);
});

for (const behavior of [evk, earn]) {
	test(`${behavior.type}: disabled Permit2 and amounts above its cap resolve through direct approval`, () => {
		const { service, wallet } = fixture(allowances());
		for (const approval of [
			requirement({ ...behavior, permit2: zeroAddress }),
			requirement(behavior, maxUint160 + 1n),
		]) {
			service.resolveRequiredApprovalsWithWallet({
				plan: [approval],
				chainId: 1,
				wallet,
			});
			assert.deepEqual(
				approval.resolved?.map((item) => ({
					type: item.type,
					spender: item.spender,
					amount: item.amount,
				})),
				[{ type: "approve", spender: SPENDER, amount: approval.amount }],
			);
		}
	});
}

test("unknown custom spender needs explicit metadata even with a sufficient direct allowance", async () => {
	const { service, wallet, readContract } = fixture(
		allowances({ assetForVault: 100n }),
		{ vaultType: "CustomERC4626" },
	);
	const approval = requirement(undefined);
	assert.equal(
		assessApproval(approval, wallet.getAllowances(TOKEN, SPENDER), PERMIT2)
			.status,
		"unknown",
	);
	assert.throws(
		() =>
			service.resolveRequiredApprovalsWithWallet({
				plan: [approval],
				chainId: 1,
				wallet,
			}),
		/Unknown approval transfer behavior/,
	);
	await assert.rejects(
		() =>
			service.resolveRequiredApprovals({
				plan: [approval],
				chainId: 1,
				account: OWNER,
			}),
		/Unknown approval transfer behavior/,
	);
	assert.equal(readContract.mock.calls.length, 0);
	approval.transferBehavior = { type: "direct" };
	service.resolveRequiredApprovalsWithWallet({
		plan: [approval],
		chainId: 1,
		wallet,
	});
	assert.deepEqual(approval.resolved, []);
});

for (const [vaultType, verifier, expected] of [
	[VaultType.EVault, undefined, "permit2WithDirectFallback"],
	[VaultType.EulerEarn, undefined, "permit2WhenAuthorized"],
	[undefined, SPENDER, "permit2WhenAuthorized"],
] as const) {
	test(`async resolution identifies ${vaultType ?? "swap verifier"} and reads its configured Permit2`, async () => {
		vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
		const state = allowances({
			assetForVault: 100n,
			assetForPermit2: 95n,
			assetForVaultInPermit2: 1000n,
		});
		const { service, readContract } = fixture(state, { vaultType, verifier });
		const approval = requirement(undefined);
		await service.resolveRequiredApprovals({
			plan: [approval],
			chainId: 1,
			account: OWNER,
		});
		assert.deepEqual(approval.transferBehavior, {
			type: expected,
			permit2: PERMIT2,
		});
		assert.equal(
			approval.resolved?.length,
			expected === "permit2WhenAuthorized" ? 1 : 0,
		);
		assert.equal(
			(readContract.mock.calls[0] as unknown as [{ functionName: string }])[0]
				.functionName,
			verifier ? "permit2" : "permit2Address",
		);
		// The unprepared simulation entry point discovers the same behavior.
		const result = await service.simulateTransactionPlan(
			1,
			OWNER,
			[requirement(undefined), { ...batch, items: [...batch.items] }],
			{ stateOverrides: false },
		);
		assert.equal(result.canExecute, expected === "permit2WithDirectFallback");
	});
}

test("configured Permit2 mismatch is unknown instead of reusing allowances from another contract", async () => {
	vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
	const state = allowances({
		assetForVault: 100n,
		assetForPermit2: 100n,
		assetForVaultInPermit2: 1000n,
	});
	const { service, wallet } = fixture(state, {
		vaultType: VaultType.EulerEarn,
		permit2: OTHER_PERMIT2,
	});
	const approval = requirement(undefined);
	await assert.rejects(
		() =>
			service.resolveRequiredApprovals({
				plan: [approval],
				chainId: 1,
				account: OWNER,
			}),
		/Approval policy conflict/,
	);
	assert.deepEqual(approval.transferBehavior, {
		type: "permit2WhenAuthorized",
		permit2: OTHER_PERMIT2,
	});
	assert.equal(assessApproval(approval, state, PERMIT2).status, "unknown");
	// A snapshot explicitly read from the spender's contract can establish an existing route.
	state.permit2Address = OTHER_PERMIT2;
	service.resolveRequiredApprovalsWithWallet({
		plan: [approval],
		chainId: 1,
		wallet,
	});
	assert.deepEqual(approval.resolved, []);
	state.assetForPermit2 = 95n;
	service.resolveRequiredApprovalsWithWallet({
		plan: [approval],
		chainId: 1,
		wallet,
	});
	assert.deepEqual(
		approval.resolved?.map((item) => ({
			type: item.type,
			spender: item.spender,
			amount: item.amount,
		})),
		[{ type: "approve", spender: OTHER_PERMIT2, amount: maxUint256 }],
	);
});

test("unreadable spender configuration remains unknown", async () => {
	const { service, readContract } = fixture(
		allowances({ assetForVault: 100n }),
		{ vaultType: VaultType.EulerEarn },
	);
	readContract.mockRejectedValue(new Error("RPC unavailable"));
	await assert.rejects(
		() =>
			service.resolveRequiredApprovals({
				plan: [requirement(undefined)],
				chainId: 1,
				account: OWNER,
			}),
		/Unknown approval transfer behavior/,
	);
});

test("missing wallet entries are unknown and reset-requiring tokens still receive a zero reset", () => {
	const { service, wallet } = fixture();
	const approval = {
		...requirement(evk),
		token: getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
	};
	assert.equal(assessApproval(approval, undefined, PERMIT2).status, "unknown");
	service.resolveRequiredApprovalsWithWallet({
		plan: [approval],
		chainId: 1,
		wallet,
	});
	assert.deepEqual(
		approval.resolved?.map((item) => item.amount),
		[0n, maxUint256, 100n],
	);
});

test("merging plans preserves behavior metadata and rejects inconsistent routing", () => {
	const { service } = fixture();
	const merged = service.mergePlans([
		[requirement(undefined)],
		[requirement(earn)],
	]);
	assert.equal((merged[0] as RequiredApproval).amount, 200n);
	assert.deepEqual((merged[0] as RequiredApproval).transferBehavior, earn);
	assert.throws(
		() => service.mergePlans([[requirement(evk)], [requirement(earn)]]),
		/Conflicting approval transfer behavior/,
	);
});

for (const aggregate of [false, true]) {
	test(`Earn does not infer a direct route from a ${aggregate ? "merged total" : "mint estimate"}`, async () => {
		vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
		const state = allowances({
			assetForVault: 100n,
			assetForPermit2: 20n,
			assetForVaultInPermit2: 75n,
		});
		const { service, wallet } = fixture(state);
		const plan = aggregate
			? service.mergePlans([[requirement(earn, 50n)], [requirement(earn, 50n)]])
			: service.planMint({
					vault: SPENDER,
					asset: TOKEN,
					shares: 100n,
					receiver: OWNER,
					account: {
						chainId: 1,
						owner: OWNER,
						isCollateralEnabled: () => false,
					} as never,
				});
		const approval = plan[0] as RequiredApproval;
		approval.transferBehavior = earn;
		assert.equal(approval.amount, 100n);
		assert.equal(approval.amountIsExact, false);
		assert.equal(assessApproval(approval, state, PERMIT2).status, "unknown");
		assert.throws(
			() =>
				service.resolveRequiredApprovalsWithWallet({
					plan,
					chainId: 1,
					wallet,
					usePermit2: false,
				}),
			/Approval policy conflict/,
		);
		service.resolveRequiredApprovalsWithWallet({ plan, chainId: 1, wallet });
		assert.deepEqual(
			approval.resolved?.map((item) => ({
				type: item.type,
				spender: item.spender,
				amount: item.amount,
			})),
			[
				{ type: "approve", spender: PERMIT2, amount: maxUint256 },
				{ type: "permit2", spender: SPENDER, amount: 100n },
			],
		);
		// Covering all possibly selected Permit2 transfers makes direct coverage sufficient.
		state.assetForPermit2 = 75n;
		service.resolveRequiredApprovalsWithWallet({
			plan,
			chainId: 1,
			wallet,
			usePermit2: false,
		});
		assert.deepEqual(approval.resolved, []);
	});
}
