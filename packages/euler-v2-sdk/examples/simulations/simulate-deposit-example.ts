/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULATE DEPOSIT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Demonstrates simulating a vault deposit WITHOUT needing:
 *   - A private key or wallet
 *   - Token balances in the account
 *   - Whale transfers or Anvil impersonation
 *
 * Uses state overrides to inject the required token balance and approvals,
 * then simulates via EVC's batchSimulation to verify the deposit succeeds
 * and read back the resulting vault share balance.
 *
 * OPERATION:
 *   - Simulate depositing 1000 USDC into Euler Prime USDC Vault
 *   - Enable as collateral
 *   - Read vault shares balance after deposit
 *
 * REQUIREMENTS:
 *   - An RPC endpoint that supports debug_traceCall (Alchemy, Infura, local node)
 *   - Set RPC_URL_1 env var, or default to local Anvil (http://127.0.0.1:8545)
 *
 * RUN:
 *   npx tsx examples/simulations/simulate-deposit-example.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config"
import {
  createPublicClient,
  http,
  parseUnits,
  erc20Abi,
  encodeFunctionData,
  decodeFunctionResult,
  formatUnits,
  getAddress,
} from "viem"
import { mainnet } from "viem/chains"
import {
  buildEulerSDK,
  getSubAccountAddress,
  getStateOverrides,
  ethereumVaultConnectorAbi,
  type EVCBatchItem,
  type EVCBatchItems,
} from "euler-v2-sdk"

import { getRpcUrls } from "../utils/config.js"

// ─── Configuration ───────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL_1 || "http://127.0.0.1:8545"

// Any address — doesn't need to hold any tokens
const TEST_ADDRESS = getAddress("0x000000000000000000000000000000000000dEaD")
const SUB_ACCOUNT_ID = 0
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(TEST_ADDRESS, SUB_ACCOUNT_ID)

const USDC = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
const EULER_PRIME_USDC_VAULT = getAddress("0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9")
const DEPOSIT_AMOUNT = parseUnits("1000", 6) // 1000 USDC

// ─── Main ────────────────────────────────────────────────────────────────────

async function simulateDeposit() {
  const rpcUrls = { ...getRpcUrls(), [mainnet.id]: RPC_URL }
  const client = createPublicClient({ chain: mainnet, transport: http(RPC_URL) })
  const sdk = await buildEulerSDK({ rpcUrls })

  const deployment = sdk.deploymentService.getDeployment(mainnet.id)
  const evcAddress = deployment.addresses.coreAddrs.evc

  console.log(`Account:      ${TEST_ADDRESS}`)
  console.log(`Sub-account:  ${SUB_ACCOUNT_ADDRESS}`)
  console.log(`Deposit:      ${formatUnits(DEPOSIT_AMOUNT, 6)} USDC -> Euler Prime USDC Vault\n`)

  // 1. Fetch account state (will have no positions — that's fine)
  const accountData = await sdk.accountService.fetchAccount(
    mainnet.id,
    TEST_ADDRESS,
    { populateVaults: false },
  )

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

  // 3. Generate state overrides — injects token balance + approvals for TEST_ADDRESS
  const stateOverride = await getStateOverrides(client, plan, TEST_ADDRESS, {
    permit2Address: deployment.addresses.coreAddrs.permit2,
  })
  console.log(`State overrides: ${stateOverride.length} contract(s) overridden`)

  // 4. Extract EVC batch items from the plan (skip RequiredApprovals — state overrides handle them)
  const batchItems: EVCBatchItem[] = plan
    .filter((item): item is EVCBatchItems => item.type === "evcBatch")
    .flatMap((item) => item.items)

  // 5. Append a balanceOf call to read vault shares after the deposit
  batchItems.push({
    targetContract: EULER_PRIME_USDC_VAULT,
    onBehalfOfAccount: SUB_ACCOUNT_ADDRESS,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [SUB_ACCOUNT_ADDRESS],
    }),
  })

  console.log(`\nSimulating ${batchItems.length} batch item(s) via EVC batchSimulation...\n`)

  // 6. Simulate using EVC batchSimulation with state overrides
  const { result } = await client.simulateContract({
    address: evcAddress,
    abi: ethereumVaultConnectorAbi,
    functionName: "batchSimulation",
    args: [batchItems.map(item => ({
      targetContract: item.targetContract,
      onBehalfOfAccount: item.onBehalfOfAccount,
      value: item.value,
      data: item.data,
    }))],
    account: TEST_ADDRESS,
    stateOverride,
  })

  // 7. Parse results
  const [batchResults, accountChecks, vaultChecks] = result

  // Log each batch item result
  const descriptions = sdk.executionService.describeBatch(batchItems)
  for (let i = 0; i < batchResults.length; i++) {
    const r = batchResults[i]!
    const desc = descriptions[i]
    const label = desc ? desc.functionName : `item ${i}`
    console.log(`  ${i + 1}. ${label}: ${r.success ? "OK" : "FAILED"}`)
  }

  // Log status checks
  for (const check of accountChecks) {
    console.log(`  Account check ${check.checkedAddress}: ${check.isValid ? "valid" : "INVALID"}`)
  }
  for (const check of vaultChecks) {
    console.log(`  Vault check ${check.checkedAddress}: ${check.isValid ? "valid" : "INVALID"}`)
  }

  // 8. Decode balanceOf result (last batch item)
  const balanceOfResult = batchResults[batchResults.length - 1]!
  if (balanceOfResult.success) {
    const shares = decodeFunctionResult({
      abi: erc20Abi,
      functionName: "balanceOf",
      data: balanceOfResult.result,
    })
    console.log(`\nVault shares after deposit: ${formatUnits(shares, 6)}`)
    console.log("Simulation successful - deposit would work for this account")
  } else {
    console.error("\nbalanceOf call failed:", balanceOfResult.result)
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
