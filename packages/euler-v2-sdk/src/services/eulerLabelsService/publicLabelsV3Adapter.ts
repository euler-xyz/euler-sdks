import {
	type BuildQueryFn,
	applyBuildQuery,
	serializeQueryArgs,
} from "../../utils/buildQuery.js";
import { normalizePublicLabelsData } from "./publicLabelsV3Normalize.js";
import {
	PUBLIC_LABELS_PAGE_SIZE,
	PUBLIC_LABELS_RUNTIME_VERSION,
	type PublicEntityAddress,
	type PublicEntityLabel,
	type PublicEulerLabelsData,
	type PublicGeoPolicy,
	type PublicLabelsQuery,
	type PublicLabelsRequest,
	type PublicLabelsResponse,
	type PublicLabelsListResponse,
	type PublicLabelsSnapshot,
	type PublicLabelsSource,
	type PublicLabelsMetadata,
	type PublicLabelsMetadataSnapshot,
	type PublicLabelsV3AdapterConfig,
	type PublicProductLabel,
	type PublicVaultLabel,
	type PublicVaultVisibility,
	type PublishedLabelVersion,
} from "./publicLabelsV3Types.js";

const MAX_PUBLIC_LABEL_RECORDS = 10_000;
const MAX_GEO_POLICY_REGEX_LENGTH = 512;
const PUBLIC_LABELS_REQUEST_CONCURRENCY = 8;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const PUBLIC_VAULT_TYPES: readonly string[] = ["evk", "earn", "securitize"];
const VISIBILITY_STATUSES: readonly string[] = [
	"visible",
	"warning",
	"hidden",
	"pending_review",
];
const isPublishedVersionKey = (value: string): boolean =>
	/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) &&
	!["draft", "current", "latest", "production"].includes(value);

const isNonNegativeInteger = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");

const assertListResponse = <T>(
	response: PublicLabelsResponse<T[]>,
	path: string,
): PublicLabelsListResponse<T> => {
	if (!response || !Array.isArray(response.data)) {
		throw new Error(`Invalid Public Labels response for ${path}`);
	}
	const total = response.meta?.total;
	if (!isNonNegativeInteger(total) || total > MAX_PUBLIC_LABEL_RECORDS) {
		throw new Error(`Invalid Public Labels total for ${path}`);
	}
	return { data: response.data, meta: { ...response.meta, total } };
};

const assertItemResponse = <T>(
	response: PublicLabelsResponse<T>,
	path: string,
): T => {
	if (!response || response.data === null || response.data === undefined) {
		throw new Error(`Invalid Public Labels response for ${path}`);
	}
	return response.data;
};

export const fetchAllPublicLabelPages = async <T>(
	request: PublicLabelsRequest,
	path: string,
	query: PublicLabelsQuery,
): Promise<T[]> => {
	const result: T[] = [];
	let offset = 0;
	let expectedTotal: number | undefined;

	while (true) {
		const response = await request<T[]>(path, {
			...query,
			limit: PUBLIC_LABELS_PAGE_SIZE,
			offset,
		});
		const {
			data: items,
			meta: { total },
		} = assertListResponse(response, path);
		if (expectedTotal !== undefined && total !== expectedTotal)
			throw new Error(
				`Public Labels collection changed during pagination for ${path}`,
			);
		expectedTotal = total;
		if (
			items.length > PUBLIC_LABELS_PAGE_SIZE ||
			result.length + items.length > total
		)
			throw new Error(`Invalid Public Labels page for ${path}`);
		result.push(...items);

		if (result.length >= total) return result.slice(0, total);
		if (items.length === 0) {
			throw new Error(`Public Labels pagination stalled for ${path}`);
		}
		offset += items.length;
	}
};

const isNullOrAddress = (value: unknown): value is string | null =>
	value === null || (typeof value === "string" && ADDRESS_RE.test(value));

const isOptionalStringList = (
	value: unknown,
): value is string[] | null | undefined => value == null || isStringList(value);

const isOptionalRegexSource = (
	value: unknown,
): value is string | null | undefined => {
	if (value == null) return true;
	if (typeof value !== "string" || value.length > MAX_GEO_POLICY_REGEX_LENGTH)
		return false;
	new RegExp(value, "i");
	return true;
};

const validatePublicGeoPolicy = (row: unknown): PublicGeoPolicy => {
	if (!isRecord(row)) throw new Error("Invalid geo policy row");
	const { id, chainId, productId, countriesResolved, policyType } = row;
	if (
		typeof id !== "string" ||
		(policyType !== "block" && policyType !== "restrict") ||
		!(
			chainId === null ||
			(typeof chainId === "number" && Number.isInteger(chainId) && chainId > 0)
		) ||
		!(
			productId === null ||
			(typeof productId === "string" && productId.length > 0)
		) ||
		!isStringList(countriesResolved) ||
		!countriesResolved.every((code) => COUNTRY_CODE_RE.test(code))
	)
		throw new Error("Invalid geo policy scope or countriesResolved");
	const { vaultAddress, assetAddress } = row;
	if (!isNullOrAddress(vaultAddress) || !isNullOrAddress(assetAddress))
		throw new Error("Invalid geo policy address");
	if (chainId === null && (productId || vaultAddress || assetAddress))
		throw new Error("Geo policy address/product requires a chain");
	const { countries, reason, createdAt } = row;
	if (
		!isStringList(countries) ||
		!(reason === null || typeof reason === "string") ||
		typeof createdAt !== "string"
	)
		throw new Error("Invalid geo policy row");
	const { assetSymbols, assetNames, assetSymbolRegex, assetNameRegex } = row;
	if (!isOptionalStringList(assetSymbols) || !isOptionalStringList(assetNames))
		throw new Error("Invalid geo policy asset selector");
	if (
		!isOptionalRegexSource(assetSymbolRegex) ||
		!isOptionalRegexSource(assetNameRegex)
	)
		throw new Error("Invalid geo policy regex");
	return {
		id,
		chainId,
		productId,
		vaultAddress,
		assetAddress,
		countries,
		countriesResolved,
		policyType,
		reason,
		createdAt,
		...(assetSymbols !== undefined && { assetSymbols }),
		...(assetSymbolRegex !== undefined && { assetSymbolRegex }),
		...(assetNames !== undefined && { assetNames }),
		...(assetNameRegex !== undefined && { assetNameRegex }),
	};
};

/** Validate before caching: unavailable or malformed policy data is never an empty policy. */
export const validatePublicGeoPolicies = (
	value: unknown,
): PublicGeoPolicy[] => {
	if (!Array.isArray(value)) throw new Error("Invalid geo policies");
	const rows: unknown[] = value;
	const policies = rows.map(validatePublicGeoPolicy);
	if (new Set(policies.map((policy) => policy.id)).size !== policies.length)
		throw new Error("Duplicate geo policy id");
	return policies;
};

/** Live policies are deliberately independent of metadata publications and chains. */
export const fetchPublicGeoPolicies = async (
	request: PublicLabelsRequest,
): Promise<PublicGeoPolicy[]> =>
	validatePublicGeoPolicies(
		await fetchAllPublicLabelPages<PublicGeoPolicy>(
			request,
			"/geo-policies",
			{},
		),
	);

const mapWithConcurrency = async <T, R>(
	values: T[],
	concurrency: number,
	mapper: (value: T) => Promise<R>,
): Promise<R[]> => {
	const result = new Array<R>(values.length);
	let nextIndex = 0;

	const worker = async () => {
		while (nextIndex < values.length) {
			const index = nextIndex++;
			result[index] = await mapper(values[index]!);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, values.length) }, () =>
			worker(),
		),
	);
	return result;
};

const isSafeEntityId = (value: string): boolean =>
	/^[A-Za-z0-9_-]{1,100}$/.test(value);

const validateLabelSet = (labelSet: string): string => {
	if (!/^[A-Za-z0-9_-]{1,100}$/.test(labelSet))
		throw new Error("Invalid Public Labels set");
	return labelSet;
};

export const resolvePublicLabelsVersion = async (
	request: PublicLabelsRequest,
	requestedVersion = PUBLIC_LABELS_RUNTIME_VERSION,
	labelSet = "public",
): Promise<string> => {
	validateLabelSet(labelSet);
	if (
		requestedVersion !== PUBLIC_LABELS_RUNTIME_VERSION &&
		!isPublishedVersionKey(requestedVersion)
	) {
		throw new Error(`Invalid Public Labels version ${requestedVersion}`);
	}

	const response = await request<PublishedLabelVersion[]>(
		`/labels/sets/${labelSet}/versions`,
		{},
	);
	if (!Array.isArray(response.data)) {
		throw new Error("Invalid Public Labels versions response");
	}
	const published = response.data.find(
		(version) =>
			version.status === "published" &&
			(requestedVersion === PUBLIC_LABELS_RUNTIME_VERSION
				? version.isLatest === true ||
					version.aliases?.includes(PUBLIC_LABELS_RUNTIME_VERSION)
				: version.versionKey === requestedVersion),
	);
	if (!published?.versionKey || !isPublishedVersionKey(published.versionKey)) {
		throw new Error(
			requestedVersion === PUBLIC_LABELS_RUNTIME_VERSION
				? "Public Labels latest alias is unavailable"
				: `Public Labels publication ${requestedVersion} is unavailable`,
		);
	}
	return published.versionKey;
};

type DirectVisibilityRow = {
	chainId: number;
	vaultAddress: string;
	status: PublicVaultVisibility["status"];
	checks: Record<string, unknown>;
};

type ListingSides = { lend: { hidden: boolean }; borrow: { hidden: boolean } };

const isHiddenFlag = (value: unknown): value is { hidden: boolean } =>
	isRecord(value) && typeof value.hidden === "boolean";

const isListingSides = (value: unknown): value is ListingSides =>
	isRecord(value) && isHiddenFlag(value.lend) && isHiddenFlag(value.borrow);

const assertDirectVisibilityRow = (
	row: DirectVisibilityRow,
	chainId: number,
	vault: PublicVaultLabel,
): void => {
	if (
		row.chainId !== chainId ||
		typeof row.vaultAddress !== "string" ||
		row.vaultAddress.toLowerCase() !== vault.address.toLowerCase() ||
		!VISIBILITY_STATUSES.includes(row.status) ||
		!isRecord(row.checks)
	)
		throw new Error("Invalid direct visibility verdict");
};

/** Reduces the evaluated verdict to the same summary v3 attaches with include=visibility. */
const fetchDirectVisibility = async (
	request: PublicLabelsRequest,
	chainId: number,
	vault: PublicVaultLabel,
): Promise<PublicVaultVisibility> => {
	const path = `/${vault.vaultType === "earn" ? "earn" : "evk"}/vaults/${chainId}/${vault.address.toLowerCase()}/visibility`;
	const row = assertItemResponse(
		await request<DirectVisibilityRow>(path, {}),
		path,
	);
	assertDirectVisibilityRow(row, chainId, vault);
	const { checks } = row;
	const listing = checks.listing;
	if (listing !== undefined && !isListingSides(listing))
		throw new Error("Invalid direct visibility listing");
	const eligible = row.status === "visible" || row.status === "warning";
	const hidden = (side: "lend" | "borrow"): boolean =>
		listing
			? listing[side].hidden
			: checks.notExplorable === true ||
				checks[side === "lend" ? "notExplorableLend" : "notExplorableBorrow"] ===
					true;
	return {
		status: row.status,
		explorableLend: eligible && !hidden("lend"),
		explorableBorrow: eligible && !hidden("borrow"),
		decidedBy:
			typeof checks.decidedBy === "string"
				? checks.decidedBy
				: "awaiting-verification",
		reason: typeof checks.reason === "string" ? checks.reason : null,
	};
};

const fetchEntityDetails = async (
	request: PublicLabelsRequest,
	entityIds: string[],
	labelSet: string,
	version: string,
): Promise<{ profile: PublicEntityLabel; addresses: PublicEntityAddress[] }[]> =>
	mapWithConcurrency(
		entityIds,
		PUBLIC_LABELS_REQUEST_CONCURRENCY,
		async (entityId) => {
			const profilePath = `/labels/entities/${entityId}`;
			const [profileResponse, addresses] = await Promise.all([
				request<PublicEntityLabel>(profilePath, { labelSet, version }),
				fetchAllPublicLabelPages<PublicEntityAddress>(
					request,
					`/labels/entities/${entityId}/addresses`,
					{},
				),
			]);
			const profile = assertItemResponse(profileResponse, profilePath);
			if (profile.id !== entityId) {
				throw new Error(
					`Public Labels entity profile mismatch for ${entityId}`,
				);
			}
			if (
				addresses.some(
					(row) =>
						row.entityId !== entityId ||
						!ADDRESS_RE.test(row.address),
				)
			)
				throw new Error(
					`Invalid Public Labels entity addresses for ${entityId}`,
				);
			return { profile, addresses };
		},
	);

const mergeEntityProfiles = (
	listed: PublicEntityLabel[],
	profiles: PublicEntityLabel[],
): PublicEntityLabel[] => {
	const profilesById = new Map(
		profiles.map((profile) => [profile.id, profile]),
	);
	const listedIds = new Set(listed.map((entity) => entity.id));
	return [
		...listed.map((entity) => profilesById.get(entity.id) ?? entity),
		...profiles.filter((profile) => !listedIds.has(profile.id)),
	];
};

const collectEntityIds = (
	products: PublicProductLabel[],
	vaults: PublicVaultLabel[],
): string[] => {
	const entityIds = [
		...new Set([
			...products.flatMap((product) => [
				product.entityId,
				...(product.coBrandEntityIds ?? []),
			]),
			...vaults.flatMap((vault) => (vault.entityId ? [vault.entityId] : [])),
		]),
	];
	for (const entityId of entityIds) {
		if (!isSafeEntityId(entityId)) {
			throw new Error(`Invalid Public Labels entity ID ${entityId}`);
		}
	}
	return entityIds;
};

const assertResolvedVaultRows = (
	vaults: PublicVaultLabel[],
	chainId: number,
): void => {
	for (const row of vaults) {
		if (
			row.chainId !== chainId ||
			!ADDRESS_RE.test(row.address) ||
			!PUBLIC_VAULT_TYPES.includes(row.vaultType) ||
			typeof row.isEscrow !== "boolean" ||
			typeof row.deprecated !== "boolean" ||
			!Array.isArray(row.tags)
		)
			throw new Error("Invalid resolved vault labels");
	}
};

type PublicLabelsCollections<V extends PublicVaultLabel> = Omit<
	PublicLabelsMetadata,
	"vaults"
> & { vaults: V[] };

const fetchPublicLabelsCollections = async <V extends PublicVaultLabel>(
	request: PublicLabelsRequest,
	chainId: number,
	version: string,
	policies: PublicGeoPolicy[] | undefined,
	labelSet: string,
	vaultQuery: PublicLabelsQuery,
): Promise<PublicLabelsCollections<V>> => {
	validateLabelSet(labelSet);
	const scope = { labelSet, version, view: "resolved", chainId };
	const [vaults, products, entities, geoPolicies] = await Promise.all([
		fetchAllPublicLabelPages<V>(request, "/labels/vaults", {
			...scope,
			...vaultQuery,
		}),
		fetchAllPublicLabelPages<PublicProductLabel>(
			request,
			"/labels/products",
			scope,
		),
		fetchAllPublicLabelPages<PublicEntityLabel>(request, "/labels/entities", {
			labelSet,
			version,
		}),
		policies === undefined
			? fetchPublicGeoPolicies(request)
			: validatePublicGeoPolicies(policies),
	]);
	assertResolvedVaultRows(vaults, chainId);
	const entityDetails = await fetchEntityDetails(
		request,
		collectEntityIds(products, vaults),
		labelSet,
		version,
	);
	return {
		vaults,
		products,
		entities: mergeEntityProfiles(
			entities,
			entityDetails.map(({ profile }) => profile),
		),
		entityAddresses: entityDetails.flatMap(({ addresses }) => addresses),
		geoPolicies,
	};
};

export const fetchPublicLabelsMetadata = (
	request: PublicLabelsRequest,
	chainId: number,
	version: string,
	policies?: PublicGeoPolicy[],
	labelSet = "public",
): Promise<PublicLabelsMetadata> =>
	fetchPublicLabelsCollections<PublicVaultLabel>(
		request,
		chainId,
		version,
		policies,
		labelSet,
		{},
	);

const isVisibilitySummary = (
	value: Record<string, unknown>,
): value is Record<string, unknown> & PublicVaultVisibility =>
	typeof value.status === "string" &&
	VISIBILITY_STATUSES.includes(value.status) &&
	typeof value.explorableLend === "boolean" &&
	typeof value.explorableBorrow === "boolean" &&
	typeof value.decidedBy === "string" &&
	(value.reason === null || typeof value.reason === "string");

/** Null is a row v3 has not evaluated yet, not an error; it is read directly instead. */
const readAttachedVisibility = (value: unknown): PublicVaultVisibility | null => {
	if (value === null || value === undefined) return null;
	if (!isRecord(value) || !isVisibilitySummary(value))
		throw new Error("Invalid visibility summary");
	const { status, explorableLend, explorableBorrow, decidedBy, reason } = value;
	return { status, explorableLend, explorableBorrow, decidedBy, reason };
};

type PublicVaultLabelWithVisibility = PublicVaultLabel & {
	visibility?: unknown;
};

export const fetchPublicLabelsSource = async (
	request: PublicLabelsRequest,
	chainId: number,
	version: string,
	policies?: PublicGeoPolicy[],
	labelSet = "public",
): Promise<PublicLabelsSource> => {
	const { vaults: rows, ...collections } =
		await fetchPublicLabelsCollections<PublicVaultLabelWithVisibility>(
			request,
			chainId,
			version,
			policies,
			labelSet,
			{ include: "visibility" },
		);
	const labelled = rows.map(({ visibility, ...vault }) => ({
		vault,
		verdict: readAttachedVisibility(visibility),
	}));
	const attached = labelled.flatMap(({ vault, verdict }) =>
		verdict ? [[vault.address.toLowerCase(), verdict] as const] : [],
	);
	const unevaluated = [
		...new Map(
			labelled
				.filter(({ verdict }) => verdict === null)
				.map(({ vault }) => [vault.address.toLowerCase(), vault]),
		).values(),
	];
	const direct = await mapWithConcurrency(
		unevaluated,
		PUBLIC_LABELS_REQUEST_CONCURRENCY,
		async (vault) =>
			[
				vault.address.toLowerCase(),
				await fetchDirectVisibility(request, chainId, vault),
			] as const,
	);
	return {
		...collections,
		vaults: labelled.map(({ vault }) => vault),
		visibility: Object.fromEntries([...attached, ...direct]),
	};
};

const buildPublicLabelsRequest =
	(config: PublicLabelsV3AdapterConfig): PublicLabelsRequest =>
	async <T>(
		path: string,
		query: PublicLabelsQuery,
	): Promise<PublicLabelsResponse<T>> => {
		const relative = config.endpoint.startsWith("/");
		// The placeholder only parses relative URLs; it is never sent to fetch.
		const url = relative
			? new URL(config.endpoint, "https://euler-sdk.invalid")
			: new URL(config.endpoint);
		const basePath = url.pathname.replace(/\/+$/, "");
		// Browser proxy prefixes precede the full API path, including /v3.
		url.pathname = `${!relative && basePath.endsWith("/v3") ? basePath : `${basePath}/v3`}${path}`;
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}
		// Preserve explicit ports regardless of the browser's protocol.
		const authority = config.endpoint.match(/^\/{2,}[^/?#]*/)?.[0] ?? "";
		const requestUrl = relative
			? `${authority}${url.pathname}${url.search}${url.hash}`
			: url;

		const headers = new Headers({ accept: "application/json" });
		if (config.apiKey?.trim()) {
			headers.set("X-API-Key", config.apiKey.trim());
		}
		const response = await fetch(requestUrl, { headers });
		if (!response.ok) {
			throw new Error(
				`Public Labels V3 returned ${response.status} for ${path}`,
			);
		}
		return (await response.json()) as PublicLabelsResponse<T>;
	};

// Separate module loads and adapter instances without serializing source credentials.
const publicLabelsCacheNamespace = Math.random().toString(36).slice(2);
let nextPublicLabelsCacheId = 0;

class PublicLabelsV3Base {
	private readonly cacheScope = `${publicLabelsCacheNamespace}:${nextPublicLabelsCacheId++}`;
	queryPublicLabels: PublicLabelsRequest;
	protected readonly labelSet: string;
	protected readonly version: string;

	getQueryKeyPublicLabels(path: string, query: PublicLabelsQuery): string | null {
		return serializeQueryArgs([this.cacheScope, path, query]);
	}

	constructor(config: PublicLabelsV3AdapterConfig, buildQuery?: BuildQueryFn) {
		this.labelSet = validateLabelSet(config.labelSet?.trim() || "public");
		this.version = config.version?.trim() || PUBLIC_LABELS_RUNTIME_VERSION;
		if (
			this.version !== PUBLIC_LABELS_RUNTIME_VERSION &&
			!isPublishedVersionKey(this.version)
		)
			throw new Error("Invalid Public Labels version");
		this.queryPublicLabels = config.request ?? buildPublicLabelsRequest(config);
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}
}

export class PublicLabelsV3Adapter extends PublicLabelsV3Base {
	async fetchPublicLabelsSnapshot(
		chainId: number,
		version = this.version,
		geoPolicies?: PublicGeoPolicy[],
	): Promise<PublicLabelsSnapshot> {
		const resolvedVersion = await resolvePublicLabelsVersion(
			this.queryPublicLabels,
			version,
			this.labelSet,
		);
		const publicLabels = await fetchPublicLabelsSource(
			this.queryPublicLabels,
			chainId,
			resolvedVersion,
			geoPolicies,
			this.labelSet,
		);
		return { labelSet: this.labelSet, version: resolvedVersion, publicLabels };
	}

	async fetchPublicEulerLabelsData(
		chainId: number,
		version = this.version,
	): Promise<PublicEulerLabelsData> {
		const snapshot = await this.fetchPublicLabelsSnapshot(chainId, version);
		return normalizePublicLabelsData(chainId, snapshot.publicLabels);
	}
}

/** Published metadata only: never asks for visibility, attached or direct. */
export class PublicLabelsV3MetadataAdapter extends PublicLabelsV3Base {
	async fetchPublicLabelsSnapshot(
		chainId: number,
		version = this.version,
		geoPolicies?: PublicGeoPolicy[],
	): Promise<PublicLabelsMetadataSnapshot> {
		const resolvedVersion = await resolvePublicLabelsVersion(
			this.queryPublicLabels,
			version,
			this.labelSet,
		);
		const publicLabels = await fetchPublicLabelsMetadata(
			this.queryPublicLabels,
			chainId,
			resolvedVersion,
			geoPolicies,
			this.labelSet,
		);
		return {
			source: "v3-metadata",
			labelSet: this.labelSet,
			version: resolvedVersion,
			publicLabels,
		};
	}
}
