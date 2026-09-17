import { type Address, zeroAddress } from "viem";

/**
 * Vault families, spelled the way Euler V3 data services publish them in
 * `vaultType`. The SDK reuses V3's vocabulary so a family read from a vault
 * entity and one read from V3 compare directly.
 *
 * This is a different question from the SDK's `VaultType` enum, which says
 * which vault service handles a vault: `evk` and `escrow` are both
 * `VaultType.EVault`.
 */
export const VAULT_FAMILIES = ["evk", "escrow", "earn", "securitize"] as const;

export type VaultFamily = (typeof VAULT_FAMILIES)[number];

/** The families an EVK vault can have. */
export type EVaultFamily = Extract<VaultFamily, "evk" | "escrow">;

/**
 * The vault configuration an escrow verdict is derived from. Every field must
 * be a value the source actually read: an absent `unitOfAccount` means the
 * vault has none, not that it could not be read. A caller that cannot read one
 * of them reports no family instead of calling this.
 */
export interface EVaultFamilySignals {
	governorAdmin: Address;
	oracle: { oracle: Address };
	unitOfAccount?: { address: Address } | undefined;
}

function isZeroAddress(address: Address | undefined): boolean {
	return (address ?? zeroAddress).toLowerCase() === zeroAddress;
}

/**
 * Classifies an EVK vault as escrowed collateral or as a regular credit vault.
 *
 * An escrow vault is ungoverned and prices nothing: no governor admin, no
 * oracle, no unit of account. Setting any of the three takes a governor, so an
 * ungoverned vault's answer cannot change under governance, and the family
 * costs no extra call.
 *
 * These are three of the properties `EscrowedCollateralPerspective` checks, not
 * every one a vault entity can see. Its remaining configuration checks (no
 * caps, hooks, config flags, liquidation parameters, collaterals) are left out
 * deliberately: V3 omits those blocks from a row when they are empty and the
 * converter defaults them to values a lens-sourced escrow vault does not have
 * (`socializeDebt` false, caps `0`), so including them would classify the same
 * vault differently depending on which adapter fetched it. The perspective also
 * checks registry state no entity carries (factory proxy, upgradeability, asset
 * nesting, one escrow per asset).
 *
 * A vault whose governor renounced after configuring caps or hooks is therefore
 * `escrow` here and rejected by the perspective. Use
 * `eVaultService.fetchVerifiedVaultAddresses(chainId,
 * [StandardEVaultPerspectives.ESCROW])` when the registry's own answer is what
 * you need.
 */
export function deriveEVaultFamily(signals: EVaultFamilySignals): EVaultFamily {
	const isUngoverned = isZeroAddress(signals.governorAdmin);
	const isUnpriced =
		isZeroAddress(signals.oracle.oracle) &&
		isZeroAddress(signals.unitOfAccount?.address);

	return isUngoverned && isUnpriced ? "escrow" : "evk";
}
