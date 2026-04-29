/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MINT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to mint a specific amount of vault shares by
 * depositing the required amount of underlying assets. The mint operation
 * specifies the exact number of shares you want to receive.
 * 
 * OPERATION:
 *   • Mint exact amount of vault shares for USDC
 *   • Enable USDC as collateral for the sub-account
 * 
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral enabled)
 * 
 * 💡 TIP - MINT vs DEPOSIT:
 *   • Mint: You specify the exact number of shares you want to receive
 *   • Deposit: You specify the exact amount of assets you want to deposit
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/mint-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";

import { executeTransactionPlan } from "@eulerxyz/euler-v2-sdk";
import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
import { printHeader, logOperationResult } from "../utils/helpers.js";
import { 
  rpcUrls,
  account,
  initBalances,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  publicClient,
  walletClient
} from "../utils/config.js";
import { Account, buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// Inputs
const SHARES_TO_MINT = parseUnits("10", 6); // Mint 10 shares
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

const ENABLE_COLLATERAL = true;
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = true;

async function mintExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({ rpcUrls });

  // Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery, 
  // it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // Plan the mint
  let mintPlan = sdk.executionService.planMint({
    vault: EULER_PRIME_USDC_VAULT,
    shares: SHARES_TO_MINT,
    receiver: SUB_ACCOUNT_ADDRESS,
    account: accountData,
    asset: USDC_ADDRESS,
    enableCollateral: ENABLE_COLLATERAL,
    // sharesToAssetsExchangeRateWad: parseUnits("1.2", 18), // use if unlimitedApproval = false
  });

  console.log(`\n✓ Mint plan created with ${mintPlan.length} step(s)`);

  // Resolve approvals (fetches wallet data internally)
  mintPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: mintPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });
  
  console.log(`✓ Approvals resolved, executing...`);

  // Execute the plan
  await executeTransactionPlan({
    plan: mintPlan,
    executionService: sdk.executionService,
    deploymentService: sdk.deploymentService,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    walletClient: walletClient,
    publicClient,
    chain: mainnet,
    onProgress: createTransactionPlanLogger(sdk),
  });

  // Fetch the updated sub-account and log the result
  const subAccount = (await sdk.accountService.fetchSubAccount(mainnet.id, SUB_ACCOUNT_ADDRESS, [EULER_PRIME_USDC_VAULT], { populateVaults: false })).result;
  
  // Log the diff between before and after
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("MINT EXAMPLE");
initBalances().then(() => mintExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
