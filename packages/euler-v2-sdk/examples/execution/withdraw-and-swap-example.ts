/**
 * ===============================================================================
 * WITHDRAW AND SWAP EXAMPLE
 * ===============================================================================
 *
 * This example demonstrates withdrawing vault assets to the Swapper and
 * transferring the swapped output token directly to the wallet.
 *
 * OPERATION:
 *   1. Deposit USDC into Euler Prime USDC
 *   2. Fetch a USDC -> WETH quote with transferOutputToReceiver enabled
 *   3. planWithdrawAndSwap withdraws USDC to the Swapper, executes the swap,
 *      and verifies/transfers WETH to the wallet
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/withdraw-and-swap-example.ts
 *
 * ===============================================================================
 */

import "dotenv/config";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import {
	buildEulerSDK,
	getSubAccountAddress,
	SwapperMode,
} from "@eulerxyz/euler-v2-sdk";
import { fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
import {
	createTransactionPlanLogger,
	walletAccountAddress,
} from "../utils/transactionPlanLogging.js";
import {
	account,
	EULER_PRIME_USDC_VAULT,
	exampleExecutionCallbacks,
	initExample,
	USDC_ADDRESS,
	WETH_ADDRESS,
} from "../utils/config.js";

const DEPOSIT_AMOUNT = parseUnits("200", 6);
const WITHDRAW_AMOUNT = parseUnits("100", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const SWAP_QUOTE_INDEX = Number(process.env.SWAP_QUOTE_INDEX ?? 0);
const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800;

function orderUsableQuotes<T extends { route: { providerName: string }[] }>(
	quotes: T[],
	preferredIndex: number,
): T[] {
	const filtered = quotes.filter(
		(quote) => !quote.route.some((route) => route.providerName.includes("CoW")),
	);
	if (filtered.length === 0) throw new Error("No non-CoW swap quotes available");
	if (preferredIndex >= filtered.length) {
		throw new Error(`No quote found at index: ${preferredIndex}`);
	}
	return [
		...filtered.slice(preferredIndex),
		...filtered.slice(0, preferredIndex),
	];
}

async function withdrawAndSwapExample({
	walletClient,
}: Awaited<ReturnType<typeof initExample>>) {
	const sdk = await buildEulerSDK({
		accountServiceConfig: { adapter: "onchain" },
		queryCacheConfig: { enabled: false },
	});

	const accountData = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;

	console.log("\n=== Step 1: Deposit USDC ===");
	const depositPlan = sdk.executionService.planDeposit({
		account: accountData,
		vault: EULER_PRIME_USDC_VAULT,
		amount: DEPOSIT_AMOUNT,
		receiver: SUB_ACCOUNT_ADDRESS,
		asset: USDC_ADDRESS,
		enableCollateral: true,
	});

	await sdk.executionService.executeTransactionPlan({
		plan: depositPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	const [subAccountAfterDeposit] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[{ account: SUB_ACCOUNT_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] }],
	);
	accountData.updateSubAccounts(subAccountAfterDeposit!);

	console.log("\n=== Step 2: Get Withdraw Swap Quote ===");
	const quotes = await sdk.swapService.fetchSwapQuotes({
		chainId: mainnet.id,
		tokenIn: USDC_ADDRESS,
		tokenOut: WETH_ADDRESS,
		accountIn: SUB_ACCOUNT_ADDRESS,
		accountOut: zeroAddress,
		amount: WITHDRAW_AMOUNT,
		vaultIn: EULER_PRIME_USDC_VAULT,
		receiver: account.address,
		origin: account.address,
		slippage: 0.5,
		swapperMode: SwapperMode.EXACT_IN,
		isRepay: false,
		targetDebt: 0n,
		currentDebt: 0n,
		deadline: THIRTY_MINUTES_FROM_NOW,
		transferOutputToReceiver: true,
	});

	const orderedQuotes = orderUsableQuotes(quotes, SWAP_QUOTE_INDEX);

	console.log("\n=== Step 3: Execute Withdraw + Swap ===");
	let lastError: unknown;
	for (const [quoteIndex, quote] of orderedQuotes.entries()) {
		console.log(
			`Trying quote ${quoteIndex + 1}/${orderedQuotes.length}: ${formatUnits(
				WITHDRAW_AMOUNT,
				6,
			)} USDC -> ${formatUnits(BigInt(quote.amountOut), 18)} WETH via ${quote.route
				.map((route) => route.providerName)
				.join(" -> ")}`,
		);

		const plan = sdk.executionService.planWithdrawAndSwap({
			account: accountData,
			vault: EULER_PRIME_USDC_VAULT,
			assets: WITHDRAW_AMOUNT,
			owner: SUB_ACCOUNT_ADDRESS,
			swapQuote: quote,
		});

		try {
			await sdk.executionService.executeTransactionPlan({
				plan,
				chainId: mainnet.id,
				account: walletAccountAddress(walletClient),
				...exampleExecutionCallbacks(walletClient),
				onProgress: createTransactionPlanLogger(sdk),
			});
			lastError = undefined;
			break;
		} catch (error) {
			lastError = error;
			console.error("Error executing withdraw and swap:", error);
		}
	}

	if (lastError) {
		console.log("\nAll withdraw and swap quotes failed.");
		process.exit(1);
	}

	await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
		{ account: SUB_ACCOUNT_ADDRESS, vaults: [EULER_PRIME_USDC_VAULT] },
	]);
}

printHeader("WITHDRAW AND SWAP EXAMPLE");
initExample()
	.then(withdrawAndSwapExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
