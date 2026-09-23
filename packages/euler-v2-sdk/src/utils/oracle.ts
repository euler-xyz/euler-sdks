import {
	decodeAbiParameters,
	type Address,
	type Hex,
	isHex,
	toHex,
} from "viem";

export type OracleInfo = {
	oracle: Address;
	name: string;
};

export type OracleDetailedInfo = {
	oracle: Address;
	name: string;
	oracleInfo: Hex;
};

export interface OraclePrice {
	queryFailure: boolean;
	queryFailureReason: Hex;
	amountIn: bigint;
	amountOutMid: bigint;
	amountOutBid: bigint;
	amountOutAsk: bigint;
	timestamp: number;
}

export type EulerRouterInfo = {
	governor: Address;
	fallbackOracle: Address;
	fallbackOracleInfo: OracleDetailedInfo;
	bases: Address[];
	quotes: Address[];
	resolvedAssets: Address[][];
	resolvedOracles: Address[];
	resolvedOraclesInfo: OracleDetailedInfo[];
};

export type CrossAdapterInfo = {
	base: Address;
	cross: Address;
	quote: Address;
	oracleBaseCross: Address;
	oracleCrossQuote: Address;
	oracleBaseCrossInfo: OracleDetailedInfo;
	oracleCrossQuoteInfo: OracleDetailedInfo;
};

export type PythOracleInfo = {
	pyth: Address;
	base: Address;
	quote: Address;
	feedId: Hex;
	maxStaleness: bigint;
	maxConfWidth: bigint;
};

export type PythFeed = {
	pythAddress: Address;
	feedId: Hex;
};

export type OracleAdapterEntry = {
	oracle: Address;
	name: string;
	base: Address;
	quote: Address;
	pythDetail?: PythOracleInfo;
	chainlinkDetail?: { oracle: Address };
};

/** A leaf oracle contract call in an effective price route. */
export type OracleRouteAdapterStep = {
	kind: "adapter";
	oracle: Address;
	name: string;
	base: Address;
	quote: Address;
	pythDetail?: PythOracleInfo;
	chainlinkDetail?: { oracle: Address };
};

/**
 * An ERC4626-style vault/share unwrapping hop in an effective price route.
 *
 * This is not a PriceOracle adapter. Consumers can still display and quote it
 * like the other route steps by calling `convertToAssets` on `vault`.
 */
export type OracleRouteVaultStep = {
	kind: "vault";
	oracle: Address;
	name: "ERC4626Vault";
	base: Address;
	quote: Address;
	vault: Address;
	asset: Address;
};

export type OracleRouteStep = OracleRouteAdapterStep | OracleRouteVaultStep;

/**
 * Where a route came from while resolving the root oracle info.
 *
 * configured: an explicit EulerRouter `base -> quote` entry.
 * fallback: the EulerRouter fallback oracle handled the requested pair.
 * direct: the root oracle info itself handled the requested pair.
 */
export type OracleRouteSource = "configured" | "fallback" | "direct";

/**
 * Effective ordered oracle route for one `base -> quote` pair.
 *
 * `steps` is the consumer surface: walk it in order to display or quote the
 * complete route. Use `getOracleRouteAdapters` or
 * `getOracleRouteResolvedVaults` when a caller needs the older projections.
 */
export type OracleRoute = {
	base: Address;
	quote: Address;
	steps: OracleRouteStep[];
	source: OracleRouteSource;
};

/**
 * A vault-address price route configured on EulerRouter.
 *
 * Some routers price an ERC4626/EVault share token by resolving it to the
 * vault's underlying asset path instead of using a leaf oracle adapter for the
 * vault address itself. `resolvedAssets` is that unwrap chain, not necessarily
 * the full price path to `quote`.
 *
 * vault: the base being priced, usually a collateral vault/share token address.
 * quote: the target denomination, i.e. the EVault unitOfAccount.
 * asset: the first underlying asset the router resolves the vault into.
 * resolvedAssets: the recursive ERC4626 unwrap chain from vault toward something the router can price against quote.
 */
export type OracleResolvedVault = {
	vault: Address;
	quote: Address;
	asset: Address;
	resolvedAssets: Address[];
};

function oracleAdapterStableRepr(
	value:
		| OracleAdapterEntry
		| OracleRoute
		| OracleRouteStep
		| OracleResolvedVault
		| PythOracleInfo
		| { oracle: Address }
		| Address
		| Hex
		| bigint
		| string
		| null
		| undefined,
): unknown {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "bigint")
		return { __type: "bigint", value: value.toString() };
	if (Array.isArray(value))
		return value.map((entry) => oracleAdapterStableRepr(entry));
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			const nested = oracleAdapterStableRepr(
				(value as Record<string, unknown>)[key] as
					| OracleAdapterEntry
					| OracleRoute
					| OracleRouteStep
					| OracleResolvedVault
					| PythOracleInfo
					| { oracle: Address }
					| Address
					| Hex
					| bigint
					| string
					| null
					| undefined,
			);
			if (nested !== undefined) out[key] = nested;
		}
		return out;
	}

	return value;
}

export function getOracleAdapterSortKey(adapter: OracleAdapterEntry): string {
	return JSON.stringify(oracleAdapterStableRepr(adapter));
}

export function sortOracleAdapters(
	adapters: OracleAdapterEntry[],
): OracleAdapterEntry[] {
	return [...adapters].sort((left, right) =>
		getOracleAdapterSortKey(left).localeCompare(getOracleAdapterSortKey(right)),
	);
}

export function oracleRouteAdapterStepToAdapter(
	step: OracleRouteAdapterStep,
): OracleAdapterEntry {
	return {
		oracle: step.oracle,
		name: step.name,
		base: step.base,
		quote: step.quote,
		...(step.pythDetail ? { pythDetail: step.pythDetail } : {}),
		...(step.chainlinkDetail ? { chainlinkDetail: step.chainlinkDetail } : {}),
	};
}

export function getOracleRouteAdapters(
	routeOrSteps: OracleRoute | readonly OracleRouteStep[] | null | undefined,
): OracleAdapterEntry[] {
	if (!routeOrSteps) return [];
	const steps = "steps" in routeOrSteps ? routeOrSteps.steps : routeOrSteps;
	if (!steps?.length) return [];
	return sortOracleAdapters(
		steps
			.filter((step): step is OracleRouteAdapterStep => step.kind === "adapter")
			.map(oracleRouteAdapterStepToAdapter),
	);
}

export function getOracleRouteResolvedVaults(
	route: OracleRoute | null | undefined,
): OracleResolvedVault[] {
	if (!route?.steps.length) return [];
	return sortOracleResolvedVaults(
		route.steps
			.filter((step): step is OracleRouteVaultStep => step.kind === "vault")
			.map((step) => ({
				vault: step.vault,
				quote: route.quote,
				asset: step.asset,
				resolvedAssets: [step.asset],
			})),
	);
}

export function sortOracleResolvedVaults(
	resolvedVaults: OracleResolvedVault[],
): OracleResolvedVault[] {
	const makeKey = (resolvedVault: OracleResolvedVault) =>
		JSON.stringify(oracleAdapterStableRepr(resolvedVault));
	return [...resolvedVaults].sort((left, right) =>
		makeKey(left).localeCompare(makeKey(right)),
	);
}

const isChainlinkOracleName = (name: string) =>
	name.toLowerCase().includes("chainlink");
const isCrossAdapterName = (name: string) =>
	name.toLowerCase() === "crossadapter";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const isValidOracleDetailedInfo = (
	info: OracleDetailedInfo | null | undefined,
): info is OracleDetailedInfo => {
	if (!info) return false;
	if (typeof info.name !== "string" || info.name.trim().length === 0)
		return false;
	if (
		typeof info.oracle !== "string" ||
		info.oracle.toLowerCase() === ZERO_ADDRESS
	)
		return false;
	if (typeof info.oracleInfo !== "string") return false;
	return true;
};

type OracleAdapterOptions = {
	base?: Address;
	quote?: Address;
	leafOnly?: boolean;
};

const ORACLE_DETAILED_INFO_COMPONENTS = [
	{ name: "oracle", type: "address" },
	{ name: "name", type: "string" },
	{ name: "oracleInfo", type: "bytes" },
] as const;

const EULER_ROUTER_COMPONENTS = [
	{ name: "governor", type: "address" },
	{ name: "fallbackOracle", type: "address" },
	{
		name: "fallbackOracleInfo",
		type: "tuple",
		components: ORACLE_DETAILED_INFO_COMPONENTS,
	},
	{ name: "bases", type: "address[]" },
	{ name: "quotes", type: "address[]" },
	{ name: "resolvedAssets", type: "address[][]" },
	{ name: "resolvedOracles", type: "address[]" },
	{
		name: "resolvedOraclesInfo",
		type: "tuple[]",
		components: ORACLE_DETAILED_INFO_COMPONENTS,
	},
] as const;

const CROSS_ADAPTER_COMPONENTS = [
	{ name: "base", type: "address" },
	{ name: "cross", type: "address" },
	{ name: "quote", type: "address" },
	{ name: "oracleBaseCross", type: "address" },
	{ name: "oracleCrossQuote", type: "address" },
	{
		name: "oracleBaseCrossInfo",
		type: "tuple",
		components: ORACLE_DETAILED_INFO_COMPONENTS,
	},
	{
		name: "oracleCrossQuoteInfo",
		type: "tuple",
		components: ORACLE_DETAILED_INFO_COMPONENTS,
	},
] as const;

const PYTH_ORACLE_COMPONENTS = [
	{ name: "pyth", type: "address" },
	{ name: "base", type: "address" },
	{ name: "quote", type: "address" },
	{ name: "feedId", type: "bytes32" },
	{ name: "maxStaleness", type: "uint256" },
	{ name: "maxConfWidth", type: "uint256" },
] as const;

const normalizeHex = (value: Hex | string | Uint8Array): Hex => {
	if (typeof value === "string") {
		return (isHex(value) ? value : `0x${value}`) as Hex;
	}
	return toHex(value);
};

/**
 * The same encoded `oracleInfo` blob is decoded repeatedly: once per collateral
 * pair (plus the debt route) inside a single `convertVaultInfoFullToIEVault`,
 * and again on every portfolio refetch. `decodeAbiParameters` over the nested
 * EulerRouter tuple is the dominant cost. These decoders are pure functions of
 * the encoded bytes, so memoize by the normalized hex. The returned objects are
 * shared by reference and must be treated as read-only by callers. Bounded so a
 * long-lived session can't grow the cache without limit (oldest-out eviction).
 */
const DECODE_CACHE_MAX = 1024;
const memoizeHexDecode = <T>(
	decode: (hex: Hex) => T,
): ((oracleInfo: Hex | string | Uint8Array) => T) => {
	const cache = new Map<Hex, T>();
	return (oracleInfo) => {
		const hex = normalizeHex(oracleInfo);
		if (cache.has(hex)) return cache.get(hex) as T;
		const value = decode(hex);
		cache.set(hex, value);
		if (cache.size > DECODE_CACHE_MAX) {
			const oldest = cache.keys().next().value;
			if (oldest !== undefined) cache.delete(oldest);
		}
		return value;
	};
};

export const decodeEulerRouterInfo = memoizeHexDecode<EulerRouterInfo | null>(
	(hex) => {
		try {
			const [decoded] = decodeAbiParameters(
				[{ type: "tuple", components: EULER_ROUTER_COMPONENTS }],
				hex,
			);
			return decoded as EulerRouterInfo;
		} catch {
			return null;
		}
	},
);

export const decodeCrossAdapterInfo = memoizeHexDecode<CrossAdapterInfo | null>(
	(hex) => {
		try {
			const [decoded] = decodeAbiParameters(
				[{ type: "tuple", components: CROSS_ADAPTER_COMPONENTS }],
				hex,
			);
			return decoded as CrossAdapterInfo;
		} catch {
			return null;
		}
	},
);

export const decodePythOracleInfo = memoizeHexDecode<PythOracleInfo | null>(
	(hex) => {
		try {
			const [decoded] = decodeAbiParameters(
				[{ type: "tuple", components: PYTH_ORACLE_COMPONENTS }],
				hex,
			);
			return decoded as PythOracleInfo;
		} catch {
			return null;
		}
	},
);

export const collectPythFeedIds = (
	oracleInfo: OracleDetailedInfo | null | undefined,
	maxDepth = 3,
): PythFeed[] => {
	const feeds: PythFeed[] = [];
	const visited = new Set<string>();

	const visit = (
		info: OracleDetailedInfo | null | undefined,
		depth: number,
	) => {
		if (!info || depth > maxDepth) return;
		const key = `${info.oracle}-${info.name}-${info.oracleInfo}`;
		if (visited.has(key)) return;
		visited.add(key);

		if (info.name === "PythOracle") {
			const decoded = decodePythOracleInfo(info.oracleInfo);
			if (decoded) {
				feeds.push({
					pythAddress: decoded.pyth,
					feedId: normalizeHex(decoded.feedId),
				});
			}
			return;
		}

		if (info.name === "EulerRouter") {
			const decoded = decodeEulerRouterInfo(info.oracleInfo);
			if (!decoded) return;
			visit(decoded.fallbackOracleInfo, depth + 1);
			decoded.resolvedOraclesInfo?.forEach((child) => visit(child, depth + 1));
			return;
		}

		if (info.name === "CrossAdapter") {
			const decoded = decodeCrossAdapterInfo(info.oracleInfo);
			if (!decoded) return;
			visit(decoded.oracleBaseCrossInfo, depth + 1);
			visit(decoded.oracleCrossQuoteInfo, depth + 1);
		}
	};

	visit(oracleInfo, 0);

	const deduped = new Map<string, PythFeed>();
	feeds.forEach((feed) => {
		const key = `${feed.pythAddress.toLowerCase()}:${feed.feedId.toLowerCase()}`;
		if (!deduped.has(key)) {
			deduped.set(key, feed);
		}
	});

	return [...deduped.values()];
};

type OracleAdapterContext = {
	base?: Address;
	quote?: Address;
};

const resolveAdapterPair = (
	context: OracleAdapterContext,
	override?: OracleAdapterContext,
) => {
	const base = override?.base ?? context.base;
	const quote = override?.quote ?? context.quote;
	if (!base || !quote) return null;
	return { base, quote };
};

const routeKey = (route: Pick<OracleRoute, "base" | "quote" | "source">) =>
	`${route.source}:${route.base.toLowerCase()}:${route.quote.toLowerCase()}`;

const makeOracleAdapterEntry = (
	info: OracleDetailedInfo,
	context: OracleAdapterContext,
	override?: OracleAdapterContext,
): OracleAdapterEntry | null => {
	const pair = resolveAdapterPair(context, override);
	if (!pair) return null;
	const extra = isChainlinkOracleName(info.name)
		? { chainlinkDetail: { oracle: info.oracle } }
		: undefined;
	return {
		oracle: info.oracle,
		name: info.name,
		base: pair.base,
		quote: pair.quote,
		...extra,
	};
};

const makeRouteAdapterStep = (
	info: OracleDetailedInfo,
	context: Required<OracleAdapterContext>,
): OracleRouteAdapterStep | null => {
	if (info.name === "PythOracle") {
		const decoded = decodePythOracleInfo(info.oracleInfo);
		if (decoded) {
			const decodedBase = decoded.base.toLowerCase();
			const decodedQuote = decoded.quote.toLowerCase();
			const contextBase = context.base.toLowerCase();
			const contextQuote = context.quote.toLowerCase();
			if (
				!(
					(decodedBase === contextBase && decodedQuote === contextQuote) ||
					(decodedBase === contextQuote && decodedQuote === contextBase)
				)
			) {
				return null;
			}
			const adapter: OracleAdapterEntry = {
				oracle: info.oracle,
				name: info.name,
				base: decoded.base,
				quote: decoded.quote,
				pythDetail: decoded,
			};
			return {
				kind: "adapter",
				oracle: adapter.oracle,
				name: adapter.name,
				base: adapter.base,
				quote: adapter.quote,
				pythDetail: adapter.pythDetail,
			};
		}
	}

	const adapter = makeOracleAdapterEntry(info, context);
	if (!adapter) return null;
	return {
		kind: "adapter",
		oracle: adapter.oracle,
		name: adapter.name,
		base: adapter.base,
		quote: adapter.quote,
		...(adapter.pythDetail ? { pythDetail: adapter.pythDetail } : {}),
		...(adapter.chainlinkDetail
			? { chainlinkDetail: adapter.chainlinkDetail }
			: {}),
	};
};

const buildVaultRouteSteps = (
	resolvedAssets: Address[] | undefined,
	base: Address | undefined,
): OracleRouteVaultStep[] => {
	if (!base || !resolvedAssets?.length) return [];
	const path =
		resolvedAssets.length >= 2
			? [...resolvedAssets]
			: [base, ...resolvedAssets];
	const steps: OracleRouteVaultStep[] = [];
	for (let i = 0; i < path.length - 1; i += 1) {
		const vault = path[i]!;
		const asset = path[i + 1]!;
		if (vault.toLowerCase() === asset.toLowerCase()) continue;
		steps.push({
			kind: "vault",
			oracle: vault,
			name: "ERC4626Vault",
			base: vault,
			quote: asset,
			vault,
			asset,
		});
	}
	return steps;
};

const makeRoute = (
	base: Address,
	quote: Address,
	steps: OracleRouteStep[],
	source: OracleRouteSource,
): OracleRoute => {
	return { base, quote, steps, source };
};

export const selectOracleRouteForPair = (
	routes: OracleRoute[] | undefined,
	base: Address,
	quote: Address,
): OracleRoute | undefined => {
	const baseKey = base.toLowerCase();
	const quoteKey = quote.toLowerCase();
	return routes?.find(
		(route) =>
			route.base.toLowerCase() === baseKey &&
			route.quote.toLowerCase() === quoteKey,
	);
};

export const decodeOracleRouteForPair = (
	oracleInfo: OracleDetailedInfo | null | undefined,
	base: Address,
	quote: Address,
	maxDepth = 3,
): OracleRoute | undefined => {
	const visited = new Set<string>();

	const visit = (
		info: OracleDetailedInfo | null | undefined,
		depth: number,
		context: Required<OracleAdapterContext>,
		source: OracleRouteSource,
	): { steps: OracleRouteStep[]; source: OracleRouteSource } | null => {
		if (!isValidOracleDetailedInfo(info) || depth > maxDepth) return null;
		const key = `${info.oracle}-${info.name}-${info.oracleInfo}-${context.base}-${context.quote}`;
		if (visited.has(key)) return null;
		visited.add(key);

		if (info.name === "EulerRouter") {
			const decoded = decodeEulerRouterInfo(info.oracleInfo);
			if (!decoded) return null;
			const targetBase = context.base.toLowerCase();
			const targetQuote = context.quote.toLowerCase();
			const total = Math.max(
				decoded.resolvedOraclesInfo?.length ?? 0,
				decoded.bases?.length ?? 0,
				decoded.quotes?.length ?? 0,
			);
			for (let i = 0; i < total; i += 1) {
				const child = decoded.resolvedOraclesInfo?.[i];
				const childBase = decoded.bases?.[i];
				const childQuote = decoded.quotes?.[i];
				if (!child || !childBase || !childQuote) continue;
				if (
					childBase.toLowerCase() !== targetBase ||
					childQuote.toLowerCase() !== targetQuote
				) {
					continue;
				}

				const vaultSteps = buildVaultRouteSteps(
					decoded.resolvedAssets?.[i],
					childBase,
				);
				const effectiveBase = vaultSteps.at(-1)?.quote ?? childBase;
				const childRoute = visit(
					child,
					depth + 1,
					{ base: effectiveBase, quote: childQuote },
					"configured",
				);
				if (childRoute) {
					return {
						steps: [...vaultSteps, ...childRoute.steps],
						source: "configured",
					};
				}
				if (
					vaultSteps.length > 0 &&
					effectiveBase.toLowerCase() === childQuote.toLowerCase()
				) {
					return { steps: vaultSteps, source: "configured" };
				}
			}

			const fallbackRoute = visit(
				decoded.fallbackOracleInfo,
				depth + 1,
				context,
				"fallback",
			);
			return fallbackRoute;
		}

		if (info.name === "CrossAdapter") {
			const decoded = decodeCrossAdapterInfo(info.oracleInfo);
			if (!decoded) {
				const adapterStep = makeRouteAdapterStep(info, context);
				return adapterStep ? { steps: [adapterStep], source } : null;
			}
			if (
				decoded.base.toLowerCase() !== context.base.toLowerCase() ||
				decoded.quote.toLowerCase() !== context.quote.toLowerCase()
			) {
				return null;
			}
			const baseCross = visit(
				decoded.oracleBaseCrossInfo,
				depth + 1,
				{ base: decoded.base, quote: decoded.cross },
				source,
			);
			const crossQuote = visit(
				decoded.oracleCrossQuoteInfo,
				depth + 1,
				{ base: decoded.cross, quote: decoded.quote },
				source,
			);
			const steps = [...(baseCross?.steps ?? []), ...(crossQuote?.steps ?? [])];
			if (steps.length > 0) return { steps, source };
			const adapterStep = makeRouteAdapterStep(info, context);
			return adapterStep ? { steps: [adapterStep], source } : null;
		}

		const adapterStep = makeRouteAdapterStep(info, context);
		return adapterStep ? { steps: [adapterStep], source } : null;
	};

	const route = visit(oracleInfo, 0, { base, quote }, "direct");
	if (!route || route.steps.length === 0) return undefined;
	return makeRoute(base, quote, route.steps, route.source);
};

export const decodeOracleRoutes = (
	oracleInfo: OracleDetailedInfo | null | undefined,
	maxDepth = 3,
): OracleRoute[] => {
	if (!isValidOracleDetailedInfo(oracleInfo)) return [];
	const routes: OracleRoute[] = [];

	if (oracleInfo.name === "EulerRouter") {
		const decoded = decodeEulerRouterInfo(oracleInfo.oracleInfo);
		if (!decoded) return [];
		const total = Math.max(
			decoded.resolvedOraclesInfo?.length ?? 0,
			decoded.bases?.length ?? 0,
			decoded.quotes?.length ?? 0,
		);
		for (let i = 0; i < total; i += 1) {
			const base = decoded.bases?.[i];
			const quote = decoded.quotes?.[i];
			if (!base || !quote) continue;
			const route = decodeOracleRouteForPair(oracleInfo, base, quote, maxDepth);
			if (route) routes.push(route);
		}
	} else if (oracleInfo.name === "CrossAdapter") {
		const decoded = decodeCrossAdapterInfo(oracleInfo.oracleInfo);
		if (decoded) {
			const route = decodeOracleRouteForPair(
				oracleInfo,
				decoded.base,
				decoded.quote,
				maxDepth,
			);
			if (route) routes.push(route);
		}
	} else if (oracleInfo.name === "PythOracle") {
		const decoded = decodePythOracleInfo(oracleInfo.oracleInfo);
		if (decoded) {
			const route = decodeOracleRouteForPair(
				oracleInfo,
				decoded.base,
				decoded.quote,
				maxDepth,
			);
			if (route) routes.push(route);
		}
	}

	const deduped = new Map<string, OracleRoute>();
	for (const route of routes) {
		const key = routeKey(route);
		if (!deduped.has(key)) deduped.set(key, route);
	}
	return [...deduped.values()];
};

export const decodeOracleInfo = (
	oracleInfo: OracleDetailedInfo | null | undefined,
	maxDepth = 3,
	options: OracleAdapterOptions = {},
): OracleAdapterEntry[] => {
	const adapters: OracleAdapterEntry[] = [];
	const visited = new Set<string>();
	const leafOnly = options.leafOnly ?? false;
	const rootFallbackPair =
		resolveAdapterPair({
			base: options.base,
			quote: options.quote,
		}) ?? undefined;

	const addAdapter = (
		info: OracleDetailedInfo,
		base: Address,
		quote: Address,
		extra?: Pick<OracleAdapterEntry, "pythDetail" | "chainlinkDetail">,
	) => {
		adapters.push({
			oracle: info.oracle,
			name: info.name,
			base,
			quote,
			...extra,
		});
	};

	const visit = (
		info: OracleDetailedInfo | null | undefined,
		depth: number,
		context: OracleAdapterContext,
	) => {
		if (!isValidOracleDetailedInfo(info) || depth > maxDepth) return;
		const key = `${info.oracle}-${info.name}-${info.oracleInfo}-${context.base || ""}-${context.quote || ""}`;
		if (visited.has(key)) return;
		visited.add(key);

		if (info.name === "EulerRouter") {
			const decoded = decodeEulerRouterInfo(info.oracleInfo);
			if (!decoded) return;
			const targetBase = context.base?.toLowerCase();
			const targetQuote = context.quote?.toLowerCase();
			let matched = false;
			const total = Math.max(
				decoded.resolvedOraclesInfo?.length ?? 0,
				decoded.bases?.length ?? 0,
				decoded.quotes?.length ?? 0,
			);
			for (let i = 0; i < total; i += 1) {
				const child = decoded.resolvedOraclesInfo?.[i];
				const base = decoded.bases?.[i];
				const quote = decoded.quotes?.[i];
				const resolvedAssets = decoded.resolvedAssets?.[i] ?? [];
				if (!child) continue;
				if (targetBase && targetQuote) {
					if (!base || !quote) continue;
					if (
						base.toLowerCase() !== targetBase ||
						quote.toLowerCase() !== targetQuote
					)
						continue;
					matched = true;
				}
				for (let j = 0; j < resolvedAssets.length - 1; j += 1) {
					addAdapter(
						{
							oracle: resolvedAssets[j]!,
							name: "ERC4626Vault",
							oracleInfo: "0x",
						},
						resolvedAssets[j]!,
						resolvedAssets[j + 1]!,
					);
				}
				visit(child, depth + 1, {
					base: resolvedAssets.at(-1) ?? base,
					quote,
				});
			}
			if (
				decoded.fallbackOracleInfo &&
				(!targetBase || !targetQuote || !matched)
			) {
				visit(decoded.fallbackOracleInfo, depth + 1, context);
			}
			return;
		}

		if (info.name === "CrossAdapter") {
			const decoded = decodeCrossAdapterInfo(info.oracleInfo);
			if (!decoded) return;
			if (!leafOnly) {
				addAdapter(info, decoded.base, decoded.quote);
			}
			visit(decoded.oracleBaseCrossInfo, depth + 1, {
				base: decoded.base,
				quote: decoded.cross,
			});
			visit(decoded.oracleCrossQuoteInfo, depth + 1, {
				base: decoded.cross,
				quote: decoded.quote,
			});
			return;
		}

		if (info.name === "PythOracle") {
			const decoded = decodePythOracleInfo(info.oracleInfo);
			const pair = resolveAdapterPair(
				context,
				decoded
					? { base: decoded.base, quote: decoded.quote }
					: depth === 0
						? rootFallbackPair
						: undefined,
			);
			if (pair) {
				addAdapter(
					info,
					pair.base,
					pair.quote,
					decoded ? { pythDetail: decoded } : undefined,
				);
			}
			return;
		}

		const pair = resolveAdapterPair(
			context,
			depth === 0 ? rootFallbackPair : undefined,
		);
		if (pair) {
			const extra = isChainlinkOracleName(info.name)
				? { chainlinkDetail: { oracle: info.oracle } }
				: undefined;
			addAdapter(info, pair.base, pair.quote, extra);
		}
	};

	visit(oracleInfo, 0, {});

	const deduped = new Map<string, OracleAdapterEntry>();
	adapters.forEach((adapter) => {
		const key = `${adapter.oracle.toLowerCase()}:${adapter.base.toLowerCase()}:${adapter.quote.toLowerCase()}`;
		if (!deduped.has(key)) {
			deduped.set(key, adapter);
		}
	});

	return [...deduped.values()];
};

export const decodeOracleResolvedVaults = (
	oracleInfo: OracleDetailedInfo | null | undefined,
	maxDepth = 3,
): OracleResolvedVault[] => {
	const resolvedVaults: OracleResolvedVault[] = [];
	const visited = new Set<string>();

	const visit = (
		info: OracleDetailedInfo | null | undefined,
		depth: number,
	) => {
		if (!isValidOracleDetailedInfo(info) || depth > maxDepth) return;
		const key = `${info.oracle}-${info.name}-${info.oracleInfo}`;
		if (visited.has(key)) return;
		visited.add(key);

		if (info.name === "EulerRouter") {
			const decoded = decodeEulerRouterInfo(info.oracleInfo);
			if (!decoded) return;
			const total = Math.max(
				decoded.bases?.length ?? 0,
				decoded.quotes?.length ?? 0,
				decoded.resolvedAssets?.length ?? 0,
				decoded.resolvedOraclesInfo?.length ?? 0,
			);
			for (let i = 0; i < total; i += 1) {
				const vault = decoded.bases?.[i];
				const quote = decoded.quotes?.[i];
				const resolvedAssets = decoded.resolvedAssets?.[i] ?? [];
				if (vault && quote && resolvedAssets.length > 0) {
					resolvedVaults.push({
						vault,
						quote,
						asset: resolvedAssets[0]!,
						resolvedAssets: [...resolvedAssets],
					});
				}
				visit(decoded.resolvedOraclesInfo?.[i], depth + 1);
			}
			visit(decoded.fallbackOracleInfo, depth + 1);
			return;
		}

		if (info.name === "CrossAdapter") {
			const decoded = decodeCrossAdapterInfo(info.oracleInfo);
			if (!decoded) return;
			visit(decoded.oracleBaseCrossInfo, depth + 1);
			visit(decoded.oracleCrossQuoteInfo, depth + 1);
		}
	};

	visit(oracleInfo, 0);

	const deduped = new Map<string, OracleResolvedVault>();
	resolvedVaults.forEach((resolvedVault) => {
		const key = `${resolvedVault.vault.toLowerCase()}:${resolvedVault.quote.toLowerCase()}:${resolvedVault.resolvedAssets
			.map((asset) => asset.toLowerCase())
			.join(":")}`;
		if (!deduped.has(key)) deduped.set(key, resolvedVault);
	});

	return sortOracleResolvedVaults([...deduped.values()]);
};

export const collectChainlinkOracles = (
	oracleInfo: OracleDetailedInfo | null | undefined,
	maxDepth = 3,
): Address[] => {
	const oracles: Address[] = [];
	const visited = new Set<string>();

	const visit = (
		info: OracleDetailedInfo | null | undefined,
		depth: number,
	) => {
		if (!info || depth > maxDepth) return;
		const key = `${info.oracle}-${info.name}-${info.oracleInfo}`;
		if (visited.has(key)) return;
		visited.add(key);

		if (isChainlinkOracleName(info.name)) {
			oracles.push(info.oracle);
			return;
		}

		if (info.name === "EulerRouter") {
			const decoded = decodeEulerRouterInfo(info.oracleInfo);
			if (!decoded) return;
			visit(decoded.fallbackOracleInfo, depth + 1);
			decoded.resolvedOraclesInfo?.forEach((child) => visit(child, depth + 1));
			return;
		}

		if (info.name === "CrossAdapter") {
			const decoded = decodeCrossAdapterInfo(info.oracleInfo);
			if (!decoded) return;
			visit(decoded.oracleBaseCrossInfo, depth + 1);
			visit(decoded.oracleCrossQuoteInfo, depth + 1);
		}
	};

	visit(oracleInfo, 0);

	const deduped = new Map<string, Address>();
	oracles.forEach((oracle) => {
		const key = oracle.toLowerCase();
		if (!deduped.has(key)) {
			deduped.set(key, oracle);
		}
	});

	return [...deduped.values()];
};

/**
 * Walk an OracleDetailedInfo tree for the active price path of (base, quote)
 * and collect only the Pyth feed IDs actually used to price that pair.
 *
 * Unlike collectPythFeedIds (which returns every Pyth feed anywhere in the
 * tree) this avoids pulling Hermes updates for fallback routes that aren't
 * exercised during a given operation.
 */
export const collectPythFeedIdsForPair = (
	oracleInfo: OracleDetailedInfo | null | undefined,
	base: Address,
	quote: Address,
	maxDepth = 3,
): PythFeed[] => {
	const feeds: PythFeed[] = [];
	const visited = new Set<string>();

	const visit = (
		info: OracleDetailedInfo | null | undefined,
		depth: number,
		context: OracleAdapterContext,
	) => {
		if (!info || depth > maxDepth) return;
		const key = `${info.oracle}-${info.name}-${info.oracleInfo}-${context.base || ""}-${context.quote || ""}`;
		if (visited.has(key)) return;
		visited.add(key);

		if (info.name === "EulerRouter") {
			const decoded = decodeEulerRouterInfo(info.oracleInfo);
			if (!decoded) return;
			const targetBase = context.base?.toLowerCase();
			const targetQuote = context.quote?.toLowerCase();
			let matched = false;
			const total = Math.max(
				decoded.resolvedOraclesInfo?.length ?? 0,
				decoded.bases?.length ?? 0,
				decoded.quotes?.length ?? 0,
			);
			for (let i = 0; i < total; i += 1) {
				const child = decoded.resolvedOraclesInfo?.[i];
				const childBase = decoded.bases?.[i];
				const childQuote = decoded.quotes?.[i];
				const resolvedAssets = decoded.resolvedAssets?.[i] ?? [];
				if (!child) continue;
				if (targetBase && targetQuote) {
					if (!childBase || !childQuote) continue;
					if (
						childBase.toLowerCase() !== targetBase ||
						childQuote.toLowerCase() !== targetQuote
					)
						continue;
					matched = true;
				}
				visit(child, depth + 1, {
					base: resolvedAssets.at(-1) ?? childBase,
					quote: childQuote,
				});
			}
			if (
				decoded.fallbackOracleInfo &&
				(!targetBase || !targetQuote || !matched)
			) {
				visit(decoded.fallbackOracleInfo, depth + 1, context);
			}
			return;
		}

		if (info.name === "CrossAdapter") {
			const decoded = decodeCrossAdapterInfo(info.oracleInfo);
			if (!decoded) return;
			visit(decoded.oracleBaseCrossInfo, depth + 1, {
				base: decoded.base,
				quote: decoded.cross,
			});
			visit(decoded.oracleCrossQuoteInfo, depth + 1, {
				base: decoded.cross,
				quote: decoded.quote,
			});
			return;
		}

		if (info.name === "PythOracle") {
			const decoded = decodePythOracleInfo(info.oracleInfo);
			const pair = resolveAdapterPair(
				context,
				decoded ? { base: decoded.base, quote: decoded.quote } : undefined,
			);
			if (decoded && pair) {
				feeds.push({
					pythAddress: decoded.pyth,
					feedId: normalizeHex(decoded.feedId),
				});
			}
		}
	};

	visit(oracleInfo, 0, { base, quote });

	const deduped = new Map<string, PythFeed>();
	for (const feed of feeds) {
		const key = `${feed.pythAddress.toLowerCase()}:${feed.feedId.toLowerCase()}`;
		if (!deduped.has(key)) deduped.set(key, feed);
	}
	return [...deduped.values()];
};

/**
 * Route-aware Pyth feed selection over already-decoded OracleAdapterEntry[].
 * Uses selectResolvedVaultAdaptersForPair / selectLeafAdaptersForPair to pick
 * only the adapters on the active (base, quote) route, then extracts Pyth
 * feeds from that subset.
 */
export const collectPythFeedsForPair = (
	adapters: OracleAdapterEntry[],
	resolvedVaults: OracleResolvedVault[] | undefined,
	base: Address,
	quote: Address,
): PythFeed[] => {
	const routeAdapters =
		resolvedVaults && resolvedVaults.length
			? selectResolvedVaultAdaptersForPair(
					adapters,
					resolvedVaults,
					base,
					quote,
				)
			: selectLeafAdaptersForPair(adapters, base, quote);
	return collectPythFeedsFromAdapters(routeAdapters);
};

/**
 * Extract unique PythFeed entries from already-decoded oracle adapters.
 * Use this instead of collectPythFeedIds when you have OracleAdapterEntry[].
 */
export const collectPythFeedsFromAdapters = (
	adapters: OracleAdapterEntry[],
): PythFeed[] => {
	const deduped = new Map<string, PythFeed>();
	for (const adapter of adapters) {
		if (!adapter.pythDetail) continue;
		const key = `${adapter.pythDetail.pyth.toLowerCase()}:${adapter.pythDetail.feedId.toLowerCase()}`;
		if (!deduped.has(key)) {
			deduped.set(key, {
				pythAddress: adapter.pythDetail.pyth,
				feedId: normalizeHex(adapter.pythDetail.feedId),
			});
		}
	}
	return [...deduped.values()];
};

/**
 * Extract unique PythFeed entries from route steps without requiring the
 * adapter projection to be stored on the vault.
 */
export const collectPythFeedsFromRouteSteps = (
	routeOrSteps: OracleRoute | readonly OracleRouteStep[] | null | undefined,
): PythFeed[] => collectPythFeedsFromAdapters(getOracleRouteAdapters(routeOrSteps));

/**
 * Select adapters representing leaf pricing route(s) for a base->quote pair.
 * Falls back to direct pair matches when no leaf route is found.
 */
export const selectLeafAdaptersForPair = (
	adapters: OracleAdapterEntry[],
	base: Address,
	quote: Address,
	maxDepth = 4,
): OracleAdapterEntry[] => {
	const baseKey = base.toLowerCase();
	const quoteKey = quote.toLowerCase();
	const directMatches = adapters.filter(
		(adapter) =>
			adapter.base.toLowerCase() === baseKey &&
			adapter.quote.toLowerCase() === quoteKey,
	);

	const leafCandidates = adapters.filter(
		(adapter) => !isCrossAdapterName(adapter.name),
	);
	if (leafCandidates.length === 0) return directMatches;

	const byBase = new Map<string, OracleAdapterEntry[]>();
	for (const adapter of leafCandidates) {
		const key = adapter.base.toLowerCase();
		const list = byBase.get(key) ?? [];
		list.push(adapter);
		byBase.set(key, list);
	}

	const used = new Set<string>();
	const makeKey = (adapter: OracleAdapterEntry) =>
		`${adapter.oracle.toLowerCase()}:${adapter.base.toLowerCase()}:${adapter.quote.toLowerCase()}`;

	const dfs = (
		current: string,
		depth: number,
		visiting: Set<string>,
	): boolean => {
		if (depth > maxDepth) return false;
		if (current === quoteKey) return true;
		if (visiting.has(current)) return false;
		visiting.add(current);

		const nextAdapters = byBase.get(current) ?? [];
		let found = false;
		for (const adapter of nextAdapters) {
			const next = adapter.quote.toLowerCase();
			const pathFound = dfs(next, depth + 1, visiting);
			if (pathFound) {
				used.add(makeKey(adapter));
				found = true;
			}
		}

		visiting.delete(current);
		return found;
	};

	const hasLeafRoute = dfs(baseKey, 0, new Set<string>());
	if (!hasLeafRoute || used.size === 0) return directMatches;

	return leafCandidates.filter((adapter) => used.has(makeKey(adapter)));
};

export const selectResolvedVaultAdaptersForPair = (
	adapters: OracleAdapterEntry[],
	resolvedVaults: OracleResolvedVault[],
	base: Address,
	quote: Address,
): OracleAdapterEntry[] => {
	const baseKey = base.toLowerCase();
	const quoteKey = quote.toLowerCase();
	const resolvedVault = resolvedVaults.find(
		(entry) =>
			entry.vault.toLowerCase() === baseKey &&
			entry.quote.toLowerCase() === quoteKey &&
			entry.resolvedAssets.length > 0,
	);

	if (!resolvedVault) {
		return sortOracleAdapters(selectLeafAdaptersForPair(adapters, base, quote));
	}

	const resolvedAssets = resolvedVault.resolvedAssets;
	const finalBase = resolvedAssets.at(-1);
	if (!finalBase) return [];

	const unwrapAdapters: OracleAdapterEntry[] = [];
	for (let i = 0; i < resolvedAssets.length - 1; i += 1) {
		unwrapAdapters.push({
			oracle: resolvedAssets[i]!,
			name: "ERC4626Vault",
			base: resolvedAssets[i]!,
			quote: resolvedAssets[i + 1]!,
		});
	}

	const finalAdapters = selectLeafAdaptersForPair(adapters, finalBase, quote);
	const vaultAdapters = selectLeafAdaptersForPair(adapters, base, quote);
	const rewrittenVaultAdapters = vaultAdapters.map((adapter) =>
		adapter.base.toLowerCase() === baseKey
			? { ...adapter, base: finalBase }
			: adapter,
	);

	const selectedFinalAdapters =
		finalAdapters.length > 0 ? finalAdapters : rewrittenVaultAdapters;

	const deduped = new Map<string, OracleAdapterEntry>();
	for (const adapter of [...unwrapAdapters, ...selectedFinalAdapters]) {
		const key = `${adapter.oracle.toLowerCase()}:${adapter.base.toLowerCase()}:${adapter.quote.toLowerCase()}`;
		if (!deduped.has(key)) deduped.set(key, adapter);
	}

	return [...deduped.values()];
};
