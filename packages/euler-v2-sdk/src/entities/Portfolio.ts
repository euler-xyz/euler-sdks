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
} from "../utils/accountComputations.js";
import {
	resolveBorrowCollateralPositions,
	resolveBorrowCollateralVaults,
} from "../utils/accountPositionClassification.js";
import { wadRatioToDecimal } from "../utils/normalization.js";

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

export interface PortfolioSavingsPosition<
	TVaultEntity extends IHasVaultAddress = never,
> {
	position: AccountPosition<TVaultEntity>;
	vault?: TVaultEntity;
	subAccount: Address;
	shares: bigint;
	assets: bigint;
	suppliedValueUsd?: bigint;
	/** Total supply APY for this savings position in percentage points, including intrinsic APY and rewards. */
	apy?: number;
	/** Supply APY contribution breakdown for this savings position. */
	apyBreakdown?: YieldApyBreakdown;
}

export interface PortfolioBorrowPosition<
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
	price?: bigint;
	primaryCollateralLiquidationPrice?: bigint;
	borrowLiquidationPriceUsd?: bigint;
	collateralLiquidationPricesUsd?: Record<Address, bigint>;
	liquidatable: boolean;
	borrowLTV?: number;
	liquidationLTV?: number;
	accountLiquidationLTV?: number;
	liabilityValueBorrowing?: bigint;
	liabilityValueLiquidation?: bigint;
	liabilityValueUsd?: bigint;
	totalCollateralValueUsd?: bigint;
	collateralValueLiquidation?: bigint;
	timeToLiquidation?: DaysToLiquidation;
	/** Effective collateral multiplier: supplied USD / equity USD. */
	multiplier?: number;
	/** Net APY in percentage points for this borrow position, relative to supplied collateral value. */
	netApy?: number;
	/** Return on equity in percentage points for this borrow position, relative to supplied minus borrowed value. */
	roe?: number;
	/** Net APY contribution breakdown for this borrow position. */
	apyBreakdown?: YieldApyBreakdown;
	/** ROE contribution breakdown for this borrow position. */
	roeBreakdown?: YieldApyBreakdown;
}

export interface IPortfolio<TVaultEntity extends IHasVaultAddress = never> {
	account: Account<TVaultEntity>;
	populated: AccountPopulated;
	getFreeSubAccounts(options?: GetFreeSubAccountsOptions): Address[];
	getNextSubAccount(options?: GetNextSubAccountOptions): Address | undefined;
	getNewSubAccount(options?: GetNextSubAccountOptions): Address | undefined;
	readonly positions: AccountPosition<TVaultEntity>[];
	readonly savings: PortfolioSavingsPosition<TVaultEntity>[];
	readonly borrows: PortfolioBorrowPosition<TVaultEntity>[];
	readonly totalSuppliedValueUsd?: bigint;
	readonly totalBorrowedValueUsd?: bigint;
	readonly netAssetValueUsd?: bigint;
	readonly netApy?: number;
	readonly roe?: number;
	readonly apyBreakdown?: YieldApyBreakdown;
	readonly roeBreakdown?: YieldApyBreakdown;
	readonly totalRewardsValueUsd?: bigint;
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
	getNewSubAccount(options: GetNextSubAccountOptions = {}): Address | undefined {
		return this.getNextSubAccount(options);
	}

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
				const apyBreakdown = computeSupplyApyBreakdown(position.vault);
				savings.push({
					position,
					vault: position.vault,
					subAccount: position.account,
					shares: position.shares,
					assets: position.assets,
					suppliedValueUsd: position.suppliedValueUsd,
					apy: apyBreakdown?.total,
					apyBreakdown,
				});
			}
		}

		return savings;
	}

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
				const yieldPositions = borrowYieldPositions(borrow, collaterals);
				const apyBreakdown = computePositionsNetApyBreakdown(yieldPositions);
				const roeBreakdown = computePositionsRoeBreakdown(yieldPositions);
				const multiplier = computeBorrowMultiplier(borrow, collaterals);
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

				borrows.push({
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
					collateralLiquidationPricesUsd: borrow.collateralLiquidationPricesUsd,
					liquidatable,
					borrowLTV: ltv?.borrowLTV,
					liquidationLTV: ltv?.liquidationLTV,
					accountLiquidationLTV: wadRatioToDecimal(subAccount.liquidationLTV),
					liabilityValueBorrowing: borrow.liquidity?.liabilityValue.borrowing,
					liabilityValueLiquidation,
					liabilityValueUsd: borrow.liquidity?.liabilityValueUsd,
					totalCollateralValueUsd: borrow.liquidity?.totalCollateralValueUsd,
					collateralValueLiquidation,
					timeToLiquidation: borrow.liquidity?.daysToLiquidation,
					multiplier,
					netApy: apyBreakdown?.total,
					roe: roeBreakdown?.total,
					apyBreakdown,
					roeBreakdown,
				});
			}
		}

		return borrows;
	}

	/** Sum of supplied USD value across positions that pass the portfolio filter. */
	get totalSuppliedValueUsd(): bigint | undefined {
		return sumYieldPositionUsd(this.yieldPositions, "suppliedValueUsd");
	}

	/** Sum of borrowed USD value across positions that pass the portfolio filter. */
	get totalBorrowedValueUsd(): bigint | undefined {
		return sumYieldPositionUsd(this.yieldPositions, "borrowedValueUsd");
	}

	/** Net asset value in USD: supplied minus borrowed. */
	get netAssetValueUsd(): bigint | undefined {
		const supplied = this.totalSuppliedValueUsd;
		if (supplied == null) return undefined;
		return supplied - (this.totalBorrowedValueUsd ?? 0n);
	}

	/** Net APY across positions that pass the portfolio filter. */
	get netApy(): number | undefined {
		return computePositionsNetApy(this.yieldPositions);
	}

	/** Return on equity across positions that pass the portfolio filter. */
	get roe(): number | undefined {
		return computePositionsRoe(this.yieldPositions);
	}

	/** Net APY contribution breakdown across positions that pass the portfolio filter. */
	get apyBreakdown(): YieldApyBreakdown | undefined {
		return computePositionsNetApyBreakdown(this.yieldPositions);
	}

	/** ROE contribution breakdown across positions that pass the portfolio filter. */
	get roeBreakdown(): YieldApyBreakdown | undefined {
		return computePositionsRoeBreakdown(this.yieldPositions);
	}

	/** Total unclaimed rewards value in USD, delegated to the wrapped Account. */
	get totalRewardsValueUsd(): bigint | undefined {
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

	private get yieldPositions(): AccountYieldPosition[] {
		const positions: AccountYieldPosition[] = [];

		for (const saving of this.savings) {
			positions.push({
				vault: saving.position.vault,
				suppliedValueUsd: saving.position.suppliedValueUsd,
			});
		}

		for (const borrow of this.borrows) {
			positions.push({
				vault: borrow.borrow.vault,
				borrowedValueUsd: borrow.borrow.borrowedValueUsd,
			});
			for (const collateral of borrow.collaterals) {
				positions.push({
					vault: collateral.vault,
					suppliedValueUsd: collateral.suppliedValueUsd,
				});
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
		return this.subAccountsWithPosition((position) =>
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
): bigint | undefined {
	let total: bigint | undefined;
	for (const position of positions) {
		if (position[field] != null) {
			total = (total ?? 0n) + position[field]!;
		}
	}
	return total;
}

function borrowYieldPositions<TVaultEntity extends IHasVaultAddress>(
	borrow: AccountPosition<TVaultEntity>,
	collaterals: AccountPosition<TVaultEntity>[],
): AccountYieldPosition[] {
	return [
		{
			vault: borrow.vault,
			borrowedValueUsd: borrow.borrowedValueUsd,
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
	const suppliedValueUsd = sumYieldPositionUsd(collaterals, "suppliedValueUsd");
	if (suppliedValueUsd == null) return undefined;
	const borrowedValueUsd = borrow.borrowedValueUsd;
	if (borrowedValueUsd == null) return undefined;

	const equity = suppliedValueUsd - borrowedValueUsd;
	if (equity <= 0n) return undefined;

	return Number(suppliedValueUsd) / Number(equity);
}

function computeBorrowPositionPrimaryCollateralLiquidationPrice<
	TVaultEntity extends IHasVaultAddress,
>(
	collateral: AccountPosition<TVaultEntity> | undefined,
	collateralValueLiquidation: bigint | undefined,
	liabilityValueBorrowing: bigint | undefined,
): bigint {
	const collateralValue = collateralValueLiquidation ?? 0n;
	const liabilityValue = liabilityValueBorrowing ?? 0n;
	if (collateralValue === 0n) return 0n;

	const collateralPrice =
		(collateral?.vault as { marketPriceUsd?: bigint } | undefined)
			?.marketPriceUsd ?? 0n;

	return (collateralPrice * liabilityValue) / collateralValue;
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
