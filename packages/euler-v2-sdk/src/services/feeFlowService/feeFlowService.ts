import { getAddress, type Address } from "viem";
import type { EVault } from "../../entities/EVault.js";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type {
	ContractCall,
	TransactionPlan,
} from "../executionService/index.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import type {
	BuildFeeFlowBuyPlanArgs,
	FeeFlowServiceConfig,
	FeeFlowSlot0,
	FeeFlowState,
	FeeFlowVaultInventory,
	IFeeFlowService,
} from "./feeFlowServiceTypes.js";

const DEFAULT_BUY_DEADLINE_SECONDS = 15 * 60;
const FEE_SHARE_SCALE = 10_000n;

const FEE_FLOW_CONTROLLER_ABI = [
	{
		type: "function",
		name: "getSlot0",
		inputs: [],
		outputs: [
			{
				type: "tuple",
				components: [
					{ name: "locked", type: "uint8" },
					{ name: "epochId", type: "uint16" },
					{ name: "initPrice", type: "uint192" },
					{ name: "startTime", type: "uint40" },
				],
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getPrice",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "paymentToken",
		inputs: [],
		outputs: [{ type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "paymentReceiver",
		inputs: [],
		outputs: [{ type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "epochPeriod",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "priceMultiplier",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "minInitPrice",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "buy",
		inputs: [
			{ name: "assets", type: "address[]" },
			{ name: "assetsReceiver", type: "address" },
			{ name: "epochId", type: "uint256" },
			{ name: "deadline", type: "uint256" },
			{ name: "maxPaymentTokenAmount", type: "uint256" },
		],
		outputs: [{ type: "uint256" }],
		stateMutability: "nonpayable",
	},
] as const;

const FEE_FLOW_VAULT_ABI = [
	{
		type: "function",
		name: "protocolFeeReceiver",
		inputs: [],
		outputs: [{ type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "protocolFeeShare",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "accumulatedFeesAssets",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "balanceOf",
		inputs: [{ type: "address" }],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
] as const;

export class FeeFlowService implements IFeeFlowService {
	private providerService?: ProviderService;
	private deploymentService?: IDeploymentService;
	private feeFlowControllerAddress?: Address;
	private feeFlowControllerUtilAddress?: Address;
	private defaultBuyDeadlineSeconds: number;

	constructor(config?: FeeFlowServiceConfig, buildQuery?: BuildQueryFn) {
		this.feeFlowControllerAddress = config?.feeFlowControllerAddress;
		this.feeFlowControllerUtilAddress = config?.feeFlowControllerUtilAddress;
		this.defaultBuyDeadlineSeconds =
			config?.defaultBuyDeadlineSeconds ?? DEFAULT_BUY_DEADLINE_SECONDS;

		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setProviderService(providerService: ProviderService): void {
		this.providerService = providerService;
	}

	setDeploymentService(deploymentService: IDeploymentService): void {
		this.deploymentService = deploymentService;
	}

	async fetchState(chainId: number): Promise<FeeFlowState> {
		if (!this.providerService) {
			throw new Error("FeeFlowService providerService is not set");
		}

		const feeFlowControllerAddress =
			this.resolveFeeFlowControllerAddress(chainId);
		const feeFlowControllerUtilAddress =
			this.resolveFeeFlowControllerUtilAddress(chainId);
		const provider = this.providerService.getProvider(chainId);
		const [
			slot0Result,
			currentPrice,
			paymentToken,
			paymentReceiver,
			epochPeriod,
			priceMultiplier,
			minInitPrice,
		] = await provider.multicall({
			contracts: [
				{
					address: feeFlowControllerAddress,
					abi: FEE_FLOW_CONTROLLER_ABI,
					functionName: "getSlot0",
				},
				{
					address: feeFlowControllerAddress,
					abi: FEE_FLOW_CONTROLLER_ABI,
					functionName: "getPrice",
				},
				{
					address: feeFlowControllerAddress,
					abi: FEE_FLOW_CONTROLLER_ABI,
					functionName: "paymentToken",
				},
				{
					address: feeFlowControllerAddress,
					abi: FEE_FLOW_CONTROLLER_ABI,
					functionName: "paymentReceiver",
				},
				{
					address: feeFlowControllerAddress,
					abi: FEE_FLOW_CONTROLLER_ABI,
					functionName: "epochPeriod",
				},
				{
					address: feeFlowControllerAddress,
					abi: FEE_FLOW_CONTROLLER_ABI,
					functionName: "priceMultiplier",
				},
				{
					address: feeFlowControllerAddress,
					abi: FEE_FLOW_CONTROLLER_ABI,
					functionName: "minInitPrice",
				},
			],
			allowFailure: false,
		});

		const slot0: FeeFlowSlot0 = {
			locked: Number(slot0Result.locked),
			epochId: Number(slot0Result.epochId),
			initPrice: slot0Result.initPrice,
			startTime: Number(slot0Result.startTime),
		};

		const now = Math.floor(Date.now() / 1000);
		const endTime = slot0.startTime + Number(epochPeriod);
		const timeRemaining = Math.max(0, endTime - now);

		return {
			chainId,
			feeFlowControllerAddress,
			feeFlowControllerUtilAddress,
			paymentToken: getAddress(paymentToken) as Address,
			paymentReceiver: getAddress(paymentReceiver) as Address,
			epochPeriod,
			priceMultiplier,
			minInitPrice,
			currentPrice,
			slot0,
			now,
			endTime,
			timeRemaining,
		};
	}

	getEligibleVaults(vaults: EVault[], chainId?: number): EVault[] {
		if (vaults.length === 0) return [];

		const inferredChainId = chainId ?? vaults[0]?.chainId;
		if (inferredChainId === undefined) return [];

		const feeFlowControllerAddress =
			this.resolveFeeFlowControllerAddress(inferredChainId);
		return vaults.filter(
			(vault) =>
				vault.chainId === inferredChainId &&
				getAddress(vault.fees.protocolFeeReceiver) === feeFlowControllerAddress,
		);
	}

	async fetchBuyInventory(
		chainId: number,
		vaults: Address[] | EVault[],
	): Promise<FeeFlowVaultInventory[]> {
		if (!this.providerService) {
			throw new Error("FeeFlowService providerService is not set");
		}

		const vaultAddresses = this.normalizeVaultAddresses(vaults);
		if (vaultAddresses.length === 0) return [];
		const feeFlowControllerAddress =
			this.resolveFeeFlowControllerAddress(chainId);
		const provider = this.providerService.getProvider(chainId);
		const results = (await provider.multicall({
			contracts: vaultAddresses.flatMap((vault) => [
				{
					address: vault,
					abi: FEE_FLOW_VAULT_ABI,
					functionName: "protocolFeeReceiver",
				},
				{
					address: vault,
					abi: FEE_FLOW_VAULT_ABI,
					functionName: "protocolFeeShare",
				},
				{
					address: vault,
					abi: FEE_FLOW_VAULT_ABI,
					functionName: "accumulatedFeesAssets",
				},
				{
					address: vault,
					abi: FEE_FLOW_VAULT_ABI,
					functionName: "balanceOf",
					args: [feeFlowControllerAddress],
				},
			]),
			allowFailure: false,
		})) as unknown[];

		return vaultAddresses.map((vault, index) => {
			const offset = index * 4;
			const protocolFeeReceiver = getAddress(
				results[offset] as Address,
			) as Address;
			const protocolFeeShare = results[offset + 1] as bigint;
			const accumulatedFeesAssets = results[offset + 2] as bigint;
			const heldShares = results[offset + 3] as bigint;
			const claimableProtocolFeeAssets =
				(accumulatedFeesAssets * protocolFeeShare) / FEE_SHARE_SCALE;
			const eligible = protocolFeeReceiver === feeFlowControllerAddress;

			return {
				vault,
				protocolFeeReceiver,
				protocolFeeShare,
				accumulatedFeesAssets,
				claimableProtocolFeeAssets,
				heldShares,
				eligible,
				hasInventory:
					heldShares > 0n || (eligible && claimableProtocolFeeAssets > 0n),
			};
		});
	}

	async buildBuyPlan(args: BuildFeeFlowBuyPlanArgs): Promise<TransactionPlan> {
		const account = getAddress(args.account) as Address;
		const recipient = getAddress(args.recipient ?? args.account) as Address;
		const state = await this.fetchState(args.chainId);
		if (
			args.expectedEpochId !== undefined &&
			args.expectedEpochId !== state.slot0.epochId
		) {
			throw new Error(
				`FeeFlow epoch changed from ${args.expectedEpochId} to ${state.slot0.epochId}; refresh the selected inventory`,
			);
		}
		const buyTarget = state.feeFlowControllerUtilAddress;
		if (!buyTarget) {
			throw new Error(
				`FeeFlow controller util address not configured for chainId ${args.chainId}`,
			);
		}
		const spender = buyTarget;
		const vaults = this.normalizeVaultAddresses(args.vaults);

		if (vaults.length === 0) {
			throw new Error(
				"At least one vault is required to build a FeeFlow buy plan",
			);
		}

		const inventory = await this.fetchBuyInventory(args.chainId, vaults);
		const unavailableVaults = inventory.filter((item) => !item.hasInventory);
		if (unavailableVaults.length > 0) {
			throw new Error(
				`FeeFlow inventory is stale or empty for: ${unavailableVaults
					.map((item) => item.vault)
					.join(", ")}`,
			);
		}

		const deadline =
			args.deadline ??
			BigInt(Math.floor(Date.now() / 1000) + this.defaultBuyDeadlineSeconds);
		const maxPaymentTokenAmount =
			args.maxPaymentTokenAmount ?? state.currentPrice;

		const approval = {
			type: "requiredApproval" as const,
			token: state.paymentToken,
			owner: account,
			spender,
			amount: maxPaymentTokenAmount,
		};

		const contractCall: ContractCall = {
			type: "contractCall",
			chainId: args.chainId,
			to: buyTarget,
			abi: FEE_FLOW_CONTROLLER_ABI,
			functionName: "buy",
			args: [
				vaults,
				recipient,
				BigInt(state.slot0.epochId),
				deadline,
				maxPaymentTokenAmount,
			],
			value: 0n,
		};

		return [approval, contractCall];
	}

	private normalizeVaultAddresses(vaults: Address[] | EVault[]): Address[] {
		return [
			...new Map(
				vaults.map((vault) => {
					const address = getAddress(
						typeof vault === "string" ? vault : vault.address,
					) as Address;
					return [address.toLowerCase(), address] as const;
				}),
			).values(),
		];
	}

	private resolveFeeFlowControllerAddress(chainId: number): Address {
		const address =
			this.feeFlowControllerAddress ??
			this.deploymentService?.getDeployment(chainId).addresses.peripheryAddrs
				?.feeFlowController;
		if (!address) {
			throw new Error(
				`FeeFlow controller address not configured for chainId ${chainId}`,
			);
		}
		return getAddress(address) as Address;
	}

	private resolveFeeFlowControllerUtilAddress(
		chainId: number,
	): Address | undefined {
		const address =
			this.feeFlowControllerUtilAddress ??
			this.deploymentService?.getDeployment(chainId).addresses.peripheryAddrs
				?.feeFlowControllerUtil;
		return address ? (getAddress(address) as Address) : undefined;
	}
}
