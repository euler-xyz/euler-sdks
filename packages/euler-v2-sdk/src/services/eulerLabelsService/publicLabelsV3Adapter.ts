import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
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
	type PublicLabelsSnapshot,
	type PublicLabelsSource,
	type PublicLabelsV3AdapterConfig,
	type PublicProductLabel,
	type PublicVaultLabel,
	type PublicVaultVisibility,
	type PublishedLabelVersion,
} from "./publicLabelsV3Types.js";

const MAX_PUBLIC_LABEL_RECORDS = 10_000;
const ENTITY_ADDRESS_CONCURRENCY = 8;
const VERSION_KEY_RE = /^v[0-9]{17}$/;

const isNonNegativeInteger = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

const assertListResponse = <T>(
	response: PublicLabelsResponse<T[]>,
	path: string,
): { items: T[]; total: number } => {
	if (!response || !Array.isArray(response.data)) {
		throw new Error(`Invalid Public Labels response for ${path}`);
	}
	const total = response.meta?.total;
	if (!isNonNegativeInteger(total) || total > MAX_PUBLIC_LABEL_RECORDS) {
		throw new Error(`Invalid Public Labels total for ${path}`);
	}
	return { items: response.data, total };
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
		const { items, total } = assertListResponse(response, path);
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

/** Validate before caching: unavailable or malformed policy data is never an empty policy. */
export const validatePublicGeoPolicies = (
	value: unknown,
): PublicGeoPolicy[] => {
	if (!Array.isArray(value)) throw new Error("Invalid geo policies");
	const ids = new Set<string>();
	for (const row of value) {
		if (
			!row ||
			typeof row.id !== "string" ||
			ids.has(row.id) ||
			!["block", "restrict"].includes(row.policyType) ||
			!(
				row.chainId === null ||
				(Number.isInteger(row.chainId) && row.chainId > 0)
			) ||
			!(
				row.productId === null ||
				(typeof row.productId === "string" && row.productId.length > 0)
			) ||
			!Array.isArray(row.countriesResolved) ||
			!row.countriesResolved.every(
				(code: unknown) => typeof code === "string" && /^[A-Z]{2}$/.test(code),
			)
		) {
			throw new Error("Invalid geo policy scope or countriesResolved");
		}
		ids.add(row.id);
		for (const field of ["vaultAddress", "assetAddress"] as const) {
			if (
				row[field] !== null &&
				(typeof row[field] !== "string" ||
					!/^0x[0-9a-fA-F]{40}$/.test(row[field]))
			)
				throw new Error("Invalid geo policy address");
		}
		if (
			row.chainId === null &&
			(row.productId || row.vaultAddress || row.assetAddress)
		)
			throw new Error("Geo policy address/product requires a chain");
		for (const field of ["assetSymbols", "assetNames"] as const) {
			if (
				row[field] != null &&
				(!Array.isArray(row[field]) ||
					!row[field].every((item: unknown) => typeof item === "string"))
			)
				throw new Error("Invalid geo policy asset selector");
		}
		for (const field of ["assetSymbolRegex", "assetNameRegex"] as const) {
			if (row[field] != null) {
				if (typeof row[field] !== "string" || row[field].length > 512)
					throw new Error("Invalid geo policy regex");
				new RegExp(row[field], "i");
			}
		}
	}
	return value as PublicGeoPolicy[];
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

export const resolvePublicLabelsVersion = async (
	request: PublicLabelsRequest,
	requestedVersion = PUBLIC_LABELS_RUNTIME_VERSION,
): Promise<string> => {
	if (requestedVersion !== PUBLIC_LABELS_RUNTIME_VERSION) {
		if (!VERSION_KEY_RE.test(requestedVersion)) {
			throw new Error(`Invalid Public Labels version ${requestedVersion}`);
		}
		return requestedVersion;
	}

	const response = await request<PublishedLabelVersion[]>(
		"/labels/sets/public/versions",
		{},
	);
	if (!Array.isArray(response.data)) {
		throw new Error("Invalid Public Labels versions response");
	}
	const published = response.data.find(
		(version) =>
			version.status === "published" &&
			(version.isLatest === true ||
				version.aliases?.includes(PUBLIC_LABELS_RUNTIME_VERSION)),
	);
	if (!published?.versionKey || !VERSION_KEY_RE.test(published.versionKey)) {
		throw new Error("Public Labels latest alias is unavailable");
	}
	return published.versionKey;
};

export const fetchPublicLabelsSource = async (
	request: PublicLabelsRequest,
	chainId: number,
	version: string,
	policies?: PublicGeoPolicy[],
): Promise<PublicLabelsSource> => {
	const [vaults, products, entities, geoPolicies, evk, earn] =
		await Promise.all([
			fetchAllPublicLabelPages<PublicVaultLabel>(request, "/labels/vaults", {
				version,
				view: "resolved",
				chainId,
			}),
			fetchAllPublicLabelPages<PublicProductLabel>(
				request,
				"/labels/products",
				{
					version,
					view: "resolved",
					chainId,
				},
			),
			fetchAllPublicLabelPages<PublicEntityLabel>(request, "/labels/entities", {
				version,
			}),
			policies === undefined
				? fetchPublicGeoPolicies(request)
				: validatePublicGeoPolicies(policies),
			fetchAllPublicLabelPages<{
				chainId: number;
				address: string;
				visibility: PublicVaultVisibility;
			}>(request, "/evk/vaults", {
				chainId,
				visibility: "visible,warning,hidden,pending_review",
			}),
			fetchAllPublicLabelPages<{
				chainId: number;
				address: string;
				visibility: PublicVaultVisibility;
			}>(request, "/earn/vaults", {
				chainId,
				visibility: "visible,warning,hidden,pending_review",
			}),
		]);

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

	const entityDetails = await mapWithConcurrency(
		entityIds,
		ENTITY_ADDRESS_CONCURRENCY,
		async (entityId) => {
			const profilePath = `/labels/entities/${entityId}`;
			const [profileResponse, addresses] = await Promise.all([
				request<PublicEntityLabel>(profilePath, { version }),
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
			return { profile, addresses };
		},
	);
	const profilesById = new Map(
		entityDetails.map(({ profile }) => [profile.id, profile]),
	);
	const mergedEntities = entities.map(
		(entity) => profilesById.get(entity.id) ?? entity,
	);
	const listedEntityIds = new Set(entities.map((entity) => entity.id));
	for (const { profile } of entityDetails) {
		if (!listedEntityIds.has(profile.id)) mergedEntities.push(profile);
	}

	const visibility: Record<string, PublicVaultVisibility> = {};
	for (const row of [...evk, ...earn]) {
		if (row.chainId !== chainId || !/^0x[0-9a-fA-F]{40}$/.test(row.address))
			throw new Error("Invalid visibility identity");
		const verdict = row.visibility;
		if (
			!verdict ||
			!["visible", "warning", "hidden", "pending_review"].includes(
				verdict.status,
			) ||
			typeof verdict.explorableLend !== "boolean" ||
			typeof verdict.explorableBorrow !== "boolean" ||
			typeof verdict.decidedBy !== "string"
		)
			throw new Error("Invalid visibility summary");
		visibility[row.address.toLowerCase()] = verdict;
	}
	for (const row of vaults) {
		if (
			row.chainId !== chainId ||
			typeof row.deprecated !== "boolean" ||
			!Array.isArray(row.tags)
		)
			throw new Error("Invalid resolved vault labels");
	}
	for (const policy of geoPolicies) {
		if (!Array.isArray(policy.countriesResolved))
			throw new Error("Geo country resolution unavailable");
	}
	return {
		visibility,
		vaults,
		products,
		entities: mergedEntities,
		entityAddresses: entityDetails.flatMap(({ addresses }) => addresses),
		geoPolicies,
	};
};

const buildPublicLabelsRequest =
	(config: PublicLabelsV3AdapterConfig): PublicLabelsRequest =>
	async <T>(
		path: string,
		query: PublicLabelsQuery,
	): Promise<PublicLabelsResponse<T>> => {
		const url = new URL(config.endpoint);
		const basePath = url.pathname.replace(/\/+$/, "");
		url.pathname = `${basePath.endsWith("/v3") ? basePath : `${basePath}/v3`}${path}`;
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}

		const headers = new Headers({ accept: "application/json" });
		if (config.apiKey?.trim()) {
			headers.set("X-API-Key", config.apiKey.trim());
		}
		const response = await fetch(url, { headers });
		if (!response.ok) {
			throw new Error(
				`Public Labels V3 returned ${response.status} for ${path}`,
			);
		}
		return (await response.json()) as PublicLabelsResponse<T>;
	};

export class PublicLabelsV3Adapter {
	queryPublicLabels: PublicLabelsRequest;

	constructor(config: PublicLabelsV3AdapterConfig, buildQuery?: BuildQueryFn) {
		this.queryPublicLabels = config.request ?? buildPublicLabelsRequest(config);
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	async fetchPublicLabelsSnapshot(
		chainId: number,
		version = PUBLIC_LABELS_RUNTIME_VERSION,
		geoPolicies?: PublicGeoPolicy[],
	): Promise<PublicLabelsSnapshot> {
		const resolvedVersion = await resolvePublicLabelsVersion(
			this.queryPublicLabels,
			version,
		);
		const publicLabels = await fetchPublicLabelsSource(
			this.queryPublicLabels,
			chainId,
			resolvedVersion,
			geoPolicies,
		);
		return { version: resolvedVersion, publicLabels };
	}

	async fetchPublicEulerLabelsData(
		chainId: number,
		version = PUBLIC_LABELS_RUNTIME_VERSION,
	): Promise<PublicEulerLabelsData> {
		const snapshot = await this.fetchPublicLabelsSnapshot(chainId, version);
		return normalizePublicLabelsData(chainId, snapshot.publicLabels);
	}
}
