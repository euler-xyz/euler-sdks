import "dotenv/config";
import {
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";

import { executePlan } from "./utils/executor.js";
import { printHeader } from "./utils/helpers.js";
import { rpcUrls, account, initBalances, USDC_ADDRESS, EULER_PRIME_USDC_VAULT } from "./utils/config.js";
import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

// Inputs
const DEPOSIT_AMOUNT = parseUnits("10", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

async function depositExample() {
  // Build the SDK
  const sdk = await buildSDK({ rpcUrls });

  // Fetch the account
  let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address);  

  // Print the position before the deposit
  const positionBefore = accountData.getPosition(SUB_ACCOUNT_ADDRESS, EULER_PRIME_USDC_VAULT);
  if (positionBefore) console.log('Position before: ', positionBefore);

  // Plan the deposit
  const depositPlan = sdk.executionService.planDeposit({
    vault: EULER_PRIME_USDC_VAULT,
    amount: DEPOSIT_AMOUNT,
    receiver: SUB_ACCOUNT_ADDRESS,
    account: accountData,
    asset: USDC_ADDRESS,
    enableCollateral: true,
    usePermit2: true, // Set to false to use standard approval
    unlimitedApproval: false, // Set to false to approve only the exact amount
  });
  
  console.log(`\n✓ Deposit plan created with ${depositPlan.length} step(s), executing...`);

  // Execute the plan
  await executePlan(depositPlan, sdk);


  // in tests the new sub-account will not be indexed by subgraph, so we need to fetch it manually
  const subAccount = await sdk.accountService.fetchSubAccount(mainnet.id, SUB_ACCOUNT_ADDRESS, [EULER_PRIME_USDC_VAULT]);
  console.log('\nSub account after: ', subAccount);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("DEPOSIT EXAMPLE");
initBalances().then(() => depositExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

