/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULATE DEPOSIT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Demonstrates simulating a vault deposit WITHOUT needing:
 *   - A private key or wallet
 *   - Token balances in the account
 *   - Prior token approvals
 *
 * Uses SimulationService + automatic state overrides to simulate a deposit.
 *
 * OPERATION:
 *   - Simulate depositing 1000 USDC into Euler Prime USDC Vault
 *   - Enable as collateral
 *
 * REQUIREMENTS:
 *   - An RPC endpoint that supports eth_createAccessList (all major providers)
 *   - Set RPC_URL_1 env var, or default to local Anvil (http://127.0.0.1:8545)
 *
 * RUN:
 *   npx tsx simulations/simulate-deposit-example.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config"
import {
  parseUnits,
  formatUnits,
  getAddress,
  stringify,
} from "viem"
import { mainnet } from "viem/chains"
import {
  buildEulerSDK,
  getSubAccountAddress,
} from "euler-v2-sdk"

import { getRpcUrls } from "../utils/config.js"

// Any address — doesn't need to hold any tokens
const TEST_ADDRESS = getAddress("0x0000000000000000000000000000000000001234")
const SUB_ACCOUNT_ID = 0
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(TEST_ADDRESS, SUB_ACCOUNT_ID)

const USDC = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
const EULER_PRIME_USDC_VAULT = getAddress("0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9")
const DEPOSIT_AMOUNT = parseUnits("1000", 6) // 1000 USDC

// ─── Main ────────────────────────────────────────────────────────────────────

async function simulateDeposit() {
  const sdk = await buildEulerSDK({ rpcUrls: getRpcUrls() })

  console.log(`Account:      ${TEST_ADDRESS}`)
  console.log(`Sub-account:  ${SUB_ACCOUNT_ADDRESS}`)
  console.log(`Deposit:      ${formatUnits(DEPOSIT_AMOUNT, 6)} USDC -> Euler Prime USDC Vault\n`)

  // 1. Fetch account state (will have no positions — that's fine)
  const accountData = (await sdk.accountService.fetchAccount(
    mainnet.id,
    TEST_ADDRESS,
  )).result

  // 2. Create deposit plan
  const plan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDC_VAULT,
    amount: DEPOSIT_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    account: accountData,
    asset: USDC,
    enableCollateral: true,
  })
  console.log(`Plan created: ${plan.length} item(s)`)

  console.log(`\nSimulating transaction plan via SimulationService...\n`)

  // 3. Simulate full transaction plan.
  // stateOverrides:true injects required balances/approvals automatically.
  const simulation = await sdk.simulationService.simulateTransactionPlan(
    mainnet.id,
    TEST_ADDRESS,
    plan,
    { stateOverrides: true }, // default is true
  )

  if (simulation.simulationError) {
    console.error("Simulation failed")
    console.error(simulation.simulationError.decoded)
    return
  }

  if (simulation.rawBatchResults?.length) {
    console.log("\nRaw batch results (plan only):")
    simulation.rawBatchResults.forEach((item, index) => {
      console.log(`  #${index + 1} success=${item.success} result=${item.result}`)
    })
  }

  if (simulation.failedBatchItems?.length) {
    console.log("\nFailed batch items:")
    for (const failed of simulation.failedBatchItems) {
      console.log(`  #${failed.index + 1} ${failed.item.functionName}`)
      console.log(`    target: ${failed.item.targetContract}`)
      console.log(`    onBehalfOf: ${failed.item.onBehalfOfAccount}`)
      console.log(`    error: ${failed.error}`)
      if (failed.decodedError.length) {
        console.log(`    decoded: ${stringify(failed.decodedError, null, 2)}`)
      }
    }
  }

  for (const check of simulation.accountStatusErrors ?? []) {
    console.log(`  Account check ${check.account}: INVALID`)
  }
  for (const check of simulation.vaultStatusErrors ?? []) {
    console.log(`  Vault check ${check.vault}: INVALID`)
  }

  if (simulation.insufficientWalletAssets?.length) {
    console.log("\nWallet insufficiencies detected:")
    for (const req of simulation.insufficientWalletAssets) {
      console.log(`  - ${req.token}: ${req.amount.toString()}`)
    }
  }
  if (simulation.insufficientPermit2Allowances?.length) {
    console.log("\nPermit2 allowance insufficiencies detected:")
    for (const req of simulation.insufficientPermit2Allowances) {
      console.log(`  - ${req.token}: ${req.amount.toString()}`)
    }
  }
  if (simulation.insufficientDirectAllowances?.length) {
    console.log("\nDirect allowance insufficiencies detected:")
    for (const req of simulation.insufficientDirectAllowances) {
      console.log(`  - ${req.token}: ${req.amount.toString()}`)
    }
  }

  const simulatedAccount = simulation.simulatedAccounts[0]
  const simulatedSub = simulatedAccount?.getSubAccount(SUB_ACCOUNT_ADDRESS)
  const simulatedPosition = simulatedSub?.positions.find(
    (p) => p.vaultAddress.toLowerCase() === EULER_PRIME_USDC_VAULT.toLowerCase(),
  )
  const simulatedShares = simulatedPosition?.shares ?? 0n

  console.log(`\nVault shares after deposit: ${formatUnits(simulatedShares, 6)}\n`)
  if (simulation.canExecute) {
    console.log("Deposit would work for this account.")
  } else {
    console.log("Deposit would not work for this account.")
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

console.log("=".repeat(80))
console.log("SIMULATE DEPOSIT EXAMPLE")
console.log("=".repeat(80))
console.log()

simulateDeposit().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
