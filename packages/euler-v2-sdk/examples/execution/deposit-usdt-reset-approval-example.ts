/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEPOSIT USDT RESET APPROVAL EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates a direct-approval USDT deposit when the wallet
 * already has a nonzero but insufficient allowance. USDT requires resetting
 * allowance to zero before setting a new nonzero allowance.
 *
 * OPERATION:
 *   • Create a stale 1 USDT-unit approval to Euler Prime USDT Vault
 *   • Resolve a deposit plan with Permit2 disabled
 *   • Execute reset-to-zero approval, target approval, then EVC batch
 *
 * ASSETS & VAULTS:
 *   • USDT → Euler Prime USDT Vault
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/deposit-usdt-reset-approval-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  erc20Abi, parseUnits } from "viem";
  import { mainnet } from "viem/chains";
  import { printHeader, logOperationResult } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  account,
  EULER_PRIME_USDT_VAULT,
  initExample,
  rpcUrls,
  USDT_ADDRESS,
  exampleExecutionCallbacks,
} from "../utils/config.js";
import {
	buildEulerSDK,
	getSubAccountAddress,
} from "@eulerxyz/euler-v2-sdk";

const DEPOSIT_AMOUNT = parseUnits("10", 6);
const STALE_APPROVAL_AMOUNT = 1n;
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const ENABLE_COLLATERAL = true;

async function createStaleUsdtApproval({
  walletClient,
  publicClient,
}: Awaited<ReturnType<typeof initExample>>) {
	const hash = await walletClient.writeContract({
		account: walletAccountAddress(walletClient),
		address: USDT_ADDRESS,
		chain: mainnet,
		abi: erc20Abi,
		functionName: "approve",
		args: [EULER_PRIME_USDT_VAULT, STALE_APPROVAL_AMOUNT],
	});
	await publicClient.waitForTransactionReceipt({ hash });
	console.log("✓ Created stale USDT approval");
}

async function depositUsdtResetApprovalExample(
  context: Awaited<ReturnType<typeof initExample>>,
) {
  const { walletClient } = context;
	const sdk = await buildEulerSDK({ rpcUrls });

	await createStaleUsdtApproval(context);

	const accountData = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;

	let depositPlan = sdk.executionService.planDeposit({
		vault: EULER_PRIME_USDT_VAULT,
		amount: DEPOSIT_AMOUNT,
		receiver: SUB_ACCOUNT_ADDRESS,
		account: accountData,
		asset: USDT_ADDRESS,
		enableCollateral: ENABLE_COLLATERAL,
	});
	console.log("✓ Executing deposit plan with stale approval...");

	await sdk.executionService.executeTransactionPlan({
		plan: depositPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	const subAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(mainnet.id, accountData, [subAccount], sdk);
}

printHeader("DEPOSIT USDT RESET APPROVAL EXAMPLE");
initExample()
	.then(depositUsdtResetApprovalExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
