import { describe, expect, it, vi } from "vitest";
import type { Abi, Address } from "viem";
import { AccountOnchainAdapter } from "../src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import {
	ABIService,
	type IABIService,
} from "../src/services/abiService/index.js";
import { RewardsService } from "../src/services/rewardsService/rewardsService.js";
import {
	type BuildQueryFn,
	createQueryCacheBuildQuery,
} from "../src/utils/buildQuery.js";

const ACCOUNT = "0x0000000000000000000000000000000000000001" as Address;
const EVC = "0x0000000000000000000000000000000000000002" as Address;
const ACCOUNT_LENS = "0x0000000000000000000000000000000000000003" as Address;
const VAULT = "0x0000000000000000000000000000000000000004" as Address;
const SECOND_VAULT =
	"0x0000000000000000000000000000000000000005" as Address;

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
	{
		type: "function",
		name: "getRewardAccountInfo",
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
		// The ABI document is chain-agnostic, so another chain shares the request.
		const third = abiService.fetchABI(42161, "AccountLens");
		expect(queryABI).toHaveBeenCalledOnce();
		resolveRequest?.(runtimeAccountLensAbi);
		await expect(Promise.all([first, second, third])).resolves.toEqual([
			runtimeAccountLensAbi,
			runtimeAccountLensAbi,
			runtimeAccountLensAbi,
		]);

		// A failed request is evicted, so the next call for that document retries
		// instead of replaying the rejection (stubbed queryABI returns the same ABI
		// for any document).
		await expect(abiService.fetchABI(1, "OtherLens")).rejects.toThrow(
			"temporary failure",
		);
		await expect(abiService.fetchABI(1, "OtherLens")).resolves.toBe(
			runtimeAccountLensAbi,
		);
	});

	it("retries a failed request once the buildQuery failure cache expires", async () => {
		const queryABI = vi
			.fn<() => Promise<Abi>>()
			.mockRejectedValueOnce(new Error("temporary failure"))
			.mockResolvedValue(runtimeAccountLensAbi);
		// Failure caching in the buildQuery layer sits in front of fetchABI's own
		// eviction; with failureTtlMs disabled the retry reaches queryABI.
		const abiService = new ABIService(
			createQueryCacheBuildQuery({ failureTtlMs: 0 }),
		);
		abiService.setQueryABI(queryABI);

		await expect(abiService.fetchABI(1, "AccountLens")).rejects.toThrow(
			"temporary failure",
		);
		await expect(abiService.fetchABI(1, "AccountLens")).resolves.toBe(
			runtimeAccountLensAbi,
		);
		expect(queryABI).toHaveBeenCalledTimes(2);
	});

	it("resolves ABI documents from the configured euler-interfaces branch", async () => {
		const abiService = new ABIService(undefined, {
			eulerInterfacesBranch: "account-lens-update",
		});
		const queryABI = vi.fn(async () => runtimeAccountLensAbi);
		abiService.setQueryABI(queryABI);

		await abiService.fetchABI(1, "AccountLens");

		expect(queryABI).toHaveBeenCalledWith(
			"https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/account-lens-update/abis/AccountLens.json",
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
		const readContract = vi.fn(
			async ({
				abi,
				functionName,
			}: {
				abi: Abi;
				functionName: string;
			}) => {
			expect(abi).toBe(runtimeAccountLensAbi);
			expect(functionName).toBe("getRewardAccountInfo");
			return {
				timestamp: 1n,
				account: ACCOUNT,
				vault: VAULT,
				balanceTracker: EVC,
				balanceForwarderEnabled: true,
				balance: 1n,
				enabledRewardsInfo: [],
			};
			},
		);
		const rewards = new RewardsService(
			{ fetchVaultRewards: vi.fn(), fetchChainRewards: vi.fn() } as never,
			{
				merklDistributorAddress: ACCOUNT,
				fuulManagerAddress: ACCOUNT,
				fuulFactoryAddress: ACCOUNT,
			},
			{ abiService },
		);
		rewards.setProviderService({
			getProvider: () => ({ readContract }),
		} as never);
		rewards.setDeploymentService(deploymentService as never);

		await rewards.fetchRewardStreams({
			chainId: 1,
			account: ACCOUNT,
			positions: [{ account: ACCOUNT, vault: VAULT }],
		});

		expect(fetchABI).toHaveBeenCalledWith(1, "AccountLens");
		expect(readContract).toHaveBeenCalledOnce();
	});

	it("isolates failed reward-account reads by position", async () => {
		const { service: abiService } = makeAbiService();
		const readContract = vi
			.fn()
			.mockRejectedValueOnce(new Error("hostile reward source"))
			.mockResolvedValueOnce({
				timestamp: 1n,
				account: ACCOUNT,
				vault: SECOND_VAULT,
				balanceTracker: EVC,
				balanceForwarderEnabled: true,
				balance: 1n,
				enabledRewardsInfo: [
					{
						reward: EVC,
						earnedReward: 1n,
						earnedRewardRecentIgnored: 0n,
					},
				],
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
		rewards.setProviderService({
			getProvider: () => ({ readContract }),
		} as never);
		rewards.setDeploymentService(deploymentService as never);

		await expect(
			rewards.fetchRewardStreams({
				chainId: 1,
				account: ACCOUNT,
				positions: [
					{ account: ACCOUNT, vault: VAULT },
					{ account: ACCOUNT, vault: SECOND_VAULT },
				],
			}),
		).resolves.toEqual([
			{
				account: ACCOUNT,
				vault: SECOND_VAULT,
				reward: EVC,
				earnedReward: 1n,
				earnedRewardRecentIgnored: 0n,
			},
		]);
	});
});

describe("AccountLens ABI resolution fallback", () => {
	const evcAccountInfo = {
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

	const failingAbiService = (
		reason = "Failed to fetch ABI (503 Service Unavailable)",
	) =>
		({
			fetchABI: vi.fn(async () => {
				throw new Error(reason);
			}),
		}) as unknown as IABIService;

	const incompleteAbiService = () =>
		({
			fetchABI: vi.fn(async () => [
				{
					type: "function",
					name: "getEVCAccountInfo",
					stateMutability: "view",
					inputs: [],
					outputs: [{ name: "marker", type: "bytes32" }],
				},
			]),
		}) as unknown as IABIService;

	const makeAdapter = (abiService: IABIService, readContract: unknown) =>
		new AccountOnchainAdapter(
			{ getProvider: () => ({ readContract }) } as never,
			deploymentService as never,
			{ fetchAccountVaults: vi.fn() } as never,
			undefined,
			abiService,
		);

	it("falls back to the bundled ABI when the ABI fetch fails", async () => {
		const readContract = vi.fn(async ({ abi }: { abi: Abi }) => {
			// The bundled ABI, not the stubbed runtime one.
			expect(abi).not.toBe(runtimeAccountLensAbi);
			expect(
				abi.some(
					(item) =>
						item.type === "function" && item.name === "getEVCAccountInfo",
				),
			).toBe(true);
			return evcAccountInfo;
		});
		const adapter = makeAdapter(failingAbiService(), readContract);

		const { result, errors } = await adapter.fetchSubAccount(1, ACCOUNT);

		// The read still happens: an unreachable ABI document must not take down
		// account reads while a usable bundled ABI is available.
		expect(readContract).toHaveBeenCalledOnce();
		expect(result?.account).toBe(ACCOUNT);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({
			code: "FALLBACK_USED",
			severity: "warning",
			source: "accountLens",
		});
		expect(errors[0]?.message).toContain(
			"Failed to fetch ABI (503 Service Unavailable)",
		);
	});

	it("falls back when the runtime ABI is missing functions the SDK calls", async () => {
		const readContract = vi.fn(async () => evcAccountInfo);
		const adapter = makeAdapter(incompleteAbiService(), readContract);

		const { errors } = await adapter.fetchSubAccount(1, ACCOUNT);

		expect(readContract).toHaveBeenCalledOnce();
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ code: "FALLBACK_USED" });
		expect(errors[0]?.message).toContain("getVaultAccountInfo");
	});

	it("keeps reward streams working when the ABI fetch fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const readContract = vi.fn(async ({ abi }: { abi: Abi }) => {
			expect(abi).not.toBe(runtimeAccountLensAbi);
			return {
				account: ACCOUNT,
				vault: VAULT,
				enabledRewardsInfo: [
					{ reward: EVC, earnedReward: 5n, earnedRewardRecentIgnored: 0n },
				],
			};
		});
		const rewards = new RewardsService(
			{ fetchVaultRewards: vi.fn(), fetchChainRewards: vi.fn() } as never,
			{
				merklDistributorAddress: ACCOUNT,
				fuulManagerAddress: ACCOUNT,
				fuulFactoryAddress: ACCOUNT,
			},
			{ abiService: failingAbiService() },
		);
		rewards.setProviderService({
			getProvider: () => ({ readContract }),
		} as never);
		rewards.setDeploymentService(deploymentService as never);

		try {
			await expect(
				rewards.fetchRewardStreams({
					chainId: 1,
					account: ACCOUNT,
					positions: [{ account: ACCOUNT, vault: VAULT }],
				}),
			).resolves.toEqual([
				{
					account: ACCOUNT,
					vault: VAULT,
					reward: EVC,
					earnedReward: 5n,
					earnedRewardRecentIgnored: 0n,
				},
			]);
			expect(warn).toHaveBeenCalledOnce();
		} finally {
			warn.mockRestore();
		}
	});

	it("keeps the resolved ABI out of the keys buildQuery derives", async () => {
		const keys: (string | null)[] = [];
		const buildQuery = ((_name, fn, _target, context) => {
			return ((...args: unknown[]) => {
				if (context) keys.push(context.getCacheKey(args));
				return fn(...args);
			}) as typeof fn;
		}) as BuildQueryFn;
		const readContract = vi.fn(async () => evcAccountInfo);
		const adapter = new AccountOnchainAdapter(
			{ getProvider: () => ({ readContract }) } as never,
			deploymentService as never,
			{ fetchAccountVaults: vi.fn() } as never,
			buildQuery,
			makeAbiService().service,
		);

		await adapter.fetchSubAccount(1, ACCOUNT);

		// Otherwise the 33KB runtime ABI is serialized into every AccountLens key.
		expect(keys).toHaveLength(1);
		expect(keys[0]).not.toBeNull();
		expect(keys[0]?.length).toBeLessThan(300);
	});

	it("derives the same query key regardless of the ABI argument", async () => {
		const adapter = makeAdapter(failingAbiService(), vi.fn());
		const provider = { chain: { id: 1 }, transport: {} } as never;

		const withoutAbi = adapter.getQueryKeyVaultAccountInfo(
			provider,
			ACCOUNT_LENS,
			ACCOUNT,
			VAULT,
		);

		expect(withoutAbi).not.toBeNull();
		// A fetched ABI is memoized for the lifetime of the ABIService, so it is
		// constant for every read keyed here and never varies the key.
		for (const abi of [
			runtimeAccountLensAbi as unknown as Abi,
			[...runtimeAccountLensAbi] as unknown as Abi,
		]) {
			expect(
				adapter.getQueryKeyVaultAccountInfo(
					provider,
					ACCOUNT_LENS,
					ACCOUNT,
					VAULT,
					abi,
				),
			).toEqual(withoutAbi);
		}
	});
});
