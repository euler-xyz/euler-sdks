import { describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import { OracleAdapterService } from "../src/services/oracleAdapterService/index.js";

const ADAPTER_ONE = getAddress(
	"0x0000000000000000000000000000000000000001",
);
const ADAPTER_TWO = getAddress(
	"0x0000000000000000000000000000000000000002",
);
const ROUTER = getAddress("0x0000000000000000000000000000000000000010");
const DEPLOYER = getAddress("0x0000000000000000000000000000000000000020");

function assessment(
	address: Address,
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		chainId: 1,
		address,
		recognized: true,
		checksStatus: "positive",
		reason: null,
		inActiveRoute: true,
		adapterClass: "ChainlinkOracle",
		label: "Chainlink",
		provider: "Chainlink",
		methodology: "Market Price",
		model: "Push",
		config: { base: ADAPTER_ONE, quote: ADAPTER_TWO },
		findings: [
			{
				key: "quote-liveness",
				outcome: "pass",
				severity: "medium",
				description: "Quote succeeds",
			},
		],
		summary: { passed: 1, failed: 0, unknown: 0, notApplicable: 0 },
		policyId: "oracle-adapter-policy",
		policyVersion: 3,
		blockNumber: "123",
		evaluatedAt: "2026-09-01T12:00:00.000Z",
		lastCheckedAt: "2026-09-01T12:01:00.000Z",
		...overrides,
	};
}

describe("OracleAdapterService", () => {
	it("preserves an absolute proxy base path", async () => {
		const service = new OracleAdapterService({
			endpoint: "https://lite.example/api/internal/",
		});
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: true,
			status: 200,
			statusText: "OK",
			json: async () => ({ data: assessment(ADAPTER_ONE) }),
		} as Response);

		try {
			await service.fetchOracleAdapterAssessment(1, ADAPTER_ONE);

			expect(fetchSpy).toHaveBeenCalledWith(
				`https://lite.example/api/internal/v3/oracles/adapter-assessments/${ADAPTER_ONE}?chainId=1`,
				expect.any(Object),
			);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it("preserves the V3 identity, health, and four-state finding model", async () => {
		const service = new OracleAdapterService();
		service.setQueryV3OracleAdapterAssessment(async () => ({
			data: assessment(ADAPTER_ONE, {
				recognized: false,
				checksStatus: null,
				adapterClass: null,
				label: null,
				provider: null,
				methodology: null,
				model: null,
				findings: [
					{
						key: "quote-liveness",
						outcome: "unknown",
						severity: "medium",
						description: "Quote result is inconclusive",
					},
					{
						key: "session-bound-behavior",
						outcome: "not_applicable",
						severity: "info",
						description: "No active market session",
					},
				],
			}),
		}));

		const result = await service.fetchOracleAdapterAssessment(1, ADAPTER_ONE);

		expect(result?.recognized).toBe(false);
		expect(result?.checksStatus).toBeNull();
		expect(result?.provider).toBeNull();
		expect(result?.findings.map((finding) => finding.outcome)).toEqual([
			"unknown",
			"not_applicable",
		]);
	});

	it("paginates assessment and router lists", async () => {
		const service = new OracleAdapterService({ pageSize: 1 });
		const assessmentPages = vi.fn(async (_chainId, offset) => ({
			data:
				offset === 0
					? [assessment(ADAPTER_ONE)]
					: [assessment(ADAPTER_TWO, { inActiveRoute: false })],
			meta: { total: 2, offset, limit: 1 },
		}));
		service.setQueryV3OracleAdapterAssessmentsPage(assessmentPages);
		service.setQueryV3OracleRoutersPage(async (_chainId, offset) => ({
			data:
				offset === 0
					? [
							{
								chainId: 1,
								router: ROUTER,
								deployer: DEPLOYER,
								deployedAt: "2026-09-01T12:00:00.000Z",
								configs: [],
								vaults: [],
							},
						]
					: [],
			meta: { total: 1, offset, limit: 1 },
		}));

		const assessments = await service.fetchOracleAdapterAssessments(1, {
			active: true,
		});
		const routers = await service.fetchOracleRouterMap(1);

		expect(assessments.map((item) => item.address)).toEqual([
			ADAPTER_ONE,
			ADAPTER_TWO,
		]);
		expect(assessmentPages).toHaveBeenNthCalledWith(1, 1, 0, 1, {
			active: true,
		});
		expect(assessmentPages).toHaveBeenNthCalledWith(2, 1, 1, 1, {
			active: true,
		});
		expect(routers[ROUTER.toLowerCase()]?.deployer).toBe(DEPLOYER);
	});

	it("keeps deprecated metadata aliases V3-backed without collapsing unknown", async () => {
		const service = new OracleAdapterService({ pageSize: 100 });
		const queryPage = vi.fn(async () => ({
			data: [
				assessment(ADAPTER_ONE, {
					findings: [
						{
							key: "quote-liveness",
							outcome: "unknown",
							severity: "medium",
							description: "Quote result is inconclusive",
						},
					],
				}),
			],
			meta: { total: 1 },
		}));
		service.setQueryV3OracleAdapterAssessmentsPage(queryPage);

		const [metadata] = await service.fetchOracleAdapters(1);

		expect(metadata?.oracle).toBe(ADAPTER_ONE);
		expect(metadata?.name).toBe("ChainlinkOracle");
		expect(metadata?.base).toBe(ADAPTER_ONE);
		expect(metadata?.checks[0]).toMatchObject({
			id: "quote-liveness",
			outcome: "unknown",
		});
		expect(metadata?.checks[0]).not.toHaveProperty("pass");
		expect(queryPage).toHaveBeenCalledWith(1, 0, 100, { recognized: true });
	});
});
