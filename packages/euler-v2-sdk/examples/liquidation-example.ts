// /**
//  * ═══════════════════════════════════════════════════════════════════════════
//  * LIQUIDATION EXAMPLE
//  * ═══════════════════════════════════════════════════════════════════════════
//  * 
//  * This example demonstrates how to liquidate an unhealthy account by:
//  * 1. Creating a violator account with a leveraged position
//  * 2. Borrowing with max LTV to make the position risky
//  * 3. Advancing time to accrue interest and make the account liquidatable
//  * 4. Performing a liquidation as a liquidator
//  * 
//  * OPERATION:
//  *   • Violator: Deposit USDC collateral, borrow USDT at max LTV
//  *   • Time: Advance blockchain time by several years to accrue interest
//  *   • Liquidator: Liquidate the violator's position
//  * 
//  * ASSETS & VAULTS:
//  *   • USDC → Euler Prime USDC Vault (collateral for violator)
//  *   • USDT → Euler Prime USDT Vault (liability for violator)
//  * 
//  * 💡 TIP - LIQUIDATION MECHANICS:
//  *   • Liquidators repay part of the violator's debt
//  *   • In return, they receive collateral at a discount (liquidation bonus)
//  *   • The violator's account health improves after liquidation
//  * 
//  * 💡 TIP - USING EXISTING ACCOUNTS:
//  *   • Set PRIVATE_KEY in .env to use an existing account on the fork
//  *   • Without PRIVATE_KEY, a test account will be created and funded automatically
//  * 
//  * ═══════════════════════════════════════════════════════════════════════════
//  */

// import "dotenv/config";
// import {
//   parseUnits,
//   Address,
//   createWalletClient,
//   createPublicClient,
//   privateKeyToAccount,
//   getAddress,
//   erc20Abi,
//   parseEther,
//   Hex,
// } from "viem";
// import { mainnet } from "viem/chains";
// import { http } from "viem";

// import { executePlan } from "./utils/executor.js";
// import { printHeader, logOperationResult } from "./utils/helpers.js";
// import { 
//   rpcUrls,
//   account,
//   initBalances,
//   USDC_ADDRESS,
//   EULER_PRIME_USDC_VAULT,
//   EULER_PRIME_USDT_VAULT,
//   USDT_ADDRESS,
//   testClient,
// } from "./utils/config.js";
// import { buildSDK, getSubAccountAddress } from "euler-v2-sdk";

// // Create a separate violator account
// const VIOLATOR_PRIVATE_KEY = "0x1234567890123456789012345678901234567890123456789012345678901236" as Hex;
// const violatorAccount = privateKeyToAccount(VIOLATOR_PRIVATE_KEY);
// const VIOLATOR_SUB_ACCOUNT_ID = 1;
// const VIOLATOR_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(violatorAccount.address, VIOLATOR_SUB_ACCOUNT_ID);

// // Liquidator uses the main account
// const LIQUIDATOR_SUB_ACCOUNT_ID = 2;
// const LIQUIDATOR_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, LIQUIDATOR_SUB_ACCOUNT_ID);

// // Amounts
// const COLLATERAL_AMOUNT = parseUnits("10000", 6); // 10,000 USDC
// const YEARS_TO_ADVANCE = 3; // Advance 3 years to accrue significant interest
// const USE_PERMIT2 = true;
// const UNLIMITED_APPROVAL = true;

// async function liquidationExample() {
//   // Build the SDK
//   const sdk = await buildSDK({ rpcUrls });

//   // ============================================================================
//   // STEP 1: Fund the violator account
//   // ============================================================================
//   console.log("\n📋 Step 1: Funding violator account...");
  
//   const violatorWalletClient = createWalletClient({
//     account: violatorAccount,
//     chain: mainnet,
//     transport: http("http://127.0.0.1:8545"),
//   });

//   const violatorPublicClient = createPublicClient({
//     chain: mainnet,
//     transport: http("http://127.0.0.1:8545"),
//   });

//   // Fund violator with ETH
//   await testClient.setBalance({
//     address: violatorAccount.address,
//     value: parseEther("1000"),
//   });

//   // Transfer USDC to violator from a whale (using impersonation)
//   const USDC_WHALE = "0xb7cD010b53D23a794d754886C3b928BE6a3315dC" as Address;
  
//   // Impersonate the whale to transfer USDC
//   await testClient.impersonateAccount({ address: USDC_WHALE });
//   await testClient.setBalance({ address: USDC_WHALE, value: parseEther("100") });

//   const whalePublicClient = createPublicClient({
//     chain: mainnet,
//     transport: http("http://127.0.0.1:8545"),
//   });

//   await whalePublicClient.writeContract({
//     address: USDC_ADDRESS,
//     abi: erc20Abi,
//     functionName: "transfer",
//     args: [violatorAccount.address, COLLATERAL_AMOUNT],
//     account: USDC_WHALE,
//   });

//   await testClient.stopImpersonatingAccount({ address: USDC_WHALE });

//   console.log(`✓ Violator funded with ${COLLATERAL_AMOUNT / parseUnits("1", 6)} USDC`);

//   // ============================================================================
//   // STEP 2: Violator deposits collateral and borrows at max LTV
//   // ============================================================================
//   console.log("\n📋 Step 2: Violator creating leveraged position...");

//   // Fetch violator account
//   let violatorAccountData = await sdk.accountService.fetchAccount(mainnet.id, violatorAccount.address);

//   // Calculate max borrow amount (approximately 85% LTV for stablecoins)
//   // We'll borrow close to max to make it risky
//   const MAX_LTV = 8500n; // 85% in basis points
//   const estimatedBorrowAmount = (COLLATERAL_AMOUNT * MAX_LTV) / 10000n;

//   console.log(`  Collateral: ${COLLATERAL_AMOUNT / parseUnits("1", 6)} USDC`);
//   console.log(`  Borrowing: ~${estimatedBorrowAmount / parseUnits("1", 6)} USDT (${MAX_LTV / 100n}% LTV)`);

//   // Plan borrow for violator
//   const violatorBorrowPlan = sdk.executionService.planBorrow({
//     account: violatorAccountData,
//     vault: EULER_PRIME_USDT_VAULT,
//     amount: estimatedBorrowAmount,
//     receiver: violatorAccount.address,
//     borrowAccount: VIOLATOR_SUB_ACCOUNT_ADDRESS,
//     collateral: {
//       vault: EULER_PRIME_USDC_VAULT,
//       amount: COLLATERAL_AMOUNT,
//       asset: USDC_ADDRESS,
//     },
//   });

//   // Resolve approvals for violator
//   const violatorWallet = await sdk.walletService.fetchWalletForPlan(
//     mainnet.id,
//     violatorAccount.address,
//     violatorBorrowPlan
//   );
//   const resolvedViolatorPlan = sdk.executionService.resolveRequiredApprovals({
//     plan: violatorBorrowPlan,
//     wallet: violatorWallet,
//     chainId: mainnet.id,
//     usePermit2: USE_PERMIT2,
//     unlimitedApproval: UNLIMITED_APPROVAL,
//   });

//   // Execute using violator's wallet client
//   const violatorExecutor = async (plan: any[], sdk: any) => {
//     const permit2BatchItems: any[] = [];
//     const deployment = sdk.deploymentService.getDeployment(mainnet.id);
//     const evcAddress = deployment.addresses.coreAddrs.evc;

//     for (const item of plan) {
//       if (item.type === "requiredApproval") {
//         if (!item.resolved || item.resolved.length === 0) continue;

//         for (const resolvedItem of item.resolved) {
//           if (resolvedItem.type === "approve") {
//             const hash = await violatorWalletClient.sendTransaction({
//               to: resolvedItem.token,
//               data: resolvedItem.data,
//               account: violatorAccount,
//               chain: mainnet,
//             });
//             await violatorPublicClient.waitForTransactionReceipt({ hash });
//             console.log(`  ✓ Approval`);
//           } else if (resolvedItem.type === "permit2") {
//             const permit2Address = deployment.addresses.coreAddrs.permit2;
//             const allowanceResult = await violatorPublicClient.readContract({
//               address: permit2Address,
//               abi: [
//                 {
//                   name: "allowance",
//                   type: "function",
//                   stateMutability: "view",
//                   inputs: [
//                     { name: "owner", type: "address" },
//                     { name: "token", type: "address" },
//                     { name: "spender", type: "address" },
//                   ],
//                   outputs: [
//                     { name: "amount", type: "uint160" },
//                     { name: "expiration", type: "uint48" },
//                     { name: "nonce", type: "uint48" },
//                   ],
//                 },
//               ] as const,
//               functionName: "allowance",
//               args: [resolvedItem.owner, resolvedItem.token, resolvedItem.spender],
//             });
//             const nonce = Number(allowanceResult[2]);

//             const typedData = sdk.executionService.getPermit2TypedData({
//               chainId: mainnet.id,
//               token: resolvedItem.token,
//               amount: resolvedItem.amount,
//               spender: resolvedItem.spender,
//               nonce,
//             });

//             const signature = await violatorWalletClient.signTypedData({
//               ...typedData,
//               account: violatorAccount,
//             });

//             const permit2BatchItem = sdk.executionService.encodePermit2Call({
//               chainId: mainnet.id,
//               owner: resolvedItem.owner,
//               message: typedData.message,
//               signature,
//             });

//             permit2BatchItems.push(permit2BatchItem);
//             console.log("  ✓ Permit2 signature");
//           }
//         }
//       } else if (item.type === "evcBatch") {
//         const allBatchItems = [...permit2BatchItems, ...item.items];
//         const batchData = sdk.executionService.encodeBatch(allBatchItems);

//         const hash = await violatorWalletClient.sendTransaction({
//           to: evcAddress,
//           data: batchData,
//           account: violatorAccount,
//           chain: mainnet,
//         });

//         await violatorPublicClient.waitForTransactionReceipt({ hash });
//         permit2BatchItems.length = 0;
//         console.log("  ✓ Violator borrow executed");
//       }
//     }
//   };

//   await violatorExecutor(resolvedViolatorPlan, sdk);

//   // Fetch updated violator account
//   const violatorSubAccountAfterBorrow = await sdk.accountService.fetchSubAccount(
//     mainnet.id,
//     VIOLATOR_SUB_ACCOUNT_ADDRESS,
//     [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
//   );

//   const violatorPosition = violatorSubAccountAfterBorrow.positions.find(
//     (p) => p.vault === EULER_PRIME_USDT_VAULT
//   );
//   const actualBorrowed = violatorPosition?.borrowed ?? 0n;
//   console.log(`✓ Violator borrowed ${actualBorrowed / parseUnits("1", 6)} USDT`);

//   // ============================================================================
//   // STEP 3: Advance time to accrue interest
//   // ============================================================================
//   console.log(`\n📋 Step 3: Advancing time by ${YEARS_TO_ADVANCE} years to accrue interest...`);

//   const secondsToAdvance = YEARS_TO_ADVANCE * 365 * 24 * 60 * 60;
//   await testClient.increaseTime({ seconds: BigInt(secondsToAdvance) });
//   await testClient.mine({ blocks: 1 });

//   console.log(`✓ Time advanced by ${YEARS_TO_ADVANCE} years`);

//   // ============================================================================
//   // STEP 4: Check if violator is liquidatable
//   // ============================================================================
//   console.log("\n📋 Step 4: Checking violator account health...");

//   const updatedViolatorSubAccount = await sdk.accountService.fetchSubAccount(
//     mainnet.id,
//     VIOLATOR_SUB_ACCOUNT_ADDRESS,
//     [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
//   );

//   const updatedViolatorPosition = updatedViolatorSubAccount.positions.find(
//     (p) => p.vault === EULER_PRIME_USDT_VAULT
//   );
//   const updatedBorrowed = updatedViolatorPosition?.borrowed ?? 0n;
//   const interestAccrued = updatedBorrowed - actualBorrowed;

//   console.log(`  Original debt: ${actualBorrowed / parseUnits("1", 6)} USDT`);
//   console.log(`  Current debt: ${updatedBorrowed / parseUnits("1", 6)} USDT`);
//   console.log(`  Interest accrued: ${interestAccrued / parseUnits("1", 6)} USDT`);

//   if (updatedViolatorPosition?.liquidity) {
//     const daysToLiquidation = updatedViolatorPosition.liquidity.daysToLiquidation;
//     if (daysToLiquidation === "Infinity" || daysToLiquidation === "MoreThanAYear") {
//       console.log(`  ⚠️  Account still healthy (${daysToLiquidation})`);
//       console.log(`  Note: May need to advance more time or borrow more to become liquidatable`);
//     } else {
//       console.log(`  ⚠️  Days to liquidation: ${daysToLiquidation}`);
//     }
//   }

//   // ============================================================================
//   // STEP 5: Liquidator performs liquidation
//   // ============================================================================
//   console.log("\n📋 Step 5: Liquidator performing liquidation...");

//   // Fetch liquidator account
//   let liquidatorAccountData = await sdk.accountService.fetchAccount(mainnet.id, account.address);

//   // Fetch updated violator account for planning
//   const violatorAccountForLiquidation = await sdk.accountService.fetchAccount(
//     mainnet.id,
//     violatorAccount.address
//   );
//   violatorAccountForLiquidation.subAccounts = [updatedViolatorSubAccount];

//   // Calculate liquidation parameters
//   // Liquidator will repay part of the debt (e.g., 50%)
//   const repayAmount = updatedBorrowed / 2n;
//   const minYieldBalance = 0n; // Minimum yield balance to receive

//   console.log(`  Repaying: ${repayAmount / parseUnits("1", 6)} USDT`);
//   console.log(`  Collateral vault: ${EULER_PRIME_USDC_VAULT.slice(0, 10)}...`);
//   console.log(`  Liability vault: ${EULER_PRIME_USDT_VAULT.slice(0, 10)}...`);

//   // Plan liquidation
//   const liquidationPlan = sdk.executionService.planLiquidation({
//     account: liquidatorAccountData,
//     violatorAccount: violatorAccountForLiquidation,
//     vault: EULER_PRIME_USDT_VAULT,
//     asset: USDT_ADDRESS,
//     violator: VIOLATOR_SUB_ACCOUNT_ADDRESS,
//     collateral: EULER_PRIME_USDC_VAULT,
//     repayAssets: repayAmount,
//     minYieldBalance,
//     liquidatorAccount: LIQUIDATOR_SUB_ACCOUNT_ADDRESS,
//   });

//   console.log(`✓ Liquidation plan created with ${liquidationPlan.length} step(s)`);

//   // Resolve approvals for liquidator
//   const liquidatorWallet = await sdk.walletService.fetchWalletForPlan(
//     mainnet.id,
//     account.address,
//     liquidationPlan
//   );
//   const resolvedLiquidationPlan = sdk.executionService.resolveRequiredApprovals({
//     plan: liquidationPlan,
//     wallet: liquidatorWallet,
//     chainId: mainnet.id,
//     usePermit2: USE_PERMIT2,
//     unlimitedApproval: UNLIMITED_APPROVAL,
//   });

//   console.log(`✓ Approvals resolved, executing...`);

//   // Execute liquidation
//   await executePlan(resolvedLiquidationPlan, sdk);

//   // ============================================================================
//   // STEP 6: Show results
//   // ============================================================================
//   console.log("\n📋 Step 6: Fetching final state...");

//   const finalViolatorSubAccount = await sdk.accountService.fetchSubAccount(
//     mainnet.id,
//     VIOLATOR_SUB_ACCOUNT_ADDRESS,
//     [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
//   );

//   const finalLiquidatorSubAccount = await sdk.accountService.fetchSubAccount(
//     mainnet.id,
//     LIQUIDATOR_SUB_ACCOUNT_ADDRESS,
//     [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT]
//   );

//   // Log violator account changes
//   console.log("\n" + "═".repeat(80));
//   console.log("VIOLATOR ACCOUNT (After Liquidation)");
//   console.log("═".repeat(80));
//   await logOperationResult(
//     mainnet.id,
//     { ...violatorAccountForLiquidation, subAccounts: [updatedViolatorSubAccount] },
//     [finalViolatorSubAccount],
//     sdk
//   );

//   // Log liquidator account changes
//   console.log("\n" + "═".repeat(80));
//   console.log("LIQUIDATOR ACCOUNT (After Liquidation)");
//   console.log("═".repeat(80));
//   await logOperationResult(
//     mainnet.id,
//     liquidatorAccountData,
//     [finalLiquidatorSubAccount],
//     sdk
//   );
// }

// // ============================================================================
// // Run the example
// // ============================================================================
// printHeader("LIQUIDATION EXAMPLE");
// initBalances()
//   .then(() => liquidationExample())
//   .catch((error) => {
//     console.error("Error:", error);
//     process.exit(1);
//   });
