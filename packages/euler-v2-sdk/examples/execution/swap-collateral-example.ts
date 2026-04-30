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
 *   3. Run: npx tsx execution/swap-collateral-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
  } from "viem";
  import { mainnet } from "viem/chains";
  import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
  import { fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  rpcUrls,
  account,
  initExample,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_WETH_VAULT,
  EULER_PRIME_USDT_VAULT,
  WETH_ADDRESS,
  exampleExecutionCallbacks,
} from "../utils/config.js";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("2000", 6); // 2000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const SWAP_AMOUNT = parseUnits("500", 6);        // Swap 500 USDC to WETH
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX = 0; // Change this if swap quote is bad

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

async function swapCollateralExample({ walletClient }: Awaited<ReturnType<typeof initExample>>) {
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


  console.log(`✓ Executing...`);
  await sdk.executionService.executeTransactionPlan({
    plan: borrowPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });
  const [subAccountAfterBorrow] = await fetchAndLogSubAccounts(
    mainnet.id,
    accountData,
    sdk,
    [
      {
        account: SUB_ACCOUNT_ADDRESS,
        vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_WETH_VAULT],
      },
    ],
  );

  // Step 2: Get swap quote from USDC to WETH
  console.log('\n=== Step 2: Get Swap Quote ===');
  console.log('✓ Fetching swap quote from USDC to WETH...');

  // Update account data with the fetched sub-account
  accountData.updateSubAccounts(subAccountAfterBorrow!);

  const swapQuotes = await sdk.swapService.fetchDepositQuote({
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

  const orderedSwapQuotes = [
    ...filteredSwapQuotes.slice(SWAP_QUOTE_INDEX),
    ...filteredSwapQuotes.slice(0, SWAP_QUOTE_INDEX),
  ];

  // Step 3: Plan and execute swap collateral
  console.log('\n=== Step 3: Execute Swap Collateral ===');

  let lastError: unknown;
  for (const [quoteIndex, swapQuote] of orderedSwapQuotes.entries()) {
    console.log(
      `✓ Trying quote ${quoteIndex + 1}/${orderedSwapQuotes.length}: ${SWAP_AMOUNT} USDC → ${swapQuote.amountOut} WETH ${swapQuote.route.map(r => r.providerName).join(' → ')}`
    );

    const swapCollateralPlan = sdk.executionService.planSwapCollateral({
      account: accountData,
      swapQuote,
    });

    console.log(`✓ Swap collateral plan created with ${swapCollateralPlan.length} step(s)`);
    console.log(`✓ Executing...`);

    try {
      await sdk.executionService.executeTransactionPlan({
        plan: swapCollateralPlan,
        chainId: mainnet.id,
        account: walletAccountAddress(walletClient),
        ...exampleExecutionCallbacks(walletClient),
        onProgress: createTransactionPlanLogger(sdk),
      });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      console.error("Error executing swap collateral:", error);
    }
  }

  if (lastError) {
    console.log("\n\nAll swap quotes failed.");
    process.exit(1);
  }

  await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
    {
      account: SUB_ACCOUNT_ADDRESS,
      vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_WETH_VAULT],
    },
  ]);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("SWAP COLLATERAL EXAMPLE");
initExample().then(swapCollateralExample).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
