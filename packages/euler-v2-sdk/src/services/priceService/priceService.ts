import { type Address, getAddress, formatUnits } from "viem";
import type { OraclePrice } from "../../utils/oracle.js";
import type { EVault } from "../../entities/EVault.js";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import { VaultType } from "../../utils/types.js";
import type { ProviderService } from "../providerService/providerService.js";
import type { DeploymentService } from "../deploymentService/deploymentService.js";
import { utilsLensPriceAbi } from "./utilsLensPriceAbi.js";
import {
	type PricingBackendClient,
	backendPriceToBigInt,
} from "./backendClient.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import {
	compressDataIssues,
	type DataIssue,
	type ServiceResult,
} from "../../utils/entityDiagnostics.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ONE_18 = 10n ** 18n;

/** Euler virtual USD address (decimal 840 = ISO-4217 USD). */
export const USD_ADDRESS: Address =
	"0x0000000000000000000000000000000000000348";

const USD_DECIMALS = 18;

const getDecimalScale = (decimals: number): bigint => 10n ** BigInt(decimals);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Price result with mid, ask, and bid prices.
 * `decimals` indicates the precision of the quote (output) asset —
 * e.g. 18 for USD amounts, or the UoA decimals for Layer-1 oracle prices.
 */
export type PriceResult = {
	amountOutMid: bigint;
	amountOutAsk: bigint;
	amountOutBid: bigint;
	decimals: number;
};

export type FormatAssetValueOptions = {
	maxDecimals?: number;
	minDecimals?: number;
};

export type FormattedAssetValue = {
	/** Formatted display string: "1,234.56 USDC" when no price available, empty when price available (caller formats USD). */
	display: string;
	/** Whether a USD price was available. */
	hasPrice: boolean;
	/** USD value of the amount (0 when no price). */
	usdValue: number;
	/** Human-readable token amount. */
	assetAmount: number;
	/** Token symbol. */
	assetSymbol: string;
};

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IPriceService {
	// Layer 1: Raw Oracle Prices (Unit of Account) — sync, from vault data
	getAssetOraclePrice(vault: EVault): PriceResult | undefined;
	getCollateralShareOraclePrice(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
	): OraclePrice | undefined;
	getCollateralOraclePrice(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
	): PriceResult | undefined;

	// UoA → USD rate (async — may call utilsLens or backend)
	fetchUnitOfAccountUsdRate(vault: EVault): Promise<bigint | undefined>;
	fetchUnitOfAccountUsdRateWithDiagnostics(
		vault: EVault,
		path?: string,
	): Promise<ServiceResult<bigint | undefined>>;

	// Layer 2: USD Prices (async — tries backend first, falls back to on-chain)
	fetchAssetUsdPrice(vault: ERC4626Vault): Promise<PriceResult | undefined>;
	fetchAssetUsdPriceWithDiagnostics(
		vault: ERC4626Vault,
		path?: string,
	): Promise<ServiceResult<PriceResult | undefined>>;
	fetchCollateralUsdPrice(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
	): Promise<PriceResult | undefined>;
	fetchCollateralUsdPriceWithDiagnostics(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
		path?: string,
	): Promise<ServiceResult<PriceResult | undefined>>;

	// Display helpers
	formatAssetValue(
		amount: bigint,
		vault: ERC4626Vault,
		options?: FormatAssetValueOptions,
	): Promise<FormattedAssetValue>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class PriceService implements IPriceService {
	constructor(
		private providerService: ProviderService,
		private deploymentService: DeploymentService,
		private backendClient?: PricingBackendClient,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setProviderService(providerService: ProviderService): void {
		this.providerService = providerService;
	}

	setBackendClient(backendClient: PricingBackendClient | undefined): void {
		this.backendClient = backendClient;
	}

	queryAssetPriceInfo = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		utilsLensAddress: Address,
		assetAddress: Address,
	) => {
		return provider.readContract({
			address: utilsLensAddress,
			abi: utilsLensPriceAbi,
			functionName: "getAssetPriceInfo",
			args: [assetAddress, USD_ADDRESS],
		}) as Promise<{
			queryFailure: boolean;
			amountOutMid: bigint;
		}>;
	};

	setQueryAssetPriceInfo(fn: typeof this.queryAssetPriceInfo): void {
		this.queryAssetPriceInfo = fn;
	}

	// -----------------------------------------------------------------------
	// Layer 1: Raw Oracle Prices (Unit of Account)
	// -----------------------------------------------------------------------

	getAssetOraclePrice(vault: EVault): PriceResult | undefined {
		return getAssetOraclePrice(vault);
	}

	getCollateralShareOraclePrice(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
	): OraclePrice | undefined {
		return getCollateralShareOraclePrice(liabilityVault, collateralVault);
	}

	getCollateralOraclePrice(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
	): PriceResult | undefined {
		return getCollateralOraclePrice(liabilityVault, collateralVault);
	}

	// -----------------------------------------------------------------------
	// UoA → USD Rate
	// -----------------------------------------------------------------------

	/**
	 * Get the USD rate for a vault's unit of account.
	 * Always tries backend first (UoA is a common denominator —
	 * using off-chain rates doesn't affect health factor/LTV ratios).
	 * Falls back to on-chain utilsLens call.
	 */
	async fetchUnitOfAccountUsdRate(vault: EVault): Promise<bigint | undefined> {
		return (await this.fetchUnitOfAccountUsdRateWithDiagnostics(vault)).result;
	}

	async fetchUnitOfAccountUsdRateWithDiagnostics(
		vault: EVault,
		path = "$",
	): Promise<ServiceResult<bigint | undefined>> {
		const errors: DataIssue[] = [];
		const uoaAddress = vault.unitOfAccount.address;
		if (!uoaAddress) return { result: undefined, errors };

		// USD unit of account → 1.0
		if (getAddress(uoaAddress) === getAddress(USD_ADDRESS)) {
			return { result: ONE_18, errors };
		}

		let backendError: unknown;
		let backendAttempted = false;

		// Try backend first
		if (this.backendClient?.isConfigured) {
			backendAttempted = true;
			try {
				const backendPrice = await this.backendClient.queryBackendPrice({
					address: uoaAddress,
					chainId: vault.chainId,
				});
				if (backendPrice) {
					const rate = backendPriceToBigInt(backendPrice.price);
					if (rate > 0n) return { result: rate, errors };
				}
			} catch (error) {
				backendError = error;
			}
		}

		// On-chain: call utilsLens.getAssetPriceInfo(unitOfAccount, USD)
		const priceInfo = await this.fetchAssetPriceInfo(vault.chainId, uoaAddress);
		const fallbackRate = priceInfo?.amountOutMid || undefined;
		if (backendAttempted && fallbackRate) {
			errors.push({
				code: "FALLBACK_USED",
				severity: "info",
				message: "Backend UoA/USD rate unavailable; used on-chain fallback.",
				paths: [path],
				entityId: uoaAddress,
				source: "priceService",
				originalValue:
					backendError instanceof Error ? backendError.message : undefined,
				normalizedValue: fallbackRate.toString(),
			});
		}
		return { result: fallbackRate, errors: compressDataIssues(errors) };
	}

	// -----------------------------------------------------------------------
	// Layer 2: USD Prices
	// -----------------------------------------------------------------------

	/**
	 * Get asset price in USD.
	 * Tries backend first, falls back to on-chain oracle.
	 * EVault: oraclePrice × uoaRate.
	 * EulerEarn / SecuritizeCollateral: utilsLens or backend.
	 */
	async fetchAssetUsdPrice(
		vault: ERC4626Vault,
	): Promise<PriceResult | undefined> {
		return (await this.fetchAssetUsdPriceWithDiagnostics(vault)).result;
	}

	async fetchAssetUsdPriceWithDiagnostics(
		vault: ERC4626Vault,
		path = "$",
	): Promise<ServiceResult<PriceResult | undefined>> {
		const errors: DataIssue[] = [];
		if (!vault) return { result: undefined, errors };

		let backendError: unknown;
		let backendAttempted = false;

		// Try backend first
		if (this.backendClient?.isConfigured) {
			backendAttempted = true;
			try {
				const backendPrice = await this.backendClient.queryBackendPrice({
					address: vault.asset.address,
					chainId: vault.chainId,
				});
				if (backendPrice) {
					const result = backendPriceToPriceResult(backendPrice.price);
					if (result) return { result, errors };
				}
			} catch (error) {
				backendError = error;
			}
		}

		const fallbackPrice = await this.fetchAssetUsdPriceFromOracle(vault);
		if (backendAttempted && fallbackPrice) {
			errors.push({
				code: "FALLBACK_USED",
				severity: "info",
				message: "Backend asset/USD price unavailable; used on-chain fallback.",
				paths: [path],
				entityId: vault.address,
				source: "priceService",
				originalValue:
					backendError instanceof Error ? backendError.message : undefined,
				normalizedValue: fallbackPrice.amountOutMid.toString(),
			});
		}

		if (!fallbackPrice) {
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "error",
				message: "Failed to get asset USD price.",
				paths: [path],
				entityId: vault.address,
				source: "priceService",
			});
		}

		return { result: fallbackPrice, errors: compressDataIssues(errors) };
	}

	/**
	 * Get collateral price in USD in the context of a liability vault.
	 * Tries backend first, falls back to on-chain oracle.
	 * Collateral pricing ALWAYS uses the liability vault's oracle for on-chain fallback.
	 */
	async fetchCollateralUsdPrice(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
	): Promise<PriceResult | undefined> {
		return (
			await this.fetchCollateralUsdPriceWithDiagnostics(
				liabilityVault,
				collateralVault,
			)
		).result;
	}

	async fetchCollateralUsdPriceWithDiagnostics(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
		path = "$",
	): Promise<ServiceResult<PriceResult | undefined>> {
		const errors: DataIssue[] = [];
		if (!liabilityVault || !collateralVault)
			return { result: undefined, errors };

		let backendError: unknown;
		let backendAttempted = false;

		// Try backend first
		if (this.backendClient?.isConfigured) {
			backendAttempted = true;
			try {
				const backendPrice = await this.backendClient.queryBackendPrice({
					address: collateralVault.asset.address,
					chainId: collateralVault.chainId,
				});
				if (backendPrice) {
					const result = backendPriceToPriceResult(backendPrice.price);
					if (result) return { result, errors };
				}
			} catch (error) {
				backendError = error;
			}
		}

		const fallbackPrice = await this.fetchCollateralUsdPriceFromOracle(
			liabilityVault,
			collateralVault,
		);
		if (backendAttempted && fallbackPrice) {
			errors.push({
				code: "FALLBACK_USED",
				severity: "info",
				message:
					"Backend collateral/USD price unavailable; used on-chain fallback.",
				paths: [path],
				entityId: collateralVault.asset.address,
				source: "priceService",
				originalValue:
					backendError instanceof Error ? backendError.message : undefined,
				normalizedValue: fallbackPrice.amountOutMid.toString(),
			});
		}

		return { result: fallbackPrice, errors: compressDataIssues(errors) };
	}

	// -----------------------------------------------------------------------
	// Display helpers
	// -----------------------------------------------------------------------

	/**
	 * Format an asset amount for UI display.
	 * Returns USD value when price is available, falls back to token amount + symbol.
	 */
	async formatAssetValue(
		amount: bigint,
		vault: ERC4626Vault,
		options: FormatAssetValueOptions = {},
	): Promise<FormattedAssetValue> {
		const { maxDecimals = 2, minDecimals = 2 } = options;

		if (!vault) {
			return {
				display: "-",
				hasPrice: false,
				usdValue: 0,
				assetAmount: 0,
				assetSymbol: "",
			};
		}

		const assetAmount = +formatUnits(amount, vault.asset.decimals);
		const symbol = vault.asset.symbol;

		const price = await this.fetchAssetUsdPrice(vault);

		if (!price) {
			const display = assetAmount.toLocaleString("en-US", {
				maximumFractionDigits: maxDecimals,
				minimumFractionDigits: minDecimals,
			});
			return {
				display: `${display} ${symbol}`,
				hasPrice: false,
				usdValue: 0,
				assetAmount,
				assetSymbol: symbol,
			};
		}

		const usdValue =
			assetAmount * +formatUnits(price.amountOutMid, price.decimals);
		return {
			display: "",
			hasPrice: true,
			usdValue,
			assetAmount,
			assetSymbol: symbol,
		};
	}

	// -----------------------------------------------------------------------
	// Internal helpers
	// -----------------------------------------------------------------------

	/**
	 * Get asset USD price from on-chain oracles.
	 * EVault: oraclePriceRaw × UoA rate.
	 * EulerEarn / SecuritizeCollateral: utilsLens.getAssetPriceInfo.
	 */
	private async fetchAssetUsdPriceFromOracle(
		vault: ERC4626Vault,
	): Promise<PriceResult | undefined> {
		// EVault: use oracle router (oraclePriceRaw + UoA conversion)
		if (vault.type === VaultType.EVault) {
			const oraclePrice = this.getAssetOraclePrice(vault as EVault);
			if (oraclePrice) {
				const uoaRate = await this.fetchUnitOfAccountUsdRate(vault as EVault);
				if (uoaRate) {
					const oracleScale = getDecimalScale(oraclePrice.decimals);
					return {
						amountOutMid: (oraclePrice.amountOutMid * uoaRate) / oracleScale,
						amountOutAsk: (oraclePrice.amountOutAsk * uoaRate) / oracleScale,
						amountOutBid: (oraclePrice.amountOutBid * uoaRate) / oracleScale,
						decimals: USD_DECIMALS,
					};
				}
			}
		}

		// EulerEarn / SecuritizeCollateral: use utilsLens (direct USD price)
		const priceInfo = await this.fetchAssetPriceInfo(
			vault.chainId,
			vault.asset.address,
		);

		if (!priceInfo?.amountOutMid) return undefined;

		const mid = priceInfo.amountOutMid;
		return {
			amountOutMid: mid,
			amountOutAsk: mid,
			amountOutBid: mid,
			decimals: USD_DECIMALS,
		};
	}

	/**
	 * Get collateral USD price from on-chain oracles.
	 */
	private async fetchCollateralUsdPriceFromOracle(
		liabilityVault: EVault,
		collateralVault: ERC4626Vault,
	): Promise<PriceResult | undefined> {
		const oraclePrice = this.getCollateralOraclePrice(
			liabilityVault,
			collateralVault,
		);
		if (!oraclePrice) return undefined;

		const uoaRate = await this.fetchUnitOfAccountUsdRate(liabilityVault);
		if (!uoaRate) return undefined;
		const oracleScale = getDecimalScale(oraclePrice.decimals);

		return {
			amountOutMid: (oraclePrice.amountOutMid * uoaRate) / oracleScale,
			amountOutAsk: (oraclePrice.amountOutAsk * uoaRate) / oracleScale,
			amountOutBid: (oraclePrice.amountOutBid * uoaRate) / oracleScale,
			decimals: USD_DECIMALS,
		};
	}

	/**
	 * Call utilsLens.getAssetPriceInfo(asset, USD_ADDRESS) on-chain.
	 */
	private async fetchAssetPriceInfo(
		chainId: number,
		assetAddress: Address,
	): Promise<{ amountOutMid: bigint } | undefined> {
		try {
			const provider = this.providerService.getProvider(chainId);
			const utilsLensAddress =
				this.deploymentService.getDeployment(chainId).addresses.lensAddrs
					.utilsLens;

			const priceInfo = await this.queryAssetPriceInfo(
				provider,
				utilsLensAddress,
				assetAddress,
			);

			if (
				priceInfo.queryFailure ||
				priceInfo.amountOutMid === undefined ||
				priceInfo.amountOutMid === null
			) {
				return undefined;
			}

			return { amountOutMid: priceInfo.amountOutMid };
		} catch {
			return undefined;
		}
	}
}

// ---------------------------------------------------------------------------
// Free functions — Layer 1 oracle price extraction (used by vault entities)
// ---------------------------------------------------------------------------

/**
 * Get raw oracle price for a vault's asset in the vault's unit of account.
 * Uses oraclePriceRaw (liabilityPriceInfo from the vault lens).
 */
export function getAssetOraclePrice(vault: EVault): PriceResult | undefined {
	const { oraclePriceRaw, unitOfAccount } = vault;
	if (!oraclePriceRaw || !oraclePriceRaw.amountOutMid) return undefined;

	const { amountOutMid, amountOutAsk, amountOutBid } = oraclePriceRaw;
	const ask = amountOutAsk && amountOutAsk > 0n ? amountOutAsk : amountOutMid;
	const bid = amountOutBid && amountOutBid > 0n ? amountOutBid : amountOutMid;

	return {
		amountOutMid,
		amountOutAsk: ask,
		amountOutBid: bid,
		decimals: unitOfAccount.decimals,
	};
}

/**
 * Get collateral share price from the liability vault's perspective.
 * Returns the raw OraclePrice in the liability vault's unit of account.
 */
export function getCollateralShareOraclePrice(
	liabilityVault: EVault,
	collateralVault: ERC4626Vault,
): OraclePrice | undefined {
	const collateralAddress = getAddress(collateralVault.address);

	const collateral = liabilityVault.collaterals.find(
		(c) => getAddress(c.address) === collateralAddress,
	);

	if (!collateral) return undefined;

	const { oraclePriceRaw } = collateral;
	// Treat zero amountOutMid with no meaningful bid/ask as "no price"
	if (
		!oraclePriceRaw.amountOutMid &&
		!oraclePriceRaw.amountOutAsk &&
		!oraclePriceRaw.amountOutBid
	) {
		return undefined;
	}

	return oraclePriceRaw;
}

/**
 * Get collateral ASSET price from the liability vault's perspective.
 * Converts share price to asset price using totalShares/totalAssets.
 */
export function getCollateralOraclePrice(
	liabilityVault: EVault,
	collateralVault: ERC4626Vault,
): PriceResult | undefined {
	const sharePrice = getCollateralShareOraclePrice(
		liabilityVault,
		collateralVault,
	);
	if (!sharePrice) return undefined;

	const { totalAssets, totalShares } = collateralVault;
	const uoaDecimals = liabilityVault.unitOfAccount.decimals;

	// Empty vault (both 0): ERC-4626 standard defines 1:1 ratio
	if (totalAssets === 0n && totalShares === 0n) {
		const mid = sharePrice.amountOutMid;
		const ask =
			sharePrice.amountOutAsk && sharePrice.amountOutAsk > 0n
				? sharePrice.amountOutAsk
				: mid;
		const bid =
			sharePrice.amountOutBid && sharePrice.amountOutBid > 0n
				? sharePrice.amountOutBid
				: mid;
		return {
			amountOutMid: mid,
			amountOutAsk: ask,
			amountOutBid: bid,
			decimals: uoaDecimals,
		};
	}

	if (totalAssets === 0n) {
		// totalAssets 0 but totalShares > 0 — unusual state
		return undefined;
	}

	// assetPrice = sharePrice × (totalShares / totalAssets)
	const amountOutMid = (sharePrice.amountOutMid * totalShares) / totalAssets;
	const amountOutAsk = (sharePrice.amountOutAsk * totalShares) / totalAssets;
	const amountOutBid = (sharePrice.amountOutBid * totalShares) / totalAssets;

	const ask = amountOutAsk > 0n ? amountOutAsk : amountOutMid;
	const bid = amountOutBid > 0n ? amountOutBid : amountOutMid;

	return {
		amountOutMid,
		amountOutAsk: ask,
		amountOutBid: bid,
		decimals: uoaDecimals,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function backendPriceToPriceResult(price: number): PriceResult | undefined {
	const mid = backendPriceToBigInt(price);
	if (mid <= 0n) return undefined;
	return {
		amountOutMid: mid,
		amountOutAsk: mid,
		amountOutBid: mid,
		decimals: USD_DECIMALS,
	};
}
