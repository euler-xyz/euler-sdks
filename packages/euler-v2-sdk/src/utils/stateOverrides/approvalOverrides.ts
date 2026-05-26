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
	assets: Address[],
	permit2: Address,
): Promise<StateOverride> {
	const stateOverride: StateOverride = [];
	const valueHex = toHex(maxUint256, { size: 32 });

	for (const asset of assets) {
		try {
			const accessedSlots = await getAccessedSlots(client, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: "allowance",
					args: [account, permit2],
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
							args: [account, permit2],
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
			}
		} catch (e) {
			console.warn(
				`[approvalOverrides] slot discovery failed for ${asset}:`,
				e,
			);
		}
	}

	return stateOverride;
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
 *  5. Probe sequentially via `fetchErc20SlotHints`.
 *  6. Fall back to legacy `eth_createAccessList` discovery.
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

	// Decide which assets still need an ERC20 allowance override.
	const uniqueAssets: Address[] = [];
	const seen = new Set<Address>();
	for (const [asset, spender] of approvals) {
		const a = getAddress(asset);
		// Token already approved → skip.
		const supplied = walletAllowances?.[allowanceKey(a, spender)];
		if (supplied !== undefined && supplied === maxUint256) continue;
		if (!seen.has(a)) {
			seen.add(a);
			uniqueAssets.push(a);
		}
	}

	// Partition assets by which resolution path applies.
	const fallbackAssets: Address[] = [];
	for (const asset of uniqueAssets) {
		const callerHintIdx = slotHints?.[asset]?.allowanceSlotIndex;
		const cachedIdx = getCachedSlotHints(chainId, asset)?.allowanceSlotIndex;
		const idx = callerHintIdx ?? cachedIdx;
		if (idx !== undefined) {
			const slot = computeAllowanceSlot(account, permit2Address, idx);
			stateOverride.push({
				address: asset,
				stateDiff: [{ slot, value: valueHex }],
			});
			continue;
		}
		fallbackAssets.push(asset);
	}

	// Probe via sequential scan first; only fall back to access-list for the
	// rare token where that fails.
	const stillUnknown: Address[] = [];
	for (const asset of fallbackAssets) {
		try {
			const hints = await fetchErc20SlotHints(client, asset, {
				skipBalance: true,
				allowanceSpender: permit2Address,
			});
			if (hints.allowanceSlotIndex !== undefined) {
				const slot = computeAllowanceSlot(
					account,
					permit2Address,
					hints.allowanceSlotIndex,
				);
				stateOverride.push({
					address: asset,
					stateDiff: [{ slot, value: valueHex }],
				});
				continue;
			}
		} catch (e) {
			// fall through
		}
		stillUnknown.push(asset);
	}

	if (stillUnknown.length > 0) {
		const legacy = await discoverAllowanceSlotsViaAccessList(
			client,
			account,
			stillUnknown,
			permit2Address,
		);
		stateOverride.push(...legacy);
	}

	return stateOverride;
}
