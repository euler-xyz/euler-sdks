import {
	type Chain,
	createPublicClient,
	type HttpTransportConfig,
	http,
	type PublicClient,
} from "viem";
import {
	type ChainOverrides,
	type ChainTransportOptions,
	needsViemChains,
	resolveViemChain,
} from "./chainResolution.js";
import { getLoadedViemChains, loadViemChains } from "./viemChainCatalog.js";

const VIEM_HTTP_BATCH_CONFIG = {
	batchSize: 100,
	wait: 10,
} as const;

const VIEM_MULTICALL_BATCH_CONFIG = {
	batchSize: 2048,
	wait: 10,
} as const;

export interface IProviderService {
	getProvider(chainId: number): PublicClient;
	getSupportedChainIds(): number[];
}

export interface ProviderServiceOptions {
	/** App-supplied viem chains or patches, and per-chain transport tuning, keyed by chain id. */
	chains?: ChainOverrides;
	/** EulerChains `viemName` values keyed by chain id. */
	viemNames?: Readonly<Record<number, string>>;
}

function httpBatch(
	batch: HttpTransportConfig["batch"],
): HttpTransportConfig["batch"] {
	if (batch === undefined) return VIEM_HTTP_BATCH_CONFIG;
	if (typeof batch === "boolean") return batch;
	return { ...VIEM_HTTP_BATCH_CONFIG, ...batch };
}

function createChainClient(
	chain: Chain,
	rpcUrl: string,
	tuning: ChainTransportOptions | undefined,
): PublicClient {
	return createPublicClient({
		chain,
		batch: {
			multicall: { ...VIEM_MULTICALL_BATCH_CONFIG, ...tuning?.multicall },
		},
		transport: http(rpcUrl, {
			...tuning?.http,
			batch: httpBatch(tuning?.http?.batch),
		}),
	});
}

export class ProviderService implements IProviderService {
	private readonly providers: Readonly<Record<number, PublicClient>>;

	/** Loads viem's chain list first when a chain needs it; required in browser builds. */
	static async build(
		rpcUrls: Record<number, string>,
		options: ProviderServiceOptions = {},
	): Promise<ProviderService> {
		if (needsViemChains(Object.keys(rpcUrls).map(Number), options.chains)) {
			await loadViemChains();
		}
		return new ProviderService(rpcUrls, options);
	}

	constructor(
		rpcUrls: Record<number, string>,
		options: ProviderServiceOptions = {},
	) {
		const catalog = getLoadedViemChains();
		this.providers = Object.fromEntries(
			Object.entries(rpcUrls).map(([key, rpcUrl]) => {
				const chainId = Number(key);
				const override = options.chains?.[chainId];
				const chain = resolveViemChain(chainId, {
					override,
					viemName: options.viemNames?.[chainId],
					catalog,
				});
				return [chainId, createChainClient(chain, rpcUrl, override?.transport)];
			}),
		);
	}

	getProvider(chainId: number): PublicClient {
		const provider = this.providers[chainId];
		if (!provider) {
			throw new Error(`No provider configured for chainId ${chainId}`);
		}
		return provider;
	}

	getSupportedChainIds(): number[] {
		return Object.keys(this.providers).map(Number);
	}
}
