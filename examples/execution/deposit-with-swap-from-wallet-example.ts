/**
 * ===============================================================================
 * DEPOSIT WITH SWAP FROM WALLET EXAMPLE
 * ===============================================================================
 *
 * This example demonstrates how to deposit into a vault using tokens from the
 * user's wallet that need to be swapped first. It also demonstrates redeeming
 * the full balance with a swap back to the original token.
 *
 * OPERATION:
 *   1. User holds USDC in wallet
 *   2. User encodes a swap to wstETH with unusedInputReceiver set to user's wallet
 *   3. User executes planDepositWithSwapFromWallet, depositing to the wstETH vault
 *   4. User creates another swap, this time with transferOutputToReceiver set to true
 *   5. User creates a redeem tx plan (full balance) to Swapper
 *   6. The swap is added to batch (swaps redeemed wstETH to USDC and transfers
 *      to user's wallet through SwapVerifier)
 *
 * ASSETS & VAULTS:
 *   - USDC (input from wallet) -> swap to wstETH -> deposit into vault
 *   - Redeem all wstETH from vault -> swap to USDC -> transfer to wallet
 *
 * IMPORTANT - SWAP API REQUIREMENT:
 *   - This example fetches real-time swap quotes from DEX aggregators
 *   - Restart Anvil immediately before running to avoid stale blockchain state
 *   - If the swap fails, try changing SWAP_QUOTE_INDEX to use a different provider
 *
 * USAGE:
 *   1. Set FORK_RPC_URLin examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx examples/execution/deposit-with-swap-from-wallet-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ===============================================================================
 */

import "dotenv/config";
import {
  parseUnits,
  maxUint256,
  getAddress,
  erc20Abi,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { buildEulerSDK, getSubAccountAddress, SwapperMode } from "euler-v2-sdk";

import { executePlan } from "../utils/executor.js";
import { printHeader, logOperationResult } from "../utils/helpers.js";
import {
  rpcUrls,
  account,
  initBalances,
  publicClient,
  USDC_ADDRESS,
} from "../utils/config.js";

// Addresses
const WSTETH_ADDRESS = getAddress("0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0");
const WSTETH_VAULT = getAddress("0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1");

// Inputs
const DEPOSIT_AMOUNT = parseUnits("100", 6); // 100 USDC
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX_1 = 0; // Change this if swap quote is bad
const SWAP_QUOTE_INDEX_2 = 0; // Change this if swap quote is bad
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800;

async function depositWithSwapFromWalletExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({ rpcUrls });

  // Fetch the account
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // ============================================================================
  // Step 1: Deposit USDC from wallet, swapping to wstETH
  // ============================================================================
  console.log('\n=== Step 1: Get Swap Quote (USDC -> wstETH) for Deposit ===');
  console.log('Fetching swap quote from USDC to wstETH...');

  // Request a swap quote with unusedInputReceiver set to user's wallet
  // vaultIn and accountIn are zero address since we're not withdrawing from a vault
  const depositSwapQuotes = await sdk.swapService.fetchDepositQuote({
    chainId: mainnet.id,
    fromVault: zeroAddress,
    toVault: WSTETH_VAULT,
    fromAccount: zeroAddress,
    toAccount: SUB_ACCOUNT_ADDRESS,
    fromAsset: USDC_ADDRESS,
    toAsset: WSTETH_ADDRESS,
    amount: DEPOSIT_AMOUNT,
    origin: account.address,
    slippage: 0.5,
    deadline: THIRTY_MINUTES_FROM_NOW,
    unusedInputReceiver: account.address, // unused USDC goes back to wallet
  });

  const filteredDepositQuotes = depositSwapQuotes.filter(q => !q.route.some(r => r.providerName.includes("CoW")));

  const depositSwapQuote = filteredDepositQuotes[SWAP_QUOTE_INDEX_1]!;
  console.log(`Swap quote received: ${DEPOSIT_AMOUNT} USDC -> ${depositSwapQuote.amountOut} wstETH ${depositSwapQuote.route.map(r => r.providerName).join(' -> ')}`);

  // Step 2: Plan and execute deposit with swap from wallet
  console.log('\n=== Step 2: Execute Deposit with Swap from Wallet ===');
  let depositPlan = sdk.executionService.planDepositWithSwapFromWallet({
    account: accountData,
    swapQuote: depositSwapQuote,
    amount: DEPOSIT_AMOUNT,
    tokenIn: USDC_ADDRESS,
    enableCollateral: true,
  });

  console.log(`Deposit plan created with ${depositPlan.length} step(s)`);

  // Resolve approvals (approval goes to SwapVerifier)
  depositPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: depositPlan,
    chainId: mainnet.id,
    account: account.address,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });

  console.log('Approvals resolved, executing...');
  try {
    await executePlan(depositPlan, sdk);
  } catch (error) {
    console.error("Error executing deposit with swap:", error);
    console.log("\n\nThe swap quote might be bad. Try setting SWAP_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

  // Fetch updated sub-account
  const subAccountAfterDeposit = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [WSTETH_VAULT],
    { populateVaults: false }
  )).result;

  await logOperationResult(mainnet.id, accountData, [subAccountAfterDeposit], sdk);

  // Update account data
  accountData.updateSubAccounts(subAccountAfterDeposit!);

  // ============================================================================
  // Step 3: Redeem full wstETH balance from vault, swap to USDC, transfer to wallet
  // ============================================================================
  console.log('\n=== Step 3: Get Swap Quote (wstETH -> USDC) for Redeem ===');

  // Get the position's asset balance to use as the swap amount
  const position = accountData.getPosition(SUB_ACCOUNT_ADDRESS, WSTETH_VAULT);
  const redeemAssets = position!.assets;
  console.log(`Position assets: ${redeemAssets} wstETH`);
  console.log('Fetching swap quote from wstETH to USDC with transferOutputToReceiver...');

  // Use fetchSwapQuotes directly with transferOutputToReceiver set to true
  // This means the output USDC will be transferred to receiver (user's wallet) instead of deposited to a vault
  const withdrawSwapQuotes = await sdk.swapService.fetchSwapQuotes({
    chainId: mainnet.id,
    tokenIn: WSTETH_ADDRESS,
    tokenOut: USDC_ADDRESS,
    vaultIn: WSTETH_VAULT,
    receiver: account.address, // receiver = user's wallet (since transferOutputToReceiver is true)
    accountIn: SUB_ACCOUNT_ADDRESS,
    accountOut: zeroAddress, // accountOut must be zero when transferOutputToReceiver
    amount: redeemAssets,
    origin: account.address,
    slippage: 0.5,
    swapperMode: SwapperMode.EXACT_IN,
    isRepay: false,
    targetDebt: 0n,
    currentDebt: 0n,
    deadline: THIRTY_MINUTES_FROM_NOW,
    transferOutputToReceiver: true, // transfer USDC to wallet through SwapVerifier
  });

  const filteredWithdrawQuotes = withdrawSwapQuotes.filter(q => !q.route.some(r => r.providerName.includes("CoW")));

  const withdrawSwapQuote = filteredWithdrawQuotes[SWAP_QUOTE_INDEX_2]!;
  console.log(`Swap quote received: ${redeemAssets} wstETH -> ${withdrawSwapQuote.amountOut} USDC ${withdrawSwapQuote.route.map(r => r.providerName).join(' -> ')}`);

  // Step 4: Create redeem plan to Swapper, then add swap to batch
  console.log('\n=== Step 4: Execute Redeem + Swap to Wallet ===');

  // Build the redeem batch items - redeem all wstETH shares to Swapper
  const redeemPlan = sdk.executionService.planRedeem({
    account: accountData,
    vault: WSTETH_VAULT,
    shares: maxUint256, // redeem full balance
    owner: SUB_ACCOUNT_ADDRESS,
    receiver: withdrawSwapQuote.swap.swapperAddress, // redeem to Swapper (use address from quote)
  });

  // Build the swap + verify batch items
  const swapBatchItems = [
    // Execute swap multicall on Swapper
    {
      targetContract: withdrawSwapQuote.swap.swapperAddress,
      onBehalfOfAccount: SUB_ACCOUNT_ADDRESS,
      value: 0n,
      data: withdrawSwapQuote.swap.swapperData,
    },
    // Verify and transfer output to user's wallet
    {
      targetContract: withdrawSwapQuote.verify.verifierAddress,
      onBehalfOfAccount: SUB_ACCOUNT_ADDRESS,
      value: 0n,
      data: withdrawSwapQuote.verify.verifierData,
    },
  ];
  const swapPlan = sdk.executionService.convertBatchItemsToPlan(swapBatchItems);

  // Merge redeem and swap into one plan
  const combinedPlan = sdk.executionService.mergePlans([redeemPlan, swapPlan]);

  console.log(`Combined plan created with ${combinedPlan.length} step(s)`);

  try {
    await executePlan(combinedPlan, sdk);
  } catch (error) {
    console.error("Error executing redeem with swap:", error);
    console.log("\n\nThe swap quote might be bad. Try setting SWAP_QUOTE_INDEX to a different value.");
    process.exit(1);
  }

  // Fetch the updated sub-account and log the result
  const subAccountAfterWithdraw = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [WSTETH_VAULT],
    { populateVaults: false }
  )).result;

  await logOperationResult(mainnet.id, accountData, [subAccountAfterWithdraw], sdk);

  // Check final USDC balance
  const usdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  console.log(`Final USDC wallet balance: ${usdcBalance}`);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("DEPOSIT WITH SWAP FROM WALLET EXAMPLE");
initBalances().then(() => depositWithSwapFromWalletExample()).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
