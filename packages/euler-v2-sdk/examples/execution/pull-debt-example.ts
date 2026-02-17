/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PULL DEBT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to transfer debt from one sub-account to another.
 * This is useful for consolidating debt positions or moving debt to a sub-account
 * with more collateral.
 * 
 * OPERATION:
 *   1. Create debt position in sub-account 1 (deposit USDC, borrow USDT)
 *   2. Deposit additional USDC collateral into sub-account 2
 *   3. Pull (transfer) debt from sub-account 1 to sub-account 2
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral in both sub-accounts)
 *   • USDT → Euler Prime USDT Vault (debt transferred between sub-accounts)
 * 
 * 💡 TIP - REQUIREMENTS:
 *   • The receiving sub-account must have sufficient collateral
 *   • The debt vault must be enabled as a controller on the receiving account
 *   • Both accounts must remain healthy after the transfer
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx examples/execution/pull-debt-example.ts
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
import { 
  rpcUrls,
  account,
  initBalances,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_USDT_VAULT,
} from "../utils/config.js";
import { buildEulerSDK, getSubAccountAddress } from "euler-v2-sdk";

// Inputs
const COLLATERAL_AMOUNT_1 = parseUnits("1000", 6); // 1000 USDC for sub-account 1
const COLLATERAL_AMOUNT_2 = parseUnits("2000", 6); // 2000 USDC for sub-account 2
const BORROW_AMOUNT = parseUnits("500", 6);        // 500 USDT debt
const PULL_DEBT_AMOUNT = parseUnits("250", 6);     // Pull 250 USDT debt
const SUB_ACCOUNT_1_ID = 1;
const SUB_ACCOUNT_2_ID = 2;
const SUB_ACCOUNT_1_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_1_ID);
const SUB_ACCOUNT_2_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_2_ID);
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

async function pullDebtExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false });

  // Step 1: Create debt position in sub-account 1
  console.log('\n=== Step 1: Create Debt Position in Sub-Account 1 ===');
  let borrowPlan = sdk.executionService.planBorrow({
    account: accountData,
    vault: EULER_PRIME_USDT_VAULT,
    amount: BORROW_AMOUNT,
    receiver: account.address,
    borrowAccount: SUB_ACCOUNT_1_ADDRESS,
    collateral: {
      vault: EULER_PRIME_USDC_VAULT,
      amount: COLLATERAL_AMOUNT_1,
      asset: USDC_ADDRESS,
    },
  });

  console.log(`✓ Borrow plan created with ${borrowPlan.length} step(s)`);

  // Resolve approvals (fetches wallet data internally)
  borrowPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: borrowPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });

  console.log(`✓ Approvals resolved, executing...`);
  await executePlan(borrowPlan, sdk);

  // Fetch updated sub-accounts after borrow
  let subAccount1 = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_1_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  );
  let subAccount2 = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_2_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  );

  // Log the diff between before and after borrow
  await logOperationResult(mainnet.id, accountData, [subAccount1, subAccount2], sdk);

  // Step 2: Deposit collateral into sub-account 2
  console.log('\n=== Step 2: Deposit Collateral into Sub-Account 2 ===');

  // Update account data with the fetched sub-accounts
  accountData.updateSubAccounts(subAccount1!, subAccount2!);

  let depositPlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDC_VAULT,
    amount: COLLATERAL_AMOUNT_2,
    receiver: SUB_ACCOUNT_2_ADDRESS,
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

  // Fetch updated sub-accounts after deposit
  subAccount1 = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_1_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  );
  subAccount2 = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_2_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  );
  
  // Log the diff
  await logOperationResult(mainnet.id, accountData, [subAccount1, subAccount2], sdk);

  // Step 3: Pull debt from sub-account 1 to sub-account 2
  console.log('\n=== Step 3: Pull Debt from Sub-Account 1 to Sub-Account 2 ===');
  
  // Update account data
  accountData.updateSubAccounts(subAccount1!, subAccount2!);

  let pullDebtPlan = sdk.executionService.planPullDebt({
    account: accountData,
    vault: EULER_PRIME_USDT_VAULT,
    from: SUB_ACCOUNT_1_ADDRESS,
    to: SUB_ACCOUNT_2_ADDRESS,
    amount: PULL_DEBT_AMOUNT,
  });

  console.log(`✓ Pull debt plan created with ${pullDebtPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for pull debt
  await executePlan(pullDebtPlan, sdk);

  // Fetch the updated sub-accounts and log the result
  subAccount1 = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_1_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  );
  subAccount2 = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_2_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  );

  // Log the diff between before and after pull debt
  await logOperationResult(mainnet.id, accountData, [subAccount1, subAccount2], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("PULL DEBT EXAMPLE");
initBalances().then(() => pullDebtExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
