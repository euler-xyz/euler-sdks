/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIQUIDATION EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This example demonstrates how to liquidate an unhealthy account by:
 * 1. Creating a violator account with a leveraged position
 * 2. Borrowing with max LTV to make the position risky
 * 3. Advancing time to accrue interest and make the account liquidatable
 * 4. Performing a liquidation as a liquidator
 * 
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/liquidation-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  parseUnits,
  parseEther,
  getAddress,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";

import { executeTransactionPlan } from "@eulerxyz/euler-v2-sdk";
import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
import { printHeader, logOperationResult, stringify } from "../utils/helpers.js";
import { 
  rpcUrls,
  account,
  account2 as violatorAccount,
  initBalances,
  USDC_ADDRESS,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_USDT_VAULT,
  USDT_ADDRESS,
  testClient,
  walletClient2,
  publicClient,
  walletClient
} from "../utils/config.js";
import { Account, buildEulerSDK, eVaultAbi, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";


const VIOLATOR_SUB_ACCOUNT_ID = 1;
const VIOLATOR_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(violatorAccount.address, VIOLATOR_SUB_ACCOUNT_ID);

const LIQUIDATOR_SUB_ACCOUNT_ID = 2;
const LIQUIDATOR_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, LIQUIDATOR_SUB_ACCOUNT_ID);

// Amounts
const COLLATERAL_AMOUNT = parseUnits("10000", 6); // 10,000 USDC
const YEARS_TO_ADVANCE = 3; // Advance 3 years to accrue significant interest
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = true;

async function liquidationExample() {
  // Build the SDK
  const sdk = await buildEulerSDK({
    rpcUrls,
    accountServiceConfig: { adapter: "onchain" },
    queryCacheConfig: { enabled: false },
  });

  // ============================================================================
  // STEP 1: Violator deposits collateral and borrows at high LTV
  // ============================================================================
  console.log("\n📋 Step 1: Violator creating leveraged position...");

  // Fetch violator account
  let violatorAccountData = (await sdk.accountService.fetchAccount(mainnet.id, violatorAccount.address, { populateVaults: false })).result;

  // Calculate max borrow amount
  // We'll borrow close to max to make it risky
  const MAX_LTV = 9000n; // 90%
  const estimatedBorrowAmount = (COLLATERAL_AMOUNT * MAX_LTV) / 10000n;

  // Plan borrow for violator
  const violatorBorrowPlan = sdk.executionService.planBorrow({
    account: violatorAccountData,
    vault: EULER_PRIME_USDT_VAULT,
    amount: estimatedBorrowAmount,
    receiver: violatorAccount.address,
    borrowAccount: VIOLATOR_SUB_ACCOUNT_ADDRESS,
    collateral: {
      vault: EULER_PRIME_USDC_VAULT,
      amount: COLLATERAL_AMOUNT,
      asset: USDC_ADDRESS,
    },
  });

  // Resolve approvals for violator
  const resolvedViolatorPlan = await sdk.executionService.resolveRequiredApprovals({
    account: violatorAccount.address,
    plan: violatorBorrowPlan,
    chainId: mainnet.id,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });

  await executeTransactionPlan({
    plan: resolvedViolatorPlan,
    executionService: sdk.executionService,
    deploymentService: sdk.deploymentService,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient2),
    walletClient: walletClient2,
    publicClient,
    chain: mainnet,
    onProgress: createTransactionPlanLogger(sdk),
  });

  // Fetch updated violator account
  const violatorSubAccountAfterBorrow = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    VIOLATOR_SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;

  const violatorPosition = violatorSubAccountAfterBorrow?.positions.find(
    (p) => p.vaultAddress === EULER_PRIME_USDT_VAULT
  );
  const actualBorrowed = violatorPosition?.borrowed ?? 0n;
  console.log(`✓ Violator borrowed ${actualBorrowed / parseUnits("1", 6)} USDT`);

  // ============================================================================
  // STEP 2: Drop the price of USDC by setting a test oracle
  // ============================================================================
  console.log(`\n📋 Step 2: Setting the USDC price to 0.5 USD..`);

  await setLiquidationOracle();

  // ============================================================================
  // STEP 3: Check if violator is liquidatable
  // ============================================================================
  console.log("\n📋 Step 3: Checking violator account health and checking if liquidatable...");

  const updatedViolatorSubAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    VIOLATOR_SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;

  const [maxRepayAmount] = await publicClient.readContract({
    address: EULER_PRIME_USDT_VAULT,
    abi: eVaultAbi,
    functionName: "checkLiquidation",
    args: [account.address, VIOLATOR_SUB_ACCOUNT_ADDRESS, EULER_PRIME_USDC_VAULT],
  });

  if (maxRepayAmount == 0n) {
    console.log(`  ⚠️  Account still healthy`);
    return
  }

  // ============================================================================
  // STEP 4: Liquidator performs liquidation
  // ============================================================================
  console.log("\n📋 Step 4: Liquidator performing liquidation...");

  // Fetch liquidator account
  let liquidatorAccountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // Plan liquidation
  const liquidationPlan = sdk.executionService.planLiquidation({
    account: liquidatorAccountData,
    vault: EULER_PRIME_USDT_VAULT,
    asset: USDT_ADDRESS,
    violator: VIOLATOR_SUB_ACCOUNT_ADDRESS,
    collateral: EULER_PRIME_USDC_VAULT,
    repayAssets: maxRepayAmount * 99n / 100n, // reduce 1% to account for slippage
    minYieldBalance: 0n,
    liquidatorSubAccountAddress: LIQUIDATOR_SUB_ACCOUNT_ADDRESS,
  });

  console.log(`✓ Liquidation plan created with ${liquidationPlan.length} step(s)`);

  // Resolve approvals for liquidator
  const resolvedLiquidationPlan = await sdk.executionService.resolveRequiredApprovals({
    plan: liquidationPlan,
    account: account.address,
    chainId: mainnet.id,
    usePermit2: USE_PERMIT2,
    unlimitedApproval: UNLIMITED_APPROVAL,
  });

  // Execute liquidation
  await executeTransactionPlan({
    plan: resolvedLiquidationPlan,
    executionService: sdk.executionService,
    deploymentService: sdk.deploymentService,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    walletClient: walletClient,
    publicClient,
    chain: mainnet,
    onProgress: createTransactionPlanLogger(sdk),
  });


  const finalViolatorSubAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    VIOLATOR_SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;

  const finalLiquidatorSubAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    LIQUIDATOR_SUB_ACCOUNT_ADDRESS,
    [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
    { populateVaults: false }
  )).result;

  // Log violator account changes
  console.log("\n" + "═".repeat(80));
  console.log("VIOLATOR ACCOUNT (After Liquidation)");
  console.log("═".repeat(80));
  await logOperationResult(
    mainnet.id,
    new Account({ chainId: mainnet.id, owner: violatorAccount.address, subAccounts: { [getAddress(updatedViolatorSubAccount!.account)]: updatedViolatorSubAccount! } }),
    [finalViolatorSubAccount],
    sdk
  );

  // Log liquidator account changes
  console.log("\n" + "═".repeat(80));
  console.log("LIQUIDATOR ACCOUNT (After Liquidation)");
  console.log("═".repeat(80));
  await logOperationResult(
    mainnet.id,
    liquidatorAccountData,
    [finalLiquidatorSubAccount],
    sdk
  );
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("LIQUIDATION EXAMPLE");
initBalances()
  .then(() => liquidationExample())
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });


  export async function setLiquidationOracle() {
    await testClient.mine({ blocks: 1 })
    await testClient.increaseTime({ seconds: 1 })

    const governor = await publicClient.readContract({
      address: EULER_PRIME_USDC_VAULT,
      abi: eVaultAbi,
      functionName: "governorAdmin",
    })
    const oracle = await publicClient.readContract({
      address: EULER_PRIME_USDC_VAULT,
      abi: eVaultAbi,
      functionName: "oracle",
    })

    await testClient.setBalance({
      address: governor,
      value: parseEther('1000'),
    });

    const USDC_0ORACLE_ADAPTER = getAddress("0x6824F2D5847f323a8aA5a400fc8E1fcFf7c61450");
    const USD_ADDRESS = getAddress("0x0000000000000000000000000000000000000348");

    await walletClient.writeContract({
      address: oracle,
      chain: mainnet,
      account: governor,
      abi: parseAbi(["function govSetConfig(address base, address quote, address oracle)"]),
      functionName: "govSetConfig",
      args: [USDC_ADDRESS, USD_ADDRESS, USDC_0ORACLE_ADAPTER],
    })
  }
