import {
  type Address,
  type PublicClient,
  type StateOverride,
  getAddress,
  parseEther,
} from "viem"
import type { TransactionPlan, RequiredApproval } from "../../services/executionService/executionServiceTypes.js"
import { getBalanceOverrides } from "./balanceOverrides.js"
import { getApprovalOverrides } from "./approvalOverrides.js"
import { mergeStateOverrides } from "./mergeStateOverrides.js"

export type GetStateOverridesOptions = {
  /** Override the native (ETH) balance. Defaults to 1000 ETH. Set to 0n to skip. */
  nativeBalance?: bigint
  /** Permit2 contract address. Required for approval overrides. */
  permit2Address: Address
}

/**
 * Extract token balance requirements from a TransactionPlan.
 * Each RequiredApproval represents a deposit-like operation where the
 * user needs tokens in their wallet. We take the max amount per token.
 */
function extractBalanceRequirements(
  plan: TransactionPlan,
  account: Address,
): [Address, bigint][] {
  const maxPerToken = new Map<Address, bigint>()

  for (const item of plan) {
    if (item.type !== "requiredApproval") continue
    if (getAddress(item.owner) !== getAddress(account)) continue

    const token = getAddress(item.token)
    const current = maxPerToken.get(token) || 0n
    if (item.amount > current) {
      maxPerToken.set(token, item.amount)
    }
  }

  return Array.from(maxPerToken.entries())
}

/**
 * Extract approval pairs from a TransactionPlan.
 * Returns unique [asset, spender] pairs.
 */
function extractApprovalRequirements(
  plan: TransactionPlan,
  account: Address,
): [Address, Address][] {
  const seen = new Set<string>()
  const approvals: [Address, Address][] = []

  for (const item of plan) {
    if (item.type !== "requiredApproval") continue
    if (getAddress(item.owner) !== getAddress(account)) continue

    const asset = getAddress(item.token)
    const spender = getAddress(item.spender)
    const key = `${asset}:${spender}`
    if (!seen.has(key)) {
      seen.add(key)
      approvals.push([asset, spender])
    }
  }

  return approvals
}

/**
 * Generate all state overrides needed to simulate a TransactionPlan
 * for an account that may not have sufficient tokens or approvals.
 *
 * Combines:
 * - Native balance override (ETH)
 * - ERC20 balance overrides (via storage slot discovery)
 * - ERC20 approval + Permit2 allowance overrides
 *
 * @param client - viem PublicClient (must support eth_createAccessList and eth_call with state overrides)
 * @param plan - TransactionPlan from the SDK's execution service
 * @param account - the connected wallet address
 * @param options - Permit2 address and optional native balance override
 *
 * @example
 * ```ts
 * const plan = sdk.executionService.planDeposit({ ... })
 * const permit2 = sdk.deploymentService.getDeployment(chainId).addresses.coreAddrs.permit2
 * const overrides = await getStateOverrides(client, plan, account, { permit2Address: permit2 })
 * // Use overrides with simulateContract or eth_call
 * ```
 */
export async function getStateOverrides(
  client: PublicClient,
  plan: TransactionPlan,
  account: Address,
  options: GetStateOverridesOptions,
): Promise<StateOverride> {
  const { nativeBalance = parseEther("1000"), permit2Address } = options

  const balanceTokens = extractBalanceRequirements(plan, account)
  const approvalPairs = extractApprovalRequirements(plan, account)

  const [balanceOverrides, approvalOverrides] = await Promise.all([
    getBalanceOverrides(client, account, balanceTokens),
    getApprovalOverrides(client, account, approvalPairs, permit2Address),
  ])

  const allOverrides: StateOverride = []

  // Native balance override
  if (nativeBalance > 0n) {
    allOverrides.push({ address: account, balance: nativeBalance })
  }

  allOverrides.push(...balanceOverrides)
  allOverrides.push(...approvalOverrides)

  return mergeStateOverrides(allOverrides)
}
