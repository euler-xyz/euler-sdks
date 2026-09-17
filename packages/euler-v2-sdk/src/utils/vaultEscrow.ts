import { type Address, zeroAddress } from "viem";

/**
 * The vault configuration an escrow verdict is derived from. Every field must
 * be a value the source actually read: an absent `unitOfAccount` means the
 * vault has none, not that it could not be read. A caller that cannot read one
 * of them reports no verdict instead of calling this.
 *
 * `governorAdmin` and `oracle` are required, so an absent one is a caller
 * error, not an unknown state, and is left to fail rather than counted as a
 * zero address — a partial read must not become a confident escrow verdict.
 */
export interface EVaultEscrowSignals {
	governorAdmin: Address;
	oracle: { oracle: Address };
	unitOfAccount?: { address: Address } | undefined;
}

function isZeroAddress(address: Address): boolean {
	return address.toLowerCase() === zeroAddress;
}

/**
 * Whether an EVK vault is escrowed collateral rather than a credit vault.
 *
 * An escrow vault is ungoverned and prices nothing: no governor admin, no
 * oracle, no unit of account. Setting any of the three takes a governor, so an
 * ungoverned vault's answer cannot change under governance, and the verdict
 * costs no extra call.
 *
 * These are three of the properties `EscrowedCollateralPerspective` checks, not
 * every one a vault entity can see. Its remaining configuration checks (no
 * caps, hooks, config flags, liquidation parameters, collaterals) are left out
 * deliberately: V3 omits those blocks from a row when they are empty and the
 * converter defaults them to values a lens-sourced escrow vault does not have
 * (`socializeDebt` false, caps `0`), so including them would answer differently
 * for the same vault depending on which adapter fetched it. The perspective
 * also checks registry state no entity carries (factory proxy, upgradeability,
 * asset nesting, one escrow per asset).
 *
 * A vault whose governor renounced after configuring caps or hooks is therefore
 * escrow here and rejected by the perspective. Use
 * `eVaultService.fetchVerifiedVaultAddresses(chainId,
 * [StandardEVaultPerspectives.ESCROW])` when the registry's own answer is what
 * you need.
 */
export function deriveEVaultEscrow(signals: EVaultEscrowSignals): boolean {
	const isUngoverned = isZeroAddress(signals.governorAdmin);
	const isUnpriced =
		isZeroAddress(signals.oracle.oracle) &&
		// the one field whose absence is meaningful: no unit of account at all
		isZeroAddress(signals.unitOfAccount?.address ?? zeroAddress);

	return isUngoverned && isUnpriced;
}
