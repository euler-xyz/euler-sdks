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
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
import {
	account,
	EULER_PRIME_USDC_VAULT,
	exampleExecutionCallbacks,
	initExample,
	USDC_ADDRESS,
} from "../utils/config.js";
import { logOperationResult, printHeader } from "../utils/helpers.js";
import {
	createTransactionPlanLogger,
	walletAccountAddress,
} from "../utils/transactionPlanLogging.js";

// Inputs
const SHARES_TO_MINT = parseUnits("10", 6); // Mint 10 shares
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

const ENABLE_COLLATERAL = true;
const WAD = 10n ** 18n;

function ceilDiv(a: bigint, b: bigint): bigint {
	return (a + b - 1n) / b;
}

async function mintExample({
	publicClient,
	walletClient,
}: Awaited<ReturnType<typeof initExample>>) {
	// Build the SDK
	const sdk = await buildEulerSDK();

	// Fetch the account. NOTE: fetchAccount function depends on indexing for sub-account discovery,
	// it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
	const accountData = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;
	const eVaultAbi = await sdk.abiService.fetchABI(mainnet.id, "EVault");
	const requiredAssets = (await publicClient.readContract({
		address: EULER_PRIME_USDC_VAULT,
		abi: eVaultAbi,
		functionName: "previewMint",
		args: [SHARES_TO_MINT],
	})) as bigint;
	const sharesToAssetsExchangeRateWad = ceilDiv(
		requiredAssets * WAD,
		SHARES_TO_MINT,
	);

	// Plan the mint
	const mintPlan = sdk.executionService.planMint({
		vault: EULER_PRIME_USDC_VAULT,
		shares: SHARES_TO_MINT,
		receiver: SUB_ACCOUNT_ADDRESS,
		account: accountData,
		asset: USDC_ADDRESS,
		enableCollateral: ENABLE_COLLATERAL,
		sharesToAssetsExchangeRateWad,
	});

	console.log(`\n✓ Mint plan created with ${mintPlan.length} step(s)`);
	console.log(`✓ Executing...`);

	// Execute the plan
	await sdk.executionService.executeTransactionPlan({
		plan: mintPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});
	// Fetch the updated sub-account and log the result
	const subAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDC_VAULT],
			{ populateVaults: false },
		)
	).result;

	// Log the diff between before and after
	await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("MINT EXAMPLE");
initExample().then(mintExample).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
