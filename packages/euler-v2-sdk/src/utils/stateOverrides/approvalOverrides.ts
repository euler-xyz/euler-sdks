import {
	type Address,
	type Hex,
	type PublicClient,
	type StateMapping,
	type StateOverride,
	erc20Abi,
	encodePacked,
	getAddress,
	hexToBigInt,
	keccak256,
	maxUint256,
	toHex,
} from "viem";
import { encodeFunctionData } from "viem/utils";
import { getAccessedSlots } from "./accessList.js";
import {
	computeAllowanceSlot,
	fetchErc20SlotHints,
	getCachedSlotHints,
	type SlotHints,
} from "./slotHints.js";

/**
 * Compute Permit2 allowance storage slots for the given approvals.
 *
 * Permit2 uses: mapping(owner => mapping(token => mapping(spender => PackedAllowance)))
 * Storage slot 1 is the base slot for the allowance mapping.
 */
export function computePermit2StateDiff(
	account: Address,
	approvals: [Address, Address][], // [asset, spender]
): StateMapping {
	const stateDiff: StateMapping = [];
	const seen = new Set<Hex>();

	for (const [asset, spender] of approvals) {
		// Permit2 allowance mapping: mapping(address owner => mapping(address token => mapping(address spender => PackedAllowance)))
		// Slot 1 is the base mapping slot
		const baseSlot = keccak256(
			encodePacked(["uint256", "uint256"], [hexToBigInt(account), 1n]),
		);
		const assetSlot = keccak256(
			encodePacked(
				["uint256", "uint256"],
				[hexToBigInt(asset), hexToBigInt(baseSlot)],
			),
		);
		const spenderSlot = keccak256(
			encodePacked(
				["uint256", "uint256"],
				[hexToBigInt(spender), hexToBigInt(assetSlot)],
			),
		);

		if (!seen.has(spenderSlot)) {
			seen.add(spenderSlot);
			stateDiff.push({ slot: spenderSlot, value: toHex(maxUint256) });
		}
	}

	return stateDiff;
}

/**
 * Discover ERC20 allowance storage slots using eth_createAccessList,
 * then create overrides that set them to maxUint256.
 *
 * Traces allowance(account, permit2) to find candidate slots, then
 * tests each by overriding and re-reading to verify.
 */
async function discoverAllowanceSlotsViaAccessList(
	client: PublicClient,
	account: Address,
	approvals: [Address, Address][],
): Promise<{ stateOverride: StateOverride; resolvedPairs: Set<string> }> {
	const stateOverride: StateOverride = [];
	const resolvedPairs = new Set<string>();
	const valueHex = toHex(maxUint256, { size: 32 });

	for (const [asset, spender] of approvals) {
		try {
			const accessedSlots = await getAccessedSlots(client, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: "allowance",
					args: [account, spender],
				}),
				to: asset,
			});

			const tokenSlots = accessedSlots.get(getAddress(asset));
			if (!tokenSlots || tokenSlots.length === 0) continue;

			// Test each candidate: override slot with maxUint256, read allowance, verify
			const testResults = await Promise.all(
				tokenSlots.map((slot) =>
					client
						.readContract({
							abi: erc20Abi,
							address: asset,
							functionName: "allowance",
							args: [account, spender],
							stateOverride: [
								{
									address: asset,
									stateDiff: [{ slot, value: valueHex }],
								},
							],
						})
						.catch(() => 0n),
				),
			);

			const stateDiff: { slot: Hex; value: Hex }[] = [];
			for (let i = 0; i < tokenSlots.length; i++) {
				if (testResults[i] === maxUint256) {
					stateDiff.push({ slot: tokenSlots[i]!, value: valueHex });
				}
			}

			if (stateDiff.length > 0) {
				stateOverride.push({ address: asset, stateDiff });
				resolvedPairs.add(approvalPairKey(asset, spender));
			}
		} catch (e) {
			console.warn(
				`[approvalOverrides] slot discovery failed for ${asset}:`,
				e,
			);
		}
	}

	return { stateOverride, resolvedPairs };
}

export type GetApprovalOverridesOptions = {
	/**
	 * Caller-supplied on-chain allowances keyed by `${asset}:${spender}`.
	 * When the supplied allowance is `maxUint256` the approval override for
	 * that pair is skipped entirely (no override, no RPC).
	 */
	walletAllowances?: Record<`${Address}:${Address}`, bigint>;
	/**
	 * Caller-supplied slot hints. When `allowanceSlotIndex` is present for an
	 * asset, the storage slot is computed cryptographically and no probing
	 * RPC fires.
	 */
	slotHints?: SlotHints;
};

const allowanceKey = (asset: Address, spender: Address) =>
	`${getAddress(asset)}:${getAddress(spender)}` as `${Address}:${Address}`;

const approvalPairKey = (asset: Address, spender: Address) =>
	`${getAddress(asset)}:${getAddress(spender)}`;

/**
 * Generate state overrides for ERC20 approvals and Permit2 allowances.
 *
 * Resolution order, per asset:
 *  1. Permit2 storage slots are always derivable cryptographically — no RPC.
 *  2. Apply caller-supplied `walletAllowances[asset:spender]` — if `maxUint256`,
 *     skip emitting an override entirely.
 *  3. Use caller-supplied `slotHints[asset].allowanceSlotIndex` →
 *     cryptographic slot, no RPC.
 *  4. Use cached probed slot index (`fetchErc20SlotHints` cache) → same.
 *  5. Probe once via `eth_createAccessList`; this handles proxy / namespaced token
 *     layouts without burning many failed state-override reads first.
 *  6. Fall back to sequential `fetchErc20SlotHints` probing when access-list
 *     discovery is unavailable.
 */
export async function getApprovalOverrides(
	client: PublicClient,
	account: Address,
	approvals: [Address, Address][],
	permit2Address: Address,
	options: GetApprovalOverridesOptions = {},
): Promise<StateOverride> {
	if (approvals.length === 0) return [];

	const chainId = client.chain?.id;
	if (!chainId) throw new Error("Client must have a chain configured");

	const stateOverride: StateOverride = [];
	const { walletAllowances, slotHints } = options;
	const valueHex = toHex(maxUint256, { size: 32 });

	// 1. Permit2 allowance overrides (deterministic, no RPC).
	const permit2StateDiff = computePermit2StateDiff(account, approvals);
	if (permit2StateDiff.length > 0) {
		stateOverride.push({
			address: permit2Address,
			stateDiff: permit2StateDiff,
		});
	}

	// Decide which ERC20 allowance pairs still need an override. Raw plan
	// simulation executes the vault deposit call without signed Permit2 data, so
	// it needs the direct owner -> spender allowance as well as the owner ->
	// Permit2 allowance used by prepared execution.
	const uniquePairs: [Address, Address][] = [];
	const seen = new Set<string>();
	for (const [asset, spender] of approvals) {
		const a = getAddress(asset);
		const pairSpenders = [getAddress(permit2Address), getAddress(spender)];
		for (const pairSpender of pairSpenders) {
			const key = approvalPairKey(a, pairSpender);
			if (seen.has(key)) continue;
			seen.add(key);
			// Token already approved → skip.
			const supplied = walletAllowances?.[allowanceKey(a, pairSpender)];
			if (supplied !== undefined && supplied === maxUint256) continue;
			uniquePairs.push([a, pairSpender]);
		}
	}

	// Partition pairs by which resolution path applies.
	const fallbackPairs: [Address, Address][] = [];
	for (const [asset, spender] of uniquePairs) {
		const callerHintIdx = slotHints?.[asset]?.allowanceSlotIndex;
		const cachedIdx = getCachedSlotHints(chainId, asset)?.allowanceSlotIndex;
		const idx = callerHintIdx ?? cachedIdx;
		if (idx !== undefined) {
			const slot = computeAllowanceSlot(account, spender, idx);
			stateOverride.push({
				address: asset,
				stateDiff: [{ slot, value: valueHex }],
			});
			continue;
		}
		fallbackPairs.push([asset, spender]);
	}

	const accessListResult =
		fallbackPairs.length > 0
			? await discoverAllowanceSlotsViaAccessList(
					client,
					account,
					fallbackPairs,
				)
			: { stateOverride: [], resolvedPairs: new Set<string>() };
	const accessListOverrides = accessListResult.stateOverride;
	stateOverride.push(...accessListOverrides);

	for (const [asset, spender] of fallbackPairs) {
		if (accessListResult.resolvedPairs.has(approvalPairKey(asset, spender)))
			continue;
		try {
			const hints = await fetchErc20SlotHints(client, asset, {
				skipBalance: true,
				allowanceSpender: spender,
			});
			if (hints.allowanceSlotIndex !== undefined) {
				const slot = computeAllowanceSlot(
					account,
					spender,
					hints.allowanceSlotIndex,
				);
				stateOverride.push({
					address: asset,
					stateDiff: [{ slot, value: valueHex }],
				});
			}
		} catch (e) {
			// access-list discovery already failed or returned no match; leave
			// unresolved rather than retrying the same unavailable method.
		}
	}

	return stateOverride;
}
