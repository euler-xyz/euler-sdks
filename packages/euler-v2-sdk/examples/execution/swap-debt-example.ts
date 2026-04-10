/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SWAP DEBT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to swap one debt asset for another while
 * maintaining your collateral positions. This is useful for refinancing to
 * a lower rate, switching to a more stable debt asset, or rebalancing exposure.
 * 
 * OPERATION:
 *   1. Deposit WETH as collateral
 *   2. Borrow USDT (initial debt)
 *   3. Borrow USDC (new debt)
 *   4. Swap USDC → USDT (using live DEX aggregator quotes)
 *   5. Repay USDT debt with swapped assets
 * 
 * ⚠️  IMPORTANT - LIVE SWAP QUOTES:
 *   • This example fetches real-time swap quotes from DEX aggregators
 *   • Restart Anvil immediately before running to avoid stale blockchain state
 *   • If the swap fails, try changing SWAP_QUOTE_INDEX to use a different provider
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/swap-debt-example.ts
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
  EULER_PRIME_WETH_VAULT,
  EULER_PRIME_USDT_VAULT,
  USDT_ADDRESS,
  WETH_ADDRESS,
  testClient,
} from "../utils/config.js";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("2", 18);   // 2 WETH
const BORROW_USDT_AMOUNT = parseUnits("1000", 6); // 1000 USDT (initial debt)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX = 1; // Change this if swap quote is bad
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

// TODO add example of cross-account swap, including partial swap OR disallow cross-account swap

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

async function swapDebtExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // Step 1: Deposit WETH collateral and borrow USDT
  console.log('\n=== Step 1: Deposit WETH and Borrow USDT ===');
  let borrowPlan = sdk.executionService.planBorrow({
    account: accountData,
    vault: EULER_PRIME_USDT_VAULT,
    amount: BORROW_USDT_AMOUNT,
    receiver: account.address,
    borrowAccount: SUB_ACCOUNT_ADDRESS,
    collateral: {
      vault: EULER_PRIME_WETH_VAULT,
      amount: COLLATERAL_AMOUNT,
      asset: WETH_ADDRESS,
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
    [EULER_PRIME_WETH_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_USDC_VAULT],
    { populateVaults: false }
  )).result;
  
  // Log the diff between before and after borrow
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);

  // Step 2: Get swap quote for debt swap
  console.log('\n=== Step 2: Get Swap Quote ===');
  console.log('✓ Fetching swap quote from USDC to USDT for debt swap...');
  
  // Update account data with the fetched sub-account
  accountData.subAccounts = { [getAddress(subAccount!.account)]: subAccount! };


  const swapQuotes = await sdk.swapService.fetchRepayQuotes({
    chainId: mainnet.id,
    fromVault: EULER_PRIME_USDC_VAULT,
    fromAsset: USDC_ADDRESS,
    fromAccount: SUB_ACCOUNT_ADDRESS,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAsset: USDT_ADDRESS,
    liabilityAmount: BORROW_USDT_AMOUNT,
    currentDebt: BORROW_USDT_AMOUNT,
    toAccount: SUB_ACCOUNT_ADDRESS,
    origin: account.address,
    swapperMode: SwapperMode.TARGET_DEBT,
    slippage: 0.5, // 0.5% slippage
    deadline: THIRTY_MINUTES_FROM_NOW,
  });

  const filteredSwapQuotes = swapQuotes.filter(q => !q.route.some(r => r.providerName.includes("CoW")));

  if (filteredSwapQuotes.length === 0) {
    throw new Error("No swap quotes available");
  }

  if (SWAP_QUOTE_INDEX >= filteredSwapQuotes.length) {
    throw new Error(`No quote found at index: ${SWAP_QUOTE_INDEX}`);
  }

  const swapQuote = filteredSwapQuotes[SWAP_QUOTE_INDEX]!;
  console.log(`✓ Swap quote received: ${swapQuote.amountIn} USDC → ${swapQuote.amountOut} USDT ${swapQuote.route.map(r => r.providerName).join(' → ')}`);

  // Step 3: Plan and execute swap debt
  console.log('\n=== Step 3: Execute Swap Debt ===');
  let swapDebtPlan = sdk.executionService.planSwapDebt({
    account: accountData,
    swapQuote,
  });

  console.log(`✓ Swap debt plan created with ${swapDebtPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for swap debt
  try {
    await executePlan(swapDebtPlan, sdk);
  } catch (error) {
    console.error("Error executing swap debt:", error);
    console.log("\n\nThe swap quote might be bad. Try setting SWAP_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

  // Fetch the updated sub-account and log the result
  subAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_WETH_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_USDC_VAULT],
    { populateVaults: false }
  )).result;

  // Log the diff between before and after swap
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("SWAP DEBT EXAMPLE");
initBalances().then(() => swapDebtExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
