/**
 * SAME-ASSET POSITION MIGRATION EXAMPLE
 *
 * This example demonstrates no-swap migration flows between two vaults that
 * share the same underlying asset.
 *
 * OPERATION:
 *   1. Deposit USDT into Euler Prime USDT Vault
 *   2. Migrate the supplied USDT position to an alternate USDT vault
 *   3. Deposit USDC as collateral and borrow USDT from Euler Prime USDT Vault
 *   4. Migrate the USDT debt position to the alternate USDT vault
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/same-asset-position-migration-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 */

import "dotenv/config";
import {
  getAddress, parseUnits } from "viem";
  import { mainnet } from "viem/chains";
  import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
  import {
  logOperationResult,
  printHeader,
  } from "../utils/helpers.js";
  import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";
  import {
  account,
  EULER_PRIME_USDC_VAULT,
  EULER_PRIME_USDT_VAULT,
  initExample,
  USDC_ADDRESS,
  USDT_ADDRESS,
  exampleExecutionCallbacks,
} from "../utils/config.js";

const SUPPLY_AMOUNT = parseUnits("500", 6);
const COLLATERAL_AMOUNT = parseUnits("2000", 6);
const BORROW_AMOUNT = parseUnits("250", 6);
const SUPPLY_SUB_ACCOUNT_ID = 1;
const BORROW_SUB_ACCOUNT_ID = 2;
const SUPPLY_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	SUPPLY_SUB_ACCOUNT_ID,
);
const BORROW_SUB_ACCOUNT_ADDRESS = getSubAccountAddress(
	account.address,
	BORROW_SUB_ACCOUNT_ID,
);
const ALTERNATE_USDT_VAULT = getAddress(
	"0x7c280DBDEf569e96c7919251bD2B0edF0734C5A8",
);

async function sameAssetPositionMigrationExample({
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

	console.log("\n=== Step 1: Deposit USDT to Source Vault ===");
	let sourceDepositPlan = sdk.executionService.planDeposit({
		vault: EULER_PRIME_USDT_VAULT,
		amount: SUPPLY_AMOUNT,
		receiver: SUPPLY_SUB_ACCOUNT_ADDRESS,
		account: accountData,
		asset: USDT_ADDRESS,
		enableCollateral: true,
	});

	await sdk.executionService.executeTransactionPlan({
		plan: sourceDepositPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	let supplySubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SUPPLY_SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDT_VAULT, ALTERNATE_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(mainnet.id, accountData, [supplySubAccount], sdk);

	console.log("\n=== Step 2: Migrate Same-Asset Supply Position ===");
	accountData.updateSubAccounts(supplySubAccount!);

	const sourcePosition = accountData.getPosition(
		SUPPLY_SUB_ACCOUNT_ADDRESS,
		EULER_PRIME_USDT_VAULT,
	);

	const supplyMigrationPlan =
		sdk.executionService.planMigrateSameAssetCollateral({
			account: accountData,
			fromVault: EULER_PRIME_USDT_VAULT,
			toVault: ALTERNATE_USDT_VAULT,
			amount: sourcePosition?.assets ?? SUPPLY_AMOUNT,
			positionAccount: SUPPLY_SUB_ACCOUNT_ADDRESS,
			toAsset: USDT_ADDRESS,
			isMax: true,
		});

	await sdk.executionService.executeTransactionPlan({
		plan: supplyMigrationPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	supplySubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			SUPPLY_SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDT_VAULT, ALTERNATE_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(mainnet.id, accountData, [supplySubAccount], sdk);

	console.log("\n=== Step 3: Deposit USDC and Borrow USDT ===");
	accountData.updateSubAccounts(supplySubAccount!);

	let collateralDepositPlan = sdk.executionService.planDeposit({
		vault: EULER_PRIME_USDC_VAULT,
		amount: COLLATERAL_AMOUNT,
		receiver: BORROW_SUB_ACCOUNT_ADDRESS,
		account: accountData,
		asset: USDC_ADDRESS,
		enableCollateral: true,
	});

	await sdk.executionService.executeTransactionPlan({
		plan: collateralDepositPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	let borrowSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			BORROW_SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, ALTERNATE_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	accountData.updateSubAccounts(supplySubAccount!, borrowSubAccount!);

	const borrowPlan = sdk.executionService.planBorrow({
		account: accountData,
		vault: EULER_PRIME_USDT_VAULT,
		amount: BORROW_AMOUNT,
		receiver: account.address,
		borrowAccount: BORROW_SUB_ACCOUNT_ADDRESS,
	});

	await sdk.executionService.executeTransactionPlan({
		plan: borrowPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	borrowSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			BORROW_SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, ALTERNATE_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(
		mainnet.id,
		accountData,
		[supplySubAccount, borrowSubAccount],
		sdk,
	);

	console.log("\n=== Step 4: Migrate Same-Asset Debt Position ===");
	accountData.updateSubAccounts(supplySubAccount!, borrowSubAccount!);

	const debtMigrationPlan = sdk.executionService.planMigrateSameAssetDebt({
		account: accountData,
		oldLiabilityVault: EULER_PRIME_USDT_VAULT,
		newLiabilityVault: ALTERNATE_USDT_VAULT,
		liabilityAccount: BORROW_SUB_ACCOUNT_ADDRESS,
		newLiabilityAsset: USDT_ADDRESS,
	});

	await sdk.executionService.executeTransactionPlan({
		plan: debtMigrationPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	borrowSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			BORROW_SUB_ACCOUNT_ADDRESS,
			[EULER_PRIME_USDC_VAULT, EULER_PRIME_USDT_VAULT, ALTERNATE_USDT_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(
		mainnet.id,
		accountData,
		[supplySubAccount, borrowSubAccount],
		sdk,
	);
}

printHeader("SAME-ASSET POSITION MIGRATION EXAMPLE");
initExample()
	.then(sameAssetPositionMigrationExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
