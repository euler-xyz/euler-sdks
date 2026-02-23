import {
  type Address,
  type Hex,
  type StateOverride,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  stringify,
} from "viem";
import { ProviderService } from "../providerService/index.js";
import { DeploymentService } from "../deploymentService/index.js";
import type { IVaultMetaService, VaultEntity } from "../vaults/vaultMetaService/index.js";
import type { VaultFetchOptions } from "../vaults/index.js";
import { VaultType } from "../../utils/types.js";
import { isSubAccount } from "../../utils/subAccounts.js";
import { getStateOverrides } from "../../utils/stateOverrides/getStateOverrides.js";
import { decodeSmartContractErrors, type DecodedSmartContractError } from "../../utils/decodeSmartContractErrors.js";
import type { EVCBatchItem } from "../executionService/executionServiceTypes.js";
import type { IExecutionService } from "../executionService/index.js";
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

export interface SimulateBatchResult<TVaultEntity extends VaultEntity = VaultEntity> {
  simulatedAccounts: Account<TVaultEntity>[];
  simulatedVaults: TVaultEntity[];
  simulationError?: { error: unknown; decoded: DecodedSmartContractError[] };
  accountStatusErrors?: Array<{ account: Address; error: Hex; decoded: DecodedSmartContractError[] }>;
  vaultStatusErrors?: Array<{ vault: Address; error: Hex; decoded: DecodedSmartContractError[] }>;
}

export type SimulateBatchOptions = {
  vaultFetchOptions?: VaultFetchOptions;
  accountFetchOptions?: AccountFetchOptions;
};

export interface ISimulationService<TVaultEntity extends VaultEntity = VaultEntity> {
  simulateBatch(
    chainId: number,
    account: Address,
    batch: EVCBatchItem[],
    stateOverrides?: StateOverride,
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
  static getStateOverrides = getStateOverrides;

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
  ) {
    const emptyPositionsAdapter = { getAccountVaults: async () => ({}) };
    this.accountAdapter = new AccountOnchainAdapter(
      providerService,
      deploymentService,
      emptyPositionsAdapter,
    );
  }

  async simulateBatch(
    chainId: number,
    account: Address,
    batch: EVCBatchItem[],
    stateOverrides?: StateOverride,
    options?: SimulateBatchOptions,
  ): Promise<SimulateBatchResult<TVaultEntity>> {
    const owner = getAddress(account);
    const { fullBatch, lensMeta, evcAddress, totalValue, calldata } =
      await this.buildSimulationBatch(chainId, owner, batch);

    const simulationResult = await this.runSimulation(
      chainId,
      account,
      evcAddress,
      fullBatch,
      totalValue,
      stateOverrides,
    );
    if ("simulationError" in simulationResult) {
      return simulationResult;
    }

    const { batchResults, accountStatusErrors, vaultStatusErrors } = simulationResult;

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
        const entity = new EVault(convertVaultInfoFullToIEVault(decodedVault, chainId));
        vaultsByAddress.set(getAddress(meta.vault), entity);
      }

      if (meta.kind === "eulerEarn") {
        const decodedVault = decodeFunctionResult({
          abi: eulerEarnVaultLensAbi,
          functionName: "getVaultInfoFull",
          data: resultItem.result,
        }) as unknown as EulerEarnVaultInfoFull;
        const entity = new EulerEarn(convertEulerEarnVaultInfoFullToIEulerEarn(decodedVault, chainId));
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
      const built = this.accountAdapter.buildSubAccount(evcInfo, vaultInfos);
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
    console.log('simulatedAccount: ', simulatedAccount);

    return {
      simulatedAccounts: [populatedAccount],
      simulatedVaults,
      accountStatusErrors: accountStatusErrors.length > 0 ? accountStatusErrors : undefined,
      vaultStatusErrors: vaultStatusErrors.length > 0 ? vaultStatusErrors : undefined,
    };
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
    console.log('candidateVaults: ', candidateVaults);

    const vaultCandidatesList = Array.from(candidateVaults);
    const vaultTypes = await this.vaultMetaService.fetchVaultTypes(chainId, vaultCandidatesList);
    console.log('vaultTypes: ', vaultTypes);

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
}
