/**
 * OPEN POSITION WITH COW SWAP - LIVE MAINNET EXAMPLE
 *
 * This example submits a real CoW order on mainnet. It requires a private key
 * for a funded wallet with the collateral token balance needed by the order.
 *
 * Required env:
 *   PRIVATE_KEY=0x...
 *   MAINNET_RPC_URL=https://...      # or EULER_SDK_RPC_URL_1
 *
 * Optional env:
 *   COW_OPEN_SUB_ACCOUNT_ID=1
 *   COW_OPEN_COLLATERAL_AMOUNT=100   # USDC units
 *   COW_OPEN_BORROW_AMOUNT=50        # USDT units
 *   COW_OPEN_PROVIDER=cow
 *   COW_OPEN_POLL_TIMEOUT_MS=960000  # default: CoW order window + buffer
 *
 * Run from packages/euler-v2-sdk/examples:
 *   npx tsx execution/open-position-with-cow-live-example.ts
 */

import "dotenv/config";
import {
	buildEulerSDK,
	type CowSwapTransactionPlanExecutionProgress,
	getCowSwapOrderExplorerUrl,
	getSubAccountAddress,
	pollCowSwapOrderStatus,
} from "@eulerxyz/euler-v2-sdk";
import {
	createWalletClient,
	formatUnits,
	getAddress,
	http,
	parseUnits,
	type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import {
	EULER_PRIME_USDC_VAULT,
	EULER_PRIME_USDT_VAULT,
	EULER_PRIME_WETH_VAULT,
	USDC_ADDRESS,
	USDT_ADDRESS,
	WETH_ADDRESS,
} from "../utils/config.js";
import { printHeader } from "../utils/helpers.js";

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function privateKeyFromEnv(): Hex {
	const value = requireEnv("PRIVATE_KEY");
	return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function mainnetRpcUrl(): string {
	const value =
		process.env.MAINNET_RPC_URL?.trim() ||
		process.env.EULER_SDK_RPC_URL_1?.trim();
	if (!value) {
		throw new Error("MAINNET_RPC_URL or EULER_SDK_RPC_URL_1 is required");
	}
	return value;
}

function envAddress(name: string, fallback: string) {
	return getAddress(process.env[name]?.trim() || fallback);
}

function envUnits(name: string, fallback: string, decimals: number) {
	return parseUnits(process.env[name]?.trim() || fallback, decimals);
}

function logProgress({
	status,
	hash,
	orderUid,
}: CowSwapTransactionPlanExecutionProgress) {
	if (!status) return;
	const suffix = orderUid ? ` order=${orderUid}` : hash ? ` tx=${hash}` : "";
	console.log(`  ${status}${suffix}`);
}

printHeader("OPEN POSITION WITH COW SWAP - LIVE MAINNET");

const rpcUrl = mainnetRpcUrl();
process.env.EULER_SDK_RPC_URL_1 = rpcUrl;

const owner = privateKeyToAccount(privateKeyFromEnv());
const walletClient = createWalletClient({
	account: owner,
	chain: mainnet,
	transport: http(rpcUrl),
});

const subAccountId = Number(process.env.COW_OPEN_SUB_ACCOUNT_ID || "20");
const subAccount = getSubAccountAddress(owner.address, subAccountId);
const collateralVault = envAddress(
	"COW_OPEN_COLLATERAL_VAULT",
	EULER_PRIME_USDC_VAULT,
);
const borrowVault = envAddress("COW_OPEN_BORROW_VAULT", EULER_PRIME_USDT_VAULT);
const longVault = envAddress("COW_OPEN_LONG_VAULT", EULER_PRIME_WETH_VAULT);
const collateralAsset = envAddress("COW_OPEN_COLLATERAL_ASSET", USDC_ADDRESS);
const borrowAsset = envAddress("COW_OPEN_BORROW_ASSET", USDT_ADDRESS);
const longAsset = envAddress("COW_OPEN_LONG_ASSET", WETH_ADDRESS);
const collateralAmount = envUnits("COW_OPEN_COLLATERAL_AMOUNT", "150", 6);
const borrowAmount = envUnits("COW_OPEN_BORROW_AMOUNT", "300", 6);
const provider = process.env.COW_OPEN_PROVIDER?.trim() || "cow";

const sdk = await buildEulerSDK({
	config: { rpcUrls: { [mainnet.id]: rpcUrl } },
	accountServiceConfig: { adapter: "onchain" },
	queryCacheConfig: { enabled: false },
	swapServiceConfig: { swapApiUrl: "http://localhost:3002" }
});

console.log(`Owner:      ${owner.address}`);
console.log(`Subaccount: ${subAccount}`);
console.log(`Collateral: ${formatUnits(collateralAmount, 6)} USDC`);
console.log(`Borrow:     ${formatUnits(borrowAmount, 6)} USDT`);

const account = (
	await sdk.accountService.fetchAccount(mainnet.id, owner.address, {
		populateVaults: false,
	})
).result;

console.log("\nFetching CoW quote...");
const quotes = await sdk.swapService.fetchDepositQuote({
	chainId: mainnet.id,
	fromVault: borrowVault,
	toVault: longVault,
	fromAccount: subAccount,
	toAccount: subAccount,
	fromAsset: borrowAsset,
	toAsset: longAsset,
	amount: borrowAmount,
	origin: owner.address,
	slippage: 0.5,
	provider,
	cowSwap: {
		type: "openPosition",
		owner: owner.address,
		collateralVault,
		collateralAmount,
	},
});

const quote = quotes.find((candidate) =>
	candidate.route.some((hop) => hop.providerName.toLowerCase().includes("cow")),
);
if (!quote) {
	throw new Error("No CoW quote returned");
}

console.log(
	`Quote: ${formatUnits(BigInt(quote.amountIn), 6)} USDT -> ${quote.amountOut} WETH via ${quote.route
		.map((hop) => hop.providerName)
		.join(" -> ")}`,
);

const plan = sdk.executionService.planOpenPositionWithCoW({
	account,
	collateralVault,
	collateralAmount,
	collateralAsset,
	swapQuote: quote,
});

console.log(`\nSubmitting CoW plan with ${plan.length} item(s)...`);
const result = await sdk.executionService.executeCowSwapTransactionPlan({
	plan,
	chainId: mainnet.id,
	account: owner.address,
	sendTransaction: (parameters) =>
		walletClient.sendTransaction({
			...parameters,
			account: owner,
		}),
	signTypedData: (parameters) =>
		walletClient.signTypedData({
			...parameters,
			account: owner,
		} as Parameters<typeof walletClient.signTypedData>[0]),
	onProgress: logProgress,
});

for (const orderUid of result.orderUids ?? []) {
	console.log(`\nCoW order submitted: ${orderUid}`);
	console.log(`Explorer: ${getCowSwapOrderExplorerUrl(orderUid)}`);

	console.log("Polling CoW order status...");
	const finalStatus = await pollCowSwapOrderStatus({
		chainId: mainnet.id,
		orderUid,
		timeoutMs: process.env.COW_OPEN_POLL_TIMEOUT_MS
			? Number(process.env.COW_OPEN_POLL_TIMEOUT_MS)
			: undefined,
		onStatus: (status) => {
			const detail = [
				status.competitionType ? `competition=${status.competitionType}` : "",
				status.orderType ? `lifecycle=${status.orderType}` : "",
			]
				.filter(Boolean)
				.join(" ");
			console.log(`  order status: ${status.type}${detail ? ` (${detail})` : ""}`);
		},
	});
	console.log(`Final CoW order status: ${finalStatus.type}`);
}

console.log("\nCoW order polling finished.");
