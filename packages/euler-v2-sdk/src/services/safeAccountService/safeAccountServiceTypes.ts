import type { Address } from "viem";

export interface SafeAccountInfo {
	/** Address of the Safe proxy that was probed. */
	address: Address;
	/** Canonical Safe singleton (implementation) the proxy points at. */
	singleton: Address;
	/** Safe contract version of the singleton, e.g. "1.4.1". */
	version: string;
	/**
	 * Configured owner-signature threshold for owner-authorized Safe
	 * transactions. Enabled Safe modules can execute without owner
	 * confirmations (`execTransactionFromModule`), and this probe does not
	 * inspect modules or guards.
	 */
	threshold: number;
	/** Current Safe owners. */
	owners: Address[];
}

export interface FetchSafeAccountArgs {
	/** Chain to probe on. */
	chainId: number;
	/** Address to probe. */
	account: Address;
}

export interface SafeAccountServiceConfig {
	/** Probe result cache TTL in milliseconds. Defaults to 5 minutes. */
	cacheMs?: number;
}

export interface ISafeAccountService {
	/**
	 * Detect whether an address is a Safe smart account. Resolves to the
	 * Safe's signer configuration, or null when the address is an EOA, a
	 * non-Safe contract, or a proxy pointing at an unrecognized singleton.
	 * Rejects on RPC transport failures rather than misreporting them as
	 * null; failed probes are not cached, so a later call retries.
	 *
	 * Detection is a display/UX heuristic — a purpose-built contract can
	 * mimic the probed functions. Never use the result for authorization
	 * decisions.
	 */
	fetchSafeAccount(args: FetchSafeAccountArgs): Promise<SafeAccountInfo | null>;
}
