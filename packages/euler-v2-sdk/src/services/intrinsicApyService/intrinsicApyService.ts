import type { Address } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type {
	IntrinsicApyDirectAdapterConfig,
} from "./adapters/intrinsicApyDirectAdapter/index.js";
import type { IntrinsicApyV3AdapterConfig } from "./adapters/intrinsicApyV3Adapter/index.js";

export interface IntrinsicApyInfo {
	apy: number;
	provider: string;
	source?: string;
}

export interface IntrinsicApyServiceConfig {
	adapter?: "v3" | "direct";
	defillamaYieldsUrl?: string;
	pendleApiUrl?: string;
	stablewatchPoolsUrl?: string;
	stablewatchSourceUrl?: string;
	directAdapterConfig?: IntrinsicApyDirectAdapterConfig;
	v3AdapterConfig?: IntrinsicApyV3AdapterConfig;
}

export interface IIntrinsicApyService {
	fetchIntrinsicApy(
		chainId: number,
		assetAddress: Address,
	): Promise<IntrinsicApyInfo | undefined>;
	fetchChainIntrinsicApys(
		chainId: number,
	): Promise<Map<string, IntrinsicApyInfo>>;
	populateIntrinsicApy(vaults: ERC4626Vault[]): Promise<void>;
}

export interface IIntrinsicApyAdapter {
	fetchIntrinsicApy(
		chainId: number,
		assetAddress: Address,
	): Promise<IntrinsicApyInfo | undefined>;
	fetchChainIntrinsicApys(
		chainId: number,
		assetAddresses?: Address[],
	): Promise<Map<string, IntrinsicApyInfo>>;
}

export class IntrinsicApyService implements IIntrinsicApyService {
	constructor(private adapter: IIntrinsicApyAdapter) {}

	setAdapter(adapter: IIntrinsicApyAdapter): void {
		this.adapter = adapter;
	}

	async fetchIntrinsicApy(
		chainId: number,
		assetAddress: Address,
	): Promise<IntrinsicApyInfo | undefined> {
		return this.adapter.fetchIntrinsicApy(chainId, assetAddress);
	}

	async fetchChainIntrinsicApys(
		chainId: number,
	): Promise<Map<string, IntrinsicApyInfo>> {
		return this.adapter.fetchChainIntrinsicApys(chainId);
	}

	async populateIntrinsicApy(vaults: ERC4626Vault[]): Promise<void> {
		if (vaults.length === 0) return;

		const byChain = new Map<number, ERC4626Vault[]>();
		for (const vault of vaults) {
			const arr = byChain.get(vault.chainId) ?? [];
			arr.push(vault);
			byChain.set(vault.chainId, arr);
		}

		await Promise.all(
			Array.from(byChain.entries()).map(async ([chainId, chainVaults]) => {
				const assetAddresses = Array.from(
					new Map(
						chainVaults.map((vault) => [
							vault.asset.address.toLowerCase(),
							vault.asset.address,
						]),
					).entries(),
				)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([, address]) => address);
				const apyMap = await this.adapter.fetchChainIntrinsicApys(
					chainId,
					assetAddresses,
				);
				for (const vault of chainVaults) {
					const info = apyMap.get(vault.asset.address.toLowerCase());
					if (info) {
						vault.intrinsicApy = info;
					}
					vault.populated.intrinsicApy = true;
				}
			}),
		);
	}
}
