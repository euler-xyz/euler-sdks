/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPAY FROM DIFFERENT VAULT DEPOSIT EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates how to repay same-asset debt by withdrawing assets
 * from a different vault deposit. It first creates a borrow position in one
 * USDT vault, creates a savings position in another USDT vault, then repays
 * the borrow vault debt from the savings vault deposit.
 *
 * OPERATION:
 *   1. Deposit USDC as collateral and borrow USDT
 *   2. Deposit USDT into a different USDT vault on another sub-account
 *   3. Deposit USDT into the liability vault to create a pre-existing position
 *   4. Fully repay USDT debt from the different vault while preserving the pre-existing liability-vault deposit
 *
 * ASSETS & VAULTS:
 *   • USDC → Euler Prime USDC Vault (collateral)
 *   • USDT → Euler Prime USDT Vault (liability being repaid)
 *   • USDT → Alternate USDT Vault (source deposit)
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/repay-from-deposit-different-vault-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  getAddress, maxUint256, parseUnits } from "viem";
  import { mainnet } from "viem/chains";
  import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
  import { fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  account,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_USDT_VAULT,
  initExample,
  rpcUrls,
  USDC_ADDRESS,
  USDT_ADDRESS,
  exampleExecutionCallbacks,
} from "../utils/config.js";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6); // 500 USDT
const SOURCE_DEPOSIT_AMOUNT = parseUnits("1000", 6); // 1000 USDT
const PRE_EXISTING_LIABILITY_DEPOSIT_AMOUNT = parseUnits("100", 6); // 100 USDT
const BORROW_SUB_ACCOUNT_ID = 1;
const SOURCE_SUB_ACCOUNT_ID = 2;
const BORROW_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	BORROW_SUB_ACCOUNT_ID,
);
const SOURCE_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	SOURCE_SUB_ACCOUNT_ID,
);
const ALTERNATE_USDT_VAULT = getAddress(
	"0x2343b4bCB96EC35D8653Fb154461fc673CB20a7e",
);

async function repayFromDifferentVaultDepositExample({ walletClient }: Awaited<ReturnType<typeof initExample>>) {
	// Build the SDK
	const sdk = await buildEulerSDK({
		rpcUrls,
		accountServiceConfig: { adapter: "onchain" },
		queryCacheConfig: { enabled: false },
	});

	// Fetch the account. NOTE: fetchAccount depends on indexing for sub-account discovery,
	// it will not detect data created on local chain, like previous example runs. Use fetchSubAccount for that.
	const accountData = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;
	const borrowSubAccountRequest = {
		account: BORROW_SUB_ACCOUNT_ADDRESS,
		vaults: [EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
	} as const;
	const sourceSubAccountRequest = {
		account: SOURCE_SUB_ACCOUNT_ADDRESS,
		vaults: [ALTERNATE_USDT_VAULT],
	} as const;

	// Step 1: Plan and execute borrow operation (deposit USDC collateral and borrow USDT)
	console.log("\n=== Step 1: Deposit USDC and Borrow USDT ===");
	let borrowPlan = sdk.executionService.planBorrow({
		account: accountData,
		vault: EULER_PRIME_USDT_VAULT,
		amount: BORROW_AMOUNT,
		receiver: account.address,
		borrowAccount: BORROW_SUB_ACCOUNT_ADDRESS,
		collateral: {
			vault: EULER_PRIME_USDC_VAULT,
			amount: COLLATERAL_AMOUNT,
			asset: USDC_ADDRESS,
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
	let [borrowSubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[borrowSubAccountRequest],
	);

	// Step 2: Deposit USDT to a different USDT vault on another sub-account
	console.log("\n=== Step 2: Deposit USDT to Alternate USDT Vault ===");

	accountData.updateSubAccounts(borrowSubAccount!);

	let sourceDepositPlan = sdk.executionService.planDeposit({
		vault: ALTERNATE_USDT_VAULT,
		amount: SOURCE_DEPOSIT_AMOUNT,
		receiver: SOURCE_SUB_ACCOUNT_ADDRESS,
		account: accountData,
		asset: USDT_ADDRESS,
		enableCollateral: false,
	});

	console.log(
		`✓ Source deposit plan created with ${sourceDepositPlan.length} step(s)`,
	);

	console.log("✓ Executing...");
	await sdk.executionService.executeTransactionPlan({
	  plan: sourceDepositPlan,
	  chainId: mainnet.id,
	  account: walletAccountAddress(walletClient),
	  ...exampleExecutionCallbacks(walletClient),
	  onProgress: createTransactionPlanLogger(sdk),
	});
	let [, sourceSubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[borrowSubAccountRequest, sourceSubAccountRequest],
	);

	// Step 3: Create a pre-existing liability-vault deposit on the borrow sub-account.
	// The full repay cleanup should preserve this deposit by skipping the leftover sweep.
	console.log(
		"\n=== Step 3: Deposit USDT into Liability Vault Before Full Repay ===",
	);

	accountData.updateSubAccounts(borrowSubAccount!, sourceSubAccount!);

	let liabilityDepositPlan = sdk.executionService.planDeposit({
		vault: EULER_PRIME_USDT_VAULT,
		amount: PRE_EXISTING_LIABILITY_DEPOSIT_AMOUNT,
		receiver: BORROW_SUB_ACCOUNT_ADDRESS,
		account: accountData,
		asset: USDT_ADDRESS,
		enableCollateral: false,
	});

	console.log(
		`✓ Liability vault deposit plan created with ${liabilityDepositPlan.length} step(s)`,
	);

	console.log("✓ Executing...");
	await sdk.executionService.executeTransactionPlan({
	  plan: liabilityDepositPlan,
	  chainId: mainnet.id,
	  account: walletAccountAddress(walletClient),
	  ...exampleExecutionCallbacks(walletClient),
	  onProgress: createTransactionPlanLogger(sdk),
	});
	[borrowSubAccount, sourceSubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[borrowSubAccountRequest, sourceSubAccountRequest],
	);

	// Step 4: Fully repay from the alternate vault. This exercises the cleanup guard:
	// pre-existing liability-vault deposit shares are preserved instead of being migrated to the source vault.
	console.log("\n=== Step 4: Fully Repay USDT Debt from Alternate USDT Vault ===");

	accountData.updateSubAccounts(borrowSubAccount!, sourceSubAccount!);

	const fullRepayPlan = sdk.executionService.planRepayFromDeposit({
		account: accountData,
		liabilityVault: EULER_PRIME_USDT_VAULT,
		liabilityAmount: maxUint256,
		receiver: BORROW_SUB_ACCOUNT_ADDRESS,
		fromVault: ALTERNATE_USDT_VAULT,
		fromAccount: SOURCE_SUB_ACCOUNT_ADDRESS,
		cleanupOnMax: true,
	});

	console.log(
		`✓ Full repay from different vault deposit plan created with ${fullRepayPlan.length} step(s)`,
	);
	console.log("✓ Executing...");

	await sdk.executionService.executeTransactionPlan({

	  plan: fullRepayPlan,

	  chainId: mainnet.id,

	  account: walletAccountAddress(walletClient),

	  ...exampleExecutionCallbacks(walletClient),

	  onProgress: createTransactionPlanLogger(sdk),

	});
	[borrowSubAccount, sourceSubAccount] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[borrowSubAccountRequest, sourceSubAccountRequest],
	);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("REPAY FROM DIFFERENT VAULT DEPOSIT EXAMPLE");
initExample().then(repayFromDifferentVaultDepositExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
