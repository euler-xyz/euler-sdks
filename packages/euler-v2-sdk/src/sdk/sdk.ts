import type { IVaultEntity } from "../entities/Account.js";
import type { IAccountService } from "../services/accountService/index.js";
import type { IPortfolioService } from "../services/portfolioService/index.js";
import type { IDeploymentService } from "../services/deploymentService/index.js";
import type { IEVaultService } from "../services/vaults/eVaultService/index.js";
import type { IEulerEarnService } from "../services/vaults/eulerEarnService/index.js";
import type { ISecuritizeVaultService } from "../services/vaults/securitizeVaultService/index.js";
import type {
	IVaultMetaService,
	VaultEntity,
} from "../services/vaults/vaultMetaService/index.js";
import type { IProviderService } from "../services/providerService/index.js";
import type { IABIService } from "../services/abiService/index.js";
import type { IEulerLabelsService } from "../services/eulerLabelsService/index.js";
import type { ITokenlistService } from "../services/tokenlistService/index.js";
import type { ISwapService } from "../services/swapService/index.js";
import type { IExecutionService } from "../services/executionService/index.js";
import type { IWalletService } from "../services/walletService/index.js";
import type { IPriceService } from "../services/priceService/index.js";
import type { IRewardsService } from "../services/rewardsService/index.js";
import type { IIntrinsicApyService } from "../services/intrinsicApyService/index.js";
import type { IOracleAdapterService } from "../services/oracleAdapterService/index.js";
import type { IFeeFlowService } from "../services/feeFlowService/index.js";
import type { IREULLockService } from "../services/reulLockService/index.js";
import type { ISafeAccountService } from "../services/safeAccountService/index.js";
import type { IPositionMigrationService } from "../services/positionMigrationService/index.js";
import {
	ActivityService,
	ensureActivityLiquidationsSupport,
	UnavailableActivityAdapter,
	type IActivityService,
	type IActivityServiceWithLiquidations,
} from "../services/activityService/index.js";
import type { EulerPlugin, PluginPrefetchData } from "../plugins/types.js";
import type { TransactionPlan } from "../services/executionService/executionServiceTypes.js";
import type { AddressOrAccount } from "../entities/Account.js";

export interface EulerSDKOptions<
	TVaultEntity extends IVaultEntity = VaultEntity,
> {
	accountService: IAccountService<TVaultEntity>;
	portfolioService: IPortfolioService<TVaultEntity>;
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
	executionService: IExecutionService<TVaultEntity>;
	priceService: IPriceService;
	rewardsService: IRewardsService;
	intrinsicApyService: IIntrinsicApyService;
	oracleAdapterService: IOracleAdapterService;
	feeFlowService: IFeeFlowService;
	reulLockService: IREULLockService;
	safeAccountService: ISafeAccountService;
	positionMigrationService: IPositionMigrationService;
	activityService?: IActivityService;
	plugins?: EulerPlugin[];
}

export class EulerSDK<TVaultEntity extends IVaultEntity = VaultEntity> {
	public readonly accountService: IAccountService<TVaultEntity>;
	public readonly portfolioService: IPortfolioService<TVaultEntity>;
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
	public readonly executionService: IExecutionService<TVaultEntity>;
	public readonly priceService: IPriceService;
	public readonly rewardsService: IRewardsService;
	public readonly intrinsicApyService: IIntrinsicApyService;
	public readonly oracleAdapterService: IOracleAdapterService;
	public readonly feeFlowService: IFeeFlowService;
	public readonly reulLockService: IREULLockService;
	public readonly safeAccountService: ISafeAccountService;
	public readonly positionMigrationService: IPositionMigrationService;
	/**
	 * Always exposes the built-in liquidations guarantee: custom overrides
	 * without `fetchLiquidations` are wrapped so the method stays callable
	 * and reports activity-unavailable at runtime.
	 */
	public readonly activityService: IActivityServiceWithLiquidations;
	public readonly plugins: EulerPlugin[];

	constructor(options: EulerSDKOptions<TVaultEntity>) {
		this.accountService = options.accountService;
		this.portfolioService = options.portfolioService;
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
		this.rewardsService = options.rewardsService;
		this.intrinsicApyService = options.intrinsicApyService;
		this.oracleAdapterService = options.oracleAdapterService;
		this.feeFlowService = options.feeFlowService;
		this.reulLockService = options.reulLockService;
		this.safeAccountService = options.safeAccountService;
		this.positionMigrationService = options.positionMigrationService;
		this.activityService = ensureActivityLiquidationsSupport(
			options.activityService ??
				new ActivityService(
					new UnavailableActivityAdapter("source-not-configured"),
				),
		);
		this.plugins = options.plugins ?? [];
	}

	/**
	 * Run all plugins' processPlan methods on a transaction plan.
	 * Plugins execute in array order; each receives the plan as modified by previous plugins.
	 * Errors in individual plugins are caught gracefully — the plan continues without that plugin.
	 *
	 * `prefetch` carries per-plugin form-level data (Pyth Hermes updates,
	 * keyring vault gating, …) so the plugin can skip its own network I/O.
	 */
	async processPlugins(
		plan: TransactionPlan,
		account: AddressOrAccount,
		chainId: number,
		prefetch?: PluginPrefetchData,
	): Promise<TransactionPlan> {
		if (this.plugins.length === 0) return plan;

		for (const plugin of this.plugins) {
			if (!plugin.processPlan) continue;
			try {
				plan = await plugin.processPlan(plan, account, chainId, this, prefetch);
			} catch (err) {
				if (typeof console !== "undefined") {
					console.warn(
						`[euler-v2-sdk] plugin "${plugin.name}" processPlan failed`,
						err,
					);
				}
				// Plugin failed — skip it gracefully, operation proceeds without this plugin's enrichment
			}
		}

		return plan;
	}

	/**
	 * Resolve each plugin's prefetch payload for a given plan. Returns an open
	 * record keyed by plugin name; known SDK slots (`pyth`, `keyring`) are
	 * typed. Run once per form-load so per-quote prepare/estimate/simulate can
	 * pass the result back via `processPlugins(plan, account, chainId, prefetch)`
	 * without re-doing the expensive lookups.
	 */
	async prefetchPluginData(
		plan: TransactionPlan,
		account: AddressOrAccount,
		chainId: number,
	): Promise<PluginPrefetchData> {
		if (this.plugins.length === 0) return {};

		const entries = await Promise.all(
			this.plugins.map(async (plugin) => {
				if (!plugin.prefetch) return null;
				try {
					const data = await plugin.prefetch(plan, account, chainId, this);
					return data === undefined ? null : ([plugin.name, data] as const);
				} catch (err) {
					if (typeof console !== "undefined") {
						console.warn(
							`[euler-v2-sdk] plugin "${plugin.name}" prefetch failed`,
							err,
						);
					}
					return null;
				}
			}),
		);

		const result: PluginPrefetchData = {};
		for (const entry of entries) {
			if (entry) result[entry[0]] = entry[1];
		}
		return result;
	}
}
