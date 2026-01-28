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
 * ASSETS & VAULTS:
 *   • WETH → Euler Prime WETH Vault (collateral)
 *   • USDT → Euler Prime USDT Vault (initial liability to be replaced)
 *   • USDC → Euler Prime USDC Vault (new liability)
 * 
 * ⚠️  IMPORTANT - LIVE SWAP QUOTES:
 *   • This example fetches real-time swap quotes from DEX aggregators
 *   • Restart Anvil immediately before running to avoid stale blockchain state
 *   • If the swap fails, try changing SWAP_QUOTE_INDEX to use a different provider
 * 
 * 💡 TIP - USE CASE:
 *   • Refinance to a vault with lower borrow rates
 *   • Switch to more liquid or stable debt asset
 *   • Rebalance debt exposure across different assets
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
  isAddressEqual,
} from "viem";
import { mainnet } from "viem/chains";
import { buildSDK, getSubAccountAddress, SwapperMode } from "euler-v2-sdk";

import { executePlan } from "./utils/executor.js";
import { printHeader, logOperationResult } from "./utils/helpers.js";
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
} from "./utils/config.js";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("2", 18);   // 2 WETH
const BORROW_USDT_AMOUNT = parseUnits("1000", 6); // 1000 USDT (initial debt)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX = 0; // Change this if swap quote is bad

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

async function swapDebtExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address);

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

  // Fetch wallet data and resolve approvals
  const walletForBorrow = await sdk.walletService.fetchWalletForPlan(mainnet.id, account.address, borrowPlan);
  borrowPlan = sdk.executionService.resolveRequiredApprovals({
    plan: borrowPlan,
    wallet: walletForBorrow,
    chainId: mainnet.id,
    usePermit2: true,
    unlimitedApproval: false,
  });

  console.log(`✓ Approvals resolved, executing...`);
  await executePlan(borrowPlan, sdk);

  // Fetch updated sub-account after borrow
  let subAccount = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_WETH_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_USDC_VAULT]
  );
  
  // Log the diff between before and after borrow
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);

  // Step 2: Get swap quote for debt swap
  console.log('\n=== Step 2: Get Swap Quote ===');
  console.log('✓ Fetching swap quote from USDC to USDT for debt swap...');
  
  // Update account data with the fetched sub-account
  accountData.subAccounts = [subAccount!];

  // Get current USDT debt
  const usdtPosition = subAccount!.positions.find(p => isAddressEqual(p.vault, EULER_PRIME_USDT_VAULT));
  const currentUsdtDebt = usdtPosition?.borrowed ?? 0n;
  
  if (currentUsdtDebt === 0n) {
    throw new Error("No USDT debt found");
  }

  const swapQuotes = await sdk.swapService.getRepayQuotes({
    chainId: mainnet.id,
    fromVault: EULER_PRIME_USDC_VAULT,
    fromAsset: USDC_ADDRESS,
    fromAccount: SUB_ACCOUNT_ADDRESS,
    liabilityVault: EULER_PRIME_USDT_VAULT,
    liabilityAsset: USDT_ADDRESS,
    liabilityAmount: currentUsdtDebt,
    currentDebt: currentUsdtDebt,
    toAccount: SUB_ACCOUNT_ADDRESS,
    origin: account.address,
    swapperMode: SwapperMode.TARGET_DEBT,
    slippage: 0.5, // 0.5% slippage
    deadline: THIRTY_MINUTES_FROM_NOW,
  });

  if (swapQuotes.length === 0) {
    throw new Error("No swap quotes available");
  }

  if (SWAP_QUOTE_INDEX >= swapQuotes.length) {
    throw new Error(`No quote found at index: ${SWAP_QUOTE_INDEX}`);
  }

  const swapQuote = swapQuotes[SWAP_QUOTE_INDEX]!;
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
  subAccount = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_WETH_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_USDC_VAULT]
  );

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
