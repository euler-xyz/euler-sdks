/**
 * ===============================================================================
 * MULTIPLY SAME-ASSET EXAMPLE
 * ===============================================================================
 *
 * This example demonstrates opening a leveraged same-asset position without a
 * swap. The borrowed asset is deposited into another vault for the same asset.
 *
 * OPERATION:
 *   1. Deposit WETH as initial collateral
 *   2. Enable the Prime USDC vault as controller
 *   3. Borrow USDC from the Prime USDC vault directly to another USDC vault
 *   4. Skim the borrowed USDC into the long USDC vault
 *   5. Enable the long USDC vault as collateral
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Restart Anvil immediately before running: npm run anvil
 *   3. Run: npx tsx execution/multiply-same-asset-example.ts
 *
 * ===============================================================================
 */

import "dotenv/config";
import { getAddress, parseUnits } from "viem";
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
	EULER_PRIME_WETH_VAULT,
	exampleExecutionCallbacks,
	initExample,
	WETH_ADDRESS,
} from "../utils/config.js";

const EULER_YIELD_USDC_VAULT = getAddress(
	"0xe0a80d35bB6618CBA260120b279d357978c42BCE",
);

const COLLATERAL_AMOUNT = parseUnits("2", 18);
const LIABILITY_AMOUNT = parseUnits("1000", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(account.address, SUB_ACCOUNT_ID);

async function multiplySameAssetExample({
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

	console.log("\n=== Step 1: Plan Same-Asset Multiply ===");
	const plan = sdk.executionService.planMultiplySameAsset({
		account: accountData,
		collateralVault: EULER_PRIME_WETH_VAULT,
		collateralAmount: COLLATERAL_AMOUNT,
		collateralAsset: WETH_ADDRESS,
		liabilityVault: EULER_PRIME_USDC_VAULT,
		liabilityAmount: LIABILITY_AMOUNT,
		longVault: EULER_YIELD_USDC_VAULT,
		receiver: SUB_ACCOUNT_ADDRESS,
	});

	console.log(`Same-asset multiply plan created with ${plan.length} step(s)`);
	console.log("Executing...");

	await sdk.executionService.executeTransactionPlan({
		plan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	await fetchAndLogSubAccounts(mainnet.id, accountData, sdk, [
		{
			account: SUB_ACCOUNT_ADDRESS,
			vaults: [
				EULER_PRIME_WETH_VAULT,
				EULER_PRIME_USDC_VAULT,
				EULER_YIELD_USDC_VAULT,
			],
		},
	]);
}

printHeader("MULTIPLY SAME-ASSET EXAMPLE");
initExample()
	.then(multiplySameAssetExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
