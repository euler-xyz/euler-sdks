/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REDEEM EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to redeem vault shares to receive the underlying
 * assets. It first deposits assets to receive shares, then redeems a specific
 * number of shares.
 * 
 * OPERATION:
 *   1. Deposit USDC into Euler Prime USDC Vault to receive shares
 *   2. Redeem specific amount of shares to receive USDC back
 *   3. Optionally disable collateral if redeeming all shares
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral)
 * 
 * 💡 TIP - REDEEM vs WITHDRAW:
 *   • Redeem: You specify the exact number of shares you want to burn
 *   • Withdraw: You specify the exact amount of assets you want to receive
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
import { rpcUrls, account, initBalances, USDC_ADDRESS, EULER_PRIME_USDC_VAULT } from "./utils/config.js";
import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("100", 6);  // 100 USDC
const SHARES_TO_REDEEM = parseUnits("50", 6); // Redeem 50 shares (shares typically have same decimals as underlying)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

async function redeemExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address);

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
  const subAccountAfterDeposit = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT]
  );
  
  // Log the diff between before and after deposit
  await logOperationResult(mainnet.id, accountData, [subAccountAfterDeposit], sdk);

  // Step 2: Redeem shares
  console.log('\n=== Step 2: Redeem Shares ===');
  
  // Update account data with the fetched sub-account
  accountData.subAccounts = [subAccountAfterDeposit!];

  let redeemPlan = sdk.executionService.planRedeem({
    account: accountData,
    vault: EULER_PRIME_USDC_VAULT,
    shares: SHARES_TO_REDEEM,
    owner: SUB_ACCOUNT_ADDRESS,
    receiver: account.address,
  });

  console.log(`✓ Redeem plan created with ${redeemPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for redeem
  await executePlan(redeemPlan, sdk);

  // Fetch the updated sub-account and log the result
  const subAccountAfterRedeem = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT]
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
