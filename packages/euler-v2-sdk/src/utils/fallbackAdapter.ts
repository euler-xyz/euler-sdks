import {
	type DataIssue,
	type ServiceResult,
	dataIssueLocation,
	serviceDiagnosticOwner,
} from "./entityDiagnostics.js";

/**
 * Why the fallback fired. Useful for telemetry: per-entity warnings
 * (`array-missing-slots`) look different from total-failures (`primary-threw`,
 * `result-undefined`) even though both surface as a fallback event.
 */
export type FallbackTrigger =
	| "primary-threw"
	| "result-undefined"
	| "array-missing-slots"
	| "custom-shouldFallback"
	| "circuit-open";

export interface FallbackInfo<TKey extends string = string> {
	method: TKey;
	args: unknown[];
	primaryName: string;
	secondaryName: string;
	/** Discriminator for what actually caused the fallback. */
	trigger: FallbackTrigger;
	/** Error thrown by primary, if it threw. Undefined when fallback was triggered by a result code. */
	primaryError?: unknown;
	/** Issues from a primary `ServiceResult`, if any. Undefined when primary threw or circuit was open. */
	primaryIssues?: DataIssue[];
	/**
	 * For `trigger === "array-missing-slots"`: indices in the primary result array
	 * that were `undefined`. Lets callers see which inputs the primary dropped.
	 */
	missingIndices?: number[];
}

export interface FallbackAdapterOptions<TKey extends string> {
	/** Method names on the adapter that should be wrapped with fallback logic. */
	methods: readonly TKey[];
	/**
	 * Override the default failure-detection logic for `ServiceResult` returns.
	 * Default: fall back when `result === undefined`, or when `result` is an array
	 * containing any `undefined` slot. Per-item warnings (e.g. SOURCE_UNAVAILABLE
	 * on a nested entity) on an otherwise complete response do NOT trigger fallback.
	 */
	shouldFallback?: (primary: ServiceResult<unknown>) => boolean;
	/** Names attached to FALLBACK_USED diagnostics for traceability. */
	adapterNames: { primary: string; secondary: string };
	/**
	 * Open a circuit after N consecutive primary failures; skip primary for `cooldownMs`.
	 * Optional — defaults to no breaker (predictable, no surprise behavior).
	 */
	circuitBreaker?: { failures: number; cooldownMs: number };
	/**
	 * Optional callback invoked after the secondary call completes (or fails to complete).
	 * Useful for telemetry / surfacing fallback events to UI. Exceptions thrown by this
	 * callback are caught and ignored so they don't disrupt the data flow.
	 */
	onFallback?: (info: FallbackInfo<TKey>) => void;
}

function isServiceResult(value: unknown): value is ServiceResult<unknown> {
	return (
		!!value &&
		typeof value === "object" &&
		"result" in value &&
		"errors" in value &&
		Array.isArray((value as ServiceResult<unknown>).errors)
	);
}

/**
 * Wraps two adapters of the same interface with primary→secondary fallback.
 *
 * For each method in `options.methods`, runs `primary`. Fallback to `secondary`
 * fires when the primary throws, or (for `ServiceResult` returns) when `result`
 * is `undefined`, or when `result` is an array containing any `undefined` slot.
 * Per-item warnings on a fully-populated response do NOT trigger fallback —
 * the secondary can't recover information the primary already returned. Pass
 * `shouldFallback` to override.
 *
 * Methods NOT in `options.methods` pass through to `primary` unchanged — this keeps
 * setters (`setConfig`, `setPlugins`, etc.) and internal state on the primary instance.
 */
export function createFallbackAdapter<
	T extends object,
	TKey extends keyof T & string,
>(primary: T, secondary: T, options: FallbackAdapterOptions<TKey>): T {
	const wrappedMethods = new Set<string>(options.methods);
	const names = options.adapterNames;
	const breaker = options.circuitBreaker;

	let consecutiveFailures = 0;
	let circuitOpenUntil = 0;

	const evaluateResultTrigger = (
		primaryResult: ServiceResult<unknown>,
	): { trigger: FallbackTrigger; missingIndices?: number[] } | undefined => {
		if (options.shouldFallback) {
			return options.shouldFallback(primaryResult)
				? { trigger: "custom-shouldFallback" }
				: undefined;
		}
		if (primaryResult.result === undefined) return { trigger: "result-undefined" };
		if (Array.isArray(primaryResult.result)) {
			const missingIndices: number[] = [];
			for (let i = 0; i < primaryResult.result.length; i += 1) {
				if (primaryResult.result[i] === undefined) missingIndices.push(i);
			}
			if (missingIndices.length > 0) {
				return { trigger: "array-missing-slots", missingIndices };
			}
		}
		return undefined;
	};

	const makeFallbackIssue = (
		methodName: string,
		primaryError: unknown,
		primaryErrorsFromResult: DataIssue[] | undefined,
	): DataIssue => ({
		code: "FALLBACK_USED",
		severity: "info",
		message: `Fell back from ${names.primary} to ${names.secondary} for ${methodName}.`,
		locations: [
			dataIssueLocation(
				serviceDiagnosticOwner(names.primary, undefined, methodName),
			),
		],
		source: names.primary,
		originalValue:
			primaryError !== undefined
				? primaryError instanceof Error
					? primaryError.message
					: String(primaryError)
				: primaryErrorsFromResult,
	});

	return new Proxy(primary, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (
				typeof value !== "function" ||
				typeof prop !== "string" ||
				!wrappedMethods.has(prop)
			) {
				return typeof value === "function" ? value.bind(target) : value;
			}

			return async (...args: unknown[]) => {
				const now = Date.now();
				const circuitOpen = breaker !== undefined && now < circuitOpenUntil;

				let primaryResult: ServiceResult<unknown> | undefined;
				let primaryThrow: unknown;

				if (!circuitOpen) {
					try {
						const out = await (value as (...a: unknown[]) => unknown).apply(
							target,
							args,
						);
						if (!isServiceResult(out)) {
							consecutiveFailures = 0;
							return out;
						}
						primaryResult = out;
					} catch (err) {
						primaryThrow = err;
					}
				}

				let resultTrigger:
					| { trigger: FallbackTrigger; missingIndices?: number[] }
					| undefined;
				if (primaryResult !== undefined) {
					resultTrigger = evaluateResultTrigger(primaryResult);
				}

				const needsFallback =
					circuitOpen || primaryThrow !== undefined || resultTrigger !== undefined;

				if (!needsFallback) {
					consecutiveFailures = 0;
					return primaryResult;
				}

				if (breaker !== undefined && !circuitOpen) {
					consecutiveFailures += 1;
					if (consecutiveFailures >= breaker.failures) {
						circuitOpenUntil = now + breaker.cooldownMs;
						consecutiveFailures = 0;
					}
				}

				const secondaryFn = Reflect.get(secondary, prop) as (
					...a: unknown[]
				) => unknown;
				const secondaryOut = await secondaryFn.apply(secondary, args);

				if (options.onFallback) {
					const trigger: FallbackTrigger = circuitOpen
						? "circuit-open"
						: primaryThrow !== undefined
							? "primary-threw"
							: (resultTrigger?.trigger ?? "result-undefined");
					try {
						options.onFallback({
							method: prop as TKey,
							args,
							primaryName: names.primary,
							secondaryName: names.secondary,
							trigger,
							primaryError: primaryThrow,
							primaryIssues: primaryResult?.errors,
							missingIndices: resultTrigger?.missingIndices,
						});
					} catch {
						// swallow — telemetry must never break the data flow.
					}
				}

				if (!isServiceResult(secondaryOut)) return secondaryOut;

				const fallbackIssue = makeFallbackIssue(
					prop,
					primaryThrow,
					primaryResult?.errors,
				);

				return {
					result: secondaryOut.result,
					errors: [fallbackIssue, ...secondaryOut.errors],
				};
			};
		},
	});
}
