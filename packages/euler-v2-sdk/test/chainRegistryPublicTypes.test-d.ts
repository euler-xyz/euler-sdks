import { describe, expectTypeOf, it } from "vitest";
import { defineChain } from "viem";
import { base, sonic } from "viem/chains";
import type {
	BuildSDKOptions,
	ChainOverrides,
	Deployment,
	DeploymentInput,
	EulerChainStatus,
} from "../src/index.js";

/**
 * Downstream compile fixtures for the chain registry surface. This file is
 * only typechecked (vitest typecheck mode), never executed.
 */
describe("chain registry public types", () => {
	it("accepts viem chains, partial patches and transport tuning in chains", () => {
		const chains: ChainOverrides = {
			8453: base,
			146: {
				...sonic,
				transport: {
					http: { retryCount: 0, batch: { batchSize: 50 } },
					multicall: { batchSize: 128 },
				},
			},
			777001: defineChain({
				id: 777001,
				name: "New Chain",
				nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
				rpcUrls: { default: { http: ["https://rpc.example"] } },
			}),
			1: {
				contracts: {
					multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
				},
			},
			10: {
				blockExplorers: {
					default: { name: "Explorer", url: "https://explorer.example" },
				},
			},
		};
		const options: BuildSDKOptions = { chains };

		expectTypeOf(options.chains).toEqualTypeOf<ChainOverrides | undefined>();
	});

	it("types the normalized chain status and explorer", () => {
		expectTypeOf<Deployment["status"]>().toEqualTypeOf<EulerChainStatus>();
		expectTypeOf<EulerChainStatus>().toEqualTypeOf<
			"staging" | "production" | "unlisted" | "deprecated"
		>();
		expectTypeOf<Deployment["explorerUrl"]>().toEqualTypeOf<
			string | undefined
		>();
	});

	it("keeps raw registry rows open to legacy and unknown statuses", () => {
		const rows: DeploymentInput["status"][] = ["testing", "sunset", undefined];

		expectTypeOf(rows).toEqualTypeOf<(string | undefined)[]>();
		expectTypeOf<DeploymentInput["status"]>().toEqualTypeOf<
			string | undefined
		>();
	});
});
