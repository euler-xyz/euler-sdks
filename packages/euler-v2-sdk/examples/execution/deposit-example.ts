/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEPOSIT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates how to deposit assets into an Euler vault and
 * enable them as collateral in a single transaction.
 *
 * OPERATION:
 *   • Deposit USDC into Euler Prime USDC Vault
 *   • Enable USDC as collateral for the sub-account
 *
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral enabled)
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/deposit-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
  } from "viem";
  import { mainnet } from "viem/chains";
  import { printHeader, logOperationResult } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  rpcUrls,
  account,
  initExample,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  exampleExecutionCallbacks,
} from "../utils/config.js";
import { Account, buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("10", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const ENABLE_COLLATERAL = true;

async function depositExample({ walletClient }: Awaited<ReturnType<typeof initExample>>) {
  // Build the SDK
  const sdk = await buildEulerSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery,
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // Plan the deposit
  let depositPlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDC_VAULT,
    amount: DEPOSIT_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    account: accountData,
    asset: USDC_ADDRESS,
    enableCollateral: ENABLE_COLLATERAL,
  });

  console.log(`\n✓ Deposit plan created with ${depositPlan.length} step(s)`);


  console.log(`✓ Executing...`);

  // Execute the plan
  await sdk.executionService.executeTransactionPlan({
    plan: depositPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  // Fetch the updated sub-account and log the result
  // In tests the new sub-account will not be indexed by subgraph, so we need to fetch it manually
  const subAccount = (await sdk.accountService.fetchSubAccount(mainnet.id, SUB_ACCOUNT_ADDRESS, [EULER_PRIME_USDC_VAULT], { populateVaults: false })).result;

  // Log the diff between before and after
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("DEPOSIT EXAMPLE");
initExample().then(depositExample).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
