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

	while (true) {
		const response = await request<T[]>(path, {
			...query,
			limit: PUBLIC_LABELS_PAGE_SIZE,
			offset,
		});
		const { items, total } = assertListResponse(response, path);
		result.push(...items);

		if (result.length >= total) return result.slice(0, total);
		if (items.length === 0) {
			throw new Error(`Public Labels pagination stalled for ${path}`);
		}
		offset += items.length;
	}
};

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
		"/label-sets/public/versions",
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
): Promise<PublicLabelsSource> => {
	const [vaults, products, entities, geoPolicies] = await Promise.all([
		fetchAllPublicLabelPages<PublicVaultLabel>(request, "/curation/vaults", {
			version,
			chainId,
		}),
		fetchAllPublicLabelPages<PublicProductLabel>(request, "/products", {
			version,
			chainId,
		}),
		fetchAllPublicLabelPages<PublicEntityLabel>(request, "/entities", {
			version,
		}),
		fetchAllPublicLabelPages<PublicGeoPolicy>(request, "/geo-policies", {
			version,
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
			const profilePath = `/entities/${entityId}`;
			const [profileResponse, addresses] = await Promise.all([
				request<PublicEntityLabel>(profilePath, { version }),
				fetchAllPublicLabelPages<PublicEntityAddress>(
					request,
					`/entities/${entityId}/addresses`,
					{ chainId, version },
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

	return {
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
	): Promise<PublicLabelsSnapshot> {
		const resolvedVersion = await resolvePublicLabelsVersion(
			this.queryPublicLabels,
			version,
		);
		const publicLabels = await fetchPublicLabelsSource(
			this.queryPublicLabels,
			chainId,
			resolvedVersion,
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
