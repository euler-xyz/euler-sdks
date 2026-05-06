import type { Address } from "viem";
import type { VaultType } from "../utils/types.js";
import {
	ERC4626Vault,
	type ERC4626VaultPopulated,
	type IERC4626Vault,
	type IERC4626VaultConversion,
	VIRTUAL_DEPOSIT_AMOUNT,
} from "./ERC4626Vault.js";
import type { IVaultEntity } from "./Account.js";
import type { IVaultMetaService } from "../services/vaults/vaultMetaService/index.js";
import type { DataIssue } from "../utils/entityDiagnostics.js";
import {
	mapDataIssuePaths,
	withPathPrefix,
} from "../utils/entityDiagnostics.js";
import { VaultType as VaultTypeEnum } from "../utils/types.js";

export interface EulerEarnAllocationCap {
	current: bigint;
	pending: bigint;
	pendingValidAt: number;
}

export interface EulerEarnStrategyInfo {
	address: Address;
	vaultType: VaultType;
	allocatedAssets: bigint;
	availableAssets: bigint;
	allocationCap: EulerEarnAllocationCap;
	removableAt: number;
	vault?: IVaultEntity;
}

export type EulerEarnStrategyStatus =
	| "active"
	| "inactive"
	| "pendingRemoval";

export interface EulerEarnGovernance {
	owner: Address;
	creator: Address;
	curator: Address;
	guardian: Address;
	feeReceiver: Address;

	timelock: number;

	pendingTimelock: number;
	pendingTimelockValidAt: number;
	pendingGuardian: Address;
	pendingGuardianValidAt: number;
}

export interface IEulerEarn extends IERC4626Vault {
	lostAssets: bigint;
	availableAssets: bigint;
	performanceFee: number;
	/** Percentage points, e.g. 5 = 5%. */
	supplyApy1h: number | undefined;

	governance: EulerEarnGovernance;

	supplyQueue: Address[];
	withdrawQueue: Address[];
	strategies: EulerEarnStrategyInfo[];

	timestamp: number;
	populated?: Partial<EulerEarnPopulated>;
}

export interface EulerEarnPopulated extends ERC4626VaultPopulated {
	strategyVaults: boolean;
}

export class EulerEarn
	extends ERC4626Vault
	implements IEulerEarn, IERC4626VaultConversion
{
	lostAssets: bigint;
	availableAssets: bigint;
	performanceFee: number;
	/** Percentage points, e.g. 5 = 5%. */
	supplyApy1h: number | undefined;

	governance: EulerEarnGovernance;

	supplyQueue: Address[];
	withdrawQueue: Address[];
	strategies: EulerEarnStrategyInfo[];

	timestamp: number;
	declare populated: EulerEarnPopulated;

	constructor(args: IEulerEarn) {
		super(args);
		this.lostAssets = args.lostAssets;
		this.availableAssets = args.availableAssets;
		this.performanceFee = args.performanceFee;
		this.supplyApy1h = args.supplyApy1h;

		this.governance = args.governance;

		this.supplyQueue = args.supplyQueue;
		this.withdrawQueue = args.withdrawQueue;
		this.strategies = args.strategies;

		this.timestamp = args.timestamp;
		const hasResolvedStrategyVaults =
			this.strategies.length > 0 &&
			this.strategies.every((strategy) => strategy.vault !== undefined);
		this.populated = {
			...this.populated,
			strategyVaults:
				args.populated?.strategyVaults ?? hasResolvedStrategyVaults,
		};
	}

	override get isBorrowable(): boolean {
		return false;
	}

	override get availableLiquidity(): bigint {
		return this.availableAssets;
	}

	isPendingRemoval(strategy: EulerEarnStrategyInfo): boolean {
		return this.getStrategyStatus(strategy) === "pendingRemoval";
	}

	getStrategyStatus(
		strategy: EulerEarnStrategyInfo,
	): EulerEarnStrategyStatus {
		if (strategy.removableAt > 0) {
			return "pendingRemoval";
		}

		if (strategy.allocationCap.current > 0n) {
			return "active";
		}

		return "inactive";
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

	async populateStrategyVaults(
		vaultMetaService: IVaultMetaService,
	): Promise<DataIssue[]> {
		const allStrategyAddresses = [
			...new Set(
				this.strategies
					.filter((s) => s.vaultType !== VaultTypeEnum.Unknown)
					.map((s) => s.address),
			),
		];
		if (allStrategyAddresses.length === 0) {
			this.populated.strategyVaults = true;
			return [];
		}
		const errors: DataIssue[] = [];

		const vaults = await Promise.all(
			allStrategyAddresses.map(async (addr, index) => {
				const fetched = await vaultMetaService.fetchVault(this.chainId, addr);
				errors.push(
					...fetched.errors.map((issue) => ({
						...mapDataIssuePaths(issue, (path) =>
							withPathPrefix(path, `$.strategies[${index}].vault`),
						),
					})),
				);
				return fetched.result;
			}),
		);

		const vaultByAddress = new Map(
			vaults
				.filter((v) => v !== undefined)
				.map((v) => [v.address.toLowerCase(), v]),
		);

		for (const strategy of this.strategies) {
			if (strategy.vaultType === VaultTypeEnum.Unknown) continue;
			strategy.vault = vaultByAddress.get(strategy.address.toLowerCase());
		}
		this.populated.strategyVaults = true;
		return errors;
	}
}
