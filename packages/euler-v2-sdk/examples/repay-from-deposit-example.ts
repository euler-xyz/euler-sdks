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
 * 💡 TIP - USE CASE:
 *   • This is useful when you have deposits earning yield in the same asset as your debt
 *   • Withdraws from deposit position to repay debt in one transaction
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

import { executePlan } from "./utils/executor.js";
import { printHeader, logOperationResult } from "./utils/helpers.js";
import { 
  rpcUrls,
  account,
  initBalances,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_USDT_VAULT,
  USDT_ADDRESS,
} from "./utils/config.js";
import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const DEPOSIT_USDT_AMOUNT = parseUnits("300", 6); // 300 USDT deposit
const REPAY_AMOUNT = parseUnits("250", 6);       // 250 USDT (partial repayment)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

async function repayFromDepositExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address);

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

  // Fetch wallet data and resolve approvals
  const walletForBorrow = await sdk.walletService.fetchWalletForPlan(mainnet.id, account.address, borrowPlan);
  borrowPlan = sdk.executionService.resolveRequiredApprovals({
    plan: borrowPlan,
    wallet: walletForBorrow,
    chainId: mainnet.id,
    usePermit2: true,
    unlimitedApproval: false,
  });

  console.log(`✓ Approvals resolved, executing...`);
  await executePlan(borrowPlan, sdk);

  // Fetch updated sub-account after borrow
  let subAccount = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
  );
  
  // Log the diff between before and after borrow
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);

  // Step 2: Deposit USDT to create a deposit position
  console.log('\n=== Step 2: Deposit USDT ===');
  
  // Update account data with the fetched sub-account
  accountData.subAccounts = [subAccount!];

  let depositPlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDT_VAULT,
    amount: DEPOSIT_USDT_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    account: accountData,
    asset: USDT_ADDRESS,
    enableCollateral: false,
  });

  console.log(`✓ Deposit plan created with ${depositPlan.length} step(s)`);

  // Fetch wallet data and resolve approvals
  const walletForDeposit = await sdk.walletService.fetchWalletForPlan(mainnet.id, account.address, depositPlan);
  depositPlan = sdk.executionService.resolveRequiredApprovals({
    plan: depositPlan,
    wallet: walletForDeposit,
    chainId: mainnet.id,
    usePermit2: true,
    unlimitedApproval: false,
  });

  console.log(`✓ Approvals resolved, executing...`);
  await executePlan(depositPlan, sdk);

  // Fetch updated sub-account after deposit
  subAccount = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
  );
  
  // Log the diff
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);

  // Step 3: Repay debt from deposit
  console.log('\n=== Step 3: Repay USDT Debt from USDT Deposit ===');
  
  // Update account data
  accountData.subAccounts = [subAccount!];

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
  subAccount = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
  );

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
