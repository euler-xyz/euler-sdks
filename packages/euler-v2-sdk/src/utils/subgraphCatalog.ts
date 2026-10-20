import { createCallBundler } from "./callBundler.js";
/** Public discovery metadata is opt-in and independent of chain/deployment configuration. */
export const DEFAULT_SUBGRAPH_CATALOG_URL =
	"https://raw.githubusercontent.com/euler-xyz/euler-subgraph/catalog/v1/catalog.json";

export type SubgraphCapability =
	| "account-vault-discovery"
	| "vault-factory-lookup";
export type SubgraphUnavailableReason =
	| "invalid"
	| "missing"
	| "retired"
	| "unsupported-capability"
	| "disabled"
	| "source-failed"
	| "source-changed";
export class SubgraphUnavailableError extends Error {
	constructor(
		public readonly reason: SubgraphUnavailableReason,
		public readonly chainId?: number,
	) {
		super(
			`Subgraph unavailable (${reason})${chainId === undefined ? "" : ` for chain ${chainId}`}`,
		);
		this.name = "SubgraphUnavailableError";
	}
}
export interface SubgraphSource {
	endpoint: string;
	deploymentId: string;
}
/** Source identity from a completed catalog-backed read, owned by the caller. */
export interface SubgraphReadOptions {
	expectedSource?: SubgraphSource;
}
export interface SubgraphReadResult<T> {
	value: T;
	/** Absent for explicit endpoints and custom query overrides. */
	source?: SubgraphSource;
}
export interface SubgraphResolver {
	resolve(
		chainId: number,
		capability: SubgraphCapability,
	): Promise<SubgraphSource>;
}
export interface SubgraphCatalogConfig {
	/** Custom metadata URL; defaults to the future official publication target. */
	url?: string;
	/** Supplied snapshot takes precedence over URL/fetch and never performs metadata HTTP requests. */
	catalog?: unknown;
	/** Custom resolver takes precedence over catalog/URL/fetch. */
	resolver?: SubgraphResolver;
	fetch?: typeof globalThis.fetch;
	channel?: "stable" | "candidate";
	freshMs?: number;
	/** Maximum age since successful fetch, including freshMs; failures never extend it. */
	maxAgeMs?: number;
	timeoutMs?: number;
	retryMs?: number;
	now?: () => number;
}
export interface SubgraphDeployment extends SubgraphSource {
	chainId: number;
	family: "euler-simple";
	channel: "stable" | "candidate";
	status: "active";
	version: string;
	capabilities: string[];
	sourceCommit: string;
	interfacesCommit?: string;
	startBlock: number;
}
export interface SubgraphRetirement {
	chainId: number;
	family: "euler-simple";
	channel: "stable" | "candidate";
	status: "retired";
}
export interface ParsedSubgraphCatalog {
	revision: string;
	publishedAt: string;
	deployments: Map<string, SubgraphDeployment | SubgraphRetirement>;
	/** Invalid and duplicate identities are quarantined, including valid/invalid duplicates. */
	invalid: Set<string>;
	diagnostics: Array<{ code: "invalid" | "duplicate"; identity?: string }>;
}
const object = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;
function publicEndpoint(value: unknown): value is string {
	if (!nonempty(value)) return false;
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash
		);
	} catch {
		return false;
	}
}
export function parseSubgraphCatalog(value: unknown): ParsedSubgraphCatalog {
	if (
		!object(value) ||
		value.schemaVersion !== 1 ||
		!nonempty(value.revision) ||
		!nonempty(value.publishedAt) ||
		!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value.publishedAt) ||
		!Number.isFinite(Date.parse(value.publishedAt)) ||
		!Array.isArray(value.deployments)
	) {
		throw new SubgraphUnavailableError("invalid");
	}
	const parsed: ParsedSubgraphCatalog = {
		revision: value.revision,
		publishedAt: value.publishedAt,
		deployments: new Map(),
		invalid: new Set(),
		diagnostics: [],
	};
	const seen = new Set<string>();
	for (const record of value.deployments) {
		if (!object(record)) {
			parsed.diagnostics.push({ code: "invalid" });
			continue;
		}
		// Other families/channels cannot be selected by this consumer.
		if (
			record.family !== "euler-simple" ||
			!["stable", "candidate"].includes(String(record.channel))
		)
			continue;
		if (!Number.isSafeInteger(record.chainId) || Number(record.chainId) <= 0) {
			parsed.diagnostics.push({ code: "invalid" });
			continue;
		}
		const key = `${record.chainId}:${record.channel}`;
		if (seen.has(key)) {
			parsed.diagnostics.push({ code: "duplicate", identity: key });
			parsed.invalid.add(key);
			parsed.deployments.delete(key);
			continue;
		}
		seen.add(key);
		const valid =
			record.status === "retired" ||
			(record.status === "active" &&
				publicEndpoint(record.endpoint) &&
				nonempty(record.deploymentId) &&
				typeof record.sourceCommit === "string" &&
				/^[a-f0-9]{40}$/i.test(record.sourceCommit) &&
				(record.interfacesCommit === undefined ||
					(typeof record.interfacesCommit === "string" &&
						/^[a-f0-9]{40}$/i.test(record.interfacesCommit))) &&
				typeof record.version === "string" &&
				/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.test(
					record.version,
				) &&
				Number.isSafeInteger(record.startBlock) &&
				Number(record.startBlock) >= 0 &&
				Array.isArray(record.capabilities) &&
				record.capabilities.every(nonempty));
		if (!valid) {
			parsed.diagnostics.push({ code: "invalid", identity: key });
			parsed.invalid.add(key);
			continue;
		}
		parsed.deployments.set(
			key,
			(record.status === "active"
				? { ...record, capabilities: [...(record.capabilities as string[])] }
				: { ...record }) as unknown as SubgraphDeployment | SubgraphRetirement,
		);
	}
	return parsed;
}

/** Per-instance cache: sources, fetch functions, channels and supplied snapshots never share state. */
export function createSubgraphCatalogResolver(
	config: SubgraphCatalogConfig = {},
): SubgraphResolver {
	if (config.resolver) return config.resolver;
	const freshMs = config.freshMs ?? 60_000;
	const maxAgeMs = config.maxAgeMs ?? 300_000;
	const timeoutMs = config.timeoutMs ?? 10_000;
	const retryMs = config.retryMs ?? 10_000;
	if (
		![freshMs, maxAgeMs, timeoutMs, retryMs].every(Number.isFinite) ||
		freshMs < 0 ||
		maxAgeMs < freshMs ||
		timeoutMs <= 0 ||
		retryMs < 0
	)
		throw new Error("Invalid subgraph catalog cache durations");
	const now = config.now ?? Date.now;
	let cached: ParsedSubgraphCatalog | undefined;
	let succeededAt = 0;
	let retryAt = 0;
	let lastError: SubgraphUnavailableError | undefined;
	let pending: Promise<ParsedSubgraphCatalog> | undefined;
	const supplied = Object.hasOwn(config, "catalog");
	const load = async (): Promise<ParsedSubgraphCatalog> => {
		if (supplied) {
			if (!cached) cached = parseSubgraphCatalog(config.catalog);
			return cached;
		}
		if (cached && now() - succeededAt < freshMs) return cached;
		if (lastError && now() < retryAt) {
			if (cached && now() - succeededAt < maxAgeMs) return cached;
			throw lastError;
		}
		if (pending) return pending;
		pending = (async () => {
			const controller = new AbortController();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => {
					controller.abort();
					reject(new SubgraphUnavailableError("source-failed"));
				}, timeoutMs);
			});
			try {
				const next = await Promise.race([
					(async () => {
						const response = await (config.fetch ?? globalThis.fetch)(
							config.url ?? DEFAULT_SUBGRAPH_CATALOG_URL,
							{ signal: controller.signal },
						);
						if (!response.ok)
							throw new SubgraphUnavailableError("source-failed");
						return parseSubgraphCatalog(await response.json());
					})(),
					timeout,
				]);
				cached = next;
				succeededAt = now();
				lastError = undefined;
				return next;
			} catch (error) {
				lastError =
					error instanceof SubgraphUnavailableError
						? error
						: new SubgraphUnavailableError("source-failed");
				retryAt = now() + retryMs;
				if (cached && now() - succeededAt < maxAgeMs) return cached;
				if (error instanceof SubgraphUnavailableError) throw error;
				throw new SubgraphUnavailableError("source-failed");
			} finally {
				clearTimeout(timer);
			}
		})();
		try {
			return await pending;
		} finally {
			pending = undefined;
		}
	};
	return {
		async resolve(chainId, capability) {
			const catalog = await load();
			const key = `${chainId}:${config.channel ?? "stable"}`;
			if (catalog.invalid.has(key))
				throw new SubgraphUnavailableError("invalid", chainId);
			const record = catalog.deployments.get(key);
			if (!record) throw new SubgraphUnavailableError("missing", chainId);
			if (record.status === "retired")
				throw new SubgraphUnavailableError("retired", chainId);
			if (!record.capabilities.includes(capability))
				throw new SubgraphUnavailableError("unsupported-capability", chainId);
			return { endpoint: record.endpoint, deploymentId: record.deploymentId };
		},
	};
}

/** Explicit maps retain custom/relative transports and take precedence over catalog discovery. */
export async function resolveSubgraphEndpoint(
	chainId: number,
	capability: SubgraphCapability,
	urls: Record<number, string | false>,
	resolver?: SubgraphResolver,
	previousSources?: Map<number, SubgraphSource>,
): Promise<string | undefined> {
	return (
		await resolveSubgraphRead(
			chainId,
			capability,
			urls,
			resolver,
			previousSources,
		)
	).endpoint;
}

/** Resolve a local source snapshot; caller expectations do not use shared transition state. */
export async function resolveSubgraphRead(
	chainId: number,
	capability: SubgraphCapability,
	urls: Record<number, string | false>,
	resolver?: SubgraphResolver,
	previousSources?: Map<number, SubgraphSource>,
	expectedSource?: SubgraphSource,
): Promise<{ endpoint?: string; source?: SubgraphSource }> {
	const explicit = urls[chainId];
	if (explicit === false)
		throw new SubgraphUnavailableError("disabled", chainId);
	if (explicit || !resolver) {
		if (expectedSource)
			throw new SubgraphUnavailableError("source-changed", chainId);
		return { endpoint: explicit || undefined };
	}
	const source = { ...(await resolver.resolve(chainId, capability)) };
	if (!nonempty(source?.endpoint) || !nonempty(source?.deploymentId))
		throw new SubgraphUnavailableError("invalid", chainId);
	if (
		expectedSource &&
		(expectedSource.endpoint !== source.endpoint ||
			expectedSource.deploymentId !== source.deploymentId)
	)
		throw new SubgraphUnavailableError("source-changed", chainId);
	const previous = previousSources?.get(chainId);
	previousSources?.set(chainId, { ...source });
	// Advisory for simple readers; multi-read operations supply their own expectedSource.
	if (
		previous !== undefined &&
		(previous.endpoint !== source.endpoint ||
			previous.deploymentId !== source.deploymentId)
	)
		throw new SubgraphUnavailableError("source-changed", chainId);
	return { endpoint: source.endpoint, source };
}

/** Catalog-backed queries must identify the deployment that actually answered, on every page. */
export function validateSubgraphDeployment(
	value: unknown,
	chainId: number,
	source?: SubgraphSource,
): void {
	if (!source) return;
	if (
		!object(value) ||
		!object(value.data) ||
		!object(value.data._meta) ||
		!nonempty(value.data._meta.deployment)
	)
		throw new SubgraphUnavailableError("invalid", chainId);
	if (value.data._meta.deployment !== source.deploymentId)
		throw new SubgraphUnavailableError("source-changed", chainId);
}

/** A failed chain must not reject requests for unrelated catalog identities. */
export function createSubgraphCallBundler<
	K extends {
		chainId: number;
		withSource?: boolean;
		expectedSource?: SubgraphSource;
	},
	V,
>(batch: (keys: K[]) => Promise<V[]>): (key: K) => Promise<V> {
	const chains = new Map<string, (key: K) => Promise<V>>();
	return (key) => {
		// Expectations are part of batching identity: a stale reader cannot reject a fresh reader.
		const identity = JSON.stringify([
			key.chainId,
			!!key.withSource,
			key.expectedSource?.endpoint,
			key.expectedSource?.deploymentId,
		]);
		let load = chains.get(identity);
		if (!load) {
			load = createCallBundler(batch);
			chains.set(identity, load);
		}
		return load(key);
	};
}
