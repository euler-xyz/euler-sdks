import { describe, expect, it } from "vitest";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import { readEulerSDKEnvConfig } from "../src/sdk/config.js";
import {
	DEFAULT_TOKENLIST_API_BASE_URL,
	defaultTokenlistServiceConfig,
} from "../src/sdk/defaultConfig.js";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";

const deploymentService: IDeploymentService = {
	getDeploymentChainIds: () => [],
	getDeployment: () => {
		throw new Error("not used");
	},
	addDeployment: () => {},
};

describe("SDK env config", () => {
	it("parses EULER_SDK runtime config values", () => {
		const config = readEulerSDKEnvConfig({
			EULER_SDK_RPC_URL_1: "https://mainnet.example",
			EULER_SDK_RPC_URL_8453: "https://base.example",
			EULER_SDK_V3_API_URL: "https://v3.example",
			EULER_SDK_V3_API_KEY: "secret",
			EULER_SDK_ACCOUNT_SERVICE_ADAPTER: "onchain",
			EULER_SDK_EVAULT_V3_BATCH_SIZE: "42",
			EULER_SDK_REWARDS_ENABLE_MERKL: "false",
			EULER_SDK_REWARDS_ENABLE_TURTLE: "false",
			EULER_SDK_REWARDS_BREVIS_CHAIN_IDS: "1,8453",
			EULER_SDK_REWARDS_TURTLE_API_URL: "https://turtle.example/v1",
			EULER_SDK_REWARDS_TURTLE_STREAMS_JSON:
				'[{"streamId":"stream-1","chainId":1,"streamAddress":"0x0000000000000000000000000000000000000001","rewardToken":{"address":"0x0000000000000000000000000000000000000002","symbol":"EUL","decimals":18},"tokenPrice":1.5}]',
			EULER_SDK_VAULT_TYPE_V3_TYPE_MAP_JSON: '{"custom":"EVault"}',
		});

		expect(config).toMatchObject({
			rpcUrls: {
				1: "https://mainnet.example",
				8453: "https://base.example",
			},
			v3ApiUrl: "https://v3.example",
			v3ApiKey: "secret",
			accountServiceAdapter: "onchain",
			eVaultV3BatchSize: 42,
			rewardsEnableMerkl: false,
			rewardsEnableTurtle: false,
			rewardsBrevisChainIds: [1, 8453],
			rewardsTurtleApiUrl: "https://turtle.example/v1",
			rewardsTurtleStreams: [
				{
					streamId: "stream-1",
					chainId: 1,
					streamAddress: "0x0000000000000000000000000000000000000001",
					rewardToken: {
						address: "0x0000000000000000000000000000000000000002",
						symbol: "EUL",
						decimals: 18,
					},
					tokenPrice: 1.5,
				},
			],
			vaultTypeV3TypeMap: { custom: "EVault" },
		});
	});

	it("accepts VITE_EULER_SDK aliases for browser env injection", () => {
		const config = readEulerSDKEnvConfig({
			VITE_EULER_SDK_RPC_URL_1: "https://vite-mainnet.example",
			VITE_EULER_SDK_V3_API_KEY: "vite-secret",
		});

		expect(config.rpcUrls).toEqual({ 1: "https://vite-mainnet.example" });
		expect(config.v3ApiKey).toBe("vite-secret");
	});

	it("uses the V3 tokenlist endpoint by default", () => {
		expect(DEFAULT_TOKENLIST_API_BASE_URL).toBe("https://v3.euler.finance");
		expect(defaultTokenlistServiceConfig.getTokenListUrl(1)).toBe(
			"https://v3.euler.finance/v3/tokens?chainId=1&limit=500&type=base",
		);
	});

	it("throws for invalid scalar values", () => {
		expect(() =>
			readEulerSDKEnvConfig({
				EULER_SDK_QUERY_CACHE_ENABLED: "sometimes",
			}),
		).toThrow("EULER_SDK_QUERY_CACHE_ENABLED must be a boolean");
	});

	it("throws for invalid Turtle stream env config values", () => {
		expect(() =>
			readEulerSDKEnvConfig({
				EULER_SDK_REWARDS_TURTLE_STREAMS_JSON:
					'[{"streamId":"stream-1","chainId":1.5}]',
			}),
		).toThrow(
			"EULER_SDK_REWARDS_TURTLE_STREAMS_JSON entries must include a positive integer chainId",
		);
		expect(() =>
			readEulerSDKEnvConfig({
				EULER_SDK_REWARDS_TURTLE_STREAMS_JSON:
					'[{"streamId":"stream-1","chainId":1,"streamAddress":"not-an-address"}]',
			}),
		).toThrow(
			"EULER_SDK_REWARDS_TURTLE_STREAMS_JSON streamAddress values must be EVM addresses",
		);
		expect(() =>
			readEulerSDKEnvConfig({
				EULER_SDK_REWARDS_TURTLE_STREAMS_JSON:
					'[{"streamId":"stream-1","chainId":1,"rewardToken":{"decimals":"18"}}]',
			}),
		).toThrow(
			"EULER_SDK_REWARDS_TURTLE_STREAMS_JSON rewardToken.decimals values must be non-negative integers",
		);
	});

	it("applies the shared V3 API key to pricing service config", async () => {
		const sdk = await buildEulerSDK({
			v3ApiKey: "shared-key",
			servicesOverrides: { deploymentService },
		});

		expect((sdk.priceService as any).backendClient.apiKey).toBe("shared-key");
	});

	it("lets pricing service config override the shared V3 API key", async () => {
		const sdk = await buildEulerSDK({
			v3ApiKey: "shared-key",
			pricingServiceConfig: {
				endpoint: "https://v3.example",
				apiKey: "pricing-key",
			},
			servicesOverrides: { deploymentService },
		});

		expect((sdk.priceService as any).backendClient.apiKey).toBe("pricing-key");
	});
});
