import { describe, expect, it, vi } from "vitest";
import type { Abi, Address } from "viem";
import { AccountOnchainAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import { ABIService, type IABIService } from "../src/services/abiService/index.js";
import { RewardsService } from "../src/services/rewardsService/rewardsService.js";

const ACCOUNT = "0x0000000000000000000000000000000000000001" as Address;
const EVC = "0x0000000000000000000000000000000000000002" as Address;
const ACCOUNT_LENS = "0x0000000000000000000000000000000000000003" as Address;
const VAULT = "0x0000000000000000000000000000000000000004" as Address;

const runtimeAccountLensAbi = [
	{
		type: "function",
		name: "getEVCAccountInfo",
		stateMutability: "view",
		inputs: [
			{ name: "evc", type: "address" },
			{ name: "account", type: "address" },
		],
		outputs: [{ name: "marker", type: "bytes32" }],
	},
	{
		type: "function",
		name: "getVaultAccountInfo",
		stateMutability: "view",
		inputs: [
			{ name: "account", type: "address" },
			{ name: "vault", type: "address" },
		],
		outputs: [{ name: "marker", type: "bytes32" }],
	},
] as const satisfies Abi;

const makeAbiService = () => {
	const fetchABI = vi.fn(async () => runtimeAccountLensAbi);
	return {
		service: { fetchABI } as IABIService,
		fetchABI,
	};
};

const deploymentService = {
	getDeployment: () => ({
		addresses: {
			coreAddrs: { evc: EVC },
			lensAddrs: { accountLens: ACCOUNT_LENS },
		},
	}),
};

describe("AccountLens ABI service consumers", () => {
	it("coalesces concurrent ABI requests and retries after a failed request", async () => {
		const abiService = new ABIService();
		let resolveRequest: ((abi: Abi) => void) | undefined;
		const queryABI = vi
			.fn<() => Promise<Abi>>()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
			)
			.mockRejectedValueOnce(new Error("temporary failure"))
			.mockResolvedValue(runtimeAccountLensAbi);
		abiService.setQueryABI(queryABI);

		const first = abiService.fetchABI(1, "AccountLens");
		const second = abiService.fetchABI(1, "AccountLens");
		expect(queryABI).toHaveBeenCalledOnce();
		resolveRequest?.(runtimeAccountLensAbi);
		await expect(Promise.all([first, second])).resolves.toEqual([
			runtimeAccountLensAbi,
			runtimeAccountLensAbi,
		]);

		await expect(abiService.fetchABI(1, "VaultLens")).rejects.toThrow(
			"temporary failure",
		);
		await expect(abiService.fetchABI(1, "VaultLens")).resolves.toBe(
			runtimeAccountLensAbi,
		);
	});

	it("rejects unsuccessful and malformed ABI responses", async () => {
		const abiService = new ABIService();
		const fetchMock = vi.spyOn(globalThis, "fetch");

		try {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
			} as Response);
			await expect(
				abiService.queryABI("https://example.test/failure"),
			).rejects.toThrow("Failed to fetch ABI (503 Service Unavailable)");

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ abi: [] }),
			} as Response);
			await expect(
				abiService.queryABI("https://example.test/invalid"),
			).rejects.toThrow("Invalid ABI response");
		} finally {
			fetchMock.mockRestore();
		}
	});

	it("uses the ABI service for onchain account reads", async () => {
		const { service: abiService, fetchABI } = makeAbiService();
		const readContract = vi.fn(async ({ abi }: { abi: Abi }) => {
			expect(abi).toBe(runtimeAccountLensAbi);
			return {
				timestamp: 1n,
				evc: EVC,
				account: ACCOUNT,
				addressPrefix: "0x00000000000000000000000000000000000000",
				owner: ACCOUNT,
				isLockdownMode: false,
				isPermitDisabledMode: false,
				lastAccountStatusCheckTimestamp: 0n,
				enabledControllers: [],
				enabledCollaterals: [],
			};
		});
		const adapter = new AccountOnchainAdapter(
			{ getProvider: () => ({ readContract }) } as never,
			deploymentService as never,
			{ fetchAccountVaults: vi.fn() } as never,
			undefined,
			abiService,
		);

		await adapter.fetchSubAccount(1, ACCOUNT);

		expect(fetchABI).toHaveBeenCalledWith(1, "AccountLens");
		expect(readContract).toHaveBeenCalledOnce();
	});

	it("omits whole-vault query failures from account positions", async () => {
		const { service: abiService } = makeAbiService();
		const readContract = vi
			.fn()
			.mockResolvedValueOnce({
				timestamp: 1n,
				evc: EVC,
				account: ACCOUNT,
				addressPrefix: "0x00000000000000000000000000000000000000",
				owner: ACCOUNT,
				isLockdownMode: false,
				isPermitDisabledMode: false,
				lastAccountStatusCheckTimestamp: 0n,
				enabledControllers: [],
				enabledCollaterals: [],
			})
			.mockResolvedValueOnce({
				queryFailure: true,
				queryFailureReason: "0x1234",
			});
		const adapter = new AccountOnchainAdapter(
			{ getProvider: () => ({ readContract }) } as never,
			deploymentService as never,
			{ fetchAccountVaults: vi.fn() } as never,
			undefined,
			abiService,
		);

		const { result, errors } = await adapter.fetchSubAccount(1, ACCOUNT, [
			VAULT,
		]);

		expect(result?.positions).toEqual([]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({
			code: "SOURCE_UNAVAILABLE",
			source: "accountLens",
			originalValue: "0x1234",
		});
	});

	it("uses the ABI service for reward-stream account reads", async () => {
		const { service: abiService, fetchABI } = makeAbiService();
		const readContract = vi.fn(async ({ abi }: { abi: Abi }) => {
			expect(abi).toBe(runtimeAccountLensAbi);
			return {
				account: ACCOUNT,
				vault: VAULT,
				enabledRewardsInfo: [],
			};
		});
		const rewards = new RewardsService(
			{ fetchVaultRewards: vi.fn(), fetchChainRewards: vi.fn() } as never,
			{
				merklDistributorAddress: ACCOUNT,
				fuulManagerAddress: ACCOUNT,
				fuulFactoryAddress: ACCOUNT,
			},
			{ abiService },
		);
		rewards.setProviderService({ getProvider: () => ({ readContract }) } as never);
		rewards.setDeploymentService(deploymentService as never);

		await rewards.fetchRewardStreams({
			chainId: 1,
			account: ACCOUNT,
			positions: [{ account: ACCOUNT, vault: VAULT }],
		});

		expect(fetchABI).toHaveBeenCalledWith(1, "AccountLens");
		expect(readContract).toHaveBeenCalledOnce();
	});

	it("omits reward streams from whole-vault query failures", async () => {
		const { service: abiService } = makeAbiService();
		const readContract = vi.fn(async () => ({
			queryFailure: true,
			queryFailureReason: "0x1234",
			account: ACCOUNT,
			vault: VAULT,
			enabledRewardsInfo: [
				{
					reward: EVC,
					earnedReward: 1n,
					earnedRewardRecentIgnored: 0n,
				},
			],
		}));
		const rewards = new RewardsService(
			{ fetchVaultRewards: vi.fn(), fetchChainRewards: vi.fn() } as never,
			{
				merklDistributorAddress: ACCOUNT,
				fuulManagerAddress: ACCOUNT,
				fuulFactoryAddress: ACCOUNT,
			},
			{ abiService },
		);
		rewards.setProviderService({ getProvider: () => ({ readContract }) } as never);
		rewards.setDeploymentService(deploymentService as never);

		await expect(
			rewards.fetchRewardStreams({
				chainId: 1,
				account: ACCOUNT,
				positions: [{ account: ACCOUNT, vault: VAULT }],
			}),
		).resolves.toEqual([]);
	});
});
