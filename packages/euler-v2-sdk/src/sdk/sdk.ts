import { IAccountService } from "../services/accountService/index.js";
import { IDeploymentService } from "../services/deploymentService/index.js";
import { IEVaultService } from "../services/eVaultService/index.js";
import { IEulerEarnService } from "../services/eulerEarnService/index.js";
import { IProviderService } from "../services/providerService/index.js";
import { IABIService } from "../services/abiService/index.js";
import { IEulerLabelsService } from "../services/eulerLabelsService/index.js";
import { ISwapService } from "../services/swapService/index.js";
import { IExecutionService } from "../services/executionService/index.js";
import { IWalletService } from "../services/walletService/index.js";

export interface EulerSDKOptions {
  accountService: IAccountService;
  walletService: IWalletService;
  eVaultService: IEVaultService;
  eulerEarnService: IEulerEarnService;
  deploymentService: IDeploymentService;
  providerService: IProviderService;
  abiService: IABIService;
  eulerLabelsService: IEulerLabelsService;
  swapService: ISwapService;
  executionService: IExecutionService;
}

export class EulerSDK {
  public readonly accountService: IAccountService;
  public readonly walletService: IWalletService;
  public readonly eVaultService: IEVaultService;
  public readonly eulerEarnService: IEulerEarnService;
  public readonly deploymentService: IDeploymentService;
  public readonly providerService: IProviderService;
  public readonly abiService: IABIService;
  public readonly eulerLabelsService: IEulerLabelsService;
  public readonly swapService: ISwapService;
  public readonly executionService: IExecutionService;

  constructor(options: EulerSDKOptions) {
    this.accountService = options.accountService;
    this.walletService = options.walletService;
    this.eVaultService = options.eVaultService;
    this.eulerEarnService = options.eulerEarnService;
    this.deploymentService = options.deploymentService;
    this.providerService = options.providerService;
    this.abiService = options.abiService;
    this.eulerLabelsService = options.eulerLabelsService;
    this.swapService = options.swapService;
    this.executionService = options.executionService;
  }
}