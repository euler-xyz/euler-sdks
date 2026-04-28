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
 *   3. Repay USDT debt by withdrawing from that different USDT vault
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
import { getAddress, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";

import { executePlan } from "../utils/executor.js";
import { logOperationResult, printHeader } from "../utils/helpers.js";
import {
	account,
	EULER_PRIME_USDC_VAULT,
	EULER_PRIME_USDT_VAULT,
	initBalances,
	rpcUrls,
	USDC_ADDRESS,
	USDT_ADDRESS,
} from "../utils/config.js";

// Inputs
const COLLATERAL_AMOUNT = parseUnits("1000", 6); // 1000 USDC
const BORROW_AMOUNT = parseUnits("500", 6); // 500 USDT
const SOURCE_DEPOSIT_AMOUNT = parseUnits("1000", 6); // 1000 USDT
const REPAY_AMOUNT = parseUnits("250", 6); // 250 USDT
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
const USE_PERMIT2 = true;
const UNLIMITED_APPROVAL = false;

async function repayFromDifferentVaultDepositExample() {
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

	borrowPlan = await sdk.executionService.resolveRequiredApprovals({
		plan: borrowPlan,
		chainId: mainnet.id,
		account: account.address,
		usePermit2: USE_PERMIT2,
		unlimitedApproval: UNLIMITED_APPROVAL,
	});

	console.log("✓ Approvals resolved, executing...");
	await executePlan(borrowPlan, sdk);

	let borrowSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			BORROW_SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(mainnet.id, accountData, [borrowSubAccount], sdk);

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

	sourceDepositPlan = await sdk.executionService.resolveRequiredApprovals({
		plan: sourceDepositPlan,
		chainId: mainnet.id,
		account: account.address,
		usePermit2: USE_PERMIT2,
		unlimitedApproval: UNLIMITED_APPROVAL,
	});

	console.log("✓ Approvals resolved, executing...");
	await executePlan(sourceDepositPlan, sdk);

	let sourceSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SOURCE_SUB_ACCOUNT_ADDRESS,
			[ALTERNATE_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(
		mainnet.id,
		accountData,
		[borrowSubAccount, sourceSubAccount],
		sdk,
	);

	// Step 3: Repay debt from the different same-asset vault deposit
	console.log("\n=== Step 3: Repay USDT Debt from Alternate USDT Vault ===");

	accountData.updateSubAccounts(borrowSubAccount!, sourceSubAccount!);

	const repayPlan = sdk.executionService.planRepayFromDeposit({
		account: accountData,
		liabilityVault: EULER_PRIME_USDT_VAULT,
		liabilityAmount: REPAY_AMOUNT,
		receiver: BORROW_SUB_ACCOUNT_ADDRESS,
		fromVault: ALTERNATE_USDT_VAULT,
		fromAccount: SOURCE_SUB_ACCOUNT_ADDRESS,
	});

	console.log(
		`✓ Repay from different vault deposit plan created with ${repayPlan.length} step(s)`,
	);
	console.log("✓ Executing...");

	await executePlan(repayPlan, sdk);

	borrowSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			BORROW_SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	sourceSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SOURCE_SUB_ACCOUNT_ADDRESS,
			[ALTERNATE_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(
		mainnet.id,
		accountData,
		[borrowSubAccount, sourceSubAccount],
		sdk,
	);
}

// ============================================================================
// Run the example
// ============================================================================
printHeader("REPAY FROM DIFFERENT VAULT DEPOSIT EXAMPLE");
initBalances()
	.then(() => repayFromDifferentVaultDepositExample())
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
