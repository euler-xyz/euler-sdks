import {
  type Address,
  type Hex,
  type StateOverride,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  parseEther,
  stringify,
} from "viem";
import { ProviderService } from "../providerService/index.js";
import { DeploymentService } from "../deploymentService/index.js";
import type { IVaultMetaService, VaultEntity } from "../vaults/vaultMetaService/index.js";
import type { VaultFetchOptions } from "../vaults/index.js";
import { VaultType } from "../../utils/types.js";
import { isSubAccount } from "../../utils/subAccounts.js";
import { decodeSmartContractErrors, type DecodedSmartContractError } from "../../utils/decodeSmartContractErrors.js";
import type {
  BatchItemDescription,
  EVCBatchItem,
  RequiredApproval,
  TransactionPlan,
} from "../executionService/executionServiceTypes.js";
import type { IExecutionService } from "../executionService/index.js";
import type { IWalletService } from "../walletService/index.js";
import { getApprovalOverrides } from "../../utils/stateOverrides/approvalOverrides.js";
import { getBalanceOverrides } from "../../utils/stateOverrides/balanceOverrides.js";
import { mergeStateOverrides } from "../../utils/stateOverrides/mergeStateOverrides.js";
import { ethereumVaultConnectorAbi } from "../executionService/abis/ethereumVaultConnectorAbi.js";
import { Account, type IAccount, type ISubAccount } from "../../entities/Account.js";
import { EVault } from "../../entities/EVault.js";
import { EulerEarn } from "../../entities/EulerEarn.js";
import { AccountOnchainAdapter, getEVCAccountInfoLensBatchItem, getVaultAccountInfoLensBatchItem } from "../accountService/adapters/accountOnchainAdapter.js";
import { EVaultOnchainAdapter, getVaultInfoFullLensBatchItem } from "../vaults/eVaultService/adapters/eVaultOnchainAdapter.js";
import { EulerEarnOnchainAdapter, getEulerEarnVaultInfoFullLensBatchItem } from "../vaults/eulerEarnService/adapters/eulerEarnOnchainAdapter.js";
import { SecuritizeVaultOnchainAdapter } from "../vaults/securitizeVaultService/adapters/securitizeVaultOnchainAdapter.js";
import { accountLensAbi } from "../accountService/adapters/abis/accountLensAbi.js";
import { vaultLensAbi } from "../vaults/eVaultService/adapters/abis/vaultLensAbi.js";
import { eulerEarnVaultLensAbi } from "../vaults/eulerEarnService/adapters/abis/eulerEarnVaultLensAbi.js";
import { convertVaultInfoFullToIEVault } from "../vaults/eVaultService/adapters/vaultInfoConverter.js";
import type { VaultInfoFull } from "../vaults/eVaultService/adapters/eVaultLensTypes.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "../vaults/eulerEarnService/adapters/eulerEarnInfoConverter.js";
import type { EulerEarnVaultInfoFull } from "../vaults/eulerEarnService/adapters/eulerEarnLensTypes.js";
import type { EVCAccountInfo, VaultAccountInfo } from "../accountService/adapters/accountLensTypes.js";
import type { IPriceService } from "../priceService/index.js";
import type { IRewardsService } from "../rewardsService/index.js";
import type { IIntrinsicApyService } from "../intrinsicApyService/index.js";
import type { IEulerLabelsService } from "../eulerLabelsService/index.js";
import type { AccountFetchOptions } from "../accountService/accountService.js";

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

export interface SimulateBatchResult<TVaultEntity extends VaultEntity = VaultEntity> {
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
  accountStatusErrors?: Array<{ account: Address; error: Hex; decoded: DecodedSmartContractError[] }>;
  vaultStatusErrors?: Array<{ vault: Address; error: Hex; decoded: DecodedSmartContractError[] }>;
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

export type SimulationStateOverrideOptions = {
  /** Override the native (ETH) balance. Defaults to 1000 ETH. Set to 0n to skip. */
  nativeBalance?: bigint;
};

export interface ISimulationService<TVaultEntity extends VaultEntity = VaultEntity> {
  getStateOverrides(
    chainId: number,
    account: Address,
    transactionPlan: TransactionPlan,
    options?: SimulationStateOverrideOptions,
  ): Promise<StateOverride>;
  simulateTransactionPlan(
    chainId: number,
    account: Address,
    transactionPlan: TransactionPlan,
    options?: SimulateBatchOptions
  ): Promise<SimulateBatchResult<TVaultEntity>>;
}

type LensMeta =
  | { kind: "eVault"; vault: Address }
  | { kind: "eulerEarn"; vault: Address }
  | { kind: "evcAccount"; subAccount: Address }
  | { kind: "vaultAccount"; subAccount: Address; vault: Address };

export class SimulationService<TVaultEntity extends VaultEntity = VaultEntity>
  implements ISimulationService<TVaultEntity>
{
  private accountAdapter: AccountOnchainAdapter;

  constructor(
    private providerService: ProviderService,
    private deploymentService: DeploymentService,
    private vaultMetaService: IVaultMetaService<TVaultEntity>,
    private executionService: IExecutionService,
    private priceService?: IPriceService,
    private rewardsService?: IRewardsService,
    private intrinsicApyService?: IIntrinsicApyService,
    private eulerLabelsService?: IEulerLabelsService,
    private walletService?: IWalletService,
  ) {
    const emptyPositionsAdapter = { getAccountVaults: async () => ({}) };
    this.accountAdapter = new AccountOnchainAdapter(
      providerService,
      deploymentService,
      emptyPositionsAdapter,
    );
  }

  async getStateOverrides(
    chainId: number,
    account: Address,
    transactionPlan: TransactionPlan,
    options?: SimulationStateOverrideOptions,
  ): Promise<StateOverride> {
    const owner = getAddress(account);
    const nativeBalance = options?.nativeBalance ?? parseEther("1000");
    const permit2Address = this.deploymentService.getDeployment(chainId).addresses.coreAddrs.permit2;
    const provider = this.providerService.getProvider(chainId);

    const balanceRequirements = this.extractBalanceRequirements(transactionPlan, owner);
    const approvalRequirements = this.extractApprovalRequirements(transactionPlan, owner);

    const [balanceOverrides, approvalOverrides] = await Promise.all([
      getBalanceOverrides(provider, owner, balanceRequirements),
      getApprovalOverrides(provider, owner, approvalRequirements, permit2Address),
    ]);

    const allOverrides: StateOverride = [];
    if (nativeBalance > 0n) {
      allOverrides.push({ address: owner, balance: nativeBalance });
    }
    allOverrides.push(...balanceOverrides);
    allOverrides.push(...approvalOverrides);

    return mergeStateOverrides(allOverrides);
  }

  async simulateTransactionPlan(
    chainId: number,
    account: Address,
    transactionPlan: TransactionPlan,
    options?: SimulateBatchOptions,
  ): Promise<SimulateBatchResult<TVaultEntity>> {
    const owner = getAddress(account);
    const useStateOverrides = options?.stateOverrides ?? true;
    let effectiveStateOverrides: StateOverride | undefined = undefined;
    if (useStateOverrides) {
      effectiveStateOverrides = await this.getStateOverrides(chainId, owner, transactionPlan);
    }

    const batch = transactionPlan.flatMap((item) => (item.type === "evcBatch" ? item.items : []));
    if (batch.length === 0) {
      return {
        simulatedAccounts: [],
        simulatedVaults: [],
        canExecute: false,
      };
    }
    const diagnostics = await this.getSimulationDiagnostics(
      chainId,
      owner,
      transactionPlan,
    );
    const { fullBatch, lensMeta, evcAddress, totalValue, calldata } =
      await this.buildSimulationBatch(chainId, owner, batch);

    const simulationResult = await this.runSimulation(
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

    const { batchResults, accountStatusErrors, vaultStatusErrors } = simulationResult;

    const rawBatchResults = batchResults.slice(0, batch.length);
    let describedBatch: BatchItemDescription[] | undefined;
    try {
      describedBatch = this.executionService.describeBatch(batch);
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
        })
      )
    ).filter(
      (item): item is {
        index: number;
        item: BatchItemDescription;
        error: Hex;
        decodedError: DecodedSmartContractError[];
      } => item !== null
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
        const entity = new EVault(convertVaultInfoFullToIEVault(decodedVault, chainId, []));
        vaultsByAddress.set(getAddress(meta.vault), entity);
      }

      if (meta.kind === "eulerEarn") {
        const decodedVault = decodeFunctionResult({
          abi: eulerEarnVaultLensAbi,
          functionName: "getVaultInfoFull",
          data: resultItem.result,
        }) as unknown as EulerEarnVaultInfoFull;
        const entity = new EulerEarn(convertEulerEarnVaultInfoFullToIEulerEarn(decodedVault, chainId, []));
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
      await Promise.all(
        simulatedVaults.map(async (vault) => {
          if (vault instanceof EVault) {
            await vault.populateCollaterals(this.vaultMetaService);
          }
        })
      );
    }

    if (shouldPopulateVaultMarketPrices && this.priceService) {
      await Promise.all(
        simulatedVaults.map(async (vault) => {
          if (typeof (vault as any).populateMarketPrices === "function") {
            await (vault as any).populateMarketPrices(this.priceService!);
          }
        })
      );
    }

    if (vaultFetchOptions?.populateRewards && this.rewardsService) {
      await this.rewardsService.populateRewards(simulatedVaults as any);
    }

    if (vaultFetchOptions?.populateIntrinsicApy && this.intrinsicApyService) {
      await this.intrinsicApyService.populateIntrinsicApy(simulatedVaults as any);
    }

    if (vaultFetchOptions?.populateLabels && this.eulerLabelsService) {
      await this.eulerLabelsService.populateLabels(simulatedVaults as any);
    }

    const builtSubAccounts: ISubAccount[] = [];
    for (const [subAccount, evcInfo] of evcInfos.entries()) {
      const vaultInfos = vaultInfosBySub.get(subAccount) ?? [];
      const built = this.accountAdapter.buildSubAccount(evcInfo, vaultInfos, []);
      const { isLockdownMode: _lm, isPermitDisabledMode: _pm, ...subAccountData } = built;
      builtSubAccounts.push(subAccountData);
    }

    const mainEvc = evcInfos.get(owner);
    const accountData: IAccount = this.accountAdapter.buildAccount(
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

    if (shouldPopulateAccountMarketPrices && this.priceService) {
      await populatedAccount.populateMarketPrices(this.priceService);
    }

    if (accountFetchOptions?.populateUserRewards && this.rewardsService) {
      await populatedAccount.populateUserRewards(this.rewardsService);
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
      accountStatusErrors: accountStatusErrors.length > 0 ? accountStatusErrors : undefined,
      vaultStatusErrors: vaultStatusErrors.length > 0 ? vaultStatusErrors : undefined,
      ...diagnostics,
    };

    return result;
  }

  private async buildSimulationBatch(
    chainId: number,
    owner: Address,
    batch: EVCBatchItem[],
  ): Promise<{
    fullBatch: EVCBatchItem[];
    lensMeta: LensMeta[];
    evcAddress: Address;
    totalValue: bigint;
    calldata: Hex;
  }> {
    const { candidateVaults, subAccountVaults } = this.collectCandidateVaults(owner, batch);

    const vaultCandidatesList = Array.from(candidateVaults);
    const vaultTypes = await this.vaultMetaService.fetchVaultTypes(chainId, vaultCandidatesList);

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

    const deployment = this.deploymentService.getDeployment(chainId);
    const accountLensAddress = deployment.addresses.lensAddrs.accountLens;
    const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;
    const eulerEarnLensAddress = deployment.addresses.lensAddrs.eulerEarnVaultLens;
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
      pushLensItem(getEulerEarnVaultInfoFullLensBatchItem(eulerEarnLensAddress, vault, owner), {
        kind: "eulerEarn",
        vault,
      });
    }

    for (const [subAccount, vaults] of subAccountVaults.entries()) {
      pushLensItem(
        getEVCAccountInfoLensBatchItem(accountLensAddress, evcAddress, subAccount, owner),
        {
          kind: "evcAccount",
          subAccount,
        }
      );

      for (const vault of vaults) {
        if (!validVaults.has(getAddress(vault))) continue;
        pushLensItem(
          getVaultAccountInfoLensBatchItem(accountLensAddress, subAccount, vault, owner),
          {
            kind: "vaultAccount",
            subAccount,
            vault,
          }
        );
      }
    }

    const fullBatch = [...batch, ...lensItems];
    const totalValue = fullBatch.reduce((sum, item) => sum + item.value, 0n);
    const calldata = encodeFunctionData({
      abi: ethereumVaultConnectorAbi,
      functionName: "batchSimulation",
      args: [fullBatch],
    });

    return { fullBatch, lensMeta, evcAddress, totalValue, calldata };
  }

  private collectCandidateVaults(
    owner: Address,
    batch: EVCBatchItem[],
  ): { candidateVaults: Set<Address>; subAccountVaults: Map<Address, Set<Address>> } {
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

    const described = this.executionService.describeBatch(batch);
    for (const item of described) {
      const fn = item.functionName.toLowerCase();
      const target = getAddress(item.targetContract);

      if (fn === "transfer" || fn === "transferfrom") {
        const to = item.args["to"] as Address | undefined;
        const from =
          fn === "transferfrom"
            ? (item.args["from"] as Address | undefined)
            : (item.args["from"] as Address | undefined) ?? item.onBehalfOfAccount;

        if (from) addSubAccountVault(from, target);
        if (to) addSubAccountVault(to, target);
        addCandidateVault(target);
        continue;
      }

      if (fn === "deposit" || fn === "skim" || fn === "mint") {
        const receiver = item.args["receiver"] as Address | undefined;
        if (receiver) addSubAccountVault(receiver, target);
        addCandidateVault(target);
      }
    }

    if (!subAccountVaults.has(owner)) {
      subAccountVaults.set(owner, new Set<Address>());
    }

    return { candidateVaults, subAccountVaults };
  }

  private async runSimulation(
    chainId: number,
    account: Address,
    evcAddress: Address,
    fullBatch: EVCBatchItem[],
    totalValue: bigint,
    stateOverrides?: StateOverride,
  ): Promise<
    | {
        batchResults: BatchItemResult[];
        accountStatusErrors: Array<{ account: Address; error: Hex; decoded: DecodedSmartContractError[] }>;
        vaultStatusErrors: Array<{ vault: Address; error: Hex; decoded: DecodedSmartContractError[] }>;
      }
    | {
        simulatedAccounts: [];
        simulatedVaults: [];
        simulationError: { error: unknown; decoded: DecodedSmartContractError[] };
      }
  > {
    const provider = this.providerService.getProvider(chainId);
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
      return { batchResults: [], accountStatusErrors: [], vaultStatusErrors: [] };
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
        }))
    );

    const vaultStatusErrors = await Promise.all(
      vaultChecks
        .filter((check) => !check.isValid)
        .map(async (check) => ({
          vault: getAddress(check.checkedAddress),
          error: check.result,
          decoded: await decodeSmartContractErrors(check.result),
        }))
    );

    return { batchResults, accountStatusErrors, vaultStatusErrors };
  }

  private async getSimulationDiagnostics(
    chainId: number,
    account: Address,
    transactionPlan?: TransactionPlan,
  ): Promise<{
    insufficientWalletAssets?: SimulationInsufficientRequirement[];
    insufficientPermit2Allowances?: SimulationInsufficientRequirement[];
    insufficientDirectAllowances?: SimulationInsufficientRequirement[];
  }> {
    if (!this.walletService || !transactionPlan) return {};

    const requiredApprovals = transactionPlan.filter(
      (item): item is RequiredApproval =>
        item.type === "requiredApproval" && getAddress(item.owner) === getAddress(account)
    );
    if (requiredApprovals.length === 0) return {};

    const assetSpendersMap = new Map<Address, Set<Address>>();
    for (const approval of requiredApprovals) {
      const token = getAddress(approval.token);
      const spender = getAddress(approval.spender);
      if (!assetSpendersMap.has(token)) assetSpendersMap.set(token, new Set<Address>());
      assetSpendersMap.get(token)!.add(spender);
    }

    const assetsWithSpenders = Array.from(assetSpendersMap.entries()).map(([asset, spenders]) => ({
      asset,
      spenders: Array.from(spenders),
    }));

    let wallet;
    try {
      wallet = (await this.walletService.fetchWallet(chainId, account, assetsWithSpenders)).result;
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

  private extractBalanceRequirements(
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

  private extractApprovalRequirements(
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
}
