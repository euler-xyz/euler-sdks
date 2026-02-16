import { EulerSDK } from "./sdk.js";
import { ABIService, IABIService } from "../services/abiService/index.js";
import { DeploymentService, IDeploymentService } from "../services/deploymentService/index.js";
import { ProviderService, IProviderService } from "../services/providerService/index.js";
import { AccountService, IAccountService } from "../services/accountService/index.js";
import { AccountOnchainDataSource } from "../services/accountService/dataSources/accountOnchainDataSource.js";
import { AccountVaultsSubgraphDataSource, AccountVaultsSubgraphDataSourceConfig } from "../services/accountService/dataSources/accountVaultsSubgraphDataSource.js";
import { WalletService, IWalletService } from "../services/walletService/index.js";
import { WalletOnchainDataSource } from "../services/walletService/dataSources/walletOnchainDataSource.js";
import { EVaultService, IEVaultService } from "../services/vaults/eVaultService/index.js";
import { EulerEarnService, IEulerEarnService } from "../services/vaults/eulerEarnService/index.js";
import { EulerEarnOnchainDataSource } from "../services/vaults/eulerEarnService/dataSources/eulerEarnOnchainDataSource.js";
import { SecuritizeVaultService, ISecuritizeVaultService } from "../services/vaults/securitizeVaultService/index.js";
import { SecuritizeVaultOnchainDataSource } from "../services/vaults/securitizeVaultService/dataSources/securitizeVaultOnchainDataSource.js";
import { EulerLabelsService, EulerLabelsURLDataSource, EulerLabelsURLDataSourceConfig, IEulerLabelsService } from "../services/eulerLabelsService/index.js";
import { TokenlistService, ITokenlistService } from "../services/tokenlistService/index.js";
import { SwapService, ISwapService, SwapServiceConfig } from "../services/swapService/index.js";
import { ExecutionService, IExecutionService } from "../services/executionService/index.js";
import { PriceService, IPriceService, type BackendConfig, PricingBackendClient } from "../services/priceService/index.js";
import { RewardsService, IRewardsService, type RewardsServiceConfig } from "../services/rewardsService/index.js";
import { defaultAccountVaultsDataSourceConfig, defaultDeploymentServiceConfig, defaultEulerLabelsURLDataSourceConfig, defaultSwapServiceConfig, defaultTokenlistServiceConfig, defaultVaultTypeDataSourceConfig } from "./defaultConfig.js";
import type { TokenlistServiceConfig } from "../services/tokenlistService/index.js";
import { EVaultOnchainDataSource } from "../services/vaults/eVaultService/dataSources/eVaultOnchainDataSource.js";
import {
  VaultMetaService,
  IVaultMetaService,
  VaultTypeSubgraphDataSource,
  type RegisteredVaultService,
  type VaultEntity,
  type VaultServiceEntry,
} from "../services/vaults/vaultMetaService/index.js";
import { VaultType } from "../utils/types.js";
import type { VaultTypeSubgraphDataSourceConfig } from "../services/vaults/vaultMetaService/index.js";
import type { IVaultEntity } from "../entities/Account.js";
import type { BuildQueryFn } from "../utils/buildQuery.js";
import type { EulerPlugin } from "../plugins/types.js";
import { BatchSimulationDataSource } from "../plugins/batchSimulation.js";

export interface BuildSDKOverrides<TVaultEntity extends IVaultEntity = VaultEntity> {
  abiService?: IABIService;
  deploymentService?: IDeploymentService;
  providerService?: IProviderService;
  accountService?: IAccountService<TVaultEntity>;
  walletService?: IWalletService;
  eVaultService?: IEVaultService;
  eulerEarnService?: IEulerEarnService;
  securitizeVaultService?: ISecuritizeVaultService;
  vaultMetaService?: IVaultMetaService<TVaultEntity>;
  eulerLabelsService?: IEulerLabelsService;
  tokenlistService?: ITokenlistService;
  swapService?: ISwapService;
  executionService?: IExecutionService;
  priceService?: IPriceService;
  rewardsService?: IRewardsService;
}

export interface BuildSDKOptions<TVaultEntity extends IVaultEntity = VaultEntity> {
  rpcUrls: Record<number, string>;
  accountVaultsDataSourceConfig?: AccountVaultsSubgraphDataSourceConfig;
  vaultTypeDataSourceConfig?: VaultTypeSubgraphDataSourceConfig;
  /** Additional vault services to register; use { type, service } to register a custom vault type for getFactoryByType(chainId, type). Pass the extended entity type as the generic (e.g. buildSDK<VaultEntity | CustomVault>({ ..., additionalVaultServices: [{ type: 'CustomVault', service: customService }] })). */
  additionalVaultServices?: VaultServiceEntry<TVaultEntity>[];
  eulerLabelsDataSourceConfig?: EulerLabelsURLDataSourceConfig;
  tokenlistServiceConfig?: TokenlistServiceConfig;
  swapServiceConfig?: SwapServiceConfig;
  backendConfig?: BackendConfig;
  rewardsServiceConfig?: RewardsServiceConfig;
  /** Optional query decorator applied to all query* functions across all services. Use for global logging, caching, profiling, etc. */
  buildQuery?: BuildQueryFn;
  /** Plugins that enrich on-chain reads (via batchSimulation) and transaction plans (via processPlan). */
  plugins?: EulerPlugin[];
  servicesOverrides?: BuildSDKOverrides<TVaultEntity>;
}

export async function buildSDK<TVaultEntity extends IVaultEntity = VaultEntity>(
  options: BuildSDKOptions<TVaultEntity>
): Promise<EulerSDK<TVaultEntity>> {
  const { rpcUrls, accountVaultsDataSourceConfig, vaultTypeDataSourceConfig, additionalVaultServices, eulerLabelsDataSourceConfig, tokenlistServiceConfig, swapServiceConfig, backendConfig, rewardsServiceConfig, buildQuery, plugins, servicesOverrides } = options;

  // Build core services (these may be needed for data sources even if overridden)
  const abiService = servicesOverrides?.abiService ?? new ABIService(buildQuery);
  const deploymentService = servicesOverrides?.deploymentService ?? await DeploymentService.build(defaultDeploymentServiceConfig, buildQuery);
  const providerService = servicesOverrides?.providerService ?? new ProviderService(rpcUrls);

  // Account data source is built early so it can be used when building account service (after vault meta service)
  const accountVaultsDataSource = new AccountVaultsSubgraphDataSource(accountVaultsDataSourceConfig || defaultAccountVaultsDataSourceConfig, buildQuery);
  const accountDataSource = new AccountOnchainDataSource(
    providerService as ProviderService,
    deploymentService as DeploymentService,
    accountVaultsDataSource,
    buildQuery,
  );

  // Build wallet service if not overridden
  let walletService: IWalletService;
  if (servicesOverrides?.walletService) {
    walletService = servicesOverrides.walletService;
  } else {
    const walletDataSource = new WalletOnchainDataSource(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      buildQuery,
    );
    walletService = new WalletService(walletDataSource);
  }

  // Build eVault service if not overridden
  let eVaultService: IEVaultService;
  let eVaultDataSource: EVaultOnchainDataSource | undefined;
  if (servicesOverrides?.eVaultService) {
    eVaultService = servicesOverrides.eVaultService;
  } else {
    eVaultDataSource = new EVaultOnchainDataSource(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      buildQuery,
    );
    eVaultService = new EVaultService(
      eVaultDataSource,
      deploymentService as DeploymentService
    );
  }

  // Build eulerEarn service if not overridden
  let eulerEarnService: IEulerEarnService;
  if (servicesOverrides?.eulerEarnService) {
    eulerEarnService = servicesOverrides.eulerEarnService;
  } else {
    const eulerEarnDataSource = new EulerEarnOnchainDataSource(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      buildQuery,
    );
    eulerEarnService = new EulerEarnService(
      eulerEarnDataSource,
      deploymentService as DeploymentService,
      eVaultService
    );
  }

  // Build securitizeVault service if not overridden
  let securitizeVaultService: ISecuritizeVaultService;
  if (servicesOverrides?.securitizeVaultService) {
    securitizeVaultService = servicesOverrides.securitizeVaultService;
  } else {
    const securitizeVaultDataSource = new SecuritizeVaultOnchainDataSource(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      buildQuery,
    );
    securitizeVaultService = new SecuritizeVaultService(
      securitizeVaultDataSource,
      deploymentService as DeploymentService
    );
  }

  // Build vault meta service (vault type subgraph + eVault + eulerEarn + additionalVaultServices); type reflects extended entity when additionalVaultServices is used with buildSDK<TExtendedEntity>
  let vaultMetaService: IVaultMetaService<TVaultEntity>;
  if (servicesOverrides?.vaultMetaService) {
    vaultMetaService = servicesOverrides.vaultMetaService;
  } else {
    const vaultTypeDataSource = new VaultTypeSubgraphDataSource(
      vaultTypeDataSourceConfig ?? defaultVaultTypeDataSourceConfig,
      buildQuery,
    );
    const allVaultServices: VaultServiceEntry<TVaultEntity>[] = [
      { type: VaultType.EVault, service: eVaultService as unknown as RegisteredVaultService<TVaultEntity> },
      { type: VaultType.EulerEarn, service: eulerEarnService as unknown as RegisteredVaultService<TVaultEntity> },
      {
        type: VaultType.SecuritizeCollateral,
        service: securitizeVaultService as unknown as RegisteredVaultService<TVaultEntity>,
      },
      ...(additionalVaultServices ?? []),
    ];
    vaultMetaService = new VaultMetaService<TVaultEntity>({
      vaultTypeDataSource,
      vaultServices: allVaultServices,
    });
  }

  // Wire vaultMetaService into eVaultService for collateral resolution
  if (eVaultService instanceof EVaultService) {
    eVaultService.setVaultMetaService(vaultMetaService as IVaultMetaService);
  }

  // Wire plugins into onchain data sources for read-path enrichment
  if (plugins?.length) {
    const pluginBatchSimDs = new BatchSimulationDataSource(buildQuery);
    if (eVaultDataSource) {
      eVaultDataSource.setPlugins(plugins);
      eVaultDataSource.setBatchSimulationDataSource(pluginBatchSimDs);
    }
    accountDataSource.setPlugins(plugins);
    accountDataSource.setBatchSimulationDataSource(pluginBatchSimDs);
  }

  // Build account service if not overridden (requires vaultMetaService for fetchAccountWithVaults / fetchVaults)
  let accountService: IAccountService<TVaultEntity>;
  if (servicesOverrides?.accountService) {
    accountService = servicesOverrides.accountService;
  } else {
    accountService = new AccountService<TVaultEntity>(accountDataSource, vaultMetaService);
  }

  // Build eulerLabels service if not overridden
  const eulerLabelsConfig = eulerLabelsDataSourceConfig || defaultEulerLabelsURLDataSourceConfig;
  const eulerLabelsService = servicesOverrides?.eulerLabelsService ?? (() => {
    const eulerLabelsDataSource = new EulerLabelsURLDataSource(eulerLabelsConfig, buildQuery);
    return new EulerLabelsService(eulerLabelsDataSource, eulerLabelsConfig.getEulerLabelsLogoUrl);
  })();

  // Build tokenlist service if not overridden
  const tokenlistService = servicesOverrides?.tokenlistService ?? new TokenlistService(tokenlistServiceConfig || defaultTokenlistServiceConfig, buildQuery);

  // Build swap service if not overridden
  const swapService = servicesOverrides?.swapService ?? new SwapService(swapServiceConfig || defaultSwapServiceConfig, buildQuery);

  // Build execution service if not overridden
  const executionService = servicesOverrides?.executionService ?? new ExecutionService(
    deploymentService as DeploymentService,
    walletService as WalletService,
  );

  // Build price service if not overridden
  const priceService = servicesOverrides?.priceService ?? (() => {
    const backendClient = backendConfig ? new PricingBackendClient(backendConfig, buildQuery) : undefined;
    return new PriceService(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      backendClient,
      buildQuery,
    );
  })();

  // Build rewards service if not overridden
  const rewardsService = servicesOverrides?.rewardsService ?? new RewardsService(rewardsServiceConfig, buildQuery);

  // Wire priceService into vault services for market price resolution
  if (eVaultService instanceof EVaultService) {
    eVaultService.setPriceService(priceService);
  }
  if (eulerEarnService instanceof EulerEarnService) {
    eulerEarnService.setPriceService(priceService);
  }
  if (securitizeVaultService instanceof SecuritizeVaultService) {
    securitizeVaultService.setPriceService(priceService);
  }

  // Wire rewardsService into vault services for reward population
  if (eVaultService instanceof EVaultService) {
    eVaultService.setRewardsService(rewardsService);
  }
  if (eulerEarnService instanceof EulerEarnService) {
    eulerEarnService.setRewardsService(rewardsService);
  }
  if (securitizeVaultService instanceof SecuritizeVaultService) {
    securitizeVaultService.setRewardsService(rewardsService);
  }

  // Wire eulerLabelsService into vault services for label population
  if (eVaultService instanceof EVaultService) {
    eVaultService.setEulerLabelsService(eulerLabelsService);
  }
  if (eulerEarnService instanceof EulerEarnService) {
    eulerEarnService.setEulerLabelsService(eulerLabelsService);
  }
  if (securitizeVaultService instanceof SecuritizeVaultService) {
    securitizeVaultService.setEulerLabelsService(eulerLabelsService);
  }

  return new EulerSDK<TVaultEntity>({
    accountService,
    walletService,
    eVaultService,
    eulerEarnService,
    securitizeVaultService,
    vaultMetaService,
    deploymentService,
    providerService,
    abiService,
    eulerLabelsService,
    tokenlistService,
    swapService,
    executionService,
    priceService,
    rewardsService,
    plugins,
  });
}