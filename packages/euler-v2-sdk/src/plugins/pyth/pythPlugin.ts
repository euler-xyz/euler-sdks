import {
	type Address,
	type Hex,
	type PublicClient,
	type Abi,
	encodeFunctionData,
	decodeFunctionData,
	getAddress,
	zeroAddress,
} from "viem";
import {
	Account,
	type AddressOrAccount,
	type IHasVaultAddress,
} from "../../entities/Account.js";
import type { EVault, EVaultCollateral } from "../../entities/EVault.js";
import type {
	EulerPlugin,
	PluginBatchItems,
	PluginSDK,
	ReadPluginContext,
} from "../types.js";
import type {
	BatchItemDescription,
	EVCBatchItem,
	TransactionPlan,
	TransactionPlanItem,
} from "../../services/executionService/executionServiceTypes.js";
import {
	collectPythFeedsFromAdapters,
	type PythFeed,
} from "../../utils/oracle.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import { createBundledCall } from "../../utils/callBundler.js";
import {
	calculateHealthCheckSets,
	type HealthCheckAccountSet,
} from "../../utils/healthCheckSets.js";

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

const parseMissingPriceIds = (body: string): Set<Hex> => {
	const matches = body.match(PYTH_PRICE_ID_PATTERN) ?? [];
	return new Set(matches.map((id) => normalizeFeedId(id)));
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
		this.fetchFn = fetchFn;
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	/**
	 * Fetch latest price update data from Pyth Hermes API.
	 * FeedIds are automatically bundled across concurrent calls within the same tick.
	 */
	queryPythUpdateData = createBundledCall(
		async (feedIds: Hex[]): Promise<Hex[]> => {
			const normalizedIds = [...new Set(feedIds.map(normalizeFeedId))];
			if (!normalizedIds.length) return [];

			return this.fetchPythUpdateData(normalizedIds);
		},
	);

	private fetchPythUpdateData = async (feedIds: Hex[]): Promise<Hex[]> => {
		if (!feedIds.length) return [];

		const url = new URL("/v2/updates/price/latest", this.hermesUrl);
		feedIds.forEach((id) => url.searchParams.append("ids[]", id));
		url.searchParams.set("encoding", "hex");

		const response = await this.fetchFn(url.toString());
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			if (response.status === 404) {
				const missingIds = parseMissingPriceIds(body);
				if (missingIds.size > 0) {
					const retryIds = feedIds.filter((id) => !missingIds.has(id));
					return this.fetchPythUpdateData(retryIds);
				}
			}
			throw new Error(
				`Failed to fetch Pyth update data: ${response.status}${
					body ? ` ${body}` : ""
				}`,
			);
		}

		const body = (await response.json()) as { binary?: { data?: unknown[] } };
		const binaryData = body?.binary?.data;
		if (!Array.isArray(binaryData)) return [];

		return binaryData.map((item) => normalizeHex(String(item)));
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

	setQueryPythUpdateData(fn: typeof this.queryPythUpdateData): void {
		this.queryPythUpdateData = fn;
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
	sender: Address = zeroAddress,
): Promise<PluginBatchItems> {
	if (!feeds.length) return { items: [], totalValue: 0n };

	// Group feeds by Pyth contract address
	const grouped = new Map<Address, Set<Hex>>();
	for (const feed of feeds) {
		const set = grouped.get(feed.pythAddress) || new Set();
		set.add(feed.feedId);
		grouped.set(feed.pythAddress, set);
	}

	const items: EVCBatchItem[] = [];
	let totalValue = 0n;

	for (const [pythAddress, feedSet] of grouped.entries()) {
		try {
			const updateData = await adapter.queryPythUpdateData([...feedSet]);
			if (!updateData.length) continue;

			const fee = await adapter.queryPythUpdateFee(
				provider,
				pythAddress,
				updateData,
			);

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
		} catch {}
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
	"address" | "debtPricingOracleAdapters"
> & {
	collaterals: Pick<EVaultCollateral, "address" | "oracleAdapters">[];
};

const MINIMAL_ACCOUNT_FETCH_OPTIONS = {
	populateVaults: true,
	populateMarketPrices: false,
	populateUserRewards: false,
	vaultFetchOptions: {
		populateAll: false,
		populateMarketPrices: false,
		populateCollaterals: false,
		populateRewards: false,
		populateIntrinsicApy: false,
		populateLabels: false,
	},
} as const;

const CONTROLLER_SELF = "__controller_self__";

function isPythControllerVault(vault: unknown): vault is PythControllerVault {
	return (
		typeof vault === "object" &&
		vault !== null &&
		"address" in vault &&
		"debtPricingOracleAdapters" in vault &&
		"collaterals" in vault
	);
}

function getAccountOwner(account: AddressOrAccount): Address {
	return typeof account === "string"
		? getAddress(account)
		: getAddress(account.owner);
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

	const fetched = await sdk.vaultMetaService.fetchVaults(
		chainId,
		[...controllerAddresses],
		{
			populateCollaterals: true,
			populateMarketPrices: false,
			populateRewards: false,
			populateIntrinsicApy: false,
			populateLabels: false,
		},
	);

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
			if (!controller) continue;

			const selfKey = `${getAddress(controllerAddress).toLowerCase()}:${CONTROLLER_SELF}`;
			if (!seenPairs.has(selfKey)) {
				seenPairs.add(selfKey);
				feeds.push(
					...collectPythFeedsFromAdapters(controller.debtPricingOracleAdapters),
				);
			}

			for (const collateralAddress of account.collaterals) {
				const pairKey = `${getAddress(controllerAddress).toLowerCase()}:${getAddress(collateralAddress).toLowerCase()}`;
				if (seenPairs.has(pairKey)) continue;
				seenPairs.add(pairKey);

				const collateral = controller.collaterals.find(
					(c) => getAddress(c.address) === getAddress(collateralAddress),
				);
				if (!collateral) continue;
				feeds.push(
					...collectPythFeedsFromAdapters(collateral.oracleAdapters ?? []),
				);
			}
		}
	}

	return deduplicateFeeds(feeds);
}

// ── Plugin factory ──

export interface PythPluginConfig {
	hermesUrl?: string;
	buildQuery?: BuildQueryFn;
}

export function createPythPlugin(config: PythPluginConfig = {}): EulerPlugin {
	const hermesUrl = config.hermesUrl || "https://hermes.pyth.network";
	const adapter = new PythPluginAdapter(hermesUrl, config.buildQuery);

	return {
		name: "pyth",

		async getReadPrepend(
			ctx: ReadPluginContext,
		): Promise<PluginBatchItems | null> {
			const feeds = deduplicateFeeds(
				ctx.vaults.flatMap((v) =>
					collectPythFeedsFromAdapters(v.oracle.adapters),
				),
			);

			if (!feeds.length) return null;
			const result = await buildPythBatchItems(feeds, adapter, ctx.provider);
			return result.items.length > 0 ? result : null;
		},

		async processPlan(
			plan: TransactionPlan,
			account: AddressOrAccount,
			chainId: number,
			sdk: PluginSDK,
		): Promise<TransactionPlan> {
			const resolvedAccount = await resolveAccount(account, chainId, sdk);
			const healthCheckSets = new Map(
				calculateHealthCheckSets(plan, resolvedAccount).map((set) => [
					set.planIndex,
					set.accounts,
				]),
			);
			const provider = sdk.providerService.getProvider(chainId);
			const sender = getAccountOwner(account);
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
					sender,
				);
				processed.push(
					result.items.length
						? { ...entry, items: [...result.items, ...entry.items] }
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
