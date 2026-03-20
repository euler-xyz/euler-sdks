import { EulerSDK } from "./sdk.js";
import { ABIService, type IABIService } from "../services/abiService/index.js";
import { DeploymentService, type IDeploymentService } from "../services/deploymentService/index.js";
import { ProviderService, type IProviderService } from "../services/providerService/index.js";
import { AccountService, type IAccountService } from "../services/accountService/index.js";
import { AccountOnchainAdapter } from "../services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import { AccountV3Adapter } from "../services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import { AccountVaultsSubgraphAdapter, type AccountVaultsSubgraphAdapterConfig } from "../services/accountService/adapters/accountVaultsSubgraphAdapter/accountVaultsSubgraphAdapter.js";
import type { AccountServiceConfig } from "../services/accountService/accountServiceConfig.js";
import { WalletService, type IWalletService } from "../services/walletService/index.js";
import { WalletOnchainAdapter } from "../services/walletService/adapters/walletOnchainAdapter.js";
import { EVaultService, type IEVaultService } from "../services/vaults/eVaultService/index.js";
import type { EVaultServiceConfig } from "../services/vaults/eVaultService/eVaultServiceConfig.js";
import { EulerEarnService, type IEulerEarnService } from "../services/vaults/eulerEarnService/index.js";
import { EulerEarnOnchainAdapter } from "../services/vaults/eulerEarnService/adapters/eulerEarnOnchainAdapter.js";
import { SecuritizeVaultService, type ISecuritizeVaultService } from "../services/vaults/securitizeVaultService/index.js";
import { SecuritizeVaultOnchainAdapter } from "../services/vaults/securitizeVaultService/adapters/securitizeVaultOnchainAdapter.js";
import { EulerLabelsService, EulerLabelsURLAdapter, type EulerLabelsURLAdapterConfig, type IEulerLabelsService } from "../services/eulerLabelsService/index.js";
import { TokenlistService, type ITokenlistService } from "../services/tokenlistService/index.js";
import { SwapService, type ISwapService, type SwapServiceConfig } from "../services/swapService/index.js";
import { ExecutionService, type IExecutionService } from "../services/executionService/index.js";
import { PriceService, type IPriceService, type BackendConfig, PricingBackendClient } from "../services/priceService/index.js";
import { RewardsService, type IRewardsService, type RewardsServiceConfig } from "../services/rewardsService/index.js";
import { IntrinsicApyService, type IIntrinsicApyService, type IntrinsicApyServiceConfig } from "../services/intrinsicApyService/index.js";
import {
  OracleAdapterService,
  type IOracleAdapterService,
  type OracleAdapterServiceConfig,
} from "../services/oracleAdapterService/index.js";
import { SimulationService, type ISimulationService } from "../services/simulationService/index.js";
import { defaultAccountV3AdapterConfig, defaultAccountVaultsAdapterConfig, defaultBackendConfig, defaultDeploymentServiceConfig, defaultEulerLabelsURLAdapterConfig, defaultSwapServiceConfig, defaultTokenlistServiceConfig, defaultVaultTypeAdapterConfig } from "./defaultConfig.js";
import { defaultEVaultV3AdapterConfig } from "./defaultConfig.js";
import { FeeFlowService, type IFeeFlowService, type FeeFlowServiceConfig } from "../services/feeFlowService/index.js";
import type { TokenlistServiceConfig } from "../services/tokenlistService/index.js";
import { EVaultOnchainAdapter } from "../services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import { EVaultV3Adapter } from "../services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.js";
import {
  VaultMetaService,
  type IVaultMetaService,
  VaultTypeSubgraphAdapter,
  type RegisteredVaultService,
  type VaultEntity,
  type VaultServiceEntry,
} from "../services/vaults/vaultMetaService/index.js";
import { VaultType } from "../utils/types.js";
import type { VaultTypeSubgraphAdapterConfig } from "../services/vaults/vaultMetaService/index.js";
import type { IVaultEntity } from "../entities/Account.js";
import type { BuildQueryFn } from "../utils/buildQuery.js";
import type { EulerPlugin } from "../plugins/types.js";
import { BatchSimulationAdapter } from "../plugins/batchSimulation.js";

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
  simulationService?: ISimulationService<TVaultEntity>;
  priceService?: IPriceService;
  rewardsService?: IRewardsService;
  intrinsicApyService?: IIntrinsicApyService;
  oracleAdapterService?: IOracleAdapterService;
  feeFlowService?: IFeeFlowService;
}

export interface BuildSDKOptions<TVaultEntity extends IVaultEntity = VaultEntity> {
  rpcUrls: Record<number, string>;
  /** Optional API key propagated to built-in V3 HTTP adapters as `X-API-Key`. */
  v3ApiKey?: string;
  accountServiceConfig?: AccountServiceConfig;
  eVaultServiceConfig?: EVaultServiceConfig;
  accountVaultsAdapterConfig?: AccountVaultsSubgraphAdapterConfig;
  vaultTypeAdapterConfig?: VaultTypeSubgraphAdapterConfig;
  /** Additional vault services to register; use { type, service } to register a custom vault type for getFactoryByType(chainId, type). Pass the extended entity type as the generic (e.g. buildEulerSDK<VaultEntity | CustomVault>({ ..., additionalVaultServices: [{ type: 'CustomVault', service: customService }] })). */
  additionalVaultServices?: VaultServiceEntry<TVaultEntity>[];
  eulerLabelsAdapterConfig?: EulerLabelsURLAdapterConfig;
  tokenlistServiceConfig?: TokenlistServiceConfig;
  swapServiceConfig?: SwapServiceConfig;
  backendConfig?: BackendConfig;
  rewardsServiceConfig?: RewardsServiceConfig;
  intrinsicApyServiceConfig?: IntrinsicApyServiceConfig;
  oracleAdapterServiceConfig?: OracleAdapterServiceConfig;
  feeFlowServiceConfig?: FeeFlowServiceConfig;
  /** Optional query decorator applied to all query* functions across all services. Use for global logging, caching, profiling, etc. */
  buildQuery?: BuildQueryFn;
  /** Plugins that enrich on-chain reads (via batchSimulation) and transaction plans (via processPlan). */
  plugins?: EulerPlugin[];
  servicesOverrides?: BuildSDKOverrides<TVaultEntity>;
}

export async function buildEulerSDK<TVaultEntity extends IVaultEntity = VaultEntity>(
  options: BuildSDKOptions<TVaultEntity>
): Promise<EulerSDK<TVaultEntity>> {
  const { rpcUrls, v3ApiKey, accountServiceConfig, eVaultServiceConfig, accountVaultsAdapterConfig, vaultTypeAdapterConfig, additionalVaultServices, eulerLabelsAdapterConfig, tokenlistServiceConfig, swapServiceConfig, backendConfig, rewardsServiceConfig, intrinsicApyServiceConfig, oracleAdapterServiceConfig, buildQuery, plugins, servicesOverrides, feeFlowServiceConfig } = options;

  // Build core services (these may be needed for adapters even if overridden)
  const abiService = servicesOverrides?.abiService ?? new ABIService(buildQuery);
  const deploymentService = servicesOverrides?.deploymentService ?? await DeploymentService.build(defaultDeploymentServiceConfig, buildQuery);
  const providerService = servicesOverrides?.providerService ?? new ProviderService(rpcUrls);

  // Account adapter is built early so it can be used when building account service (after vault meta service)
  const resolvedAccountServiceConfig = accountServiceConfig ?? {};
  const accountVaultsAdapter = new AccountVaultsSubgraphAdapter(accountVaultsAdapterConfig || defaultAccountVaultsAdapterConfig, buildQuery);
  const accountOnchainAdapter = new AccountOnchainAdapter(
    providerService as ProviderService,
    deploymentService as DeploymentService,
    accountVaultsAdapter,
    buildQuery,
  );
  const accountV3Adapter = new AccountV3Adapter(
    {
      ...(resolvedAccountServiceConfig.v3AdapterConfig ?? defaultAccountV3AdapterConfig),
      ...(v3ApiKey !== undefined ? { apiKey: v3ApiKey } : {}),
      ...(resolvedAccountServiceConfig.v3AdapterConfig?.apiKey !== undefined
        ? { apiKey: resolvedAccountServiceConfig.v3AdapterConfig.apiKey }
        : {}),
    },
    buildQuery,
  );
  const accountAdapter =
    resolvedAccountServiceConfig.adapter === "onchain"
      ? accountOnchainAdapter
      : accountV3Adapter;

  // Build wallet service if not overridden
  let walletService: IWalletService;
  if (servicesOverrides?.walletService) {
    walletService = servicesOverrides.walletService;
  } else {
    const walletAdapter = new WalletOnchainAdapter(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      buildQuery,
    );
    walletService = new WalletService(walletAdapter);
  }

  // Build eVault service if not overridden
  let eVaultService: IEVaultService;
  let eVaultAdapter: EVaultOnchainAdapter | undefined;
  if (servicesOverrides?.eVaultService) {
    eVaultService = servicesOverrides.eVaultService;
  } else {
    const resolvedEVaultServiceConfig = eVaultServiceConfig ?? {};
    const selectedEVaultAdapter = resolvedEVaultServiceConfig.adapter === "onchain"
      ? (() => {
          eVaultAdapter = new EVaultOnchainAdapter(
            providerService as ProviderService,
            deploymentService as DeploymentService,
            buildQuery,
          );
          return eVaultAdapter;
        })()
      : new EVaultV3Adapter(
          {
            ...(resolvedEVaultServiceConfig.v3AdapterConfig ?? defaultEVaultV3AdapterConfig),
            ...(v3ApiKey !== undefined ? { apiKey: v3ApiKey } : {}),
            ...(resolvedEVaultServiceConfig.v3AdapterConfig?.apiKey !== undefined
              ? { apiKey: resolvedEVaultServiceConfig.v3AdapterConfig.apiKey }
              : {}),
          },
          buildQuery,
        );
    eVaultService = new EVaultService(
      selectedEVaultAdapter,
      deploymentService as DeploymentService
    );
  }

  // Build eulerEarn service if not overridden
  let eulerEarnService: IEulerEarnService;
  if (servicesOverrides?.eulerEarnService) {
    eulerEarnService = servicesOverrides.eulerEarnService;
  } else {
    const eulerEarnAdapter = new EulerEarnOnchainAdapter(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      buildQuery,
    );
    eulerEarnService = new EulerEarnService(
      eulerEarnAdapter,
      deploymentService as DeploymentService,
      eVaultService
    );
  }

  // Build securitizeVault service if not overridden
  let securitizeVaultService: ISecuritizeVaultService;
  if (servicesOverrides?.securitizeVaultService) {
    securitizeVaultService = servicesOverrides.securitizeVaultService;
  } else {
    const securitizeVaultAdapter = new SecuritizeVaultOnchainAdapter(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      buildQuery,
    );
    securitizeVaultService = new SecuritizeVaultService(securitizeVaultAdapter);
  }

  // Build vault meta service (vault type subgraph + eVault + eulerEarn + additionalVaultServices); type reflects extended entity when additionalVaultServices is used with buildEulerSDK<TExtendedEntity>
  let vaultMetaService: IVaultMetaService<TVaultEntity>;
  if (servicesOverrides?.vaultMetaService) {
    vaultMetaService = servicesOverrides.vaultMetaService;
  } else {
    const vaultTypeAdapter = new VaultTypeSubgraphAdapter(
      vaultTypeAdapterConfig ?? defaultVaultTypeAdapterConfig,
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
      vaultTypeAdapter,
      vaultServices: allVaultServices,
    });
  }

  // Wire vaultMetaService into eVaultService for collateral resolution
  if (eVaultService instanceof EVaultService) {
    eVaultService.setVaultMetaService(vaultMetaService as IVaultMetaService);
  }

  // Wire plugins into onchain adapters for read-path enrichment
  if (plugins?.length) {
    const pluginBatchSimDs = new BatchSimulationAdapter(buildQuery);
    if (eVaultAdapter) {
      eVaultAdapter.setPlugins(plugins);
      eVaultAdapter.setBatchSimulationAdapter(pluginBatchSimDs);
    }
    accountOnchainAdapter.setPlugins(plugins);
    accountOnchainAdapter.setBatchSimulationAdapter(pluginBatchSimDs);
  }

  // Build account service if not overridden (requires vaultMetaService for fetchAccountWithVaults / fetchVaults)
  let accountService: IAccountService<TVaultEntity>;
  if (servicesOverrides?.accountService) {
    accountService = servicesOverrides.accountService;
  } else {
    accountService = new AccountService<TVaultEntity>(accountAdapter, vaultMetaService);
  }

  // Build eulerLabels service if not overridden
  const eulerLabelsConfig = eulerLabelsAdapterConfig || defaultEulerLabelsURLAdapterConfig;
  const eulerLabelsService = servicesOverrides?.eulerLabelsService ?? (() => {
    const eulerLabelsAdapter = new EulerLabelsURLAdapter(eulerLabelsConfig, buildQuery);
    return new EulerLabelsService(eulerLabelsAdapter, eulerLabelsConfig.getEulerLabelsLogoUrl);
  })();

  // Build tokenlist service if not overridden
  const tokenlistService = servicesOverrides?.tokenlistService ?? new TokenlistService(tokenlistServiceConfig || defaultTokenlistServiceConfig, buildQuery);

  // Build swap service if not overridden
  const swapService = servicesOverrides?.swapService ?? new SwapService(swapServiceConfig || defaultSwapServiceConfig, buildQuery);

  // Build execution service if not overridden
  const executionService = servicesOverrides?.executionService ?? (() => {
    const svc = new ExecutionService(
      deploymentService as DeploymentService,
      walletService as WalletService,
    );
    if (plugins?.length) svc.setPlugins(plugins);
    return svc;
  })();

  // Build price service if not overridden
  const priceService = servicesOverrides?.priceService ?? (() => {
    const resolvedBackendConfig = backendConfig ?? defaultBackendConfig;
    const backendClient = new PricingBackendClient(resolvedBackendConfig, buildQuery);
    return new PriceService(
      providerService as ProviderService,
      deploymentService as DeploymentService,
      backendClient,
      buildQuery,
    );
  })();

  // Build rewards service if not overridden
  const rewardsService = servicesOverrides?.rewardsService ?? new RewardsService(rewardsServiceConfig, buildQuery);

  // Build intrinsic APY service if not overridden
  const intrinsicApyService = servicesOverrides?.intrinsicApyService ?? new IntrinsicApyService(intrinsicApyServiceConfig, buildQuery);
  const oracleAdapterService =
    servicesOverrides?.oracleAdapterService ??
    new OracleAdapterService(oracleAdapterServiceConfig, buildQuery);
  const feeFlowService = servicesOverrides?.feeFlowService ?? new FeeFlowService(feeFlowServiceConfig, buildQuery);

  // Build simulation service if not overridden
  const simulationService = servicesOverrides?.simulationService ?? new SimulationService<TVaultEntity>(
    providerService as ProviderService,
    deploymentService as DeploymentService,
    vaultMetaService as IVaultMetaService<TVaultEntity>,
    executionService,
    priceService,
    rewardsService,
    intrinsicApyService,
    eulerLabelsService,
    walletService,
  );

  // Wire priceService and rewardsService into account service
  if (accountService instanceof AccountService) {
    accountService.setPriceService(priceService);
    accountService.setRewardsService(rewardsService);
  }

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

  if (rewardsService instanceof RewardsService) {
    rewardsService.setProviderService(providerService as ProviderService);
  }
  if (feeFlowService instanceof FeeFlowService) {
    feeFlowService.setProviderService(providerService as ProviderService);
    feeFlowService.setDeploymentService(deploymentService);
  }

  // Wire intrinsicApyService into vault services for intrinsic APY population
  if (eVaultService instanceof EVaultService) {
    eVaultService.setIntrinsicApyService(intrinsicApyService);
  }
  if (eulerEarnService instanceof EulerEarnService) {
    eulerEarnService.setIntrinsicApyService(intrinsicApyService);
  }
  if (securitizeVaultService instanceof SecuritizeVaultService) {
    securitizeVaultService.setIntrinsicApyService(intrinsicApyService);
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
    simulationService,
    priceService,
    rewardsService,
    intrinsicApyService,
    oracleAdapterService,
    feeFlowService,
    plugins,
  });
}
