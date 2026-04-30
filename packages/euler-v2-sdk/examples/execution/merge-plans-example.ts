/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MERGE PLANS EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates how to merge multiple transaction plans into one
 * and execute them in a single flow. It creates four plans, merges them with
 * mergePlans(), then executes once.
 *
 * OPERATION:
 *   1. (Setup) Initial borrow: deposit USDC collateral and borrow USDT so we have a position
 *   2. Create 4 plans:
 *      - Borrow with collateral: deposit more USDC, borrow more USDT
 *      - Additional deposit of collateral: deposit more USDC to the same sub-account
 *      - Partial repay: repay some USDT from wallet
 *      - Withdraw: withdraw a small amount of USDC collateral to wallet
 *   3. Merge the 4 plans into one (approvals summed per token, EVC batch concatenated)
 *   4. Execute the merged plan in one go
 *
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral)
 *   • USDT → Euler Prime USDT Vault (liability)
 *
 * 💡 mergePlans() sums required approvals for the same (token, owner, spender)
 *    and concatenates all EVC batch items in order.
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/merge-plans-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits } from "viem";
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
  exampleExecutionCallbacks,
} from "../utils/config.js";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
import type { TransactionPlan } from "@eulerxyz/euler-v2-sdk";

// Inputs
const INITIAL_COLLATERAL = parseUnits("1000", 6);   // 1000 USDC (setup)
const INITIAL_BORROW = parseUnits("500", 6);       // 500 USDT (setup)

const EXTRA_COLLATERAL = parseUnits("200", 6);     // Plan 1: deposit 200 more USDC
const EXTRA_BORROW = parseUnits("100", 6);         // Plan 1: borrow 100 more USDT
const ADDITIONAL_DEPOSIT = parseUnits("75", 6);   // Plan 2: additional collateral deposit
const REPAY_AMOUNT = parseUnits("150", 6);        // Plan 3: partial repay 150 USDT
const WITHDRAW_AMOUNT = parseUnits("50", 6);      // Plan 4: withdraw 50 USDC

const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

// TODO use simulations to build account state

async function mergePlansExample({ walletClient }: Awaited<ReturnType<typeof initExample>>) {
  const sdk = await buildEulerSDK({
    rpcUrls,
    accountServiceConfig: { adapter: "onchain" },
    queryCacheConfig: { enabled: false },
  });

  // Fetch account (may have no positions yet)
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // ─── Setup: initial borrow so we have a position for repay/withdraw plans ───
  console.log("\n=== Setup: Initial borrow (deposit USDC + borrow USDT) ===");
  let setupPlan = sdk.executionService.planBorrow({
    account: accountData,
    vault: EULER_PRIME_USDT_VAULT,
    amount: INITIAL_BORROW,
    receiver: account.address,
    borrowAccount: SUB_ACCOUNT_ADDRESS,
    collateral: {
      vault: EULER_PRIME_USDC_VAULT,
      amount: INITIAL_COLLATERAL,
      asset: USDC_ADDRESS,
    },
  });
  await sdk.executionService.executeTransactionPlan({
    plan: setupPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  console.log("✓ Setup complete: position created\n");

  const [subAccount] = await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
    {
      account: SUB_ACCOUNT_ADDRESS,
      vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    },
  ]);
  if (!subAccount) throw new Error("Sub-account not found after setup");
  accountData.updateSubAccounts(subAccount);

  // ─── Create 4 plans ───
  console.log("=== Creating 4 plans ===");

  const plan1: TransactionPlan = sdk.executionService.planBorrow({
    account: accountData,
    vault: EULER_PRIME_USDT_VAULT,
    amount: EXTRA_BORROW,
    receiver: account.address,
    borrowAccount: SUB_ACCOUNT_ADDRESS,
    collateral: {
      vault: EULER_PRIME_USDC_VAULT,
      amount: EXTRA_COLLATERAL,
      asset: USDC_ADDRESS,
    },
  });
  console.log(`  1. Borrow with collateral: +${EXTRA_COLLATERAL} USDC, borrow +${EXTRA_BORROW} USDT`);

  const plan2: TransactionPlan = sdk.executionService.planDeposit({
    account: accountData,
    vault: EULER_PRIME_USDC_VAULT,
    amount: ADDITIONAL_DEPOSIT,
    receiver: SUB_ACCOUNT_ADDRESS,
    asset: USDC_ADDRESS,
    enableCollateral: true,
  });
  console.log(`  2. Additional deposit of collateral: +${ADDITIONAL_DEPOSIT} USDC`);

  const plan3: TransactionPlan = sdk.executionService.planRepayFromWallet({
    account: accountData,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAmount: REPAY_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
  });
  console.log(`  3. Partial repay: ${REPAY_AMOUNT} USDT from wallet`);

  const plan4: TransactionPlan = sdk.executionService.planWithdraw({
    account: accountData,
    vault: EULER_PRIME_USDC_VAULT,
    assets: WITHDRAW_AMOUNT,
    owner: SUB_ACCOUNT_ADDRESS,
    receiver: account.address,
    disableCollateral: false,
  });
  console.log(`  4. Withdraw: ${WITHDRAW_AMOUNT} USDC to wallet`);

  // ─── Merge and execute ───
  console.log("\n=== Merging plans and executing ===");
  const merged = sdk.executionService.mergePlans([plan1, plan2, plan3, plan4]);
  console.log(`✓ Merged plan has ${merged.length} item(s)`);

  console.log("✓ Executing merged plan...\n");
  await sdk.executionService.executeTransactionPlan({
    plan: merged,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
    {
      account: SUB_ACCOUNT_ADDRESS,
      vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    },
  ]);
}

printHeader("MERGE PLANS EXAMPLE");
initExample().then(mergePlansExample)
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
