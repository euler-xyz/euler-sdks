import type { Address } from "viem";
import { getAddress, isAddress } from "viem";
import type { BuildQueryFn } from "../../utils/buildQuery.js";
import { applyBuildQuery, serializeQueryArgs } from "../../utils/buildQuery.js";
import type { OracleAdapterEntry } from "../../utils/oracle.js";

export type OracleAdapterCheckSeverity = "high" | "medium" | "low" | "info";
export type OracleAdapterRuleOutcome =
	| "pass"
	| "fail"
	| "unknown"
	| "not_applicable";
export type OracleAdapterChecksStatus = "positive" | "warning" | "negative";
export type OracleAdapterUnavailableReason =
	| "v3-disabled"
	| "chain-not-supported";

export class OracleAdapterUnavailableError extends Error {
	readonly code = "ORACLE_ADAPTER_UNAVAILABLE";

	constructor(readonly reason: OracleAdapterUnavailableReason) {
		super(`Oracle adapter assessments are unavailable: ${reason}`);
		this.name = "OracleAdapterUnavailableError";
	}
}

export const isOracleAdapterUnavailableError = (
	value: unknown,
	reason?: OracleAdapterUnavailableReason,
): value is OracleAdapterUnavailableError => {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<OracleAdapterUnavailableError>;
	return (
		candidate.code === "ORACLE_ADAPTER_UNAVAILABLE" &&
		(candidate.reason === "v3-disabled" ||
			candidate.reason === "chain-not-supported") &&
		(reason === undefined || candidate.reason === reason)
	);
};

export type OracleAdapterFinding = {
	key: string;
	outcome: OracleAdapterRuleOutcome;
	severity: OracleAdapterCheckSeverity;
	description: string;
	expected?: unknown;
	observed?: unknown;
};

export type OracleAdapterFindingSummary = {
	passed: number;
	failed: number;
	unknown: number;
	notApplicable: number;
};

export type OracleAdapterAssessment = {
	chainId: number;
	address: Address;
	recognized: boolean;
	checksStatus: OracleAdapterChecksStatus | null;
	reason: string | null;
	inActiveRoute: boolean;
	adapterClass: string | null;
	label: string | null;
	provider: string | null;
	methodology: string | null;
	model: string | null;
	config: Record<string, unknown> | null;
	findings: OracleAdapterFinding[];
	summary: OracleAdapterFindingSummary | null;
	policyId: string | null;
	policyVersion: number | null;
	blockNumber: string | null;
	evaluatedAt: string | null;
	lastCheckedAt: string | null;
};

export type OracleRouterConfig = {
	asset0: Address;
	asset1: Address;
	oracle: Address;
	blockNumber: string;
	timestamp: string;
	txHash: string;
};

export type OracleRouterVault = {
	vault: Address;
	asset: Address;
	blockNumber: string;
	timestamp: string;
	txHash: string;
};

export type OracleRouter = {
	chainId: number;
	router: Address;
	deployer: Address;
	deployedAt: string;
	configs: OracleRouterConfig[];
	vaults: OracleRouterVault[];
};

export type OracleAdapterAssessmentFilters = {
	recognized?: boolean;
	active?: boolean;
};

export type V3ListMeta = {
	total?: number;
	offset?: number;
	limit?: number;
	chainId?: string;
	[key: string]: unknown;
};

export type V3Envelope<T> = {
	data: T;
	meta?: Record<string, unknown>;
};

export type V3ListEnvelope<T> = {
	data: T[];
	meta?: V3ListMeta;
};

export type EnrichedOracleAdapterEntry = OracleAdapterEntry & {
	assessment?: OracleAdapterAssessment;
};

export interface OracleAdapterServiceConfig {
	endpoint?: string;
	apiKey?: string;
	cacheMs?: number;
	pageSize?: number;
}

export interface IOracleAdapterService {
	fetchOracleAdapterAssessment(
		chainId: number,
		address: Address,
	): Promise<OracleAdapterAssessment | undefined>;
	fetchOracleAdapterAssessments(
		chainId: number,
		filters?: OracleAdapterAssessmentFilters,
	): Promise<OracleAdapterAssessment[]>;
	fetchOracleAdapterAssessmentMap(
		chainId: number,
		filters?: OracleAdapterAssessmentFilters,
	): Promise<Record<string, OracleAdapterAssessment>>;
	fetchOracleRouters(chainId: number): Promise<OracleRouter[]>;
	fetchOracleRouterMap(chainId: number): Promise<Record<string, OracleRouter>>;
	enrichAdapters(
		chainId: number,
		adapters: OracleAdapterEntry[],
	): Promise<EnrichedOracleAdapterEntry[]>;
}

const DEFAULT_ENDPOINT = "https://v3.euler.finance";
const DEFAULT_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 100;

type CacheValue<T> = { expiresAt: number; value: T };

const normalizeEndpoint = (endpoint: string): string =>
	endpoint.replace(/\/+$/, "");

const normalizeAddress = (value: unknown): Address | undefined => {
	if (typeof value !== "string" || !isAddress(value)) return undefined;
	return getAddress(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const readV3ErrorCode = async (
	response: Response,
): Promise<string | undefined> => {
	try {
		const body: unknown = await response.json();
		if (!isRecord(body) || !isRecord(body.error)) return undefined;
		return typeof body.error.code === "string" ? body.error.code : undefined;
	} catch {
		return undefined;
	}
};

const throwOracleRequestError = async (
	response: Response,
	requestLabel: string,
): Promise<never> => {
	if ((await readV3ErrorCode(response)) === "CHAIN_NOT_SUPPORTED") {
		throw new OracleAdapterUnavailableError("chain-not-supported");
	}
	throw new Error(
		`${requestLabel} request failed: ${response.status} ${response.statusText}`,
	);
};

// The server may clamp `limit` below the requested page size. Paginate on the
// size it actually applied, or a clamped first page would look like the last
// one and silently truncate the scan.
const resolveAppliedPageSize = (
	meta: V3ListMeta | undefined,
	requestedPageSize: number,
): number =>
	typeof meta?.limit === "number" && meta.limit > 0
		? Math.min(meta.limit, requestedPageSize)
		: requestedPageSize;

export class OracleAdapterService implements IOracleAdapterService {
	private assessmentCache = new Map<
		string,
		CacheValue<OracleAdapterAssessment | undefined>
	>();
	private assessmentListCache = new Map<
		string,
		CacheValue<OracleAdapterAssessment[]>
	>();
	private routerCache = new Map<number, CacheValue<OracleRouter[]>>();

	constructor(
		private readonly config: OracleAdapterServiceConfig = {},
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	private get endpoint(): string {
		return normalizeEndpoint(this.config.endpoint ?? DEFAULT_ENDPOINT);
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	private buildUrl(path: string, search?: Record<string, string>): string {
		const joined = `${this.endpoint}${path.startsWith("/") ? path : `/${path}`}`;
		if (!search) return joined;
		const params = new URLSearchParams(search);
		return `${joined}?${params.toString()}`;
	}

	queryV3OracleAdapterAssessment = async (
		chainId: number,
		address: Address,
	): Promise<V3Envelope<unknown> | undefined> => {
		const url = this.buildUrl(
			`/v3/oracles/adapter-assessments/${getAddress(address)}`,
			{ chainId: String(chainId) },
		);
		const response = await fetch(url, { headers: this.getHeaders() });
		if (response.status === 404) {
			if ((await readV3ErrorCode(response)) === "CHAIN_NOT_SUPPORTED") {
				throw new OracleAdapterUnavailableError("chain-not-supported");
			}
			return undefined;
		}
		if (!response.ok) {
			return throwOracleRequestError(response, "Oracle adapter assessment");
		}
		return response.json() as Promise<V3Envelope<unknown>>;
	};

	setQueryV3OracleAdapterAssessment(
		fn: typeof this.queryV3OracleAdapterAssessment,
	): void {
		this.queryV3OracleAdapterAssessment = fn;
	}

	queryV3OracleAdapterAssessmentsPage = async (
		chainId: number,
		offset: number,
		limit: number,
		filters: OracleAdapterAssessmentFilters = {},
	): Promise<V3ListEnvelope<unknown>> => {
		const url = this.buildUrl("/v3/oracles/adapter-assessments", {
			chainId: String(chainId),
			offset: String(offset),
			limit: String(limit),
			...(filters.recognized === undefined
				? {}
				: { recognized: String(filters.recognized) }),
			...(filters.active === undefined
				? {}
				: { active: String(filters.active) }),
		});
		const response = await fetch(url, { headers: this.getHeaders() });
		if (!response.ok) {
			return throwOracleRequestError(response, "Oracle adapter assessments");
		}
		return response.json() as Promise<V3ListEnvelope<unknown>>;
	};

	setQueryV3OracleAdapterAssessmentsPage(
		fn: typeof this.queryV3OracleAdapterAssessmentsPage,
	): void {
		this.queryV3OracleAdapterAssessmentsPage = fn;
	}

	getQueryKeyV3OracleAdapterAssessmentsPage(
		chainId: number,
		offset: number,
		limit: number,
		filters: OracleAdapterAssessmentFilters = {},
	): string | null {
		return serializeQueryArgs([chainId, offset, limit, filters]);
	}

	queryV3OracleRoutersPage = async (
		chainId: number,
		offset: number,
		limit: number,
	): Promise<V3ListEnvelope<unknown>> => {
		const url = this.buildUrl("/v3/oracles/routers", {
			chainId: String(chainId),
			offset: String(offset),
			limit: String(limit),
		});
		const response = await fetch(url, { headers: this.getHeaders() });
		if (!response.ok) {
			return throwOracleRequestError(response, "Oracle routers");
		}
		return response.json() as Promise<V3ListEnvelope<unknown>>;
	};

	setQueryV3OracleRoutersPage(fn: typeof this.queryV3OracleRoutersPage): void {
		this.queryV3OracleRoutersPage = fn;
	}

	async fetchOracleAdapterAssessment(
		chainId: number,
		address: Address,
	): Promise<OracleAdapterAssessment | undefined> {
		const normalizedAddress = getAddress(address);
		const cacheKey = `${chainId}:${normalizedAddress.toLowerCase()}`;
		const cached = this.assessmentCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) return cached.value;

		const envelope = await this.queryV3OracleAdapterAssessment(
			chainId,
			normalizedAddress,
		);
		const assessment = envelope
			? this.parseAssessment(envelope.data)
			: undefined;
		if (
			assessment &&
			(assessment.chainId !== chainId ||
				assessment.address !== normalizedAddress)
		) {
			throw new Error(
				`Oracle adapter assessment identity mismatch for chain ${chainId} and address ${normalizedAddress}`,
			);
		}
		this.assessmentCache.set(cacheKey, {
			expiresAt: Date.now() + (this.config.cacheMs ?? DEFAULT_CACHE_MS),
			value: assessment,
		});
		return assessment;
	}

	async fetchOracleAdapterAssessments(
		chainId: number,
		filters: OracleAdapterAssessmentFilters = {},
	): Promise<OracleAdapterAssessment[]> {
		const cacheKey = `${chainId}:${filters.recognized ?? "all"}:${filters.active ?? "all"}`;
		const cached = this.assessmentListCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) return cached.value;

		const assessments: OracleAdapterAssessment[] = [];
		const pageSize = Math.max(
			1,
			Math.min(100, this.config.pageSize ?? DEFAULT_PAGE_SIZE),
		);
		let offset = 0;
		for (;;) {
			const page = await this.queryV3OracleAdapterAssessmentsPage(
				chainId,
				offset,
				pageSize,
				filters,
			);
			if (!Array.isArray(page.data)) {
				throw new Error(
					"Invalid oracle adapter assessments response: data must be an array",
				);
			}
			const rows = page.data;
			for (const row of rows) {
				const parsed = this.parseAssessment(row);
				if (parsed.chainId !== chainId) {
					throw new Error(
						`Oracle adapter assessment chain mismatch: expected ${chainId}, received ${parsed.chainId}`,
					);
				}
				assessments.push(parsed);
			}
			if (rows.length < resolveAppliedPageSize(page.meta, pageSize)) break;
			offset += rows.length;
			if (typeof page.meta?.total === "number" && offset >= page.meta.total)
				break;
		}

		this.assessmentListCache.set(cacheKey, {
			expiresAt: Date.now() + (this.config.cacheMs ?? DEFAULT_CACHE_MS),
			value: assessments,
		});
		return assessments;
	}

	async fetchOracleAdapterAssessmentMap(
		chainId: number,
		filters: OracleAdapterAssessmentFilters = {},
	): Promise<Record<string, OracleAdapterAssessment>> {
		const assessments = await this.fetchOracleAdapterAssessments(
			chainId,
			filters,
		);
		return Object.fromEntries(
			assessments.map((assessment) => [
				assessment.address.toLowerCase(),
				assessment,
			]),
		);
	}

	async fetchOracleRouters(chainId: number): Promise<OracleRouter[]> {
		const cached = this.routerCache.get(chainId);
		if (cached && cached.expiresAt > Date.now()) return cached.value;

		const routers: OracleRouter[] = [];
		const pageSize = Math.max(
			1,
			Math.min(100, this.config.pageSize ?? DEFAULT_PAGE_SIZE),
		);
		let offset = 0;
		for (;;) {
			const page = await this.queryV3OracleRoutersPage(
				chainId,
				offset,
				pageSize,
			);
			const rows = Array.isArray(page.data) ? page.data : [];
			for (const row of rows) {
				const parsed = this.parseRouter(row);
				if (parsed) routers.push(parsed);
			}
			if (rows.length < resolveAppliedPageSize(page.meta, pageSize)) break;
			offset += rows.length;
			if (typeof page.meta?.total === "number" && offset >= page.meta.total)
				break;
		}

		this.routerCache.set(chainId, {
			expiresAt: Date.now() + (this.config.cacheMs ?? DEFAULT_CACHE_MS),
			value: routers,
		});
		return routers;
	}

	async fetchOracleRouterMap(
		chainId: number,
	): Promise<Record<string, OracleRouter>> {
		const routers = await this.fetchOracleRouters(chainId);
		return Object.fromEntries(
			routers.map((router) => [router.router.toLowerCase(), router]),
		);
	}

	async enrichAdapters(
		chainId: number,
		adapters: OracleAdapterEntry[],
	): Promise<EnrichedOracleAdapterEntry[]> {
		if (adapters.length === 0) return [];
		const assessments = await Promise.all(
			adapters.map((adapter) =>
				this.fetchOracleAdapterAssessment(chainId, adapter.oracle),
			),
		);
		return adapters.map((adapter, index) => ({
			...adapter,
			assessment: assessments[index],
		}));
	}

	private parseAssessment(raw: unknown): OracleAdapterAssessment {
		if (!isRecord(raw)) {
			throw new Error(
				"Invalid oracle adapter assessment response: expected an object",
			);
		}
		const address = normalizeAddress(raw.address);
		if (
			!address ||
			!Number.isSafeInteger(raw.chainId) ||
			Number(raw.chainId) <= 0
		) {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid identity",
			);
		}
		if (typeof raw.recognized !== "boolean") {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid recognized value",
			);
		}
		if (typeof raw.inActiveRoute !== "boolean") {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid inActiveRoute value",
			);
		}
		if (raw.checksStatus !== null && !this.isChecksStatus(raw.checksStatus)) {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid checksStatus value",
			);
		}
		if (!Array.isArray(raw.findings) || !raw.findings.every(this.isFinding)) {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid findings",
			);
		}

		const nullableStrings = [
			"reason",
			"adapterClass",
			"label",
			"provider",
			"methodology",
			"model",
			"policyId",
			"blockNumber",
			"evaluatedAt",
			"lastCheckedAt",
		] as const;
		for (const field of nullableStrings) {
			if (raw[field] !== null && typeof raw[field] !== "string") {
				throw new Error(
					`Invalid oracle adapter assessment response: invalid ${field} value`,
				);
			}
		}
		if (raw.config !== null && !isRecord(raw.config)) {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid config value",
			);
		}
		if (raw.policyVersion !== null && typeof raw.policyVersion !== "number") {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid policyVersion value",
			);
		}

		const findings = raw.findings;
		return {
			chainId: raw.chainId as number,
			address,
			recognized: raw.recognized,
			checksStatus: raw.checksStatus as OracleAdapterChecksStatus | null,
			reason: raw.reason as string | null,
			inActiveRoute: raw.inActiveRoute,
			adapterClass: raw.adapterClass as string | null,
			label: raw.label as string | null,
			provider: raw.provider as string | null,
			methodology: raw.methodology as string | null,
			model: raw.model as string | null,
			config: raw.config as Record<string, unknown> | null,
			findings,
			summary: this.parseSummary(raw.summary),
			policyId: raw.policyId as string | null,
			policyVersion: raw.policyVersion as number | null,
			blockNumber: raw.blockNumber as string | null,
			evaluatedAt: raw.evaluatedAt as string | null,
			lastCheckedAt: raw.lastCheckedAt as string | null,
		};
	}

	private readonly isFinding = (raw: unknown): raw is OracleAdapterFinding =>
		isRecord(raw) &&
		typeof raw.key === "string" &&
		this.isRuleOutcome(raw.outcome) &&
		this.isSeverity(raw.severity) &&
		typeof raw.description === "string";

	private parseSummary(raw: unknown): OracleAdapterFindingSummary | null {
		if (raw === null) return null;
		if (!isRecord(raw)) {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid summary",
			);
		}
		if (
			typeof raw.passed !== "number" ||
			typeof raw.failed !== "number" ||
			typeof raw.unknown !== "number" ||
			typeof raw.notApplicable !== "number"
		) {
			throw new Error(
				"Invalid oracle adapter assessment response: invalid summary",
			);
		}
		return {
			passed: raw.passed,
			failed: raw.failed,
			unknown: raw.unknown,
			notApplicable: raw.notApplicable,
		};
	}

	private isRuleOutcome(value: unknown): value is OracleAdapterRuleOutcome {
		return (
			value === "pass" ||
			value === "fail" ||
			value === "unknown" ||
			value === "not_applicable"
		);
	}

	private isSeverity(value: unknown): value is OracleAdapterCheckSeverity {
		return (
			value === "high" ||
			value === "medium" ||
			value === "low" ||
			value === "info"
		);
	}

	private isChecksStatus(value: unknown): value is OracleAdapterChecksStatus {
		return value === "positive" || value === "warning" || value === "negative";
	}

	private parseRouter(raw: unknown): OracleRouter | undefined {
		if (!isRecord(raw)) return undefined;
		const router = normalizeAddress(raw.router);
		const deployer = normalizeAddress(raw.deployer);
		if (!router || !deployer || typeof raw.chainId !== "number")
			return undefined;
		if (typeof raw.deployedAt !== "string") return undefined;

		const configs = Array.isArray(raw.configs)
			? raw.configs
					.map((entry) => this.parseRouterConfig(entry))
					.filter((entry): entry is OracleRouterConfig => entry !== undefined)
			: [];
		const vaults = Array.isArray(raw.vaults)
			? raw.vaults
					.map((entry) => this.parseRouterVault(entry))
					.filter((entry): entry is OracleRouterVault => entry !== undefined)
			: [];

		return {
			chainId: raw.chainId,
			router,
			deployer,
			deployedAt: raw.deployedAt,
			configs,
			vaults,
		};
	}

	private parseRouterConfig(raw: unknown): OracleRouterConfig | undefined {
		if (!isRecord(raw)) return undefined;
		const asset0 = normalizeAddress(raw.asset0);
		const asset1 = normalizeAddress(raw.asset1);
		const oracle = normalizeAddress(raw.oracle);
		if (!asset0 || !asset1 || !oracle) return undefined;
		if (
			typeof raw.blockNumber !== "string" ||
			typeof raw.timestamp !== "string" ||
			typeof raw.txHash !== "string"
		) {
			return undefined;
		}
		return {
			asset0,
			asset1,
			oracle,
			blockNumber: raw.blockNumber,
			timestamp: raw.timestamp,
			txHash: raw.txHash,
		};
	}

	private parseRouterVault(raw: unknown): OracleRouterVault | undefined {
		if (!isRecord(raw)) return undefined;
		const vault = normalizeAddress(raw.vault);
		const asset = normalizeAddress(raw.asset);
		if (!vault || !asset) return undefined;
		if (
			typeof raw.blockNumber !== "string" ||
			typeof raw.timestamp !== "string" ||
			typeof raw.txHash !== "string"
		) {
			return undefined;
		}
		return {
			vault,
			asset,
			blockNumber: raw.blockNumber,
			timestamp: raw.timestamp,
			txHash: raw.txHash,
		};
	}
}

export class UnavailableOracleAdapterService implements IOracleAdapterService {
	constructor(private readonly reason: OracleAdapterUnavailableReason) {}

	private unavailable(): never {
		throw new OracleAdapterUnavailableError(this.reason);
	}

	async fetchOracleAdapterAssessment(
		_chainId: number,
		_address: Address,
	): Promise<OracleAdapterAssessment | undefined> {
		return this.unavailable();
	}

	async fetchOracleAdapterAssessments(
		_chainId: number,
		_filters?: OracleAdapterAssessmentFilters,
	): Promise<OracleAdapterAssessment[]> {
		return this.unavailable();
	}

	async fetchOracleAdapterAssessmentMap(
		_chainId: number,
		_filters?: OracleAdapterAssessmentFilters,
	): Promise<Record<string, OracleAdapterAssessment>> {
		return this.unavailable();
	}

	async fetchOracleRouters(_chainId: number): Promise<OracleRouter[]> {
		return this.unavailable();
	}

	async fetchOracleRouterMap(
		_chainId: number,
	): Promise<Record<string, OracleRouter>> {
		return this.unavailable();
	}

	async enrichAdapters(
		_chainId: number,
		_adapters: OracleAdapterEntry[],
	): Promise<EnrichedOracleAdapterEntry[]> {
		return this.unavailable();
	}
}
