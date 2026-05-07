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
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/transfer-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
  } from "viem";
  import { mainnet } from "viem/chains";
  import { fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import { account, initExample, USDC_ADDRESS, EULER_PRIME_USDC_VAULT,
  exampleExecutionCallbacks,
} from "../utils/config.js";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("100", 6);    // 100 USDC
const TRANSFER_AMOUNT = parseUnits("50", 6);    // Transfer 50 shares
const SUB_ACCOUNT_FROM_ID = 1;
const SUB_ACCOUNT_TO_ID = 2;
const SUB_ACCOUNT_FROM_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_FROM_ID);
const SUB_ACCOUNT_TO_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_TO_ID);

async function transferExample({ walletClient }: Awaited<ReturnType<typeof initExample>>) {
  // Build the SDK
  const sdk = await buildEulerSDK({
    accountServiceConfig: { adapter: "onchain" },
    queryCacheConfig: { enabled: false },
  });

  // Fetch the account. NOTE: fetchAccount depends on indexing for sub-account discovery,
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

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
  console.log(`✓ Deposit plan created with ${depositPlan.length} step(s)`);


  console.log(`✓ Executing...`);
  await sdk.executionService.executeTransactionPlan({
    plan: depositPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  const [subAccountFromAfterDeposit] = await fetchAndLogSubAccounts(
    mainnet.id,
    accountData,
    sdk,
    [
      { account: SUB_ACCOUNT_FROM_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] },
      { account: SUB_ACCOUNT_TO_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] },
    ],
  );

  // Step 2: Transfer shares from sub-account 1 to sub-account 2
  console.log('\n=== Step 2: Transfer Shares from Sub-Account 1 to Sub-Account 2 ===');

  // Update account data with the fetched sub-accounts
  accountData.updateSubAccounts(subAccountFromAfterDeposit!);

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
  await sdk.executionService.executeTransactionPlan({
    plan: transferPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
    { account: SUB_ACCOUNT_FROM_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] },
    { account: SUB_ACCOUNT_TO_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] },
  ]);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("TRANSFER EXAMPLE");
initExample().then(transferExample).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
