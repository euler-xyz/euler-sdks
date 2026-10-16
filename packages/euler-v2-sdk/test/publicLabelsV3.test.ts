import { PublicLabelsV3MetadataAdapter, normalizePublicLabelsMetadata } from "../src/index.js";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PublicLabelsV3Adapter,
	fetchPublicGeoPolicies,
	validatePublicGeoPolicies,
	fetchAllPublicLabelPages,
	getEulerLabelProductBrandEntityKeys,
	hasPublishedVaultLabelContent,
	getEulerLabelVaultNotice,
	isEulerLabelVaultDeprecated,
	isEulerLabelVaultNotExplorableLend,
	isEulerLabelVaultNotExplorableBorrow,
	isEulerLabelVaultRecentlyAdded,
	normalizePublicLabelsData,
	type PublicLabelsQuery,
	type PublicLabelsRequest,
	type PublicLabelsResponse,
} from "../src/index.js";
import {
	ASSESSMENT_ONLY_EVK,
	KPK_GOVERNOR,
	KPK_VAULT,
	NEUTRAL_ESCROW,
	PUBLIC_LABELS_FIXTURE_VERSION,
	publicLabelsFixture,
} from "./fixtures/publicLabelsV3.js";

const response = <T>(data: T, total?: number): PublicLabelsResponse<T> => ({
	data,
	meta: {
		...(total !== undefined && { total }),
		timestamp: "2026-08-04T15:13:05.236Z",
	},
});

const fixtureRequest = (options?: { productEntityId?: string; labelSet?: string }) => {
	const request = vi.fn(
		async (path: string, query: PublicLabelsQuery): Promise<unknown> => {
			if (path === `/labels/sets/${options?.labelSet ?? "public"}/versions`) {
				return response([
					{
						versionKey: PUBLIC_LABELS_FIXTURE_VERSION,
						status: "published",
						aliases: ["latest"],
						isLatest: true,
					},
				]);
			}
			if (path === "/labels/vaults") {
				const rows =
					query.include === "visibility"
						? publicLabelsFixture.vaults.map((vault) => ({
								...vault,
								visibility:
									publicLabelsFixture.visibility[vault.address.toLowerCase()] ??
									null,
							}))
						: publicLabelsFixture.vaults;
				return response(rows, rows.length);
			}
			if (path === "/labels/products") {
				const products = options?.productEntityId
					? publicLabelsFixture.products.map((product) => ({
							...product,
							entityId: options.productEntityId!,
						}))
					: publicLabelsFixture.products;
				return response(products, products.length);
			}
			if (path === "/labels/entities") {
				return response(
					publicLabelsFixture.entities,
					publicLabelsFixture.entities.length,
				);
			}
			if (path.endsWith("/visibility")) return response({
				chainId: 1, vaultAddress: path.split("/")[4],
				status: "pending_review", checks: { evaluated: false },
			});
			if (path === "/geo-policies") {
				return response(
					publicLabelsFixture.geoPolicies,
					publicLabelsFixture.geoPolicies.length,
				);
			}
			if (
				path.startsWith("/labels/entities/") &&
				!path.endsWith("/addresses")
			) {
				const entityId = path.split("/")[3];
				const entity = publicLabelsFixture.entities.find(
					(entry) => entry.id === entityId,
				);
				if (!entity) throw new Error(`Unknown fixture entity ${entityId}`);
				return response(entity);
			}
			if (path.startsWith("/labels/entities/") && path.endsWith("/addresses")) {
				const entityId = path.split("/")[3];
				const rows = publicLabelsFixture.entityAddresses.filter(
					(entry) => entry.entityId === entityId,
				);
				return response(rows, rows.length);
			}
			throw new Error(`Unexpected Public Labels path ${path} ${query.version}`);
		},
	);
	return request as unknown as PublicLabelsRequest & typeof request;
};

describe("PublicLabelsV3Adapter", () => {
	it("resolves latest once and pins metadata while reading live policies and verdicts", async () => {
		const request = fixtureRequest();
		const adapter = new PublicLabelsV3Adapter({
			endpoint: "https://v3.example.test",
			request,
		});

		const snapshot = await adapter.fetchPublicLabelsSnapshot(1);

		expect(snapshot.version).toBe(PUBLIC_LABELS_FIXTURE_VERSION);
		expect(snapshot.publicLabels).toEqual({ ...publicLabelsFixture, visibility: {
			...publicLabelsFixture.visibility,
			...Object.fromEntries([ASSESSMENT_ONLY_EVK, NEUTRAL_ESCROW].map(address => [address.toLowerCase(), {
				status: "pending_review", decidedBy: "awaiting-verification", reason: null,
				explorableLend: false, explorableBorrow: false,
			}])),
		} });
		expect(request).toHaveBeenCalledWith("/labels/sets/public/versions", {});
		expect(
			request.mock.calls
				.filter(
					([path]) =>
						path.startsWith("/labels/") &&
						path !== "/labels/sets/public/versions" &&
						!path.endsWith("/addresses"),
				)
				.every(([, query]) => query.version === PUBLIC_LABELS_FIXTURE_VERSION),
		).toBe(true);
		expect(request).toHaveBeenCalledWith("/labels/vaults", {
			labelSet: "public",
			chainId: 1,
			version: PUBLIC_LABELS_FIXTURE_VERSION,
			view: "resolved",
			include: "visibility",
			limit: 100,
			offset: 0,
		});
		expect(request).toHaveBeenCalledWith("/labels/products", {
			labelSet: "public",
			chainId: 1,
			version: PUBLIC_LABELS_FIXTURE_VERSION,
			view: "resolved",
			limit: 100,
			offset: 0,
		});
		expect(request).toHaveBeenCalledWith("/geo-policies", {
			limit: 100,
			offset: 0,
		});
		expect(request).toHaveBeenCalledWith("/labels/entities/kpk/addresses", {
			limit: 100,
			offset: 0,
		});
		expect(
			request.mock.calls.some(
				([path]) => path === "/evk/vaults" || path === "/earn/vaults",
			),
		).toBe(false);
		expect(request).toHaveBeenCalledWith(
			`/evk/vaults/1/${ASSESSMENT_ONLY_EVK.toLowerCase()}/visibility`,
			{},
		);
		expect(request).toHaveBeenCalledWith(
			`/evk/vaults/1/${NEUTRAL_ESCROW.toLowerCase()}/visibility`,
			{},
		);
		expect(request).not.toHaveBeenCalledWith(
			`/evk/vaults/1/${KPK_VAULT.toLowerCase()}/visibility`,
			{},
		);
		expect(request).toHaveBeenCalledWith(`/labels/entities/kpk`, {
			labelSet: "public",
			version: PUBLIC_LABELS_FIXTURE_VERSION,
		});
		expect(request).toHaveBeenCalledWith(`/labels/entities/securitize`, {
			labelSet: "public",
			version: PUBLIC_LABELS_FIXTURE_VERSION,
		});
	});

	it("selects alternate-set metadata while leaving live reads unscoped", async () => {
		const request = fixtureRequest({ labelSet: "test-instance" });
		const adapter = new PublicLabelsV3Adapter({ endpoint: "https://v3.test", labelSet: "test-instance", request });
		const snapshot = await adapter.fetchPublicLabelsSnapshot(1);
		expect(snapshot.labelSet).toBe("test-instance");
		expect(request).toHaveBeenCalledWith("/labels/sets/test-instance/versions", {});
		for (const [path, query] of request.mock.calls) {
			const metadata = path.startsWith("/labels/") && !path.includes("/sets/") && !path.endsWith("/addresses");
			expect(query.labelSet).toBe(metadata ? "test-instance" : undefined);
			if (metadata) expect(query.version).toBe(PUBLIC_LABELS_FIXTURE_VERSION);
		}
	});

	it.each(["latest", "test-2026-06-30"])("resolves %s to a named published key in the selected set", async (version) => {
		const base = fixtureRequest({ labelSet: "test-instance" });
		const request = vi.fn(async (path: string, query: PublicLabelsQuery) => path.endsWith("/versions")
			? response([{ versionKey: "test-2026-06-30", status: "published", isLatest: true }])
			: base(path, query));
		const adapter = new PublicLabelsV3Adapter({ endpoint: "https://v3.test", labelSet: "test-instance", version, request: request as PublicLabelsRequest });
		expect((await adapter.fetchPublicLabelsSnapshot(1)).version).toBe("test-2026-06-30");
		expect(request).toHaveBeenCalledWith("/labels/vaults", expect.objectContaining({ labelSet: "test-instance", version: "test-2026-06-30" }));
	});

	it("uses the configured publication by default and permits an explicit override", async () => {
		const request = fixtureRequest();
		const adapter = new PublicLabelsV3Adapter({ endpoint: "https://v3.test", version: PUBLIC_LABELS_FIXTURE_VERSION, request });
		const pinned = await adapter.fetchPublicLabelsSnapshot(1);
		expect(pinned.version).toBe(PUBLIC_LABELS_FIXTURE_VERSION);
		expect(request).toHaveBeenCalledWith("/labels/vaults", expect.objectContaining({ version: PUBLIC_LABELS_FIXTURE_VERSION }));
		expect(request.mock.calls.filter(([path]) => path === "/labels/sets/public/versions")).toHaveLength(1);
		const latest = await adapter.fetchPublicLabelsSnapshot(1, "latest");
		expect(latest.version).toBe(PUBLIC_LABELS_FIXTURE_VERSION);
		expect(request.mock.calls.filter(([path]) => path === "/labels/sets/public/versions")).toHaveLength(2);
	});

	it("does not fall back to public when the selected set has no publication", async () => {
		const request = vi.fn(async () => response([]));
		const adapter = new PublicLabelsV3Adapter({ endpoint: "https://v3.test", labelSet: "empty", request: request as PublicLabelsRequest });
		await expect(adapter.fetchPublicLabelsSnapshot(1)).rejects.toThrow("latest alias is unavailable");
		expect(request).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith("/labels/sets/empty/versions", {});
	});

	it.each(["../public", "public?version=draft", "x".repeat(101)])("rejects invalid set %s before requesting", (labelSet) => {
		expect(() => new PublicLabelsV3Adapter({ endpoint: "https://v3.test", labelSet })).toThrow("Invalid Public Labels set");
	});
	it.each(["draft", "current", "bad version"])("rejects unsupported configured version %s", (version) => {
		expect(() => new PublicLabelsV3Adapter({ endpoint: "https://v3.test", version })).toThrow("Invalid Public Labels version");
	});

	it("confirms a concrete publication key in the selected set before reading labels", async () => {
		const request = fixtureRequest();
		const adapter = new PublicLabelsV3Adapter({
			endpoint: "https://v3.example.test/v3",
			request,
		});

		const snapshot = await adapter.fetchPublicLabelsSnapshot(1, PUBLIC_LABELS_FIXTURE_VERSION);

		expect(snapshot.version).toBe(PUBLIC_LABELS_FIXTURE_VERSION);
		expect(request.mock.calls[0]).toEqual(["/labels/sets/public/versions", {}]);
	});

	it.each(["v20260101000000000", "test-2026-06-30"])("refuses the unpublished key %s without reading labels", async (version) => {
		const request = fixtureRequest();
		const adapter = new PublicLabelsV3Adapter({ endpoint: "https://v3.test", request });

		await expect(adapter.fetchPublicLabelsSnapshot(1, version)).rejects.toThrow(
			`Public Labels publication ${version} is unavailable`,
		);
		expect(request.mock.calls.some(([path]) => path.startsWith("/labels/vaults"))).toBe(false);
	});

	it("follows list pagination through meta.total", async () => {
		const values = Array.from({ length: 101 }, (_, index) => index);
		const offsets: number[] = [];
		const request: PublicLabelsRequest = async <T>(
			_path: string,
			query: PublicLabelsQuery,
		): Promise<PublicLabelsResponse<T>> => {
			const offset = Number(query.offset);
			offsets.push(offset);
			return response(values.slice(offset, offset + 100) as T, values.length);
		};

		await expect(
			fetchAllPublicLabelPages<number>(request, "/labels/products", {
				version: PUBLIC_LABELS_FIXTURE_VERSION,
			}),
		).resolves.toEqual(values);
		expect(offsets).toEqual([0, 100]);
	});

	it("rejects totals changing between pages", async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce(
				response(
					Array.from({ length: 100 }, (_, i) => i),
					101,
				),
			)
			.mockResolvedValueOnce(
				response([100], 102),
			) as unknown as PublicLabelsRequest;
		await expect(
			fetchAllPublicLabelPages(request, "/labels/products", {}),
		).rejects.toThrow("changed during pagination");
	});
	it("rejects an oversized page instead of silently truncating", async () => {
		const request = vi
			.fn()
			.mockResolvedValue(response([1, 2], 1)) as unknown as PublicLabelsRequest;
		await expect(
			fetchAllPublicLabelPages(request, "/labels/products", {}),
		).rejects.toThrow("Invalid Public Labels page");
	});
	it.each([
		{ vaultType: "escrow" },
		{ isEscrow: undefined },
		{ isEscrow: "true" },
	])("rejects a vault row shaped %j", async (patch) => {
		const base = fixtureRequest();
		const request: PublicLabelsRequest = async <T>(path: string, query: PublicLabelsQuery) =>
			path === "/labels/vaults"
				? (response(
						publicLabelsFixture.vaults.map((vault, index) =>
							index === 0 ? { ...vault, ...patch } : vault,
						),
						publicLabelsFixture.vaults.length,
					) as PublicLabelsResponse<T>)
				: base<T>(path, query);
		const adapter = new PublicLabelsV3Adapter({ endpoint: "https://v3.test", request });

		await expect(
			adapter.fetchPublicLabelsSnapshot(1, PUBLIC_LABELS_FIXTURE_VERSION),
		).rejects.toThrow("Invalid resolved vault labels");
	});

	it("rejects a stalled pagination instead of looping", async () => {
		const request = vi
			.fn()
			.mockResolvedValue(response([], 1)) as unknown as PublicLabelsRequest;
		await expect(
			fetchAllPublicLabelPages(request, "/labels/products", {}),
		).rejects.toThrow("pagination stalled");
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("reads a direct verdict only for rows whose attached summary is null", async () => {
		const request = fixtureRequest();
		const snapshot = await new PublicLabelsV3Adapter({
			endpoint: "https://v3.test",
			request,
		}).fetchPublicLabelsSnapshot(1);

		const directReads = request.mock.calls
			.map(([path]) => path)
			.filter((path) => path.endsWith("/visibility"))
			.sort();
		expect(directReads).toEqual(
			[ASSESSMENT_ONLY_EVK, NEUTRAL_ESCROW]
				.map((address) => `/evk/vaults/1/${address.toLowerCase()}/visibility`)
				.sort(),
		);
		expect(snapshot.publicLabels.visibility[ASSESSMENT_ONLY_EVK.toLowerCase()]).toEqual({
			status: "pending_review",
			explorableLend: false,
			explorableBorrow: false,
			decidedBy: "awaiting-verification",
			reason: null,
		});
		expect(snapshot.publicLabels.visibility[KPK_VAULT.toLowerCase()]).toEqual(
			publicLabelsFixture.visibility[KPK_VAULT.toLowerCase()],
		);
		expect(snapshot.publicLabels.vaults.every((vault) => !("visibility" in vault))).toBe(true);
	});

	it("rejects unsafe entity IDs before constructing profile paths", async () => {
		const request = fixtureRequest({ productEntityId: "../unsafe" });
		const adapter = new PublicLabelsV3Adapter({
			endpoint: "https://v3.example.test",
			request,
		});

		await expect(
			adapter.fetchPublicLabelsSnapshot(1, PUBLIC_LABELS_FIXTURE_VERSION),
		).rejects.toThrow("Invalid Public Labels entity ID");
	});
});

describe("normalizePublicLabelsData", () => {
	it.each(["__proto__", "constructor"])(
		"retains product ID %s as an own entry in assessed and metadata labels",
		(productId) => {
			const source = {
				...publicLabelsFixture,
				products: publicLabelsFixture.products.map((product) => ({
					...product,
					id: productId,
				})),
				vaults: publicLabelsFixture.vaults.map((vault) =>
					vault.address === KPK_VAULT ? { ...vault, productId } : vault,
				),
			};
			const assessed = normalizePublicLabelsData(1, source);
			const metadata = normalizePublicLabelsMetadata(1, source);

			expect(Object.hasOwn(assessed.products, productId)).toBe(true);
			expect(assessed.products[productId]?.vaults).toContain(getAddress(KPK_VAULT));
			expect(assessed.verifiedVaultAddresses).toContain(getAddress(KPK_VAULT));
			expect(Object.hasOwn(metadata.products, productId)).toBe(true);
		},
	);

	it.each(["__proto__", "constructor"])(
		"rejects a vault referencing missing product ID %s",
		(productId) => {
			const source = {
				...publicLabelsFixture,
				products: [],
				vaults: publicLabelsFixture.vaults.map((vault) =>
					vault.address === KPK_VAULT ? { ...vault, productId } : vault,
				),
			};

			expect(() => normalizePublicLabelsData(1, source)).toThrow(
				`Public Labels vault references missing product ${productId}`,
			);
		},
	);

	it.each([
		"hidden",
		"pending_review",
	] as const)("keeps %s metadata without granting trusted membership", (status) => {
		const result = normalizePublicLabelsData(1, {
			...publicLabelsFixture,
			visibility: {
				[KPK_VAULT.toLowerCase()]: {
					status,
					explorableLend: false,
					explorableBorrow: false,
					decidedBy: "unclaimed",
					reason: null,
				},
			},
		});
		expect(result.verifiedVaultAddresses).not.toContain(getAddress(KPK_VAULT));
		expect(
			result.products["kpk-securitize"]?.vaultOverrides?.[getAddress(KPK_VAULT)]
				?.name,
		).toBe("KPK VBILL/USDC Lend");
	});
	it("verifies an entity-claimed vault without a product through the standalone path", () => {
		const unlabelled = publicLabelsFixture.vaults.find(
			(vault) => vault.address === ASSESSMENT_ONLY_EVK,
		)!;
		const result = normalizePublicLabelsData(1, {
			...publicLabelsFixture,
			vaults: [{ ...unlabelled, entityId: "kpk" }],
			visibility: {
				[ASSESSMENT_ONLY_EVK.toLowerCase()]: {
					status: "visible",
					explorableLend: true,
					explorableBorrow: true,
					decidedBy: "verified",
					reason: null,
				},
			},
		});

		expect(result.verifiedVaultAddresses).toEqual([getAddress(ASSESSMENT_ONLY_EVK)]);
		expect(result.managingEntityByVault[ASSESSMENT_ONLY_EVK.toLowerCase()]).toBe("kpk");
		expect(result.products[`__vault_${ASSESSMENT_ONLY_EVK.toLowerCase()}`]).toMatchObject({
			isStandalone: true,
			entity: "kpk",
			name: "",
			vaults: [getAddress(ASSESSMENT_ONLY_EVK)],
		});
	});

	it("counts a warning verdict decided by unassessable as verified", () => {
		const result = normalizePublicLabelsData(1, {
			...publicLabelsFixture,
			visibility: {
				[KPK_VAULT.toLowerCase()]: {
					status: "warning",
					explorableLend: true,
					explorableBorrow: true,
					decidedBy: "unassessable",
					reason: "No assessment is available for this vault yet",
				},
			},
		});

		expect(result.verifiedVaultAddresses).toEqual([getAddress(KPK_VAULT)]);
	});

	it("does not infer trusted membership from label content without a verdict", () => {
		expect(
			normalizePublicLabelsData(1, { ...publicLabelsFixture, visibility: {} })
				.verifiedVaultAddresses,
		).toEqual([]);
	});
	it("preserves resolved empty notices instead of inheriting product notices", () => {
		const result = normalizePublicLabelsData(1, {
			...publicLabelsFixture,
			products: publicLabelsFixture.products.map((p) => ({
				...p,
				portfolioNotice: "Product notice",
			})),
		});
		expect(
			result.products["kpk-securitize"]?.vaultOverrides?.[getAddress(KPK_VAULT)]
				?.portfolioNotice,
		).toBe("");
	});

	it("maps published V3 content into canonical SDK labels", () => {
		const result = normalizePublicLabelsData(1, publicLabelsFixture);
		const product = result.products["kpk-securitize"]!;

		expect(product.entity).toBe("kpk");
		expect(product.coBrandEntityIds).toEqual(["securitize"]);
		expect(getEulerLabelProductBrandEntityKeys(product)).toEqual([
			"kpk",
			"securitize",
		]);
		expect(result.entities.kpk?.logo).toBe(
			"https://v3.euler.finance/v3/images/labels/kpk",
		);
		expect(result.entities.kpk?.addresses).toEqual({
			[getAddress(KPK_GOVERNOR)]: "KPK Euler RWA Curation Safe",
		});
		expect(result.points[getAddress(KPK_VAULT)]).toEqual([
			{
				name: "KPK RWA points",
				logo: "https://v3.euler.finance/v3/images/labels/kpk",
				type: "deposit",
			},
		]);
		expect(result.rawGeoPolicies).toEqual(publicLabelsFixture.geoPolicies);
	});

	it("does not treat neutral escrow or assessment-only rows as labels", () => {
		const result = normalizePublicLabelsData(1, publicLabelsFixture);

		expect(result.verifiedVaultAddresses).not.toContain(
			getAddress(ASSESSMENT_ONLY_EVK),
		);
		expect(result.verifiedVaultAddresses).not.toContain(
			getAddress(NEUTRAL_ESCROW),
		);
		expect(Object.keys(result.products)).not.toContain(
			`__vault_${NEUTRAL_ESCROW.toLowerCase()}`,
		);
	});

	it("keeps an escrow row as inventory even with a name and a visible verdict", () => {
		const escrow = publicLabelsFixture.vaults.find(
			(vault) => vault.address === NEUTRAL_ESCROW,
		)!;
		const source = {
			...publicLabelsFixture,
			vaults: [{ ...escrow, name: "Escrow WETH" }],
			visibility: {
				[NEUTRAL_ESCROW.toLowerCase()]: {
					status: "visible" as const,
					explorableLend: true,
					explorableBorrow: false,
					decidedBy: "escrow",
					reason: null,
				},
			},
		};

		expect(normalizePublicLabelsData(1, source).verifiedVaultAddresses).toEqual([]);
		expect(Object.keys(normalizePublicLabelsData(1, source).products)).toEqual([
			"kpk-securitize",
		]);
		expect(normalizePublicLabelsMetadata(1, source).candidateVaultAddresses).toEqual([]);
	});

	describe("standalone grouping", () => {
		const unlabelled = publicLabelsFixture.vaults.find(
			(vault) => vault.address === ASSESSMENT_ONLY_EVK,
		)!;
		const key = `__vault_${ASSESSMENT_ONLY_EVK.toLowerCase()}`;
		const normalize = (patch: Partial<typeof unlabelled>) =>
			normalizePublicLabelsData(1, {
				...publicLabelsFixture,
				vaults: [{ ...unlabelled, ...patch }],
			});

		it.each([
			{ tags: ["recently added"] },
			{ deprecated: true, deprecationReason: "Retired" },
			{ portfolioNotice: "Platform notice" },
			{ campaigns: [{ name: "Points", logo: null, type: "deposit" as const }] },
		])("does not create a nameless product from %j", (patch) => {
			expect(hasPublishedVaultLabelContent({ ...unlabelled, ...patch })).toBe(false);
			expect(normalize(patch).products).not.toHaveProperty(key);
		});

		it("still records campaigns as points without a product", () => {
			const result = normalize({
				campaigns: [{ name: "Points", logo: null, type: "deposit" as const }],
			});
			expect(result.points[getAddress(ASSESSMENT_ONLY_EVK)]).toEqual([
				{ name: "Points", logo: "", type: "deposit" },
			]);
		});

		it("retains operational annotations without creating a nameless product", () => {
			const data = normalize({
				deprecated: true,
				deprecationReason: "Retired",
				portfolioNotice: "Withdraw when possible",
				tags: ["recently added"],
			});
			expect(data.products).not.toHaveProperty(key);
			expect(data.vaultAnnotations?.[ASSESSMENT_ONLY_EVK.toLowerCase()]).toMatchObject({
				deprecated: true, deprecationReason: "Retired", portfolioNotice: "Withdraw when possible",
				tags: ["recently added"],
			});
			expect(isEulerLabelVaultDeprecated(data, ASSESSMENT_ONLY_EVK)).toBe(true);
			expect(getEulerLabelVaultNotice(data, ASSESSMENT_ONLY_EVK)).toBe("Withdraw when possible");
			expect(isEulerLabelVaultRecentlyAdded(data, ASSESSMENT_ONLY_EVK)).toBe(true);
		});

		it.each([
			{ name: "Named vault" },
			{ description: "Described vault" },
			{ entityId: "kpk" },
		])("groups a vault with %j standalone, tags on its override", (patch) => {
			const product = normalize({ ...patch, tags: ["recently added"], deprecated: true }).products[key]!;
			expect(hasPublishedVaultLabelContent({ ...unlabelled, ...patch })).toBe(true);
			expect(product.isStandalone).toBe(true);
			expect(product.vaults).toEqual([]);
			expect(product.deprecatedVaults).toEqual([getAddress(ASSESSMENT_ONLY_EVK)]);
			expect(product.vaultOverrides?.[getAddress(ASSESSMENT_ONLY_EVK)]?.tags).toEqual([
				"recently added",
			]);
		});
	});

	it("keeps mixed vault tags scoped to their vault overrides", () => {
		const sibling = {
			...publicLabelsFixture.vaults[0]!,
			address: "0x00000000000000000000000000000000000000C1",
			tags: [],
		};
		const result = normalizePublicLabelsData(1, {
			...publicLabelsFixture,
			vaults: [publicLabelsFixture.vaults[0]!, sibling],
		});
		const product = result.products["kpk-securitize"]!;

		expect(product.tags).toBeUndefined();
		expect(product.vaultOverrides?.[getAddress(KPK_VAULT)]?.tags).toContain(
			"recently added",
		);
		expect(
			product.vaultOverrides?.[getAddress(sibling.address)]?.tags,
		).toBeUndefined();
	});

	it("drops non-http profile and campaign URLs", () => {
		const result = normalizePublicLabelsData(1, {
			...publicLabelsFixture,
			entities: publicLabelsFixture.entities.map((entity, index) =>
				index === 0
					? {
							...entity,
							logo: "data:image/svg+xml,bad",
							url: "javascript:alert(1)",
							socialTwitter: "file:///tmp/bad",
						}
					: entity,
			),
			vaults: publicLabelsFixture.vaults.map((vault, index) =>
				index === 0
					? {
							...vault,
							campaigns: [
								{
									name: "Unsafe",
									logo: "javascript:alert(1)",
									type: "deposit" as const,
								},
							],
						}
					: vault,
			),
		});

		expect(result.entities.kpk?.logo).toBe("");
		expect(result.entities.kpk?.url).toBe("");
		expect(result.entities.kpk?.social.twitter).toBe("");
		expect(result.points[getAddress(KPK_VAULT)]?.[0]?.logo).toBe("");
	});
});


describe("live geo policy transport", () => {
  it("distinguishes authored empty from malformed policy data", () => {
    expect(validatePublicGeoPolicies([])).toEqual([]);
    expect(() => validatePublicGeoPolicies(undefined)).toThrow();
    for (const patch of [{ countriesResolved: undefined }, { countriesResolved: ["EEA"] }, { policyType: "allow" }, { assetNameRegex: "[" }, { chainId: null, productId: "p" }]) {
      expect(() => validatePublicGeoPolicies([{ ...publicLabelsFixture.geoPolicies[0], ...patch }])).toThrow();
    }
  });
  it("returns validated copies rather than the caller's rows", () => {
    const rows = structuredClone(publicLabelsFixture.geoPolicies);
    const validated = validatePublicGeoPolicies(rows);
    expect(validated).toEqual(publicLabelsFixture.geoPolicies);
    expect(validated).not.toBe(rows);
    expect(validated[0]).not.toBe(rows[0]);
  });
  it.each([
    [[publicLabelsFixture.geoPolicies[0], publicLabelsFixture.geoPolicies[0]], "Duplicate geo policy id"],
    [["not-a-row"], "Invalid geo policy row"],
    [[{ ...publicLabelsFixture.geoPolicies[0], countries: "DE" }], "Invalid geo policy row"],
    [[{ ...publicLabelsFixture.geoPolicies[0], vaultAddress: "0x12" }], "Invalid geo policy address"],
    [[{ ...publicLabelsFixture.geoPolicies[0], assetSymbols: [1] }], "Invalid geo policy asset selector"],
    [[{ ...publicLabelsFixture.geoPolicies[0], assetSymbolRegex: "x".repeat(513) }], "Invalid geo policy regex"],
  ])("rejects %j with %s", (rows, message) => {
    expect(() => validatePublicGeoPolicies(rows)).toThrow(message);
  });
  it("reads all chains without a metadata version selector", async () => {
    const request = vi.fn(async () => response([], 0)) as PublicLabelsRequest;
    expect(await fetchPublicGeoPolicies(request)).toEqual([]);
    expect(request).toHaveBeenCalledWith("/geo-policies", { limit: 100, offset: 0 });
  });
});


describe("direct visibility coverage", () => {
	const address = KPK_VAULT.toLowerCase();
	const direct = (overrides = {}) => ({ chainId: 1, vaultAddress: address,
		status: "visible", checks: { decidedBy: "verified", notExplorableLend: false,
			listing: { lend: { hidden: true }, borrow: { hidden: false } } }, ...overrides });
	const adapter = (verdict: unknown, fail = false) => {
		const base = fixtureRequest();
		const request: PublicLabelsRequest = async <T>(path: string, query: PublicLabelsQuery) => {
			if (path === "/labels/vaults")
				return response(
					publicLabelsFixture.vaults.map((vault) => ({ ...vault, visibility: null })),
					publicLabelsFixture.vaults.length,
				) as PublicLabelsResponse<T>;
			if (path === `/evk/vaults/1/${address}/visibility`) {
				if (fail) throw new Error("upstream unavailable");
				return response(verdict) as PublicLabelsResponse<T>;
			}
			return base<T>(path, query);
		};
		return new PublicLabelsV3Adapter({ endpoint: "https://example.com", request });
	};
	it("restores missing membership while preserving effective listing over raw flags", async () => {
		const result = await adapter(direct()).fetchPublicEulerLabelsData(1);
		expect(result.visibility[address]).toEqual({status: "visible", decidedBy: "verified",
			reason: null, explorableLend: false, explorableBorrow: true});
		expect(result.managingEntityByVault[address]).toBe("kpk");
	});
	it.each(["hidden", "pending_review"])("keeps %s verdicts out of discovery", async (status) => {
		const result = await adapter(direct({status})).fetchPublicEulerLabelsData(1);
		expect(result.visibility[address].explorableBorrow).toBe(false);
	});
	it.each([
		{chainId: 10}, {vaultAddress: NEUTRAL_ESCROW}, {status: "bogus"},
		{checks: {listing: {lend: {hidden: "false"}}}},
	])("rejects malformed or mismatched verdicts %j", async (override) => {
		await expect(adapter(direct(override)).fetchPublicLabelsSnapshot(1)).rejects.toThrow("Invalid direct visibility");
	});
	it("propagates upstream failure instead of caching an incomplete snapshot", async () => {
		await expect(adapter(direct(), true).fetchPublicLabelsSnapshot(1)).rejects.toThrow("upstream unavailable");
	});
	it("does not fetch a direct verdict when the labels row already carries one", async () => {
		const request = fixtureRequest();
		await new PublicLabelsV3Adapter({endpoint: "https://example.com", request}).fetchPublicLabelsSnapshot(1);
		expect(request.mock.calls.some(([path]) => path === `/evk/vaults/1/${address}/visibility`)).toBe(false);
	});
});

 describe("metadata-only V3 adapter", () => {
  it("pins metadata and keeps live addresses/geo without calling assessments", async () => {
    const transport = fixtureRequest();
    const request: PublicLabelsRequest = (path, query) => {
      if (path.startsWith("/evk/") || path.startsWith("/earn/")) throw new Error("CHAIN_NOT_SUPPORTED");
      return transport(path, query);
    };
    const adapter = new PublicLabelsV3MetadataAdapter({ endpoint: "https://v3.example.test", request });
    const snapshot = await adapter.fetchPublicLabelsSnapshot(1);
    expect(snapshot.source).toBe("v3-metadata");
    expect(snapshot.version).toBe(PUBLIC_LABELS_FIXTURE_VERSION);
    expect(snapshot.publicLabels).not.toHaveProperty("visibility");
    expect(transport.mock.calls.every(([, query]) => query.include === undefined)).toBe(true);
    expect(transport.mock.calls.some(([path]) => path.endsWith("/visibility"))).toBe(false);
    expect(snapshot.publicLabels.entityAddresses).toEqual(publicLabelsFixture.entityAddresses);
    expect(snapshot.publicLabels.geoPolicies).toEqual(publicLabelsFixture.geoPolicies);
    const data = normalizePublicLabelsMetadata(1, snapshot.publicLabels);
    expect(data.candidateVaultAddresses).toContain(getAddress(KPK_VAULT));
    expect(data.candidateVaultAddresses).toContain(getAddress(ASSESSMENT_ONLY_EVK));
    expect(data.verifiedVaultAddresses).toEqual([]);
    expect(data.earnVaults).toEqual([]);
    expect(data).not.toHaveProperty("visibility");
    expect(data.products["kpk-securitize"].name).toBe(publicLabelsFixture.products[0]!.name);
    expect(transport.mock.calls.filter(([path]) => path.startsWith("/labels/") && !path.endsWith("/versions") && !path.endsWith("/addresses"))
      .every(([, query]) => query.version === PUBLIC_LABELS_FIXTURE_VERSION)).toBe(true);
  });
  it("does not downgrade the assessed adapter when direct verdict reads reject the chain", async () => {
    const transport = fixtureRequest();
    const request: PublicLabelsRequest = (path, query) => {
      if (path.startsWith("/evk/") || path.startsWith("/earn/")) throw new Error("CHAIN_NOT_SUPPORTED");
      return transport(path, query);
    };
    await expect(new PublicLabelsV3Adapter({ endpoint: "https://v3.example.test", request }).fetchPublicLabelsSnapshot(1)).rejects.toThrow("CHAIN_NOT_SUPPORTED");
  });
  it("rejects entity address rows belonging to a different entity", async () => {
    const transport = fixtureRequest();
    const request: PublicLabelsRequest = async (path, query) => {
      const result = await transport(path, query);
      if (path.endsWith("/kpk/addresses")) return response([{ ...publicLabelsFixture.entityAddresses[0], entityId: "other" }], 1) as never;
      return result;
    };
    await expect(new PublicLabelsV3MetadataAdapter({ endpoint: "https://v3.example.test", request }).fetchPublicLabelsSnapshot(1)).rejects.toThrow("Invalid Public Labels entity addresses");
  });
 });


describe("metadata-only discovery flags", () => {
  it("retains raw side flags on an annotation-only EVK", () => {
    const source = structuredClone(publicLabelsFixture);
    const unlabelled = source.vaults.find((vault) => vault.address === ASSESSMENT_ONLY_EVK)!;
    source.vaults = [{ ...unlabelled, notExplorableLend: true, notExplorableBorrow: false, portfolioNotice: "Check before depositing" }];
    const data = normalizePublicLabelsMetadata(1, source);
    expect(data.products).not.toHaveProperty(`__vault_${ASSESSMENT_ONLY_EVK.toLowerCase()}`);
    expect(isEulerLabelVaultNotExplorableLend(data, ASSESSMENT_ONLY_EVK)).toBe(true);
    expect(isEulerLabelVaultNotExplorableBorrow(data, ASSESSMENT_ONLY_EVK)).toBe(false);
    expect(getEulerLabelVaultNotice(data, ASSESSMENT_ONLY_EVK)).toBe("Check before depositing");
  });
  it.each([
    [true, null, null, true, undefined, undefined],
    [false, true, false, false, true, false],
    [null, false, true, false, false, true],
    [null, null, null, false, undefined, undefined],
  ])("maps product=%s lend=%s borrow=%s without creating a verdict", (productHide, lendHide, borrowHide, expectedProduct, expectedLend, expectedBorrow) => {
    const source = structuredClone(publicLabelsFixture);
    source.products[0]!.notExplorable = productHide;
    source.vaults[0]!.notExplorableLend = lendHide;
    source.vaults[0]!.notExplorableBorrow = borrowHide;
    const data = normalizePublicLabelsMetadata(1, source);
    const product = data.products["kpk-securitize"]!;
    expect(product.notExplorable).toBe(expectedProduct);
    expect(product.vaultOverrides![getAddress(KPK_VAULT)]?.notExplorableLend).toBe(expectedLend);
    expect(product.vaultOverrides![getAddress(KPK_VAULT)]?.notExplorableBorrow).toBe(expectedBorrow);
    expect(data.verifiedVaultAddresses).toEqual([]);
    expect(data).not.toHaveProperty("visibility");
    expect(normalizePublicLabelsData(1, source).products["kpk-securitize"]!.notExplorable).toBeUndefined();
  });
  it("lets an explicit false re-list a vault inside a hidden product", () => {
    const source = structuredClone(publicLabelsFixture);
    source.products[0]!.notExplorable = true;
    source.vaults[0]!.notExplorableLend = false;
    source.vaults[0]!.notExplorableBorrow = null;
    const data = normalizePublicLabelsMetadata(1, source);
    expect(isEulerLabelVaultNotExplorableLend(data, KPK_VAULT)).toBe(false);
    expect(isEulerLabelVaultNotExplorableBorrow(data, KPK_VAULT)).toBe(true);

    source.vaults[0]!.vaultType = "earn";
    const earn = normalizePublicLabelsMetadata(1, source);
    expect(earn.notExplorableEarnVaults.has(KPK_VAULT.toLowerCase())).toBe(false);
  });
  it("leaves the source and the assessed normalization untouched", () => {
    const source = structuredClone(publicLabelsFixture);
    source.products[0]!.notExplorable = true;
    const before = structuredClone(source);
    const assessed = normalizePublicLabelsData(1, source);
    const metadata = normalizePublicLabelsMetadata(1, source);
    expect(source).toEqual(before);
    expect(metadata.products["kpk-securitize"]!.notExplorable).toBe(true);
    expect(assessed.products["kpk-securitize"]!.notExplorable).toBeUndefined();
    expect(assessed.products["kpk-securitize"]!.vaultOverrides![getAddress(KPK_VAULT)]).not.toHaveProperty("notExplorableLend");
  });
  it.each([true, false])("maps Earn lend hiding=%s separately from deprecation", (hidden) => {
    const source = structuredClone(publicLabelsFixture);
    source.vaults = [{ ...source.vaults[0]!, vaultType: "earn", deprecated: true, notExplorableLend: hidden }];
    const data = normalizePublicLabelsMetadata(1, source);
    expect(data.notExplorableEarnVaults.has(KPK_VAULT.toLowerCase())).toBe(hidden);
    expect(data.earnVaults).toEqual([]);
  });
});

describe("default transport", () => {
	const fetchMock = vi.fn();
	const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
	const headersOf = (call: number) => new Headers(fetchMock.mock.calls[call]![1].headers);
	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		["https://v3.example.test", "https://v3.example.test/v3/labels/sets/public/versions?limit=100"],
		["https://v3.example.test/", "https://v3.example.test/v3/labels/sets/public/versions?limit=100"],
		["https://v3.example.test/v3", "https://v3.example.test/v3/labels/sets/public/versions?limit=100"],
		["https://v3.example.test/v3/", "https://v3.example.test/v3/labels/sets/public/versions?limit=100"],
		["https://app.example/api/internal/v3", "https://app.example/api/internal/v3/labels/sets/public/versions?limit=100"],
		["https://app.example/proxy/v3?limit=99&scope=app", "https://app.example/proxy/v3/labels/sets/public/versions?limit=100&scope=app"],
		["/api/labels?limit=99&scope=tenant", "/api/labels/v3/labels/sets/public/versions?limit=100&scope=tenant"],
		["/api/labels/?scope=space%20%26%20slash%2F&offset=7&limit=99#section", "/api/labels/v3/labels/sets/public/versions?scope=space+%26+slash%2F&offset=7&limit=100#section"],
		["/api/labels/#section?not-a-query", "/api/labels/v3/labels/sets/public/versions?limit=100#section?not-a-query"],
		["//proxy.example/api/labels?scope=tenant", "//proxy.example/api/labels/v3/labels/sets/public/versions?scope=tenant&limit=100"],
		["//proxy.example:443/api/labels?scope=tenant", "//proxy.example:443/api/labels/v3/labels/sets/public/versions?scope=tenant&limit=100"],
	])("requests %s as %s, skipping undefined query values", async (endpoint, expected) => {
		fetchMock.mockResolvedValue(ok(response([])));
		const adapter = new PublicLabelsV3Adapter({ endpoint });
		await adapter.queryPublicLabels("/labels/sets/public/versions", { limit: 100, offset: undefined });
		expect(String(fetchMock.mock.calls[0]![0])).toBe(expected);
		expect(headersOf(0).get("accept")).toBe("application/json");
		expect(headersOf(0).has("x-api-key")).toBe(false);
	});

	it.each([
		{ name: "assessed labels", Adapter: PublicLabelsV3Adapter },
		{ name: "metadata-only labels", Adapter: PublicLabelsV3MetadataAdapter },
	])("supports browser proxy bases for $name", async ({ Adapter }) => {
		fetchMock.mockResolvedValue(ok(response([])));
		const adapter = new Adapter({ endpoint: "/api/labels/" });
		await adapter.queryPublicLabels("/geo-policies", { reason: "space & slash/", offset: undefined });
		expect(fetchMock.mock.calls[0]![0]).toBe("/api/labels/v3/geo-policies?reason=space+%26+slash%2F");
		await adapter.queryPublicLabels("/geo-policies", {});
		expect(fetchMock.mock.calls[1]![0]).toBe("/api/labels/v3/geo-policies");
	});

	it.each([
		{ name: "assessed labels", Adapter: PublicLabelsV3Adapter },
		{ name: "metadata-only labels", Adapter: PublicLabelsV3MetadataAdapter },
	])("preserves proxy parameters and authentication for $name", async ({ Adapter }) => {
		fetchMock.mockResolvedValue(ok(response([])));
		const adapter = new Adapter({ endpoint: "/api/labels/?scope=tenant&limit=99#section", apiKey: " proxy-key " });
		await adapter.queryPublicLabels("/geo-policies", { limit: 100, offset: undefined });
		expect(fetchMock.mock.calls[0]![0]).toBe("/api/labels/v3/geo-policies?scope=tenant&limit=100#section");
		expect(headersOf(0).get("x-api-key")).toBe("proxy-key");
		await adapter.queryPublicLabels("/geo-policies", {});
		expect(fetchMock.mock.calls[1]![0]).toBe("/api/labels/v3/geo-policies?scope=tenant&limit=99#section");
	});

	it("sends the trimmed API key and omits a blank one", async () => {
		fetchMock.mockResolvedValue(ok(response([])));
		await new PublicLabelsV3Adapter({ endpoint: "https://v3.test", apiKey: "  secret-key " }).queryPublicLabels("/geo-policies", {});
		expect(headersOf(0).get("x-api-key")).toBe("secret-key");
		await new PublicLabelsV3Adapter({ endpoint: "https://v3.test", apiKey: "   " }).queryPublicLabels("/geo-policies", {});
		expect(headersOf(1).has("x-api-key")).toBe(false);
	});

	it("returns the parsed body of a 2xx answer", async () => {
		fetchMock.mockResolvedValue(ok(response([1, 2], 2)));
		await expect(
			new PublicLabelsV3Adapter({ endpoint: "https://v3.test" }).queryPublicLabels("/geo-policies", {}),
		).resolves.toEqual(response([1, 2], 2));
	});

	it("throws on a non-2xx answer instead of parsing it", async () => {
		const json = vi.fn(async () => response([]));
		fetchMock.mockResolvedValue({ ok: false, status: 503, json });
		await expect(
			new PublicLabelsV3Adapter({ endpoint: "https://v3.test" }).queryPublicLabels("/geo-policies", {}),
		).rejects.toThrow("Public Labels V3 returned 503 for /geo-policies");
		expect(json).not.toHaveBeenCalled();
	});
});
