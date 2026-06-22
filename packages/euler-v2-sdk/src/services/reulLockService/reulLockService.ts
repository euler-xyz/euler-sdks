import { type Abi, type Address, encodeFunctionData, getAddress } from "viem";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { IProviderService } from "../providerService/index.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../executionService/index.js";
import type {
	BuildUnlockREULPlanArgs,
	FetchREULLocksArgs,
	IREULLockService,
	REULLock,
} from "./reulLockServiceTypes.js";

export const reulLockAbi = [
	{
		type: "function",
		name: "getLockedAmounts",
		inputs: [{ name: "account", type: "address" }],
		outputs: [
			{ name: "timestamps", type: "uint256[]" },
			{ name: "amounts", type: "uint256[]" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getWithdrawAmountsByLockTimestamp",
		inputs: [
			{ name: "account", type: "address" },
			{ name: "lockTimestamp", type: "uint256" },
		],
		outputs: [
			{ name: "unlockableAmount", type: "uint256" },
			{ name: "amountToBeBurned", type: "uint256" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "withdrawToByLockTimestamp",
		inputs: [
			{ name: "account", type: "address" },
			{ name: "lockTimestamp", type: "uint256" },
			{ name: "allowRemainderLoss", type: "bool" },
		],
		outputs: [{ name: "success", type: "bool" }],
		stateMutability: "nonpayable",
	},
] as const satisfies Abi;

const DEFAULT_BATCH_SIZE = 20;

export class REULLockService implements IREULLockService {
	constructor(
		private readonly providerService: IProviderService,
		private readonly deploymentService: IDeploymentService,
	) {}

	/**
	 * Fetch all rEUL locks for an account, including the current unlockable and burn amounts for each lock.
	 *
	 * @param args.chainId - Chain whose rEUL contract should be queried.
	 * @param args.account - Account whose locks should be fetched.
	 * @param args.rEulAddress - Optional rEUL token address override for custom deployment metadata.
	 * @param args.batchSize - Number of per-lock withdraw amount calls to issue concurrently.
	 */
	async fetchLocks(args: FetchREULLocksArgs): Promise<REULLock[]> {
		const rEulAddress = this.resolveREULAddress(args.chainId, args.rEulAddress);
		const provider = this.providerService.getProvider(args.chainId);

		const [timestamps, amounts] = (await provider.readContract({
			address: rEulAddress,
			abi: reulLockAbi,
			functionName: "getLockedAmounts",
			args: [args.account],
		})) as [bigint[], bigint[]];

		const withdrawAmounts: {
			unlockableAmount: bigint;
			amountToBeBurned: bigint;
		}[] = [];
		const batchSize = args.batchSize ?? DEFAULT_BATCH_SIZE;

		for (let i = 0; i < timestamps.length; i += batchSize) {
			const batch = timestamps
				.slice(i, i + batchSize)
				.map(async (timestamp) => {
					const [unlockableAmount, amountToBeBurned] =
						(await provider.readContract({
							address: rEulAddress,
							abi: reulLockAbi,
							functionName: "getWithdrawAmountsByLockTimestamp",
							args: [args.account, timestamp],
						})) as [bigint, bigint];

					return { unlockableAmount, amountToBeBurned };
				});

			withdrawAmounts.push(...(await Promise.all(batch)));
		}

		return withdrawAmounts.map((item, index) => ({
			timestamp: timestamps[index] ?? 0n,
			amount: amounts[index] ?? 0n,
			unlockableAmount: item.unlockableAmount,
			amountToBeBurned: item.amountToBeBurned,
		}));
	}

	/**
	 * Build an rEUL unlock transaction plan.
	 *
	 * @param args.chainId - Chain where the unlock transaction will be sent.
	 * @param args.account - Recipient/account argument passed to `withdrawToByLockTimestamp`.
	 * @param args.lockTimestamp - Lock timestamp to unlock.
	 * @param args.rEulAddress - Optional rEUL token address override for custom deployment metadata.
	 * @param args.allowRemainderLoss - Contract `allowRemainderLoss` argument; defaults to true.
	 */
	buildUnlockPlan(args: BuildUnlockREULPlanArgs): TransactionPlan {
		const rEulAddress = this.resolveREULAddress(args.chainId, args.rEulAddress);
		const eulAddress = this.deploymentService.getDeployment(args.chainId)
			.addresses.tokenAddrs?.EUL;
		const item: EVCBatchItem = {
			targetContract: rEulAddress,
			onBehalfOfAccount: args.account,
			value: 0n,
			data: encodeFunctionData({
				abi: reulLockAbi,
				functionName: "withdrawToByLockTimestamp",
				args: [
					args.account,
					args.lockTimestamp,
					args.allowRemainderLoss ?? true,
				],
			}),
		};
		return [
			{
				type: "evcBatch",
				items: [
					{
						type: "operation",
						name: "Unlock rEUL",
						items: [item],
						...(eulAddress
							? { walletBalanceTokens: [getAddress(eulAddress) as Address] }
							: {}),
					},
				],
			},
		];
	}

	private resolveREULAddress(
		chainId: number,
		override?: Address,
	): Address {
		const rEulAddress =
			override ??
			this.deploymentService.getDeployment(chainId).addresses.tokenAddrs?.rEUL;
		if (!rEulAddress) {
			throw new Error(`rEUL token address not configured for chainId ${chainId}`);
		}
		return rEulAddress;
	}
}
