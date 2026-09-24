import {
	type Address,
	type Hex,
	type StateMapping,
	type StateOverride,
	getAddress,
} from "viem";

function mergeMapping(first: StateMapping, second: StateMapping): StateMapping {
	const slots = new Map(
		first.map(({ slot, value }) => [slot.toLowerCase(), { slot, value }]),
	);
	for (const { slot, value } of second)
		slots.set(slot.toLowerCase(), { slot, value });
	return [...slots.values()];
}

/**
 * Compose overrides in order. Later fields/slots win; a full `state` replaces
 * prior storage and later `stateDiff` patches that full replacement. Preserve
 * bytecode overrides and never emit mutually exclusive state/stateDiff fields.
 */
export function mergeStateOverrides(overrides: StateOverride): StateOverride {
	const merged = new Map<
		Address,
		{
			address: Address;
			balance?: bigint;
			nonce?: number;
			code?: Hex;
			state?: StateMapping;
			stateDiff?: StateMapping;
		}
	>();
	for (const override of overrides) {
		if (override.state !== undefined && override.stateDiff !== undefined) {
			throw new Error("State override cannot contain both state and stateDiff");
		}
		const address = getAddress(override.address);
		const current = merged.get(address) ?? { address };
		if (override.balance !== undefined) current.balance = override.balance;
		if (override.nonce !== undefined) current.nonce = override.nonce;
		if (override.code !== undefined) current.code = override.code;
		if (override.state !== undefined) {
			current.state = mergeMapping([], override.state);
			delete current.stateDiff;
		} else if (override.stateDiff !== undefined) {
			if (current.state !== undefined) {
				current.state = mergeMapping(current.state, override.stateDiff);
			} else {
				current.stateDiff = mergeMapping(
					current.stateDiff ?? [],
					override.stateDiff,
				);
			}
		}
		merged.set(address, current);
	}
	return [...merged.values()] as StateOverride;
}
