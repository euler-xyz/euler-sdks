import {
  type Address,
  type Hex,
  type PublicClient,
  type StateOverride,
  erc20Abi,
  getAddress,
  numberToHex,
} from "viem"
import { encodeFunctionData } from "viem/utils"
import { getAccessedSlots } from "./accessList.js"
import type { StorageSlot } from "./types.js"

type SlotCacheKey = `${number}:${Address}:${Address}`

const balanceSlotCache = new Map<SlotCacheKey, StorageSlot>()

// wM token requires special storage layout handling
const WM_CONTRACT = "0x437cc33344a0B27A429f795ff6B469C72698B291"

function shouldSkipCaching(token: Address) {
  return getAddress(token) === getAddress(WM_CONTRACT)
}

function applySpecialCasing(stateOverride: StateOverride): StateOverride {
  const result: StateOverride = []

  for (const override of stateOverride) {
    if (
      getAddress(override.address) === getAddress(WM_CONTRACT) &&
      override.stateDiff
    ) {
      // wM token: shift values left by 8 bits and write to adjacent slot
      const newStateDiff = override.stateDiff.flatMap((diff) => {
        const shiftedValue = `0x${(BigInt(diff.value) << 8n)
          .toString(16)
          .padStart(64, "0")}` as Hex
        return [
          { slot: diff.slot, value: shiftedValue },
          {
            slot: `0x${(BigInt(diff.slot) + 1n)
              .toString(16)
              .padStart(64, "0")}` as Hex,
            value: shiftedValue,
          },
        ]
      })
      result.push({ ...override, stateDiff: newStateDiff })
    } else {
      result.push(override)
    }
  }

  return result
}

function findIndexOfLargest(arr: bigint[]): number {
  if (arr.length === 0) return -1
  let maxIndex = 0
  let maxValue = arr[0]!
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]! > maxValue) {
      maxValue = arr[i]!
      maxIndex = i
    }
  }
  return maxIndex
}

/**
 * Generate state overrides that give `account` sufficient ERC20 balances.
 *
 * For each token where the on-chain balance is below the requested amount,
 * uses eth_createAccessList to discover the balanceOf storage slot, then builds
 * a stateDiff that sets that slot to the desired value.
 *
 * @param client - viem PublicClient (must support eth_createAccessList and eth_call with state overrides)
 * @param account - address whose balance to override
 * @param tokens - array of [tokenAddress, requiredAmount]
 */
export async function getBalanceOverrides(
  client: PublicClient,
  account: Address,
  tokens: [Address, bigint][],
): Promise<StateOverride> {
  if (tokens.length === 0) return []

  const chainId = client.chain?.id
  if (!chainId) throw new Error("Client must have a chain configured")

  const stateOverride: StateOverride = []

  // Batch-read current balances
  const currentBalances = await Promise.all(
    tokens.map(([token]) =>
      client
        .readContract({
          abi: erc20Abi,
          address: token,
          functionName: "balanceOf",
          args: [account],
        })
        .catch(() => 0n),
    ),
  )

  for (const [i, [token, requiredAmount]] of tokens.entries()) {
    const currentBalance = currentBalances[i] ?? 0n
    if (currentBalance >= requiredAmount) continue

    const cacheKey = `${chainId}:${account}:${token}` as SlotCacheKey
    const valueHex = numberToHex(requiredAmount, { size: 32 })

    // Check cache first
    const cached = balanceSlotCache.get(cacheKey)
    if (cached && !shouldSkipCaching(token)) {
      stateOverride.push({
        address: cached.address,
        stateDiff: [{ slot: cached.slot, value: valueHex }],
      })
      continue
    }

    // Use eth_createAccessList to find candidate storage slots
    try {
      const accessedSlots = await getAccessedSlots(client, {
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        }),
        to: token,
        from: account,
      })

      const tokenSlots = accessedSlots.get(getAddress(token))
      if (!tokenSlots || tokenSlots.length === 0) continue

      const candidateSlots: StorageSlot[] = tokenSlots.map((slot) => ({
        address: getAddress(token),
        slot,
      }))

      if (candidateSlots.length === 0) continue

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
      )

      const bestIdx = findIndexOfLargest(testBalances)
      const bestSlot = candidateSlots[bestIdx]
      if (bestSlot) {
        stateOverride.push({
          address: bestSlot.address,
          stateDiff: [{ slot: bestSlot.slot, value: valueHex }],
        })
        if (!shouldSkipCaching(token)) {
          balanceSlotCache.set(cacheKey, bestSlot)
        }
      }
    } catch (e) {
      console.warn(`[balanceOverrides] slot discovery failed for ${token}:`, e)
    }
  }

  return applySpecialCasing(stateOverride)
}
