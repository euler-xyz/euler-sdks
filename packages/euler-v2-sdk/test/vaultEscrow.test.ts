import assert from "node:assert/strict";
import { type Address, zeroAddress } from "viem";
import { test } from "vitest";

import { EVaultOnchainAdapter } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import { convertVault } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.js";
import type { V3VaultDetail } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterTypes.js";
import { EVault } from "../src/entities/EVault.js";
import type { DataIssue } from "../src/utils/entityDiagnostics.js";
import { makeVaultInfo } from "./helpers/lensFixtures.ts";
import { getPlainEVaultFixture } from "./helpers/readCorpus.ts";

const LENS = "0x00000000000000000000000000000000000000aa" as const;
const PERSPECTIVE = "0x00000000000000000000000000000000000000bb" as const;
/** The vault address `makeVaultInfo` reports. */
const LENS_VAULT = "0x0000000000000000000000000000000000000abc" as const;

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
	governorAdmin: zeroAddress,
	oracle: { oracle: zeroAddress, name: "", adapters: [], resolvedVaults: [] },
	unitOfAccount: { address: zeroAddress },
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

function makeOnchainAdapter(options: {
	perspective?: Address;
	verified?: Address[];
	verifiedThrows?: boolean;
}): EVaultOnchainAdapter {
	const adapter = new EVaultOnchainAdapter(
		{ getProvider: () => ({}) } as never,
		{
			getDeployment: () => ({
				addresses: {
					lensAddrs: { vaultLens: LENS },
					coreAddrs: { evc: zeroAddress },
					peripheryAddrs: options.perspective
						? { escrowedCollateralPerspective: options.perspective }
						: {},
				},
			}),
		} as never,
	);
	adapter.setQueryEVaultInfoFull((async () =>
		makeVaultInfo({
			oracle: zeroAddress,
			name: "",
			oracleInfo: "0x",
		})) as never);
	adapter.setQueryEVaultVerifiedArray((async () => {
		if (options.verifiedThrows) throw new Error("rpc unavailable");
		return options.verified ?? [];
	}) as never);
	return adapter;
}

test("the V3 path reports the escrow answer V3 published", async () => {
	assert.equal(convertV3Vault({ vaultType: "escrow" }).isEscrow, true);
	assert.equal(convertV3Vault({ vaultType: "evk" }).isEscrow, false);
});

/**
 * The vault configuration is escrow-shaped in `v3Row` — ungoverned, no oracle,
 * no unit of account — so a verdict of `false` here proves the SDK reports what
 * V3 said rather than a conclusion of its own. Deriving one would let the SDK
 * contradict V3 for the same vault.
 */
test("the V3 path does not second-guess V3 from the vault configuration", () => {
	const vault = convertV3Vault({ vaultType: "evk" });

	assert.equal(vault.governorAdmin, zeroAddress);
	assert.equal(vault.oracle.oracle, zeroAddress);
	assert.equal(vault.unitOfAccount, undefined);
	assert.equal(vault.isEscrow, false);
});

test("a V3 row with no usable vaultType is unanswered, with a diagnostic", () => {
	for (const vaultType of [undefined, "", "sausage"]) {
		const errors: DataIssue[] = [];
		const vault = convertV3Vault({ vaultType }, errors);

		assert.equal(vault.isEscrow, null, `vaultType: ${String(vaultType)}`);
		const issue = errors.find((error) =>
			error.locations.some((location) => location.path === "$.isEscrow"),
		);
		assert.ok(issue, `expected a diagnostic for vaultType: ${String(vaultType)}`);
		assert.equal(issue.source, "eVaultV3");
	}
});

test("the on-chain path reports escrow perspective membership", async () => {
	const verified = makeOnchainAdapter({
		perspective: PERSPECTIVE,
		verified: [LENS_VAULT],
	});
	const unverified = makeOnchainAdapter({
		perspective: PERSPECTIVE,
		verified: [],
	});

	const inSet = await verified.fetchVaults(1, [LENS_VAULT]);
	const outOfSet = await unverified.fetchVaults(1, [LENS_VAULT]);

	assert.equal(inSet.result[0]?.isEscrow, true);
	assert.equal(outOfSet.result[0]?.isEscrow, false);
	// an answered verdict reports no escrow diagnostic (the fixture's unrelated
	// IRM decode warning is left alone)
	assert.equal(
		inSet.errors.some(
			(error) => error.source === "escrowedCollateralPerspective",
		),
		false,
	);
});

test("the on-chain path is unanswered when the perspective cannot be read", async () => {
	for (const adapter of [
		makeOnchainAdapter({ verified: [LENS_VAULT] }),
		makeOnchainAdapter({ perspective: PERSPECTIVE, verifiedThrows: true }),
	]) {
		const fetched = await adapter.fetchVaults(1, [LENS_VAULT]);

		assert.equal(fetched.result[0]?.isEscrow, null);
		const issue = fetched.errors.find(
			(error) => error.source === "escrowedCollateralPerspective",
		);
		assert.ok(issue, "expected a diagnostic for the unavailable perspective");
		assert.equal(issue.severity, "warning");
	}
});

test("an entity built without a verdict has none, rather than a derived one", () => {
	const escrowShaped = new EVault({
		...getPlainEVaultFixture(),
		governorAdmin: zeroAddress,
		oracle: { oracle: zeroAddress, name: "" },
		unitOfAccount: undefined,
	});

	assert.equal(escrowShaped.isEscrow, null);
});

test("a verdict survives a round trip through a plain object", () => {
	for (const isEscrow of [true, false, null]) {
		const vault = new EVault({ ...getPlainEVaultFixture(), isEscrow });
		const spread = { ...vault };

		assert.equal(spread.isEscrow, isEscrow);
		assert.equal(new EVault(spread).isEscrow, isEscrow);
	}
});
