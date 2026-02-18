/**
 * A function that wraps a query function, returning a decorated version.
 * Used to inject logging, caching, profiling, etc. into all queries globally.
 *
 * @param queryName - The name of the query property (e.g. "queryVaultInfoFull")
 * @param fn - The original query function
 * @returns A wrapped version of the query function
 */
export type BuildQueryFn = <T extends (...args: any[]) => Promise<any>>(
  queryName: string,
  fn: T,
  target: object,
) => T;

/**
 * Applies a buildQuery decorator to all `query*` properties on a target object.
 * Call this at the end of a constructor to decorate all queries.
 */
export function applyBuildQuery(target: object, buildQuery: BuildQueryFn): void {
  for (const key of Object.getOwnPropertyNames(target)) {
    if (key.startsWith("query") && typeof (target as any)[key] === "function") {
      (target as any)[key] = buildQuery(key, (target as any)[key], target);
    }
  }
}
