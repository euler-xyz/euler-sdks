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

const ALLOWANCE_MAX_SEQUENTIAL_SLOT = 500;
const ALLOWANCE_EXTRA_SLOT_CANDIDATES: bigint[] = [];

type AllowanceSlotCacheKey = `${number}:${Address}`;

const allowanceSlotIndexCache = new Map<AllowanceSlotCacheKey, bigint>();

function computeAllowanceSlot(
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

async function verifyAllowanceSlot(params: {
	client: PublicClient;
	asset: Address;
	account: Address;
	permit2: Address;
	slot: Hex;
	valueHex: Hex;
}) {
	try {
		const allowance = await params.client.readContract({
			abi: erc20Abi,
			address: params.asset,
			functionName: "allowance",
			args: [params.account, params.permit2],
			stateOverride: [
				{
					address: params.asset,
					stateDiff: [{ slot: params.slot, value: params.valueHex }],
				},
			],
		});

		return allowance === maxUint256;
	} catch {
		return false;
	}
}

async function resolveAllowanceSlotIndexFallback(params: {
	client: PublicClient;
	asset: Address;
	account: Address;
	permit2: Address;
}): Promise<bigint | undefined> {
	const chainId = params.client.chain?.id;
	const normalizedAsset = getAddress(params.asset);
	const cacheKey =
		chainId !== undefined
			? (`${chainId}:${normalizedAsset}` as AllowanceSlotCacheKey)
			: undefined;
	const cachedSlotIndex =
		cacheKey !== undefined ? allowanceSlotIndexCache.get(cacheKey) : undefined;

	const trySlotIndex = async (slotIndex: bigint) => {
		const slot = computeAllowanceSlot(
			params.account,
			params.permit2,
			slotIndex,
		);

		return verifyAllowanceSlot({
			client: params.client,
			asset: normalizedAsset,
			account: params.account,
			permit2: params.permit2,
			slot,
			valueHex: toHex(maxUint256, { size: 32 }),
		});
	};

	if (cachedSlotIndex !== undefined) {
		const cachedMatches = await trySlotIndex(cachedSlotIndex);
		if (cachedMatches) {
			return cachedSlotIndex;
		}
	}

	for (let slotIndex = 0; slotIndex <= ALLOWANCE_MAX_SEQUENTIAL_SLOT; slotIndex++) {
		if (!(await trySlotIndex(BigInt(slotIndex)))) {
			continue;
		}

		if (cacheKey !== undefined) {
			allowanceSlotIndexCache.set(cacheKey, BigInt(slotIndex));
		}
		return BigInt(slotIndex);
	}

	for (const slotIndex of ALLOWANCE_EXTRA_SLOT_CANDIDATES) {
		if (!(await trySlotIndex(slotIndex))) {
			continue;
		}

		if (cacheKey !== undefined) {
			allowanceSlotIndexCache.set(cacheKey, slotIndex);
		}
		return slotIndex;
	}

	return undefined;
}

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
async function discoverAllowanceSlots(
	client: PublicClient,
	account: Address,
	assets: Address[],
	permit2: Address,
): Promise<StateOverride> {
	const stateOverride: StateOverride = [];
	const valueHex = toHex(maxUint256, { size: 32 });

	for (const asset of assets) {
		const normalizedAsset = getAddress(asset);
		const stateDiff: { slot: Hex; value: Hex }[] = [];

		/* ------------------------- */
		/*   Access-list discovery   */
		/* ------------------------- */
		try {
			const accessedSlots = await getAccessedSlots(client, {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: "allowance",
					args: [account, permit2],
				}),
				to: normalizedAsset,
				from: account,
			});

			const tokenSlots = accessedSlots.get(normalizedAsset) ?? [];
			if (tokenSlots.length > 0) {
				const matches = await Promise.all(
					tokenSlots.map((slot) =>
						verifyAllowanceSlot({
							client,
							asset: normalizedAsset,
							account,
							permit2,
							slot,
							valueHex,
						}),
					),
				);

				for (let i = 0; i < tokenSlots.length; i++) {
					if (matches[i]) {
						stateDiff.push({ slot: tokenSlots[i]!, value: valueHex });
					}
				}
			}
		} catch (e) {
			console.warn(
				`[approvalOverrides] access-list discovery failed for ${normalizedAsset}:`,
				e,
			);
		}

		/* ------------------------- */
		/*   Slot-index fallback     */
		/* ------------------------- */
		if (stateDiff.length === 0) {
			try {
				const slotIndex = await resolveAllowanceSlotIndexFallback({
					client,
					asset: normalizedAsset,
					account,
					permit2,
				});

				if (slotIndex !== undefined) {
					stateDiff.push({
						slot: computeAllowanceSlot(account, permit2, slotIndex),
						value: valueHex,
					});
				}
			} catch (e) {
				console.warn(
					`[approvalOverrides] slot-index fallback failed for ${normalizedAsset}:`,
					e,
				);
			}
		}

		if (stateDiff.length > 0) {
			stateOverride.push({ address: normalizedAsset, stateDiff });
		}
	}

	return stateOverride;
}

/**
 * Generate state overrides for ERC20 approvals and Permit2 allowances.
 *
 * 1. Computes Permit2 storage slots deterministically (keccak256 mapping layout)
 * 2. Traces actual ERC20 approve() calls to discover approval storage slots
 *
 * @param client - viem PublicClient (must support eth_createAccessList and eth_call with state overrides)
 * @param account - token owner address
 * @param approvals - array of [assetAddress, spenderAddress] pairs
 * @param permit2Address - Permit2 contract address
 */
export async function getApprovalOverrides(
	client: PublicClient,
	account: Address,
	approvals: [Address, Address][],
	permit2Address: Address,
): Promise<StateOverride> {
	if (approvals.length === 0) return [];

	const stateOverride: StateOverride = [];

	// 1. Permit2 allowance overrides (deterministic slot computation)
	const permit2StateDiff = computePermit2StateDiff(account, approvals);
	if (permit2StateDiff.length > 0) {
		stateOverride.push({
			address: permit2Address,
			stateDiff: permit2StateDiff,
		});
	}

	// 2. ERC20 approval overrides (discovered via eth_createAccessList)
	const uniqueAssets = [
		...new Set(approvals.map(([asset]) => getAddress(asset))),
	];
	const allowanceOverrides = await discoverAllowanceSlots(
		client,
		account,
		uniqueAssets,
		permit2Address,
	);
	stateOverride.push(...allowanceOverrides);

	return stateOverride;
}
