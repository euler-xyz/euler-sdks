import { EulerSDK } from "./sdk.js";
import { ABIService, type IABIService } from "../services/abiService/index.js";
import {
	DeploymentService,
	type IDeploymentService,
} from "../services/deploymentService/index.js";
import {
	ProviderService,
	type IProviderService,
} from "../services/providerService/index.js";
import {
	AccountService,
	type IAccountService,
} from "../services/accountService/index.js";
import {
	PortfolioService,
	type IPortfolioService,
} from "../services/portfolioService/index.js";
import { AccountOnchainAdapter } from "../services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import { AccountV3Adapter } from "../services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import {
	AccountVaultsSubgraphAdapter,
	type AccountVaultsSubgraphAdapterConfig,
} from "../services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import type { AccountServiceConfig } from "../services/accountService/accountServiceConfig.js";
import {
	WalletService,
	type IWalletService,
} from "../services/walletService/index.js";
import { WalletOnchainAdapter } from "../services/walletService/adapters/walletOnchainAdapter.js";
import {
	EVaultService,
	type IEVaultService,
} from "../services/vaults/eVaultService/index.js";
import type { EVaultServiceConfig } from "../services/vaults/eVaultService/eVaultServiceConfig.js";
import {
	EulerEarnService,
	EulerEarnV3Adapter,
	type EulerEarnServiceConfig,
	type IEulerEarnService,
} from "../services/vaults/eulerEarnService/index.js";
import { EulerEarnOnchainAdapter } from "../services/vaults/eulerEarnService/adapters/eulerEarnOnchainAdapter.js";
import {
	SecuritizeVaultService,
	type ISecuritizeVaultService,
} from "../services/vaults/securitizeVaultService/index.js";
import { SecuritizeVaultOnchainAdapter } from "../services/vaults/securitizeVaultService/adapters/securitizeVaultOnchainAdapter.js";
import {
	EulerLabelsService,
	EulerLabelsURLAdapter,
	type EulerLabelsURLAdapterConfig,
	type IEulerLabelsService,
} from "../services/eulerLabelsService/index.js";
import {
	TokenlistService,
	type ITokenlistService,
} from "../services/tokenlistService/index.js";
import {
	SwapService,
	type ISwapService,
	type SwapServiceConfig,
} from "../services/swapService/index.js";
import {
	ExecutionService,
	type IExecutionService,
} from "../services/executionService/index.js";
import {
	PriceService,
	type IPriceService,
	type PricingServiceConfig,
	PricingBackendClient,
} from "../services/priceService/index.js";
import {
	RewardsDirectAdapter,
	RewardsService,
	RewardsV3Adapter,
	type IRewardsService,
	type RewardsDirectAdapterConfig,
	type RewardsServiceConfig,
} from "../services/rewardsService/index.js";
import {
	IntrinsicApyService,
	IntrinsicApyV3Adapter,
	type IIntrinsicApyService,
	type IntrinsicApyServiceConfig,
} from "../services/intrinsicApyService/index.js";
import {
	OracleAdapterService,
	type IOracleAdapterService,
	type OracleAdapterServiceConfig,
} from "../services/oracleAdapterService/index.js";
import {
	DEFAULT_EULER_LABELS_BASE_URL,
	DEFAULT_TOKENLIST_API_BASE_URL,
	defaultAccountV3AdapterConfig,
	defaultAccountVaultsAdapterConfig,
	defaultDeploymentServiceConfig,
	defaultEulerEarnV3AdapterConfig,
	defaultEulerLabelsURLAdapterConfig,
	defaultIntrinsicApyV3AdapterConfig,
	defaultPricingServiceConfig,
	defaultRewardsV3AdapterConfig,
	defaultSwapServiceConfig,
	defaultTokenlistServiceConfig,
	defaultVaultTypeAdapterConfig,
} from "./defaultConfig.js";
import { defaultEVaultV3AdapterConfig } from "./defaultConfig.js";
import {
	FeeFlowService,
	type IFeeFlowService,
	type FeeFlowServiceConfig,
} from "../services/feeFlowService/index.js";
import {
	REULLockService,
	type IREULLockService,
} from "../services/reulLockService/index.js";
import {
	AavePositionMigrationConnector,
	MorphoPositionMigrationConnector,
	PositionMigrationService,
	type AaveMigrationConnectorConfig,
	type IPositionMigrationService,
	type MorphoMigrationConnectorConfig,
	type PositionMigrationServiceConfig,
} from "../services/positionMigrationService/index.js";
import {
	type EulerSDKConfig,
	readEulerSDKEnvConfig,
	type VaultTypeAdapterKind,
} from "./config.js";
import type { TokenlistServiceConfig } from "../services/tokenlistService/index.js";
import { EVaultOnchainAdapter } from "../services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import { EVaultV3Adapter } from "../services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.js";
import {
	VaultMetaService,
	type IVaultMetaService,
	VaultTypeSubgraphAdapter,
	VaultTypeV3Adapter,
	type RegisteredVaultService,
	type VaultEntity,
	type VaultServiceEntry,
} from "../services/vaults/vaultMetaService/index.js";
import { VaultType } from "../utils/types.js";
import type {
	VaultTypeSubgraphAdapterConfig,
	VaultTypeV3AdapterConfig,
} from "../services/vaults/vaultMetaService/index.js";
import type { IVaultEntity } from "../entities/Account.js";
import {
	createQueryCacheBuildQuery,
	type BuildQueryFn,
	type QueryCacheConfig,
} from "../utils/buildQuery.js";
import {
	createFallbackAdapter,
	type FallbackInfo,
} from "../utils/fallbackAdapter.js";
import type { IAccountAdapter } from "../services/accountService/accountService.js";
import type { IEVaultAdapter } from "../services/vaults/eVaultService/eVaultService.js";
import type { IEulerEarnAdapter } from "../services/vaults/eulerEarnService/eulerEarnService.js";
import type { IRewardsAdapter } from "../services/rewardsService/rewardsServiceTypes.js";
import type { IVaultTypeAdapter } from "../services/vaults/vaultMetaService/adapters/IVaultTypeAdapter.js";
import type { EulerPlugin } from "../plugins/types.js";
import { BatchSimulationAdapter } from "../plugins/batchSimulation.js";

export interface BuildSDKOverrides<
	TVaultEntity extends IVaultEntity = VaultEntity,
> {
	abiService?: IABIService;
	deploymentService?: IDeploymentService;
	providerService?: IProviderService;
	accountService?: IAccountService<TVaultEntity>;
	portfolioService?: IPortfolioService<TVaultEntity>;
	walletService?: IWalletService;
	eVaultService?: IEVaultService;
	eulerEarnService?: IEulerEarnService;
	securitizeVaultService?: ISecuritizeVaultService;
	vaultMetaService?: IVaultMetaService<TVaultEntity>;
	eulerLabelsService?: IEulerLabelsService;
	tokenlistService?: ITokenlistService;
	swapService?: ISwapService;
	executionService?: IExecutionService<TVaultEntity>;
	priceService?: IPriceService;
	rewardsService?: IRewardsService;
	intrinsicApyService?: IIntrinsicApyService;
	oracleAdapterService?: IOracleAdapterService;
	feeFlowService?: IFeeFlowService;
	reulLockService?: IREULLockService;
	positionMigrationService?: IPositionMigrationService;
}

export type { EulerSDKConfig } from "./config.js";

export interface BuildSDKOptions<
	TVaultEntity extends IVaultEntity = VaultEntity,
> {
	/**
	 * SDK-owned runtime config for built-in scalar options. Values here override
	 * top-level service config props, environment variables, and defaults.
	 */
	config?: EulerSDKConfig;
	/** Optional API key propagated to built-in V3 HTTP adapters as `X-API-Key`. */
	v3ApiKey?: string;
	accountServiceConfig?: AccountServiceConfig;
	eVaultServiceConfig?: EVaultServiceConfig;
	eulerEarnServiceConfig?: EulerEarnServiceConfig;
	accountVaultsAdapterConfig?: AccountVaultsSubgraphAdapterConfig;
	vaultTypeAdapterConfig?:
		| VaultTypeSubgraphAdapterConfig
		| VaultTypeV3AdapterConfig;
	/** Additional vault services to register; use { type, service } to register a custom vault type for getFactoryByType(chainId, type). Pass the extended entity type as the generic (e.g. buildEulerSDK<VaultEntity | CustomVault>({ ..., additionalVaultServices: [{ type: 'CustomVault', service: customService }] })). */
	additionalVaultServices?: VaultServiceEntry<TVaultEntity>[];
	eulerLabelsAdapterConfig?: EulerLabelsURLAdapterConfig;
	tokenlistServiceConfig?: TokenlistServiceConfig;
	swapServiceConfig?: SwapServiceConfig;
	pricingServiceConfig?: PricingServiceConfig;
	rewardsServiceConfig?: RewardsServiceConfig;
	intrinsicApyServiceConfig?: IntrinsicApyServiceConfig;
	oracleAdapterServiceConfig?: OracleAdapterServiceConfig;
	feeFlowServiceConfig?: FeeFlowServiceConfig;
	positionMigrationServiceConfig?: PositionMigrationServiceConfig;
	positionMigrationConnectorConfig?: {
		morpho?: MorphoMigrationConnectorConfig;
		aave?: AaveMigrationConnectorConfig;
	};
	/** Default in-memory cache applied to all decorated `query*` methods. Enabled by default with a 5s TTL. */
	queryCacheConfig?: QueryCacheConfig;
	/** Optional query decorator applied to all query* functions across all services. Use for global logging, caching, profiling, etc. */
	buildQuery?: BuildQueryFn;
	/** Plugins that enrich on-chain reads (via batchSimulation) and transaction plans (via processPlan). */
	plugins?: EulerPlugin[];
	/**
	 * Optional callback invoked whenever a built-in fallback adapter routes a call from the primary
	 * to the secondary. Use for telemetry, dashboards, or in-app diagnostics.
	 */
	onFallback?: (info: FallbackInfo) => void;
	servicesOverrides?: BuildSDKOverrides<TVaultEntity>;
}

function pickConfigValue<T>(
	configValue: T | undefined,
	explicitValue: T | undefined,
	envValue: T | undefined,
	defaultValue?: T,
): T | undefined {
	return configValue ?? explicitValue ?? envValue ?? defaultValue;
}

function mergeNumberRecords<T>(
	defaultRecord?: Record<number, T>,
	envRecord?: Record<number, T>,
	explicitRecord?: Record<number, T>,
	configRecord?: Record<number, T>,
): Record<number, T> {
	return {
		...(defaultRecord ?? {}),
		...(envRecord ?? {}),
		...(explicitRecord ?? {}),
		...(configRecord ?? {}),
	};
}

function mergeStringRecords<T>(
	envRecord?: Record<string, T>,
	explicitRecord?: Record<string, T>,
	configRecord?: Record<string, T>,
): Record<string, T> | undefined {
	const merged = {
		...(envRecord ?? {}),
		...(explicitRecord ?? {}),
		...(configRecord ?? {}),
	};
	return Object.keys(merged).length > 0 ? merged : undefined;
}

function maybeField<TValue, TKey extends string>(
	key: TKey,
	value: TValue | undefined,
): { [K in TKey]?: TValue } {
	return value === undefined
		? {}
		: ({ [key]: value } as { [K in TKey]?: TValue });
}

function resolveV3AdapterConfig<
	TConfig extends { endpoint: string; apiKey?: string },
>(
	defaultConfig: TConfig,
	args: {
		explicitConfig?: Partial<TConfig>;
		explicitV3ApiKey?: string;
		envConfig: EulerSDKConfig;
		config?: EulerSDKConfig;
		envEndpoint?: string;
		configEndpoint?: string;
		envApiKey?: string;
		configApiKey?: string;
		envExtra?: Partial<TConfig>;
		configExtra?: Partial<TConfig>;
	},
): TConfig {
	const {
		explicitConfig,
		explicitV3ApiKey,
		envConfig,
		config,
		envEndpoint,
		configEndpoint,
		envApiKey,
		configApiKey,
		envExtra,
		configExtra,
	} = args;

	return {
		...defaultConfig,
		...maybeField("endpoint", envConfig.v3ApiUrl),
		...maybeField("apiKey", envConfig.v3ApiKey),
		...maybeField("endpoint", envEndpoint),
		...maybeField("apiKey", envApiKey),
		...(envExtra ?? {}),
		...maybeField("apiKey", explicitV3ApiKey),
		...(explicitConfig ?? {}),
		...maybeField("endpoint", config?.v3ApiUrl),
		...maybeField("apiKey", config?.v3ApiKey),
		...maybeField("endpoint", configEndpoint),
		...maybeField("apiKey", configApiKey),
		...(configExtra ?? {}),
	} as TConfig;
}

function applyTemplate(
	template: string,
	values: Record<string, string | number>,
): string {
	return Object.entries(values).reduce(
		(result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
		template,
	);
}

function makeEulerLabelsConfig(
	config: EulerSDKConfig | undefined,
): Partial<EulerLabelsURLAdapterConfig> {
	if (!config) return {};

	const baseUrl = config.eulerLabelsBaseUrl ?? DEFAULT_EULER_LABELS_BASE_URL;
	const hasBaseOverride = config.eulerLabelsBaseUrl !== undefined;

	return {
		...(hasBaseOverride || config.eulerLabelsEntitiesUrlTemplate
			? {
					getEulerLabelsEntitiesUrl: (chainId: number) =>
						config.eulerLabelsEntitiesUrlTemplate
							? applyTemplate(config.eulerLabelsEntitiesUrlTemplate, {
									base: baseUrl,
									chainId,
								})
							: `${baseUrl}/${chainId}/entities.json`,
				}
			: {}),
		...(hasBaseOverride || config.eulerLabelsProductsUrlTemplate
			? {
					getEulerLabelsProductsUrl: (chainId: number) =>
						config.eulerLabelsProductsUrlTemplate
							? applyTemplate(config.eulerLabelsProductsUrlTemplate, {
									base: baseUrl,
									chainId,
								})
							: `${baseUrl}/${chainId}/products.json`,
				}
			: {}),
		...(hasBaseOverride || config.eulerLabelsPointsUrlTemplate
			? {
					getEulerLabelsPointsUrl: (chainId: number) =>
						config.eulerLabelsPointsUrlTemplate
							? applyTemplate(config.eulerLabelsPointsUrlTemplate, {
									base: baseUrl,
									chainId,
								})
							: `${baseUrl}/${chainId}/points.json`,
				}
			: {}),
		...(hasBaseOverride || config.eulerLabelsEarnVaultsUrlTemplate
			? {
					getEulerLabelsEarnVaultsUrl: (chainId: number) =>
						config.eulerLabelsEarnVaultsUrlTemplate
							? applyTemplate(config.eulerLabelsEarnVaultsUrlTemplate, {
									base: baseUrl,
									chainId,
								})
							: `${baseUrl}/${chainId}/earn-vaults.json`,
				}
			: {}),
		...(hasBaseOverride || config.eulerLabelsAssetsUrlTemplate
			? {
					getEulerLabelsAssetsUrl: (chainId: number) =>
						config.eulerLabelsAssetsUrlTemplate
							? applyTemplate(config.eulerLabelsAssetsUrlTemplate, {
									base: baseUrl,
									chainId,
								})
							: `${baseUrl}/${chainId}/assets.json`,
				}
			: {}),
		...(hasBaseOverride || config.eulerLabelsGlobalAssetsUrl
			? {
					getEulerLabelsGlobalAssetsUrl: () =>
						config.eulerLabelsGlobalAssetsUrl ?? `${baseUrl}/all/assets.json`,
				}
			: {}),
		...(hasBaseOverride || config.eulerLabelsLogoUrlTemplate
			? {
					getEulerLabelsLogoUrl: (filename: string) =>
						config.eulerLabelsLogoUrlTemplate
							? applyTemplate(config.eulerLabelsLogoUrlTemplate, {
									base: baseUrl,
									filename,
								})
							: `${baseUrl}/logo/${filename}`,
				}
			: {}),
	};
}

function makeTokenlistConfig(
	config: EulerSDKConfig | undefined,
): Partial<TokenlistServiceConfig> {
	if (!config?.tokenlistApiBaseUrl && !config?.tokenlistUrlTemplate) return {};

	const baseUrl = config.tokenlistApiBaseUrl ?? DEFAULT_TOKENLIST_API_BASE_URL;
	return {
		getTokenListUrl: (chainId: number) =>
			config.tokenlistUrlTemplate
				? applyTemplate(config.tokenlistUrlTemplate, { base: baseUrl, chainId })
				: `${baseUrl}/v3/tokens?chainId=${chainId}&limit=500&type=base`,
	};
}

function resolveRewardsDirectAdapterConfig(
	explicitConfig: RewardsServiceConfig | undefined,
	envConfig: EulerSDKConfig,
	config: EulerSDKConfig | undefined,
): RewardsDirectAdapterConfig {
	return {
		...maybeField("merklApiUrl", envConfig.rewardsMerklApiUrl),
		...maybeField("brevisApiUrl", envConfig.rewardsBrevisApiUrl),
		...maybeField("brevisProofsApiUrl", envConfig.rewardsBrevisProofsApiUrl),
		...maybeField("fuulApiUrl", envConfig.rewardsFuulApiUrl),
		...maybeField("fuulTotalsUrl", envConfig.rewardsFuulTotalsUrl),
		...maybeField("fuulClaimChecksUrl", envConfig.rewardsFuulClaimChecksUrl),
		...maybeField("brevisChainIds", envConfig.rewardsBrevisChainIds),
		...maybeField(
			"merklDistributorAddress",
			envConfig.rewardsMerklDistributorAddress,
		),
		...maybeField("fuulManagerAddress", envConfig.rewardsFuulManagerAddress),
		...maybeField("fuulFactoryAddress", envConfig.rewardsFuulFactoryAddress),
		...maybeField("enableMerkl", envConfig.rewardsEnableMerkl),
		...maybeField("enableBrevis", envConfig.rewardsEnableBrevis),
		...maybeField("enableFuul", envConfig.rewardsEnableFuul),
		...maybeField("merklApiUrl", explicitConfig?.merklApiUrl),
		...maybeField("brevisApiUrl", explicitConfig?.brevisApiUrl),
		...maybeField("brevisProofsApiUrl", explicitConfig?.brevisProofsApiUrl),
		...maybeField("fuulApiUrl", explicitConfig?.fuulApiUrl),
		...maybeField("fuulTotalsUrl", explicitConfig?.fuulTotalsUrl),
		...maybeField("fuulClaimChecksUrl", explicitConfig?.fuulClaimChecksUrl),
		...maybeField("brevisChainIds", explicitConfig?.brevisChainIds),
		...maybeField(
			"merklDistributorAddress",
			explicitConfig?.merklDistributorAddress,
		),
		...maybeField("fuulManagerAddress", explicitConfig?.fuulManagerAddress),
		...maybeField("fuulFactoryAddress", explicitConfig?.fuulFactoryAddress),
		...maybeField("enableMerkl", explicitConfig?.enableMerkl),
		...maybeField("enableBrevis", explicitConfig?.enableBrevis),
		...maybeField("enableFuul", explicitConfig?.enableFuul),
		...(explicitConfig?.directAdapterConfig ?? {}),
		...maybeField("merklApiUrl", config?.rewardsMerklApiUrl),
		...maybeField("brevisApiUrl", config?.rewardsBrevisApiUrl),
		...maybeField("brevisProofsApiUrl", config?.rewardsBrevisProofsApiUrl),
		...maybeField("fuulApiUrl", config?.rewardsFuulApiUrl),
		...maybeField("fuulTotalsUrl", config?.rewardsFuulTotalsUrl),
		...maybeField("fuulClaimChecksUrl", config?.rewardsFuulClaimChecksUrl),
		...maybeField("brevisChainIds", config?.rewardsBrevisChainIds),
		...maybeField(
			"merklDistributorAddress",
			config?.rewardsMerklDistributorAddress,
		),
		...maybeField("fuulManagerAddress", config?.rewardsFuulManagerAddress),
		...maybeField("fuulFactoryAddress", config?.rewardsFuulFactoryAddress),
		...maybeField("enableMerkl", config?.rewardsEnableMerkl),
		...maybeField("enableBrevis", config?.rewardsEnableBrevis),
		...maybeField("enableFuul", config?.rewardsEnableFuul),
	};
}

export async function buildEulerSDK<
	TVaultEntity extends IVaultEntity = VaultEntity,
>(
	options: BuildSDKOptions<TVaultEntity> = {},
): Promise<EulerSDK<TVaultEntity>> {
	const {
		config,
		v3ApiKey,
		accountServiceConfig,
		eVaultServiceConfig,
		eulerEarnServiceConfig,
		accountVaultsAdapterConfig,
		vaultTypeAdapterConfig,
		additionalVaultServices,
		eulerLabelsAdapterConfig,
		tokenlistServiceConfig,
		swapServiceConfig,
		pricingServiceConfig,
		rewardsServiceConfig,
		intrinsicApyServiceConfig,
		oracleAdapterServiceConfig,
		queryCacheConfig,
		buildQuery,
		plugins,
		onFallback,
		servicesOverrides,
		feeFlowServiceConfig,
		positionMigrationServiceConfig,
		positionMigrationConnectorConfig,
	} = options;

	const envConfig = readEulerSDKEnvConfig();
	const resolvedRpcUrls = mergeNumberRecords(
		undefined,
		envConfig.rpcUrls,
		undefined,
		config?.rpcUrls,
	);
	const resolvedQueryCacheConfig: QueryCacheConfig = {
		...maybeField("enabled", envConfig.queryCacheEnabled),
		...maybeField("ttlMs", envConfig.queryCacheTtlMs),
		...(queryCacheConfig ?? {}),
		...maybeField("enabled", config?.queryCacheEnabled),
		...maybeField("ttlMs", config?.queryCacheTtlMs),
	};
	const resolvedBuildQuery =
		buildQuery ?? createQueryCacheBuildQuery(resolvedQueryCacheConfig);
	const resolvedDeploymentServiceConfig = {
		...defaultDeploymentServiceConfig,
		...maybeField("deploymentsUrl", envConfig.deploymentsUrl),
		...maybeField("deploymentsUrl", config?.deploymentsUrl),
	};

	// Build core services (these may be needed for adapters even if overridden)
	const abiService =
		servicesOverrides?.abiService ?? new ABIService(resolvedBuildQuery);
	const deploymentService =
		servicesOverrides?.deploymentService ??
		(await DeploymentService.build(
			resolvedDeploymentServiceConfig,
			resolvedBuildQuery,
		));
	const providerService =
		servicesOverrides?.providerService ?? new ProviderService(resolvedRpcUrls);

	const disableV3 =
		pickConfigValue(config?.disableV3, undefined, envConfig.disableV3) ?? false;

	// Account adapter is built early so it can be used when building account service (after vault meta service)
	const resolvedAccountServiceConfig = accountServiceConfig ?? {};
	const resolvedAccountServiceAdapter =
		pickConfigValue(
			config?.accountServiceAdapter,
			resolvedAccountServiceConfig.adapter,
			envConfig.accountServiceAdapter,
		) ?? "fallback";
	const effectiveAccountServiceAdapter = (() => {
		if (!disableV3) return resolvedAccountServiceAdapter;
		if (resolvedAccountServiceAdapter === "v3") {
			console.warn(
				"[buildEulerSDK] disableV3 is set but accountServiceAdapter='v3'; forcing 'onchain'.",
			);
			return "onchain" as const;
		}
		if (resolvedAccountServiceAdapter === "fallback") return "onchain" as const;
		return resolvedAccountServiceAdapter;
	})();

	const accountV3Config = resolveV3AdapterConfig(defaultAccountV3AdapterConfig, {
		explicitConfig: resolvedAccountServiceConfig.v3AdapterConfig,
		explicitV3ApiKey: v3ApiKey,
		envConfig,
		config,
		envEndpoint: envConfig.accountV3ApiUrl,
		configEndpoint: config?.accountV3ApiUrl,
		envApiKey: envConfig.accountV3ApiKey,
		configApiKey: config?.accountV3ApiKey,
		envExtra: {
			...maybeField("forceFresh", envConfig.accountV3ForceFresh),
		},
		configExtra: {
			...maybeField("forceFresh", config?.accountV3ForceFresh),
		},
	});
	const accountVaultsSubgraphUrls = mergeNumberRecords(
		defaultAccountVaultsAdapterConfig.subgraphURLs,
		envConfig.accountVaultsSubgraphUrls,
		accountVaultsAdapterConfig?.subgraphURLs,
		config?.accountVaultsSubgraphUrls,
	);
	const canBuildAccountV3 = !!accountV3Config.endpoint;
	const canBuildAccountOnchain =
		Object.keys(accountVaultsSubgraphUrls).length > 0;

	let accountOnchainAdapter: AccountOnchainAdapter | undefined;
	const buildAccountV3 = () =>
		new AccountV3Adapter(accountV3Config, resolvedBuildQuery);
	const buildAccountOnchain = () => {
		const accountVaultsAdapter = new AccountVaultsSubgraphAdapter(
			{ subgraphURLs: accountVaultsSubgraphUrls },
			resolvedBuildQuery,
		);
		accountOnchainAdapter = new AccountOnchainAdapter(
			providerService as ProviderService,
			deploymentService as DeploymentService,
			accountVaultsAdapter,
			resolvedBuildQuery,
		);
		return accountOnchainAdapter;
	};

	let accountAdapter: IAccountAdapter;
	if (effectiveAccountServiceAdapter === "v3") {
		if (!canBuildAccountV3)
			throw new Error(
				"[buildEulerSDK] accountServiceAdapter='v3' but no V3 endpoint is configured.",
			);
		accountAdapter = buildAccountV3();
	} else if (effectiveAccountServiceAdapter === "onchain") {
		if (!canBuildAccountOnchain)
			throw new Error(
				"[buildEulerSDK] accountServiceAdapter='onchain' but no accountVaultsSubgraphUrls are configured.",
			);
		accountAdapter = buildAccountOnchain();
	} else if (canBuildAccountV3 && canBuildAccountOnchain) {
		accountAdapter = createFallbackAdapter<
			IAccountAdapter,
			"fetchAccount" | "fetchSubAccount"
		>(buildAccountV3(), buildAccountOnchain(), {
			methods: ["fetchAccount", "fetchSubAccount"],
			adapterNames: { primary: "accountV3", secondary: "accountOnchain" },
			onFallback,
		});
	} else if (canBuildAccountV3) {
		console.warn(
			"[buildEulerSDK] accountService fallback disabled: onchain adapter requires accountVaultsSubgraphUrls. Using V3 only.",
		);
		accountAdapter = buildAccountV3();
	} else if (canBuildAccountOnchain) {
		console.warn(
			"[buildEulerSDK] accountService fallback disabled: V3 endpoint not configured. Using onchain only.",
		);
		accountAdapter = buildAccountOnchain();
	} else {
		throw new Error(
			"[buildEulerSDK] cannot build account adapter: neither V3 endpoint nor accountVaultsSubgraphUrls are configured.",
		);
	}

	// Build wallet service if not overridden
	let walletService: IWalletService;
	if (servicesOverrides?.walletService) {
		walletService = servicesOverrides.walletService;
	} else {
		const walletAdapter = new WalletOnchainAdapter(
			providerService as ProviderService,
			deploymentService as DeploymentService,
			resolvedBuildQuery,
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
		const resolvedEVaultServiceAdapter =
			pickConfigValue(
				config?.eVaultServiceAdapter,
				resolvedEVaultServiceConfig.adapter,
				envConfig.eVaultServiceAdapter,
			) ?? "fallback";
		const effectiveEVaultServiceAdapter = (() => {
			if (!disableV3) return resolvedEVaultServiceAdapter;
			if (resolvedEVaultServiceAdapter === "v3") {
				console.warn(
					"[buildEulerSDK] disableV3 is set but eVaultServiceAdapter='v3'; forcing 'onchain'.",
				);
				return "onchain" as const;
			}
			if (resolvedEVaultServiceAdapter === "fallback") return "onchain" as const;
			return resolvedEVaultServiceAdapter;
		})();

		const eVaultV3Config = resolveV3AdapterConfig(defaultEVaultV3AdapterConfig, {
			explicitConfig: resolvedEVaultServiceConfig.v3AdapterConfig,
			explicitV3ApiKey: v3ApiKey,
			envConfig,
			config,
			envEndpoint: envConfig.eVaultV3ApiUrl,
			configEndpoint: config?.eVaultV3ApiUrl,
			envApiKey: envConfig.eVaultV3ApiKey,
			configApiKey: config?.eVaultV3ApiKey,
			envExtra: { ...maybeField("batchSize", envConfig.eVaultV3BatchSize) },
			configExtra: { ...maybeField("batchSize", config?.eVaultV3BatchSize) },
		});
		const canBuildEVaultV3 = !!eVaultV3Config.endpoint;
		const canBuildEVaultOnchain = true; // onchain only needs provider + deployment, always available

		const buildEVaultV3 = () =>
			new EVaultV3Adapter(
				eVaultV3Config,
				providerService as ProviderService,
				resolvedBuildQuery,
			);
		const buildEVaultOnchain = () => {
			eVaultAdapter = new EVaultOnchainAdapter(
				providerService as ProviderService,
				deploymentService as DeploymentService,
				resolvedBuildQuery,
			);
			return eVaultAdapter;
		};

		let selectedEVaultAdapter: IEVaultAdapter;
		if (effectiveEVaultServiceAdapter === "v3") {
			if (!canBuildEVaultV3)
				throw new Error(
					"[buildEulerSDK] eVaultServiceAdapter='v3' but no V3 endpoint is configured.",
				);
			selectedEVaultAdapter = buildEVaultV3();
		} else if (effectiveEVaultServiceAdapter === "onchain") {
			selectedEVaultAdapter = buildEVaultOnchain();
		} else if (canBuildEVaultV3 && canBuildEVaultOnchain) {
			selectedEVaultAdapter = createFallbackAdapter<
				IEVaultAdapter,
				"fetchVaults" | "fetchAllVaults" | "fetchVerifiedVaultsAddresses"
			>(buildEVaultV3(), buildEVaultOnchain(), {
				methods: [
					"fetchVaults",
					"fetchAllVaults",
					"fetchVerifiedVaultsAddresses",
				],
				adapterNames: { primary: "eVaultV3", secondary: "eVaultOnchain" },
				onFallback,
			});
		} else if (canBuildEVaultV3) {
			console.warn(
				"[buildEulerSDK] eVaultService fallback disabled: onchain adapter unavailable. Using V3 only.",
			);
			selectedEVaultAdapter = buildEVaultV3();
		} else {
			console.warn(
				"[buildEulerSDK] eVaultService fallback disabled: V3 endpoint not configured. Using onchain only.",
			);
			selectedEVaultAdapter = buildEVaultOnchain();
		}

		eVaultService = new EVaultService(
			selectedEVaultAdapter,
			deploymentService as DeploymentService,
		);
	}

	// Build eulerEarn service if not overridden
	let eulerEarnService: IEulerEarnService;
	if (servicesOverrides?.eulerEarnService) {
		eulerEarnService = servicesOverrides.eulerEarnService;
	} else {
		const resolvedEulerEarnServiceConfig = eulerEarnServiceConfig ?? {};
		const resolvedEulerEarnServiceAdapter =
			pickConfigValue(
				config?.eulerEarnServiceAdapter,
				resolvedEulerEarnServiceConfig.adapter,
				envConfig.eulerEarnServiceAdapter,
			) ?? "fallback";
		const effectiveEulerEarnServiceAdapter = (() => {
			if (!disableV3) return resolvedEulerEarnServiceAdapter;
			if (resolvedEulerEarnServiceAdapter === "v3") {
				console.warn(
					"[buildEulerSDK] disableV3 is set but eulerEarnServiceAdapter='v3'; forcing 'onchain'.",
				);
				return "onchain" as const;
			}
			if (resolvedEulerEarnServiceAdapter === "fallback")
				return "onchain" as const;
			return resolvedEulerEarnServiceAdapter;
		})();

		const eulerEarnV3Config = resolveV3AdapterConfig(
			defaultEulerEarnV3AdapterConfig,
			{
				explicitConfig: resolvedEulerEarnServiceConfig.v3AdapterConfig,
				explicitV3ApiKey: v3ApiKey,
				envConfig,
				config,
				envEndpoint: envConfig.eulerEarnV3ApiUrl,
				configEndpoint: config?.eulerEarnV3ApiUrl,
				envApiKey: envConfig.eulerEarnV3ApiKey,
				configApiKey: config?.eulerEarnV3ApiKey,
			},
		);
		const canBuildEulerEarnV3 = !!eulerEarnV3Config.endpoint;
		const buildEulerEarnV3 = () =>
			new EulerEarnV3Adapter(eulerEarnV3Config, resolvedBuildQuery);
		const buildEulerEarnOnchain = () =>
			new EulerEarnOnchainAdapter(
				providerService as ProviderService,
				deploymentService as DeploymentService,
				resolvedBuildQuery,
			);

		let eulerEarnAdapter: IEulerEarnAdapter;
		if (effectiveEulerEarnServiceAdapter === "v3") {
			if (!canBuildEulerEarnV3)
				throw new Error(
					"[buildEulerSDK] eulerEarnServiceAdapter='v3' but no V3 endpoint is configured.",
				);
			eulerEarnAdapter = buildEulerEarnV3();
		} else if (effectiveEulerEarnServiceAdapter === "onchain") {
			eulerEarnAdapter = buildEulerEarnOnchain();
		} else if (canBuildEulerEarnV3) {
			eulerEarnAdapter = createFallbackAdapter<
				IEulerEarnAdapter,
				"fetchVaults" | "fetchAllVaults" | "fetchVerifiedVaultsAddresses"
			>(buildEulerEarnV3(), buildEulerEarnOnchain(), {
				methods: [
					"fetchVaults",
					"fetchAllVaults",
					"fetchVerifiedVaultsAddresses",
				],
				adapterNames: {
					primary: "eulerEarnV3",
					secondary: "eulerEarnOnchain",
				},
				onFallback,
			});
		} else {
			console.warn(
				"[buildEulerSDK] eulerEarnService fallback disabled: V3 endpoint not configured. Using onchain only.",
			);
			eulerEarnAdapter = buildEulerEarnOnchain();
		}

		eulerEarnService = new EulerEarnService(
			eulerEarnAdapter,
			deploymentService as DeploymentService,
			eVaultService,
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
			resolvedBuildQuery,
		);
		securitizeVaultService = new SecuritizeVaultService(securitizeVaultAdapter);
	}

	// Build vault meta service (vault type subgraph + eVault + eulerEarn + additionalVaultServices); type reflects extended entity when additionalVaultServices is used with buildEulerSDK<TExtendedEntity>
	let vaultMetaService: IVaultMetaService<TVaultEntity>;
	if (servicesOverrides?.vaultMetaService) {
		vaultMetaService = servicesOverrides.vaultMetaService;
	} else {
		const explicitVaultTypeAdapterKind: VaultTypeAdapterKind | undefined =
			vaultTypeAdapterConfig
				? "subgraphURLs" in vaultTypeAdapterConfig
					? "subgraph"
					: "v3"
				: undefined;
		const resolvedVaultTypeAdapterKind = pickConfigValue(
			config?.vaultTypeAdapter,
			explicitVaultTypeAdapterKind,
			envConfig.vaultTypeAdapter,
			"fallback",
		);
		const effectiveVaultTypeAdapterKind = (() => {
			if (!disableV3) return resolvedVaultTypeAdapterKind;
			if (resolvedVaultTypeAdapterKind === "v3") {
				console.warn(
					"[buildEulerSDK] disableV3 is set but vaultTypeAdapter='v3'; forcing 'subgraph'.",
				);
				return "subgraph" as const;
			}
			if (resolvedVaultTypeAdapterKind === "fallback")
				return "subgraph" as const;
			return resolvedVaultTypeAdapterKind;
		})();

		const vaultTypeSubgraphUrls = mergeNumberRecords(
			defaultAccountVaultsAdapterConfig.subgraphURLs,
			envConfig.vaultTypeSubgraphUrls,
			vaultTypeAdapterConfig && "subgraphURLs" in vaultTypeAdapterConfig
				? vaultTypeAdapterConfig.subgraphURLs
				: undefined,
			config?.vaultTypeSubgraphUrls,
		);
		const vaultTypeV3Config = resolveV3AdapterConfig(
			defaultVaultTypeAdapterConfig,
			{
				explicitConfig:
					vaultTypeAdapterConfig &&
					!("subgraphURLs" in vaultTypeAdapterConfig)
						? {
								...vaultTypeAdapterConfig,
								...maybeField(
									"typeMap",
									mergeStringRecords(
										envConfig.vaultTypeV3TypeMap,
										vaultTypeAdapterConfig.typeMap,
										config?.vaultTypeV3TypeMap,
									),
								),
							}
						: {
								...maybeField(
									"typeMap",
									mergeStringRecords(
										envConfig.vaultTypeV3TypeMap,
										undefined,
										config?.vaultTypeV3TypeMap,
									),
								),
							},
				explicitV3ApiKey: v3ApiKey,
				envConfig,
				config,
				envEndpoint: envConfig.vaultTypeV3ApiUrl,
				configEndpoint: config?.vaultTypeV3ApiUrl,
				envApiKey: envConfig.vaultTypeV3ApiKey,
				configApiKey: config?.vaultTypeV3ApiKey,
			},
		);
		const canBuildVaultTypeV3 = !!vaultTypeV3Config.endpoint;
		const canBuildVaultTypeSubgraph =
			Object.keys(vaultTypeSubgraphUrls).length > 0;
		const buildVaultTypeV3 = () =>
			new VaultTypeV3Adapter(vaultTypeV3Config, resolvedBuildQuery);
		const buildVaultTypeSubgraph = () =>
			new VaultTypeSubgraphAdapter(
				{ subgraphURLs: vaultTypeSubgraphUrls },
				resolvedBuildQuery,
			);

		let vaultTypeAdapter: IVaultTypeAdapter;
		if (effectiveVaultTypeAdapterKind === "v3") {
			if (!canBuildVaultTypeV3)
				throw new Error(
					"[buildEulerSDK] vaultTypeAdapter='v3' but no V3 endpoint is configured.",
				);
			vaultTypeAdapter = buildVaultTypeV3();
		} else if (effectiveVaultTypeAdapterKind === "subgraph") {
			if (!canBuildVaultTypeSubgraph)
				throw new Error(
					"[buildEulerSDK] vaultTypeAdapter='subgraph' but no subgraph URLs are configured.",
				);
			vaultTypeAdapter = buildVaultTypeSubgraph();
		} else if (canBuildVaultTypeV3 && canBuildVaultTypeSubgraph) {
			vaultTypeAdapter = createFallbackAdapter<
				IVaultTypeAdapter,
				"fetchVaultType" | "fetchVaultFactories" | "fetchVaultTypes"
			>(buildVaultTypeV3(), buildVaultTypeSubgraph(), {
				methods: ["fetchVaultType", "fetchVaultFactories", "fetchVaultTypes"],
				adapterNames: {
					primary: "vaultTypeV3",
					secondary: "vaultTypeSubgraph",
				},
				onFallback,
			});
		} else if (canBuildVaultTypeV3) {
			console.warn(
				"[buildEulerSDK] vaultTypeAdapter fallback disabled: subgraph URLs not configured. Using V3 only.",
			);
			vaultTypeAdapter = buildVaultTypeV3();
		} else if (canBuildVaultTypeSubgraph) {
			console.warn(
				"[buildEulerSDK] vaultTypeAdapter fallback disabled: V3 endpoint not configured. Using subgraph only.",
			);
			vaultTypeAdapter = buildVaultTypeSubgraph();
		} else {
			throw new Error(
				"[buildEulerSDK] cannot build vault type adapter: neither V3 endpoint nor subgraph URLs are configured.",
			);
		}
		const allVaultServices: VaultServiceEntry<TVaultEntity>[] = [
			{
				type: VaultType.EVault,
				service:
					eVaultService as unknown as RegisteredVaultService<TVaultEntity>,
			},
			{
				type: VaultType.EulerEarn,
				service:
					eulerEarnService as unknown as RegisteredVaultService<TVaultEntity>,
			},
			{
				type: VaultType.SecuritizeCollateral,
				service:
					securitizeVaultService as unknown as RegisteredVaultService<TVaultEntity>,
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
	if (eulerEarnService instanceof EulerEarnService) {
		eulerEarnService.setVaultMetaService(
			vaultMetaService as unknown as IVaultMetaService<VaultEntity>,
		);
	}

	// Wire plugins into onchain adapters for read-path enrichment
	if (plugins?.length) {
		const pluginBatchSimDs = new BatchSimulationAdapter(resolvedBuildQuery);
		if (eVaultAdapter) {
			eVaultAdapter.setPlugins(plugins);
			eVaultAdapter.setBatchSimulationAdapter(pluginBatchSimDs);
		}
		if (accountOnchainAdapter) {
			accountOnchainAdapter.setPlugins(plugins);
			accountOnchainAdapter.setBatchSimulationAdapter(pluginBatchSimDs);
		}
	}

	// Build account service if not overridden (requires vaultMetaService for fetchAccountWithVaults / fetchVaults)
	let accountService: IAccountService<TVaultEntity>;
	if (servicesOverrides?.accountService) {
		accountService = servicesOverrides.accountService;
	} else {
		accountService = new AccountService<TVaultEntity>(
			accountAdapter,
			vaultMetaService,
		);
	}

	const portfolioService =
		servicesOverrides?.portfolioService ??
		new PortfolioService<TVaultEntity>(accountService);

	// Build eulerLabels service if not overridden
	const eulerLabelsConfig = {
		...defaultEulerLabelsURLAdapterConfig,
		...makeEulerLabelsConfig(envConfig),
		...(eulerLabelsAdapterConfig ?? {}),
		...makeEulerLabelsConfig(config),
	};
	const eulerLabelsService =
		servicesOverrides?.eulerLabelsService ??
		(() => {
			const eulerLabelsAdapter = new EulerLabelsURLAdapter(
				eulerLabelsConfig,
				resolvedBuildQuery,
			);
			return new EulerLabelsService(
				eulerLabelsAdapter,
				eulerLabelsConfig.getEulerLabelsLogoUrl,
			);
		})();

	// Build tokenlist service if not overridden
	const tokenlistService =
		servicesOverrides?.tokenlistService ??
		new TokenlistService(
			{
				...defaultTokenlistServiceConfig,
				...makeTokenlistConfig(envConfig),
				...(tokenlistServiceConfig ?? {}),
				...makeTokenlistConfig(config),
			},
			resolvedBuildQuery,
		);

	// Build swap service if not overridden
	const swapService =
		servicesOverrides?.swapService ??
		new SwapService(
			{
				...defaultSwapServiceConfig,
				...maybeField("swapApiUrl", envConfig.swapApiUrl),
				...maybeField("defaultDeadline", envConfig.swapDefaultDeadline),
				...(swapServiceConfig ?? {}),
				...maybeField("swapApiUrl", config?.swapApiUrl),
				...maybeField("defaultDeadline", config?.swapDefaultDeadline),
			},
			deploymentService,
			resolvedBuildQuery,
		);

	// Build execution service if not overridden
	const executionService =
		servicesOverrides?.executionService ??
		(() => {
			const svc = new ExecutionService<TVaultEntity>(
				deploymentService,
				walletService as WalletService,
				providerService as ProviderService,
				vaultMetaService as IVaultMetaService<TVaultEntity>,
			);
			if (plugins?.length) svc.setPlugins(plugins);
			return svc;
		})();

	// Build price service if not overridden
	const priceService =
		servicesOverrides?.priceService ??
		(() => {
			const resolvedPricingServiceConfig = resolveV3AdapterConfig(
				defaultPricingServiceConfig,
				{
					explicitConfig: pricingServiceConfig,
					explicitV3ApiKey: v3ApiKey,
					envConfig,
					config,
					envEndpoint: envConfig.pricingApiUrl,
					configEndpoint: config?.pricingApiUrl,
					envApiKey: envConfig.pricingApiKey,
					configApiKey: config?.pricingApiKey,
				},
			);
			const backendClient = new PricingBackendClient(
				resolvedPricingServiceConfig,
				resolvedBuildQuery,
			);
			return new PriceService(
				providerService as ProviderService,
				deploymentService as DeploymentService,
				backendClient,
				resolvedBuildQuery,
			);
		})();

	// Build rewards service if not overridden
	const rewardsService =
		servicesOverrides?.rewardsService ??
		(() => {
			const resolvedRewardsServiceAdapter =
				pickConfigValue(
					config?.rewardsServiceAdapter,
					rewardsServiceConfig?.adapter,
					envConfig.rewardsServiceAdapter,
				) ?? "fallback";
			const effectiveRewardsServiceAdapter = (() => {
				if (!disableV3) return resolvedRewardsServiceAdapter;
				if (resolvedRewardsServiceAdapter === "v3") {
					console.warn(
						"[buildEulerSDK] disableV3 is set but rewardsServiceAdapter='v3'; forcing 'direct'.",
					);
					return "direct" as const;
				}
				if (resolvedRewardsServiceAdapter === "fallback")
					return "direct" as const;
				return resolvedRewardsServiceAdapter;
			})();

			const directAdapterConfig = resolveRewardsDirectAdapterConfig(
				rewardsServiceConfig,
				envConfig,
				config,
			);
			// directAdapter is always constructed because RewardsService also reads
			// merkl/fuul addresses from it, regardless of which adapter serves data.
			const directAdapter = new RewardsDirectAdapter(
				directAdapterConfig,
				resolvedBuildQuery,
			);
			const rewardsV3Config = resolveV3AdapterConfig(
				defaultRewardsV3AdapterConfig,
				{
					explicitConfig: rewardsServiceConfig?.v3AdapterConfig,
					explicitV3ApiKey: v3ApiKey,
					envConfig,
					config,
					envEndpoint: envConfig.rewardsV3ApiUrl,
					configEndpoint: config?.rewardsV3ApiUrl,
					envApiKey: envConfig.rewardsV3ApiKey,
					configApiKey: config?.rewardsV3ApiKey,
				},
			);
			const canBuildRewardsV3 = !!rewardsV3Config.endpoint;
			const buildRewardsV3 = () =>
				new RewardsV3Adapter(rewardsV3Config, resolvedBuildQuery, directAdapter);

			let rewardsAdapter: IRewardsAdapter;
			if (effectiveRewardsServiceAdapter === "direct") {
				rewardsAdapter = directAdapter;
			} else if (effectiveRewardsServiceAdapter === "v3") {
				if (!canBuildRewardsV3)
					throw new Error(
						"[buildEulerSDK] rewardsServiceAdapter='v3' but no V3 endpoint is configured.",
					);
				rewardsAdapter = buildRewardsV3();
			} else if (canBuildRewardsV3) {
				rewardsAdapter = createFallbackAdapter<
					IRewardsAdapter,
					| "fetchVaultRewards"
					| "fetchChainRewards"
					| "fetchUserRewards"
					| "fetchFuulTotals"
					| "fetchFuulClaimChecks"
				>(buildRewardsV3(), directAdapter, {
					methods: [
						"fetchVaultRewards",
						"fetchChainRewards",
						"fetchUserRewards",
						"fetchFuulTotals",
						"fetchFuulClaimChecks",
					],
					adapterNames: {
						primary: "rewardsV3",
						secondary: "rewardsDirect",
					},
					onFallback,
				});
			} else {
				console.warn(
					"[buildEulerSDK] rewardsService fallback disabled: V3 endpoint not configured. Using direct only.",
				);
				rewardsAdapter = directAdapter;
			}

			return new RewardsService(
				rewardsAdapter,
				{
					merklDistributorAddress: directAdapter.getMerklDistributorAddress(),
					fuulManagerAddress: directAdapter.getFuulManagerAddress(),
					fuulFactoryAddress: directAdapter.getFuulFactoryAddress(),
				},
				{ isActiveForViewer: rewardsServiceConfig?.isActiveForViewer },
			);
		})();

	// Build intrinsic APY service if not overridden
	const intrinsicApyService =
		servicesOverrides?.intrinsicApyService ??
		(() => {
			const resolvedIntrinsicApyServiceConfig = intrinsicApyServiceConfig ?? {};
			const intrinsicApyAdapter = new IntrinsicApyV3Adapter(
				resolveV3AdapterConfig(defaultIntrinsicApyV3AdapterConfig, {
					explicitConfig: resolvedIntrinsicApyServiceConfig.v3AdapterConfig,
					explicitV3ApiKey: v3ApiKey,
					envConfig,
					config,
					envEndpoint: envConfig.intrinsicApyV3ApiUrl,
					configEndpoint: config?.intrinsicApyV3ApiUrl,
					envApiKey: envConfig.intrinsicApyV3ApiKey,
					configApiKey: config?.intrinsicApyV3ApiKey,
					envExtra: {
						...maybeField("pageSize", envConfig.intrinsicApyV3PageSize),
						...maybeField(
							"maxAssetsPerRequest",
							envConfig.intrinsicApyV3MaxAssetsPerRequest,
						),
					},
					configExtra: {
						...maybeField("pageSize", config?.intrinsicApyV3PageSize),
						...maybeField(
							"maxAssetsPerRequest",
							config?.intrinsicApyV3MaxAssetsPerRequest,
						),
					},
				}),
				resolvedBuildQuery,
			);

			return new IntrinsicApyService(intrinsicApyAdapter);
		})();
	const oracleAdapterService =
		servicesOverrides?.oracleAdapterService ??
		new OracleAdapterService(
			{
				...maybeField("baseUrl", envConfig.oracleAdaptersBaseUrl),
				...maybeField("cacheMs", envConfig.oracleAdaptersCacheMs),
				...(oracleAdapterServiceConfig ?? {}),
				...maybeField("baseUrl", config?.oracleAdaptersBaseUrl),
				...maybeField("cacheMs", config?.oracleAdaptersCacheMs),
			},
			resolvedBuildQuery,
		);
	const feeFlowService =
		servicesOverrides?.feeFlowService ??
		new FeeFlowService(
			{
				...maybeField(
					"feeFlowControllerAddress",
					envConfig.feeFlowControllerAddress,
				),
				...maybeField(
					"feeFlowControllerUtilAddress",
					envConfig.feeFlowControllerUtilAddress,
				),
				...maybeField(
					"defaultBuyDeadlineSeconds",
					envConfig.feeFlowDefaultBuyDeadlineSeconds,
				),
				...(feeFlowServiceConfig ?? {}),
				...maybeField(
					"feeFlowControllerAddress",
					config?.feeFlowControllerAddress,
				),
				...maybeField(
					"feeFlowControllerUtilAddress",
					config?.feeFlowControllerUtilAddress,
				),
				...maybeField(
					"defaultBuyDeadlineSeconds",
					config?.feeFlowDefaultBuyDeadlineSeconds,
				),
			},
			resolvedBuildQuery,
		);
	const reulLockService =
		servicesOverrides?.reulLockService ??
		new REULLockService(providerService, deploymentService);
	const positionMigrationService =
		servicesOverrides?.positionMigrationService ??
		(() => {
			const connectors = [
				...(positionMigrationServiceConfig?.includeDefaultConnectors === false
					? []
					: [
							new MorphoPositionMigrationConnector(
								deploymentService,
								providerService,
								executionService,
								positionMigrationConnectorConfig?.morpho,
							),
							new AavePositionMigrationConnector(
								deploymentService,
								providerService,
								executionService,
								positionMigrationConnectorConfig?.aave,
							),
						]),
				...(positionMigrationServiceConfig?.connectors ?? []),
			];

			return new PositionMigrationService(
				providerService,
				executionService,
				{
					...positionMigrationServiceConfig,
					connectors,
				},
				resolvedBuildQuery,
			);
		})();

	if (executionService instanceof ExecutionService) {
		executionService.setProviderService(providerService as ProviderService);
		executionService.setVaultMetaService(
			vaultMetaService as IVaultMetaService<TVaultEntity>,
		);
		executionService.setWalletService(walletService as WalletService);
		executionService.setPriceService(priceService);
		executionService.setRewardsService(rewardsService);
		executionService.setIntrinsicApyService(intrinsicApyService);
		executionService.setEulerLabelsService(eulerLabelsService);
	}

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

	const sdk = new EulerSDK<TVaultEntity>({
		accountService,
		portfolioService,
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
		intrinsicApyService,
		oracleAdapterService,
		feeFlowService,
		reulLockService,
		positionMigrationService,
		plugins,
	});

	if (executionService instanceof ExecutionService) {
		executionService.setPluginProcessor((plan, account, chainId, prefetch) =>
			sdk.processPlugins(plan, account, chainId, prefetch),
		);
		executionService.setPluginPrefetcher((plan, account, chainId) =>
			sdk.prefetchPluginData(plan, account, chainId),
		);
	}

	return sdk;
}
