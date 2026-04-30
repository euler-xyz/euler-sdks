/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BORROW WITH PYTH EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates how to borrow assets from an Euler vault that
 * uses Pyth oracles for price feeds. The Pyth plugin automatically detects
 * oracle dependencies and prepends price update calls to the transaction.
 *
 * OPERATION:
 *   1. Deposit LBTC as collateral
 *   2. Enable WBTC vault as controller
 *   3. Borrow WBTC against LBTC collateral
 *
 * ASSETS & VAULTS:
 *   • LBTC → Collateral vault 0xA203...0148
 *   • WBTC → Borrow vault 0x82D2...6AEE
 *
 * PYTH PLUGIN:
 *   The Pyth plugin detects that the vaults use Pyth oracles and automatically:
 *   1. Collects Pyth feed IDs from both vault oracle adapters
 *   2. Fetches latest price data from the Hermes API
 *   3. Prepends updatePriceFeeds calls to the EVC batch
 *   4. Includes the required ETH fee for the Pyth contract
 *   This ensures oracle prices are fresh when the borrow is executed.
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/borrow-with-pyth-example.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  getAddress,
  parseUnits,
  parseEther,
  erc20Abi,
  createWalletClient,
  http,
  } from "viem";
  import { mainnet } from "viem/chains";
  import { printHeader, logOperationResult } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  rpcUrls,
  account,
  initExample,
  exampleExecutionCallbacks,
} from "../utils/config.js";
import { buildEulerSDK, createPythPlugin, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

// ── Vault addresses ──
const WBTC_BORROW_VAULT = getAddress("0x82D2CE1f71cbe391c05E21132811e5172d51A6EE");
const LBTC_COLLATERAL_VAULT = getAddress("0xA2038a5B7Ce1C195F0C52b77134c5369CCfe0148");

// ── Asset addresses (underlying tokens) ──
const LBTC_ADDRESS = getAddress("0x8236a87084f8B84306f72007F36F2618A5634494");

// ── Whale address for funding test account with LBTC ──
const LBTC_WHALE = "0x79851BB0db6b03F348fA9c98ef5D23AD3B03b014";

// ── Inputs ──
const COLLATERAL_AMOUNT = parseUnits("0.00005", 8); // 0.00005 LBTC (8 decimals)
const BORROW_AMOUNT = parseUnits("0.000001", 8);    // 0.000001 WBTC (8 decimals)
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const ANVIL_RPC_URL = "http://127.0.0.1:8545";

/**
 * Fund the test account with LBTC from a whale address on the Anvil fork.
 */
async function fundLbtcForExample(
  testClient: Awaited<ReturnType<typeof initExample>>["testClient"],
) {
  await testClient.setBalance({
    address: LBTC_WHALE,
    value: parseEther("10"),
  });

  const whaleWc = createWalletClient({
    account: LBTC_WHALE,
    chain: mainnet,
    transport: http(ANVIL_RPC_URL),
  });

  await whaleWc.writeContract({
    address: LBTC_ADDRESS,
    abi: erc20Abi,
    functionName: "transfer",
    args: [account.address, parseUnits("0.00009", 8)],
  });

  await testClient.setBalance({
    address: account.address,
    value: parseEther("1000"),
  });
}

async function borrowWithPythExample({
  walletClient,
  testClient,
}: Awaited<ReturnType<typeof initExample>>) {
  await fundLbtcForExample(testClient);

  // Build the SDK with the Pyth plugin enabled
  const sdk = await buildEulerSDK({
    rpcUrls,
    plugins: [createPythPlugin()],
    accountServiceConfig: { adapter: "onchain" },
    queryCacheConfig: { enabled: false },
  });

  // Fetch vault entities — the Pyth plugin needs oracle adapter info from these
  const [borrowVaultResult, collateralVaultResult] = await Promise.all([
    sdk.eVaultService.fetchVault(mainnet.id, WBTC_BORROW_VAULT),
    sdk.eVaultService.fetchVault(mainnet.id, LBTC_COLLATERAL_VAULT),
  ]);
  const borrowVault = borrowVaultResult.result;
  const collateralVault = collateralVaultResult.result;
  if (!borrowVault || !collateralVault) {
    throw new Error("Failed to load borrow or collateral vault");
  }

  console.log(`Borrow vault:     ${borrowVault.shares.name} (${borrowVault.asset.symbol})`);
  console.log(`Collateral vault: ${collateralVault.shares.name} (${collateralVault.asset.symbol})`);

  // Fetch account state
  let accountData = (await sdk.accountService.fetchAccount(mainnet.id, account.address, { populateVaults: false })).result;

  // Plan the borrow operation (deposits collateral + borrows in one batch)
  let borrowPlan = sdk.executionService.planBorrow({
    account: accountData,
    vault: WBTC_BORROW_VAULT,
    amount: BORROW_AMOUNT,
    receiver: account.address,
    borrowAccount: SUB_ACCOUNT_ADDRESS,
    collateral: {
      vault: LBTC_COLLATERAL_VAULT,
      amount: COLLATERAL_AMOUNT,
      asset: LBTC_ADDRESS,
    },
  });

  console.log(`\n✓ Borrow plan created with ${borrowPlan.length} step(s)`);

  // Process plugins — Pyth plugin will:
  //   1. Discover Pyth feeds from both vault oracles (liability + collateral)
  //   2. Fetch latest prices from Hermes API
  //   3. Prepend updatePriceFeeds batch items with the required ETH fee
  borrowPlan = await sdk.processPlugins(borrowPlan, {
    chainId: mainnet.id,
    sender: account.address,
    vaults: [borrowVault, collateralVault],
  });

  console.log(`✓ Plugins processed (Pyth price updates prepended)`);

  console.log(`✓ Executing...`);

  // Execute the plan (the executor sums batch item values for the Pyth fee)
  await sdk.executionService.executeTransactionPlan({
    plan: borrowPlan,
    chainId: mainnet.id,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });

  // Fetch the updated sub-account and log the result
  const subAccount = (await sdk.accountService.fetchSubAccount(
    mainnet.id,
    SUB_ACCOUNT_ADDRESS,
    [LBTC_COLLATERAL_VAULT, WBTC_BORROW_VAULT],
    { populateVaults: false }
  )).result;

  // Log the diff between before and after
  await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("BORROW WITH PYTH EXAMPLE");
initExample().then(borrowWithPythExample).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
