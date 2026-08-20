import {
	type Abi,
	type Address,
	decodeFunctionData,
	encodeFunctionData,
	getAddress,
	type Hex,
	type PublicClient,
	zeroAddress,
} from "viem";
import {
	Account,
	type AddressOrAccount,
	type IHasVaultAddress,
	type SubAccount,
} from "../../entities/Account.js";
import type { EVault, EVaultCollateral } from "../../entities/EVault.js";
import type {
	BatchItemDescription,
	EVCBatchItem,
	TransactionPlan,
	TransactionPlanItem,
} from "../../services/executionService/executionServiceTypes.js";
import {
	applyBuildQuery,
	normalizeQueryKeySet,
	serializeQueryArgs,
	type BuildQueryFn,
} from "../../utils/buildQuery.js";
import { createBundledCall } from "../../utils/callBundler.js";
import {
	calculateHealthCheckSets,
	collectLiquidationHealthChecks,
	type HealthCheckAccountSet,
	type PlanHealthCheckSet,
} from "../../utils/healthCheckSets.js";
import {
	collectPythFeedsFromRouteSteps,
	type PythFeed,
} from "../../utils/oracle.js";
import {
	type EulerPlugin,
	type PluginBatchItems,
	type PluginPrefetchData,
	type PluginSDK,
	PluginExecutionFatalError,
	prependToBatch,
	type PythPluginPrefetch,
	type ReadPluginContext,
} from "../types.js";

// ── Pyth ABI (minimal: only the two functions we need) ──

const PYTH_ABI = [
	{
		type: "function",
		name: "getUpdateFee",
		inputs: [{ name: "updateData", type: "bytes[]" }],
		outputs: [{ name: "feeAmount", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "updatePriceFeeds",
		inputs: [{ name: "updateData", type: "bytes[]" }],
		outputs: [],
		stateMutability: "payable",
	},
] as const;

// ── Hermes data fetch (injectable query pattern) ──

const normalizeHex = (value: string): Hex =>
	(value.startsWith("0x") ? value : `0x${value}`) as Hex;

const normalizeFeedId = (value: string): Hex =>
	normalizeHex(value).toLowerCase() as Hex;

const PYTH_PRICE_ID_PATTERN = /0x[0-9a-fA-F]{64}/g;
const DEFAULT_MAX_PYTH_UPDATE_FEE = 10n ** 16n;
const OFFICIAL_PYTH_ADDRESSES_BY_CHAIN_ID = new Map<number, Address>([
	[1, "0x4305FB66699C3B2702D4d05CF36551390A4c69C6"],
	[10, "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"],
	[56, "0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594"],
	[100, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[130, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[137, "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"],
	[143, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[146, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[169, "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"],
	[204, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[252, "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"],
	[324, "0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834"],
	[480, "0xe9d69cdd6fe41e7b621b4a688c5d1a68cb5c8adc"],
	[747, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[999, "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc"],
	[1030, "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc"],
	[1116, "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"],
	[1329, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[1868, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[1923, "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21"],
	[2020, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[2741, "0x8739d5024B5143278E2b15Bd9e7C26f6CEc658F1"],
	[34443, "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"],
	[42161, "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"],
	[42220, "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"],
	[42793, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[43111, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[43114, "0x4305FB66699C3B2702D4d05CF36551390A4c69C6"],
	[57073, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[59144, "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"],
	[80094, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[81457, "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"],
	[16661, "0x2880ab155794e7179c9ee2e38200202908c17b43"],
	[31612, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
	[534352, "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"],
	[167000, "0x2880aB155794e7179c9eE2e38200202908C17B43"],
]);

const parseMissingPriceIds = (body: string): Set<Hex> => {
	const matches = body.match(PYTH_PRICE_ID_PATTERN) ?? [];
	return new Set(matches.map((id) => normalizeFeedId(id)));
};

export type PythUpdateBundle = {
	feedIds: Hex[];
	publishTimes: number[];
	updates: Hex[];
};

/**
 * Adapter for the Pyth plugin. Follows the SDK's injectable query pattern:
 * all external calls are `query*` arrow-function properties, wrapped by `applyBuildQuery`.
 */
export class PythPluginAdapter {
	private hermesUrl: string;
	private fetchFn: typeof fetch;

	constructor(
		hermesUrl: string,
		buildQuery?: BuildQueryFn,
		fetchFn: typeof fetch = globalThis.fetch,
	) {
		this.hermesUrl = hermesUrl;
		// Browser fetch throws "Illegal invocation" if `this` is anything but
		// Window; storing it on the instance and calling via `this.fetchFn(...)`
		// rebinds away. Bind once at construction.
		this.fetchFn = fetchFn.bind(globalThis);
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	/**
	 * Fetch latest price update data from Pyth Hermes API.
	 * FeedIds are automatically bundled across concurrent calls within the same tick.
	 */
	queryPythUpdateBundle = createBundledCall(
		async (feedIds: Hex[]): Promise<PythUpdateBundle> => {
			const normalizedIds = [...new Set(feedIds.map(normalizeFeedId))].sort(
				(left, right) => left.localeCompare(right),
			);
			if (!normalizedIds.length) {
				return { feedIds: [], publishTimes: [], updates: [] };
			}

			return this.fetchPythUpdateBundle(normalizedIds);
		},
	);

	queryPythUpdateData = async (feedIds: Hex[]): Promise<Hex[]> =>
		(await this.queryPythUpdateBundle(feedIds)).updates;

	getQueryKeyPythUpdateBundle(feedIds: Hex[]): string | null {
		return this.getQueryKeyPythUpdateData(feedIds);
	}

	getQueryKeyPythUpdateData(feedIds: Hex[]): string | null {
		return serializeQueryArgs([
			normalizeQueryKeySet(feedIds.map(normalizeFeedId)),
		]);
	}

	private fetchPythUpdateBundle = async (
		feedIds: Hex[],
	): Promise<PythUpdateBundle> => {
		if (!feedIds.length) {
			return { feedIds: [], publishTimes: [], updates: [] };
		}

		const url = new URL("/v2/updates/price/latest", this.hermesUrl);
		feedIds.forEach((id) => url.searchParams.append("ids[]", id));
		url.searchParams.set("encoding", "hex");
		url.searchParams.set("parsed", "true");

		const response = await this.fetchFn(url.toString());
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			if (response.status === 404) {
				const missingIds = parseMissingPriceIds(body);
				if (missingIds.size > 0) {
					const retryIds = feedIds.filter((id) => !missingIds.has(id));
					return this.fetchPythUpdateBundle(retryIds);
				}
			}
			throw new Error(
				`Failed to fetch Pyth update data: ${response.status}${
					body ? ` ${body}` : ""
				}`,
			);
		}

		const body = (await response.json()) as {
			binary?: { data?: unknown[] };
			parsed?: Array<{
				id?: unknown;
				price?: { publish_time?: unknown };
			}>;
		};
		const binaryData = body?.binary?.data;
		const updates = Array.isArray(binaryData)
			? binaryData.map((item) => normalizeHex(String(item)))
			: [];
		const publishTimeByFeed = new Map<Hex, number>();
		for (const parsed of body.parsed ?? []) {
			if (typeof parsed.id !== "string") continue;
			const publishTime = parsed.price?.publish_time;
			if (
				typeof publishTime !== "number" ||
				!Number.isSafeInteger(publishTime) ||
				publishTime < 0
			) {
				continue;
			}
			publishTimeByFeed.set(normalizeFeedId(parsed.id), publishTime);
		}
		const hasCompletePublishTimes = feedIds.every((id) =>
			publishTimeByFeed.has(id),
		);
		return {
			feedIds,
			publishTimes: hasCompletePublishTimes
				? feedIds.map((id) => publishTimeByFeed.get(id)!)
				: [],
			updates,
		};
	};

	/**
	 * Query the on-chain Pyth contract for the fee required to update given price data.
	 */
	queryPythUpdateFee = async (
		provider: PublicClient,
		pythAddress: Address,
		updateData: Hex[],
	): Promise<bigint> => {
		return provider.readContract({
			address: pythAddress,
			abi: PYTH_ABI,
			functionName: "getUpdateFee",
			args: [updateData],
		});
	};

	getQueryKeyPythUpdateFee(
		provider: PublicClient,
		pythAddress: Address,
		updateData: Hex[],
	): string | null {
		return serializeQueryArgs([
			provider,
			pythAddress,
			normalizeQueryKeySet(updateData),
		]);
	}

	setQueryPythUpdateData(fn: typeof this.queryPythUpdateData): void {
		this.queryPythUpdateData = fn;
	}

	setQueryPythUpdateBundle(fn: typeof this.queryPythUpdateBundle): void {
		this.queryPythUpdateBundle = fn;
	}

	setQueryPythUpdateFee(fn: typeof this.queryPythUpdateFee): void {
		this.queryPythUpdateFee = fn;
	}
}

// ── Core batch item builder ──

async function buildPythBatchItems(
	feeds: PythFeed[],
	adapter: PythPluginAdapter,
	provider: PublicClient,
	chainId: number,
	trustedPythAddresses: ReadonlySet<string>,
	maxUpdateFee: bigint,
	sender: Address = zeroAddress,
	failClosed = false,
): Promise<PluginBatchItems> {
	if (!feeds.length) return { items: [], totalValue: 0n };

	// Group feeds by Pyth contract address
	const grouped = new Map<Address, Set<Hex>>();
	for (const feed of feeds) {
		const pythAddress = getAddress(feed.pythAddress) as Address;
		if (!trustedPythAddresses.has(pythAddress.toLowerCase())) {
			const error = new Error(`Untrusted Pyth contract for chainId ${chainId}`);
			logPythPluginError(
				pythAddress,
				[feed.feedId],
				error,
			);
			if (failClosed) {
				throw new PluginExecutionFatalError(error.message, { cause: error });
			}
			continue;
		}
		const set = grouped.get(pythAddress) || new Set();
		set.add(feed.feedId);
		grouped.set(pythAddress, set);
	}

	const items: EVCBatchItem[] = [];
	let totalValue = 0n;

	for (const [pythAddress, feedSet] of grouped.entries()) {
		try {
			const updateData = await adapter.queryPythUpdateData([...feedSet]);
			if (!updateData.length) {
				if (failClosed) {
					throw new Error("Pyth Hermes returned no update data");
				}
				continue;
			}

			const fee = await adapter.queryPythUpdateFee(
				provider,
				pythAddress,
				updateData,
			);
			if (fee > maxUpdateFee) {
				throw new Error(
					`Pyth update fee ${fee.toString()} exceeds max ${maxUpdateFee.toString()}`,
				);
			}

			items.push({
				targetContract: pythAddress,
				onBehalfOfAccount: sender,
				value: fee,
				data: encodeFunctionData({
					abi: PYTH_ABI,
					functionName: "updatePriceFeeds",
					args: [updateData],
				}),
			});
			totalValue += fee;
		} catch (error) {
			logPythPluginError(pythAddress, [...feedSet], error);
			if (failClosed) {
				throw new PluginExecutionFatalError(
					`Pyth update materialization failed for ${pythAddress}`,
					{ cause: error },
				);
			}
		}
	}

	return { items, totalValue };
}

// ── Deduplicate feeds ──

function deduplicateFeeds(feeds: PythFeed[]): PythFeed[] {
	const seen = new Map<string, PythFeed>();
	for (const feed of feeds) {
		const key = `${feed.pythAddress.toLowerCase()}:${feed.feedId.toLowerCase()}`;
		if (!seen.has(key)) seen.set(key, feed);
	}
	return [...seen.values()];
}

type PythControllerVault = Pick<
	EVault,
	"address" | "asset" | "unitOfAccount" | "debtPricingOracleRoute"
> & {
	collaterals: Pick<
		EVaultCollateral,
		"address" | "currentLiquidationLTV" | "oracleRoute"
	>[];
};

const MINIMAL_ACCOUNT_FETCH_OPTIONS = {
	populateVaults: true,
	populateMarketPrices: false,
	populateUserRewards: false,
} as const;

const CONTROLLER_SELF = "__controller_self__";
const loggedPythPluginErrors = new Set<string>();

function isPythControllerVault(vault: unknown): vault is PythControllerVault {
	return (
		typeof vault === "object" &&
		vault !== null &&
		"address" in vault &&
		"collaterals" in vault
	);
}

function getAccountOwner(account: AddressOrAccount): Address {
	return typeof account === "string"
		? getAddress(account)
		: getAddress(account.owner);
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function logPythPluginError(
	pythAddress: Address,
	feedIds: Hex[],
	error: unknown,
): void {
	const errorMessage = getErrorMessage(error);
	const key = `${pythAddress}:${errorMessage}`;
	if (loggedPythPluginErrors.has(key)) return;
	loggedPythPluginErrors.add(key);

	console.warn(
		`[euler-v2-sdk:pyth] failed to build update batch for ${pythAddress}; feeds=${feedIds.join(",")}`,
		error,
	);
}

async function resolveAccount(
	account: AddressOrAccount,
	chainId: number,
	sdk: PluginSDK,
): Promise<Account<IHasVaultAddress>> {
	if (account instanceof Account) {
		if (account.populated.vaults) return account;
		const populated = await sdk.accountService.populateVaults(
			[account as Account<never>],
			MINIMAL_ACCOUNT_FETCH_OPTIONS,
		);
		return populated.result[0] as Account<IHasVaultAddress>;
	}

	const fetched = await sdk.accountService.fetchAccount(
		chainId,
		getAddress(account),
		MINIMAL_ACCOUNT_FETCH_OPTIONS,
	);
	return fetched.result;
}

async function resolvePlanHealthCheckSets(
	plan: TransactionPlan,
	account: Account<IHasVaultAddress>,
	chainId: number,
	sdk: PluginSDK,
): Promise<PlanHealthCheckSet[]> {
	const checksByViolator = new Map<Address, Set<Address>>();
	for (const check of collectLiquidationHealthChecks(plan)) {
		const controllers =
			checksByViolator.get(check.violator) ?? new Set<Address>();
		controllers.add(check.controller);
		checksByViolator.set(check.violator, controllers);
	}
	if (!checksByViolator.size) return calculateHealthCheckSets(plan, account);

	const additionalSubAccounts: SubAccount<IHasVaultAddress>[] = [];
	for (const [violator, requiredControllers] of checksByViolator) {
		let subAccount = account.getSubAccount(violator);
		if (!subAccount) {
			const fetched = await sdk.accountService.fetchSubAccount(
				chainId,
				violator,
				undefined,
				MINIMAL_ACCOUNT_FETCH_OPTIONS,
			);
			const blockingIssues = fetched.errors.filter(
				(issue) => issue.severity === "error",
			);
			if (blockingIssues.length) {
				throw new PluginExecutionFatalError(
					`Pyth liquidation enrichment could not load complete violator metadata for ${violator}: ${blockingIssues.map((issue) => issue.message).join("; ")}`,
				);
			}
			subAccount = fetched.result;
		}

		if (!subAccount) {
			throw new PluginExecutionFatalError(
				`Pyth liquidation enrichment could not load violator sub-account ${violator}.`,
			);
		}

		for (const controller of requiredControllers) {
			const controllerEnabled = subAccount.enabledControllers.some(
				(enabled) => getAddress(enabled) === getAddress(controller),
			);
			const debtPosition = subAccount.positions.find(
				(position) =>
					getAddress(position.vaultAddress) === getAddress(controller) &&
					position.borrowed > 0n,
			);
			if (!controllerEnabled || !debtPosition) {
				throw new PluginExecutionFatalError(
					`Pyth liquidation enrichment received incomplete violator metadata for ${violator}: controller ${controller} is not present as enabled debt.`,
				);
			}
		}

		additionalSubAccounts.push(subAccount);
	}

	return calculateHealthCheckSets(plan, account, additionalSubAccounts);
}

async function collectHealthCheckFeeds(
	checkedAccounts: readonly HealthCheckAccountSet[],
	chainId: number,
	sdk: PluginSDK,
): Promise<PythFeed[]> {
	const controllerAddresses = new Set<Address>();
	for (const account of checkedAccounts) {
		for (const controller of account.controllers) {
			controllerAddresses.add(controller);
		}
	}
	if (!controllerAddresses.size) return [];

	const fetched = await sdk.vaultMetaService.fetchVaults(chainId, [
		...controllerAddresses,
	]);
	const requiresCompleteMetadata = checkedAccounts.some(
		(account) => account.requireCompleteMetadata,
	);
	const blockingIssues = fetched.errors.filter((issue) => issue.severity === "error");
	if (requiresCompleteMetadata && blockingIssues.length) {
		throw new PluginExecutionFatalError(
			`Pyth liquidation enrichment could not load complete controller metadata: ${blockingIssues.map((issue) => issue.message).join("; ")}`,
		);
	}

	const controllers = new Map<Address, PythControllerVault>();
	for (const vault of fetched.result) {
		if (isPythControllerVault(vault)) {
			controllers.set(getAddress(vault.address), vault);
		}
	}

	const feeds: PythFeed[] = [];
	const seenPairs = new Set<string>();
	for (const account of checkedAccounts) {
		for (const controllerAddress of account.controllers) {
			const controller = controllers.get(getAddress(controllerAddress));
			if (!controller) {
				if (account.requireCompleteMetadata) {
					throw new PluginExecutionFatalError(
						`Pyth liquidation enrichment could not resolve controller ${controllerAddress} for violator ${account.account}.`,
					);
				}
				continue;
			}
			const unitOfAccount = controller.unitOfAccount?.address;
			if (account.requireCompleteMetadata && !unitOfAccount) {
				throw new PluginExecutionFatalError(
					`Pyth liquidation enrichment could not resolve the unit of account for controller ${controllerAddress}.`,
				);
			}
			const liabilityNeedsRoute = unitOfAccount
				? getAddress(controller.asset.address) !== getAddress(unitOfAccount)
				: false;
			if (
				account.requireCompleteMetadata &&
				liabilityNeedsRoute &&
				!controller.debtPricingOracleRoute?.steps.length
			) {
				throw new PluginExecutionFatalError(
					`Pyth liquidation enrichment could not resolve the liability oracle route for controller ${controllerAddress}.`,
				);
			}

			const selfKey = `${getAddress(controllerAddress).toLowerCase()}:${CONTROLLER_SELF}`;
			if (!seenPairs.has(selfKey)) {
				seenPairs.add(selfKey);
				feeds.push(
					...collectPythFeedsFromRouteSteps(controller.debtPricingOracleRoute),
				);
			}

			for (const collateralAddress of account.collaterals) {
				const pairKey = `${getAddress(controllerAddress).toLowerCase()}:${getAddress(collateralAddress).toLowerCase()}`;
				const collateral = controller.collaterals.find(
					(c) => getAddress(c.address) === getAddress(collateralAddress),
				);
				if (!collateral) {
					// EVC collateral enablement is permissionless. A vault absent from
					// the controller's LTV list has an effective zero LTV, so EVK skips
					// its oracle read and no update feed is required.
					continue;
				}
				const collateralNeedsRoute = unitOfAccount
					? getAddress(collateralAddress) !== getAddress(unitOfAccount) &&
						collateral.currentLiquidationLTV > 0
					: false;
				if (
					account.requireCompleteMetadata &&
					collateralNeedsRoute &&
					!collateral.oracleRoute?.steps.length
				) {
					throw new PluginExecutionFatalError(
						`Pyth liquidation enrichment could not resolve the oracle route for collateral ${collateralAddress} in controller ${controllerAddress}.`,
					);
				}
				if (seenPairs.has(pairKey)) continue;
				seenPairs.add(pairKey);
				feeds.push(...collectPythFeedsFromRouteSteps(collateral.oracleRoute));
			}
		}
	}

	return deduplicateFeeds(feeds);
}

// ── Plugin factory ──

export interface PythPluginConfig {
	hermesUrl?: string;
	buildQuery?: BuildQueryFn;
	/** Additional trusted Pyth contract addresses by chain ID. Official addresses are allowed by default. */
	pythAddresses?: Record<number, Address | readonly Address[]>;
	/** Maximum native-token fee accepted for one Pyth update batch. Defaults to 0.01 native token. */
	maxUpdateFee?: bigint;
	/** Override fetch used to call the Hermes endpoint. Apps that proxy Hermes through their own backend (e.g. to satisfy CSP) pass a fetcher that rewrites the request URL. */
	fetchFn?: typeof fetch;
}

export function createPythPlugin(config: PythPluginConfig = {}): EulerPlugin {
	const hermesUrl = config.hermesUrl || "https://hermes.pyth.network";
	const adapter = new PythPluginAdapter(hermesUrl, config.buildQuery, config.fetchFn);
	const maxUpdateFee = config.maxUpdateFee ?? DEFAULT_MAX_PYTH_UPDATE_FEE;
	const getTrustedPythAddresses = (chainId: number): Set<string> => {
		const addresses = new Set<string>();
		const officialAddress = OFFICIAL_PYTH_ADDRESSES_BY_CHAIN_ID.get(chainId);
		if (officialAddress)
			addresses.add(getAddress(officialAddress).toLowerCase());

		const configuredAddresses = config.pythAddresses?.[chainId];
		const customAddresses = Array.isArray(configuredAddresses)
			? configuredAddresses
			: configuredAddresses
				? [configuredAddresses]
				: [];
		for (const address of customAddresses) {
			addresses.add(getAddress(address).toLowerCase());
		}
		return addresses;
	};

	const buildBatchItemsFromPrefetch = (
		entries: PythPluginPrefetch["entries"],
		sender: Address,
		failClosed = false,
	): { items: EVCBatchItem[]; totalValue: bigint } => {
		const items: EVCBatchItem[] = [];
		let totalValue = 0n;
		for (const entry of entries) {
			if (
				entry.feedIds.length !== entry.publishTimes.length ||
				entry.feedIds.length === 0
			) {
				if (failClosed) {
					throw new PluginExecutionFatalError(
						"Pyth prefetch is missing publish-time evidence",
					);
				}
				continue;
			}
			if (!entry.updates.length) {
				if (failClosed) {
					throw new PluginExecutionFatalError(
						"Pyth prefetch has no update data",
					);
				}
				continue;
			}
			if (entry.fee > maxUpdateFee) {
				if (failClosed) {
					throw new PluginExecutionFatalError(
						`Pyth update fee ${entry.fee.toString()} exceeds max ${maxUpdateFee.toString()}`,
					);
				}
				continue;
			}
			items.push({
				targetContract: entry.pythAddress,
				onBehalfOfAccount: sender,
				value: entry.fee,
				data: encodeFunctionData({
					abi: PYTH_ABI,
					functionName: "updatePriceFeeds",
					args: [entry.updates],
				}),
			});
			totalValue += entry.fee;
		}
		return { items, totalValue };
	};

	const hasPythPrefetch = (
		prefetch: PluginPrefetchData | undefined,
	): prefetch is PluginPrefetchData & { pyth: PythPluginPrefetch } =>
		Object.hasOwn(prefetch ?? {}, "pyth");

	return {
		name: "pyth",

		async prefetch(
			plan: TransactionPlan,
			account: AddressOrAccount,
			chainId: number,
			sdk: PluginSDK,
		): Promise<PythPluginPrefetch | undefined> {
			const resolvedAccount = await resolveAccount(account, chainId, sdk);
			const planSets = await resolvePlanHealthCheckSets(
				plan,
				resolvedAccount,
				chainId,
				sdk,
			);
			const allAccounts: HealthCheckAccountSet[] = [];
			for (const set of planSets) allAccounts.push(...set.accounts);
			if (!allAccounts.length) return { entries: [] };

			const feeds = await collectHealthCheckFeeds(
				allAccounts,
				chainId,
				sdk,
			);
			if (!feeds.length) return { entries: [] };

			const provider = sdk.providerService.getProvider(chainId);
			const trusted = getTrustedPythAddresses(chainId);
			const grouped = new Map<Address, Set<Hex>>();
			for (const feed of feeds) {
				const pythAddress = getAddress(feed.pythAddress);
				if (!trusted.has(pythAddress.toLowerCase())) {
					const error = new PluginExecutionFatalError(
						`Untrusted Pyth contract for chainId ${chainId}`,
					);
					logPythPluginError(
						pythAddress,
						[feed.feedId],
						error,
					);
					throw error;
				}
				const set = grouped.get(pythAddress) ?? new Set<Hex>();
				set.add(feed.feedId);
				grouped.set(pythAddress, set);
			}

			const entries: PythPluginPrefetch["entries"] = [];
			await Promise.all(
				[...grouped.entries()].map(async ([pythAddress, feedSet]) => {
					const feedIds = [...feedSet];
					const bundle = await adapter.queryPythUpdateBundle(feedIds);
					const { updates } = bundle;
					if (!updates.length) {
						throw new PluginExecutionFatalError(
							"Pyth Hermes returned no update data",
						);
					}
					if (
						bundle.feedIds.length !== bundle.publishTimes.length ||
						bundle.feedIds.length === 0
					) {
						throw new PluginExecutionFatalError(
							"Pyth Hermes response is missing publish-time evidence",
						);
					}
					const fee = await adapter.queryPythUpdateFee(
						provider,
						pythAddress,
						updates,
					);
					if (fee > maxUpdateFee) {
						throw new PluginExecutionFatalError(
							`Pyth update fee ${fee.toString()} exceeds max ${maxUpdateFee.toString()}`,
						);
					}
					entries.push({
						pythAddress,
						feedIds: bundle.feedIds,
						publishTimes: bundle.publishTimes,
						updates,
						fee,
					});
				}),
			);
			entries.sort((left, right) =>
				left.pythAddress.localeCompare(right.pythAddress),
			);
			return { entries };
		},

		async getReadPrepend(
			ctx: ReadPluginContext,
			prefetch?: PluginPrefetchData,
		): Promise<PluginBatchItems | null> {
			if (hasPythPrefetch(prefetch)) {
				const built = buildBatchItemsFromPrefetch(
					prefetch.pyth.entries,
					zeroAddress,
				);
				return built.items.length ? built : null;
			}

			// Route-aware live collection: derive feeds from the selected
			// debt-asset and per-collateral routes, not the full router tree.
			const collectedFeeds: PythFeed[] = [];
			for (const v of ctx.vaults) {
				collectedFeeds.push(
					...collectPythFeedsFromRouteSteps(v.debtPricingOracleRoute),
				);
				for (const collateral of v.collaterals ?? []) {
					collectedFeeds.push(
						...collectPythFeedsFromRouteSteps(collateral.oracleRoute),
					);
				}
			}
			const feeds = deduplicateFeeds(collectedFeeds);
			if (!feeds.length) return null;
			const result = await buildPythBatchItems(
				feeds,
				adapter,
				ctx.provider,
				ctx.chainId,
				getTrustedPythAddresses(ctx.chainId),
				maxUpdateFee,
			);
			return result.items.length > 0 ? result : null;
		},

		async processPlan(
			plan: TransactionPlan,
			account: AddressOrAccount,
			chainId: number,
			sdk: PluginSDK,
			prefetch?: PluginPrefetchData,
		): Promise<TransactionPlan> {
			const sender = getAccountOwner(account);
			if (hasPythPrefetch(prefetch)) {
				// Prepend the prefetched Pyth update once. Pyth updates are
				// multicall-scoped: a single update at the head of the first
				// evcBatch serves every health-check downstream in that batch.
				const built = buildBatchItemsFromPrefetch(
					prefetch.pyth.entries,
					sender,
					true,
				);
				if (!built.items.length) return plan;
				return prependToBatch(plan, built.items);
			}

			const resolvedAccount = await resolveAccount(account, chainId, sdk);
			const healthCheckSets = new Map(
				(
					await resolvePlanHealthCheckSets(plan, resolvedAccount, chainId, sdk)
				).map((set) => [set.planIndex, set.accounts]),
			);
			const provider = sdk.providerService.getProvider(chainId);
			const processed: TransactionPlanItem[] = [];

			for (const [planIndex, entry] of plan.entries()) {
				if (entry.type !== "evcBatch") {
					processed.push(entry);
					continue;
				}

				const checkedAccounts = healthCheckSets.get(planIndex);
				if (!checkedAccounts?.length) {
					processed.push(entry);
					continue;
				}

				const feeds = await collectHealthCheckFeeds(
					checkedAccounts,
					chainId,
					sdk,
				);
				if (!feeds.length) {
					processed.push(entry);
					continue;
				}

				const result = await buildPythBatchItems(
					feeds,
					adapter,
					provider,
					chainId,
					getTrustedPythAddresses(chainId),
					maxUpdateFee,
					sender,
					true,
				);
				processed.push(
					result.items.length
						? prependToBatch([entry], result.items)[0]!
						: entry,
				);
			}

			return processed;
		},

		decodeBatchItem(item: EVCBatchItem): BatchItemDescription | null {
			try {
				const decoded = decodeFunctionData({
					abi: PYTH_ABI as unknown as Abi,
					data: item.data,
				});

				const functionAbi = PYTH_ABI.find(
					(a) => a.type === "function" && a.name === decoded.functionName,
				);
				const namedArgs: Record<string, unknown> = {};
				if (
					functionAbi &&
					"inputs" in functionAbi &&
					Array.isArray(decoded.args)
				) {
					functionAbi.inputs.forEach((input, index) => {
						namedArgs[input.name] = decoded.args?.[index];
					});
				}

				return {
					targetContract: item.targetContract,
					onBehalfOfAccount: item.onBehalfOfAccount,
					functionName: decoded.functionName,
					args: namedArgs,
				};
			} catch {
				return null;
			}
		},
	};
}
