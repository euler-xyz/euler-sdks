import {
	type Address,
	type StateMapping,
	type StateOverride,
	getAddress,
} from "viem";

/**
 * Merge state overrides by address, concatenating stateDiff entries
 * and taking the last-seen balance/nonce for each address.
 */
export function mergeStateOverrides(overrides: StateOverride): StateOverride {
	const merged = new Map<
		Address,
		{
			address: Address;
			balance?: bigint;
			nonce?: number;
			stateDiff?: StateMapping;
		}
	>();

	for (const override of overrides) {
		const key = getAddress(override.address);
		const current = merged.get(key) || { address: key };

		let nextStateDiff: StateMapping | undefined;
		const a = current.stateDiff;
		const b = override.stateDiff;
		if (a && b) {
			nextStateDiff = a.concat(b);
		} else {
			nextStateDiff = a || b;
		}

		merged.set(key, {
			address: key,
			balance: override.balance ?? current.balance,
			nonce: override.nonce ?? current.nonce,
			stateDiff: nextStateDiff,
		});
	}

	const out: StateOverride = [];
	for (const value of merged.values()) {
		const entry: StateOverride[number] = { address: value.address };
		if (value.balance !== undefined) entry.balance = value.balance;
		if (value.nonce !== undefined) entry.nonce = value.nonce;
		if (value.stateDiff && value.stateDiff.length > 0)
			entry.stateDiff = value.stateDiff;
		out.push(entry);
	}

	return out;
}
