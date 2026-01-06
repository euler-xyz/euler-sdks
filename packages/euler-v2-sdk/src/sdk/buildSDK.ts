import { EulerSDK } from "./sdk.js";
import { ABIService } from "../services/abiService.js";
import { DeploymentService } from "../services/deploymentService.js";
import { ProviderService } from "../services/providerService.js";
import { AccountOnchainDataSource, AccountService, AccountVaultsSubgraphDataSource, AccountVaultsSubgraphDataSourceConfig } from "../services/accountService.js";
import { EVaultOnchainDataSource, EVaultService } from "../services/eVaultService.js";
import { EulerEarnOnchainDataSource, EulerEarnService } from "../services/eulerEarnService.js";
import { EulerLabelsService, EulerLabelsURLDataSource, EulerLabelsURLDataSourceConfig } from "../services/eulerLabelsService.js";
import { defaultAccountVaultsDataSourceConfig, defaultEulerLabelsURLDataSourceConfig } from "./defaultConfig.js";

export interface BuildSDKOptions {
  rpcUrls: Record<number, string>;
  accountVaultsDataSourceConfig?: AccountVaultsSubgraphDataSourceConfig;
  eulerLabelsDataSourceConfig?: EulerLabelsURLDataSourceConfig;
}
export const buildSDK = async (options: BuildSDKOptions) => {
  const abiService = new ABIService();
  const deploymentService = await DeploymentService.build();
  const providerService = new ProviderService(options.rpcUrls);

  const accountVaultsDataSource = new AccountVaultsSubgraphDataSource(options.accountVaultsDataSourceConfig || defaultAccountVaultsDataSourceConfig);
  const accountDataSource = new AccountOnchainDataSource(providerService, abiService, deploymentService, accountVaultsDataSource);
  const accountService = new AccountService(accountDataSource);

  const eVaultDataSource = new EVaultOnchainDataSource(providerService, abiService, deploymentService);
  const eVaultService = new EVaultService(eVaultDataSource, deploymentService);

  const eulerEarnDataSource = new EulerEarnOnchainDataSource(providerService, abiService, deploymentService);
  const eulerEarnService = new EulerEarnService(eulerEarnDataSource, deploymentService);

  const eulerLabelsDataSource = new EulerLabelsURLDataSource(options.eulerLabelsDataSourceConfig || defaultEulerLabelsURLDataSourceConfig);
  const eulerLabelsService = new EulerLabelsService(eulerLabelsDataSource);

  return new EulerSDK(accountService, eVaultService, eulerEarnService, deploymentService, providerService, abiService, eulerLabelsService);
}