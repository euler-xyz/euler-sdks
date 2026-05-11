/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BORROW WITH EXPLICIT CLEANUP EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates the opt-in cleanup flow:
 *   1. Create dirty EVC state on a sub-account by enabling a stale collateral
 *      and controller.
 *   2. Build planCleanup() from the dirty account snapshot.
 *   3. Build planBorrow() for the desired borrow position.
 *   4. mergePlans([cleanupPlan, borrowPlan]) so cleanup and borrow execute
 *      together while redundant enable/disable calls are collapsed.
 *   5. Verify the resulting sub-account only has the borrow position's
 *      collateral and controller enabled.
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/borrow-with-cleanup-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import { getAddress, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import {
	buildEulerSDK,
	getSubAccountAddress,
	type TransactionPlan,
} from "@eulerxyz/euler-v2-sdk";
import {
	account,
	EULER_PRIME_USDC_VAULT,
	EULER_PRIME_USDT_VAULT,
	EULER_PRIME_WETH_VAULT,
	exampleExecutionCallbacks,
	initExample,
	USDC_ADDRESS,
} from "../utils/config.js";
import { printHeader } from "../utils/helpers.js";
import {
	createTransactionPlanLogger,
	walletAccountAddress,
} from "../utils/transactionPlanLogging.js";

const COLLATERAL_AMOUNT = parseUnits("1000", 6);
const BORROW_AMOUNT = parseUnits("500", 6);
const SUB_ACCOUNT_ID = 1;
const SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	SUB_ACCOUNT_ID,
);
const TRACKED_VAULTS = [
	EULER_PRIME_USDC_VAULT,
	EULER_PRIME_USDT_VAULT,
	EULER_PRIME_WETH_VAULT,
];

function addressSet(addresses: readonly string[]): Set<string> {
	return new Set(addresses.map((address) => getAddress(address)));
}

function assertOnlyExpectedState({
	enabledCollaterals,
	enabledControllers,
}: {
	enabledCollaterals: readonly string[];
	enabledControllers: readonly string[];
}) {
	const collaterals = addressSet(enabledCollaterals);
	const controllers = addressSet(enabledControllers);

	if (
		collaterals.size !== 1 ||
		!collaterals.has(EULER_PRIME_USDC_VAULT) ||
		controllers.size !== 1 ||
		!controllers.has(EULER_PRIME_USDT_VAULT)
	) {
		throw new Error(
			`Unexpected final EVC state. Collaterals=${JSON.stringify([...collaterals])}, controllers=${JSON.stringify([...controllers])}`,
		);
	}
}

async function borrowWithCleanupExample({
	walletClient,
}: Awaited<ReturnType<typeof initExample>>) {
	const sdk = await buildEulerSDK({
		accountServiceConfig: { adapter: "onchain" },
		queryCacheConfig: { enabled: false },
	});

	const walletAddress = walletAccountAddress(walletClient);

	console.log("\n=== Creating dirty EVC state ===");
	const dirtyPlan: TransactionPlan = sdk.executionService.convertBatchItemsToPlan(
		[
			sdk.executionService.encodeEnableCollateral(
				mainnet.id,
				SUB_ACCOUNT_ADDRESS,
				EULER_PRIME_WETH_VAULT,
			),
			sdk.executionService.encodeEnableController(
				mainnet.id,
				SUB_ACCOUNT_ADDRESS,
				EULER_PRIME_WETH_VAULT,
			),
		],
		"createDirtyState",
	);

	await sdk.executionService.executeTransactionPlan({
		plan: dirtyPlan,
		chainId: mainnet.id,
		account: walletAddress,
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	let accountData = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;
	const dirtySubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SUB_ACCOUNT_ADDRESS,
			TRACKED_VAULTS,
			{ populateVaults: false },
		)
	).result;
	if (!dirtySubAccount) {
		throw new Error("Dirty sub-account not found");
	}
	accountData.updateSubAccounts(dirtySubAccount);

	console.log("Dirty enabled collaterals:", dirtySubAccount.enabledCollaterals);
	console.log("Dirty enabled controllers:", dirtySubAccount.enabledControllers);

	console.log("\n=== Merging explicit cleanup with borrow ===");
	const cleanupPlan = sdk.executionService.planCleanup({
		account: accountData,
		subAccount: SUB_ACCOUNT_ADDRESS,
	});
	const borrowPlan = sdk.executionService.planBorrow({
		account: accountData,
		vault: EULER_PRIME_USDT_VAULT,
		amount: BORROW_AMOUNT,
		receiver: account.address,
		borrowAccount: SUB_ACCOUNT_ADDRESS,
		collateral: {
			vault: EULER_PRIME_USDC_VAULT,
			amount: COLLATERAL_AMOUNT,
			asset: USDC_ADDRESS,
		},
	});
	const mergedPlan = sdk.executionService.mergePlans([cleanupPlan, borrowPlan]);

	await sdk.executionService.executeTransactionPlan({
		plan: mergedPlan,
		chainId: mainnet.id,
		account: walletAddress,
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	const cleanedSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SUB_ACCOUNT_ADDRESS,
			TRACKED_VAULTS,
			{ populateVaults: false },
		)
	).result;
	if (!cleanedSubAccount) {
		throw new Error("Cleaned sub-account not found");
	}

	assertOnlyExpectedState(cleanedSubAccount);
	console.log("\n✓ Cleanup + borrow left only the borrow position state enabled");
	console.log("Clean enabled collaterals:", cleanedSubAccount.enabledCollaterals);
	console.log("Clean enabled controllers:", cleanedSubAccount.enabledControllers);
}

printHeader("BORROW WITH EXPLICIT CLEANUP EXAMPLE");
initExample().then(borrowWithCleanupExample).catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
