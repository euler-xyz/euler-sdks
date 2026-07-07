/**
 * A function that wraps a query function, returning a decorated version.
 * Used to inject logging, caching, profiling, etc. into all queries globally.
 *
 * @param queryName - The name of the query property (e.g. "queryEVaultInfoFull")
 * @param fn - The original query function
 * @returns A wrapped version of the query function
 */
export interface BuildQueryContext {
	getCacheKey: (args: unknown[]) => string | null;
}

export type BuildQueryFn = <T extends (...args: any[]) => Promise<any>>(
	queryName: string,
	fn: T,
	target: object,
	context?: BuildQueryContext,
) => T;

export interface QueryCacheConfig {
	enabled?: boolean;
	ttlMs?: number;
	failureTtlMs?: number;
}

const DEFAULT_QUERY_CACHE_TTL_MS = 5_000;
const DEFAULT_QUERY_FAILURE_TTL_MS = 5_000;

function normalizeAddress(value: string): string {
	if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
		return value.toLowerCase();
	}
	return value;
}

function normalizeHex(value: string): string {
	if (/^0x[0-9a-fA-F]+$/.test(value)) {
		return value.toLowerCase();
	}
	return value;
}

export function normalizeQueryKeyValue(value: unknown): unknown {
	if (typeof value === "bigint") {
		return { __type: "bigint", value: value.toString() };
	}
	if (typeof value === "function") return "[function]";
	if (typeof value === "undefined") return { __type: "undefined" };
	if (typeof value === "string") return normalizeAddress(normalizeHex(value));
	if (
		value !== null &&
		typeof value === "object" &&
		"chain" in value &&
		"transport" in value
	) {
		const client = value as { chain?: { id?: number } };
		return { __type: "publicClient", chainId: client.chain?.id ?? "unknown" };
	}
	if (Array.isArray(value)) return value.map(normalizeQueryKeyValue);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, normalizeQueryKeyValue(entry)]),
		);
	}
	return value;
}

export function normalizeQueryKeySet(value: unknown[]): unknown[] {
	const entries = new Map<string, unknown>();
	for (const entry of value.map(normalizeQueryKeyValue)) {
		entries.set(JSON.stringify(entry) ?? String(entry), entry);
	}
	return Array.from(entries.entries())
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, entry]) => entry);
}

export function normalizeQueryKeyObjectSets(value: object): object {
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [
				key,
				Array.isArray(entry)
					? normalizeQueryKeySet(entry)
					: normalizeQueryKeyValue(entry),
			]),
	);
}

export function serializeQueryArgs(args: unknown[]): string | null {
	try {
		return JSON.stringify(args.map(normalizeQueryKeyValue));
	} catch {
		return null;
	}
}

export function getEulerSdkQueryKey(
	_queryName: string,
	args: unknown[],
): string | null {
	return serializeQueryArgs(args);
}

export function createQueryCacheBuildQuery(
	config?: QueryCacheConfig,
): BuildQueryFn {
	const enabled = config?.enabled ?? true;
	const ttlMs = config?.ttlMs ?? DEFAULT_QUERY_CACHE_TTL_MS;
	const failureTtlMs = config?.failureTtlMs ?? DEFAULT_QUERY_FAILURE_TTL_MS;

	return <T extends (...args: any[]) => Promise<any>>(
		queryName: string,
		fn: T,
		_target: object,
		context?: BuildQueryContext,
	): T => {
		if (!enabled || ttlMs <= 0) return fn;

		const cache = new Map<
			string,
			{
				expiresAt: number;
				value?: Awaited<ReturnType<T>>;
				promise?: Promise<Awaited<ReturnType<T>>>;
				error?: unknown;
			}
		>();

		const wrapped = (async (...args: Parameters<T>) => {
			const cacheKey =
				context?.getCacheKey(args) ?? getEulerSdkQueryKey(queryName, args);
			if (cacheKey === null) {
				return fn(...args);
			}

			const now = Date.now();
			const cached = cache.get(cacheKey);
			if (cached && cached.expiresAt > now) {
				if (cached.promise) return cached.promise;
				if ("value" in cached) return cached.value as Awaited<ReturnType<T>>;
				if ("error" in cached) throw cached.error;
			}

			const promise = fn(...args)
				.then((value) => {
					cache.set(cacheKey, {
						expiresAt: Date.now() + ttlMs,
						value,
					});
					return value;
				})
				.catch((error) => {
					const current = cache.get(cacheKey);
					if (current?.promise === promise) {
						if (failureTtlMs > 0) {
							cache.set(cacheKey, {
								error,
								expiresAt: Date.now() + failureTtlMs,
							});
						} else {
							cache.delete(cacheKey);
						}
					}
					throw error;
				});

			cache.set(cacheKey, {
				expiresAt: now + ttlMs,
				promise,
			});

			return promise;
		}) as T;

		return wrapped;
	};
}

/**
 * Applies a buildQuery decorator to all `query*` properties on a target object.
 * Call this at the end of a constructor to decorate all queries.
 */
export function applyBuildQuery(
	target: object,
	buildQuery: BuildQueryFn,
): void {
	for (const key of Object.getOwnPropertyNames(target)) {
		if (key.startsWith("query") && typeof (target as any)[key] === "function") {
			const getQueryKeyName = `getQueryKey${key.slice("query".length)}`;
			const getQueryKey = (target as any)[getQueryKeyName];
			(target as any)[key] = buildQuery(key, (target as any)[key], target, {
				getCacheKey: (args) =>
					typeof getQueryKey === "function"
						? getQueryKey.apply(target, args)
						: getEulerSdkQueryKey(key, args),
			});
		}
	}
}
