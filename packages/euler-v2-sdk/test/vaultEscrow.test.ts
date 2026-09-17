import assert from "node:assert/strict";
import { type Address, maxUint256, zeroAddress } from "viem";
import { test } from "vitest";

import { convertVault } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.js";
import type { V3VaultDetail } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterTypes.js";
import { convertVaultInfoFullToIEVault } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/vaultInfoConverter.js";
import type { VaultInfoFull } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultLensTypes.js";
import { EVault, type IEVault } from "../src/entities/EVault.js";
import type { DataIssue } from "../src/utils/entityDiagnostics.js";
import { deriveEVaultEscrow } from "../src/utils/vaultEscrow.js";
import { makeVaultInfo } from "./helpers/lensFixtures.ts";
import {
	getEVaultFixtures,
	getPlainEVaultFixture,
} from "./helpers/readCorpus.ts";

const GOVERNOR = "0x35400831044167E9E2DE613d26515eeE37e30a1b" as const;
const ORACLE = "0x7516DB548B7bBC551F7213F77A275af2EdA6555d" as const;
const USD = "0x0000000000000000000000000000000000000348" as const;

const usdToken = {
	address: USD,
	name: "US Dollar",
	symbol: "USD",
	decimals: 18,
};

const v3Row = {
	chainId: 1,
	address: "0x0000000000000000000000000000000000000abc",
	name: "Vault",
	symbol: "eTEST",
	decimals: 18,
	shares: { address: "0x0000000000000000000000000000000000000abc" },
	asset: { address: "0x0000000000000000000000000000000000000def" },
	dToken: "0x0000000000000000000000000000000000000001",
	creator: "0x0000000000000000000000000000000000000003",
	totalShares: "0",
	totalAssets: "0",
	totalBorrows: "0",
	totalBorrowed: "0",
	totalCash: "0",
	fees: null,
	hooks: null,
	caps: null,
	liquidation: null,
	interestRates: null,
	interestRateModel: null,
	balanceTracker: null,
	evcCompatibleAsset: null,
	oraclePriceRaw: null,
	timestamp: "1970-01-01T00:00:01.000Z",
} as const;

function convertV3Vault(
	detail: Partial<V3VaultDetail>,
	errors: DataIssue[] = [],
): EVault {
	return new EVault(
		convertVault(
			{ ...v3Row, ...detail } as V3VaultDetail,
			[],
			errors,
			v3Row.address as Address,
		),
	);
}

function escrowShapedArgs(): IEVault {
	return {
		...getPlainEVaultFixture(),
		governorAdmin: zeroAddress,
		oracle: { oracle: zeroAddress, name: "" },
		unitOfAccount: undefined,
	};
}

test("an ungoverned vault without oracle or unit of account is escrow", () => {
	assert.equal(
		deriveEVaultEscrow({
			governorAdmin: zeroAddress,
			oracle: { oracle: zeroAddress },
			unitOfAccount: undefined,
		}),
		true,
	);
});

test("a governed vault without oracle or unit of account is not escrow", () => {
	assert.equal(
		deriveEVaultEscrow({
			governorAdmin: GOVERNOR,
			oracle: { oracle: zeroAddress },
			unitOfAccount: undefined,
		}),
		false,
	);
});

test("an ungoverned vault that prices its assets is not escrow", () => {
	assert.equal(
		deriveEVaultEscrow({
			governorAdmin: zeroAddress,
			oracle: { oracle: ORACLE },
			unitOfAccount: undefined,
		}),
		false,
	);

	assert.equal(
		deriveEVaultEscrow({
			governorAdmin: zeroAddress,
			oracle: { oracle: zeroAddress },
			unitOfAccount: usdToken,
		}),
		false,
	);
});

test("a zero-address unit of account counts as no unit of account", () => {
	assert.equal(
		deriveEVaultEscrow({
			governorAdmin: zeroAddress,
			oracle: { oracle: zeroAddress },
			unitOfAccount: { ...usdToken, address: zeroAddress },
		}),
		true,
	);
});

/**
 * `governorAdmin` and `oracle` are required, so an absent one is a caller error
 * rather than an unknown state. It must fail loudly: answering `true` from a
 * partial object would be a confident escrow verdict derived from nothing,
 * which is the failure direction the null state exists to prevent.
 */
test("a required signal that is missing fails loudly instead of reading as escrow", () => {
	assert.throws(() =>
		deriveEVaultEscrow({
			governorAdmin: undefined as unknown as Address,
			oracle: { oracle: zeroAddress },
		}),
	);
	assert.throws(() =>
		deriveEVaultEscrow({
			governorAdmin: zeroAddress,
			oracle: { oracle: undefined as unknown as Address },
		}),
	);
});

test("EVault answers escrow status from the vault configuration", () => {
	assert.equal(new EVault(escrowShapedArgs()).isEscrow, true);
	assert.equal(new EVault(getPlainEVaultFixture()).isEscrow, false);
});

test("EVault keeps a verdict supplied by the data source", () => {
	assert.equal(new EVault({ ...escrowShapedArgs(), isEscrow: false }).isEscrow, false);
});

test("escrow status survives a round trip through a plain object", () => {
	const vault = new EVault(escrowShapedArgs());
	const spread = { ...vault };

	assert.equal(spread.isEscrow, true);
	assert.equal(new EVault(spread).isEscrow, true);
});

/**
 * The lens either decodes every field or the read fails and yields no entity,
 * so the on-chain path always answers. Nothing else pins that the same vault
 * can be escrow from the lens while a truncated V3 row is `null`.
 */
test("lens-sourced vaults always get a verdict", () => {
	const convertLensVault = (overrides: Record<string, unknown>): EVault =>
		new EVault(
			convertVaultInfoFullToIEVault(
				{
					...makeVaultInfo({
						oracle: zeroAddress,
						name: "",
						oracleInfo: "0x",
					}),
					...overrides,
				} as unknown as VaultInfoFull,
				1,
				[],
			),
		);

	const escrow = convertLensVault({
		governorAdmin: zeroAddress,
		unitOfAccount: zeroAddress,
	});
	const governed = convertLensVault({ unitOfAccount: zeroAddress });

	assert.equal(escrow.isEscrow, true);
	assert.equal(governed.isEscrow, false);
});

test("V3-sourced vaults are answered from the same configuration", () => {
	const escrow = convertV3Vault({
		governorAdmin: zeroAddress,
		// V3 publishes the zero address for a vault that has neither, never null
		oracle: { oracle: zeroAddress, name: "", adapters: [], resolvedVaults: [] },
		unitOfAccount: { address: zeroAddress },
	});
	const governed = convertV3Vault({
		governorAdmin: GOVERNOR,
		oracle: {
			oracle: ORACLE,
			name: "EulerRouter",
			adapters: [],
			resolvedVaults: [],
		},
		unitOfAccount: { address: USD, decimals: 18 },
	});

	assert.equal(escrow.isEscrow, true);
	assert.equal(governed.isEscrow, false);
});

test("V3 rows that omit a classifying field have no verdict instead of a guess", () => {
	const missingGovernor = convertV3Vault({
		governorAdmin: undefined as unknown as string,
		oracle: { oracle: zeroAddress, name: "", adapters: [], resolvedVaults: [] },
		unitOfAccount: { address: zeroAddress },
	});
	const missingOracle = convertV3Vault({
		governorAdmin: zeroAddress,
		oracle: null,
		unitOfAccount: { address: zeroAddress },
	});
	const missingUnitOfAccount = convertV3Vault({
		governorAdmin: zeroAddress,
		oracle: { oracle: zeroAddress, name: "", adapters: [], resolvedVaults: [] },
		unitOfAccount: null,
	});
	const unreadableGovernor = convertV3Vault({
		governorAdmin: "not-an-address",
		oracle: { oracle: zeroAddress, name: "", adapters: [], resolvedVaults: [] },
		unitOfAccount: { address: zeroAddress },
	});

	assert.equal(missingGovernor.isEscrow, null);
	assert.equal(missingOracle.isEscrow, null);
	assert.equal(missingUnitOfAccount.isEscrow, null);
	assert.equal(unreadableGovernor.isEscrow, null);
});

test("an undecided V3 row reports the gap as a diagnostic", () => {
	const errors: DataIssue[] = [];
	// A zero oracle address suppresses the unit-of-account block diagnostic, so
	// without its own issue this row would lose its verdict silently.
	const vault = convertV3Vault(
		{
			governorAdmin: zeroAddress,
			oracle: { oracle: zeroAddress, name: "", adapters: [], resolvedVaults: [] },
			unitOfAccount: null,
		},
		errors,
	);

	assert.equal(vault.isEscrow, null);
	const issue = errors.find((error) =>
		error.locations.some((location) => location.path === "$.isEscrow"),
	);
	assert.ok(issue, "expected a diagnostic for the undecided escrow status");
	assert.equal(issue.severity, "warning");
	assert.equal(issue.source, "eVaultV3");
});

test("an undecided verdict stays undecided through a round trip", () => {
	const unknown = convertV3Vault({
		governorAdmin: zeroAddress,
		oracle: null,
		unitOfAccount: null,
	});

	assert.equal(new EVault({ ...unknown }).isEscrow, null);
});

/**
 * Three signals decide the verdict, but the perspective also requires escrow
 * configuration a governor could have left behind (no caps, hooks, config
 * flags, liquidation parameters, collaterals). This guards that the cheap rule
 * does not over-report on real data: on the mainnet corpus both rules pick the
 * same vaults.
 */
test("derived escrow set matches the escrow configuration across the mainnet corpus", () => {
	const vaults = getEVaultFixtures().map((fixture) => new EVault(fixture));
	assert.ok(vaults.length > 0);

	const isEscrowConfigured = (vault: EVault): boolean =>
		vault.governorAdmin === zeroAddress &&
		vault.oracle.oracle === zeroAddress &&
		vault.unitOfAccount === undefined &&
		vault.caps.supplyCap === maxUint256 &&
		vault.caps.borrowCap === maxUint256 &&
		vault.hooks.hookTarget === zeroAddress &&
		!Object.values(vault.hooks.hookedOperations).some(Boolean) &&
		// configFlags == 0: debt socialization on, EVC-compatible asset off
		vault.liquidation.socializeDebt &&
		!vault.evcCompatibleAsset &&
		vault.liquidation.maxLiquidationDiscount === 0 &&
		vault.liquidation.liquidationCoolOffTime === 0 &&
		vault.collaterals.length === 0 &&
		vault.fees.governorFeeReceiver === zeroAddress &&
		vault.interestRateModel.address === zeroAddress;

	const derived = vaults
		.filter((vault) => vault.isEscrow === true)
		.map((vault) => vault.address)
		.sort();
	const configured = vaults
		.filter(isEscrowConfigured)
		.map((vault) => vault.address)
		.sort();

	assert.ok(configured.length > 0);
	assert.deepEqual(derived, configured);
	assert.ok(
		vaults.some((vault) => vault.isEscrow === false),
		"corpus must also contain governed EVK vaults",
	);
});
