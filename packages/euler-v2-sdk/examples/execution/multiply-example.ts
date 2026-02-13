/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTIPLY (LEVERAGE) EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to open a leveraged long position by depositing
 * collateral, borrowing an asset, swapping it to another asset, and depositing
 * the result as additional collateral.
 * 
 * OPERATION:
 *   1. Deposit USDC as collateral
 *   2. Enable USDT vault as controller
 *   3. Borrow USDT
 *   4. Swap USDT → WETH (using live DEX aggregator quotes)
 *   5. Deposit WETH as additional collateral
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (initial collateral)
 *   • USDT → Euler Prime USDT Vault (liability)
 *   • WETH → Euler Prime WETH Vault (long position collateral)
 * 
 * ⚠️  IMPORTANT - LIVE SWAP QUOTES:
 *   • This example fetches real-time swap quotes from DEX aggregators
 *   • Restart Anvil immediately before running to avoid stale blockchain state
 *   • If the swap fails, try changing REPAY_QUOTE_INDEX to use a different provider
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
} from "viem";
import { mainnet } from "viem/chains";
import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

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
} from "../utils/config.js";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("100", 6); // 100 USDC
const LIABILITY_AMOUNT = parseUnits("50", 6);   // 50 USDT
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX = 0; // Change this if swap quote is bad
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

async function multiplyExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false });

  // Step 1: Get swap quote from USDT (liability asset) to WETH (long asset)
  console.log('\n✓ Fetching swap quote from USDT to WETH...');
  const swapQuotes = await sdk.swapService.getDepositQuote({
    chainId: mainnet.id,
    fromVault: EULER_PRIME_USDT_VAULT,
    toVault: EULER_PRIME_WETH_VAULT,
    fromAccount: SUB_ACCOUNT_ADDRESS,
    toAccount: SUB_ACCOUNT_ADDRESS,
    fromAsset: USDT_ADDRESS,
    toAsset: WETH_ADDRESS,
    amount: LIABILITY_AMOUNT,
    origin: account.address,
    slippage: 0.5, // 0.5% slippage
    deadline: THIRTY_MINUTES_FROM_NOW, // 30 minutes
  });

  if (swapQuotes.length === 0) {
    throw new Error("No swap quotes available");
  }

  if (SWAP_QUOTE_INDEX >= swapQuotes.length) {
    throw new Error(`No quote found at index: ${SWAP_QUOTE_INDEX}`);
  }

  const swapQuote = swapQuotes[SWAP_QUOTE_INDEX]!;
  console.log(`✓ Swap quote received: ${LIABILITY_AMOUNT} USDT → ${swapQuote.amountOut} WETH ${swapQuote.route.map(r => r.providerName).join(' → ')}`);

  // Step 2: Plan the multiply operation
  let multiplyPlan = sdk.executionService.planMultiplyWithSwap({
    account: accountData,
    collateralVault: EULER_PRIME_USDC_VAULT,
    collateralAmount: COLLATERAL_AMOUNT,
    collateralAsset: USDC_ADDRESS,
    swapQuote,
  });

  console.log(`\n✓ Multiply plan created with ${multiplyPlan.length} step(s)`);

  // Resolve approvals (fetches wallet data internally).
  // This would normally be done in the executor logic, e.g. in executePlan, but for illustration we'll do it here.
  multiplyPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: multiplyPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });

  console.log(`✓ Approvals resolved, executing...`);

  // Execute the plan
  try {
    await executePlan(multiplyPlan, sdk);
  } catch (error) {
    console.error("Error executing multiply:", error);
    console.log("\n\nThe swap quote might be bad. Try setting SWAP_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

  // Fetch the updated sub-account and log the result
  const subAccount = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_WETH_VAULT],
    { populateVaults: false }
  );

  // Log the diff between before and after
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("MULTIPLY EXAMPLE");
initBalances().then(() => multiplyExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
