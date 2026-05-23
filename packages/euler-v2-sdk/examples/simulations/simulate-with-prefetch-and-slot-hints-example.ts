/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULATE WITH PREFETCH + SLOT HINTS + WALLET SNAPSHOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Performance-tuned simulation flow for UIs that fan out N candidate plans per
 * user interaction (e.g. one plan per swap-quote provider). Three pieces:
 *
 *   1. `fetchErc20SlotHints` once per token — owner-/spender-agnostic, lets the
 *      SDK derive balance/allowance storage slots cryptographically instead of
 *      probing eth_createAccessList on every estimate.
 *   2. `SimulationStateOverrideOptions.wallet` — feed the wallet snapshot the
 *      UI already holds. When a balance covers the plan's requirement, the SDK
 *      emits no override and skips the balanceOf RPC. `noBalanceOverride: true`
 *      goes further: skip the whole balance branch when the UI validated funds
 *      up front.
 *   3. `prefetchPluginDataForPlan` once per sweep — runs Pyth Hermes pull /
 *      Keyring credential check from a single representative plan. Every
 *      subsequent prepare/simulate/estimate accepts the payload and skips
 *      plugin network I/O.
 *
 * REQUIREMENTS:
 *   - EULER_SDK_RPC_URL_1 env var for the mainnet RPC endpoint.
 *
 * RUN:
 *   npx tsx simulations/simulate-with-prefetch-and-slot-hints-example.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config"
import {
  parseUnits,
  formatUnits,
  getAddress,
  maxUint256,
} from "viem"
import { mainnet } from "viem/chains"
import {
  buildEulerSDK,
  createPythPlugin,
  fetchErc20SlotHintsBatch,
  getSubAccountAddress,
  type PluginPrefetchData,
  type SimulationStateOverrideOptions,
  type SlotHints,
} from "@eulerxyz/euler-v2-sdk"

const TEST_ADDRESS = getAddress("0x0000000000000000000000000000000000001234")
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(TEST_ADDRESS, 0)

const USDC = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
const EULER_PRIME_USDC_VAULT = getAddress("0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9")
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3")
const DEPOSIT_AMOUNTS = ["100", "250", "500", "1000", "2500"] // multiple candidate plans

async function main() {
  const sdk = await buildEulerSDK({
    plugins: [createPythPlugin()],
  })

  // The wallet snapshot the UI already holds — pass it to every simulate call
  // so the SDK skips redundant balanceOf reads. `maxUint256` allowance entries
  // similarly let the SDK skip allowance reads.
  const walletSnapshot: SimulationStateOverrideOptions["wallet"] = {
    balances: { [USDC]: parseUnits("10000", 6) },
    allowances: { [`${USDC}:${PERMIT2}`]: maxUint256 },
  }

  // 1. Prime slot hints once per relevant token. Deterministic + immutable;
  // reuse the result across the entire UI session.
  const slotHints: SlotHints = await fetchErc20SlotHintsBatch(
    sdk.providerService.getProvider(mainnet.id),
    [USDC],
    { allowanceSpender: PERMIT2 },
  )

  // 2. Build a representative plan and resolve the plugin prefetch once.
  const account = (await sdk.accountService.fetchAccount(mainnet.id, TEST_ADDRESS)).result
  const representativePlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDC_VAULT,
    amount: parseUnits(DEPOSIT_AMOUNTS[0]!, 6),
    receiver: SUB_ACCOUNT_ADDRESS,
    account,
    asset: USDC,
    enableCollateral: true,
  })

  const prefetch: PluginPrefetchData = await sdk.executionService.prefetchPluginDataForPlan(
    representativePlan,
    account,
    mainnet.id,
  )

  // 3. Fan out — each candidate plan reuses the same prefetch + slot hints +
  // wallet snapshot. Plugins do zero network I/O per candidate; state-override
  // derivation skips access-list discovery.
  for (const amountStr of DEPOSIT_AMOUNTS) {
    const amount = parseUnits(amountStr, 6)
    const plan = sdk.executionService.planDeposit({
      vault: EULER_PRIME_USDC_VAULT,
      amount,
      receiver: SUB_ACCOUNT_ADDRESS,
      account,
      asset: USDC,
      enableCollateral: true,
    })

    const prepared = await sdk.executionService.prepareTransactionPlan({
      plan,
      chainId: mainnet.id,
      account,
      prefetch,
    })

    const stateOverrideOptions: SimulationStateOverrideOptions = {
      // UI already validated balance — skip the entire balance branch.
      noBalanceOverride: true,
      wallet: walletSnapshot,
      slotHints,
    }

    const gas = await sdk.executionService.estimateGasForPreparedTransactionPlan(prepared, {
      stateOverrides: true,
      stateOverrideOptions,
    })

    const simulation = await sdk.executionService.simulatePreparedTransactionPlan(prepared, {
      stateOverrides: true,
      stateOverrideOptions,
    })

    console.log(
      `Deposit ${formatUnits(amount, 6).padStart(6)} USDC: `
      + `gas=${gas.toString().padStart(8)} canExecute=${simulation.canExecute}`,
    )
  }
}

console.log("=".repeat(80))
console.log("SIMULATE WITH PREFETCH + SLOT HINTS + WALLET SNAPSHOT")
console.log("=".repeat(80))
console.log()

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
