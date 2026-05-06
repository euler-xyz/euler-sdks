import assert from "node:assert/strict";
import { test } from "vitest";

import { EVault } from "../src/entities/EVault.js";
import { EulerEarn } from "../src/entities/EulerEarn.js";
import { SecuritizeCollateralVault } from "../src/entities/SecuritizeCollateralVault.js";
import { VaultType } from "../src/utils/types.js";
import { getPlainEVaultFixture } from "./helpers/readCorpus.ts";

test("ERC4626 vault computed properties expose available liquidity", () => {
	const source = getPlainEVaultFixture();
	const vault = new SecuritizeCollateralVault({
		type: VaultType.SecuritizeCollateral,
		chainId: source.chainId,
		address: source.address,
		shares: source.shares,
		asset: source.asset,
		totalShares: 500n,
		totalAssets: 750n,
		governor: source.governorAdmin,
		supplyCap: 1_000n,
	});

	assert.equal(vault.availableLiquidity, 750n);
});

test("EVault computed properties expose liquidity, utilization, caps, and parsed rates", () => {
	const source = getPlainEVaultFixture();
	const vault = new EVault({
		...source,
		totalAssets: 1_000n,
		totalBorrowed: 250n,
		totalCash: 700n,
		caps: {
			supplyCap: 2_000n,
			borrowCap: 500n,
		},
		interestRates: {
			borrowSPY: 0.000000001,
			borrowAPY: 0.08,
			supplyAPY: 0.05,
		},
	});

	assert.equal(vault.availableLiquidity, 700n);
	assert.equal(vault.utilization, 25);
	assert.equal(vault.caps.supplyCapUtilization, 50);
	assert.equal(vault.caps.borrowCapUtilization, 50);
	assert.equal(vault.interestRates.supplyAPY, 0.05);
	assert.equal(vault.interestRates.borrowAPY, 0.08);
	assert.equal(vault.interestRates.borrowSPY, 0.000000001);
});

test("EVault collateral computed properties expose current ramped liquidation LTV", () => {
	const source = getPlainEVaultFixture();
	const originalNow = Date.now;
	Date.now = () => 1_500_000;

	try {
		const vault = new EVault({
			...source,
			timestamp: 1_500,
			collaterals: [
				{
					address: source.address,
					borrowLTV: 0,
					liquidationLTV: 0,
					ramping: {
						initialLiquidationLTV: 0.9,
						targetTimestamp: 2_000,
						rampDuration: 1_000n,
					},
					oraclePriceRaw: source.oraclePriceRaw,
				},
			],
		});

		const collateral = vault.collaterals[0]!;
		assert.equal(collateral.currentLiquidationLTV, 0.45);
		assert.equal(collateral.isLiquidationLTVRamping, true);
		assert.equal(collateral.rampTimeRemaining, 500n);
		assert.equal(vault.isBorrowable, true);
	} finally {
		Date.now = originalNow;
	}
});

test("EulerEarn computed properties expose available liquidity", () => {
	const source = getPlainEVaultFixture();
	const vault = new EulerEarn({
		type: VaultType.EulerEarn,
		chainId: source.chainId,
		address: source.address,
		shares: source.shares,
		asset: source.asset,
		totalShares: 1_000n,
		totalAssets: 900n,
		lostAssets: 0n,
		availableAssets: 600n,
		performanceFee: 0,
		supplyApy1h: 0.04,
		governance: {
			owner: source.governorAdmin,
			creator: source.creator,
			curator: source.governorAdmin,
			guardian: source.governorAdmin,
			feeReceiver: source.fees.governorFeeReceiver,
			timelock: 0,
			pendingTimelock: 0,
			pendingTimelockValidAt: 0,
			pendingGuardian: source.governorAdmin,
			pendingGuardianValidAt: 0,
		},
		supplyQueue: [],
		withdrawQueue: [],
		strategies: [],
		timestamp: source.timestamp,
	});

	assert.equal(vault.availableLiquidity, 600n);
});
