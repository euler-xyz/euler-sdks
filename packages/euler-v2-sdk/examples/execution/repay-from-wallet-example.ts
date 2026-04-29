/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPAY FROM WALLET EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to repay debt using assets from your wallet.
 * It first creates a debt position, then repays it using wallet balance.
 * 
 * OPERATION:
 *   1. Deposit USDC as collateral and borrow USDT
 *   2. Partially repay USDT debt using assets from wallet
 *   3. Fully repay remaining USDT debt from wallet and clean up the repaid sub-account
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral)
 *   • USDT → Euler Prime USDT Vault (liability being repaid)
 * 
 * 💡 TIP - REPAYMENT METHODS:
 *   • planRepayFromWallet: Uses assets from your wallet
 *   • planRepayFromDeposit: Withdraws from a vault to repay
 *   • planRepayWithSwap: Swaps collateral to repay
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/repay-from-wallet-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  maxUint256,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";

import { executeExampleTransactionPlan, fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
import { 
  rpcUrls,
  account,
  initBalances,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_USDT_VAULT,
} from "../utils/config.js";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const REPAY_AMOUNT = parseUnits("250", 6);       // 250 USDT (partial repayment)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

async function repayFromWalletExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({
    rpcUrls,
    accountServiceConfig: { adapter: "onchain" },
    queryCacheConfig: { enabled: false },
  });

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
  await executeExampleTransactionPlan(borrowPlan, sdk);

  const [subAccountAfterBorrow] = await fetchAndLogSubAccounts(
    mainnet.id,
    accountData,
    sdk,
    [
      {
        account: SUB_ACCOUNT_ADDRESS,
        vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
      },
    ],
  );

  // Step 2: Repay debt from wallet
  console.log('\n=== Step 2: Partially Repay USDT Debt from Wallet ===');
  
  // Update account data with the fetched sub-account
  accountData.updateSubAccounts(subAccountAfterBorrow!);

  let repayPlan = sdk.executionService.planRepayFromWallet({
    account: accountData,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAmount: REPAY_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
  });

  console.log(`✓ Repay plan created with ${repayPlan.length} step(s)`);

  // Resolve approvals (fetches wallet data internally)
  repayPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: repayPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });

  console.log(`✓ Approvals resolved, executing...`);
  await executeExampleTransactionPlan(repayPlan, sdk);

  const [subAccountAfterRepay] = await fetchAndLogSubAccounts(
    mainnet.id,
    accountData,
    sdk,
    [
      {
        account: SUB_ACCOUNT_ADDRESS,
        vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
      },
    ],
  );

  // Step 3: Fully repay remaining debt and clean up the sub-account
  console.log('\n=== Step 3: Fully Repay USDT Debt from Wallet ===');

  accountData.updateSubAccounts(subAccountAfterRepay!);

  let fullRepayPlan = sdk.executionService.planRepayFromWallet({
    account: accountData,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAmount: maxUint256,
    receiver: SUB_ACCOUNT_ADDRESS,
    cleanupOnMax: true,
  });

  console.log(`✓ Full repay plan created with ${fullRepayPlan.length} step(s)`);

  fullRepayPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: fullRepayPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });

  console.log(`✓ Approvals resolved, executing...`);
  await executeExampleTransactionPlan(fullRepayPlan, sdk);

  await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
    {
      account: SUB_ACCOUNT_ADDRESS,
      vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    },
  ]);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("REPAY FROM WALLET EXAMPLE");
initBalances().then(() => repayFromWalletExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
