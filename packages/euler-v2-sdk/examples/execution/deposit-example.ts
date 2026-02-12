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
 * 💡 TIP - USING EXISTING ACCOUNTS:
 *   • Set PRIVATE_KEY in .env to use an existing account on the fork
 *   • Without PRIVATE_KEY, a test account will be created and funded automatically
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";

import { executePlan } from "../utils/executor.js";
import { printHeader, logOperationResult } from "../utils/helpers.js";
import { rpcUrls, account, initBalances, USDC_ADDRESS, EULER_PRIME_USDC_VAULT } from "../utils/config.js";
import { Account, buildSDK, getSubAccountAddress } from "euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("10", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const ENABLE_COLLATERAL = true;
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = true;

async function depositExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address, { resolveVaults: false });

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

  // Resolve approvals (fetches wallet data internally).
  // This would normally be done in the executor logic, e.g. in executePlan, but for illustration we'll do it here.
  depositPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: depositPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });
  
  console.log(`✓ Approvals resolved, executing...`);

  // Execute the plan
  await executePlan(depositPlan, sdk);

  // Fetch the updated sub-account and log the result
  // In tests the new sub-account will not be indexed by subgraph, so we need to fetch it manually
  const subAccount = await sdk.accountService.fetchSubAccount(mainnet.id, SUB_ACCOUNT_ADDRESS, [EULER_PRIME_USDC_VAULT], { resolveVaults: false });
  
  // Log the diff between before and after
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("DEPOSIT EXAMPLE");
initBalances().then(() => depositExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

