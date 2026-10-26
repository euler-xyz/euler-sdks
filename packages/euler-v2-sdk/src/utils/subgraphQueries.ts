import { getAddress, type Address } from "viem";
import { createCallBundler } from "./callBundler.js";
import {
	serializeQueryArgs,
	type BuildQueryContext,
	type BuildQueryFn,
} from "./buildQuery.js";
import { getAddressPrefix } from "./subAccounts.js";
import {
	SubgraphUnavailableError,
	validateSubgraphDeployment,
	type SubgraphCapability,
} from "./subgraphCatalog.js";

export interface SubgraphQuerySource {
	endpoint: string;
	deploymentId?: string;
	/** Opaque application source identity; never needs to contain private URLs. */
	identity?: string;
}
export type SubgraphQuerySources =
	| Record<number, string | false>
	| ((
			chainId: number,
			capability: SubgraphCapability,
	  ) => Promise<SubgraphQuerySource>);
export interface SubgraphQueryOptions {
	/** Applications can enforce proxy, credentials, timeout and redirect policy here. */
	fetch?: typeof globalThis.fetch;
	/** Include metadata for direct/proxied sources as well as catalog sources. */
	includeMeta?: boolean;
	/** Optional opaque identity returned by an application's proxy. */
	getResponseIdentity?: (response: Response) => string | undefined;
}
interface AccountRow {
	id: string;
	deposits: string[];
	borrows: string[];
}
interface FactoryRow {
	id: Address;
	factory: Address;
}
const sourceQueries = new WeakSet<object>();
/** Internal: a source decorator is a query override, not an ordinary result cache. */
export const hasSubgraphQuerySource = (query: object): boolean =>
	sourceQueries.has(query);

type AccountKey = { chainId: number; account: Address };
type FactoryKey = { chainId: number; address: Address };
const PAGE_SIZE = 1000;
const object = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);
const isAddress = (value: unknown): value is Address =>
	typeof value === "string" && /^0x[\da-f]{40}$/i.test(value);
const isPosition = (value: unknown): value is string =>
	typeof value === "string" && /^0x[\da-f]{80}$/i.test(value);
const sourceKey = (source: SubgraphQuerySource) =>
	JSON.stringify([source.endpoint, source.deploymentId, source.identity]);
const resolveSource = async (
	sources: SubgraphQuerySources,
	chainId: number,
	capability: SubgraphCapability,
): Promise<SubgraphQuerySource> => {
	if (typeof sources !== "function" && sources[chainId] === false)
		throw new SubgraphUnavailableError("disabled", chainId);
	const source =
		typeof sources === "function"
			? await sources(chainId, capability)
			: { endpoint: sources[chainId] as string };
	if (!source.endpoint) throw new SubgraphUnavailableError("missing", chainId);
	return { ...source };
};
type Selection = { started?: boolean; identity?: string };
type CurrentSource = () => Promise<SubgraphQuerySource>;

async function querySubgraph(
	chainId: number,
	source: SubgraphQuerySource,
	operationName: "AccountVaults" | "VaultFactories",
	query: string,
	ids: string[],
	options: SubgraphQueryOptions,
	selection: Selection,
	currentSource?: CurrentSource,
) {
	if (
		selection.started &&
		currentSource &&
		sourceKey(await currentSource()) !== sourceKey(source)
	)
		throw new SubgraphUnavailableError("source-changed", chainId);
	const label =
		operationName === "AccountVaults" ? "Account vaults" : "Vault type";
	const response = await (options.fetch ?? globalThis.fetch)(source.endpoint, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query, variables: { ids }, operationName }),
	});
	if (!response.ok)
		throw new Error(
			`${label} subgraph ${response.status} ${response.statusText}`,
		);
	const payload: unknown = await response.json();
	if (!object(payload))
		throw new Error(`${label} subgraph returned malformed response.`);
	if (
		Array.isArray(payload.errors)
			? payload.errors.length > 0
			: payload.errors != null
	)
		throw new Error(`${label} subgraph returned GraphQL errors.`);
	if (!object(payload.data))
		throw new Error(`${label} subgraph returned malformed response.`);
	const data = payload.data;
	validateSubgraphDeployment(
		payload,
		chainId,
		source.deploymentId
			? { endpoint: source.endpoint, deploymentId: source.deploymentId }
			: undefined,
	);
	const responseIdentity = options.getResponseIdentity?.(response);
	const deployment =
		object(data._meta) && typeof data._meta.deployment === "string"
			? data._meta.deployment
			: undefined;
	const identity = JSON.stringify([
		source.identity,
		responseIdentity,
		deployment,
	]);
	if (selection.started && identity !== selection.identity)
		throw new SubgraphUnavailableError("source-changed", chainId);
	selection.started = true;
	selection.identity = identity;
	return data;
}

/** Shared by the built-in adapter and source-aware query decoration. */
export async function querySubgraphAccounts(
	chainId: number,
	accounts: Address[],
	source: SubgraphQuerySource,
	options: SubgraphQueryOptions = {},
	currentSource?: CurrentSource,
): Promise<Map<string, AccountRow>> {
	const ids = [
		...new Set(
			accounts.map((account) => getAddressPrefix(account).toLowerCase()),
		),
	];
	const rows = new Map<string, AccountRow>();
	const selection: Selection = {};
	const meta = options.includeMeta
		? "_meta { deployment block { number } }"
		: source.deploymentId
			? "_meta { deployment }"
			: "";
	for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
		const page = ids.slice(offset, offset + PAGE_SIZE);
		const data = await querySubgraph(
			chainId,
			source,
			"AccountVaults",
			`query AccountVaults($ids: [String!]!) {
      ${meta}
      trackingActiveAccounts(first: ${PAGE_SIZE}, where: { id_in: $ids }) { id deposits borrows }
    }`,
			page,
			options,
			selection,
			currentSource,
		);
		if (!Array.isArray(data.trackingActiveAccounts))
			throw new Error(
				"Account vaults subgraph returned malformed account data.",
			);
		for (const entry of data.trackingActiveAccounts) {
			if (
				!object(entry) ||
				typeof entry.id !== "string" ||
				!page.includes(entry.id.toLowerCase()) ||
				!Array.isArray(entry.deposits) ||
				!entry.deposits.every(isPosition) ||
				!Array.isArray(entry.borrows) ||
				!entry.borrows.every(isPosition)
			)
				throw new Error(
					"Account vaults subgraph returned malformed account data.",
				);
			rows.set(entry.id.toLowerCase(), {
				id: entry.id,
				deposits: entry.deposits,
				borrows: entry.borrows,
			});
		}
	}
	return rows;
}

/** Shared by the built-in adapter and source-aware query decoration. */
export async function querySubgraphFactories(
	chainId: number,
	addresses: Address[],
	source: SubgraphQuerySource,
	options: SubgraphQueryOptions = {},
	currentSource?: CurrentSource,
): Promise<Map<string, FactoryRow>> {
	const ids = [...new Set(addresses.map((address) => address.toLowerCase()))];
	const rows = new Map<string, FactoryRow>();
	const selection: Selection = {};
	const meta = options.includeMeta
		? "_meta { deployment block { number } }"
		: source.deploymentId
			? "_meta { deployment }"
			: "";
	for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
		const page = ids.slice(offset, offset + PAGE_SIZE);
		const data = await querySubgraph(
			chainId,
			source,
			"VaultFactories",
			`query VaultFactories($ids: [String!]!) {
      ${meta}
      vaults(first: ${PAGE_SIZE}, where: { id_in: $ids }) { id factory }
    }`,
			page,
			options,
			selection,
			currentSource,
		);
		if (!Array.isArray(data.vaults))
			throw new Error("Vault type subgraph returned malformed vault data.");
		for (const entry of data.vaults) {
			if (
				!object(entry) ||
				!isAddress(entry.id) ||
				!page.includes(entry.id.toLowerCase()) ||
				!isAddress(entry.factory)
			)
				throw new Error("Vault type subgraph returned malformed vault data.");
			rows.set(entry.id.toLowerCase(), {
				id: getAddress(entry.id),
				factory: getAddress(entry.factory),
			});
		}
	}
	return rows;
}

/**
 * Configure account/factory discovery with application-owned sources and transport.
 * The supplied cache builder retains its TTL, invalidation and null-key policy.
 * Dynamic sources resolve before cache lookup; each chain/source has its own bundler.
 */
export function withSubgraphQueries(
	buildQuery: BuildQueryFn,
	sources: SubgraphQuerySources,
	options: SubgraphQueryOptions = {},
): BuildQueryFn {
	const cacheBySource = <K extends { chainId: number }, V>(
		name: string,
		run: (
			keys: K[],
			source: SubgraphQuerySource,
			currentSource: CurrentSource,
		) => Promise<V[]>,
		target: object,
		context?: BuildQueryContext,
	) => {
		const chains = new Map<
			number,
			{ sourceKey: string; query: (key: K) => Promise<V> }
		>();
		return async (key: K): Promise<V> => {
			const capability =
				name === "queryAccountVaults"
					? "account-vault-discovery"
					: "vault-factory-lookup";
			const source = await resolveSource(sources, key.chainId, capability);
			const selectedKey = sourceKey(source);
			let cached = chains.get(key.chainId);
			if (!cached || cached.sourceKey !== selectedKey) {
				const query = buildQuery(
					name,
					createCallBundler((keys: K[]) =>
						run(keys, source, () =>
							resolveSource(sources, key.chainId, capability),
						),
					),
					target,
					{
						...context,
						getCacheKey: (args) => {
							const argsKey = context
								? context.getCacheKey(args)
								: serializeQueryArgs(args);
							return argsKey === null
								? null
								: JSON.stringify([key.chainId, selectedKey, argsKey]);
						},
					},
				);
				cached = { sourceKey: selectedKey, query };
				chains.set(key.chainId, cached);
			}
			return cached.query(key);
		};
	};
	const accounts = async (
		keys: AccountKey[],
		source: SubgraphQuerySource,
		currentSource: CurrentSource,
	) => {
		const first = keys[0];
		if (!first) return [];
		if (sourceKey(await currentSource()) !== sourceKey(source))
			throw new SubgraphUnavailableError("source-changed", first.chainId);
		const rows = await querySubgraphAccounts(
			first.chainId,
			keys.map((key) => key.account),
			source,
			options,
			currentSource,
		);
		return keys.map((key) => ({
			data: {
				trackingActiveAccount:
					rows.get(getAddressPrefix(key.account).toLowerCase()) ?? null,
			},
		}));
	};
	const factories = async (
		keys: FactoryKey[],
		source: SubgraphQuerySource,
		currentSource: CurrentSource,
	) => {
		const first = keys[0];
		if (!first) return [];
		if (sourceKey(await currentSource()) !== sourceKey(source))
			throw new SubgraphUnavailableError("source-changed", first.chainId);
		const rows = await querySubgraphFactories(
			first.chainId,
			keys.map((key) => key.address),
			source,
			options,
			currentSource,
		);
		return keys.map((key) => rows.get(key.address.toLowerCase()));
	};
	return ((name, fn, target, context) => {
		if (name === "queryAccountVaults" || name === "queryVaultFactories") {
			const query =
				name === "queryAccountVaults"
					? cacheBySource(name, accounts, target, context)
					: cacheBySource(name, factories, target, context);
			sourceQueries.add(query);
			return query;
		}
		return buildQuery(name, fn, target, context);
	}) as BuildQueryFn;
}
