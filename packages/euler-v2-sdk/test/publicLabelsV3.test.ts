import { PublicLabelsV3MetadataAdapter, normalizePublicLabelsMetadata } from "../src/index.js";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
	PublicLabelsV3Adapter,
	fetchPublicGeoPolicies,
	validatePublicGeoPolicies,
	fetchAllPublicLabelPages,
	getEulerLabelProductBrandEntityKeys,
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
				return response(
					publicLabelsFixture.vaults,
					publicLabelsFixture.vaults.length,
				);
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
			if (path === "/evk/vaults")
				return response(
					Object.entries(publicLabelsFixture.visibility).map(
						([address, visibility]) => ({ chainId: 1, address, visibility }),
					),
					1,
				);
			if (path === "/earn/vaults") return response([], 0);
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
		expect(request).toHaveBeenCalledWith("/evk/vaults", {
			chainId: 1,
			visibility: "visible,warning,hidden,pending_review",
			limit: 100,
			offset: 0,
		});
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
		await adapter.fetchPublicLabelsSnapshot(1);
		expect(request.mock.calls.some(([path]) => path.includes("/sets/"))).toBe(false);
		await adapter.fetchPublicLabelsSnapshot(1, "latest");
		expect(request).toHaveBeenCalledWith("/labels/sets/public/versions", {});
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

	it("uses deterministic publication keys without resolving latest", async () => {
		const request = fixtureRequest();
		const adapter = new PublicLabelsV3Adapter({
			endpoint: "https://v3.example.test/v3",
			request,
		});

		await adapter.fetchPublicLabelsSnapshot(1, PUBLIC_LABELS_FIXTURE_VERSION);

		expect(
			request.mock.calls.some(
				([path]) => path === "/labels/sets/public/versions",
			),
		).toBe(false);
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
			"https://token-images.euler.finance/labels/kpk",
		);
		expect(result.entities.kpk?.addresses).toEqual({
			[getAddress(KPK_GOVERNOR)]: "KPK Euler RWA Curation Safe",
		});
		expect(result.points[getAddress(KPK_VAULT)]).toEqual([
			{
				name: "KPK RWA points",
				logo: "https://token-images.euler.finance/labels/kpk",
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
			if (path === "/evk/vaults") return response([], 0) as PublicLabelsResponse<T>;
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
	it("does not fetch a direct verdict when the inventory already supplies one", async () => {
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
  it("does not downgrade the assessed adapter when inventories reject the chain", async () => {
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
  it.each([
    [true, null, null, true, false, false],
    [false, true, false, false, true, false],
    [null, false, true, false, false, true],
    [null, null, null, false, false, false],
  ])("maps product=%s lend=%s borrow=%s without creating a verdict", (productHide, lendHide, borrowHide, expectedProduct, expectedLend, expectedBorrow) => {
    const source = structuredClone(publicLabelsFixture);
    source.products[0]!.notExplorable = productHide;
    source.vaults[0]!.notExplorableLend = lendHide;
    source.vaults[0]!.notExplorableBorrow = borrowHide;
    const data = normalizePublicLabelsMetadata(1, source);
    const product = data.products["kpk-securitize"]!;
    expect(product.notExplorable).toBe(expectedProduct);
    expect(product.vaultOverrides![getAddress(KPK_VAULT)]).toMatchObject({ notExplorableLend: expectedLend, notExplorableBorrow: expectedBorrow });
    expect(data.verifiedVaultAddresses).toEqual([]);
    expect(data).not.toHaveProperty("visibility");
    expect(normalizePublicLabelsData(1, source).products["kpk-securitize"]!.notExplorable).toBeUndefined();
  });
  it.each([true, false])("maps Earn lend hiding=%s separately from deprecation", (hidden) => {
    const source = structuredClone(publicLabelsFixture);
    source.vaults = [{ ...source.vaults[0]!, vaultType: "earn", deprecated: true, notExplorableLend: hidden }];
    const data = normalizePublicLabelsMetadata(1, source);
    expect(data.notExplorableEarnVaults.has(KPK_VAULT.toLowerCase())).toBe(hidden);
    expect(data.earnVaults).toEqual([]);
  });
});
