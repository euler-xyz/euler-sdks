import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { type Chain, defineChain, zeroAddress } from "viem";
import * as viemChains from "viem/chains";
import { base, mainnet } from "viem/chains";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import type { IDeploymentService } from "../src/services/deploymentService/index.js";
import {
	type ChainOverrides,
	ProviderService,
	resolveViemChain,
} from "../src/services/providerService/index.js";
import { INTERIM_VIEM_NAMES } from "../src/services/providerService/chainResolution.js";

const RPC_URL = "https://rpc.example";
const MULTICALL = "0x1111111111111111111111111111111111111111";

const customChain = defineChain({
	id: 777001,
	name: "Custom Chain",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: { default: { http: [RPC_URL] } },
	contracts: { multicall3: { address: MULTICALL } },
});

const catalogChain = defineChain({
	id: 777002,
	name: "Catalog Chain",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: { default: { http: [RPC_URL] } },
	blockExplorers: {
		default: { name: "Catalog Explorer", url: "https://catalog.example" },
	},
	contracts: {
		multicall3: { address: "0x2222222222222222222222222222222222222222" },
		ensRegistry: { address: "0x3333333333333333333333333333333333333333" },
	},
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

	it("resolves each interim viem name while the registry has no viemName for its chain", () => {
		for (const [chainId, viemName] of Object.entries(INTERIM_VIEM_NAMES)) {
			expect(chainOf(Number(chainId))).toBe(
				viemChains[viemName as keyof typeof viemChains],
			);
		}
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

	it.each([
		undefined,
		"futureChain",
	])("keeps resolved providers usable when another chain is missing (viemName: %s)", (viemName) => {
		const service = new ProviderService(
			{ 137: RPC_URL, 777001: RPC_URL },
			{ viemNames: viemName ? { 777001: viemName } : undefined },
		);

		expect(service.getSupportedChainIds()).toEqual([137]);
		expect(service.getProvider(137).chain?.name).toBe("Polygon");
		expect(() => service.getProvider(777001)).toThrow(
			/viem has no chain with id 777001.*pass chains: \{ 777001: <viem Chain> \}/,
		);
		if (viemName) {
			expect(() => service.getProvider(777001)).toThrow(/export "futureChain"/);
		}
	});

	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		-1,
		1.5,
	])("rejects an invalid RPC chain id %s during initialization", (chainId) => {
		expect(
			() => new ProviderService({ 137: RPC_URL, [chainId]: RPC_URL }),
		).toThrow();
	});

	it.each([
		{ viemNames: { 137: "futureChain" } },
		{ viemNames: { 777001: "mainnet" } },
		{ chains: { 777001: { id: 137 } } },
		{ chains: { 777001: { name: "Incomplete chain" } } },
	])("rejects invalid explicit metadata during initialization: %j", (options) => {
		expect(
			() => new ProviderService({ 137: RPC_URL, 777001: RPC_URL }, options),
		).toThrow();
	});

	it("rejects ambiguous chains during initialization", () => {
		expect(
			() =>
				new ProviderService({ 137: RPC_URL, 777001: RPC_URL, 84532: RPC_URL }),
		).toThrow(/several chains with id 84532/);
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
		const chain = resolveViemChain(catalogChain.id, {
			override: deepFreeze({
				contracts: { multicall3: { address: MULTICALL } },
				blockExplorers: {
					default: { name: "Explorer", url: "https://explorer.example" },
				},
			}),
			catalog: deepFreeze({ catalogChain }),
		});

		expect(chain.name).toBe("Catalog Chain");
		expect(chain.contracts?.multicall3?.address).toBe(MULTICALL);
		expect(chain.contracts?.ensRegistry).toEqual(catalogChain.contracts.ensRegistry);
		expect(chain.blockExplorers?.default.url).toBe("https://explorer.example");
		expect(chain.nativeCurrency).toBe(catalogChain.nativeCurrency);
		expect(catalogChain.contracts.multicall3.address).not.toBe(MULTICALL);
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
			777001: { ...customChain, transport: { multicall: { batchSize: 64 } } },
		});

		const service = new ProviderService({ 777001: RPC_URL }, { chains });

		expect(service.getProvider(777001).chain?.name).toBe("Custom Chain");
		expect(service.getProvider(777001).batch?.multicall).toEqual({
			batchSize: 64,
			wait: 10,
		});
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
	const emptyDeploymentService: IDeploymentService = {
		getDeploymentChainIds: () => [],
		getDeployment: () => {
			throw new Error("No deployments in fixture");
		},
		addDeployment: () => {},
	};

	it("builds usable chains when an RPC chain is absent from viem", async () => {
		const sdk = await buildEulerSDK({
			config: { rpcUrls: { 137: RPC_URL, 777001: RPC_URL } },
			servicesOverrides: { deploymentService: emptyDeploymentService },
		});

		expect(sdk.providerService.getSupportedChainIds()).toEqual([137]);
		expect(sdk.providerService.getProvider(137).chain?.name).toBe("Polygon");
		expect(() => sdk.providerService.getProvider(777001)).toThrow(
			/viem has no chain with id 777001/,
		);
	});

	it.each([
		{},
		{ 777001: RPC_URL },
	])("builds an empty provider set when no configured chain resolves: %j", async (rpcUrls) => {
		const sdk = await buildEulerSDK({
			config: { rpcUrls },
			servicesOverrides: { deploymentService: emptyDeploymentService },
		});

		expect(sdk.providerService.getSupportedChainIds()).toEqual([]);
		expect(() => sdk.providerService.getProvider(777001)).toThrow(
			777001 in rpcUrls ? /viem has no chain/ : /No provider configured/,
		);
	});

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
