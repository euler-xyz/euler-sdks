import { type Address, getAddress, isAddressEqual } from "viem";
import type {
	Account,
	AccountPopulated,
	AccountPosition,
	DaysToLiquidation,
	GetNextSubAccountOptions,
	IHasVaultAddress,
} from "./Account.js";
import {
	type GetFreeSubAccountsOptions,
	getFreeSubAccounts as getFreeSubAccountAddresses,
	selectBorrowCompatibleSubAccount,
} from "../utils/subAccounts.js";
import {
	type AccountYieldPosition,
	type YieldApyBreakdown,
	computePositionsNetApy,
	computePositionsNetApyBreakdown,
	computePositionsRoe,
	computePositionsRoeBreakdown,
	computeSupplyApyBreakdown,
	computeCollateralMultiplier,
} from "../utils/accountComputations.js";
import {
	resolveBorrowCollateralPositions,
	resolveBorrowCollateralVaults,
} from "../utils/accountPositionClassification.js";
import {
	bigintRatioToNumber,
	wadRatioToDecimal,
} from "../utils/normalization.js";
import type { ViewerOptions } from "../services/rewardsService/index.js";

export interface PortfolioPositionFilterContext<
	TVaultEntity extends IHasVaultAddress = IHasVaultAddress,
> {
	account: Account<TVaultEntity>;
}

export type PortfolioPositionFilter<
	TVaultEntity extends IHasVaultAddress = IHasVaultAddress,
> = (
	position: AccountPosition<TVaultEntity>,
	context: PortfolioPositionFilterContext<TVaultEntity>,
) => boolean;

export interface PortfolioOptions<
	TVaultEntity extends IHasVaultAddress = IHasVaultAddress,
> {
	/** Permanent predicate applied to every AccountPosition considered by the portfolio. */
	positionFilter?: PortfolioPositionFilter<TVaultEntity>;
}

export interface PortfolioSavingsPositionArgs<
	TVaultEntity extends IHasVaultAddress = never,
> {
	position: AccountPosition<TVaultEntity>;
	vault?: TVaultEntity;
	subAccount: Address;
	shares: bigint;
	assets: bigint;
	suppliedValueUsd?: number;
}

/**
 * Savings entry produced by `Portfolio.savings`.
 *
 * The default-view getters (`apy`, `apyBreakdown`) return the no-viewer
 * "headline" numbers. Pass a viewer through `getApyBreakdown({ viewer })`
 * to apply whitelist/blacklist eligibility on the rewards bucket.
 */
export class PortfolioSavingsPosition<
	TVaultEntity extends IHasVaultAddress = never,
> {
	position: AccountPosition<TVaultEntity>;
	vault?: TVaultEntity;
	subAccount: Address;
	shares: bigint;
	assets: bigint;
	suppliedValueUsd?: number;

	constructor(args: PortfolioSavingsPositionArgs<TVaultEntity>) {
		this.position = args.position;
		this.vault = args.vault;
		this.subAccount = args.subAccount;
		this.shares = args.shares;
		this.assets = args.assets;
		this.suppliedValueUsd = args.suppliedValueUsd;
	}

	/** Default-view APY total (no viewer). */
	get apy(): number | undefined {
		return this.getApyBreakdown()?.total;
	}

	/** Default-view APY breakdown (no viewer). */
	get apyBreakdown(): YieldApyBreakdown | undefined {
		return this.getApyBreakdown();
	}

	/**
	 * Supply APY contribution breakdown for this savings position.
	 * `opts.viewer` filters whitelist/blacklist-gated rewards.
	 */
	getApyBreakdown(opts: ViewerOptions = {}): YieldApyBreakdown | undefined {
		return computeSupplyApyBreakdown(this.vault, opts.viewer);
	}
}

export interface PortfolioBorrowPositionArgs<
	TVaultEntity extends IHasVaultAddress = never,
> {
	borrow: AccountPosition<TVaultEntity>;
	collaterals: AccountPosition<TVaultEntity>[];
	collateral?: AccountPosition<TVaultEntity>;
	borrowVault?: TVaultEntity;
	collateralVault?: TVaultEntity;
	collateralVaults: Address[];
	subAccount: Address;
	healthFactor?: bigint;
	userLTV?: bigint;
	currentLTV?: bigint;
	borrowed: bigint;
	supplied: bigint;
	price?: number;
	primaryCollateralLiquidationPrice?: number;
	borrowLiquidationPriceUsd?: number;
	collateralLiquidationPricesUsd?: Record<Address, number>;
	liquidatable: boolean;
	borrowLTV?: number;
	liquidationLTV?: number;
	accountLiquidationLTV?: number;
	liabilityValueBorrowing?: bigint;
	liabilityValueLiquidation?: bigint;
	liabilityValueUsd?: number;
	totalCollateralValueUsd?: number;
	collateralValueLiquidation?: bigint;
	timeToLiquidation?: DaysToLiquidation;
	multiplier?: number;
}

/**
 * Borrow entry produced by `Portfolio.borrows`.
 *
 * Default-view getters (`netApy`, `roe`, `apyBreakdown`, `roeBreakdown`) return
 * the no-viewer "headline" numbers. Pass a viewer through `getApyBreakdown({ viewer })`
 * or `getRoeBreakdown({ viewer })` to apply whitelist/blacklist eligibility on
 * the rewards bucket.
 */
export class PortfolioBorrowPosition<
	TVaultEntity extends IHasVaultAddress = never,
> {
	/** Underlying debt position. */
	borrow: AccountPosition<TVaultEntity>;
	/** Collateral positions backing the debt. */
	collaterals: AccountPosition<TVaultEntity>[];
	/** Primary collateral position. */
	collateral?: AccountPosition<TVaultEntity>;
	borrowVault?: TVaultEntity;
	collateralVault?: TVaultEntity;
	collateralVaults: Address[];
	subAccount: Address;
	healthFactor?: bigint;
	userLTV?: bigint;
	currentLTV?: bigint;
	borrowed: bigint;
	supplied: bigint;
	price?: number;
	primaryCollateralLiquidationPrice?: number;
	borrowLiquidationPriceUsd?: number;
	collateralLiquidationPricesUsd?: Record<Address, number>;
	liquidatable: boolean;
	borrowLTV?: number;
	liquidationLTV?: number;
	accountLiquidationLTV?: number;
	liabilityValueBorrowing?: bigint;
	liabilityValueLiquidation?: bigint;
	liabilityValueUsd?: number;
	totalCollateralValueUsd?: number;
	collateralValueLiquidation?: bigint;
	timeToLiquidation?: DaysToLiquidation;
	/** Effective collateral multiplier: supplied value / equity value. */
	multiplier?: number;

	constructor(args: PortfolioBorrowPositionArgs<TVaultEntity>) {
		this.borrow = args.borrow;
		this.collaterals = args.collaterals;
		this.collateral = args.collateral;
		this.borrowVault = args.borrowVault;
		this.collateralVault = args.collateralVault;
		this.collateralVaults = args.collateralVaults;
		this.subAccount = args.subAccount;
		this.healthFactor = args.healthFactor;
		this.userLTV = args.userLTV;
		this.currentLTV = args.currentLTV;
		this.borrowed = args.borrowed;
		this.supplied = args.supplied;
		this.price = args.price;
		this.primaryCollateralLiquidationPrice = args.primaryCollateralLiquidationPrice;
		this.borrowLiquidationPriceUsd = args.borrowLiquidationPriceUsd;
		this.collateralLiquidationPricesUsd = args.collateralLiquidationPricesUsd;
		this.liquidatable = args.liquidatable;
		this.borrowLTV = args.borrowLTV;
		this.liquidationLTV = args.liquidationLTV;
		this.accountLiquidationLTV = args.accountLiquidationLTV;
		this.liabilityValueBorrowing = args.liabilityValueBorrowing;
		this.liabilityValueLiquidation = args.liabilityValueLiquidation;
		this.liabilityValueUsd = args.liabilityValueUsd;
		this.totalCollateralValueUsd = args.totalCollateralValueUsd;
		this.collateralValueLiquidation = args.collateralValueLiquidation;
		this.timeToLiquidation = args.timeToLiquidation;
		this.multiplier = args.multiplier;
	}

	/** Default-view net APY (no viewer). */
	get netApy(): number | undefined {
		return this.getApyBreakdown()?.total;
	}

	/** Default-view ROE (no viewer). */
	get roe(): number | undefined {
		return this.getRoeBreakdown()?.total;
	}

	/** Default-view APY breakdown (no viewer). */
	get apyBreakdown(): YieldApyBreakdown | undefined {
		return this.getApyBreakdown();
	}

	/** Default-view ROE breakdown (no viewer). */
	get roeBreakdown(): YieldApyBreakdown | undefined {
		return this.getRoeBreakdown();
	}

	/**
	 * Net APY contribution breakdown for this borrow position.
	 * `opts.viewer` filters whitelist/blacklist-gated rewards.
	 */
	getApyBreakdown(opts: ViewerOptions = {}): YieldApyBreakdown | undefined {
		return computePositionsNetApyBreakdown(this.yieldPositions, opts.viewer);
	}

	/**
	 * ROE contribution breakdown for this borrow position.
	 * `opts.viewer` filters whitelist/blacklist-gated rewards.
	 */
	getRoeBreakdown(opts: ViewerOptions = {}): YieldApyBreakdown | undefined {
		return computePositionsRoeBreakdown(this.yieldPositions, opts.viewer);
	}

	private get yieldPositions(): AccountYieldPosition[] {
		return borrowYieldPositions(this.borrow, this.collaterals);
	}
}

export interface IPortfolio<TVaultEntity extends IHasVaultAddress = never> {
	account: Account<TVaultEntity>;
	populated: AccountPopulated;
	getFreeSubAccounts(options?: GetFreeSubAccountsOptions): Address[];
	getNextSubAccount(options?: GetNextSubAccountOptions): Address | undefined;
	getNewSubAccount(options?: GetNextSubAccountOptions): Address | undefined;
	/** Structural set of positions across the portfolio. Viewer-independent. */
	readonly positions: AccountPosition<TVaultEntity>[];
	/**
	 * Savings positions. Per-position `apyBreakdown` is the default-view (no
	 * viewer) value; use `position.getApyBreakdown({ viewer })` for viewer-aware.
	 */
	readonly savings: PortfolioSavingsPosition<TVaultEntity>[];
	/**
	 * Borrow positions. Per-position `apyBreakdown` / `roeBreakdown` are
	 * default-view; use `position.getApyBreakdown({ viewer })` /
	 * `position.getRoeBreakdown({ viewer })` for viewer-aware.
	 */
	readonly borrows: PortfolioBorrowPosition<TVaultEntity>[];
	readonly totalSuppliedValueUsd?: number;
	readonly totalBorrowedValueUsd?: number;
	readonly netAssetValueUsd?: number;
	/** Default-view net APY (no viewer). Equivalent to `getNetApy()`. */
	readonly netApy?: number;
	getNetApy(opts?: ViewerOptions): number | undefined;
	/** Default-view ROE (no viewer). Equivalent to `getRoe()`. */
	readonly roe?: number;
	getRoe(opts?: ViewerOptions): number | undefined;
	/** Default-view net APY breakdown (no viewer). Equivalent to `getNetApyBreakdown()`. */
	readonly apyBreakdown?: YieldApyBreakdown;
	getNetApyBreakdown(opts?: ViewerOptions): YieldApyBreakdown | undefined;
	/** Default-view ROE breakdown (no viewer). Equivalent to `getRoeBreakdown()`. */
	readonly roeBreakdown?: YieldApyBreakdown;
	getRoeBreakdown(opts?: ViewerOptions): YieldApyBreakdown | undefined;
	readonly totalRewardsValueUsd?: number;
}

/**
 * High-level account view that abstracts sub-accounts into savings and borrows.
 *
 * Portfolio is computed from an Account. It stores only the Account reference and
 * permanent construction options, so Account mutations and re-population are
 * reflected by subsequent Portfolio computed-property reads.
 */
export class Portfolio<TVaultEntity extends IHasVaultAddress = never>
	implements IPortfolio<TVaultEntity>
{
	public readonly account: Account<TVaultEntity>;
	public readonly populated: AccountPopulated;
	private readonly options: PortfolioOptions<TVaultEntity>;

	constructor(
		account: Account<TVaultEntity>,
		options: PortfolioOptions<TVaultEntity> = {},
	) {
		if (!account.populated.vaults || !account.populated.marketPrices) {
			throw new Error(
				"Portfolio requires an Account populated with vaults and market prices.",
			);
		}

		this.account = account;
		this.populated = account.populated;
		this.options = options;
	}

	/**
	 * Returns sub-account addresses with no active supplied or borrowed position
	 * in this portfolio view.
	 */
	getFreeSubAccounts(options: GetFreeSubAccountsOptions = {}): Address[] {
		return getFreeSubAccountAddresses(
			this.account.owner,
			this.occupiedPositionSubAccounts(),
			options,
		);
	}

	/**
	 * Returns the first sub-account address suitable for opening a new position
	 * in this portfolio view.
	 */
	getNextSubAccount(
		options: GetNextSubAccountOptions = {},
	): Address | undefined {
		const occupied = options.borrowVault
			? this.occupiedPositionSubAccounts()
			: this.borrowPositionSubAccounts();
		const freeSubAccounts = getFreeSubAccountAddresses(
			this.account.owner,
			occupied,
			options,
		);

		if (!options.borrowVault) return freeSubAccounts[0];

		return selectBorrowCompatibleSubAccount(
			freeSubAccounts.map((subAccount) => ({
				subAccount,
				enabledControllers:
					this.account.getSubAccount(subAccount)?.enabledControllers ?? [],
			})),
			options.borrowVault,
		);
	}

	/** Alias for callers using new-position terminology. */
	getNewSubAccount(
		options: GetNextSubAccountOptions = {},
	): Address | undefined {
		return this.getNextSubAccount(options);
	}

	/** Structural set of positions across the portfolio. Viewer-independent. */
	get positions(): AccountPosition<TVaultEntity>[] {
		const byKey = new Map<string, AccountPosition<TVaultEntity>>();
		for (const saving of this.savings) {
			byKey.set(
				portfolioPositionKey(
					saving.position.account,
					saving.position.vaultAddress,
				),
				saving.position,
			);
		}
		for (const borrow of this.borrows) {
			byKey.set(
				portfolioPositionKey(borrow.borrow.account, borrow.borrow.vaultAddress),
				borrow.borrow,
			);
			for (const collateral of borrow.collaterals) {
				byKey.set(
					portfolioPositionKey(collateral.account, collateral.vaultAddress),
					collateral,
				);
			}
		}
		return Array.from(byKey.values());
	}

	/**
	 * Savings positions visible to the portfolio.
	 *
	 * Each entry's default-view `apyBreakdown` reflects the headline rewards.
	 * Use `entry.getApyBreakdown({ viewer })` for viewer-aware values.
	 */
	get savings(): PortfolioSavingsPosition<TVaultEntity>[] {
		const savings: PortfolioSavingsPosition<TVaultEntity>[] = [];
		const collateralUsageSet = this.collateralUsageSet;

		for (const subAccount of Object.values(this.account.subAccounts ?? {})) {
			if (!subAccount) continue;
			for (const position of subAccount.positions) {
				if (position.assets === 0n && position.shares === 0n) continue;
				if (!this.includePosition(position)) continue;
				if (
					collateralUsageSet.has(
						portfolioPositionKey(position.account, position.vaultAddress),
					)
				) {
					continue;
				}
				savings.push(
					new PortfolioSavingsPosition({
						position,
						vault: position.vault,
						subAccount: position.account,
						shares: position.shares,
						assets: position.assets,
						suppliedValueUsd: position.suppliedValueUsd,
					}),
				);
			}
		}

		return savings;
	}

	/**
	 * Borrow positions visible to the portfolio.
	 *
	 * Each entry's default-view `apyBreakdown` / `roeBreakdown` reflect the
	 * headline rewards. Use `entry.getApyBreakdown({ viewer })` or
	 * `entry.getRoeBreakdown({ viewer })` for viewer-aware values.
	 */
	get borrows(): PortfolioBorrowPosition<TVaultEntity>[] {
		const borrows: PortfolioBorrowPosition<TVaultEntity>[] = [];

		for (const subAccount of Object.values(this.account.subAccounts ?? {})) {
			if (!subAccount) continue;
			for (const borrow of subAccount.positions) {
				if (borrow.borrowed === 0n) continue;
				if (!this.includePosition(borrow)) continue;

				const collaterals = resolveBorrowCollateralPositions(
					subAccount,
					borrow,
					(position) => this.includePosition(position),
				);
				const collateral = collaterals[0];
				const ltv = collateral
					? findCollateralLtv(borrow.vault, collateral.vaultAddress)
					: undefined;
				const multiplier = computeBorrowMultiplier(borrow, collaterals);
				const liabilityValueUsd =
					borrow.liquidity?.liabilityValueUsd ??
					borrow.borrowedValueUsd;
				const totalCollateralValueUsd =
					borrow.liquidity?.totalCollateralValueUsd ??
					sumYieldPositionUsd(collaterals, "suppliedValueUsd");
				const collateralValueLiquidation =
					borrow.liquidity?.totalCollateralValue.liquidation;
				const liabilityValueBorrowing =
					borrow.liquidity?.liabilityValue.borrowing;
				const liabilityValueLiquidation =
					borrow.liquidity?.liabilityValue.liquidation;
				const primaryCollateralLiquidationPrice =
					computeBorrowPositionPrimaryCollateralLiquidationPrice(
						collateral,
						collateralValueLiquidation,
						liabilityValueBorrowing,
					);
				const liquidatable = computeBorrowPositionLiquidatable(
					borrow.liquidity !== undefined,
					liabilityValueLiquidation,
					collateralValueLiquidation,
				);

				borrows.push(
					new PortfolioBorrowPosition({
						borrow,
						collaterals,
						collateral,
						borrowVault: borrow.vault,
						collateralVault: collateral?.vault,
						collateralVaults: collaterals.map((position) =>
							getAddress(position.vaultAddress),
						),
						subAccount: borrow.account,
						healthFactor: subAccount.healthFactor,
						userLTV: subAccount.currentLTV,
						currentLTV: subAccount.currentLTV,
						borrowed: borrow.borrowed,
						supplied: collateral?.assets ?? 0n,
						price: borrow.borrowLiquidationPriceUsd,
						primaryCollateralLiquidationPrice,
						borrowLiquidationPriceUsd: borrow.borrowLiquidationPriceUsd,
						collateralLiquidationPricesUsd:
							borrow.collateralLiquidationPricesUsd,
						liquidatable,
						borrowLTV: ltv?.borrowLTV,
						liquidationLTV: ltv?.liquidationLTV,
						accountLiquidationLTV: wadRatioToDecimal(subAccount.liquidationLTV),
						liabilityValueBorrowing: borrow.liquidity?.liabilityValue.borrowing,
						liabilityValueLiquidation,
						liabilityValueUsd,
						totalCollateralValueUsd,
						collateralValueLiquidation,
						timeToLiquidation: borrow.liquidity?.daysToLiquidation,
						multiplier,
					}),
				);
			}
		}

		return borrows;
	}

	/** Sum of supplied value across positions that pass the portfolio filter. */
	get totalSuppliedValueUsd(): number | undefined {
		return sumYieldPositionUsd(this.yieldPositions, "suppliedValueUsd");
	}

	/** Sum of borrowed value across positions that pass the portfolio filter. */
	get totalBorrowedValueUsd(): number | undefined {
		return sumYieldPositionUsd(this.yieldPositions, "borrowedValueUsd");
	}

	/** Net asset value in USD: supplied minus borrowed. */
	get netAssetValueUsd(): number | undefined {
		const supplied = this.totalSuppliedValueUsd;
		if (supplied == null) return undefined;
		return supplied - (this.totalBorrowedValueUsd ?? 0);
	}

	/** Default-view net APY (no viewer). Equivalent to `getNetApy()`. */
	get netApy(): number | undefined {
		return this.getNetApy();
	}

	/**
	 * Net APY across positions that pass the portfolio filter.
	 *
	 * For include/exclude filtering (drop rewards / intrinsicApy) use
	 * `getNetApyBreakdown(opts)` and reduce the components you want.
	 */
	getNetApy(opts: ViewerOptions = {}): number | undefined {
		return computePositionsNetApy(this.yieldPositions, opts.viewer);
	}

	/** Default-view ROE (no viewer). Equivalent to `getRoe()`. */
	get roe(): number | undefined {
		return this.getRoe();
	}

	/**
	 * Return on equity across positions that pass the portfolio filter.
	 *
	 * For include/exclude filtering use `getRoeBreakdown(opts)`.
	 */
	getRoe(opts: ViewerOptions = {}): number | undefined {
		return computePositionsRoe(this.yieldPositions, opts.viewer);
	}

	/** Default-view net APY breakdown (no viewer). Equivalent to `getNetApyBreakdown()`. */
	get apyBreakdown(): YieldApyBreakdown | undefined {
		return this.getNetApyBreakdown();
	}

	/** Net APY contribution breakdown across positions that pass the portfolio filter. */
	getNetApyBreakdown(opts: ViewerOptions = {}): YieldApyBreakdown | undefined {
		return computePositionsNetApyBreakdown(this.yieldPositions, opts.viewer);
	}

	/** Default-view ROE breakdown (no viewer). Equivalent to `getRoeBreakdown()`. */
	get roeBreakdown(): YieldApyBreakdown | undefined {
		return this.getRoeBreakdown();
	}

	/** ROE contribution breakdown across positions that pass the portfolio filter. */
	getRoeBreakdown(opts: ViewerOptions = {}): YieldApyBreakdown | undefined {
		return computePositionsRoeBreakdown(this.yieldPositions, opts.viewer);
	}

	/** Total unclaimed rewards value in USD, delegated to the wrapped Account. */
	get totalRewardsValueUsd(): number | undefined {
		return this.account.totalRewardsValueUsd;
	}

	private get collateralUsageSet(): Set<string> {
		const collateralUsageSet = new Set<string>();

		for (const subAccount of Object.values(this.account.subAccounts ?? {})) {
			if (!subAccount) continue;
			for (const borrow of subAccount.positions) {
				if (borrow.borrowed === 0n) continue;

				for (const collateralAddress of resolveBorrowCollateralVaults(
					subAccount,
					borrow,
				)) {
					const collateral = subAccount.positions.find((position) =>
						isAddressEqual(position.vaultAddress, collateralAddress),
					);
					if (!collateral) continue;
					if (!this.includePosition(collateral)) continue;
					collateralUsageSet.add(
						portfolioPositionKey(borrow.account, collateralAddress),
					);
				}
			}
		}

		return collateralUsageSet;
	}

	/**
	 * Structural set of yield-bearing positions, derived without viewer.
	 * `suppliedValueUsd` / `borrowedValueUsd` are dollar amounts which don't depend on viewer;
	 * viewer affects the reward APR applied per-position downstream.
	 */
	private get yieldPositions(): AccountYieldPosition[] {
		const positions: AccountYieldPosition[] = [];
		const collateralUsageSet = this.collateralUsageSet;

		for (const subAccount of Object.values(this.account.subAccounts ?? {})) {
			if (!subAccount) continue;

			// Savings (supply positions not used as collateral for a borrow).
			for (const position of subAccount.positions) {
				if (position.assets === 0n && position.shares === 0n) continue;
				if (!this.includePosition(position)) continue;
				if (
					collateralUsageSet.has(
						portfolioPositionKey(position.account, position.vaultAddress),
					)
				) {
					continue;
				}
				positions.push({
					vault: position.vault,
					suppliedValueUsd: position.suppliedValueUsd,
				});
			}

			// Borrows + their collaterals.
			for (const borrow of subAccount.positions) {
				if (borrow.borrowed === 0n) continue;
				if (!this.includePosition(borrow)) continue;

				positions.push({
					vault: borrow.vault,
					borrowedValueUsd: borrow.borrowedValueUsd,
				});

				const collaterals = resolveBorrowCollateralPositions(
					subAccount,
					borrow,
					(position) => this.includePosition(position),
				);
				for (const collateral of collaterals) {
					positions.push({
						vault: collateral.vault,
						suppliedValueUsd: collateral.suppliedValueUsd,
					});
				}
			}
		}

		return positions;
	}

	private includePosition(position: AccountPosition<TVaultEntity>): boolean {
		return (
			this.options.positionFilter?.(position, {
				account: this.account,
			}) ?? true
		);
	}

	private occupiedPositionSubAccounts(): Address[] {
		return this.subAccountsWithPosition(
			(position) =>
				hasActiveSuppliedPosition(position) || position.borrowed > 0n,
		);
	}

	private borrowPositionSubAccounts(): Address[] {
		return this.subAccountsWithPosition((position) => position.borrowed > 0n);
	}

	private subAccountsWithPosition(
		predicate: (position: AccountPosition<TVaultEntity>) => boolean,
	): Address[] {
		const subAccounts = new Set<Address>();
		for (const subAccount of Object.values(this.account.subAccounts ?? {})) {
			if (!subAccount) continue;
			const hasPosition = subAccount.positions.some(
				(position) => this.includePosition(position) && predicate(position),
			);
			if (hasPosition) {
				subAccounts.add(getAddress(subAccount.account));
			}
		}
		return Array.from(subAccounts);
	}
}

function portfolioPositionKey(subAccount: Address, vault: Address): string {
	return `${getAddress(subAccount)}:${getAddress(vault)}`;
}

function hasActiveSuppliedPosition<TVaultEntity extends IHasVaultAddress>(
	position: AccountPosition<TVaultEntity>,
): boolean {
	return position.assets > 0n || position.shares > 0n;
}

function sumYieldPositionUsd(
	positions: AccountYieldPosition[],
	field: "suppliedValueUsd" | "borrowedValueUsd",
): number | undefined {
	let total: number | undefined;
	for (const position of positions) {
		if (position[field] != null) {
			total = (total ?? 0) + position[field]!;
		}
	}
	return total;
}

function borrowYieldPositions<TVaultEntity extends IHasVaultAddress>(
	borrow: AccountPosition<TVaultEntity>,
	collaterals: AccountPosition<TVaultEntity>[],
): AccountYieldPosition[] {
	const suppliedSum = sumYieldPositionUsd(collaterals, "suppliedValueUsd");
	const multiplier = computeBorrowMultiplier(borrow, collaterals);
	const equityUsd =
		suppliedSum != null && borrow.borrowedValueUsd != null
			? suppliedSum - borrow.borrowedValueUsd
			: undefined;

	return [
		{
			vault: borrow.vault,
			borrowedValueUsd: borrow.borrowedValueUsd,
			borrowContext: {
				collateralAddresses: collaterals.map((collateral) =>
					getAddress(collateral.vaultAddress),
				),
				multiplier,
				equityUsd:
					equityUsd != null && equityUsd > 0 ? equityUsd : undefined,
			},
		},
		...collaterals.map((collateral) => ({
			vault: collateral.vault,
			suppliedValueUsd: collateral.suppliedValueUsd,
		})),
	];
}

function computeBorrowMultiplier<TVaultEntity extends IHasVaultAddress>(
	borrow: AccountPosition<TVaultEntity>,
	collaterals: AccountPosition<TVaultEntity>[],
): number | undefined {
	return computeCollateralMultiplier(
		sumYieldPositionUsd(collaterals, "suppliedValueUsd"),
		borrow.borrowedValueUsd,
	);
}

function computeBorrowPositionPrimaryCollateralLiquidationPrice<
	TVaultEntity extends IHasVaultAddress,
>(
	collateral: AccountPosition<TVaultEntity> | undefined,
	collateralValueLiquidation: bigint | undefined,
	liabilityValueBorrowing: bigint | undefined,
): number {
	const collateralValue = collateralValueLiquidation ?? 0n;
	const liabilityValue = liabilityValueBorrowing ?? 0n;
	if (collateralValue === 0n) return 0;

	const collateralPrice =
		(collateral?.vault as { marketPriceUsd?: number } | undefined)
			?.marketPriceUsd ?? 0;

	return (
		collateralPrice *
		(bigintRatioToNumber(liabilityValue, collateralValue) ?? 0)
	);
}

function computeBorrowPositionLiquidatable(
	hasLiquidity: boolean,
	liabilityValueLiquidation: bigint | undefined,
	collateralValueLiquidation: bigint | undefined,
): boolean {
	if (!hasLiquidity) return false;
	const liabilityValue = liabilityValueLiquidation ?? 0n;
	const collateralValue = collateralValueLiquidation ?? 0n;
	if (liabilityValue === 0n) return false;
	return liabilityValue > collateralValue;
}

function findCollateralLtv(
	borrowVault: IHasVaultAddress | undefined,
	collateralAddress: Address,
): { borrowLTV?: number; liquidationLTV?: number } | undefined {
	const collaterals = (borrowVault as any)?.collaterals;
	if (!Array.isArray(collaterals)) return undefined;
	const collateral = collaterals.find((candidate) =>
		isAddressEqual(candidate.address, collateralAddress),
	);
	if (!collateral) return undefined;
	return {
		borrowLTV:
			typeof collateral.borrowLTV === "number"
				? collateral.borrowLTV
				: undefined,
		liquidationLTV:
			typeof collateral.liquidationLTV === "number"
				? collateral.liquidationLTV
				: undefined,
	};
}
