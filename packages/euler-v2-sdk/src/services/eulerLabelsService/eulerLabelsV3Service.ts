import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type {
	EulerLabelAssetEntry,
	EulerLabelEarnVaultEntry,
	EulerLabelPoint,
} from "../../entities/EulerLabels.js";
import {
	type IEulerLabelsService,
	populateEulerLabels,
} from "./eulerLabelsService.js";
import type { PublicLabelsV3Adapter } from "./publicLabelsV3Adapter.js";
import type { PublicEulerLabelsData } from "./publicLabelsV3Types.js";

/** Published labels with live visibility and geo policies; failed reads reject without a file fallback. */
export class EulerLabelsV3Service implements IEulerLabelsService {
	constructor(
		private readonly adapter: Pick<
			PublicLabelsV3Adapter,
			"fetchPublicEulerLabelsData"
		>,
		private readonly resolveLogoUrlFn?: (url: string) => string,
	) {}

	fetchEulerLabelsData(chainId: number): Promise<PublicEulerLabelsData> {
		return this.adapter.fetchPublicEulerLabelsData(chainId);
	}

	async fetchEulerLabelsEntities(chainId: number) {
		return (await this.fetchEulerLabelsData(chainId)).entities;
	}

	async fetchEulerLabelsProducts(chainId: number) {
		return (await this.fetchEulerLabelsData(chainId)).products;
	}

	async fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]> {
		const { points } = await this.fetchEulerLabelsData(chainId);
		return Object.entries(points).flatMap(([address, campaigns]) =>
			campaigns.map((campaign) => ({
				...campaign,
				...(campaign.type === "borrow"
					? { liabilityVaults: [address] }
					: { collateralVaults: [address] }),
			})),
		);
	}

	/** Eligible Earn membership; all published Earn metadata remains in fetchEulerLabelsData().earnVaultEntries. */
	async fetchEulerLabelsEarnVaults(
		chainId: number,
	): Promise<Array<string | EulerLabelEarnVaultEntry>> {
		const data = await this.fetchEulerLabelsData(chainId);
		return data.earnVaults.map(
			(address) => data.earnVaultEntries[address.toLowerCase()] ?? address,
		);
	}

	/** V3 geo policies are available as rawGeoPolicies; they are not file-style asset restrictions. */
	async fetchEulerLabelsAssets(
		chainId: number,
	): Promise<EulerLabelAssetEntry[]> {
		await this.fetchEulerLabelsData(chainId);
		return [];
	}

	resolveLogoUrl(url: string): string {
		return this.resolveLogoUrlFn ? this.resolveLogoUrlFn(url) : url;
	}

	async populateLabels(vaults: ERC4626Vault[]): Promise<void> {
		if (vaults.length === 0) return;
		const data = await this.fetchEulerLabelsData(vaults[0]!.chainId);
		populateEulerLabels(vaults, data, (logo) => this.resolveLogoUrl(logo), true);
	}
}
