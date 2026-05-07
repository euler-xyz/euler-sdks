/**
 * ===============================================================================
 * WALLET TO WALLET SWAP EXAMPLE
 * ===============================================================================
 *
 * This example demonstrates a wallet-to-wallet swap flow using:
 *   1. swapService.fetchWalletSwapQuote()
 *   2. executionService.planSwapFromWallet()
 *
 * OPERATION:
 *   1. Sender wallet holds USDC
 *   2. SDK fetches a quote that transfers output directly to another wallet
 *   3. transferFromSender pulls USDC from sender into Swapper
 *   4. Swapper executes the route
 *   5. SwapVerifier transfers the output token to the receiver wallet
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/swap-from-wallet-example.ts
 *
 * ===============================================================================
 */

import "dotenv/config";
import {
  erc20Abi, formatUnits, getAddress, parseUnits } from "viem";
  import { mainnet } from "viem/chains";
  import { buildEulerSDK } from "@eulerxyz/euler-v2-sdk";
  import { printHeader } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  account,
  account2,
  initExample,
  USDC_ADDRESS,
  WETH_ADDRESS,
  exampleExecutionCallbacks,
} from "../utils/config.js";

const SWAP_AMOUNT = parseUnits("100", 6); // 100 USDC
const SWAP_QUOTE_INDEX = 0;
const THIRTY_MINUTES_FROM_NOW = Math.floor(Date.now() / 1000) + 1800;

async function readBalances(publicClient: Awaited<ReturnType<typeof initExample>>["publicClient"]) {
	const [senderUsdc, receiverWeth] = await Promise.all([
		publicClient.readContract({
			address: USDC_ADDRESS,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [account.address],
		}),
		publicClient.readContract({
			address: WETH_ADDRESS,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [account2.address],
		}),
	]);

	return { senderUsdc, receiverWeth };
}

async function swapFromWalletExample({
  walletClient,
  publicClient,
}: Awaited<ReturnType<typeof initExample>>) {
	const sdk = await buildEulerSDK();
	const accountData = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;

	console.log("\n=== Step 1: Get Wallet Swap Quote (USDC -> WETH) ===");
	console.log(`Sender: ${account.address}`);
	console.log(`Receiver: ${account2.address}`);

	const quotes = await sdk.swapService.fetchWalletSwapQuote({
		chainId: mainnet.id,
		fromAsset: USDC_ADDRESS,
		toAsset: WETH_ADDRESS,
		amount: SWAP_AMOUNT,
		receiver: account2.address,
		origin: account.address,
		slippage: 0.5,
		deadline: THIRTY_MINUTES_FROM_NOW,
	});

	const filteredQuotes = quotes.filter(
		(quote) => !quote.route.some((hop) => hop.providerName.includes("CoW")),
	);
	const selectedQuote = filteredQuotes[SWAP_QUOTE_INDEX]!;
	console.log(
		`Selected route: ${selectedQuote.route.map((hop) => hop.providerName).join(" -> ")}`,
	);
	console.log(
		`Quoted output: ${formatUnits(BigInt(selectedQuote.amountOut), 18)} WETH`,
	);

	console.log("\n=== Step 2: Plan + Execute Wallet Swap ===");
	let plan = sdk.executionService.planSwapFromWallet({
		account: accountData,
		swapQuote: selectedQuote,
		amount: SWAP_AMOUNT,
		tokenIn: USDC_ADDRESS,
	});

	const before = await readBalances(publicClient);
	console.log(
		`Sender USDC before: ${formatUnits(before.senderUsdc, 6)}, receiver WETH before: ${formatUnits(before.receiverWeth, 18)}`,
	);

	try {
		await sdk.executionService.executeTransactionPlan({
			plan,
			chainId: mainnet.id,
			account: walletAccountAddress(walletClient),
			...exampleExecutionCallbacks(walletClient),
			onProgress: createTransactionPlanLogger(sdk),
		});
	} catch (error) {
		console.error("Error executing wallet swap:", error);
		console.log(
			"\nThe swap quote might be bad. Try changing SWAP_QUOTE_INDEX to a different value.",
		);
		process.exit(1);
	}

	const after = await readBalances(publicClient);
	console.log(
		`Sender USDC after: ${formatUnits(after.senderUsdc, 6)}, receiver WETH after: ${formatUnits(after.receiverWeth, 18)}`,
	);
	console.log(
		`Receiver WETH delta: ${formatUnits(after.receiverWeth - before.receiverWeth, 18)}`,
	);
}

printHeader("WALLET TO WALLET SWAP EXAMPLE");
initExample()
	.then(swapFromWalletExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
