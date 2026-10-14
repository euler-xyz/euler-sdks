import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { type Chain, defineChain, zeroAddress } from "viem";
import { base, mainnet } from "viem/chains";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";
import {
	type ChainOverrides,
	ProviderService,
	resolveViemChain,
} from "../src/services/providerService/index.js";

const RPC_URL = "https://rpc.example";
const MULTICALL = "0x1111111111111111111111111111111111111111";

const customChain = defineChain({
	id: 777001,
	name: "Custom Chain",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: { default: { http: [RPC_URL] } },
	contracts: { multicall3: { address: MULTICALL } },
});

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const nested of Object.values(value)) deepFreeze(nested);
		Object.freeze(value);
	}
	return value;
}

function chainOf(
	chainId: number,
	options: ConstructorParameters<typeof ProviderService>[1] = {},
): Chain {
	const provider = new ProviderService({ [chainId]: RPC_URL }, options);
	const chain = provider.getProvider(chainId).chain;
	if (!chain) throw new Error("provider has no chain");
	return chain;
}

describe("ProviderService chain resolution", () => {
	it("resolves any chain viem knows by a unique id", () => {
		expect(chainOf(137).name).toBe("Polygon");
		expect(chainOf(59144).name).toBe("Linea Mainnet");
	});

	it("resolves every chain in the current registry", () => {
		// euler-interfaces EulerChains.json on master, 2026-10-13: chain ids and viemName values.
		const registry: Record<number, string | undefined> = {
			1: "mainnet",
			56: "bsc",
			130: undefined,
			137: undefined,
			143: undefined,
			146: undefined,
			239: "tac",
			999: undefined,
			8453: undefined,
			9745: undefined,
			42161: undefined,
			43114: undefined,
			59144: undefined,
			60808: "bob",
			80094: undefined,
		};
		const chainIds = Object.keys(registry).map(Number);
		const viemNames = Object.fromEntries(
			Object.entries(registry).filter(
				(entry): entry is [string, string] => entry[1] !== undefined,
			),
		);

		const service = new ProviderService(
			Object.fromEntries(chainIds.map((chainId) => [chainId, RPC_URL])),
			{ viemNames },
		);

		for (const chainId of chainIds) {
			expect(service.getProvider(chainId).chain?.id).toBe(chainId);
		}
	});

	it("keeps the previous choice for Base and HyperEVM while the registry has no viemName for them", () => {
		const baseChain = chainOf(8453);
		expect(baseChain).toBe(base);
		expect(chainOf(999).name).toBe("HyperEVM");
	});

	it("uses the EulerChains viemName to pick among viem chains that share an id", () => {
		expect(chainOf(999, { viemNames: { 999: "wanchainTestnet" } }).name).toBe(
			"Wanchain Testnet",
		);
		expect(chainOf(1, { viemNames: { 1: "mainnet" } })).toBe(mainnet);
	});

	it("rejects a viemName that is not a viem chain with that id", () => {
		expect(() => chainOf(1, { viemNames: { 1: "base" } })).toThrow(
			/viemName "base" for chain 1 is not a viem chain with that id/,
		);
		expect(() => chainOf(1, { viemNames: { 1: "notAChain" } })).toThrow(
			/viemName "notAChain"/,
		);
	});

	it("names both fixes when viem has several chains with an id", () => {
		const error = (() => {
			try {
				chainOf(84532);
			} catch (caught) {
				return caught as Error;
			}
			throw new Error("expected an error");
		})();

		expect(error.message).toMatch(/several chains with id 84532/);
		expect(error.message).toMatch(/baseSepolia, baseSepoliaPreconf/);
		expect(error.message).toMatch(/viemName for chain 84532 in euler-interfaces/);
		expect(error.message).toMatch(/chains: \{ 84532: <viem Chain> \}/);
	});

	it("names both fixes when viem has no chain with an id", () => {
		expect(() => chainOf(777001)).toThrow(
			/viem has no chain with id 777001\. Either pass chains: \{ 777001: <viem Chain> \} to buildEulerSDK, or set viemName for chain 777001 in euler-interfaces/,
		);
	});

	it("uses a complete app-supplied chain for a chain viem lacks", () => {
		const chain = chainOf(777001, { chains: { 777001: customChain } });

		expect(chain.name).toBe("Custom Chain");
		expect(chain.contracts?.multicall3?.address).toBe(MULTICALL);
	});

	it("prefers a complete app-supplied chain over viem and the registry", () => {
		const override = { ...mainnet, name: "Mainnet override" };

		const chain = chainOf(1, {
			chains: { 1: override },
			viemNames: { 1: "mainnet" },
		});

		expect(chain.name).toBe("Mainnet override");
	});

	it("patches the resolved chain's multicall and explorer", () => {
		const chain = chainOf(8453, {
			chains: {
				8453: {
					contracts: { multicall3: { address: MULTICALL } },
					blockExplorers: {
						default: { name: "Explorer", url: "https://explorer.example" },
					},
				},
			},
		});

		expect(chain.name).toBe("Base");
		expect(chain.contracts?.multicall3?.address).toBe(MULTICALL);
		expect(chain.contracts?.l2OutputOracle).toEqual(base.contracts.l2OutputOracle);
		expect(chain.blockExplorers?.default.url).toBe("https://explorer.example");
		expect(chain.formatters).toBe(base.formatters);
		expect(base.contracts.multicall3.address).not.toBe(MULTICALL);
	});

	it("explains that a patch needs a chain viem can resolve", () => {
		expect(() =>
			chainOf(777001, {
				chains: { 777001: { contracts: { multicall3: { address: MULTICALL } } } },
			}),
		).toThrow(/chains\[777001\] is not a complete viem Chain.*no chain with id 777001/);
	});

	it("rejects an override whose id differs from its key", () => {
		expect(() => chainOf(1, { chains: { 1: base } })).toThrow(
			/chains\[1\] has id 8453/,
		);
		expect(() => chainOf(1, { chains: { 1: { id: 2 } } })).toThrow(
			/chains\[1\] has id 2/,
		);
	});

	it("applies per-chain transport tuning and keeps the defaults elsewhere", () => {
		const service = new ProviderService(
			{ 1: RPC_URL, 146: RPC_URL },
			{
				chains: {
					146: {
						transport: {
							multicall: { batchSize: 128 },
							http: { retryCount: 0, timeout: 5_000 },
						},
					},
				},
			},
		);

		const sonic = service.getProvider(146);
		expect(sonic.batch?.multicall).toEqual({ batchSize: 128, wait: 10 });
		expect(sonic.transport.retryCount).toBe(0);
		expect(sonic.transport.timeout).toBe(5_000);
		expect(sonic.chain?.name).toBe("Sonic");
		expect(sonic.chain && "transport" in sonic.chain).toBe(false);

		const ethereum = service.getProvider(1);
		expect(ethereum.batch?.multicall).toEqual({ batchSize: 2048, wait: 10 });
		expect(ethereum.transport.retryCount).toBe(3);
	});

	it("does not mutate the supplied overrides", () => {
		const chains: ChainOverrides = deepFreeze({
			8453: {
				contracts: { multicall3: { address: MULTICALL } },
				transport: { multicall: { batchSize: 64 } },
			},
			777001: { ...customChain },
		});

		const service = new ProviderService(
			{ 8453: RPC_URL, 777001: RPC_URL },
			{ chains },
		);

		expect(service.getProvider(8453).chain?.contracts?.multicall3?.address).toBe(
			MULTICALL,
		);
		expect(service.getProvider(777001).chain?.name).toBe("Custom Chain");
	});

	it("still reports chains without an RPC URL", () => {
		const service = new ProviderService({ 1: RPC_URL });

		expect(service.getSupportedChainIds()).toEqual([1]);
		expect(() => service.getProvider(10)).toThrow(/No provider configured/);
	});

	it("builds the same providers asynchronously", async () => {
		const service = await ProviderService.build(
			{ 137: RPC_URL, 777001: RPC_URL },
			{ chains: { 777001: customChain } },
		);

		expect(service.getProvider(137).chain?.name).toBe("Polygon");
		expect(service.getProvider(777001).chain?.name).toBe("Custom Chain");
	});
});

describe("browser chain catalog", () => {
	it("loads viem chains on demand", async () => {
		vi.resetModules();
		const catalogModule = await import(
			"../src/services/providerService/viemChainCatalog.browser.js"
		);

		expect(catalogModule.getLoadedViemChains()).toBeUndefined();
		const catalog = await catalogModule.loadViemChains();
		expect((catalog.mainnet as Chain).id).toBe(1);
		expect(catalogModule.getLoadedViemChains()).toBe(catalog);
	});

	it("tells callers to load viem chains when none are loaded", () => {
		expect(() => resolveViemChain(1, { catalog: undefined })).toThrow(
			/ProviderService\.build/,
		);
	});

	it("needs no viem chains for a complete app-supplied chain", () => {
		expect(
			resolveViemChain(777001, { override: customChain, catalog: undefined }),
		).toEqual(customChain);
	});

	it("maps each Node module to an existing browser module in package.json", () => {
		const packageJson = JSON.parse(
			readFileSync(new URL("../package.json", import.meta.url), "utf8"),
		) as { browser?: Record<string, string> };
		const entries = Object.entries(packageJson.browser ?? {});
		const toSource = (path: string) =>
			new URL(
				`../${path.replace(/^\.\/dist\//, "").replace(/\.js$/, ".ts")}`,
				import.meta.url,
			);

		expect(entries).toEqual([
			[
				"./dist/src/services/providerService/viemChainCatalog.js",
				"./dist/src/services/providerService/viemChainCatalog.browser.js",
			],
		]);
		for (const [from, to] of entries) {
			expect(existsSync(toSource(from))).toBe(true);
			expect(existsSync(toSource(to))).toBe(true);
		}
	});
});

describe("buildEulerSDK chains", () => {
	it("resolves chains through the registry viemName and app overrides", async () => {
		const deployment = (chainId: number) => ({
			chainId,
			name: `chain-${chainId}`,
			status: "production" as const,
			...(chainId === 999 ? { viemName: "wanchainTestnet" } : {}),
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
		});
		const deploymentService: IDeploymentService = {
			getDeploymentChainIds: () => [146, 999],
			getDeployment: deployment,
			addDeployment: () => {},
		};

		const sdk = await buildEulerSDK({
			config: { rpcUrls: { 146: RPC_URL, 999: RPC_URL, 777001: RPC_URL } },
			chains: {
				146: { transport: { multicall: { batchSize: 128 } } },
				777001: customChain,
			},
			servicesOverrides: { deploymentService },
		});

		expect(sdk.providerService.getProvider(999).chain?.name).toBe(
			"Wanchain Testnet",
		);
		expect(sdk.providerService.getProvider(146).batch?.multicall).toEqual({
			batchSize: 128,
			wait: 10,
		});
		expect(sdk.providerService.getProvider(777001).chain?.name).toBe(
			"Custom Chain",
		);
	});
});
