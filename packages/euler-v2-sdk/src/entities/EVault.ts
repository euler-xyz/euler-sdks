// TypeScript equivalents for VaultLens structs (from evk-periphery/src/Lens/LensTypes.sol).
// Numeric on-chain values use bigint to avoid precision loss.

import { type Address, maxUint256 } from "viem";
import {
	type OracleAdapterEntry,
	type OracleInfo,
	type OraclePrice,
	selectLeafAdaptersForPair,
} from "../utils/oracle.js";
import type { InterestRateModelType } from "../services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultLensTypes.js";
import type { Token } from "../utils/types.js";
import type {
	AdaptiveCurveIRMInfo,
	FixedCyclicalBinaryIRMInfo,
	KinkIRMInfo,
	KinkyIRMInfo,
	LinearKinkIRMParams,
} from "../utils/irm.js";
import {
	ERC4626Vault,
	type ERC4626VaultPopulated,
	type IERC4626Vault,
	type IERC4626VaultConversion,
	VIRTUAL_DEPOSIT_AMOUNT,
	type PriceWad,
} from "./ERC4626Vault.js";
import type { IPriceService } from "../services/priceService/index.js";
import {
	getAssetOraclePrice,
	getCollateralOraclePrice,
} from "../services/priceService/index.js";
import type { VaultEntity } from "../services/vaults/vaultMetaService/index.js";
import type { IVaultMetaService } from "../services/vaults/vaultMetaService/index.js";
import type { DataIssue } from "../utils/entityDiagnostics.js";
import {
	mapDataIssuePaths,
	withPathPrefix,
} from "../utils/entityDiagnostics.js";

export type EVaultHookedOperations = {
	deposit: boolean;
	mint: boolean;
	withdraw: boolean;
	redeem: boolean;
	transfer: boolean;
	skim: boolean;
	borrow: boolean;
	repay: boolean;
	repayWithShares: boolean;
	pullDebt: boolean;
	convertFees: boolean;
	liquidate: boolean;
	flashloan: boolean;
	touch: boolean;
	vaultStatusCheck: boolean;
};

export interface EVaultFees {
	interestFee: number;
	accumulatedFeesShares: bigint;
	accumulatedFeesAssets: bigint;
	governorFeeReceiver: Address;
	protocolFeeReceiver: Address;
	protocolFeeShare: number;
}

export interface EVaultHooks {
	hookedOperations: EVaultHookedOperations;
	hookTarget: Address;
}

export interface EVaultCaps {
	supplyCap: bigint;
	borrowCap: bigint;
}

export interface EVaultLiquidation {
	maxLiquidationDiscount: number;
	liquidationCoolOffTime: number;
	socializeDebt: boolean;
}

export interface InterestRates {
	borrowSPY: string;
	borrowAPY: string;
	supplyAPY: string;
}

export type InterestRateModel =
	| {
			address: Address;
			type: InterestRateModelType.KINK;
			data: KinkIRMInfo | null;
			params: LinearKinkIRMParams | null;
	  }
	| {
			address: Address;
			type: InterestRateModelType.ADAPTIVE_CURVE;
			data: AdaptiveCurveIRMInfo | null;
			params: null;
	  }
	| {
			address: Address;
			type: InterestRateModelType.KINKY;
			data: KinkyIRMInfo | null;
			params: null;
	  }
	| {
			address: Address;
			type: InterestRateModelType.FIXED_CYCLICAL_BINARY;
			data: FixedCyclicalBinaryIRMInfo | null;
			params: null;
	  }
	| {
			address: Address;
			type: InterestRateModelType.UNKNOWN;
			data: null;
			params: null;
	  };

export interface EVaultCollateral {
	address: Address;
	borrowLTV: number;
	liquidationLTV: number;
	ramping?: EVaultCollateralRamping;
	oraclePriceRaw: OraclePrice; // shouldn't be used directly, use EVault price getters instead
	vault?: VaultEntity;
	oracleAdapters?: OracleAdapterEntry[];
	marketPriceUsd?: PriceWad;
}

export interface EVaultCollateralRamping {
	initialLiquidationLTV: number;
	targetTimestamp: number;
	rampDuration: bigint;
}

export type RiskPrice = {
	priceLiquidation: PriceWad;
	priceBorrowing: PriceWad;
};

export interface IEVault extends IERC4626Vault {
	unitOfAccount: Token;

	totalCash: bigint;
	totalBorrowed: bigint;

	creator: Address;
	governorAdmin: Address;
	dToken: Address;
	balanceTracker: Address;

	fees: EVaultFees;
	hooks: EVaultHooks;
	caps: EVaultCaps;
	liquidation: EVaultLiquidation;
	oracle: OracleInfo;
	interestRates: InterestRates;
	interestRateModel: InterestRateModel;
	collaterals: EVaultCollateral[];

	evcCompatibleAsset: boolean;

	oraclePriceRaw: OraclePrice; // shouldn't be used directly, use EVault price getters instead
	timestamp: number;
	populated?: Partial<EVaultPopulated>;
}

export interface EVaultPopulated extends ERC4626VaultPopulated {
	collaterals: boolean;
}

export class EVault
	extends ERC4626Vault
	implements IEVault, IERC4626VaultConversion
{
	unitOfAccount: Token;
	totalCash: bigint;
	totalBorrowed: bigint;
	creator: Address;
	governorAdmin: Address;
	dToken: Address;
	balanceTracker: Address;
	fees: EVaultFees;
	hooks: EVaultHooks;
	caps: EVaultCaps;
	liquidation: EVaultLiquidation;
	oracle: OracleInfo;
	interestRates: InterestRates;
	interestRateModel: InterestRateModel;
	collaterals: EVaultCollateral[];
	evcCompatibleAsset: boolean;
	oraclePriceRaw: OraclePrice;
	timestamp: number;
	declare populated: EVaultPopulated;

	constructor(args: IEVault) {
		super(args);
		this.unitOfAccount = args.unitOfAccount;
		this.totalCash = args.totalCash;
		this.totalBorrowed = args.totalBorrowed;
		this.creator = args.creator;
		this.governorAdmin = args.governorAdmin;
		this.dToken = args.dToken;
		this.balanceTracker = args.balanceTracker;
		this.fees = args.fees;
		this.hooks = args.hooks;
		this.caps = args.caps;
		this.liquidation = args.liquidation;
		this.oracle = args.oracle;
		this.interestRates = args.interestRates;
		this.interestRateModel = args.interestRateModel;
		this.collaterals = args.collaterals;
		this.evcCompatibleAsset = args.evcCompatibleAsset;
		this.oraclePriceRaw = args.oraclePriceRaw;
		this.timestamp = args.timestamp;
		this.populated = {
			...this.populated,
			collaterals: args.populated?.collaterals ?? false,
		};
	}

	/** Conversion using VIRTUAL_DEPOSIT (matches EVault contract). */
	override convertToAssets(shares: bigint): bigint {
		const totalAssetsAdjusted = this.totalAssets + VIRTUAL_DEPOSIT_AMOUNT;
		const totalSharesAdjusted = this.totalShares + VIRTUAL_DEPOSIT_AMOUNT;
		return (shares * totalAssetsAdjusted) / totalSharesAdjusted;
	}

	/** Conversion using VIRTUAL_DEPOSIT (matches EVault contract). */
	override convertToShares(assets: bigint): bigint {
		const totalAssetsAdjusted = this.totalAssets + VIRTUAL_DEPOSIT_AMOUNT;
		const totalSharesAdjusted = this.totalShares + VIRTUAL_DEPOSIT_AMOUNT;
		return (assets * totalSharesAdjusted) / totalAssetsAdjusted;
	}

	get availableToBorrow(): bigint {
		const { borrowCap } = this.caps;
		if (borrowCap === maxUint256) return this.totalCash;
		if (this.totalBorrowed >= borrowCap) return 0n;
		const remaining = borrowCap - this.totalBorrowed;
		return this.totalCash < remaining ? this.totalCash : remaining;
	}

	get assetRiskPrice(): RiskPrice | undefined {
		const price = getAssetOraclePrice(this);
		if (!price) return undefined;

		const scale = 10n ** BigInt(18 - price.decimals);
		return {
			priceLiquidation: price.amountOutMid * scale,
			priceBorrowing: price.amountOutAsk * scale,
		};
	}

	getCollateralRiskPrice(collateralVault: ERC4626Vault): RiskPrice | undefined {
		const price = getCollateralOraclePrice(this, collateralVault);
		if (!price) return undefined;

		const scale = 10n ** BigInt(18 - price.decimals);
		return {
			priceLiquidation: price.amountOutMid * scale,
			priceBorrowing: price.amountOutBid * scale,
		};
	}

	async fetchUnitOfAccountMarketPriceUsd(
		priceService: IPriceService,
	): Promise<PriceWad | undefined> {
		return priceService.fetchUnitOfAccountUsdRate(this);
	}

	async fetchCollateralMarketPriceUsd(
		collateralVault: ERC4626Vault,
		priceService: IPriceService,
	): Promise<PriceWad | undefined> {
		const price = await priceService.fetchCollateralUsdPrice(
			this,
			collateralVault,
		);
		if (!price) return undefined;
		return price.amountOutMid;
	}

	async fetchCollateralMarketValueUsd(
		amount: bigint,
		collateralVault: ERC4626Vault,
		priceService: IPriceService,
	): Promise<bigint | undefined> {
		const price = await priceService.fetchCollateralUsdPrice(
			this,
			collateralVault,
		);
		if (!price) return undefined;
		return (
			(amount * price.amountOutMid) /
			10n ** BigInt(collateralVault.asset.decimals)
		);
	}

	async populateCollaterals(
		vaultMetaService: IVaultMetaService,
	): Promise<DataIssue[]> {
		const addresses = this.collaterals.map((c) => c.address);
		if (addresses.length === 0) {
			this.populated.collaterals = true;
			return [];
		}
		const errors: DataIssue[] = [];

		const collateralVaults = await Promise.all(
			addresses.map(async (addr, index) => {
				const fetched = await vaultMetaService.fetchVault(this.chainId, addr);
				errors.push(
					...fetched.errors.map((issue) => ({
						...mapDataIssuePaths(issue, (path) =>
							withPathPrefix(path, `$.collaterals[${index}].vault`),
						),
					})),
				);
				return fetched.result;
			}),
		);

		const vaultByAddress = new Map(
			collateralVaults
				.filter((v) => v !== undefined)
				.map((v) => [(v as { address: Address }).address.toLowerCase(), v]),
		);

		for (const collateral of this.collaterals) {
			collateral.vault = vaultByAddress.get(collateral.address.toLowerCase());
			if (!collateral.vault) {
				collateral.oracleAdapters = [];
				continue;
			}

			const collateralAsset = collateral.vault.asset.address;
			const collateralVault = collateral.address;
			const quote = this.unitOfAccount.address;
			const byAsset = selectLeafAdaptersForPair(
				this.oracle.adapters,
				collateralAsset,
				quote,
			);
			const byVault = selectLeafAdaptersForPair(
				this.oracle.adapters,
				collateralVault,
				quote,
			);
			const deduped = new Map<string, (typeof byAsset)[number]>();
			[...byAsset, ...byVault].forEach((adapter) => {
				const key = `${adapter.oracle.toLowerCase()}:${adapter.base.toLowerCase()}:${adapter.quote.toLowerCase()}`;
				if (!deduped.has(key)) deduped.set(key, adapter);
			});
			collateral.oracleAdapters = [...deduped.values()];
		}
		this.populated.collaterals = true;
		return errors;
	}

	override async populateMarketPrices(
		priceService: IPriceService,
	): Promise<DataIssue[]> {
		const errors: DataIssue[] = [];
		try {
			const priced = await priceService.fetchAssetUsdPriceWithDiagnostics(
				this,
				"$.marketPriceUsd",
			);
			this.marketPriceUsd = priced.result?.amountOutMid;
			errors.push(...priced.errors);
		} catch (error) {
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "error",
				message: "Failed to populate asset market price.",
				paths: ["$.marketPriceUsd"],
				entityId: this.asset.address,
				source: "priceService",
				originalValue: error instanceof Error ? error.message : String(error),
			});
			this.marketPriceUsd = undefined;
		}

		await Promise.all(
			this.collaterals.map(async (collateral, index) => {
				if (!collateral.vault) return;
				try {
					const priced =
						await priceService.fetchCollateralUsdPriceWithDiagnostics(
							this,
							collateral.vault as ERC4626Vault,
							`$.collaterals[${index}].marketPriceUsd`,
						);
					collateral.marketPriceUsd = priced.result?.amountOutMid;
					errors.push(...priced.errors);
				} catch (error) {
					errors.push({
						code: "SOURCE_UNAVAILABLE",
						severity: "error",
						message: "Failed to populate collateral market price.",
						paths: [`$.collaterals[${index}].marketPriceUsd`],
						entityId: collateral.vault?.asset.address ?? collateral.address,
						source: "priceService",
						originalValue:
							error instanceof Error ? error.message : String(error),
					});
					collateral.marketPriceUsd = undefined;
				}
			}),
		);
		this.populated.marketPrices = true;
		return errors;
	}
}
