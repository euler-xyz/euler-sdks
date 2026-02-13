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
} from "viem"
import { encodeFunctionData } from "viem/utils"
import { getAccessedSlots } from "./debugTracers.js"

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
  const stateDiff: StateMapping = []
  const seen = new Set<Hex>()

  for (const [asset, spender] of approvals) {
    // Permit2 allowance mapping: mapping(address owner => mapping(address token => mapping(address spender => PackedAllowance)))
    // Slot 1 is the base mapping slot
    const baseSlot = keccak256(
      encodePacked(
        ["uint256", "uint256"],
        [hexToBigInt(account), 1n],
      ),
    )
    const assetSlot = keccak256(
      encodePacked(
        ["uint256", "uint256"],
        [hexToBigInt(asset), hexToBigInt(baseSlot)],
      ),
    )
    const spenderSlot = keccak256(
      encodePacked(
        ["uint256", "uint256"],
        [hexToBigInt(spender), hexToBigInt(assetSlot)],
      ),
    )

    if (!seen.has(spenderSlot)) {
      seen.add(spenderSlot)
      stateDiff.push({ slot: spenderSlot, value: toHex(maxUint256) })
    }
  }

  return stateDiff
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
  const stateOverride: StateOverride = []
  const valueHex = toHex(maxUint256, { size: 32 })

  for (const asset of assets) {
    try {
      const accessedSlots = await getAccessedSlots(client, {
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, permit2],
        }),
        to: asset,
        from: account,
      })

      const tokenSlots = accessedSlots.get(getAddress(asset))
      if (!tokenSlots || tokenSlots.length === 0) continue

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
      )

      const stateDiff: { slot: Hex; value: Hex }[] = []
      for (let i = 0; i < tokenSlots.length; i++) {
        if (testResults[i] === maxUint256) {
          stateDiff.push({ slot: tokenSlots[i]!, value: valueHex })
        }
      }

      if (stateDiff.length > 0) {
        stateOverride.push({ address: asset, stateDiff })
      }
    } catch (e) {
      console.warn(`[approvalOverrides] slot discovery failed for ${asset}:`, e)
    }
  }

  return stateOverride
}

/**
 * Generate state overrides for ERC20 approvals and Permit2 allowances.
 *
 * 1. Computes Permit2 storage slots deterministically (keccak256 mapping layout)
 * 2. Traces actual ERC20 approve() calls to discover approval storage slots
 *
 * @param client - viem PublicClient (must support debug_traceCall for approval tracing)
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
  if (approvals.length === 0) return []

  const stateOverride: StateOverride = []

  // 1. Permit2 allowance overrides (deterministic slot computation)
  const permit2StateDiff = computePermit2StateDiff(account, approvals)
  if (permit2StateDiff.length > 0) {
    stateOverride.push({
      address: permit2Address,
      stateDiff: permit2StateDiff,
    })
  }

  // 2. ERC20 approval overrides (discovered via eth_createAccessList)
  const uniqueAssets = [...new Set(approvals.map(([asset]) => getAddress(asset)))]
  const allowanceOverrides = await discoverAllowanceSlots(
    client,
    account,
    uniqueAssets,
    permit2Address,
  )
  stateOverride.push(...allowanceOverrides)

  return stateOverride
}
