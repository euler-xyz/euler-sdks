import type { IVaultEntity } from "../entities/Account.js";
import { IAccountService } from "../services/accountService/index.js";
import { IDeploymentService } from "../services/deploymentService/index.js";
import { IEVaultService } from "../services/vaults/eVaultService/index.js";
import { IEulerEarnService } from "../services/vaults/eulerEarnService/index.js";
import { ISecuritizeVaultService } from "../services/vaults/securitizeVaultService/index.js";
import {
  IVaultMetaService,
  type VaultEntity,
} from "../services/vaults/vaultMetaService/index.js";
import { IProviderService } from "../services/providerService/index.js";
import { IABIService } from "../services/abiService/index.js";
import { IEulerLabelsService } from "../services/eulerLabelsService/index.js";
import { ITokenlistService } from "../services/tokenlistService/index.js";
import { ISwapService } from "../services/swapService/index.js";
import { IExecutionService } from "../services/executionService/index.js";
import { ISimulationService } from "../services/simulationService/index.js";
import { IWalletService } from "../services/walletService/index.js";
import { IPriceService } from "../services/priceService/index.js";
import { IRewardsService } from "../services/rewardsService/index.js";
import { IIntrinsicApyService } from "../services/intrinsicApyService/index.js";
import { IOracleAdapterService } from "../services/oracleAdapterService/index.js";
import type { EulerPlugin, ProcessPluginsArgs, WritePluginContext } from "../plugins/types.js";
import type { TransactionPlan } from "../services/executionService/executionServiceTypes.js";

export interface EulerSDKOptions<TVaultEntity extends IVaultEntity = VaultEntity> {
  accountService: IAccountService<TVaultEntity>;
  walletService: IWalletService;
  eVaultService: IEVaultService;
  eulerEarnService: IEulerEarnService;
  securitizeVaultService: ISecuritizeVaultService;
  vaultMetaService: IVaultMetaService<TVaultEntity>;
  deploymentService: IDeploymentService;
  providerService: IProviderService;
  abiService: IABIService;
  eulerLabelsService: IEulerLabelsService;
  tokenlistService: ITokenlistService;
  swapService: ISwapService;
  executionService: IExecutionService;
  simulationService: ISimulationService<TVaultEntity>;
  priceService: IPriceService;
  rewardsService: IRewardsService;
  intrinsicApyService: IIntrinsicApyService;
  oracleAdapterService: IOracleAdapterService;
  plugins?: EulerPlugin[];
}

export class EulerSDK<TVaultEntity extends IVaultEntity = VaultEntity> {
  public readonly accountService: IAccountService<TVaultEntity>;
  public readonly walletService: IWalletService;
  public readonly eVaultService: IEVaultService;
  public readonly eulerEarnService: IEulerEarnService;
  public readonly securitizeVaultService: ISecuritizeVaultService;
  public readonly vaultMetaService: IVaultMetaService<TVaultEntity>;
  public readonly deploymentService: IDeploymentService;
  public readonly providerService: IProviderService;
  public readonly abiService: IABIService;
  public readonly eulerLabelsService: IEulerLabelsService;
  public readonly tokenlistService: ITokenlistService;
  public readonly swapService: ISwapService;
  public readonly executionService: IExecutionService;
  public readonly simulationService: ISimulationService<TVaultEntity>;
  public readonly priceService: IPriceService;
  public readonly rewardsService: IRewardsService;
  public readonly intrinsicApyService: IIntrinsicApyService;
  public readonly oracleAdapterService: IOracleAdapterService;
  public readonly plugins: EulerPlugin[];

  constructor(options: EulerSDKOptions<TVaultEntity>) {
    this.accountService = options.accountService;
    this.walletService = options.walletService;
    this.eVaultService = options.eVaultService;
    this.eulerEarnService = options.eulerEarnService;
    this.securitizeVaultService = options.securitizeVaultService;
    this.vaultMetaService = options.vaultMetaService;
    this.deploymentService = options.deploymentService;
    this.providerService = options.providerService;
    this.abiService = options.abiService;
    this.eulerLabelsService = options.eulerLabelsService;
    this.tokenlistService = options.tokenlistService;
    this.swapService = options.swapService;
    this.executionService = options.executionService;
    this.simulationService = options.simulationService;
    this.priceService = options.priceService;
    this.rewardsService = options.rewardsService;
    this.intrinsicApyService = options.intrinsicApyService;
    this.oracleAdapterService = options.oracleAdapterService;
    this.plugins = options.plugins ?? [];
  }

  /**
   * Run all plugins' processPlan methods on a transaction plan.
   * Plugins execute in array order; each receives the plan as modified by previous plugins.
   * Errors in individual plugins are caught gracefully — the plan continues without that plugin.
   */
  async processPlugins(plan: TransactionPlan, args: ProcessPluginsArgs): Promise<TransactionPlan> {
    if (this.plugins.length === 0) return plan;

    const provider = this.providerService.getProvider(args.chainId);
    const ctx: WritePluginContext = { ...args, provider };

    for (const plugin of this.plugins) {
      if (!plugin.processPlan) continue;
      try {
        plan = await plugin.processPlan(plan, ctx);
      } catch {
        // Plugin failed — skip it gracefully, operation proceeds without this plugin's enrichment
      }
    }

    return plan;
  }
}
