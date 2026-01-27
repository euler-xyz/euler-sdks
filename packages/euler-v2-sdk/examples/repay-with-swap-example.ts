// import "dotenv/config";
// import {
//   parseUnits,
//   isAddressEqual,
// } from "viem";
// import { mainnet } from "viem/chains";
// import { buildSDK, executionAbis, getSubAccountAddress, SwapperMode } from "euler-v2-sdk";

// import { executePlan } from "./utils/executor.js";
// import { printHeader } from "./utils/helpers.js";
// import { 
//   rpcUrls,
//   account,
//   initBalances,
//   USDC_ADDRESS,
//   EULER_PRIME_USDC_VAULT,
//   EULER_PRIME_USDT_VAULT,
//   USDT_ADDRESS,
// } from "./utils/config.js";

// // Example of repaying debt with swap. Deposit 1000 USDC, borrow 500 USDT, then repay by swapping USDC to USDT.
// // NOTE: This example fetches live quotes from the swap API. If the swap quote is bad, try setting REPAY_QUOTE_INDEX to a different value.

// // Inputs
// const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
// const BORROW_AMOUNT = parseUnits("500", 6);      // 500 USDT
// const REPAY_AMOUNT = parseUnits("250", 6);       // set to -1n to repay all debt
// const SUB_ACCOUNT_ID = 1;
// const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
// const REPAY_QUOTE_INDEX = 0; // change provider if swap quote is bad

// const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

// async function repayWithSwapExample() {
//   // Build the SDK
//   const sdk = await buildSDK({ rpcUrls });

//   // Fetch the account
//   let accountData = await sdk.accountService.fetchAccount(mainnet.id, account.address);

//   // Step 1: Plan and execute borrow operation (deposit USDC collateral and borrow USDT)
//   console.log('\n=== Step 1: Deposit USDC and Borrow USDT ===');
//   const borrowPlan = sdk.executionService.planBorrow({
//     vault: EULER_PRIME_USDT_VAULT,
//     amount: BORROW_AMOUNT,
//     receiver: account.address,
//     borrowAccount: SUB_ACCOUNT_ADDRESS,
//     account: accountData,
//     collateral: {
//       vault: EULER_PRIME_USDC_VAULT,
//       amount: COLLATERAL_AMOUNT,
//       asset: USDC_ADDRESS,
//     },
//     // OPTIONAL - default is true
//     // usePermit2: false, 
//     // unlimitedApproval: false,
//   });

//   console.log(`✓ Borrow plan created with ${borrowPlan.length} step(s), executing...`);
//   await executePlan(borrowPlan, sdk);

//   // Fetch updated sub-account after borrow (subgraph not available on local fork)
//   const subAccountAfterBorrow = await sdk.accountService.fetchSubAccount(
//     mainnet.id,
//     SUB_ACCOUNT_ADDRESS,
//     [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
//   );
  
//   console.log('\n✓ Sub-account after borrow:', subAccountAfterBorrow);

//   // Step 2: Get repay quote - swap USDC collateral to USDT to repay debt
//   console.log('\n=== Step 2: Get Repay Quote ===');
//   console.log('✓ Fetching swap quote from USDC to USDT for repayment...');
  
//   // Get current debt from position
//   const usdtPosition = subAccountAfterBorrow!.positions.find(p => isAddressEqual(p.vault, EULER_PRIME_USDT_VAULT));
//   const currentDebt = usdtPosition?.borrowed ?? 0n;
//   if (currentDebt === 0n) {
//     throw new Error("No debt found to repay");
//   }

//   // Update account data with the fetched sub-account
//   accountData.subAccounts = [subAccountAfterBorrow!];

//   const repayQuotes = await sdk.swapService.getRepayQuotes({
//     chainId: mainnet.id,
//     fromVault: EULER_PRIME_USDC_VAULT,
//     fromAsset: USDC_ADDRESS,
//     fromAccount: SUB_ACCOUNT_ADDRESS,
//     liabilityVault: EULER_PRIME_USDT_VAULT,
//     liabilityAsset: USDT_ADDRESS,
//     liabilityAmount: REPAY_AMOUNT === -1n ? currentDebt : REPAY_AMOUNT,
//     currentDebt,
//     toAccount: SUB_ACCOUNT_ADDRESS,
//     origin: account.address,
//     swapperMode: SwapperMode.TARGET_DEBT,
//     slippage: 0.5, // 0.5% slippage
//     deadline: THIRTY_MINUTES_FROM_NOW,
//   });

//   if (repayQuotes.length === 0) {
//     throw new Error("No swap quotes available");
//   }

//   if (REPAY_QUOTE_INDEX >= repayQuotes.length) {
//     throw new Error("No quote found at index: " + REPAY_QUOTE_INDEX);
//   }

//   const repayQuote = repayQuotes[REPAY_QUOTE_INDEX]!;
//   console.log(`✓ Trying repay quote received: ${repayQuote.amountIn} USDC → ${repayQuote.amountOut} USDT ${repayQuote.route.map(r => r.providerName).join(' → ')}`);

//   // Step 3: Plan and execute repay with swap
//   console.log('\n=== Step 3: Execute Repay with Swap ===');
//   const repaySwapPlan = sdk.executionService.planRepayWithSwap({
//     swapQuote: repayQuote,
//     account: accountData,
//   });

//   console.log(`✓ Repay with swap plan created with ${repaySwapPlan.length} step(s), executing...`);
//   try {
//     await executePlan(repaySwapPlan, sdk);
//   } catch (error) {
//     console.error("Error executing repay with swap:", error);
//     console.log("\n\nThe swap quote might be bad. Try setting REPAY_QUOTE_INDEX to a different value.");
//     process.exit(1);
//   }

//   // Fetch the updated account
//   const subAccount = await sdk.accountService.fetchSubAccount(
//     mainnet.id,
//     SUB_ACCOUNT_ADDRESS,
//     [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
//   );

//   console.log('\n=== Final Positions ===');
//   console.log('Sub account:', subAccount);
// }

// // ============================================================================
// // Run the example
// // ============================================================================
// printHeader("REPAY WITH SWAP EXAMPLE");
// initBalances().then(() => repayWithSwapExample()).catch((error) => {
//   console.error("Error:", error);
//   process.exit(1);
// });
