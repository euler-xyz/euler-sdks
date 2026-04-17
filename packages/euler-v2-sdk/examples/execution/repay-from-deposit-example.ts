/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPAY FROM DEPOSIT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to repay debt by withdrawing assets from a vault
 * deposit. It first creates positions in two vaults (one with debt, one with deposit),
 * then repays the debt by withdrawing from the deposit vault.
 * 
 * OPERATION:
 *   1. Deposit USDC as collateral and borrow USDT
 *   2. Deposit USDT into a separate USDT vault position
 *   3. Repay USDT debt by withdrawing from the USDT deposit
 *   4. Disable controller if debt is fully repaid
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral)
 *   • USDT → Euler Prime USDT Vault (both deposit and liability)
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/repay-from-deposit-example.ts
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
  USDT_ADDRESS,
} from "../utils/config.js";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const DEPOSIT_USDT_AMOUNT = parseUnits("3000", 6); // 300 USDT deposit
const REPAY_AMOUNT = parseUnits("250", 6);       // 250 USDT (partial repayment)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

async function repayFromDepositExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // Step 1: Plan and execute borrow operation (deposit USDC collateral and borrow USDT)
  console.log('\n=== Step 1: Deposit USDC and Borrow USDT ===');
  let borrowPlan = sdk.executionService.planBorrow({
    account: accountData,
    vault: EULER_PRIME_USDT_VAULT,
    amount: BORROW_AMOUNT,
    receiver: account.address,
    borrowAccount: SUB_ACCOUNT_ADDRESS,
    collateral: {
      vault: EULER_PRIME_USDC_VAULT,
      amount: COLLATERAL_AMOUNT,
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

  // Fetch updated sub-account after borrow
  let subAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;

  // Log the diff between before and after borrow
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);

  // Step 2: Deposit USDT to create a deposit position
  console.log('\n=== Step 2: Deposit USDT ===');

  // Update account data with the fetched sub-account
  accountData.updateSubAccounts(subAccount!);

  let depositPlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDT_VAULT,
    amount: DEPOSIT_USDT_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    account: accountData,
    asset: USDT_ADDRESS,
    enableCollateral: false,
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
  subAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;
  
  // Log the diff
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);

  // Step 3: Repay debt from deposit
  console.log('\n=== Step 3: Repay USDT Debt from USDT Deposit ===');
  
  // Update account data
  accountData.updateSubAccounts(subAccount!);

  let repayPlan = sdk.executionService.planRepayFromDeposit({
    account: accountData,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAmount: REPAY_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    fromVault: EULER_PRIME_USDT_VAULT,
    fromAccount: SUB_ACCOUNT_ADDRESS,
  });

  console.log(`✓ Repay from deposit plan created with ${repayPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for repay from deposit
  await executePlan(repayPlan, sdk);

  // Fetch the updated sub-account and log the result
  subAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;

  // Log the diff between before and after repay
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("REPAY FROM DEPOSIT EXAMPLE");
initBalances().then(() => repayFromDepositExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
