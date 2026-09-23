import {
	type Address,
	type Hex,
	type PublicClient,
	type StateOverride,
	erc20Abi,
	getAddress,
	numberToHex,
} from "viem";
import { encodeFunctionData } from "viem/utils";
import { getAccessedSlots } from "./accessList.js";
import {
	computeBalanceSlot,
	fetchErc20SlotHints,
	getCachedSlotHints,
	type SlotHints,
} from "./slotHints.js";
import type { StorageSlot } from "./types.js";

type SlotCacheKey = `${number}:${Address}:${Address}`;

const balanceSlotCache = new Map<SlotCacheKey, StorageSlot>();

// wM token requires special storage layout handling
const WM_CONTRACT = "0x437cc33344a0B27A429f795ff6B469C72698B291";

function shouldSkipCaching(token: Address) {
	return getAddress(token) === getAddress(WM_CONTRACT);
}

function applySpecialCasing(stateOverride: StateOverride): StateOverride {
	const result: StateOverride = [];

	for (const override of stateOverride) {
		if (
			getAddress(override.address) === getAddress(WM_CONTRACT) &&
			override.stateDiff
		) {
			// wM token: shift values left by 8 bits and write to adjacent slot
			const newStateDiff = override.stateDiff.flatMap((diff) => {
				const shiftedValue = `0x${(BigInt(diff.value) << 8n)
					.toString(16)
					.padStart(64, "0")}` as Hex;
				return [
					{ slot: diff.slot, value: shiftedValue },
					{
						slot: `0x${(BigInt(diff.slot) + 1n)
							.toString(16)
							.padStart(64, "0")}` as Hex,
						value: shiftedValue,
					},
				];
			});
			result.push({ ...override, stateDiff: newStateDiff });
		} else {
			result.push(override);
		}
	}

	return result;
}

function findIndexOfLargest(arr: bigint[]): number {
	if (arr.length === 0) return -1;
	let maxIndex = 0;
	let maxValue = arr[0]!;
	for (let i = 1; i < arr.length; i++) {
		if (arr[i]! > maxValue) {
			maxValue = arr[i]!;
			maxIndex = i;
		}
	}
	return maxIndex;
}

export type GetBalanceOverridesOptions = {
	/**
	 * Caller-supplied on-chain balances. When a token's balance here meets the
	 * required amount, the per-call `balanceOf` RPC is skipped and no override
	 * is emitted.
	 */
	walletBalances?: Record<Address, bigint>;
	/**
	 * Caller-supplied slot hints. When `balanceSlotIndex` is present for a
	 * token, the slot is computed cryptographically; access-list discovery is
	 * skipped. Missing entries fall back to access-list discovery before
	 * sequential `fetchErc20SlotHints` probing.
	 */
	slotHints?: SlotHints;
};

/**
 * Generate state overrides that give `account` sufficient ERC20 balances.
 *
 * Resolution order, per token:
 *  1. Use caller-supplied wallet balance when sufficient → no work.
 *  2. Read `balanceOf` on-chain; skip if sufficient.
 *  3. Use caller-supplied `balanceSlotIndex` → compute slot cryptographically.
 *  4. Use cached probed slot index (`fetchErc20SlotHints` cache) → same.
 *  5. Probe via `eth_createAccessList` discovery + per-slot verification.
 *  6. Fall back to sequential `fetchErc20SlotHints` probing when access-list
 *     discovery is unavailable.
 *
 * Access-list probing handles proxy / namespaced token layouts when the RPC
 * supports it. Sequential probing remains the fallback for standard ERC20
 * layouts on RPCs where `eth_createAccessList` is unavailable.
 */
export async function getBalanceOverrides(
	client: PublicClient,
	account: Address,
	tokens: [Address, bigint][],
	options: GetBalanceOverridesOptions = {},
): Promise<StateOverride> {
	if (tokens.length === 0) return [];

	const chainId = client.chain?.id;
	if (!chainId) throw new Error("Client must have a chain configured");

	const stateOverride: StateOverride = [];
	const { walletBalances, slotHints } = options;

	// Determine which tokens still need work after applying caller-supplied
	// balances. Tokens with `walletBalances[token] >= requiredAmount` need
	// nothing at all.
	const remaining: [Address, bigint][] = [];
	for (const [token, requiredAmount] of tokens) {
		const supplied = walletBalances?.[getAddress(token)];
		if (supplied !== undefined && supplied >= requiredAmount) continue;
		remaining.push([token, requiredAmount]);
	}
	if (remaining.length === 0) return [];

	// Batch-read current balances for the remaining set (those without a
	// caller-supplied sufficient balance).
	const currentBalances = await Promise.all(
		remaining.map(([token]) =>
			client
				.readContract({
					abi: erc20Abi,
					address: token,
					functionName: "balanceOf",
					args: [account],
				})
				.catch(() => 0n),
		),
	);

	for (const [i, [token, requiredAmount]] of remaining.entries()) {
		const currentBalance = currentBalances[i] ?? 0n;
		if (currentBalance >= requiredAmount) continue;

		const tokenAddr = getAddress(token);
		const valueHex = numberToHex(requiredAmount, { size: 32 });

		// Fast path: caller hint → cryptographic slot computation, no RPC.
		const callerHintIdx = slotHints?.[tokenAddr]?.balanceSlotIndex;
		if (callerHintIdx !== undefined && !shouldSkipCaching(token)) {
			const slot = computeBalanceSlot(account, callerHintIdx);
			stateOverride.push({
				address: tokenAddr,
				stateDiff: [{ slot, value: valueHex }],
			});
			continue;
		}

		// Per-account slot cache (legacy: keyed by chainId:owner:token, useful
		// when discovery was done via access-list against this account
		// directly).
		const cacheKey = `${chainId}:${account}:${token}` as SlotCacheKey;
		const cached = balanceSlotCache.get(cacheKey);
		if (cached && !shouldSkipCaching(token)) {
			stateOverride.push({
				address: cached.address,
				stateDiff: [{ slot: cached.slot, value: valueHex }],
			});
			continue;
		}

		// Token-keyed cache from `fetchErc20SlotHints` (owner-agnostic).
		const probed = getCachedSlotHints(chainId, tokenAddr);
		if (probed?.balanceSlotIndex !== undefined && !shouldSkipCaching(token)) {
			const slot = computeBalanceSlot(account, probed.balanceSlotIndex);
			stateOverride.push({
				address: tokenAddr,
				stateDiff: [{ slot, value: valueHex }],
			});
			continue;
		}

		// Prefer access-list discovery for unresolved tokens; it can surface
		// proxy / namespaced storage slots that raw sequential probing cannot.
		let resolvedViaAccessList = false;
		try {
			const accessedSlots = await getAccessedSlots(client, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: "balanceOf",
					args: [account],
				}),
				to: token,
			});

			const tokenSlots = accessedSlots.get(getAddress(token));
			if (tokenSlots && tokenSlots.length > 0) {
				const candidateSlots: StorageSlot[] = tokenSlots.map((slot) => ({
					address: getAddress(token),
					slot,
				}));

				// Test each candidate: override slot → read balanceOf → pick best
				const testBalances = await Promise.all(
					candidateSlots.map((slot) =>
						client
							.readContract({
								abi: erc20Abi,
								address: token,
								functionName: "balanceOf",
								args: [account],
								stateOverride: [
									{
										address: slot.address,
										stateDiff: [{ slot: slot.slot, value: valueHex }],
									},
								],
							})
							.catch(() => 0n),
					),
				);

				const bestIdx = findIndexOfLargest(testBalances);
				const bestSlot = candidateSlots[bestIdx];
				const bestBalance = bestIdx >= 0 ? testBalances[bestIdx] : undefined;
				if (
					bestSlot &&
					bestBalance !== undefined &&
					(bestBalance > currentBalance || shouldSkipCaching(token))
				) {
					stateOverride.push({
						address: bestSlot.address,
						stateDiff: [{ slot: bestSlot.slot, value: valueHex }],
					});
					if (!shouldSkipCaching(token)) {
						balanceSlotCache.set(cacheKey, bestSlot);
					}
					resolvedViaAccessList = true;
				}
			}
		} catch (e) {
			console.warn(`[balanceOverrides] slot discovery failed for ${token}:`, e);
		}
		if (resolvedViaAccessList) continue;

		// Sequential probing via fetchErc20SlotHints (cheap, owner-agnostic) is
		// the fallback for standard ERC20 layouts when access-list is unavailable.
		try {
			const fresh = await fetchErc20SlotHints(client, tokenAddr, {
				skipAllowance: true,
			});
			if (fresh.balanceSlotIndex !== undefined && !shouldSkipCaching(token)) {
				const slot = computeBalanceSlot(account, fresh.balanceSlotIndex);
				stateOverride.push({
					address: tokenAddr,
					stateDiff: [{ slot, value: valueHex }],
				});
			}
		} catch (e) {
			// unresolved; callers still get any other applicable overrides.
		}
	}

	return applySpecialCasing(stateOverride);
}
