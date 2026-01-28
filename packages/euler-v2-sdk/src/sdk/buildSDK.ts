import { EulerSDK } from "./sdk.js";
import { ABIService, IABIService } from "../services/abiService/index.js";
import { DeploymentService, IDeploymentService } from "../services/deploymentService/index.js";
import { ProviderService, IProviderService } from "../services/providerService/index.js";
import { AccountService, IAccountService } from "../services/accountService/index.js";
import { AccountOnchainDataSource } from "../services/accountService/dataSources/accountOnchainDataSource.js";
import { AccountVaultsSubgraphDataSource, AccountVaultsSubgraphDataSourceConfig } from "../services/accountService/dataSources/accountVaultsSubgraphDataSource.js";
import { WalletService, IWalletService } from "../services/walletService/index.js";
import { WalletOnchainDataSource } from "../services/walletService/dataSources/walletOnchainDataSource.js";
import { EVaultService, IEVaultService } from "../services/eVaultService/index.js";
import { EulerEarnService, IEulerEarnService } from "../services/eulerEarnService/index.js";
import { EulerEarnOnchainDataSource } from "../services/eulerEarnService/dataSources/eulerEarnOnchainDataSource.js";
import { EulerLabelsService, EulerLabelsURLDataSource, EulerLabelsURLDataSourceConfig, IEulerLabelsService } from "../services/eulerLabelsService/index.js";
import { SwapService, ISwapService, SwapServiceConfig } from "../services/swapService/index.js";
import { ExecutionService, IExecutionService } from "../services/executionService/index.js";
import { defaultAccountVaultsDataSourceConfig, defaultEulerLabelsURLDataSourceConfig, defaultSwapServiceConfig } from "./defaultConfig.js";
import { EVaultOnchainDataSource } from "../services/eVaultService/dataSources/eVaultOnchainDataSource.js";


export interface BuildSDKOverrides {
  abiService?: IABIService;
  deploymentService?: IDeploymentService;
  providerService?: IProviderService;
  accountService?: IAccountService;
  walletService?: IWalletService;
  eVaultService?: IEVaultService;
  eulerEarnService?: IEulerEarnService;
  eulerLabelsService?: IEulerLabelsService;
  swapService?: ISwapService;
  executionService?: IExecutionService;
}

export interface BuildSDKOptions {
  rpcUrls: Record<number, string>;
  accountVaultsDataSourceConfig?: AccountVaultsSubgraphDataSourceConfig;
  eulerLabelsDataSourceConfig?: EulerLabelsURLDataSourceConfig;
  swapServiceConfig?: SwapServiceConfig;
  servicesOverrides?: BuildSDKOverrides;
}

export const buildSDK = async (options: BuildSDKOptions) => {
  const { rpcUrls, accountVaultsDataSourceConfig, eulerLabelsDataSourceConfig, swapServiceConfig, servicesOverrides } = options;

  // Build core services (these may be needed for data sources even if overridden)
  const abiService = servicesOverrides?.abiService ?? new ABIService();
  const deploymentService = servicesOverrides?.deploymentService ?? await DeploymentService.build();
  const providerService = servicesOverrides?.providerService ?? new ProviderService(rpcUrls);

  // Build account service if not overridden
  let accountService: IAccountService;
  if (servicesOverrides?.accountService) {
    accountService = servicesOverrides.accountService;
  } else {
    const accountVaultsDataSource = new AccountVaultsSubgraphDataSource(accountVaultsDataSourceConfig || defaultAccountVaultsDataSourceConfig);
    const accountDataSource = new AccountOnchainDataSource(
      providerService as ProviderService,
      abiService as ABIService,
      deploymentService as DeploymentService,
      accountVaultsDataSource
    );
    accountService = new AccountService(accountDataSource);
  }

  // Build wallet service if not overridden
  let walletService: IWalletService;
  if (servicesOverrides?.walletService) {
    walletService = servicesOverrides.walletService;
  } else {
    const walletDataSource = new WalletOnchainDataSource(
      providerService as ProviderService,
      abiService as ABIService,
      deploymentService as DeploymentService
    );
    walletService = new WalletService(walletDataSource);
  }

  // Build eVault service if not overridden
  let eVaultService: IEVaultService;
  if (servicesOverrides?.eVaultService) {
    eVaultService = servicesOverrides.eVaultService;
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
  if (servicesOverrides?.eulerEarnService) {
    eulerEarnService = servicesOverrides.eulerEarnService;
  } else {
    const eulerEarnDataSource = new EulerEarnOnchainDataSource(
      providerService as ProviderService,
      abiService as ABIService,
      deploymentService as DeploymentService
    );
    eulerEarnService = new EulerEarnService(eulerEarnDataSource, deploymentService as DeploymentService);
  }

  // Build eulerLabels service if not overridden
  const eulerLabelsService = servicesOverrides?.eulerLabelsService ?? (() => {
    const eulerLabelsDataSource = new EulerLabelsURLDataSource(eulerLabelsDataSourceConfig || defaultEulerLabelsURLDataSourceConfig);
    return new EulerLabelsService(eulerLabelsDataSource);
  })();

  // Build swap service if not overridden
  const swapService = servicesOverrides?.swapService ?? new SwapService(swapServiceConfig || defaultSwapServiceConfig);

  // Build execution service if not overridden
  const executionService = servicesOverrides?.executionService ?? new ExecutionService(
    deploymentService as DeploymentService,
    walletService as WalletService,
  );

  return new EulerSDK({
    accountService,
    walletService,
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