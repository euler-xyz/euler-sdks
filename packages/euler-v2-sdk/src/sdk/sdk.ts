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
import { IWalletService } from "../services/walletService/index.js";
import { IPriceService } from "../services/priceService/index.js";

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
  priceService: IPriceService;
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
  public readonly priceService: IPriceService;

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
    this.priceService = options.priceService;
  }
}