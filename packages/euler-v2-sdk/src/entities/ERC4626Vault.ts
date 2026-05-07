import type { Address } from "viem";
import type { ERC4626Data, Token } from "../utils/types.js";
import type { IPriceService } from "../services/priceService/index.js";
import type {
	IRewardsService,
	VaultRewardInfo,
} from "../services/rewardsService/index.js";
import type { IntrinsicApyInfo } from "../services/intrinsicApyService/index.js";
import type { EulerLabel } from "./EulerLabels.js";
import { tokenAmountToUsdValue } from "../utils/normalization.js";
import {
	dataIssueLocation,
	type DataIssue,
	vaultDiagnosticOwner,
} from "../utils/entityDiagnostics.js";

/** Virtual deposit amount used in share/asset conversions (matches EVault ConversionHelpers.sol). */
export const VIRTUAL_DEPOSIT_AMOUNT = 1_000_000n;

/** USD price per whole token as a plain decimal number. */
export type PriceUsd = number;

export interface ERC4626VaultPopulated {
	marketPrices: boolean;
	rewards: boolean;
	intrinsicApy: boolean;
	labels: boolean;
}

export interface IERC4626Vault extends ERC4626Data {
	type: string;
	chainId: number;
	address: Address;
	shares: Token;
	asset: Token;
	totalShares: bigint;
	totalAssets: bigint;
	readonly isBorrowable: boolean;
	populated?: Partial<ERC4626VaultPopulated>;
}

/** Interface for ERC4626 share/asset conversion methods (not part of data shape). */
export interface IERC4626VaultConversion {
	convertToAssets(shares: bigint): bigint;
	convertToShares(assets: bigint): bigint;
}

export class ERC4626Vault implements IERC4626Vault, IERC4626VaultConversion {
	type: string;
	chainId: number;
	address: Address;
	shares: Token;
	asset: Token;
	totalShares: bigint;
	totalAssets: bigint;
	marketPriceUsd?: PriceUsd;
	rewards?: VaultRewardInfo;
	intrinsicApy?: IntrinsicApyInfo;
	eulerLabel?: EulerLabel;
	populated: ERC4626VaultPopulated;

	constructor(args: IERC4626Vault) {
		this.type = args.type;
		this.chainId = args.chainId;
		this.address = args.address;
		this.shares = args.shares;
		this.asset = args.asset;
		this.totalShares = args.totalShares;
		this.totalAssets = args.totalAssets;
		this.populated = {
			marketPrices: args.populated?.marketPrices ?? false,
			rewards: args.populated?.rewards ?? false,
			intrinsicApy: args.populated?.intrinsicApy ?? false,
			labels: args.populated?.labels ?? false,
		};
	}

	get isBorrowable(): boolean {
		return false;
	}

	get availableLiquidity(): bigint {
		return this.totalAssets;
	}

	/** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
	convertToAssets(shares: bigint): bigint {
		return shares;
	}

	/** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
	convertToShares(assets: bigint): bigint {
		return assets;
	}

	async fetchAssetMarketValueUsd(
		amount: bigint,
		priceService: IPriceService,
	): Promise<number | undefined> {
		const price = await priceService.fetchAssetUsdPrice(this);
		if (!price) return undefined;
		return tokenAmountToUsdValue(amount, this.asset.decimals, price);
	}

	async populateMarketPrices(
		priceService: IPriceService,
	): Promise<DataIssue[]> {
		try {
			const priced = await priceService.fetchAssetUsdPriceWithDiagnostics(
				this,
				"$.marketPriceUsd",
			);
			this.marketPriceUsd = priced.result;
			this.populated.marketPrices = true;
			return priced.errors;
		} catch (error) {
			this.marketPriceUsd = undefined;
			this.populated.marketPrices = false;
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "error",
					message: "Failed to populate asset market price.",
					locations: [
						dataIssueLocation(
							vaultDiagnosticOwner(this.chainId, this.address),
							"$.marketPriceUsd",
						),
					],
					source: "priceService",
					originalValue: error instanceof Error ? error.message : String(error),
				},
			];
		}
	}

	async populateRewards(rewardsService: IRewardsService): Promise<DataIssue[]> {
		try {
			this.rewards = await rewardsService.fetchVaultRewards(
				this.chainId,
				this.address,
			);
			this.populated.rewards = true;
			return [];
		} catch (error) {
			this.rewards = undefined;
			this.populated.rewards = false;
			return [
				{
					code: "SOURCE_UNAVAILABLE",
					severity: "error",
					message: "Failed to populate rewards.",
					locations: [
						dataIssueLocation(
							vaultDiagnosticOwner(this.chainId, this.address),
							"$.rewards",
						),
					],
					source: "rewardsService",
					originalValue: error instanceof Error ? error.message : String(error),
				},
			];
		}
	}
}
