/**
 * ===============================================================================
 * SIMULATE DEPOSIT WITH SWAP FROM WALLET EXAMPLE
 * ===============================================================================
 *
 * This example demonstrates the preview/simulation parity path for a wallet-backed
 * deposit-with-swap flow:
 *
 *   1. Fetch a deposit swap quote from wallet token -> vault asset
 *   2. Build planDepositWithSwapFromWallet(...)
 *   3. Simulate the full plan with stateOverrides: true
 *
 * The intent is to provide an SDK-native reference for apps that want to preview
 * deposit-with-swap execution before submitting.
 *
 * IMPORTANT:
 *   - This uses live swap quotes. Restart Anvil immediately before running if
 *     you are using a fork to avoid stale route state.
 *   - If a route fails, try a different quote index.
 *
 * RUN:
 *   npx tsx examples/simulations/simulate-deposit-with-swap-from-wallet-example.ts
 *
 * ===============================================================================
 */

import "dotenv/config";
import { formatUnits, getAddress, parseUnits, stringify, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
import { account, useAnvilRpcForSDK, USDC_ADDRESS } from "../utils/config.js";

const WSTETH_ADDRESS = getAddress("0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0");
const WSTETH_VAULT = getAddress("0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1");
const DEPOSIT_AMOUNT = parseUnits("100", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX = 0;
const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800;

async function simulateDepositWithSwapFromWalletExample() {
  useAnvilRpcForSDK();
  const sdk = await buildEulerSDK();

  console.log(`Account:         ${account.address}`);
  console.log(`Sub-account:     ${SUB_ACCOUNT_ADDRESS}`);
  console.log(
    `Input amount:    ${formatUnits(DEPOSIT_AMOUNT, 6)} USDC -> wstETH vault\n`,
  );

  const accountData = (
    await sdk.accountService.fetchAccount(mainnet.id, account.address, {
      populateVaults: false,
    })
  ).result;

  console.log("Fetching deposit swap quote...");
  const swapQuotes = await sdk.swapService.fetchDepositQuote({
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
    unusedInputReceiver: account.address,
  });

  const filteredQuotes = swapQuotes.filter(
    (quote) => !quote.route.some((hop) => hop.providerName.includes("CoW")),
  );
  const selectedQuote = filteredQuotes[SWAP_QUOTE_INDEX];
  if (!selectedQuote) {
    throw new Error("No swap quote available for the selected index.");
  }

  console.log(
    `Selected route:  ${selectedQuote.route.map((hop) => hop.providerName).join(" -> ")}`,
  );
  console.log(
    `Expected output: ${formatUnits(BigInt(selectedQuote.amountOut), 18)} wstETH\n`,
  );

  const plan = sdk.executionService.planDepositWithSwapFromWallet({
    account: accountData,
    swapQuote: selectedQuote,
    amount: DEPOSIT_AMOUNT,
    tokenIn: USDC_ADDRESS,
    enableCollateral: true,
  });

  console.log(`Plan created:    ${plan.length} item(s)`);
  console.log("Simulating plan with stateOverrides: true...\n");

  const simulation = await sdk.executionService.simulateTransactionPlan(
    mainnet.id,
    account.address,
    plan,
    { stateOverrides: true },
  );

  console.log(`Can execute:     ${simulation.canExecute}`);

  if (simulation.simulationError) {
    console.log("\nSimulation error:");
    console.log(stringify(simulation.simulationError.decoded, null, 2));
    return;
  }

  if (simulation.failedBatchItems?.length) {
    console.log("\nFailed batch items:");
    for (const failed of simulation.failedBatchItems) {
      console.log(`  #${failed.index + 1} ${failed.item.functionName}`);
      console.log(`    target: ${failed.item.targetContract}`);
      console.log(`    error:  ${failed.error}`);
      if (failed.decodedError.length > 0) {
        console.log(`    decoded: ${stringify(failed.decodedError, null, 2)}`);
      }
    }
  }

  if (simulation.rawBatchResults?.length) {
    console.log("\nRaw batch results:");
    simulation.rawBatchResults.forEach((item, index) => {
      console.log(`  #${index + 1} success=${item.success} result=${item.result}`);
    });
  }

  if (simulation.insufficientWalletAssets?.length) {
    console.log("\nWallet insufficiencies:");
    for (const requirement of simulation.insufficientWalletAssets) {
      console.log(`  - ${requirement.token}: ${requirement.amount.toString()}`);
    }
  }

  if (simulation.insufficientPermit2Allowances?.length) {
    console.log("\nPermit2 insufficiencies:");
    for (const requirement of simulation.insufficientPermit2Allowances) {
      console.log(`  - ${requirement.token}: ${requirement.amount.toString()}`);
    }
  }

  if (simulation.insufficientDirectAllowances?.length) {
    console.log("\nDirect allowance insufficiencies:");
    for (const requirement of simulation.insufficientDirectAllowances) {
      console.log(`  - ${requirement.token}: ${requirement.amount.toString()}`);
    }
  }
}

console.log("=".repeat(80));
console.log("SIMULATE DEPOSIT WITH SWAP FROM WALLET EXAMPLE");
console.log("=".repeat(80));
console.log();

simulateDepositWithSwapFromWalletExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
