import {
	type Address,
	type Hex,
	type PublicClient,
	encodePacked,
	erc20Abi,
	getAddress,
	hexToBigInt,
	keccak256,
	maxUint256,
	numberToHex,
	toHex,
} from "viem";
import { encodeFunctionData } from "viem/utils";
import { getAccessedSlots } from "./accessList.js";

/**
 * Discovered storage-slot indices for a single ERC20 token. Slot indices are
 * the small-integer base index used in the contract's `mapping(address =>
 * uint256) balances` / `mapping(address => mapping(address => uint256))
 * allowances` declaration. They are owner-/spender-agnostic — the concrete
 * storage slot is then derived cryptographically.
 *
 * Cache and reuse these across calls: they don't change for a deployed token.
 */
export type Erc20SlotHints = {
	/** Slot index for the `balances` mapping (base storage slot). */
	balanceSlotIndex?: bigint;
	/** Slot index for the `allowance` mapping (outer base storage slot). */
	allowanceSlotIndex?: bigint;
};

export type SlotHints = Record<Address, Erc20SlotHints>;

export type FetchSlotHintsOptions = {
	/** When `true`, do not probe for the balance slot. */
	skipBalance?: boolean;
	/** When `true`, do not probe for the allowance slot. */
	skipAllowance?: boolean;
	/** Spender for allowance probing. Defaults to the Permit2 address. */
	allowanceSpender?: Address;
	/** Max sequential base slot to scan (0..N). Defaults to 20. */
	maxSequentialSlot?: number;
	/** Extra non-sequential slot indices to try (e.g. known anomalies). */
	extraSlotCandidates?: bigint[];
};

const DEFAULT_MAX_SEQUENTIAL = 20;
const DEFAULT_EXTRA_CANDIDATES: bigint[] = [];

const slotHintsCache = new Map<string, Erc20SlotHints>();

const probeAddress = (chainId: number, token: Address) =>
	`${chainId}:${getAddress(token)}`;

/**
 * Compute the storage slot of `balances[owner]` in a Solidity-style
 * `mapping(address => uint256)` at base slot `slotIndex`.
 */
export function computeBalanceSlot(owner: Address, slotIndex: bigint): Hex {
	return keccak256(
		encodePacked(["uint256", "uint256"], [hexToBigInt(owner), slotIndex]),
	);
}

/**
 * Compute the storage slot of `allowance[owner][spender]` in a Solidity-style
 * `mapping(address => mapping(address => uint256))` at base slot `slotIndex`.
 */
export function computeAllowanceSlot(
	owner: Address,
	spender: Address,
	slotIndex: bigint,
): Hex {
	const baseSlot = keccak256(
		encodePacked(["uint256", "uint256"], [hexToBigInt(owner), slotIndex]),
	);
	return keccak256(
		encodePacked(
			["uint256", "uint256"],
			[hexToBigInt(spender), hexToBigInt(baseSlot)],
		),
	);
}

/**
 * Probe a single ERC20 token to discover its `balances` and `allowance` slot
 * indices, by overriding sequential base-slot candidates and reading the
 * value back.
 *
 * Strategy is intentionally simpler than `eth_createAccessList`-based
 * discovery: most ERC20 layouts (OpenZeppelin, Solady, custom) use a small
 * integer base slot. Sequential probing from 0 hits the answer in 1–3 RPC
 * calls; access-list discovery costs an `eth_createAccessList` + per-candidate
 * probe and isn't supported by all proxies.
 *
 * Results are cached module-scope by `chainId:token` (slot indices are
 * owner-/spender-agnostic and immutable for a deployed token), so subsequent
 * calls for the same token short-circuit to a Map lookup.
 *
 * @example
 * ```ts
 * const hints = await fetchErc20SlotHints(client, token, {
 *   allowanceSpender: permit2Address,
 * })
 * // → { balanceSlotIndex: 0n, allowanceSlotIndex: 1n }
 * ```
 */
export async function fetchErc20SlotHints(
	client: PublicClient,
	token: Address,
	options: FetchSlotHintsOptions = {},
): Promise<Erc20SlotHints> {
	const chainId = client.chain?.id;
	if (!chainId) throw new Error("Client must have a chain configured");

	const cacheKey = probeAddress(chainId, token);
	const cached = slotHintsCache.get(cacheKey);
	if (cached) {
		const stillNeedsBalance =
			!options.skipBalance && cached.balanceSlotIndex === undefined;
		const stillNeedsAllowance =
			!options.skipAllowance && cached.allowanceSlotIndex === undefined;
		if (!stillNeedsBalance && !stillNeedsAllowance) {
			return cached;
		}
	}

	const max = options.maxSequentialSlot ?? DEFAULT_MAX_SEQUENTIAL;
	const extras = options.extraSlotCandidates ?? DEFAULT_EXTRA_CANDIDATES;
	const candidates: bigint[] = [];
	for (let i = 0; i <= max; i++) candidates.push(BigInt(i));
	for (const idx of extras) candidates.push(idx);

	const probeOwner: Address =
		"0x1111111111111111111111111111111111111111" as Address;
	const probeSpender: Address =
		options.allowanceSpender ??
		("0x2222222222222222222222222222222222222222" as Address);
	const valueHex = numberToHex(maxUint256, { size: 32 });

	const findSlotIndex = async (
		computeSlot: (idx: bigint) => Hex,
		read: (idx: bigint, slot: Hex) => Promise<bigint>,
	): Promise<bigint | undefined> => {
		for (const idx of candidates) {
			try {
				const slot = computeSlot(idx);
				const value = await read(idx, slot);
				if (value === maxUint256) return idx;
			} catch {
				// candidate didn't decode; try next
			}
		}
		return undefined;
	};

	const balancePromise: Promise<bigint | undefined> =
		options.skipBalance || cached?.balanceSlotIndex !== undefined
			? Promise.resolve(cached?.balanceSlotIndex)
			: findSlotIndex(
					(idx) => computeBalanceSlot(probeOwner, idx),
					(_idx, slot) =>
						client
							.readContract({
								abi: erc20Abi,
								address: token,
								functionName: "balanceOf",
								args: [probeOwner],
								stateOverride: [
									{
										address: token,
										stateDiff: [{ slot, value: valueHex }],
									},
								],
							})
							.catch(() => 0n),
				);

	const allowancePromise: Promise<bigint | undefined> =
		options.skipAllowance || cached?.allowanceSlotIndex !== undefined
			? Promise.resolve(cached?.allowanceSlotIndex)
			: findSlotIndex(
					(idx) => computeAllowanceSlot(probeOwner, probeSpender, idx),
					(_idx, slot) =>
						client
							.readContract({
								abi: erc20Abi,
								address: token,
								functionName: "allowance",
								args: [probeOwner, probeSpender],
								stateOverride: [
									{
										address: token,
										stateDiff: [{ slot, value: valueHex }],
									},
								],
							})
							.catch(() => 0n),
				);

	const [balanceSlotIndex, allowanceSlotIndex] = await Promise.all([
		balancePromise,
		allowancePromise,
	]);

	const hints: Erc20SlotHints = {
		balanceSlotIndex,
		allowanceSlotIndex,
	};
	slotHintsCache.set(cacheKey, hints);
	return hints;
}

/**
 * Convenience batch wrapper for `fetchErc20SlotHints` over many tokens.
 * Caller-side parallelism is preserved (one `Promise.all` over the inputs);
 * the per-token cache means repeats are free.
 */
export async function fetchErc20SlotHintsBatch(
	client: PublicClient,
	tokens: Address[],
	options: FetchSlotHintsOptions = {},
): Promise<SlotHints> {
	const result: SlotHints = {};
	await Promise.all(
		tokens.map(async (rawToken) => {
			const token = getAddress(rawToken);
			result[token] = await fetchErc20SlotHints(client, token, options);
		}),
	);
	return result;
}

/**
 * Helper for callers who want to pre-seed the slot-hints cache from their own
 * persistence layer (e.g. localStorage).
 */
export function primeSlotHintsCache(
	chainId: number,
	hints: Record<Address, Erc20SlotHints>,
) {
	for (const [token, h] of Object.entries(hints)) {
		slotHintsCache.set(probeAddress(chainId, token as Address), h);
	}
}

/** Helper used by deriveStateOverrides to look up a hint without re-probing. */
export function getCachedSlotHints(
	chainId: number,
	token: Address,
): Erc20SlotHints | undefined {
	return slotHintsCache.get(probeAddress(chainId, token));
}

export { toHex };
