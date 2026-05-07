/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BORROW FROM SAVINGS EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates how to borrow assets using existing vault shares
 * from a savings sub-account as collateral.
 *
 * OPERATION:
 *   1. Deposit USDC into a savings sub-account with collateral disabled
 *   2. Transfer some of those USDC vault shares to a borrow sub-account
 *   3. Enable USDC collateral on the borrow sub-account
 *   4. Enable USDT vault as controller
 *   5. Borrow USDT
 *
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (savings source and collateral)
 *   • USDT → Euler Prime USDT Vault (liability)
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/borrow-from-savings-example.ts
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
	exampleExecutionCallbacks,
	initExample,
	USDC_ADDRESS,
} from "../utils/config.js";

// Inputs
const SAVINGS_DEPOSIT_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("250", 6); // 250 USDT
const SAVINGS_SUB_ACCOUNT_ID = 1;
const BORROW_SUB_ACCOUNT_ID = 2;
const SAVINGS_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	SAVINGS_SUB_ACCOUNT_ID,
);
const BORROW_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	BORROW_SUB_ACCOUNT_ID,
);

async function borrowFromSavingsExample({
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
	const borrowSubAccountRequest = {
		account: BORROW_SUB_ACCOUNT_ADDRESS,
		vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
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

	let [savingsSubAccount, borrowSubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[savingsSubAccountRequest, borrowSubAccountRequest],
	);

	if (!savingsSubAccount) {
		throw new Error("Savings sub-account was not fetched after deposit");
	}

	accountData.updateSubAccounts(
		...([savingsSubAccount, borrowSubAccount].filter(
			Boolean,
		) as typeof savingsSubAccount[]),
	);

	const savingsPosition = accountData.getPosition(
		SAVINGS_SUB_ACCOUNT_ADDRESS,
		EULER_PRIME_USDC_VAULT,
	);
	const savingsSharesToUse = (savingsPosition?.shares ?? 0n) / 2n;

	if (savingsSharesToUse <= 0n) {
		throw new Error("No savings shares available to use as collateral");
	}

	// Step 2: Borrow using savings shares as collateral.
	console.log("\n=== Step 2: Borrow USDT Using Savings Shares ===");
	const borrowPlan = sdk.executionService.planBorrow({
		account: accountData,
		vault: EULER_PRIME_USDT_VAULT,
		amount: BORROW_AMOUNT,
		receiver: account.address,
		borrowAccount: BORROW_SUB_ACCOUNT_ADDRESS,
		collateral: {
			vault: EULER_PRIME_USDC_VAULT,
			amount: savingsSharesToUse,
			source: "savings",
			from: SAVINGS_SUB_ACCOUNT_ADDRESS,
		},
	});

	console.log(`✓ Borrow plan created with ${borrowPlan.length} step(s)`);
	console.log("✓ Executing...");

	await sdk.executionService.executeTransactionPlan({
		plan: borrowPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	[savingsSubAccount, borrowSubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[savingsSubAccountRequest, borrowSubAccountRequest],
	);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("BORROW FROM SAVINGS EXAMPLE");
initExample().then(borrowFromSavingsExample).catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
