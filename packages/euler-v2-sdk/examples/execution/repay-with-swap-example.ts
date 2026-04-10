/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPAY WITH SWAP EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to repay debt by swapping collateral assets.
 * It first sets up a leveraged position, then repays the debt by withdrawing
 * collateral and swapping it to the liability asset.
 * 
 * OPERATION:
 *   1. Deposit USDC as collateral and borrow USDT
 *   2. Withdraw USDC from collateral
 *   3. Swap USDC → USDT (using live DEX aggregator quotes)
 *   4. Repay USDT debt
 *   5. Disable controller if debt is fully repaid
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral)
 *   • USDT → Euler Prime USDT Vault (liability being repaid)
 * 
 * ⚠️  IMPORTANT - LIVE SWAP QUOTES:
 *   • This example fetches real-time swap quotes from DEX aggregators
 *   • Restart Anvil immediately before running to avoid stale blockchain state
 *   • If the swap fails, try changing REPAY_QUOTE_INDEX to use a different provider
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/repay-with-swap-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
  isAddressEqual,
  getAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { buildEulerSDK, getSubAccountAddress, SwapperMode } from "euler-v2-sdk";

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

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const REPAY_AMOUNT = parseUnits("250", 6);       // Set to -1n to repay all debt
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const REPAY_QUOTE_INDEX = 1; // Change this if swap quote is bad
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

// TODO add exact input repay example

async function repayWithSwapExample() {
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

  // Fetch updated sub-account after borrow (subgraph not available on local fork)
  const subAccountAfterBorrow = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;
  
  // Log the diff between before and after borrow
  await logOperationResult(mainnet.id, accountData, [subAccountAfterBorrow], sdk);

  // Step 2: Get repay quote - swap USDC collateral to USDT to repay debt
  console.log('\n=== Step 2: Get Repay Quote ===');
  console.log('✓ Fetching swap quote from USDC to USDT for repayment...');
  
  // Get current debt from position
  const usdtPosition = subAccountAfterBorrow!.positions.find(p => isAddressEqual(p.vaultAddress, EULER_PRIME_USDT_VAULT));
  const currentDebt = usdtPosition?.borrowed ?? 0n;
  if (currentDebt === 0n) {
    throw new Error("No debt found to repay");
  }

  // Update account data with the fetched sub-account
  accountData.subAccounts = { [getAddress(subAccountAfterBorrow!.account)]: subAccountAfterBorrow! };

  const repayQuotes = await sdk.swapService.fetchRepayQuotes({
    chainId: mainnet.id,
    fromVault: EULER_PRIME_USDC_VAULT,
    fromAsset: USDC_ADDRESS,
    fromAccount: SUB_ACCOUNT_ADDRESS,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAsset: USDT_ADDRESS,
    liabilityAmount: REPAY_AMOUNT === -1n ? currentDebt : REPAY_AMOUNT,
    currentDebt,
    toAccount: SUB_ACCOUNT_ADDRESS,
    origin: account.address,
    swapperMode: SwapperMode.TARGET_DEBT,
    slippage: 0.5, // 0.5% slippage
    deadline: THIRTY_MINUTES_FROM_NOW,
  });

  const filteredRepayQuotes = repayQuotes.filter(q => !q.route.some(r => r.providerName.includes("CoW")));

  if (filteredRepayQuotes.length === 0) {
    throw new Error("No swap quotes available");
  }

  if (REPAY_QUOTE_INDEX >= filteredRepayQuotes.length) {
    throw new Error("No quote found at index: " + REPAY_QUOTE_INDEX);
  }

  const repayQuote = filteredRepayQuotes[REPAY_QUOTE_INDEX]!;
  console.log(`✓ Trying repay quote received: ${repayQuote.amountIn} USDC → ${repayQuote.amountOut} USDT ${repayQuote.route.map(r => r.providerName).join(' → ')}`);

  // Step 3: Plan and execute repay with swap
  console.log('\n=== Step 3: Execute Repay with Swap ===');
  let repaySwapPlan = sdk.executionService.planRepayWithSwap({
    account: accountData,
    swapQuote: repayQuote,
  });

  console.log(`✓ Repay with swap plan created with ${repaySwapPlan.length} step(s)`);

  // no approvals are needed for repay with swap
  try {
    await executePlan(repaySwapPlan, sdk);
  } catch (error) {
    console.error("Error executing repay with swap:", error);
    console.log("\n\nThe swap quote might be bad. Try setting REPAY_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

  // Fetch the updated sub-account and log the result
  const subAccountAfterRepay = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;

  // Log the diff between before and after repay
  // Note: accountData already has subAccountAfterBorrow in its subAccounts object
  await logOperationResult(mainnet.id, accountData, [subAccountAfterRepay], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("REPAY WITH SWAP EXAMPLE");
initBalances().then(() => repayWithSwapExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
