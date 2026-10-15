import { expect, it } from "vitest";
import { buildEulerSDK } from "../../src/sdk/buildSDK.js";
import { defaultDeploymentServiceConfig } from "../../src/sdk/defaultConfig.js";
import { DeploymentService } from "../../src/services/deploymentService/index.js";

const RPC_URL = "https://rpc.example";

it("resolves a viem chain for every chain in the live EulerChains.json", async () => {
	const deploymentService = await DeploymentService.build(
		defaultDeploymentServiceConfig,
	);
	const chainIds = deploymentService.getDeploymentChainIds();

	const sdk = await buildEulerSDK({
		config: {
			rpcUrls: Object.fromEntries(chainIds.map((chainId) => [chainId, RPC_URL])),
		},
		servicesOverrides: { deploymentService },
	});

	expect(chainIds.length).toBeGreaterThan(0);
	for (const chainId of chainIds) {
		expect(sdk.providerService.getProvider(chainId).chain?.id).toBe(chainId);
	}
});
