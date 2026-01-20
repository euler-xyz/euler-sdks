import { EulerSDK } from "./sdk.js";
import { ABIService, IABIService } from "../services/abiService/index.js";
import { DeploymentService, IDeploymentService } from "../services/deploymentService/index.js";
import { ProviderService, IProviderService } from "../services/providerService/index.js";
import { AccountService, IAccountService } from "../services/accountService/index.js";
import { AccountOnchainDataSource } from "../services/accountService/dataSources/accountOnchainDataSource.js";
import { AccountVaultsSubgraphDataSource, AccountVaultsSubgraphDataSourceConfig } from "../services/accountService/dataSources/accountVaultsSubgraphDataSource.js";
import { EVaultService, IEVaultService } from "../services/eVaultService/index.js";
import { EulerEarnService, IEulerEarnService } from "../services/eulerEarnService/index.js";
import { EulerEarnOnchainDataSource } from "../services/eulerEarnService/dataSources/eulerEarnOnchainDataSource.js";
import { EulerLabelsService, EulerLabelsURLDataSource, EulerLabelsURLDataSourceConfig, IEulerLabelsService } from "../services/eulerLabelsService/index.js";
import { SwapService, ISwapService, SwapServiceConfig } from "../services/swapService/index.js";
import { ExecutionService, IExecutionService } from "../services/executionService/index.js";
import { defaultAccountVaultsDataSourceConfig, defaultEulerLabelsURLDataSourceConfig, defaultSwapServiceConfig } from "./defaultConfig.js";
import { EVaultOnchainDataSource } from "../services/eVaultService/dataSources/eVaultOnchainDataSource.js";

export interface BuildSDKConfig {
  rpcUrls: Record<number, string>;
  accountVaultsDataSourceConfig?: AccountVaultsSubgraphDataSourceConfig;
  eulerLabelsDataSourceConfig?: EulerLabelsURLDataSourceConfig;
  swapServiceConfig?: SwapServiceConfig;
}

export interface BuildSDKOverrides {
  abiService?: IABIService;
  deploymentService?: IDeploymentService;
  providerService?: IProviderService;
  accountService?: IAccountService;
  eVaultService?: IEVaultService;
  eulerEarnService?: IEulerEarnService;
  eulerLabelsService?: IEulerLabelsService;
  swapService?: ISwapService;
  executionService?: IExecutionService;
}

export interface BuildSDKOptions {
  config: BuildSDKConfig;
  overrides?: BuildSDKOverrides;
}

export const buildSDK = async (options: BuildSDKOptions) => {
  const { config, overrides } = options;

  // Build core services (these may be needed for data sources even if overridden)
  const abiService = overrides?.abiService ?? new ABIService();
  const deploymentService = overrides?.deploymentService ?? await DeploymentService.build();
  const providerService = overrides?.providerService ?? new ProviderService(config.rpcUrls);

  // Build account service if not overridden
  let accountService: IAccountService;
  if (overrides?.accountService) {
    accountService = overrides.accountService;
  } else {
    const accountVaultsDataSource = new AccountVaultsSubgraphDataSource(config.accountVaultsDataSourceConfig || defaultAccountVaultsDataSourceConfig);
    const accountDataSource = new AccountOnchainDataSource(
      providerService as ProviderService,
      abiService as ABIService,
      deploymentService as DeploymentService,
      accountVaultsDataSource
    );
    accountService = new AccountService(accountDataSource);
  }

  // Build eVault service if not overridden
  let eVaultService: IEVaultService;
  if (overrides?.eVaultService) {
    eVaultService = overrides.eVaultService;
  } else {
    const eVaultDataSource = new EVaultOnchainDataSource(
      providerService as ProviderService,
      abiService as ABIService,
      deploymentService as DeploymentService
    );
    eVaultService = new EVaultService(eVaultDataSource, deploymentService as DeploymentService);
  }

  // Build eulerEarn service if not overridden
  let eulerEarnService: IEulerEarnService;
  if (overrides?.eulerEarnService) {
    eulerEarnService = overrides.eulerEarnService;
  } else {
    const eulerEarnDataSource = new EulerEarnOnchainDataSource(
      providerService as ProviderService,
      abiService as ABIService,
      deploymentService as DeploymentService
    );
    eulerEarnService = new EulerEarnService(eulerEarnDataSource, deploymentService as DeploymentService);
  }

  // Build eulerLabels service if not overridden
  const eulerLabelsService = overrides?.eulerLabelsService ?? (() => {
    const eulerLabelsDataSource = new EulerLabelsURLDataSource(config.eulerLabelsDataSourceConfig || defaultEulerLabelsURLDataSourceConfig);
    return new EulerLabelsService(eulerLabelsDataSource);
  })();

  // Build swap service if not overridden
  const swapServiceConfig = config.swapServiceConfig || defaultSwapServiceConfig;
  const swapService = overrides?.swapService ?? new SwapService(swapServiceConfig);

  // Build execution service if not overridden
  const executionService = overrides?.executionService ?? new ExecutionService(deploymentService as DeploymentService);

  return new EulerSDK({
    accountService,
    eVaultService,
    eulerEarnService,
    deploymentService,
    providerService,
    abiService,
    eulerLabelsService,
    swapService,
    executionService,
  });
}