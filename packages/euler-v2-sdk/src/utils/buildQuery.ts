/**
 * A function that wraps a query function, returning a decorated version.
 * Used to inject logging, caching, profiling, etc. into all queries globally.
 *
 * @param queryName - The name of the query property (e.g. "queryEVaultInfoFull")
 * @param fn - The original query function
 * @returns A wrapped version of the query function
 */
export type BuildQueryFn = <T extends (...args: any[]) => Promise<any>>(
	queryName: string,
	fn: T,
	target: object,
) => T;

export interface QueryCacheConfig {
	enabled?: boolean;
	ttlMs?: number;
}

const DEFAULT_QUERY_CACHE_TTL_MS = 5_000;

export function serializeQueryArgs(args: unknown[]): string | null {
	try {
		return JSON.stringify(args, (_key, value) => {
			if (typeof value === "bigint") {
				return { __type: "bigint", value: value.toString() };
			}
			if (typeof value === "function") return "[function]";
			return value;
		});
	} catch {
		return null;
	}
}

export function createQueryCacheBuildQuery(
	config?: QueryCacheConfig,
): BuildQueryFn {
	const enabled = config?.enabled ?? true;
	const ttlMs = config?.ttlMs ?? DEFAULT_QUERY_CACHE_TTL_MS;

	return <T extends (...args: any[]) => Promise<any>>(
		_queryName: string,
		fn: T,
		_target: object,
	): T => {
		if (!enabled || ttlMs <= 0) return fn;

		const cache = new Map<
			string,
			{
				expiresAt: number;
				value?: Awaited<ReturnType<T>>;
				promise?: Promise<Awaited<ReturnType<T>>>;
			}
		>();

		const wrapped = (async (...args: Parameters<T>) => {
			const cacheKey = serializeQueryArgs(args);
			if (cacheKey === null) {
				return fn(...args);
			}

			const now = Date.now();
			const cached = cache.get(cacheKey);
			if (cached && cached.expiresAt > now) {
				if (cached.promise) return cached.promise;
				if ("value" in cached) return cached.value as Awaited<ReturnType<T>>;
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
						cache.delete(cacheKey);
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
			(target as any)[key] = buildQuery(key, (target as any)[key], target);
		}
	}
}
