import {
	Account,
	type IAccount,
	type ISubAccount,
} from "../../entities/Account.js";
import { EulerEarn } from "../../entities/EulerEarn.js";
import { EVault } from "../../entities/EVault.js";
import {
	decodeSmartContractErrors,
	type DecodedSmartContractError,
} from "../../utils/decodeSmartContractErrors.js";
import { isSubAccount } from "../../utils/subAccounts.js";
import { getApprovalOverrides } from "../../utils/stateOverrides/approvalOverrides.js";
import { getBalanceOverrides } from "../../utils/stateOverrides/balanceOverrides.js";
import { mergeStateOverrides } from "../../utils/stateOverrides/mergeStateOverrides.js";
import { VaultType } from "../../utils/types.js";
import type { AccountFetchOptions } from "../accountService/accountService.js";
import type {
	EVCAccountInfo,
	VaultAccountInfo,
} from "../accountService/adapters/accountOnchainAdapter/accountLensTypes.js";
import {
	AccountOnchainAdapter,
	getEVCAccountInfoLensBatchItem,
	getVaultAccountInfoLensBatchItem,
} from "../accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import { accountLensAbi } from "../accountService/adapters/accountOnchainAdapter/abis/accountLensAbi.js";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { IEulerLabelsService } from "../eulerLabelsService/index.js";
import type { IIntrinsicApyService } from "../intrinsicApyService/index.js";
import type { IPriceService } from "../priceService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type { IRewardsService } from "../rewardsService/index.js";
import type { VaultFetchOptions } from "../vaults/index.js";
import { eulerEarnVaultLensAbi } from "../vaults/eulerEarnService/adapters/abis/eulerEarnVaultLensAbi.js";
import type { EulerEarnVaultInfoFull } from "../vaults/eulerEarnService/adapters/eulerEarnLensTypes.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "../vaults/eulerEarnService/adapters/eulerEarnInfoConverter.js";
import { getEulerEarnVaultInfoFullLensBatchItem } from "../vaults/eulerEarnService/adapters/eulerEarnOnchainAdapter.js";
import { vaultLensAbi } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/abis/vaultLensAbi.js";
import { getVaultInfoFullLensBatchItem } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import type { VaultInfoFull } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter/vaultInfoConverter.js";
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
	type Address,
	decodeFunctionResult,
	getAddress,
	type Hex,
	parseEther,
	type StateOverride,
} from "viem";
import { estimateContractGas } from "viem/actions";

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
	simulatedAccounts: Account<TVaultEntity>[];
	simulatedVaults: TVaultEntity[];
	canExecute: boolean;
	rawBatchResults?: BatchItemResult[];
	failedBatchItems?: Array<{
		index: number;
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
	insufficientWalletAssets?: SimulationInsufficientRequirement[];
	insufficientPermit2Allowances?: SimulationInsufficientRequirement[];
	insufficientDirectAllowances?: SimulationInsufficientRequirement[];
}

export type SimulateBatchOptions = {
	/** When true, fetches state overrides internally from the transaction plan before simulation. */
	stateOverrides?: boolean;
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
};

type LensMeta =
	| { kind: "eVault"; vault: Address }
	| { kind: "eulerEarn"; vault: Address }
	| { kind: "evcAccount"; subAccount: Address }
	| { kind: "vaultAccount"; subAccount: Address; vault: Address };

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
	describeBatch: (batch: EVCBatchItem[]) => BatchItemDescription[];
};

export async function deriveStateOverrides(
	ctx: ExecutionSimulationContext,
	chainId: number,
	account: Address,
	transactionPlan: TransactionPlan,
	options?: SimulationStateOverrideOptions,
): Promise<StateOverride> {
	if (!ctx.providerService) {
		throw new Error(
			"ExecutionService.deriveStateOverrides requires a providerService. Pass it to the ExecutionService constructor or call setProviderService().",
		);
	}

	const owner = getAddress(account);
	const nativeBalance = options?.nativeBalance ?? parseEther("1000");
	const permit2Address =
		ctx.deploymentService.getDeployment(chainId).addresses.coreAddrs.permit2;
	const provider = ctx.providerService.getProvider(chainId);

	const balanceRequirements = extractBalanceRequirements(transactionPlan, owner);
	const approvalRequirements = extractApprovalRequirements(transactionPlan, owner);

	const [balanceOverrides, approvalOverrides] = await Promise.all([
		getBalanceOverrides(provider, owner, balanceRequirements),
		getApprovalOverrides(
			provider,
			owner,
			approvalRequirements,
			permit2Address,
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
	const owner = getAddress(account);
	const useStateOverrides = options?.stateOverrides ?? true;
	let effectiveStateOverrides: StateOverride | undefined;
	if (useStateOverrides) {
		effectiveStateOverrides = await deriveStateOverrides(
			ctx,
			chainId,
			owner,
			transactionPlan,
		);
	}

	const batch = transactionPlan.flatMap((item) =>
		item.type === "evcBatch" ? item.items : [],
	);
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
	const { fullBatch, lensMeta, evcAddress, totalValue } =
		await buildSimulationBatch(ctx, chainId, owner, batch);

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

	const rawBatchResults = batchResults.slice(0, batch.length);
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
				if (itemResult.success) return null;
				const decodedError = await decodeSmartContractErrors(itemResult.result);
				const decodedItem =
					describedBatch && describedBatch.length === batch.length
						? describedBatch[index]!
						: fallbackDescription(batch[index]!);
				return {
					index,
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
			item: BatchItemDescription;
			error: Hex;
			decodedError: DecodedSmartContractError[];
		} => item !== null,
	);

	const vaultsByAddress = new Map<Address, VaultEntity>();
	const evcInfos = new Map<Address, EVCAccountInfo>();
	const vaultInfosBySub = new Map<Address, VaultAccountInfo[]>();

	for (let i = 0; i < lensMeta.length; i++) {
		const meta = lensMeta[i]!;
		const resultItem = batchResults[batch.length + i];
		if (!resultItem?.success) continue;

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

	const simulatedVaults = Array.from(vaultsByAddress.values()) as TVaultEntity[];

	const vaultFetchOptions =
		options?.vaultFetchOptions ?? options?.accountFetchOptions?.vaultFetchOptions;
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
		const built = accountAdapter.buildSubAccount(evcInfo, vaultInfos, []);
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
	const populatedAccount = simulatedAccount.mapVaultsToPositions(simulatedVaults);
	const accountFetchOptions = options?.accountFetchOptions;
	const shouldPopulateAccountMarketPrices =
		accountFetchOptions?.populateMarketPrices ?? true;

	if (shouldPopulateAccountMarketPrices && ctx.priceService) {
		await populatedAccount.populateMarketPrices(ctx.priceService);
	}

	if (accountFetchOptions?.populateUserRewards && ctx.rewardsService) {
		await populatedAccount.populateUserRewards(ctx.rewardsService);
	}

	const result = {
		simulatedAccounts: [populatedAccount],
		simulatedVaults,
		canExecute:
			failedBatchItems.length === 0 &&
			accountStatusErrors.length === 0 &&
			vaultStatusErrors.length === 0 &&
			!diagnostics.insufficientWalletAssets?.length &&
			!diagnostics.insufficientPermit2Allowances?.length &&
			!diagnostics.insufficientDirectAllowances?.length,
		rawBatchResults,
		failedBatchItems: failedBatchItems.length > 0 ? failedBatchItems : undefined,
		accountStatusErrors:
			accountStatusErrors.length > 0 ? accountStatusErrors : undefined,
		vaultStatusErrors:
			vaultStatusErrors.length > 0 ? vaultStatusErrors : undefined,
		...diagnostics,
	};

	return result;
}

export async function estimateGasForTransactionPlan(
	ctx: ExecutionSimulationContext,
	chainId: number,
	account: Address,
	transactionPlan: TransactionPlan,
	options?: EstimateGasForTransactionPlanOptions,
): Promise<bigint> {
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
			const value = item.items.reduce(
				(sum, batchItem) => sum + batchItem.value,
				0n,
			);
			totalGas += await estimateContractGas(provider, {
				account: owner,
				address: evcAddress,
				abi: ethereumVaultConnectorAbi,
				functionName: "batch",
				args: [item.items],
				value,
				stateOverride,
			});
			continue;
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
	batch: EVCBatchItem[],
): Promise<{
	fullBatch: EVCBatchItem[];
	lensMeta: LensMeta[];
	evcAddress: Address;
	totalValue: bigint;
}> {
	const { candidateVaults, subAccountVaults } = collectCandidateVaults(
		ctx,
		owner,
		batch,
	);

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

	for (const vault of vaultCandidatesList) {
		const key = getAddress(vault);
		const type = vaultTypes[key];
		if (!type) continue;
		if (type === VaultType.SecuritizeCollateral) continue;
		validVaults.add(key);
		if (type === VaultType.EVault) eVaults.push(key);
		if (type === VaultType.EulerEarn) eulerEarnVaults.push(key);
	}

	const deployment = ctx.deploymentService.getDeployment(chainId);
	const accountLensAddress = deployment.addresses.lensAddrs.accountLens;
	const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;
	const eulerEarnLensAddress =
		deployment.addresses.lensAddrs.eulerEarnVaultLens;
	const evcAddress = deployment.addresses.coreAddrs.evc;

	const lensItems: EVCBatchItem[] = [];
	const lensMeta: LensMeta[] = [];

	const pushLensItem = (item: EVCBatchItem, meta: LensMeta) => {
		lensItems.push(item);
		lensMeta.push(meta);
	};

	for (const vault of eVaults) {
		pushLensItem(getVaultInfoFullLensBatchItem(vaultLensAddress, vault, owner), {
			kind: "eVault",
			vault,
		});
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

	const fullBatch = [...batch, ...lensItems];
	const totalValue = fullBatch.reduce((sum, item) => sum + item.value, 0n);

	return { fullBatch, lensMeta, evcAddress, totalValue };
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

		if (fn === "transfer" || fn === "transferfrom") {
			const to = item.args.to as Address | undefined;
			const from =
				fn === "transferfrom"
					? (item.args.from as Address | undefined)
					: ((item.args.from as Address | undefined) ?? item.onBehalfOfAccount);

			if (from) addSubAccountVault(from, target);
			if (to) addSubAccountVault(to, target);
			addCandidateVault(target);
			continue;
		}

		if (fn === "deposit" || fn === "skim" || fn === "mint") {
			const receiver = item.args.receiver as Address | undefined;
			if (receiver) addSubAccountVault(receiver, target);
			addCandidateVault(target);
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

		const directAllowance = allowances?.assetForPermit2 ?? 0n;
		if (directAllowance < amount) {
			const deficit = amount - directAllowance;
			const prev = directByToken.get(token) ?? 0n;
			if (deficit > prev) directByToken.set(token, deficit);
		}

		const permit2Allowance = allowances?.assetForVaultInPermit2 ?? 0n;
		const permit2ExpirationTime = allowances?.permit2ExpirationTime ?? 0;
		const permit2Expired = permit2ExpirationTime > 0 && now >= permit2ExpirationTime;
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

function extractBalanceRequirements(
	transactionPlan: TransactionPlan,
	account: Address,
): [Address, bigint][] {
	const maxPerToken = new Map<Address, bigint>();
	for (const item of transactionPlan) {
		if (item.type !== "requiredApproval") continue;
		if (getAddress(item.owner) !== getAddress(account)) continue;
		const token = getAddress(item.token);
		const current = maxPerToken.get(token) ?? 0n;
		if (item.amount > current) {
			maxPerToken.set(token, item.amount);
		}
	}
	return Array.from(maxPerToken.entries());
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
