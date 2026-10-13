import { afterEach, describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { defaultAccountVaultsAdapterConfig } from "../src/sdk/defaultConfig.js";
import {
	DeploymentService,
	type DeploymentInput,
	normalizeChainStatus,
	normalizeExplorerUrl,
} from "../src/services/deploymentService/index.js";

const originalQueryDeployments = DeploymentService.queryDeployments;

function makeRow(
	chainId: number,
	fields: Partial<Pick<DeploymentInput, "status" | "explorerUrl" | "viemName">> = {},
): DeploymentInput {
	return {
		chainId,
		name: `chain-${chainId}`,
		status: "production",
		...fields,
		addresses: {
			coreAddrs: {
				balanceTracker: zeroAddress,
				eVaultFactory: zeroAddress,
				eVaultImplementation: zeroAddress,
				eulerEarnFactory: zeroAddress,
				evc: zeroAddress,
				permit2: zeroAddress,
				protocolConfig: zeroAddress,
				sequenceRegistry: zeroAddress,
			},
			lensAddrs: {
				accountLens: zeroAddress,
				eulerEarnVaultLens: zeroAddress,
				irmLens: zeroAddress,
				oracleLens: zeroAddress,
				utilsLens: zeroAddress,
				vaultLens: zeroAddress,
			},
		},
	};
}

afterEach(() => {
	DeploymentService.setQueryDeployments(originalQueryDeployments);
});

describe("normalizeChainStatus", () => {
	it.each(["staging", "production", "unlisted", "deprecated"] as const)(
		"keeps %s",
		(status) => {
			expect(normalizeChainStatus(status)).toBe(status);
		},
	);

	it("reads the legacy testing status as staging", () => {
		expect(normalizeChainStatus("testing")).toBe("staging");
	});

	it.each([
		"active",
		"Production",
		"",
		undefined,
		null,
		1,
	])("treats %p as unlisted", (status) => {
		expect(normalizeChainStatus(status)).toBe("unlisted");
	});
});

describe("normalizeExplorerUrl", () => {
	it("keeps an https origin", () => {
		expect(normalizeExplorerUrl("https://etherscan.io")).toBe(
			"https://etherscan.io",
		);
	});

	it("strips trailing slashes", () => {
		expect(normalizeExplorerUrl("https://basescan.org/")).toBe(
			"https://basescan.org",
		);
		expect(normalizeExplorerUrl(" https://explorer.example/evm// ")).toBe(
			"https://explorer.example/evm",
		);
	});

	it.each([
		undefined,
		"",
		"http://etherscan.io",
		"javascript:alert(1)",
		"etherscan.io",
		"https://",
		42,
	])("drops %p", (value) => {
		expect(normalizeExplorerUrl(value)).toBeUndefined();
	});
});

describe("DeploymentService chain status and explorer", () => {
	it("normalizes status and explorerUrl for every fetched chain", async () => {
		DeploymentService.setQueryDeployments(async () => [
			makeRow(1, { explorerUrl: "https://etherscan.io/" }),
			makeRow(137, { status: "testing" }),
			makeRow(146, { status: "deprecated" }),
			makeRow(747474, { status: "something-new" }),
		]);

		const service = await DeploymentService.build({
			deploymentsUrl: "https://deployments.example",
		});

		expect(service.getDeployment(1).status).toBe("production");
		expect(service.getDeployment(1).explorerUrl).toBe("https://etherscan.io");
		expect(service.getDeployment(137).status).toBe("staging");
		expect(service.getDeployment(146).status).toBe("deprecated");
		expect(service.getDeployment(747474).status).toBe("unlisted");
		expect("explorerUrl" in service.getDeployment(137)).toBe(false);
	});

	it("drops an explorerUrl that is not https", async () => {
		DeploymentService.setQueryDeployments(async () => [
			makeRow(1, { explorerUrl: "javascript:alert(1)" }),
		]);

		const service = await DeploymentService.build({
			deploymentsUrl: "https://deployments.example",
		});

		expect(service.getDeployment(1).explorerUrl).toBeUndefined();
	});

	it("normalizes added and constructor-supplied deployments without mutating them", () => {
		const row = Object.freeze(
			makeRow(8453, { status: "testing", explorerUrl: "https://basescan.org/" }),
		);
		const service = new DeploymentService({
			1: makeRow(1, { status: "unknown" }),
		});

		service.addDeployment(row);

		expect(service.getDeployment(1).status).toBe("unlisted");
		expect(service.getDeployment(8453)).toMatchObject({
			status: "staging",
			explorerUrl: "https://basescan.org",
			name: "chain-8453",
		});
		expect(row.status).toBe("testing");
		expect(service.getDeploymentChainIds().sort((a, b) => a - b)).toEqual([
			1, 8453,
		]);
	});

	it("keeps viemName and the other registry fields", async () => {
		DeploymentService.setQueryDeployments(async () => [
			makeRow(1, { viemName: "mainnet" }),
		]);

		const service = await DeploymentService.build({
			deploymentsUrl: "https://deployments.example",
		});

		expect(service.getDeployment(1)).toMatchObject({
			chainId: 1,
			name: "chain-1",
			viemName: "mainnet",
			status: "production",
		});
	});
});

describe("default subgraph URLs", () => {
	it("has no defaults for chains whose Goldsky subgraphs were removed", () => {
		const chainIds = Object.keys(
			defaultAccountVaultsAdapterConfig.subgraphURLs,
		).map(Number);

		for (const retired of [10, 100, 480, 5000, 57073]) {
			expect(chainIds).not.toContain(retired);
		}
		for (const live of [1, 56, 130, 143, 146, 239, 999, 8453, 9745, 42161]) {
			expect(chainIds).toContain(live);
		}
	});
});
