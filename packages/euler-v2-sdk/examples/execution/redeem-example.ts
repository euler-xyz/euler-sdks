/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REDEEM EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to redeem vault shares to receive the underlying
 * assets. It first deposits assets to receive shares, then redeems a specific
 * number of shares.
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx examples/execution/redeem-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
  getAddress,
} from "viem";
import { mainnet } from "viem/chains";

import { executePlan } from "../utils/executor.js";
import { printHeader, logOperationResult } from "../utils/helpers.js";
import { rpcUrls, account, initBalances, USDC_ADDRESS, EULER_PRIME_USDC_VAULT } from "../utils/config.js";
import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("100", 6);  // 100 USDC
const SHARES_TO_REDEEM = parseUnits("50", 6); // Redeem 50 shares (shares typically have same decimals as underlying)
const SUB_ACCOUNT_ID = 2;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;
const DISABLE_COLLATERAL = true;

async function redeemExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false });

  // Step 1: Deposit USDC first to get shares
  console.log('\n=== Step 1: Deposit USDC ===');
  let depositPlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDC_VAULT,
    amount: DEPOSIT_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    account: accountData,
    asset: USDC_ADDRESS,
    enableCollateral: true,
  });

  console.log(`✓ Deposit plan created with ${depositPlan.length} step(s)`);

  // Resolve approvals (fetches wallet data internally)
  depositPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: depositPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });
  
  console.log(`✓ Approvals resolved, executing...`);
  await executePlan(depositPlan, sdk);

  // Fetch updated sub-account after deposit
  const subAccountAfterDeposit = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT],
    { populateVaults: false }
  );
  
  // Log the diff between before and after deposit
  await logOperationResult(mainnet.id, accountData, [subAccountAfterDeposit], sdk);

  // Step 2: Redeem shares
  console.log('\n=== Step 2: Redeem Shares ===');
  
  // Update account data with the fetched sub-account
  accountData.updateSubAccounts(subAccountAfterDeposit!);

  let redeemPlan = sdk.executionService.planRedeem({
    account: accountData,
    vault: EULER_PRIME_USDC_VAULT,
    shares: SHARES_TO_REDEEM,
    owner: SUB_ACCOUNT_ADDRESS,
    receiver: account.address,
    disableCollateral: DISABLE_COLLATERAL,
  });

  console.log(`✓ Redeem plan created with ${redeemPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for redeem
  await executePlan(redeemPlan, sdk);

  // Fetch the updated sub-account and log the result
  const subAccountAfterRedeem = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT],
    { populateVaults: false }
  );

  // Log the diff between before and after redeem
  await logOperationResult(mainnet.id, accountData, [subAccountAfterRedeem], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("REDEEM EXAMPLE");
initBalances().then(() => redeemExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
