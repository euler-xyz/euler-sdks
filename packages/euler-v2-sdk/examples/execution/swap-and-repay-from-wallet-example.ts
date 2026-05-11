/**
 * ===============================================================================
 * SWAP AND REPAY FROM WALLET EXAMPLE
 * ===============================================================================
 *
 * This example demonstrates repaying an Euler debt position by swapping wallet
 * tokens directly into the liability asset.
 *
 * OPERATION:
 *   1. Deposit WETH collateral and borrow USDT
 *   2. SDK fetches an exact-input wallet USDC -> USDT repay quote
 *   3. planSwapAndRepayFromWallet pulls USDC from wallet, executes the swap,
 *      and repays part of the liability vault debt
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/swap-and-repay-from-wallet-example.ts
 *
 * ===============================================================================
 */

import "dotenv/config";
import { formatUnits, isAddressEqual, parseUnits } from "viem";
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
	EULER_PRIME_USDT_VAULT,
	EULER_PRIME_WETH_VAULT,
	exampleExecutionCallbacks,
	initExample,
	USDC_ADDRESS,
	USDT_ADDRESS,
	WETH_ADDRESS,
} from "../utils/config.js";

const COLLATERAL_AMOUNT = parseUnits("2", 18);
const BORROW_AMOUNT = parseUnits("500", 6);
const REPAY_INPUT_AMOUNT = parseUnits("100", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);
const REPAY_QUOTE_INDEX = Number(process.env.REPAY_QUOTE_INDEX ?? 0);
const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800;

function getQuoteInputAmount(quote: { amountIn: string; amountInMax: string }) {
	const amountIn = BigInt(quote.amountIn || 0);
	const amountInMax = BigInt(quote.amountInMax || 0);
	return amountInMax > 0n ? amountInMax : amountIn;
}

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

async function swapAndRepayFromWalletExample({
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

	console.log("\n=== Step 1: Deposit WETH and Borrow USDT ===");
	const borrowPlan = sdk.executionService.planBorrow({
		account: accountData,
		vault: EULER_PRIME_USDT_VAULT,
		amount: BORROW_AMOUNT,
		receiver: account.address,
		borrowAccount: SUB_ACCOUNT_ADDRESS,
		collateral: {
			vault: EULER_PRIME_WETH_VAULT,
			amount: COLLATERAL_AMOUNT,
			asset: WETH_ADDRESS,
		},
	});

	await sdk.executionService.executeTransactionPlan({
		plan: borrowPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	const [subAccountAfterBorrow] = await fetchAndLogSubAccounts(
		mainnet.id,
		accountData,
		sdk,
		[
			{
				account: SUB_ACCOUNT_ADDRESS,
				vaults: [EULER_PRIME_WETH_VAULT, EULER_PRIME_USDT_VAULT],
			},
		],
	);
	accountData.updateSubAccounts(subAccountAfterBorrow!);

	const debt =
		subAccountAfterBorrow!.positions.find((position) =>
			isAddressEqual(position.vaultAddress, EULER_PRIME_USDT_VAULT),
		)?.borrowed ?? 0n;
	if (debt === 0n) throw new Error("No USDT debt found to repay");

	console.log("\n=== Step 2: Get Wallet Repay Quote ===");
	const quotes = await sdk.swapService.fetchRepayQuotes({
		chainId: mainnet.id,
		fromVault: EULER_PRIME_USDC_VAULT,
		fromAsset: USDC_ADDRESS,
		fromAccount: SUB_ACCOUNT_ADDRESS,
		liabilityVault: EULER_PRIME_USDT_VAULT,
		liabilityAsset: USDT_ADDRESS,
		currentDebt: debt,
		toAccount: SUB_ACCOUNT_ADDRESS,
		origin: account.address,
		swapperMode: SwapperMode.EXACT_IN,
		collateralAmount: REPAY_INPUT_AMOUNT,
		slippage: 0.5,
		deadline: THIRTY_MINUTES_FROM_NOW,
	});

	const orderedQuotes = orderUsableQuotes(quotes, REPAY_QUOTE_INDEX);

	console.log("\n=== Step 3: Execute Swap + Repay ===");
	let lastError: unknown;
	for (const [quoteIndex, quote] of orderedQuotes.entries()) {
		const amountIn = getQuoteInputAmount(quote);
		console.log(
			`Trying quote ${quoteIndex + 1}/${orderedQuotes.length}: up to ${formatUnits(
				amountIn,
				6,
			)} USDC -> repay ${formatUnits(debt, 6)} USDT via ${quote.route
				.map((route) => route.providerName)
				.join(" -> ")}`,
		);

		const plan = sdk.executionService.planSwapAndRepayFromWallet({
			account: accountData,
			swapQuote: quote,
			amount: amountIn,
			tokenIn: USDC_ADDRESS,
			liabilityVault: EULER_PRIME_USDT_VAULT,
			repayAccount: SUB_ACCOUNT_ADDRESS,
			isMax: false,
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
			console.error("Error executing swap and repay:", error);
		}
	}

	if (lastError) {
		console.log("\nAll swap and repay quotes failed.");
		process.exit(1);
	}

	await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
		{
			account: SUB_ACCOUNT_ADDRESS,
			vaults: [EULER_PRIME_WETH_VAULT, EULER_PRIME_USDT_VAULT],
		},
	]);
}

printHeader("SWAP AND REPAY FROM WALLET EXAMPLE");
initExample()
	.then(swapAndRepayFromWalletExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
