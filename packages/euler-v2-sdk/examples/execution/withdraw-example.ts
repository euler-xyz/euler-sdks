/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WITHDRAW EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to withdraw assets from an Euler vault. It first
 * deposits assets, then withdraws a specific amount of the underlying asset.
 * 
 * OPERATION:
 *   1. Deposit USDC into Euler Prime USDC Vault
 *   2. Withdraw specific amount of USDC back to wallet
 *   3. Optionally disable collateral if withdrawing all
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral)
 * 
 * 💡 TIP - WITHDRAW vs REDEEM:
 *   • Withdraw: You specify the exact amount of assets you want to receive
 *   • Redeem: You specify the exact number of shares you want to burn
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/withdraw-example.ts
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

import { executeExampleTransactionPlan, fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
import { rpcUrls, account, initBalances, USDC_ADDRESS, EULER_PRIME_USDC_VAULT } from "../utils/config.js";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("100", 6);  // 100 USDC
const WITHDRAW_AMOUNT = parseUnits("50", 6);  // 50 USDC
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const DISABLE_COLLATERAL = true;
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

async function withdrawExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({
    rpcUrls,
    accountServiceConfig: { adapter: "onchain" },
    queryCacheConfig: { enabled: false },
  });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // Step 1: Deposit USDC first
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
  await executeExampleTransactionPlan(depositPlan, sdk);

  const [subAccountAfterDeposit] = await fetchAndLogSubAccounts(
    mainnet.id,
    accountData,
    sdk,
    [{ account: SUB_ACCOUNT_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] }],
  );

  // Step 2: Withdraw USDC
  console.log('\n=== Step 2: Withdraw USDC ===');
  
  // Update account data with the fetched sub-account
  accountData.updateSubAccounts(subAccountAfterDeposit!);

  let withdrawPlan = sdk.executionService.planWithdraw({
    account: accountData,
    vault: EULER_PRIME_USDC_VAULT,
    assets: WITHDRAW_AMOUNT,
    owner: SUB_ACCOUNT_ADDRESS,
    receiver: account.address,
    disableCollateral: DISABLE_COLLATERAL,
  });

  console.log(`✓ Withdraw plan created with ${withdrawPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for withdraw
  await executeExampleTransactionPlan(withdrawPlan, sdk);

  await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
    { account: SUB_ACCOUNT_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] },
  ]);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("WITHDRAW EXAMPLE");
initBalances().then(() => withdrawExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
