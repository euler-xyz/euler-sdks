/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SWAP COLLATERAL EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to swap one collateral asset for another while
 * maintaining an open debt position. This is useful for rebalancing collateral
 * or switching to a more stable or higher-yield collateral.
 * 
 * OPERATION:
 *   1. Deposit USDC as collateral and borrow USDT
 *   2. Withdraw some USDC collateral
 *   3. Swap USDC → WETH (using live DEX aggregator quotes)
 *   4. Deposit WETH as new collateral
 * 
 * ⚠️  IMPORTANT - LIVE SWAP QUOTES:
 *   • This example fetches real-time swap quotes from DEX aggregators
 *   • Restart Anvil immediately before running to avoid stale blockchain state
 *   • If the swap fails, try changing SWAP_QUOTE_INDEX to use a different provider
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx examples/execution/swap-collateral-example.ts
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
import { buildEulerSDK, getSubAccountAddress } from "euler-v2-sdk";

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
  WETH_ADDRESS,
} from "../utils/config.js";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("2000", 6); // 2000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const SWAP_AMOUNT = parseUnits("500", 6);        // Swap 500 USDC to WETH
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX = 0; // Change this if swap quote is bad
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

async function swapCollateralExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false });

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

  // Fetch updated sub-account after borrow
  const subAccountAfterBorrow = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_WETH_VAULT],
    { populateVaults: false }
  );
  
  // Log the diff between before and after borrow
  await logOperationResult(mainnet.id, accountData, [subAccountAfterBorrow], sdk);

  // Step 2: Get swap quote from USDC to WETH
  console.log('\n=== Step 2: Get Swap Quote ===');
  console.log('✓ Fetching swap quote from USDC to WETH...');
  
  // Update account data with the fetched sub-account
  accountData.subAccounts = { [getAddress(subAccountAfterBorrow!.account)]: subAccountAfterBorrow! };

  const swapQuotes = await sdk.swapService.getDepositQuote({
    chainId: mainnet.id,
    fromVault: EULER_PRIME_USDC_VAULT,
    toVault: EULER_PRIME_WETH_VAULT,
    fromAccount: SUB_ACCOUNT_ADDRESS,
    toAccount: SUB_ACCOUNT_ADDRESS,
    fromAsset: USDC_ADDRESS,
    toAsset: WETH_ADDRESS,
    amount: SWAP_AMOUNT,
    origin: account.address,
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
  console.log(`✓ Swap quote received: ${SWAP_AMOUNT} USDC → ${swapQuote.amountOut} WETH ${swapQuote.route.map(r => r.providerName).join(' → ')}`);

  // Step 3: Plan and execute swap collateral
  console.log('\n=== Step 3: Execute Swap Collateral ===');
  let swapCollateralPlan = sdk.executionService.planSwapCollateral({
    account: accountData,
    swapQuote,
  });

  console.log(`✓ Swap collateral plan created with ${swapCollateralPlan.length} step(s)`);
  console.log(`✓ Executing...`);

  // No approvals needed for swap collateral
  try {
    await executePlan(swapCollateralPlan, sdk);
  } catch (error) {
    console.error("Error executing swap collateral:", error);
    console.log("\n\nThe swap quote might be bad. Try setting SWAP_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

  // Fetch the updated sub-account and log the result
  const subAccountAfterSwap = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_WETH_VAULT],
    { populateVaults: false }
  );

  // Log the diff between before and after swap
  await logOperationResult(mainnet.id, accountData, [subAccountAfterSwap], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("SWAP COLLATERAL EXAMPLE");
initBalances().then(() => swapCollateralExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
