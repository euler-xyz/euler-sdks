/**
 * ===============================================================================
 * SWAP AND BORROW FROM WALLET EXAMPLE
 * ===============================================================================
 *
 * This example demonstrates opening a borrow position by swapping wallet tokens
 * into collateral first, then borrowing against the received vault deposit.
 *
 * OPERATION:
 *   1. User holds USDC in wallet
 *   2. SDK fetches a USDC -> WETH quote that deposits WETH into an Euler vault
 *   3. planSwapAndBorrowFromWallet pulls USDC from wallet, executes the swap,
 *      enables collateral/controller as needed, and borrows USDT
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/swap-and-borrow-from-wallet-example.ts
 *
 * ===============================================================================
 */

import "dotenv/config";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
import { fetchAndLogSubAccounts, printHeader } from "../utils/helpers.js";
import {
	createTransactionPlanLogger,
	walletAccountAddress,
} from "../utils/transactionPlanLogging.js";
import {
	account,
	EULER_PRIME_USDT_VAULT,
	EULER_PRIME_WETH_VAULT,
	exampleExecutionCallbacks,
	initExample,
	USDC_ADDRESS,
	WETH_ADDRESS,
} from "../utils/config.js";

const SWAP_AMOUNT = parseUnits("1000", 6);
const BORROW_AMOUNT = parseUnits("300", 6);
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

async function swapAndBorrowFromWalletExample({
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

	console.log("\n=== Step 1: Get Wallet Collateral Swap Quote ===");
	const quotes = await sdk.swapService.fetchDepositQuote({
		chainId: mainnet.id,
		fromVault: zeroAddress,
		toVault: EULER_PRIME_WETH_VAULT,
		fromAccount: zeroAddress,
		toAccount: SUB_ACCOUNT_ADDRESS,
		fromAsset: USDC_ADDRESS,
		toAsset: WETH_ADDRESS,
		amount: SWAP_AMOUNT,
		origin: account.address,
		slippage: 0.5,
		deadline: THIRTY_MINUTES_FROM_NOW,
		unusedInputReceiver: account.address,
	});

	const orderedQuotes = orderUsableQuotes(quotes, SWAP_QUOTE_INDEX);

	console.log("\n=== Step 2: Execute Swap + Borrow ===");
	let lastError: unknown;
	for (const [quoteIndex, quote] of orderedQuotes.entries()) {
		console.log(
			`Trying quote ${quoteIndex + 1}/${orderedQuotes.length}: ${formatUnits(
				SWAP_AMOUNT,
				6,
			)} USDC -> ${formatUnits(BigInt(quote.amountOut), 18)} WETH via ${quote.route
				.map((route) => route.providerName)
				.join(" -> ")}`,
		);

		const plan = sdk.executionService.planSwapAndBorrowFromWallet({
			account: accountData,
			swapQuote: quote,
			amount: SWAP_AMOUNT,
			tokenIn: USDC_ADDRESS,
			borrowVault: EULER_PRIME_USDT_VAULT,
			borrowAmount: BORROW_AMOUNT,
			borrowAccount: SUB_ACCOUNT_ADDRESS,
			collateralVault: EULER_PRIME_WETH_VAULT,
			receiver: account.address,
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
			console.error("Error executing swap and borrow:", error);
		}
	}

	if (lastError) {
		console.log("\nAll swap and borrow quotes failed.");
		process.exit(1);
	}

	await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
		{
			account: SUB_ACCOUNT_ADDRESS,
			vaults: [EULER_PRIME_WETH_VAULT, EULER_PRIME_USDT_VAULT],
		},
	]);
}

printHeader("SWAP AND BORROW FROM WALLET EXAMPLE");
initExample()
	.then(swapAndBorrowFromWalletExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
