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
 *   2. Partially repay USDT debt by swapping USDC collateral
 *   3. Fully repay remaining USDT debt by swapping USDC collateral and clean up the repaid sub-account
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
  } from "viem";
  import { mainnet } from "viem/chains";
  import { buildEulerSDK, getSubAccountAddress, SwapperMode } from "@eulerxyz/euler-v2-sdk";
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

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
const REPAY_AMOUNT = parseUnits("250", 6);       // Set to -1n to repay all debt
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const REPAY_QUOTE_INDEX = 0; // Change this if swap quote is bad

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

// TODO add exact input repay example

async function repayWithSwapExample({ walletClient }: Awaited<ReturnType<typeof initExample>>) {
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
  // Fetch updated sub-account after borrow (subgraph not available on local fork)
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

  // Step 2: Get repay quote - swap USDC collateral to USDT to repay debt
  console.log('\n=== Step 2: Get Partial Repay Quote ===');
  console.log('✓ Fetching swap quote from USDC to USDT for repayment...');

  // Get current debt from position
  const usdtPosition = subAccountAfterBorrow!.positions.find(p => isAddressEqual(p.vaultAddress, EULER_PRIME_USDT_VAULT));
  const currentDebt = usdtPosition?.borrowed ?? 0n;
  if (currentDebt === 0n) {
    throw new Error("No debt found to repay");
  }

  accountData.updateSubAccounts(subAccountAfterBorrow!);

  const fetchRepayQuote = async (
    liabilityAmount: bigint,
    debt: bigint,
    preferredIndex: number,
  ) => {
    const repayQuotes = await sdk.swapService.fetchRepayQuotes({
      chainId: mainnet.id,
      fromVault: EULER_PRIME_USDC_VAULT,
      fromAsset: USDC_ADDRESS,
      fromAccount: SUB_ACCOUNT_ADDRESS,
      liabilityVault: EULER_PRIME_USDT_VAULT,
      liabilityAsset: USDT_ADDRESS,
      liabilityAmount,
      currentDebt: debt,
      toAccount: SUB_ACCOUNT_ADDRESS,
      origin: account.address,
      swapperMode: SwapperMode.TARGET_DEBT,
      slippage: 0.5, // 0.5% slippage
      deadline: THIRTY_MINUTES_FROM_NOW,
    });
    const filteredRepayQuotes = repayQuotes.filter(
      (quote) => !quote.route.some((route) => route.providerName.includes("CoW")),
    );
    if (filteredRepayQuotes.length === 0) {
      throw new Error("No swap quotes available");
    }
    if (preferredIndex >= filteredRepayQuotes.length) {
      throw new Error("No quote found at index: " + preferredIndex);
    }
    return filteredRepayQuotes[preferredIndex]!;
  };

  const repayQuote = await fetchRepayQuote(
    REPAY_AMOUNT === -1n ? currentDebt : REPAY_AMOUNT,
    currentDebt,
    REPAY_QUOTE_INDEX,
  );
  console.log(`✓ Trying repay quote received: ${repayQuote.amountIn} USDC → ${repayQuote.amountOut} USDT ${repayQuote.route.map(r => r.providerName).join(' → ')}`);

  // Step 3: Plan and execute repay with swap
  console.log('\n=== Step 3: Execute Partial Repay with Swap ===');
  let repaySwapPlan = sdk.executionService.planRepayWithSwap({
    account: accountData,
    swapQuote: repayQuote,
  });

  console.log(`✓ Repay with swap plan created with ${repaySwapPlan.length} step(s)`);

  // no approvals are needed for repay with swap
  try {
    await sdk.executionService.executeTransactionPlan({
      plan: repaySwapPlan,
      chainId: mainnet.id,
      account: walletAccountAddress(walletClient),
      ...exampleExecutionCallbacks(walletClient),
      onProgress: createTransactionPlanLogger(sdk),
    });
  } catch (error) {
    console.error("Error executing repay with swap:", error);
    console.log("\n\nThe swap quote might be bad. Try setting REPAY_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

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

  // Step 4: Fully repay remaining debt and clean up the sub-account
  console.log('\n=== Step 4: Execute Full Repay with Swap ===');

  const remainingDebt = subAccountAfterRepay!.positions.find((position) =>
    isAddressEqual(position.vaultAddress, EULER_PRIME_USDT_VAULT),
  )?.borrowed ?? 0n;
  if (remainingDebt === 0n) {
    throw new Error("No remaining debt found for full repay");
  }

  accountData.updateSubAccounts(subAccountAfterRepay!);

  const fullRepayQuote = await fetchRepayQuote(remainingDebt, remainingDebt, 0);
  console.log(`✓ Trying full repay quote received: ${fullRepayQuote.amountIn} USDC → ${fullRepayQuote.amountOut} USDT ${fullRepayQuote.route.map(r => r.providerName).join(' → ')}`);

  const fullRepaySwapPlan = sdk.executionService.planRepayWithSwap({
    account: accountData,
    swapQuote: fullRepayQuote,
    cleanupOnMax: true,
  });

  console.log(`✓ Full repay with swap plan created with ${fullRepaySwapPlan.length} step(s)`);

  try {
    await sdk.executionService.executeTransactionPlan({
      plan: fullRepaySwapPlan,
      chainId: mainnet.id,
      account: walletAccountAddress(walletClient),
      ...exampleExecutionCallbacks(walletClient),
      onProgress: createTransactionPlanLogger(sdk),
    });
  } catch (error) {
    console.error("Error executing full repay with swap:", error);
    console.log("\n\nThe swap quote might be bad. Try setting REPAY_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

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
printHeader("REPAY WITH SWAP EXAMPLE");
initExample().then(repayWithSwapExample).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
