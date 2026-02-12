/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRANSFER EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to transfer vault shares between two sub-accounts
 * owned by the same wallet. This is useful for reorganizing positions across
 * different sub-accounts.
 * 
 * OPERATION:
 *   1. Deposit USDC into sub-account 1
 *   2. Transfer vault shares from sub-account 1 to sub-account 2
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault
 * 
 * 💡 TIP - SUB-ACCOUNTS:
 *   • Sub-accounts are isolated positions under your main account
 *   • Each sub-account has its own collateral and debt positions
 *   • Transferring shares between sub-accounts can help with position management
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
  getAddress,
} from "viem";
import { mainnet } from "viem/chains";

import { executePlan } from "../utils/executor.js";
import { printHeader, logOperationResult } from "../utils/helpers.js";
import { rpcUrls, account, initBalances, USDC_ADDRESS, EULER_PRIME_USDC_VAULT } from "../utils/config.js";
import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("100", 6);    // 100 USDC
const TRANSFER_AMOUNT = parseUnits("50", 6);    // Transfer 50 shares
const SUB_ACCOUNT_FROM_ID = 1;
const SUB_ACCOUNT_TO_ID = 2;
const SUB_ACCOUNT_FROM_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_FROM_ID);
const SUB_ACCOUNT_TO_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_TO_ID);
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

async function transferExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount depends on indexing for sub-account discovery,
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address, { resolveVaults: false });

  // Step 1: Deposit USDC into sub-account 1
  console.log('\n=== Step 1: Deposit USDC into Sub-Account 1 ===');
  let depositPlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDC_VAULT,
    amount: DEPOSIT_AMOUNT,
    receiver: SUB_ACCOUNT_FROM_ADDRESS,
    account: accountData,
    asset: USDC_ADDRESS,
    enableCollateral: true,
  });
console.log(getAddress("0x5D2528A9AE093A20e379f27927Ff421CAA47A32"));
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
  const subAccountFromAfterDeposit = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_FROM_ADDRESS,
    [EULER_PRIME_USDC_VAULT],
    { resolveVaults: false }
  );
  const subAccountToAfterDeposit = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_TO_ADDRESS,
    [EULER_PRIME_USDC_VAULT],
    { resolveVaults: false }
  );
  
  // Log the diff between before and after deposit
  await logOperationResult(mainnet.id, accountData, [subAccountFromAfterDeposit, subAccountToAfterDeposit], sdk);

  // Step 2: Transfer shares from sub-account 1 to sub-account 2
  console.log('\n=== Step 2: Transfer Shares from Sub-Account 1 to Sub-Account 2 ===');
  
  // Update account data with the fetched sub-accounts
  accountData.updateSubAccounts(subAccountFromAfterDeposit!, subAccountToAfterDeposit!);

  let transferPlan = sdk.executionService.planTransfer({
    account: accountData,
    vault: EULER_PRIME_USDC_VAULT,
    from: SUB_ACCOUNT_FROM_ADDRESS,
    to: SUB_ACCOUNT_TO_ADDRESS,
    amount: TRANSFER_AMOUNT,
    enableCollateralTo: true,
    disableCollateralFrom: true,
  });

  // console.log(sdk.executionService.describeBatch(transferPlan.find((item) => item.type === 'evcBatch')?.items));
// process.exit(0);
  console.log(`✓ Transfer plan created with ${transferPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for transfer
  await executePlan(transferPlan, sdk);

  // Fetch the updated sub-accounts and log the result
  const subAccount1AfterTransfer = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_FROM_ADDRESS,
    [EULER_PRIME_USDC_VAULT],
    { resolveVaults: false }
  );
  const subAccount2AfterTransfer = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_TO_ADDRESS,
    [EULER_PRIME_USDC_VAULT],
    { resolveVaults: false }
  );

  // Log the diff between before and after transfer
  await logOperationResult(mainnet.id, accountData, [subAccount1AfterTransfer, subAccount2AfterTransfer], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("TRANSFER EXAMPLE");
initBalances().then(() => transferExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
