import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildEulerSDK,
	EulerLabelsService,
	EulerLabelsV3Service,
	normalizePublicLabelsData,
	type BuildSDKOptions,
	type EVault,
	type IDeploymentService,
	type PublicEulerLabelsData,
	type PublicLabelsQuery,
	type PublicLabelsRequest,
	type PublicLabelsResponse,
	type PublicLabelsSource,
} from "../src/index.js";
import {
	KPK_VAULT,
	PUBLIC_LABELS_FIXTURE_VERSION,
	publicLabelsFixture,
} from "./fixtures/publicLabelsV3.js";

const deploymentService: IDeploymentService = {
	getDeploymentChainIds: () => [],
	getDeployment: () => {
		throw new Error("not used");
	},
	addDeployment: () => {},
};
const build = (options: BuildSDKOptions = {}) =>
	buildEulerSDK({
		...options,
		servicesOverrides: { deploymentService, ...options.servicesOverrides },
	});
const response = <T>(data: T): PublicLabelsResponse<T> => ({
	data,
	meta: {
		timestamp: "2026-08-04T15:13:05.236Z",
		...(Array.isArray(data) && { total: data.length }),
	},
});

function fixtureRequest(
	getSource = () => publicLabelsFixture,
	labelSet = "public",
) {
	return vi.fn(async (path: string, query: PublicLabelsQuery) => {
		const source = getSource();
		if (path === `/labels/sets/${labelSet}/versions`)
			return response([
				{
					versionKey: PUBLIC_LABELS_FIXTURE_VERSION,
					status: "published",
					aliases: ["latest"],
					isLatest: true,
				},
			]);
		if (path === "/labels/vaults") {
			expect(query).toMatchObject({
				include: "visibility",
				view: "resolved",
				labelSet,
				version: PUBLIC_LABELS_FIXTURE_VERSION,
			});
			return response(
				source.vaults.map((vault) => ({
					...vault,
					visibility: source.visibility[vault.address.toLowerCase()] ?? null,
				})),
			);
		}
		if (path === "/labels/products") return response(source.products);
		if (path === "/labels/entities") return response(source.entities);
		if (path === "/geo-policies") return response(source.geoPolicies);
		if (path.endsWith("/visibility"))
			return response({
				chainId: 1,
				vaultAddress: path.split("/")[4],
				status: "pending_review",
				checks: { evaluated: false },
			});
		if (path.startsWith("/labels/entities/")) {
			const id = path.split("/")[3];
			if (path.endsWith("/addresses"))
				return response(
					source.entityAddresses.filter((entry) => entry.entityId === id),
				);
			return response(source.entities.find((entity) => entity.id === id));
		}
		throw new Error(`Unexpected labels request: ${path}`);
	}) as unknown as PublicLabelsRequest & ReturnType<typeof vi.fn>;
}

function mockHttp(request = fixtureRequest()) {
	return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = new URL(String(input));
		const path = url.pathname.slice(url.pathname.lastIndexOf("/v3") + 3);
		return Response.json(
			await request(path, Object.fromEntries(url.searchParams)),
		);
	});
}

beforeEach(() => {
	for (const key of Object.keys(process.env)) {
		if (/^(VITE_)?EULER_SDK_/.test(key)) vi.stubEnv(key, undefined);
	}
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("SDK Public Labels V3 default", () => {
	it("reads public/latest from V3, preserves normalized trust and geo data, and caches queries", async () => {
		const fetch = mockHttp();
		const sdk = await build();
		expect(sdk.eulerLabelsService).toBeInstanceOf(EulerLabelsV3Service);
		const data = await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		expect(data).toMatchObject(
			normalizePublicLabelsData(1, publicLabelsFixture),
		);
		expect(data.verifiedVaultAddresses).toEqual([getAddress(KPK_VAULT)]);
		const requestCount = fetch.mock.calls.length;
		expect(requestCount).toBeGreaterThan(0);
		await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		expect(fetch).toHaveBeenCalledTimes(requestCount);
		for (const [input] of fetch.mock.calls) {
			const url = new URL(String(input));
			expect(url.origin).toBe("https://v3.euler.finance");
			expect(url.pathname).toMatch(/^\/v3\//);
		}
	});

	it.each([
		"/labels/products",
		"/geo-policies",
		"/labels/sets/public/versions",
	])("rejects a failed %s request without file fallback or partial normalization", async (failedPath) => {
		const request = fixtureRequest();
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input) => {
				const url = new URL(String(input));
				const path = url.pathname.slice(3);
				if (path === failedPath)
					return new Response("Unavailable", { status: 503 });
				return Response.json(
					await request(path, Object.fromEntries(url.searchParams)),
				);
			});
		const sdk = await build();
		await expect(
			sdk.eulerLabelsService.fetchEulerLabelsData(1),
		).rejects.toThrow("Public Labels V3 returned 503");
		expect(
			fetch.mock.calls.every(
				([url]) => new URL(String(url)).origin === "https://v3.euler.finance",
			),
		).toBe(true);
	});

	it.each([
		{ options: {}, endpoint: "https://env.example/proxy/v3", key: "env-key" },
		{
			options: { v3ApiKey: "shared-key" },
			endpoint: "https://env.example/proxy/v3",
			key: "shared-key",
		},
		{
			options: {
				eulerLabelsV3AdapterConfig: {
					endpoint: "https://labels.example/api/internal/v3",
					apiKey: "labels-key",
				},
			},
			endpoint: "https://labels.example/api/internal/v3",
			key: "labels-key",
		},
		{
			options: {
				eulerLabelsV3AdapterConfig: {
					endpoint: "https://labels.example",
					apiKey: "labels-key",
				},
				config: {
					v3ApiUrl: "https://config.example/proxy",
					v3ApiKey: "config-key",
				},
			},
			endpoint: "https://config.example/proxy/v3",
			key: "config-key",
		},
	])("honors V3 config precedence and proxy paths: $key", async ({
		options,
		endpoint,
		key,
	}) => {
		vi.stubEnv("EULER_SDK_V3_API_URL", "https://env.example/proxy/v3");
		vi.stubEnv("EULER_SDK_V3_API_KEY", "env-key");
		const fetch = mockHttp();
		const sdk = await build(options);
		await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		for (const [input, init] of fetch.mock.calls) {
			expect(String(input)).toMatch(new RegExp(`^${endpoint}/`));
			expect(new Headers(init?.headers).get("X-API-Key")).toBe(key);
		}
	});

	it.each(["/api/v3", "/api/v3/"])("loads complete labels through the React example proxy at %s", async (endpoint) => {
		const request = fixtureRequest();
		const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			expect(String(input)).toMatch(/^\/api\/v3\/v3\//);
			const url = new URL(String(input), "https://app.example");
			// Match the React example's Vite proxy rewrite before checking the upstream route.
			const upstreamPath = url.pathname.replace(/^\/api\/v3/, "");
			expect(upstreamPath).toMatch(/^\/v3\//);
			expect(new Headers(init?.headers).get("X-API-Key")).toBe("proxy-key");
			return Response.json(
				await request(upstreamPath.slice(3), Object.fromEntries(url.searchParams)),
			);
		});
		const sdk = await build({ config: { v3ApiUrl: endpoint, v3ApiKey: "proxy-key" } });
		const data = await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		expect(data).toMatchObject(normalizePublicLabelsData(1, publicLabelsFixture));
		expect(fetch).toHaveBeenCalled();
	});

	it("uses injected requests, publication selection, and the application query decorator", async () => {
		const request = fixtureRequest(undefined, "partner");
		const queryNames: string[] = [];
		const fetch = vi.spyOn(globalThis, "fetch");
		const sdk = await build({
			eulerLabelsV3AdapterConfig: {
				request,
				labelSet: "partner",
				version: PUBLIC_LABELS_FIXTURE_VERSION,
			},
			buildQuery: (name, fn) => {
				queryNames.push(name);
				return fn;
			},
		});
		await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		const count = request.mock.calls.length;
		await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		expect(request.mock.calls.length).toBe(count * 2);
		expect(
			queryNames.filter((name) => name === "queryPublicLabels"),
		).toHaveLength(1);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("keeps construction usable but rejects reads and population without HTTP when V3 is disabled", async () => {
		const fetch = vi.spyOn(globalThis, "fetch");
		const request = fixtureRequest();
		const sdk = await build({
			config: { disableV3: true },
			eulerLabelsV3AdapterConfig: { request },
		});
		const service = sdk.eulerLabelsService;
		for (const read of [
			() => service.fetchEulerLabelsData(1),
			() => service.fetchEulerLabelsEntities(1),
			() => service.fetchEulerLabelsProducts(1),
			() => service.fetchEulerLabelsPoints(1),
			() => service.fetchEulerLabelsEarnVaults(1),
			() => service.fetchEulerLabelsAssets(1),
			() =>
				service.populateLabels([
					{ address: KPK_VAULT, chainId: 1, populated: {} } as EVault,
				]),
		])
			await expect(read()).rejects.toThrow(
				"Euler labels unavailable: V3 is disabled",
			);
		await service.populateLabels([]);
		expect(fetch).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
});

describe("application-owned labels flow", () => {
	it("preserves the base adapter service's partial-failure population behavior", async () => {
		const fetchProducts = vi.fn().mockResolvedValue({
			fixture: {
				name: "Application labels",
				description: "",
				url: "",
				vaults: [KPK_VAULT],
			},
		});
		const service = new EulerLabelsService({
			fetchEulerLabelsEntities: async () => ({}),
			fetchEulerLabelsProducts: fetchProducts,
			fetchEulerLabelsPoints: async () => [],
		});
		const vault = { address: KPK_VAULT, chainId: 1, populated: {} } as EVault;
		await service.populateLabels([vault]);
		const populated = vault.eulerLabel;
		fetchProducts.mockRejectedValueOnce(
			new Error("Application source unavailable"),
		);
		await service.populateLabels([vault]);
		expect(vault.eulerLabel).toBe(populated);
	});

	it.each([
		false,
		true,
	])("uses a complete custom bundle with disableV3=%s without SDK HTTP or re-normalization", async (disableV3) => {
		const fetch = vi.spyOn(globalThis, "fetch");
		const source = structuredClone(publicLabelsFixture);
		source.visibility[KPK_VAULT.toLowerCase()]!.status = "hidden";
		const bundle = normalizePublicLabelsData(1, source);
		const loadBundle = vi
			.fn<(chainId: number) => Promise<PublicEulerLabelsData>>()
			.mockResolvedValue(bundle);
		const unsupported = vi.fn(async (): Promise<never> => {
			throw new Error("This application supplies complete labels bundles");
		});
		class ApplicationLabelsService extends EulerLabelsService {
			constructor() {
				super(
					{
						fetchEulerLabelsEntities: unsupported,
						fetchEulerLabelsProducts: unsupported,
						fetchEulerLabelsPoints: unsupported,
						fetchEulerLabelsEarnVaults: unsupported,
						fetchEulerLabelsAssets: unsupported,
					},
					(url) =>
						`https://images.example/proxy?url=${encodeURIComponent(url)}`,
				);
			}
			override fetchEulerLabelsData(chainId: number) {
				return loadBundle(chainId);
			}
		}
		const labelsService = new ApplicationLabelsService();
		const sdk = await build({
			config: { disableV3 },
			// The custom service owns source selection, so even unused invalid V3 config is ignored.
			eulerLabelsV3AdapterConfig: { labelSet: "invalid/dataset" },
			servicesOverrides: { eulerLabelsService: labelsService },
		});
		expect(sdk.eulerLabelsService).toBe(labelsService);
		const data = await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		expect(data).toBe(bundle);
		expect(data.verifiedVaultAddresses).toEqual([]);
		expect(data).toMatchObject({
			visibility: source.visibility,
			rawGeoPolicies: source.geoPolicies,
		});
		const vault = { address: KPK_VAULT, chainId: 1, populated: {} } as EVault;
		await sdk.eulerLabelsService.populateLabels([vault]);
		expect(vault.eulerLabel?.products[0]?.name).toBe("KPK VBILL/USDC Lend");
		expect(vault.eulerLabel?.entities[0]?.logo).toBe(
			"https://images.example/proxy?url=https%3A%2F%2Fv3.euler.finance%2Fv3%2Fimages%2Flabels%2Fkpk",
		);
		expect(unsupported).not.toHaveBeenCalled();
		expect(loadBundle).toHaveBeenCalledWith(1);
		loadBundle.mockRejectedValueOnce(
			new Error("Application labels unavailable"),
		);
		await expect(
			sdk.eulerLabelsService.fetchEulerLabelsData(1),
		).rejects.toThrow("Application labels unavailable");
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("V3 labels membership and population", () => {
	it.each([
		"hidden",
		"pending_review",
		"warning",
		"visible",
	] as const)("retains %s metadata and its exact visibility without deriving trust from products", async (status) => {
		const source = structuredClone(publicLabelsFixture);
		source.visibility[KPK_VAULT.toLowerCase()] = {
			status,
			explorableLend: status === "visible",
			explorableBorrow: false,
			decidedBy: "unassessable",
			reason: "fixture",
		};
		const sdk = await build({
			eulerLabelsV3AdapterConfig: { request: fixtureRequest(() => source) },
		});
		const data = await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		expect(data.verifiedVaultAddresses).toEqual(
			status === "visible" || status === "warning"
				? [getAddress(KPK_VAULT)]
				: [],
		);
		expect(data.products["kpk-securitize"]?.vaults).toContain(
			getAddress(KPK_VAULT),
		);
		if (!("visibility" in data)) throw new Error("V3 fields missing");
		expect(data.visibility[KPK_VAULT.toLowerCase()]).toEqual(
			source.visibility[KPK_VAULT.toLowerCase()],
		);
		expect(data.rawGeoPolicies).toEqual(source.geoPolicies);
		expect(data.managingEntityByVault[KPK_VAULT.toLowerCase()]).toBe("kpk");
	});

	it("does not infer a vault manager from its product's curator", async () => {
		const source = structuredClone(publicLabelsFixture);
		source.vaults[0]!.entityId = null;
		const sdk = await build({
			eulerLabelsV3AdapterConfig: { request: fixtureRequest(() => source) },
		});
		const data = await sdk.eulerLabelsService.fetchEulerLabelsData(1);
		expect(data.products["kpk-securitize"]?.entity).toBe("kpk");
		expect(data.verifiedVaultAddresses).toEqual([]);
	});

	it("keeps campaign scope and Earn metadata separate from eligible Earn membership", async () => {
		const source = structuredClone(publicLabelsFixture);
		const visibleEarn = "0x0000000000000000000000000000000000000011";
		const hiddenEarn = "0x0000000000000000000000000000000000000012";
		source.vaults[0]!.campaigns!.push({
			name: "Borrow points",
			logo: null,
			type: "borrow",
		});
		for (const address of [visibleEarn, hiddenEarn]) {
			source.vaults.push({
				...source.vaults[0]!,
				address,
				vaultType: "earn",
				campaigns: null,
			});
			source.visibility[address] = {
				...source.visibility[KPK_VAULT.toLowerCase()]!,
				status: address === visibleEarn ? "visible" : "hidden",
			};
		}
		const sdk = await build({
			eulerLabelsV3AdapterConfig: { request: fixtureRequest(() => source) },
		});
		const service = sdk.eulerLabelsService;
		const data = await service.fetchEulerLabelsData(1);
		expect(data.earnVaults).toEqual([visibleEarn]);
		expect(Object.keys(data.earnVaultEntries)).toEqual([
			visibleEarn,
			hiddenEarn,
		]);
		expect(await service.fetchEulerLabelsEarnVaults(1)).toEqual([
			data.earnVaultEntries[visibleEarn],
		]);
		expect(await service.fetchEulerLabelsPoints(1)).toEqual([
			{
				...data.points[getAddress(KPK_VAULT)]![0],
				collateralVaults: [getAddress(KPK_VAULT)],
			},
			{
				...data.points[getAddress(KPK_VAULT)]![1],
				liabilityVaults: [getAddress(KPK_VAULT)],
			},
		]);
		expect(await service.fetchEulerLabelsEntities(1)).toEqual(data.entities);
		expect(await service.fetchEulerLabelsProducts(1)).toEqual(data.products);
		expect(await service.fetchEulerLabelsAssets(1)).toEqual([]);
	});

	it("populates V3 logos/notices/deprecation and clears removed labels only after a successful refresh", async () => {
		let source: PublicLabelsSource = structuredClone(publicLabelsFixture);
		source.products[0]!.logo =
			"https://v3.euler.finance/v3/images/labels/product";
		source.vaults[0]!.portfolioNotice = "Read the policy";
		source.vaults[0]!.deprecated = true;
		source.vaults[0]!.deprecationReason = "Exit only";
		const request = fixtureRequest(() => source);
		const sdk = await build({
			config: { queryCacheEnabled: false },
			eulerLabelsV3AdapterConfig: { request },
		});
		const vault = {
			address: KPK_VAULT.toLowerCase(),
			chainId: 1,
			populated: {},
		} as EVault;
		await sdk.eulerLabelsService.populateLabels([vault]);
		expect(vault.eulerLabel).toMatchObject({
			deprecated: true,
			deprecationReason: "Exit only",
			products: [
				{
					name: "KPK VBILL/USDC Lend",
					portfolioNotice: "Read the policy",
					logo: "https://v3.euler.finance/v3/images/labels/product",
				},
			],
			entities: [{ logo: "https://v3.euler.finance/v3/images/labels/kpk" }],
		});
		expect(vault.populated.labels).toBe(true);
		const populated = vault.eulerLabel;
		request.mockRejectedValueOnce(new Error("Labels unavailable"));
		await expect(
			sdk.eulerLabelsService.populateLabels([vault]),
		).rejects.toThrow("Labels unavailable");
		expect(vault.eulerLabel).toBe(populated);
		source = {
			vaults: [],
			products: [],
			entities: [],
			entityAddresses: [],
			geoPolicies: [],
			visibility: {},
		};
		await sdk.eulerLabelsService.populateLabels([vault]);
		expect(vault.eulerLabel).toBeUndefined();
		expect(vault.populated.labels).toBe(true);
	});
});
