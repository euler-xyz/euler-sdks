import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
	PublicLabelsV3Adapter,
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

const fixtureRequest = (options?: { productEntityId?: string }) => {
	const request = vi.fn(
		async (path: string, query: PublicLabelsQuery): Promise<unknown> => {
			if (path === "/labels/sets/public/versions") {
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
		expect(snapshot.publicLabels).toEqual(publicLabelsFixture);
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
			chainId: 1,
			version: PUBLIC_LABELS_FIXTURE_VERSION,
			view: "resolved",
			limit: 100,
			offset: 0,
		});
		expect(request).toHaveBeenCalledWith("/labels/products", {
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
			version: PUBLIC_LABELS_FIXTURE_VERSION,
		});
		expect(request).toHaveBeenCalledWith(`/labels/entities/securitize`, {
			version: PUBLIC_LABELS_FIXTURE_VERSION,
		});
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
