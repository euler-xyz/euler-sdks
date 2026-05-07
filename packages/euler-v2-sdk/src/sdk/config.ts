import type { Address } from "viem";
import type { AccountServiceAdapter } from "../services/accountService/accountServiceConfig.js";
import type { EVaultServiceAdapter } from "../services/vaults/eVaultService/eVaultServiceConfig.js";
import type { EulerEarnServiceAdapter } from "../services/vaults/eulerEarnService/eulerEarnServiceConfig.js";

export type VaultTypeAdapterKind = "v3" | "subgraph";
export type RewardsServiceAdapterKind = "v3" | "direct";

export interface EulerSDKConfig {
	rpcUrls?: Record<number, string>;
	v3ApiUrl?: string;
	v3ApiKey?: string;

	accountServiceAdapter?: AccountServiceAdapter;
	accountV3ApiUrl?: string;
	accountV3ApiKey?: string;
	accountV3ForceFresh?: boolean;
	accountVaultsSubgraphUrls?: Record<number, string>;

	eVaultServiceAdapter?: EVaultServiceAdapter;
	eVaultV3ApiUrl?: string;
	eVaultV3ApiKey?: string;
	eVaultV3BatchSize?: number;

	eulerEarnServiceAdapter?: EulerEarnServiceAdapter;
	eulerEarnV3ApiUrl?: string;
	eulerEarnV3ApiKey?: string;

	vaultTypeAdapter?: VaultTypeAdapterKind;
	vaultTypeV3ApiUrl?: string;
	vaultTypeV3ApiKey?: string;
	vaultTypeV3TypeMap?: Record<string, string>;
	vaultTypeSubgraphUrls?: Record<number, string>;

	intrinsicApyV3ApiUrl?: string;
	intrinsicApyV3ApiKey?: string;
	intrinsicApyV3PageSize?: number;
	intrinsicApyV3MaxAssetsPerRequest?: number;

	rewardsServiceAdapter?: RewardsServiceAdapterKind;
	rewardsV3ApiUrl?: string;
	rewardsV3ApiKey?: string;
	rewardsMerklApiUrl?: string;
	rewardsBrevisApiUrl?: string;
	rewardsBrevisProofsApiUrl?: string;
	rewardsFuulApiUrl?: string;
	rewardsFuulTotalsUrl?: string;
	rewardsFuulClaimChecksUrl?: string;
	rewardsBrevisChainIds?: number[];
	rewardsMerklDistributorAddress?: Address;
	rewardsFuulManagerAddress?: Address;
	rewardsFuulFactoryAddress?: Address;
	rewardsEnableMerkl?: boolean;
	rewardsEnableBrevis?: boolean;
	rewardsEnableFuul?: boolean;

	pricingApiUrl?: string;
	pricingApiKey?: string;

	swapApiUrl?: string;
	swapDefaultDeadline?: number;

	deploymentsUrl?: string;

	eulerLabelsBaseUrl?: string;
	eulerLabelsEntitiesUrlTemplate?: string;
	eulerLabelsProductsUrlTemplate?: string;
	eulerLabelsPointsUrlTemplate?: string;
	eulerLabelsEarnVaultsUrlTemplate?: string;
	eulerLabelsAssetsUrlTemplate?: string;
	eulerLabelsGlobalAssetsUrl?: string;
	eulerLabelsLogoUrlTemplate?: string;

	tokenlistApiBaseUrl?: string;
	tokenlistUrlTemplate?: string;

	oracleAdaptersBaseUrl?: string;
	oracleAdaptersCacheMs?: number;

	feeFlowControllerAddress?: Address;
	feeFlowControllerUtilAddress?: Address;
	feeFlowDefaultBuyDeadlineSeconds?: number;

	queryCacheEnabled?: boolean;
	queryCacheTtlMs?: number;
}

type EnvRecord = Record<string, string | undefined>;

function getRuntimeEnv(): EnvRecord {
	const importMetaEnv =
		(import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};
	const processEnv =
		typeof process === "undefined"
			? {}
			: ((process.env ?? {}) as Record<string, unknown>);

	return normalizeEnvRecord({
		...importMetaEnv,
		...processEnv,
	});
}

function normalizeEnvRecord(env: Record<string, unknown>): EnvRecord {
	return Object.fromEntries(
		Object.entries(env)
			.filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			)
			.map(([key, value]) => [key, value]),
	);
}

function normalizeSdkEnvName(key: string): string {
	return key.startsWith("VITE_EULER_SDK_") ? key.slice("VITE_".length) : key;
}

function readString(env: EnvRecord, name: string): string | undefined {
	const direct = env[name]?.trim();
	if (direct) return direct;

	const vite = env[`VITE_${name}`]?.trim();
	return vite || undefined;
}

function readNumber(env: EnvRecord, name: string): number | undefined {
	const value = readString(env, name);
	if (value === undefined) return undefined;

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`${name} must be a finite number`);
	}

	return parsed;
}

function readBoolean(env: EnvRecord, name: string): boolean | undefined {
	const value = readString(env, name)?.toLowerCase();
	if (value === undefined) return undefined;
	if (["1", "true", "yes", "on"].includes(value)) return true;
	if (["0", "false", "no", "off"].includes(value)) return false;
	throw new Error(`${name} must be a boolean`);
}

function readEnum<T extends string>(
	env: EnvRecord,
	name: string,
	allowed: readonly T[],
): T | undefined {
	const value = readString(env, name);
	if (value === undefined) return undefined;
	if ((allowed as readonly string[]).includes(value)) return value as T;
	throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
}

function readNumberList(env: EnvRecord, name: string): number[] | undefined {
	const value = readString(env, name);
	if (value === undefined) return undefined;
	if (!value) return [];

	return value.split(",").map((part) => {
		const parsed = Number(part.trim());
		if (!Number.isFinite(parsed)) {
			throw new Error(`${name} must be a comma-separated list of numbers`);
		}
		return parsed;
	});
}

function readStringMap(
	env: EnvRecord,
	name: string,
): Record<string, string> | undefined {
	const value = readString(env, name);
	if (value === undefined) return undefined;

	const parsed = JSON.parse(value) as unknown;
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		Array.isArray(parsed) ||
		!Object.values(parsed).every((entry) => typeof entry === "string")
	) {
		throw new Error(`${name} must be a JSON object with string values`);
	}

	return parsed as Record<string, string>;
}

function readNumberKeyedUrls(
	env: EnvRecord,
	prefix: string,
): Record<number, string> | undefined {
	const urls: Record<number, string> = {};
	const keys = Object.keys(env);

	for (const rawKey of keys.filter((key) => key.startsWith("VITE_"))) {
		readNumberKeyedUrl(env, rawKey, prefix, urls);
	}

	for (const rawKey of keys.filter((key) => !key.startsWith("VITE_"))) {
		readNumberKeyedUrl(env, rawKey, prefix, urls);
	}

	return Object.keys(urls).length > 0 ? urls : undefined;
}

function readNumberKeyedUrl(
	env: EnvRecord,
	rawKey: string,
	prefix: string,
	target: Record<number, string>,
): void {
	const key = normalizeSdkEnvName(rawKey);
	if (!key.startsWith(prefix)) return;

	const chainId = Number(key.slice(prefix.length));
	const value = env[rawKey]?.trim();
	if (!Number.isInteger(chainId) || chainId <= 0 || !value) return;

	target[chainId] = value;
}

export function readEulerSDKEnvConfig(
	env: EnvRecord = getRuntimeEnv(),
): EulerSDKConfig {
	return removeUndefined({
		rpcUrls: readNumberKeyedUrls(env, "EULER_SDK_RPC_URL_"),
		v3ApiUrl: readString(env, "EULER_SDK_V3_API_URL"),
		v3ApiKey: readString(env, "EULER_SDK_V3_API_KEY"),

		accountServiceAdapter: readEnum(env, "EULER_SDK_ACCOUNT_SERVICE_ADAPTER", [
			"v3",
			"onchain",
		] as const),
		accountV3ApiUrl: readString(env, "EULER_SDK_ACCOUNT_V3_API_URL"),
		accountV3ApiKey: readString(env, "EULER_SDK_ACCOUNT_V3_API_KEY"),
		accountV3ForceFresh: readBoolean(env, "EULER_SDK_ACCOUNT_V3_FORCE_FRESH"),
		accountVaultsSubgraphUrls: readNumberKeyedUrls(
			env,
			"EULER_SDK_ACCOUNT_VAULTS_SUBGRAPH_URL_",
		),

		eVaultServiceAdapter: readEnum(env, "EULER_SDK_EVAULT_SERVICE_ADAPTER", [
			"v3",
			"onchain",
		] as const),
		eVaultV3ApiUrl: readString(env, "EULER_SDK_EVAULT_V3_API_URL"),
		eVaultV3ApiKey: readString(env, "EULER_SDK_EVAULT_V3_API_KEY"),
		eVaultV3BatchSize: readNumber(env, "EULER_SDK_EVAULT_V3_BATCH_SIZE"),

		eulerEarnServiceAdapter: readEnum(
			env,
			"EULER_SDK_EULER_EARN_SERVICE_ADAPTER",
			["v3", "onchain"] as const,
		),
		eulerEarnV3ApiUrl: readString(env, "EULER_SDK_EULER_EARN_V3_API_URL"),
		eulerEarnV3ApiKey: readString(env, "EULER_SDK_EULER_EARN_V3_API_KEY"),

		vaultTypeAdapter: readEnum(env, "EULER_SDK_VAULT_TYPE_ADAPTER", [
			"v3",
			"subgraph",
		] as const),
		vaultTypeV3ApiUrl: readString(env, "EULER_SDK_VAULT_TYPE_V3_API_URL"),
		vaultTypeV3ApiKey: readString(env, "EULER_SDK_VAULT_TYPE_V3_API_KEY"),
		vaultTypeV3TypeMap: readStringMap(
			env,
			"EULER_SDK_VAULT_TYPE_V3_TYPE_MAP_JSON",
		),
		vaultTypeSubgraphUrls: readNumberKeyedUrls(
			env,
			"EULER_SDK_VAULT_TYPE_SUBGRAPH_URL_",
		),

		intrinsicApyV3ApiUrl: readString(env, "EULER_SDK_INTRINSIC_APY_V3_API_URL"),
		intrinsicApyV3ApiKey: readString(env, "EULER_SDK_INTRINSIC_APY_V3_API_KEY"),
		intrinsicApyV3PageSize: readNumber(
			env,
			"EULER_SDK_INTRINSIC_APY_V3_PAGE_SIZE",
		),
		intrinsicApyV3MaxAssetsPerRequest: readNumber(
			env,
			"EULER_SDK_INTRINSIC_APY_V3_MAX_ASSETS_PER_REQUEST",
		),

		rewardsServiceAdapter: readEnum(env, "EULER_SDK_REWARDS_SERVICE_ADAPTER", [
			"v3",
			"direct",
		] as const),
		rewardsV3ApiUrl: readString(env, "EULER_SDK_REWARDS_V3_API_URL"),
		rewardsV3ApiKey: readString(env, "EULER_SDK_REWARDS_V3_API_KEY"),
		rewardsMerklApiUrl: readString(env, "EULER_SDK_REWARDS_MERKL_API_URL"),
		rewardsBrevisApiUrl: readString(env, "EULER_SDK_REWARDS_BREVIS_API_URL"),
		rewardsBrevisProofsApiUrl: readString(
			env,
			"EULER_SDK_REWARDS_BREVIS_PROOFS_API_URL",
		),
		rewardsFuulApiUrl: readString(env, "EULER_SDK_REWARDS_FUUL_API_URL"),
		rewardsFuulTotalsUrl: readString(env, "EULER_SDK_REWARDS_FUUL_TOTALS_URL"),
		rewardsFuulClaimChecksUrl: readString(
			env,
			"EULER_SDK_REWARDS_FUUL_CLAIM_CHECKS_URL",
		),
		rewardsBrevisChainIds: readNumberList(
			env,
			"EULER_SDK_REWARDS_BREVIS_CHAIN_IDS",
		),
		rewardsMerklDistributorAddress: readString(
			env,
			"EULER_SDK_REWARDS_MERKL_DISTRIBUTOR_ADDRESS",
		) as Address | undefined,
		rewardsFuulManagerAddress: readString(
			env,
			"EULER_SDK_REWARDS_FUUL_MANAGER_ADDRESS",
		) as Address | undefined,
		rewardsFuulFactoryAddress: readString(
			env,
			"EULER_SDK_REWARDS_FUUL_FACTORY_ADDRESS",
		) as Address | undefined,
		rewardsEnableMerkl: readBoolean(env, "EULER_SDK_REWARDS_ENABLE_MERKL"),
		rewardsEnableBrevis: readBoolean(env, "EULER_SDK_REWARDS_ENABLE_BREVIS"),
		rewardsEnableFuul: readBoolean(env, "EULER_SDK_REWARDS_ENABLE_FUUL"),

		pricingApiUrl: readString(env, "EULER_SDK_PRICING_API_URL"),
		pricingApiKey: readString(env, "EULER_SDK_PRICING_API_KEY"),

		swapApiUrl: readString(env, "EULER_SDK_SWAP_API_URL"),
		swapDefaultDeadline: readNumber(env, "EULER_SDK_SWAP_DEFAULT_DEADLINE"),

		deploymentsUrl: readString(env, "EULER_SDK_DEPLOYMENTS_URL"),

		eulerLabelsBaseUrl: readString(env, "EULER_SDK_EULER_LABELS_BASE_URL"),
		eulerLabelsEntitiesUrlTemplate: readString(
			env,
			"EULER_SDK_EULER_LABELS_ENTITIES_URL_TEMPLATE",
		),
		eulerLabelsProductsUrlTemplate: readString(
			env,
			"EULER_SDK_EULER_LABELS_PRODUCTS_URL_TEMPLATE",
		),
		eulerLabelsPointsUrlTemplate: readString(
			env,
			"EULER_SDK_EULER_LABELS_POINTS_URL_TEMPLATE",
		),
		eulerLabelsEarnVaultsUrlTemplate: readString(
			env,
			"EULER_SDK_EULER_LABELS_EARN_VAULTS_URL_TEMPLATE",
		),
		eulerLabelsAssetsUrlTemplate: readString(
			env,
			"EULER_SDK_EULER_LABELS_ASSETS_URL_TEMPLATE",
		),
		eulerLabelsGlobalAssetsUrl: readString(
			env,
			"EULER_SDK_EULER_LABELS_GLOBAL_ASSETS_URL",
		),
		eulerLabelsLogoUrlTemplate: readString(
			env,
			"EULER_SDK_EULER_LABELS_LOGO_URL_TEMPLATE",
		),

		tokenlistApiBaseUrl: readString(env, "EULER_SDK_TOKENLIST_API_BASE_URL"),
		tokenlistUrlTemplate: readString(env, "EULER_SDK_TOKENLIST_URL_TEMPLATE"),

		oracleAdaptersBaseUrl: readString(
			env,
			"EULER_SDK_ORACLE_ADAPTERS_BASE_URL",
		),
		oracleAdaptersCacheMs: readNumber(
			env,
			"EULER_SDK_ORACLE_ADAPTERS_CACHE_MS",
		),

		feeFlowControllerAddress: readString(
			env,
			"EULER_SDK_FEE_FLOW_CONTROLLER_ADDRESS",
		) as Address | undefined,
		feeFlowControllerUtilAddress: readString(
			env,
			"EULER_SDK_FEE_FLOW_CONTROLLER_UTIL_ADDRESS",
		) as Address | undefined,
		feeFlowDefaultBuyDeadlineSeconds: readNumber(
			env,
			"EULER_SDK_FEE_FLOW_DEFAULT_BUY_DEADLINE_SECONDS",
		),

		queryCacheEnabled: readBoolean(env, "EULER_SDK_QUERY_CACHE_ENABLED"),
		queryCacheTtlMs: readNumber(env, "EULER_SDK_QUERY_CACHE_TTL_MS"),
	});
}

function removeUndefined<T extends object>(value: T): T {
	for (const key of Object.keys(value) as Array<keyof T>) {
		if (value[key] === undefined) delete value[key];
	}
	return value;
}
