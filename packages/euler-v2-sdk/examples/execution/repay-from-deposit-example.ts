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
  maxUint256,
  } from "viem";
  import { mainnet } from "viem/chains";
  import { fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  rpcUrls,
  account,
  initExample,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_USDT_VAULT,
  USDT_ADDRESS,
  exampleExecutionCallbacks,
} from "../utils/config.js";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const DEPOSIT_USDT_AMOUNT = parseUnits("3000", 6); // 3000 USDT deposit
const REPAY_AMOUNT = parseUnits("250", 6);       // 250 USDT (partial repayment)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

async function repayFromDepositExample({ walletClient }: Awaited<ReturnType<typeof initExample>>) {
  // Build the SDK
  const sdk = await buildEulerSDK({
    rpcUrls,
    accountServiceConfig: { adapter: "onchain" },
    queryCacheConfig: { enabled: false },
  });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery,
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;
  const subAccountRequest = {
    account: SUB_ACCOUNT_ADDRESS,
    vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
  } as const;

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


  console.log(`✓ Executing...`);
  await sdk.executionService.executeTransactionPlan({
    plan: borrowPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  let [subAccount] = await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [subAccountRequest]);

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


  console.log(`✓ Executing...`);
  await sdk.executionService.executeTransactionPlan({
    plan: depositPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  [subAccount] = await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [subAccountRequest]);

  // Step 3: Partial repay debt from deposit
  console.log('\n=== Step 3: Partially Repay USDT Debt from USDT Deposit ===');

  // Update account data
  accountData.updateSubAccounts(subAccount!);

  let repayPlan = sdk.executionService.planRepayFromDeposit({
    account: accountData,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAmount: REPAY_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    fromVault: EULER_PRIME_USDT_VAULT,
    fromAccount: SUB_ACCOUNT_ADDRESS,
    cleanupOnMax: true,
  });

  console.log(`✓ Repay from deposit plan created with ${repayPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for repay from deposit
  await sdk.executionService.executeTransactionPlan({
    plan: repayPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  [subAccount] = await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [subAccountRequest]);

  // Step 4: Full repay remaining debt from deposit with cleanup enabled
  console.log('\n=== Step 4: Fully Repay Remaining USDT Debt from USDT Deposit ===');

  accountData.updateSubAccounts(subAccount!);

  const fullRepayPlan = sdk.executionService.planRepayFromDeposit({
    account: accountData,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAmount: maxUint256,
    receiver: SUB_ACCOUNT_ADDRESS,
    fromVault: EULER_PRIME_USDT_VAULT,
    fromAccount: SUB_ACCOUNT_ADDRESS,
    cleanupOnMax: true,
  });

  console.log(`✓ Full repay from deposit plan created with ${fullRepayPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  await sdk.executionService.executeTransactionPlan({

    plan: fullRepayPlan,

    chainId: mainnet.id,

    account: walletAccountAddress(walletClient),

    ...exampleExecutionCallbacks(walletClient),

    onProgress: createTransactionPlanLogger(sdk),

  });
  [subAccount] = await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [subAccountRequest]);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("REPAY FROM DEPOSIT EXAMPLE");
initExample().then(repayFromDepositExample).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
