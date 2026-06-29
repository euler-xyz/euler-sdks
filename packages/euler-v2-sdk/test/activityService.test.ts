import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import type { Address } from "viem";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";
import {
	ActivityService,
	getActivityAccount,
	getActivityCaller,
	getActivityTargetContract,
	normalizeActivityEvent,
} from "../src/services/activityService/index.js";

const ACCOUNT = getAddress(
	"0xee5b5c82a365d75e9f8a1e982687fb5b6ceb606c",
) as Address;
const VAULT = "0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2" as Address;
const CALLER = "0x0000000000000000000000000000000000000001" as Address;

const deploymentService: IDeploymentService = {
	getDeploymentChainIds: () => [],
	getDeployment: () => {
		throw new Error("not used");
	},
	addDeployment: () => {},
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ActivityService", () => {
	it("fetches and normalizes account activity from a relative V3 endpoint", async () => {
		const requests: Array<{ url: string; headers: HeadersInit | undefined }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				requests.push({ url, headers: init?.headers });
				return new Response(
					JSON.stringify({
						data: [
							{
								chainId: 1,
								type: "call_with_context",
								timestamp: "2024-09-04T15:04:35.000Z",
								blockNumber: "20700000",
								txHash:
									"0x2162b1e4c31ccb11d1d84a08e517f3509d4ee74022f0a4670e4502b461b191f6",
								payload: {
									caller: CALLER,
									selector: "0x6e553f65",
									target_contract: VAULT,
									on_behalf_of_account: ACCOUNT,
								},
							},
						],
						meta: { hasMore: false, offset: 0, limit: 25 },
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}),
		);

		const service = new ActivityService({
			endpoint: "/api",
			apiKey: "secret",
		});
		const page = await service.fetchAccountActivityEvents({
			account: ACCOUNT,
			chainId: 1,
			from: 1725148800,
			to: 1726358400,
			offset: 0,
			limit: 25,
		});

		expect(requests[0]?.url).toBe(
			`/api/v3/evc/accounts/${getAddress(ACCOUNT)}/events?chainId=1&from=1725148800&to=1726358400&offset=0&limit=25`,
		);
		expect(requests[0]?.headers).toMatchObject({
			Accept: "application/json",
			"X-API-Key": "secret",
		});
		expect(page.meta?.hasMore).toBe(false);
		expect(page.data[0]).toMatchObject({
			category: "lending",
			label: "Deposit",
			blockNumber: "20700000",
		});
		expect(getActivityTargetContract(page.data[0]!)).toBe(VAULT);
		expect(getActivityAccount(page.data[0]!)).toBe(ACCOUNT);
		expect(getActivityCaller(page.data[0]!)).toBe(CALLER);
	});

	it("fetches vault activity from the V3 vault event endpoint", async () => {
		const requests: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				requests.push(url);
				return new Response(
					JSON.stringify({
						data: [
							{
								chainId: 1,
								type: "borrow",
								timestamp: "2024-09-05T10:00:00.000Z",
								payload: { vault: VAULT, account: ACCOUNT },
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}),
		);

		const service = new ActivityService({ endpoint: "https://v3.example/" });
		const page = await service.fetchVaultActivityEvents({
			vault: VAULT,
			chainId: 1,
			from: 1725148800,
			to: 1726358400,
			type: "borrow",
			limit: 1,
		});

		expect(requests[0]).toBe(
			"https://v3.example/v3/evk/vaults/1/0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2/events?chainId=1&from=1725148800&to=1726358400&type=borrow&limit=1",
		);
		expect(page.data[0]?.category).toBe("borrowing");
		expect(page.data[0]?.label).toBe("Borrow");
	});

	it("normalizes labels and filters invalid rows", () => {
		const event = normalizeActivityEvent({
			chainId: "1",
			type: "reward_claimed",
			timestamp: "2024-09-06T12:00:00.000Z",
			payload: { label: "Claimed reward" },
		});

		expect(event).toMatchObject({
			category: "rewards",
			label: "Claimed reward",
		});
		expect(normalizeActivityEvent({ chainId: 1, type: "deposit" })).toBeNull();
	});

	it("exposes activityService from buildEulerSDK with V3 config precedence", async () => {
		const sdk = await buildEulerSDK({
			v3ApiKey: "shared-key",
			activityServiceConfig: {
				endpoint: "https://activity.example",
				apiKey: "activity-key",
			},
			servicesOverrides: { deploymentService },
		});

		expect(sdk.activityService).toBeInstanceOf(ActivityService);
		expect((sdk.activityService as ActivityService as any).endpoint).toBe(
			"https://activity.example",
		);
		expect((sdk.activityService as ActivityService as any).apiKey).toBe(
			"activity-key",
		);
	});

	it("lets activity V3 config override the shared V3 endpoint and API key", async () => {
		const sdk = await buildEulerSDK({
			config: {
				v3ApiUrl: "https://shared-v3.example",
				v3ApiKey: "shared-config-key",
				activityV3ApiUrl: "https://activity-v3.example",
				activityV3ApiKey: "activity-v3-key",
			},
			servicesOverrides: { deploymentService },
		});

		expect((sdk.activityService as ActivityService as any).endpoint).toBe(
			"https://activity-v3.example",
		);
		expect((sdk.activityService as ActivityService as any).apiKey).toBe(
			"activity-v3-key",
		);
	});
});
