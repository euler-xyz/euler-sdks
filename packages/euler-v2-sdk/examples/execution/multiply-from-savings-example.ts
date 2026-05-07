/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTIPLY FROM SAVINGS EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates how to open a leveraged position using existing
 * vault shares from a savings sub-account as the initial collateral source.
 *
 * OPERATION:
 *   1. Deposit USDC into a savings sub-account with collateral disabled
 *   2. Fetch a live swap quote from USDT to WETH
 *   3. Transfer some USDC vault shares to a multiply sub-account
 *   4. Enable USDC collateral and USDT controller on the multiply sub-account
 *   5. Borrow USDT, swap USDT → WETH, and deposit WETH as long collateral
 *
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (savings source and initial collateral)
 *   • USDT → Euler Prime USDT Vault (liability)
 *   • WETH → Euler Prime WETH Vault (long position collateral)
 *
 * ⚠️  IMPORTANT - LIVE SWAP QUOTES:
 *   • This example fetches real-time swap quotes from DEX aggregators
 *   • Restart Anvil immediately before running to avoid stale blockchain state
 *   • If the swap fails, try changing SWAP_QUOTE_INDEX to use a different provider
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/multiply-from-savings-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
import { fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
import {
	createTransactionPlanLogger,
	walletAccountAddress,
} from "../utils/transactionPlanLogging.js";
import {
	account,
	EULER_PRIME_USDC_VAULT,
	EULER_PRIME_USDT_VAULT,
	EULER_PRIME_WETH_VAULT,
	exampleExecutionCallbacks,
	initExample,
	USDC_ADDRESS,
	USDT_ADDRESS,
	WETH_ADDRESS,
} from "../utils/config.js";

// Inputs
const SAVINGS_DEPOSIT_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const LIABILITY_AMOUNT = parseUnits("50", 6); // 50 USDT
const SAVINGS_SUB_ACCOUNT_ID = 1;
const MULTIPLY_SUB_ACCOUNT_ID = 2;
const SAVINGS_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	SAVINGS_SUB_ACCOUNT_ID,
);
const MULTIPLY_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	MULTIPLY_SUB_ACCOUNT_ID,
);
const SWAP_QUOTE_INDEX = 0; // Change this if swap quote is bad

const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800;

async function multiplyFromSavingsExample({
	walletClient,
}: Awaited<ReturnType<typeof initExample>>) {
	// Build the SDK
	const sdk = await buildEulerSDK({
		accountServiceConfig: { adapter: "onchain" },
		queryCacheConfig: { enabled: false },
	});

	// Fetch the account. NOTE: fetchAccount depends on indexing for sub-account discovery,
	// it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
	let accountData = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;

	const savingsSubAccountRequest = {
		account: SAVINGS_SUB_ACCOUNT_ADDRESS,
		vaults: [EULER_PRIME_USDC_VAULT],
	} as const;
	const multiplySubAccountRequest = {
		account: MULTIPLY_SUB_ACCOUNT_ADDRESS,
		vaults: [
			EULER_PRIME_USDC_VAULT,
			EULER_PRIME_USDT_VAULT,
			EULER_PRIME_WETH_VAULT,
		],
	} as const;

	// Step 1: Create an existing savings position.
	console.log("\n=== Step 1: Deposit USDC into Savings Sub-account ===");
	const savingsPlan = sdk.executionService.planDeposit({
		vault: EULER_PRIME_USDC_VAULT,
		amount: SAVINGS_DEPOSIT_AMOUNT,
		receiver: SAVINGS_SUB_ACCOUNT_ADDRESS,
		account: accountData,
		asset: USDC_ADDRESS,
		enableCollateral: false,
	});

	console.log(`✓ Savings deposit plan created with ${savingsPlan.length} step(s)`);
	console.log("✓ Executing...");

	await sdk.executionService.executeTransactionPlan({
		plan: savingsPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	let [savingsSubAccount, multiplySubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[savingsSubAccountRequest, multiplySubAccountRequest],
	);

	if (!savingsSubAccount) {
		throw new Error("Savings sub-account was not fetched after deposit");
	}

	accountData.updateSubAccounts(
		...([savingsSubAccount, multiplySubAccount].filter(
			Boolean,
		) as typeof savingsSubAccount[]),
	);

	const savingsPosition = accountData.getPosition(
		SAVINGS_SUB_ACCOUNT_ADDRESS,
		EULER_PRIME_USDC_VAULT,
	);
	const savingsSharesToUse = (savingsPosition?.shares ?? 0n) / 2n;
	const savingsAssetsToUse = (savingsPosition?.assets ?? 0n) / 2n;

	if (savingsSharesToUse <= 0n || savingsAssetsToUse <= 0n) {
		throw new Error("No savings position available to use as collateral");
	}

	// Step 2: Get swap quote from USDT (liability asset) to WETH (long asset)
	console.log("\n=== Step 2: Fetch Swap Quote from USDT to WETH ===");
	const swapQuotes = await sdk.swapService.fetchDepositQuote({
		chainId: mainnet.id,
		fromVault: EULER_PRIME_USDT_VAULT,
		toVault: EULER_PRIME_WETH_VAULT,
		fromAccount: MULTIPLY_SUB_ACCOUNT_ADDRESS,
		toAccount: MULTIPLY_SUB_ACCOUNT_ADDRESS,
		fromAsset: USDT_ADDRESS,
		toAsset: WETH_ADDRESS,
		amount: LIABILITY_AMOUNT,
		origin: account.address,
		slippage: 0.5,
		deadline: THIRTY_MINUTES_FROM_NOW,
	});

	const filteredSwapQuotes = swapQuotes.filter(
		(q) => !q.route.some((r) => r.providerName.includes("CoW")),
	);

	if (filteredSwapQuotes.length === 0) {
		throw new Error("No swap quotes available");
	}

	if (SWAP_QUOTE_INDEX >= filteredSwapQuotes.length) {
		throw new Error(`No quote found at index: ${SWAP_QUOTE_INDEX}`);
	}

	const swapQuote = filteredSwapQuotes[SWAP_QUOTE_INDEX]!;
	console.log(
		`✓ Swap quote received: ${LIABILITY_AMOUNT} USDT → ${swapQuote.amountOut} WETH ${swapQuote.route.map((r) => r.providerName).join(" → ")}`,
	);

	// Step 3: Multiply using savings shares as initial collateral.
	console.log("\n=== Step 3: Multiply Using Savings Shares ===");
	const multiplyPlan = sdk.executionService.planMultiplyWithSwap({
		account: accountData,
		collateralVault: EULER_PRIME_USDC_VAULT,
		collateralAmount: savingsAssetsToUse,
		collateralAsset: USDC_ADDRESS,
		collateralShareSource: {
			from: SAVINGS_SUB_ACCOUNT_ADDRESS,
			shares: savingsSharesToUse,
		},
		swapQuote,
	});

	console.log(`✓ Multiply plan created with ${multiplyPlan.length} step(s)`);
	console.log("✓ Executing...");

	try {
		await sdk.executionService.executeTransactionPlan({
			plan: multiplyPlan,
			chainId: mainnet.id,
			account: walletAccountAddress(walletClient),
			...exampleExecutionCallbacks(walletClient),
			onProgress: createTransactionPlanLogger(sdk),
		});
	} catch (error) {
		console.error("Error executing multiply:", error);
		console.log(
			"\n\nThe swap quote might be bad. Try setting SWAP_QUOTE_INDEX to a different value.",
		);
		process.exit(1);
	}

	[savingsSubAccount, multiplySubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[savingsSubAccountRequest, multiplySubAccountRequest],
	);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("MULTIPLY FROM SAVINGS EXAMPLE");
initExample().then(multiplyFromSavingsExample).catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
