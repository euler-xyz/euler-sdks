import {
	type Address,
	decodeFunctionData,
	decodeFunctionResult,
	encodeFunctionData,
	getAddress,
	type Hex,
	parseEther,
	type StateOverride,
	toFunctionSelector,
	zeroAddress,
} from "viem";
import { estimateContractGas } from "viem/actions";

// Minimal ABI for resolving a vault's underlying asset and reading wallet ERC20
// balances inside the simulated batch (per-layer wallet-balance capture).
const walletBalanceAbi = [
	{ type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
	{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
	{ type: "function", name: "underlying", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const merklClaimAbi = [
	{
		type: "function",
		name: "claim",
		inputs: [
			{ name: "users", type: "address[]" },
			{ name: "tokens", type: "address[]" },
			{ name: "amounts", type: "uint256[]" },
			{ name: "proofs", type: "bytes32[][]" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

const fuulClaimAbi = [
	{
		type: "function",
		name: "claim",
		inputs: [
			{
				name: "claimChecks",
				type: "tuple[]",
				components: [
					{ name: "projectAddress", type: "address" },
					{ name: "to", type: "address" },
					{ name: "currency", type: "address" },
					{ name: "currencyType", type: "uint8" },
					{ name: "amount", type: "uint256" },
					{ name: "reason", type: "uint8" },
					{ name: "tokenId", type: "uint256" },
					{ name: "deadline", type: "uint256" },
					{ name: "proof", type: "bytes32" },
					{ name: "signatures", type: "bytes[]" },
				],
			},
		],
		outputs: [],
		stateMutability: "payable",
	},
] as const;

const rewardStreamsClaimAbi = [
	{
		type: "function",
		name: "claimReward",
		inputs: [
			{ name: "rewarded", type: "address" },
			{ name: "reward", type: "address" },
			{ name: "to", type: "address" },
			{ name: "ignoreRecentReward", type: "bool" },
		],
		outputs: [{ name: "amount", type: "uint256" }],
		stateMutability: "nonpayable",
	},
] as const;

const MERKL_CLAIM_SELECTOR = toFunctionSelector(
	"function claim(address[],address[],uint256[],bytes32[][])",
);
const FUUL_CLAIM_SELECTOR = toFunctionSelector(
	"function claim((address,address,address,uint8,uint256,uint8,uint256,uint256,bytes32,bytes[])[])",
);
const REWARD_STREAM_CLAIM_SELECTOR = toFunctionSelector(
	"function claimReward(address,address,address,bool)",
);
const REUL_UNLOCK_SELECTOR = toFunctionSelector(
	"function withdrawToByLockTimestamp(address,uint256,bool)",
);
import {
	Account,
	type IAccount,
	type ISubAccount,
} from "../../entities/Account.js";
import { EulerEarn } from "../../entities/EulerEarn.js";
import { EVault } from "../../entities/EVault.js";
import {
	type DecodedSmartContractError,
	decodeSmartContractErrors,
} from "../../utils/decodeSmartContractErrors.js";
import { getApprovalOverrides } from "../../utils/stateOverrides/approvalOverrides.js";
import { getBalanceOverrides } from "../../utils/stateOverrides/balanceOverrides.js";
import { mergeStateOverrides } from "../../utils/stateOverrides/mergeStateOverrides.js";
import type { SlotHints } from "../../utils/stateOverrides/slotHints.js";
import { isSubAccount } from "../../utils/subAccounts.js";
import { VaultType } from "../../utils/types.js";
import type { AccountFetchOptions } from "../accountService/accountService.js";
import { accountLensAbi } from "../accountService/adapters/accountOnchainAdapter/abis/accountLensAbi.js";
import type {
	EVCAccountInfo,
	VaultAccountInfo,
} from "../accountService/adapters/accountOnchainAdapter/accountLensTypes.js";
import {
	AccountOnchainAdapter,
	getEVCAccountInfoLensBatchItem,
	getVaultAccountInfoLensBatchItem,
} from "../accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { IEulerLabelsService } from "../eulerLabelsService/index.js";
import type { IIntrinsicApyService } from "../intrinsicApyService/index.js";
import type { IPriceService } from "../priceService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type { IRewardsService } from "../rewardsService/index.js";
import { eulerEarnVaultLensAbi } from "../vaults/eulerEarnService/adapters/abis/eulerEarnVaultLensAbi.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "../vaults/eulerEarnService/adapters/eulerEarnInfoConverter.js";
import type { EulerEarnVaultInfoFull } from "../vaults/eulerEarnService/adapters/eulerEarnLensTypes.js";
import { getEulerEarnVaultInfoFullLensBatchItem } from "../vaults/eulerEarnService/adapters/eulerEarnOnchainAdapter.js";
import { vaultLensAbi } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/abis/vaultLensAbi.js";
import type { VaultInfoFull } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultLensTypes.js";
import { getVaultInfoFullLensBatchItem } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import { convertVaultInfoFullToIEVault } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/vaultInfoConverter.js";
import { SecuritizeCollateralVault } from "../../entities/SecuritizeCollateralVault.js";
import { utilsLensAbi } from "../vaults/securitizeVaultService/adapters/abis/utilsLensAbi.js";
import { erc4626EvcCollateralSecuritizeAbi } from "../vaults/securitizeVaultService/adapters/abis/erc4626EvcCollateralSecuritizeAbi.js";
import type { VaultInfoERC4626 } from "../vaults/securitizeVaultService/adapters/securitizeVaultLensTypes.js";
import { convertToISecuritizeCollateralVault } from "../vaults/securitizeVaultService/adapters/securitizeVaultInfoConverter.js";
import {
	getVaultInfoERC4626LensBatchItem,
	getSecuritizeGovernorAdminBatchItem,
	getSecuritizeSupplyCapResolvedBatchItem,
} from "../vaults/securitizeVaultService/adapters/securitizeVaultOnchainAdapter.js";
import type { DataIssue } from "../../utils/entityDiagnostics.js";
import type { VaultFetchOptions } from "../vaults/index.js";
import type {
	IVaultMetaService,
	VaultEntity,
} from "../vaults/vaultMetaService/index.js";
import type { IWalletService } from "../walletService/index.js";
import { ethereumVaultConnectorAbi } from "./abis/ethereumVaultConnectorAbi.js";
import type {
	BatchItemDescription,
	EVCBatchItem,
	RequiredApproval,
	TransactionPlan,
} from "./executionServiceTypes.js";
import {
	assertNoCowSwapPlanItems,
	flattenBatchEntries,
	isEVCBatchOperation,
} from "./executionServiceTypes.js";

type BatchItemResult = {
	success: boolean;
	result: Hex;
};

type StatusCheckResult = {
	isValid: boolean;
	checkedAddress: Address;
	result: Hex;
};

export type SimulationInsufficientRequirement = {
	token: Address;
	amount: bigint;
};

export interface SimulateBatchResult<
	TVaultEntity extends VaultEntity = VaultEntity,
> {
	/**
	 * Per-layer simulated account snapshots: index 0 = pre-batch (real) state,
	 * index i = state after operation i. The last entry is the final state.
	 */
	simulatedAccounts: Account<TVaultEntity>[];
	/** Final-layer vault snapshots (the last entry of `simulatedVaultsLayers`). */
	simulatedVaults: TVaultEntity[];
	/** Per-layer vault snapshots aligned with `simulatedAccounts`. */
	simulatedVaultsLayers?: TVaultEntity[][];
	/**
	 * Per-layer wallet ERC20 balances (lowercased token address → balance) for the
	 * underlying assets of touched vaults, aligned with `simulatedAccounts`.
	 * Balances are forged by state overrides, so consumers should stitch using the
	 * delta vs layer 0.
	 */
	simulatedWalletBalances?: Record<string, bigint>[];
	canExecute: boolean;
	rawBatchResults?: BatchItemResult[];
	failedBatchItems?: Array<{
		index: number;
		/** Index of the operation (cart entry) this batch item belongs to. */
		operationIndex?: number;
		/** Name of the operation (e.g. "deposit", "withdraw"), when known. */
		operationName?: string;
		item: BatchItemDescription;
		error: Hex;
		decodedError: DecodedSmartContractError[];
	}>;
	simulationError?: { error: unknown; decoded: DecodedSmartContractError[] };
	accountStatusErrors?: Array<{
		account: Address;
		error: Hex;
		decoded: DecodedSmartContractError[];
	}>;
	vaultStatusErrors?: Array<{
		vault: Address;
		error: Hex;
		decoded: DecodedSmartContractError[];
	}>;
	/**
	 * Tokens the batch overdraws from the real wallet, accounting for intra-batch
	 * funding. Computed from the per-layer wallet balances: tracking the running
	 * real balance (real on-chain balance + each step's net inflow/outflow), the
	 * shortfall is the worst dip below zero across all steps. This nets out
	 * self-funding (e.g. withdraw-then-deposit the same asset) and still catches a
	 * step that consumes more than is genuinely available at that point.
	 */
	insufficientWalletAssets?: SimulationInsufficientRequirement[];
	insufficientPermit2Allowances?: SimulationInsufficientRequirement[];
	insufficientDirectAllowances?: SimulationInsufficientRequirement[];
}

export type SimulateBatchOptions = {
	/** When true, fetches state overrides internally from the transaction plan before simulation. */
	stateOverrides?: boolean;
	stateOverrideOptions?: SimulationStateOverrideOptions;
	vaultFetchOptions?: VaultFetchOptions;
	accountFetchOptions?: AccountFetchOptions;
};

export type EstimateGasForTransactionPlanOptions = {
	/** When true, fetches state overrides internally from the transaction plan before gas estimation. */
	stateOverrides?: boolean;
	stateOverrideOptions?: SimulationStateOverrideOptions;
};

export type SimulationStateOverrideOptions = {
	/** Override the native (ETH) balance. Defaults to 1000 ETH. Set to 0n to skip. */
	nativeBalance?: bigint;
	/**
	 * Skip ERC20 balance overrides entirely. Use when the caller has already
	 * validated that the account holds sufficient funds (e.g. UI form
	 * validation). Drops per-call `balanceOf` and balance-slot discovery RPCs.
	 */
	noBalanceOverride?: boolean;
	/**
	 * Skip ERC20 allowance overrides. Permit2 storage-slot overrides are
	 * always emitted (they cost no RPC). Use when the caller knows the
	 * account has already approved the relevant spenders.
	 */
	noAllowanceOverride?: boolean;
	/**
	 * Caller-supplied wallet snapshot. Lets the SDK skip per-call balance/
	 * allowance RPCs when the supplied values already cover the requirement.
	 */
	wallet?: {
		balances?: Record<Address, bigint>;
		allowances?: Record<`${Address}:${Address}`, bigint>;
	};
	/**
	 * Caller-supplied storage-slot hints, owner-/spender-agnostic. When
	 * present, the SDK derives slots cryptographically and bypasses
	 * `eth_createAccessList` discovery. Pre-fetch with `fetchErc20SlotHints`
	 * once per token and pass it on every simulate/estimate call to amortise.
	 */
	slotHints?: SlotHints;
};

type LensMeta =
	| { kind: "eVault"; vault: Address }
	| { kind: "eulerEarn"; vault: Address }
	| { kind: "securitizeInfo"; vault: Address }
	| { kind: "securitizeGovernor"; vault: Address }
	| { kind: "securitizeSupplyCap"; vault: Address }
	| { kind: "evcAccount"; subAccount: Address }
	| { kind: "vaultAccount"; subAccount: Address; vault: Address }
	| { kind: "walletBalance"; token: Address };

export type ExecutionSimulationContext<
	TVaultEntity extends VaultEntity = VaultEntity,
> = {
	deploymentService: IDeploymentService;
	walletService?: IWalletService;
	providerService?: ProviderService;
	vaultMetaService?: IVaultMetaService<TVaultEntity>;
	priceService?: IPriceService;
	rewardsService?: IRewardsService;
	intrinsicApyService?: IIntrinsicApyService;
	eulerLabelsService?: IEulerLabelsService;
	describeBatch: (batch: readonly EVCBatchItem[]) => BatchItemDescription[];
};

export async function deriveStateOverrides(
	ctx: ExecutionSimulationContext,
	chainId: number,
	account: Address,
	transactionPlan: TransactionPlan,
	options?: SimulationStateOverrideOptions,
): Promise<StateOverride> {
	assertNoCowSwapPlanItems(transactionPlan, "deriveStateOverrides");

	const owner = getAddress(account);
	const nativeBalance = options?.nativeBalance ?? parseEther("1000");
	const noBalanceOverride = options?.noBalanceOverride ?? false;
	const noAllowanceOverride = options?.noAllowanceOverride ?? false;
	const wallet = options?.wallet;
	const slotHints = options?.slotHints;

	const balanceRequirements = noBalanceOverride
		? []
		: extractBalanceRequirements(transactionPlan, owner);
	const approvalRequirements = extractApprovalRequirements(
		transactionPlan,
		owner,
	);

	// Fast path: plans without `requiredApproval` items (e.g. withdraw, redeem)
	// have no balance or approval requirements to override. We can skip the
	// provider lookup and per-token balance/allowance reads entirely and just
	// emit the synthetic native-balance override.
	if (
		balanceRequirements.length === 0 &&
		(approvalRequirements.length === 0 || noAllowanceOverride)
	) {
		// Approval requirements with `noAllowanceOverride` still need the
		// Permit2 deterministic overrides — those cost no RPC.
		if (approvalRequirements.length > 0 && noAllowanceOverride) {
			const permit2Address =
				ctx.deploymentService.getDeployment(chainId).addresses.coreAddrs
					.permit2;
			if (!ctx.providerService) {
				throw new Error(
					"ExecutionService.deriveStateOverrides requires a providerService. Pass it to the ExecutionService constructor or call setProviderService().",
				);
			}
			const provider = ctx.providerService.getProvider(chainId);
			const permit2Only = await getApprovalOverrides(
				provider,
				owner,
				approvalRequirements,
				permit2Address,
				{
					walletAllowances: wallet?.allowances,
					slotHints,
				},
			);
			const merged: StateOverride = [];
			if (nativeBalance > 0n)
				merged.push({ address: owner, balance: nativeBalance });
			// Drop ERC20 entries; keep only the Permit2 deterministic block.
			for (const ov of permit2Only) {
				if (getAddress(ov.address) === getAddress(permit2Address)) merged.push(ov);
			}
			return mergeStateOverrides(merged);
		}
		return nativeBalance > 0n
			? mergeStateOverrides([{ address: owner, balance: nativeBalance }])
			: [];
	}

	if (!ctx.providerService) {
		throw new Error(
			"ExecutionService.deriveStateOverrides requires a providerService. Pass it to the ExecutionService constructor or call setProviderService().",
		);
	}

	const permit2Address =
		ctx.deploymentService.getDeployment(chainId).addresses.coreAddrs.permit2;
	const provider = ctx.providerService.getProvider(chainId);

	const [balanceOverrides, approvalOverrides] = await Promise.all([
		getBalanceOverrides(provider, owner, balanceRequirements, {
			walletBalances: wallet?.balances,
			slotHints,
		}),
		noAllowanceOverride
			? Promise.resolve([] as StateOverride)
			: getApprovalOverrides(
					provider,
					owner,
					approvalRequirements,
					permit2Address,
					{
						walletAllowances: wallet?.allowances,
						slotHints,
					},
				),
	]);

	const allOverrides: StateOverride = [];
	if (nativeBalance > 0n) {
		allOverrides.push({ address: owner, balance: nativeBalance });
	}
	allOverrides.push(...balanceOverrides);
	allOverrides.push(...approvalOverrides);

	return mergeStateOverrides(allOverrides);
}

export async function simulateTransactionPlan<
	TVaultEntity extends VaultEntity = VaultEntity,
>(
	ctx: ExecutionSimulationContext<TVaultEntity>,
	chainId: number,
	account: Address,
	transactionPlan: TransactionPlan,
	options?: SimulateBatchOptions,
): Promise<SimulateBatchResult<TVaultEntity>> {
	assertNoCowSwapPlanItems(transactionPlan, "simulateTransactionPlan");
	const owner = getAddress(account);
	const useStateOverrides = options?.stateOverrides ?? true;
	let effectiveStateOverrides: StateOverride | undefined;
	if (useStateOverrides) {
		effectiveStateOverrides = await deriveStateOverrides(
			ctx,
			chainId,
			owner,
			transactionPlan,
			options?.stateOverrideOptions,
		);
	}

	// Preserve operation boundaries (EVCBatchOperation entries emitted by the
	// planners / mergePlans) so reverts can be attributed to the operation that
	// caused them and so we can snapshot state after each operation.
	const operations = collectOperations(transactionPlan);
	const batch = operations.flatMap((op) => op.items);
	if (batch.length === 0) {
		return {
			simulatedAccounts: [],
			simulatedVaults: [],
			canExecute: false,
		};
	}
	const diagnostics = await fetchSimulationDiagnostics(
		ctx,
		chainId,
		owner,
		transactionPlan,
	);
	const { lensItems, lensMeta, evcAddress } = await buildSimulationBatch(
		ctx,
		chainId,
		owner,
		operations,
		extractBalanceRequirements(transactionPlan, owner).map(([token]) => token),
	);

	// Assemble the EVC batch, interleaving a lens-read block before the first
	// operation (layer 0 = real state) and one after every operation (layer i =
	// state after op i), so the full per-layer history is always captured.
	const fullBatch: EVCBatchItem[] = [];
	const actionPositions: number[] = []; // fullBatch indices of real items, in `batch` order
	const opOfPosition: number[] = []; // operation index for each action position
	const layerSlices: Array<{ lensStart: number }> = [];
	const pushLensBlock = () => {
		layerSlices.push({ lensStart: fullBatch.length });
		for (const it of lensItems) fullBatch.push(it);
	};
	const pushOperation = (op: { items: EVCBatchItem[] }, opIndex: number) => {
		for (const it of op.items) {
			actionPositions.push(fullBatch.length);
			opOfPosition.push(opIndex);
			fullBatch.push(it);
		}
	};
	pushLensBlock();
	for (let i = 0; i < operations.length; i++) {
		pushOperation(operations[i]!, i);
		pushLensBlock();
	}
	const totalValue = fullBatch.reduce((sum, item) => sum + item.value, 0n);

	const simulationResult = await runSimulation(
		ctx,
		chainId,
		account,
		evcAddress,
		fullBatch,
		totalValue,
		effectiveStateOverrides,
	);
	if ("simulationError" in simulationResult) {
		return {
			...simulationResult,
			canExecute: false,
			...diagnostics,
		};
	}

	const { batchResults, accountStatusErrors, vaultStatusErrors } =
		simulationResult;

	const rawBatchResults = actionPositions.map((pos) => batchResults[pos]!);
	let describedBatch: BatchItemDescription[] | undefined;
	try {
		describedBatch = ctx.describeBatch(batch);
	} catch {
		describedBatch = undefined;
	}
	const fallbackDescription = (item: EVCBatchItem): BatchItemDescription => ({
		targetContract: item.targetContract,
		onBehalfOfAccount: item.onBehalfOfAccount,
		functionName: "Unknown",
		args: {},
	});
	const failedBatchItems = (
		await Promise.all(
			rawBatchResults.map(async (itemResult, index) => {
				if (!itemResult || itemResult.success) return null;
				const decodedError = await decodeSmartContractErrors(itemResult.result);
				const decodedItem =
					describedBatch && describedBatch.length === batch.length
						? describedBatch[index]!
						: fallbackDescription(batch[index]!);
				const operationIndex = opOfPosition[index];
				return {
					index,
					operationIndex,
					operationName: operations[operationIndex!]?.name,
					item: decodedItem,
					error: itemResult.result,
					decodedError,
				};
			}),
		)
	).filter(
		(
			item,
		): item is {
			index: number;
			operationIndex: number | undefined;
			operationName: string | undefined;
			item: BatchItemDescription;
			error: Hex;
			decodedError: DecodedSmartContractError[];
		} => item !== null,
	);

	// One account/vault/wallet snapshot per layer: [pre-batch, after op0, after op1, …].
	const snapshots: Array<{
		account: Account<TVaultEntity>;
		vaults: TVaultEntity[];
		walletBalances: Record<string, bigint>;
	}> = [];
	for (const slice of layerSlices) {
		snapshots.push(
			await decodeAccountSnapshot<TVaultEntity>(
				ctx,
				chainId,
				owner,
				lensMeta,
				(i) => batchResults[slice.lensStart + i],
				options,
			),
		);
	}
	const simulatedAccounts = snapshots.map((s) => s.account);
	const simulatedVaultsLayers = snapshots.map((s) => s.vaults);
	const simulatedVaults =
		simulatedVaultsLayers[simulatedVaultsLayers.length - 1] ?? [];
	const simulatedWalletBalances = snapshots.map((s) => s.walletBalances);

	// Accurate wallet shortfall from the per-layer balances (running-min over the
	// real-anchored balance), which nets out intra-batch funding. Prefer it when
	// available; if wallet deltas could not be observed, keep the static
	// requiredApproval diagnostic from fetchSimulationDiagnostics.
	const computedWalletShortfall = await computeWalletShortfall(
		ctx,
		chainId,
		owner,
		simulatedWalletBalances,
	);
	const insufficientWalletAssets =
		computedWalletShortfall === undefined
			? diagnostics.insufficientWalletAssets
			: computedWalletShortfall.length > 0
				? computedWalletShortfall
				: undefined;

	const canExecute =
		failedBatchItems.length === 0 &&
		accountStatusErrors.length === 0 &&
		vaultStatusErrors.length === 0 &&
		!insufficientWalletAssets?.length &&
		!diagnostics.insufficientPermit2Allowances?.length &&
		!diagnostics.insufficientDirectAllowances?.length;

	return {
		simulatedAccounts,
		simulatedVaults,
		simulatedVaultsLayers,
		simulatedWalletBalances,
		canExecute,
		rawBatchResults,
		failedBatchItems:
			failedBatchItems.length > 0 ? failedBatchItems : undefined,
		accountStatusErrors:
			accountStatusErrors.length > 0 ? accountStatusErrors : undefined,
		vaultStatusErrors:
			vaultStatusErrors.length > 0 ? vaultStatusErrors : undefined,
		...diagnostics,
		insufficientWalletAssets,
	};
}

// Walk the plan preserving EVCBatchOperation boundaries. Each operation entry
// is one layer boundary; bare items become their own single-item op.
type SimulationOperation = {
	name: string | undefined;
	items: EVCBatchItem[];
	walletBalanceTokens?: Address[];
};

function collectOperations(transactionPlan: TransactionPlan): SimulationOperation[] {
	const operations: SimulationOperation[] = [];
	for (const item of transactionPlan) {
		if (item.type !== "evcBatch") continue;
		for (const entry of item.items) {
			if (isEVCBatchOperation(entry)) {
				operations.push({
					name: entry.name,
					items: entry.items,
					walletBalanceTokens: entry.walletBalanceTokens,
				});
			} else {
				operations.push({ name: undefined, items: [entry] });
			}
		}
	}
	return operations;
}

const addWalletToken = (
	tokens: Set<Address>,
	token: string | Address | undefined,
) => {
	if (!token) return;
	try {
		const checksum = getAddress(token) as Address;
		if (checksum !== zeroAddress) tokens.add(checksum);
	} catch {
		// Ignore malformed optional metadata / decoded calldata.
	}
};

const getSelector = (data: Hex): Hex => data.slice(0, 10) as Hex;

function collectClaimWalletBalanceTokens(batch: EVCBatchItem[]): Address[] {
	const tokens = new Set<Address>();

	for (const item of batch) {
		const selector = getSelector(item.data);
		try {
			if (selector === MERKL_CLAIM_SELECTOR) {
				const decoded = decodeFunctionData({
					abi: merklClaimAbi,
					data: item.data,
				});
				const rewardTokens = decoded.args[1] as readonly Address[];
				for (const token of rewardTokens) addWalletToken(tokens, token);
				continue;
			}

			if (selector === FUUL_CLAIM_SELECTOR) {
				const decoded = decodeFunctionData({
					abi: fuulClaimAbi,
					data: item.data,
				});
				const claimChecks = decoded.args[0] as readonly {
					currency: Address;
				}[];
				for (const check of claimChecks) {
					addWalletToken(tokens, check.currency);
				}
				continue;
			}

			if (selector === REWARD_STREAM_CLAIM_SELECTOR) {
				const decoded = decodeFunctionData({
					abi: rewardStreamsClaimAbi,
					data: item.data,
				});
				addWalletToken(tokens, decoded.args[1] as Address);
			}
		} catch {
			// Unknown or malformed claim-like calldata should not block simulation.
		}
	}

	return [...tokens];
}

// Decode the lens-read block for a single layer into a populated Account plus
// the EVault/EulerEarn entities observed at that point in the batch.
async function decodeAccountSnapshot<
	TVaultEntity extends VaultEntity = VaultEntity,
>(
	ctx: ExecutionSimulationContext<TVaultEntity>,
	chainId: number,
	owner: Address,
	lensMeta: LensMeta[],
	resultAt: (index: number) => BatchItemResult | undefined,
	options?: SimulateBatchOptions,
): Promise<{
	account: Account<TVaultEntity>;
	vaults: TVaultEntity[];
	walletBalances: Record<string, bigint>;
}> {
	const vaultsByAddress = new Map<Address, VaultEntity>();
	const evcInfos = new Map<Address, EVCAccountInfo>();
	const vaultInfosBySub = new Map<Address, VaultAccountInfo[]>();
	const walletBalances: Record<string, bigint> = {};
	// Securitize collateral vaults are assembled from three separate reads
	// (ERC4626 info via UtilsLens, plus governorAdmin and supplyCapResolved read
	// directly off the vault), keyed by vault address and stitched after the loop.
	const securitizeInfos = new Map<Address, VaultInfoERC4626>();
	const securitizeGovernors = new Map<Address, Address>();
	const securitizeSupplyCaps = new Map<Address, bigint>();

	for (let i = 0; i < lensMeta.length; i++) {
		const meta = lensMeta[i]!;
		const resultItem = resultAt(i);
		if (!resultItem?.success) continue;

		if (meta.kind === "walletBalance") {
			const bal = decodeFunctionResult({
				abi: walletBalanceAbi,
				functionName: "balanceOf",
				data: resultItem.result,
			}) as unknown as bigint;
			walletBalances[getAddress(meta.token).toLowerCase()] = bal;
			continue;
		}

		if (meta.kind === "eVault") {
			const decodedVault = decodeFunctionResult({
				abi: vaultLensAbi,
				functionName: "getVaultInfoFull",
				data: resultItem.result,
			}) as unknown as VaultInfoFull;
			const entity = new EVault(
				convertVaultInfoFullToIEVault(decodedVault, chainId, []),
			);
			vaultsByAddress.set(getAddress(meta.vault), entity);
		}

		if (meta.kind === "eulerEarn") {
			const decodedVault = decodeFunctionResult({
				abi: eulerEarnVaultLensAbi,
				functionName: "getVaultInfoFull",
				data: resultItem.result,
			}) as unknown as EulerEarnVaultInfoFull;
			const entity = new EulerEarn(
				convertEulerEarnVaultInfoFullToIEulerEarn(decodedVault, chainId, []),
			);
			vaultsByAddress.set(getAddress(meta.vault), entity);
		}

		if (meta.kind === "securitizeInfo") {
			const decoded = decodeFunctionResult({
				abi: utilsLensAbi,
				functionName: "getVaultInfoERC4626",
				data: resultItem.result,
			}) as unknown as VaultInfoERC4626;
			securitizeInfos.set(getAddress(meta.vault), decoded);
		}

		if (meta.kind === "securitizeGovernor") {
			const decoded = decodeFunctionResult({
				abi: erc4626EvcCollateralSecuritizeAbi,
				functionName: "governorAdmin",
				data: resultItem.result,
			}) as unknown as Address;
			securitizeGovernors.set(getAddress(meta.vault), decoded);
		}

		if (meta.kind === "securitizeSupplyCap") {
			const decoded = decodeFunctionResult({
				abi: erc4626EvcCollateralSecuritizeAbi,
				functionName: "supplyCapResolved",
				data: resultItem.result,
			}) as unknown as bigint;
			securitizeSupplyCaps.set(getAddress(meta.vault), decoded);
		}

		if (meta.kind === "evcAccount") {
			const decodedAccount = decodeFunctionResult({
				abi: accountLensAbi,
				functionName: "getEVCAccountInfo",
				data: resultItem.result,
			}) as unknown as EVCAccountInfo;
			evcInfos.set(getAddress(meta.subAccount), decodedAccount);
		}

		if (meta.kind === "vaultAccount") {
			const decodedVaultInfo = decodeFunctionResult({
				abi: accountLensAbi,
				functionName: "getVaultAccountInfo",
				data: resultItem.result,
			}) as unknown as VaultAccountInfo;
			const key = getAddress(meta.subAccount);
			const list = vaultInfosBySub.get(key) ?? [];
			list.push(decodedVaultInfo);
			vaultInfosBySub.set(key, list);
		}
	}

	// Stitch the three Securitize reads into vault entities. Skip any vault whose
	// governor/supply-cap read failed (kept undefined) so a partial read degrades
	// to "no entity" rather than throwing — mirrors the per-vault tolerance above.
	for (const [vault, info] of securitizeInfos.entries()) {
		const governor = securitizeGovernors.get(vault);
		const supplyCap = securitizeSupplyCaps.get(vault);
		if (governor === undefined || supplyCap === undefined) continue;
		const conversionErrors: DataIssue[] = [];
		const entity = new SecuritizeCollateralVault(
			convertToISecuritizeCollateralVault(
				info,
				governor,
				supplyCap,
				chainId,
				conversionErrors,
			),
		);
		vaultsByAddress.set(vault, entity);
	}

	const simulatedVaults = Array.from(
		vaultsByAddress.values(),
	) as TVaultEntity[];

	const vaultFetchOptions =
		options?.vaultFetchOptions ??
		options?.accountFetchOptions?.vaultFetchOptions;
	const shouldPopulateVaultMarketPrices =
		vaultFetchOptions?.populateMarketPrices ?? true;

	if (vaultFetchOptions?.populateCollaterals) {
		if (!ctx.vaultMetaService) {
			throw new Error(
				"ExecutionService.simulateTransactionPlan requires a vaultMetaService when populateCollaterals is enabled. Pass it to the ExecutionService constructor or call setVaultMetaService().",
			);
		}

		await Promise.all(
			simulatedVaults.map(async (vault) => {
				if (vault instanceof EVault) {
					await vault.populateCollaterals(ctx.vaultMetaService!);
				}
			}),
		);
	}

	if (shouldPopulateVaultMarketPrices && ctx.priceService) {
		await Promise.all(
			simulatedVaults.map(async (vault) => {
				if (typeof (vault as any).populateMarketPrices === "function") {
					await (vault as any).populateMarketPrices(ctx.priceService!);
				}
			}),
		);
	}

	if (vaultFetchOptions?.populateRewards && ctx.rewardsService) {
		await ctx.rewardsService.populateRewards(simulatedVaults as any);
	}

	if (vaultFetchOptions?.populateIntrinsicApy && ctx.intrinsicApyService) {
		await ctx.intrinsicApyService.populateIntrinsicApy(simulatedVaults as any);
	}

	if (vaultFetchOptions?.populateLabels && ctx.eulerLabelsService) {
		await ctx.eulerLabelsService.populateLabels(simulatedVaults as any);
	}

	const builtSubAccounts: ISubAccount[] = [];
	const accountAdapter = getAccountAdapter(ctx, "simulateTransactionPlan");
	for (const [subAccount, evcInfo] of evcInfos.entries()) {
		const vaultInfos = vaultInfosBySub.get(subAccount) ?? [];
		const built = accountAdapter.buildSubAccount(
			chainId,
			evcInfo,
			vaultInfos,
			[],
		);
		const {
			isLockdownMode: _lm,
			isPermitDisabledMode: _pm,
			...subAccountData
		} = built;
		builtSubAccounts.push(subAccountData);
	}

	const mainEvc = evcInfos.get(owner);
	const accountData: IAccount = accountAdapter.buildAccount(
		chainId,
		owner,
		builtSubAccounts,
		mainEvc?.enabledCollaterals ?? [],
		mainEvc?.enabledControllers ?? [],
		mainEvc?.isLockdownMode ?? false,
		mainEvc?.isPermitDisabledMode ?? false,
	);

	const simulatedAccount = new Account<never>(accountData);
	const populatedAccount =
		simulatedAccount.mapVaultsToPositions(simulatedVaults);
	const accountFetchOptions = options?.accountFetchOptions;
	const shouldPopulateAccountMarketPrices =
		accountFetchOptions?.populateMarketPrices ?? true;

	if (shouldPopulateAccountMarketPrices && ctx.priceService) {
		await populatedAccount.populateMarketPrices(ctx.priceService);
	}

	if (accountFetchOptions?.populateUserRewards && ctx.rewardsService) {
		await populatedAccount.populateUserRewards(ctx.rewardsService);
	}

	return { account: populatedAccount, vaults: simulatedVaults, walletBalances };
}

export async function estimateGasForTransactionPlan(
	ctx: ExecutionSimulationContext,
	chainId: number,
	account: Address,
	transactionPlan: TransactionPlan,
	options?: EstimateGasForTransactionPlanOptions,
): Promise<bigint> {
	assertNoCowSwapPlanItems(transactionPlan, "estimateGasForTransactionPlan");
	if (!ctx.providerService) {
		throw new Error(
			"ExecutionService.estimateGasForTransactionPlan requires a providerService. Pass it to the ExecutionService constructor or call setProviderService().",
		);
	}

	const owner = getAddress(account);
	const useStateOverrides = options?.stateOverrides ?? true;
	const stateOverride = useStateOverrides
		? await deriveStateOverrides(
				ctx,
				chainId,
				owner,
				transactionPlan,
				options?.stateOverrideOptions,
			)
		: undefined;
	const provider = ctx.providerService.getProvider(chainId);
	const evcAddress =
		ctx.deploymentService.getDeployment(chainId).addresses.coreAddrs.evc;

	let totalGas = 0n;
	for (const item of transactionPlan) {
		if (item.type === "requiredApproval") continue;

		if (item.type === "evcBatch") {
			const batchItems = flattenBatchEntries(item.items);
			const value = batchItems.reduce(
				(sum, batchItem) => sum + batchItem.value,
				0n,
			);
			totalGas += await estimateContractGas(provider, {
				account: owner,
				address: evcAddress,
				abi: ethereumVaultConnectorAbi,
				functionName: "batch",
				args: [batchItems],
				value,
				stateOverride,
			});
			continue;
		}

		if (item.type === "cowSwap") {
			throw new Error(
				"ExecutionService.estimateGasForTransactionPlan does not support CoW swap plans. Use executeCowSwapTransactionPlan.",
			);
		}

		if (item.chainId !== chainId) {
			throw new Error(
				`Cannot estimate transaction plan item for chain ${item.chainId} with provider for chain ${chainId}`,
			);
		}

		totalGas += await estimateContractGas(provider, {
			account: owner,
			address: item.to,
			abi: item.abi,
			functionName: item.functionName as never,
			args: item.args as never,
			value: item.value,
			stateOverride,
		});
	}

	return totalGas;
}

function getAccountAdapter(
	ctx: ExecutionSimulationContext,
	methodName: string,
): AccountOnchainAdapter {
	if (!ctx.providerService) {
		throw new Error(
			`ExecutionService.${methodName} requires a providerService. Pass it to the ExecutionService constructor or call setProviderService().`,
		);
	}

	const emptyPositionsAdapter = { fetchAccountVaults: async () => ({}) };
	return new AccountOnchainAdapter(
		ctx.providerService,
		ctx.deploymentService as never,
		emptyPositionsAdapter,
	);
}

async function buildSimulationBatch(
	ctx: ExecutionSimulationContext,
	chainId: number,
	owner: Address,
	operations: SimulationOperation[],
	requiredWalletBalanceTokens: Address[] = [],
): Promise<{
	lensItems: EVCBatchItem[];
	lensMeta: LensMeta[];
	evcAddress: Address;
}> {
	const batch = operations.flatMap((op) => op.items);
	const { candidateVaults, subAccountVaults } = collectCandidateVaults(
		ctx,
		owner,
		batch,
	);

	// Each touched sub-account's account-level liquidity (health factor, current
	// LTV, collateral/liability values) rides on its *controller* vault's
	// getVaultAccountInfo. An op that only touches collateral vaults (e.g. a
	// collateral withdraw or supply) wouldn't otherwise read the controller, so
	// the simulated liquidity would stay at the pre-batch (stale) state. Pull each
	// touched sub-account's enabled controllers and read them too, so liquidity is
	// recomputed post-op for every operation, not just borrows/repays.
	const ctrlProvider = ctx.providerService?.getProvider(chainId);
	const touchedSubs = Array.from(subAccountVaults.keys());
	if (ctrlProvider && touchedSubs.length) {
		const evc = ctx.deploymentService.getDeployment(chainId).addresses.coreAddrs
			.evc;
		try {
			const controllerResults = await ctrlProvider.multicall({
				allowFailure: true,
				contracts: touchedSubs.map((sub) => ({
					address: evc,
					abi: ethereumVaultConnectorAbi,
					functionName: "getControllers",
					args: [sub],
				})),
			});
			touchedSubs.forEach((sub, i) => {
				const r = controllerResults[i];
				if (r?.status !== "success") return;
				for (const controller of (r.result as unknown as Address[]) ?? []) {
					const c = getAddress(controller);
					subAccountVaults.get(sub)?.add(c);
					candidateVaults.add(c);
				}
			});
		} catch {
			// Best-effort: if controllers can't be fetched, liquidity may stay stale
			// for collateral-only ops, but the simulation itself is unaffected.
		}
	}

	const vaultCandidatesList = Array.from(candidateVaults);
	if (!ctx.vaultMetaService) {
		throw new Error(
			"ExecutionService.simulateTransactionPlan requires a vaultMetaService. Pass it to the ExecutionService constructor or call setVaultMetaService().",
		);
	}
	const vaultTypes = await ctx.vaultMetaService.fetchVaultTypes(
		chainId,
		vaultCandidatesList,
	);

	const validVaults = new Set<Address>();
	const eVaults: Address[] = [];
	const eulerEarnVaults: Address[] = [];
	const securitizeVaults: Address[] = [];

	for (const vault of vaultCandidatesList) {
		const key = getAddress(vault);
		const type = vaultTypes[key];
		if (!type) continue;
		validVaults.add(key);
		if (type === VaultType.EVault) eVaults.push(key);
		if (type === VaultType.EulerEarn) eulerEarnVaults.push(key);
		// Securitize RWA collaterals are real Euler collateral vaults; keep them in
		// validVaults so their per-account position (getVaultAccountInfo) is read,
		// and queue the dedicated reads below so the vault entity is resolved too.
		if (type === VaultType.SecuritizeCollateral) securitizeVaults.push(key);
	}

	const deployment = ctx.deploymentService.getDeployment(chainId);
	const accountLensAddress = deployment.addresses.lensAddrs.accountLens;
	const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;
	const eulerEarnLensAddress =
		deployment.addresses.lensAddrs.eulerEarnVaultLens;
	const utilsLensAddress = deployment.addresses.lensAddrs.utilsLens;
	const evcAddress = deployment.addresses.coreAddrs.evc;

	const lensItems: EVCBatchItem[] = [];
	const lensMeta: LensMeta[] = [];

	const pushLensItem = (item: EVCBatchItem, meta: LensMeta) => {
		lensItems.push(item);
		lensMeta.push(meta);
	};

	for (const vault of eVaults) {
		pushLensItem(
			getVaultInfoFullLensBatchItem(vaultLensAddress, vault, owner),
			{
				kind: "eVault",
				vault,
			},
		);
	}

	for (const vault of eulerEarnVaults) {
		pushLensItem(
			getEulerEarnVaultInfoFullLensBatchItem(
				eulerEarnLensAddress,
				vault,
				owner,
			),
			{
				kind: "eulerEarn",
				vault,
			},
		);
	}

	for (const vault of securitizeVaults) {
		pushLensItem(getVaultInfoERC4626LensBatchItem(utilsLensAddress, vault, owner), {
			kind: "securitizeInfo",
			vault,
		});
		pushLensItem(getSecuritizeGovernorAdminBatchItem(vault, owner), {
			kind: "securitizeGovernor",
			vault,
		});
		pushLensItem(getSecuritizeSupplyCapResolvedBatchItem(vault, owner), {
			kind: "securitizeSupplyCap",
			vault,
		});
	}

	for (const [subAccount, vaults] of subAccountVaults.entries()) {
		pushLensItem(
			getEVCAccountInfoLensBatchItem(
				accountLensAddress,
				evcAddress,
				subAccount,
				owner,
			),
			{
				kind: "evcAccount",
				subAccount,
			},
		);

		for (const vault of vaults) {
			if (!validVaults.has(getAddress(vault))) continue;
			pushLensItem(
				getVaultAccountInfoLensBatchItem(
					accountLensAddress,
					subAccount,
					vault,
					owner,
				),
				{
					kind: "vaultAccount",
					subAccount,
					vault,
				},
			);
		}
	}

	// Wallet-balance reads: resolve the underlying asset of each touched vault,
	// plus reward tokens from claim/unlock operations, and read balanceOf(owner)
	// for each token. Interleaved per layer like the other lens reads, so wallet
	// balances are captured after every operation. Balances are forged by state
	// overrides, so consumers stitch using the delta vs the pre-batch layer.
	const provider = ctx.providerService?.getProvider(chainId);
	if (provider) {
		const vaultsForAssets = [...eVaults, ...eulerEarnVaults, ...securitizeVaults];
		const assets = await Promise.all(
			vaultsForAssets.map((vault) =>
				provider
					.readContract({
						address: vault,
						abi: walletBalanceAbi,
						functionName: "asset",
					})
					.then((a) => getAddress(a as Address))
					.catch(() => null),
			),
		);
		const assetTokens = new Set<Address>();
		for (const a of assets) if (a) assetTokens.add(getAddress(a));
		for (const token of requiredWalletBalanceTokens) {
			addWalletToken(assetTokens, token);
		}
		for (const operation of operations) {
			for (const token of operation.walletBalanceTokens ?? []) {
				addWalletToken(assetTokens, token);
			}
		}
		for (const token of collectClaimWalletBalanceTokens(batch)) {
			addWalletToken(assetTokens, token);
		}

		const unlockItems = batch.filter(
			(item) => getSelector(item.data) === REUL_UNLOCK_SELECTOR,
		);
		if (unlockItems.length > 0) {
			const configuredEul =
				deployment.addresses.tokenAddrs?.EUL;
			if (configuredEul) {
				addWalletToken(assetTokens, configuredEul);
			} else {
				const underlyingTokens = await Promise.all(
					unlockItems.map((item) =>
						provider
							.readContract({
								address: item.targetContract,
								abi: walletBalanceAbi,
								functionName: "underlying",
							})
							.then((a) => getAddress(a as Address))
							.catch(() => null),
					),
				);
				for (const token of underlyingTokens) {
					if (token) addWalletToken(assetTokens, token);
				}
			}
		}

		for (const token of assetTokens) {
			pushLensItem(
				{
					targetContract: token,
					onBehalfOfAccount: owner,
					value: 0n,
					data: encodeFunctionData({
						abi: walletBalanceAbi,
						functionName: "balanceOf",
						args: [owner],
					}),
				},
				{ kind: "walletBalance", token },
			);
		}
	}

	// The caller assembles the final batch (interleaving these lens reads per the
	// chosen layers mode), so we just return the reusable lens block.
	return { lensItems, lensMeta, evcAddress };
}

function collectCandidateVaults(
	ctx: ExecutionSimulationContext,
	owner: Address,
	batch: EVCBatchItem[],
): {
	candidateVaults: Set<Address>;
	subAccountVaults: Map<Address, Set<Address>>;
} {
	const candidateVaults = new Set<Address>();
	const subAccountVaults = new Map<Address, Set<Address>>();

	const addCandidateVault = (vault: Address) => {
		candidateVaults.add(getAddress(vault));
	};

	const addSubAccountVault = (subAccount: Address, vault: Address) => {
		const key = getAddress(subAccount);
		if (!isSubAccount(owner, key)) return;
		const set = subAccountVaults.get(key) ?? new Set<Address>();
		set.add(getAddress(vault));
		subAccountVaults.set(key, set);
	};

	for (const item of batch) {
		addCandidateVault(item.targetContract);
		addSubAccountVault(item.onBehalfOfAccount, item.targetContract);
	}

	const described = ctx.describeBatch(batch);
	for (const item of described) {
		const fn = item.functionName.toLowerCase();
		const target = getAddress(item.targetContract);

		if (
			fn === "enablecollateral" ||
			fn === "disablecollateral" ||
			fn === "enablecontroller"
		) {
			const account = item.args.account as Address | undefined;
			const vault = item.args.vault as Address | undefined;
			if (vault) addCandidateVault(vault);
			if (account && vault) addSubAccountVault(account, vault);
			continue;
		}

		if (fn === "transfer" || fn === "transferfrom" || fn === "transferfrommax") {
			const to = item.args.to as Address | undefined;
			const from =
				fn === "transferfrom" || fn === "transferfrommax"
					? (item.args.from as Address | undefined)
					: ((item.args.from as Address | undefined) ?? item.onBehalfOfAccount);

			if (from) addSubAccountVault(from, target);
			if (to) addSubAccountVault(to, target);
			addCandidateVault(target);
			continue;
		}

		if (fn === "withdraw" || fn === "redeem") {
			const owner = item.args.owner as Address | undefined;
			if (owner) addSubAccountVault(owner, target);
			addCandidateVault(target);
			continue;
		}

		if (fn === "liquidate") {
			const violator = item.args.violator as Address | undefined;
			const collateral = item.args.collateral as Address | undefined;
			if (violator) addSubAccountVault(violator, target);
			if (violator && collateral) addSubAccountVault(violator, collateral);
			if (collateral) {
				addSubAccountVault(item.onBehalfOfAccount, collateral);
				addCandidateVault(collateral);
			}
			addCandidateVault(target);
			continue;
		}

		if (fn === "pulldebt") {
			const from = item.args.from as Address | undefined;
			if (from) addSubAccountVault(from, target);
			addCandidateVault(target);
			continue;
		}

		if (fn === "deposit" || fn === "skim" || fn === "mint") {
			const receiver = item.args.receiver as Address | undefined;
			if (receiver) addSubAccountVault(receiver, target);
			addCandidateVault(target);
		}

		// repay(amount, receiver) / repayWithShares(amount, receiver): the *receiver*
		// is the account whose debt is reduced, and it can differ from the batch
		// item's onBehalfOfAccount (e.g. a repay-from-wallet runs on behalf of the
		// owner but repays a sub-account's debt). Map the receiver so its post-repay
		// debt position (and liquidity) is read — otherwise the simulated debt/health
		// of the repaid sub-account stays at the pre-batch state.
		if (fn === "repay" || fn === "repaywithshares") {
			const receiver = item.args.receiver as Address | undefined;
			if (receiver) addSubAccountVault(receiver, target);
			addCandidateVault(target);
		}

		if (fn === "verifyamountminanddeposit" || fn === "verifyamountminandskim") {
			const vault = item.args.vault as Address | undefined;
			const receiver = item.args.receiver as Address | undefined;
			if (vault) addCandidateVault(vault);
			if (vault && receiver) addSubAccountVault(receiver, vault);
		}

		if (fn === "verifydebtmax") {
			const vault = item.args.vault as Address | undefined;
			const account = item.args.account as Address | undefined;
			if (vault) addCandidateVault(vault);
			if (vault && account) addSubAccountVault(account, vault);
		}
	}

	if (!subAccountVaults.has(owner)) {
		subAccountVaults.set(owner, new Set<Address>());
	}

	return { candidateVaults, subAccountVaults };
}

async function runSimulation(
	ctx: ExecutionSimulationContext,
	chainId: number,
	account: Address,
	evcAddress: Address,
	fullBatch: EVCBatchItem[],
	totalValue: bigint,
	stateOverrides?: StateOverride,
): Promise<
	| {
			batchResults: BatchItemResult[];
			accountStatusErrors: Array<{
				account: Address;
				error: Hex;
				decoded: DecodedSmartContractError[];
			}>;
			vaultStatusErrors: Array<{
				vault: Address;
				error: Hex;
				decoded: DecodedSmartContractError[];
			}>;
	  }
	| {
			simulatedAccounts: [];
			simulatedVaults: [];
			simulationError: {
				error: unknown;
				decoded: DecodedSmartContractError[];
			};
	  }
> {
	if (!ctx.providerService) {
		throw new Error(
			"ExecutionService.simulateTransactionPlan requires a providerService. Pass it to the ExecutionService constructor or call setProviderService().",
		);
	}

	const provider = ctx.providerService.getProvider(chainId);
	let decodedResult: unknown;
	try {
		const { result } = await provider.simulateContract({
			address: evcAddress,
			abi: ethereumVaultConnectorAbi,
			functionName: "batchSimulation",
			args: [fullBatch],
			value: totalValue,
			account,
			stateOverride: stateOverrides,
		});
		decodedResult = result;
	} catch (error) {
		const decoded = await decodeSmartContractErrors(error);
		return {
			simulatedAccounts: [],
			simulatedVaults: [],
			simulationError: { error, decoded },
		};
	}

	if (!decodedResult) {
		return {
			batchResults: [],
			accountStatusErrors: [],
			vaultStatusErrors: [],
		};
	}

	const decoded = decodedResult as readonly unknown[];
	const batchResults = decoded[0] as BatchItemResult[];
	const accountChecks = (decoded[1] as StatusCheckResult[] | undefined) ?? [];
	const vaultChecks = (decoded[2] as StatusCheckResult[] | undefined) ?? [];

	const accountStatusErrors = await Promise.all(
		accountChecks
			.filter((check) => !check.isValid)
			.map(async (check) => ({
				account: getAddress(check.checkedAddress),
				error: check.result,
				decoded: await decodeSmartContractErrors(check.result),
			})),
	);

	const vaultStatusErrors = await Promise.all(
		vaultChecks
			.filter((check) => !check.isValid)
			.map(async (check) => ({
				vault: getAddress(check.checkedAddress),
				error: check.result,
				decoded: await decodeSmartContractErrors(check.result),
			})),
	);

	return { batchResults, accountStatusErrors, vaultStatusErrors };
}

/**
 * Wallet shortfall derived from the per-layer simulated balances. In-sim
 * balances are forged by state overrides, so we anchor to the real on-chain
 * balance and track the running balance across layers — real balance plus each
 * layer's net delta vs the pre-batch layer. The shortfall per token is the worst
 * dip below zero. This nets out intra-batch funding (e.g. withdraw then deposit
 * the same asset → never dips) yet still flags a step that consumes more than is
 * genuinely available at that point. Returns undefined when balances can't be
 * resolved (no walletService / no touched tokens), so callers don't over-block.
 */
async function computeWalletShortfall(
	ctx: ExecutionSimulationContext,
	chainId: number,
	owner: Address,
	simulatedWalletBalances: Record<string, bigint>[],
): Promise<SimulationInsufficientRequirement[] | undefined> {
	if (!ctx.walletService || simulatedWalletBalances.length === 0)
		return undefined;
	const base = simulatedWalletBalances[0] ?? {};
	const tokens = Object.keys(base);
	if (tokens.length === 0) return undefined;

	let realByToken: Record<string, bigint>;
	try {
		const wallet = (
			await ctx.walletService.fetchWallet(
				chainId,
				owner,
				tokens.map((t) => ({ asset: getAddress(t), spenders: [] })),
			)
		).result;
		realByToken = {};
		for (const t of tokens) realByToken[t] = wallet.getBalance(getAddress(t));
	} catch {
		return undefined;
	}

	const shortfalls: SimulationInsufficientRequirement[] = [];
	for (const t of tokens) {
		const baseBal = base[t] ?? 0n;
		const real = realByToken[t] ?? 0n;
		// Worst running balance across layers (layer 0's delta is 0 ⇒ starts at real).
		let minAvailable = real;
		for (let i = 1; i < simulatedWalletBalances.length; i++) {
			const delta = (simulatedWalletBalances[i]![t] ?? 0n) - baseBal;
			const available = real + delta;
			if (available < minAvailable) minAvailable = available;
		}
		if (minAvailable < 0n)
			shortfalls.push({ token: getAddress(t), amount: -minAvailable });
	}
	return shortfalls;
}

async function fetchSimulationDiagnostics(
	ctx: ExecutionSimulationContext,
	chainId: number,
	account: Address,
	transactionPlan?: TransactionPlan,
): Promise<{
	insufficientWalletAssets?: SimulationInsufficientRequirement[];
	insufficientPermit2Allowances?: SimulationInsufficientRequirement[];
	insufficientDirectAllowances?: SimulationInsufficientRequirement[];
}> {
	if (!ctx.walletService || !transactionPlan) return {};

	const requiredApprovals = transactionPlan.filter(
		(item): item is RequiredApproval =>
			item.type === "requiredApproval" &&
			getAddress(item.owner) === getAddress(account),
	);
	if (requiredApprovals.length === 0) return {};

	const assetSpendersMap = new Map<Address, Set<Address>>();
	for (const approval of requiredApprovals) {
		const token = getAddress(approval.token);
		const spender = getAddress(approval.spender);
		if (!assetSpendersMap.has(token))
			assetSpendersMap.set(token, new Set<Address>());
		assetSpendersMap.get(token)!.add(spender);
	}

	const assetsWithSpenders = Array.from(assetSpendersMap.entries()).map(
		([asset, spenders]) => ({
			asset,
			spenders: Array.from(spenders),
		}),
	);

	let wallet;
	try {
		wallet = (
			await ctx.walletService.fetchWallet(chainId, account, assetsWithSpenders)
		).result;
	} catch {
		return {};
	}

	const walletByToken = new Map<Address, bigint>();
	const directByToken = new Map<Address, bigint>();
	const permit2ByToken = new Map<Address, bigint>();
	const now = Math.floor(Date.now() / 1000);

	for (const approval of requiredApprovals) {
		const token = getAddress(approval.token);
		const spender = getAddress(approval.spender);
		const amount = approval.amount;
		const walletAsset = wallet.getAsset(token);
		const allowances = walletAsset?.allowances[spender];

		const balance = walletAsset?.balance ?? 0n;
		if (balance < amount) {
			const deficit = amount - balance;
			const prev = walletByToken.get(token) ?? 0n;
			if (deficit > prev) walletByToken.set(token, deficit);
		}

		const directAllowance = allowances?.assetForVault ?? 0n;
		if (directAllowance < amount) {
			const deficit = amount - directAllowance;
			const prev = directByToken.get(token) ?? 0n;
			if (deficit > prev) directByToken.set(token, deficit);
		}

		const permit2Allowance = allowances?.assetForVaultInPermit2 ?? 0n;
		const permit2ExpirationTime = allowances?.permit2ExpirationTime ?? 0;
		const permit2Expired =
			permit2ExpirationTime > 0 && now >= permit2ExpirationTime;
		if (permit2Allowance < amount || permit2Expired) {
			const deficit = permit2Expired ? amount : amount - permit2Allowance;
			const prev = permit2ByToken.get(token) ?? 0n;
			if (deficit > prev) permit2ByToken.set(token, deficit);
		}
	}

	const mapToArray = (map: Map<Address, bigint>) =>
		Array.from(map.entries()).map(([token, amount]) => ({ token, amount }));

	return {
		...(walletByToken.size > 0
			? { insufficientWalletAssets: mapToArray(walletByToken) }
			: {}),
		...(directByToken.size > 0
			? { insufficientDirectAllowances: mapToArray(directByToken) }
			: {}),
		...(permit2ByToken.size > 0
			? { insufficientPermit2Allowances: mapToArray(permit2ByToken) }
			: {}),
	};
}

// Sum the required amount per token across every approval the owner must fund.
// Each requiredApproval is a wallet outflow, and several can draw on the same
// token within one batch (e.g. supplying it into two vaults, or supply + repay),
// so the wallet must cover their *total*, not the largest single one. Forging
// the sum lets an underfunded batch simulate through to completion — so the
// running-balance shortfall reports the true peak deficit instead of the batch
// reverting partway with E_InsufficientBalance. Over-forging is harmless: the
// shortfall is computed against the real balance, not this forged amount.
export function extractBalanceRequirements(
	transactionPlan: TransactionPlan,
	account: Address,
): [Address, bigint][] {
	const totalPerToken = new Map<Address, bigint>();
	for (const item of transactionPlan) {
		if (item.type !== "requiredApproval") continue;
		if (getAddress(item.owner) !== getAddress(account)) continue;
		const token = getAddress(item.token);
		totalPerToken.set(token, (totalPerToken.get(token) ?? 0n) + item.amount);
	}
	return Array.from(totalPerToken.entries());
}

function extractApprovalRequirements(
	transactionPlan: TransactionPlan,
	account: Address,
): [Address, Address][] {
	const seen = new Set<string>();
	const approvals: [Address, Address][] = [];
	for (const item of transactionPlan) {
		if (item.type !== "requiredApproval") continue;
		if (getAddress(item.owner) !== getAddress(account)) continue;
		const asset = getAddress(item.token);
		const spender = getAddress(item.spender);
		const key = `${asset}:${spender}`;
		if (seen.has(key)) continue;
		seen.add(key);
		approvals.push([asset, spender]);
	}
	return approvals;
}
