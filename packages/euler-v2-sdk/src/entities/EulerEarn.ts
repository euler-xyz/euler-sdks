import type { Address } from "viem";
import type { VaultType } from "../utils/types.js";
import {
	ERC4626Vault,
	type ERC4626VaultPopulated,
	type IERC4626Vault,
	type IERC4626VaultConversion,
	VIRTUAL_DEPOSIT_AMOUNT,
} from "./ERC4626Vault.js";
import type { EVault } from "./EVault.js";
import type { IEVaultService } from "../services/vaults/eVaultService/eVaultService.js";
import type { DataIssue } from "../utils/entityDiagnostics.js";
import {
	mapDataIssuePaths,
	withPathPrefix,
} from "../utils/entityDiagnostics.js";

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
	vault?: EVault;
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
		eVaultService: IEVaultService,
	): Promise<DataIssue[]> {
		const allStrategyAddresses = [
			...new Set(this.strategies.map((s) => s.address)),
		];
		if (allStrategyAddresses.length === 0) {
			this.populated.strategyVaults = true;
			return [];
		}
		const errors: DataIssue[] = [];

		const eVaults = await Promise.all(
			allStrategyAddresses.map(async (addr, index) => {
				const fetched = await eVaultService.fetchVault(this.chainId, addr);
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

		const eVaultByAddress = new Map(
			eVaults
				.filter((v) => v !== undefined)
				.map((v) => [v.address.toLowerCase(), v]),
		);

		for (const strategy of this.strategies) {
			strategy.vault = eVaultByAddress.get(strategy.address.toLowerCase());
		}
		this.populated.strategyVaults = true;
		return errors;
	}
}
