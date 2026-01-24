import "dotenv/config";
import {
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

import { executePlan } from "./utils/executor.js";
import { printHeader } from "./utils/helpers.js";
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

// Example of setting up a multiply position. Deposit 100 USDC, borrow 50 USDT and swap to WETH.

// Inputs
const COLLATERAL_AMOUNT = parseUnits("100", 6); // 100 USDC
const LIABILITY_AMOUNT = parseUnits("50", 6);   // 50 USDT
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

async function multiplyExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address);

  // Print the position before the multiply
  const positionBeforeCollateral = accountData.getPosition(SUB_ACCOUNT_ADDRESS, EULER_PRIME_USDC_VAULT);
  const positionBeforeLiability = accountData.getPosition(SUB_ACCOUNT_ADDRESS, EULER_PRIME_USDT_VAULT);
  const positionBeforeLong = accountData.getPosition(SUB_ACCOUNT_ADDRESS, EULER_PRIME_WETH_VAULT);

  console.log('\n=== Positions Before ===');
  if (positionBeforeCollateral) {
    console.log('Collateral (USDC):', positionBeforeCollateral);
  }
  if (positionBeforeLiability) {
    console.log('Liability (USDT):', positionBeforeLiability);
  }
  if (positionBeforeLong) {
    console.log('Long (WETH):', positionBeforeLong);
  }

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

  const swapQuote = swapQuotes[0]!;
  console.log(`✓ Swap quote received: ${LIABILITY_AMOUNT} USDT → ${swapQuote.amountOut} WETH ${swapQuote.route.map(r => r.providerName).join(' → ')}`);

  // Step 2: Plan the multiply operation
  const multiplyPlan = sdk.executionService.planMultiplyWithSwap({
    collateralVault: EULER_PRIME_USDC_VAULT,
    collateralAmount: COLLATERAL_AMOUNT,
    collateralAsset: USDC_ADDRESS,
    account: accountData,
    swapQuote,
    usePermit2: true, // Set to false to use standard approval
    unlimitedApproval: false, // Set to false to approve only the exact amount
  });

  console.log(`\n✓ Multiply plan created with ${multiplyPlan.length} step(s), executing...`);

  // Execute the plan
  await executePlan(multiplyPlan, sdk);

  // Fetch the updated account
  const subAccount = await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, EULER_PRIME_WETH_VAULT]
  );

  console.log('\n=== Positions After ===');
  console.log('Sub account:', subAccount);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("MULTIPLY EXAMPLE");
initBalances().then(() => multiplyExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
