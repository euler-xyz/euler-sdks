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
