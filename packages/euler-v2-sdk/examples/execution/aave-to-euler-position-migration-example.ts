/**
 * AAVE -> EULER POSITION MIGRATION EXAMPLE
 *
 * This example prepares an Aave V3 WETH/USDC variable-debt position on a
 * mainnet fork and migrates it into Euler without closing the user's borrowed
 * USDC exposure.
 *
 * OPERATION:
 *   1. Wrap ETH to WETH, supply WETH collateral to Aave, and borrow USDC
 *   2. Sign an Aave aToken permit for the Euler SwapVerifier
 *   3. Borrow USDC on Euler, repay Aave, transfer/withdraw Aave collateral,
 *      and deposit WETH collateral to Euler
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/aave-to-euler-position-migration-example.ts
 */

import "dotenv/config";
import {
	erc20Abi,
	formatUnits,
	getAddress,
	maxUint256,
	parseAbi,
	parseUnits,
	type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import {
	AAVE_CONNECTOR_ID,
	aaveV3PoolAbi,
	buildEulerSDK,
	getSubAccountAddress,
	type AavePositionRef,
	type MigrationAuthorizationRequest,
} from "@eulerxyz/euler-v2-sdk";
import { logOperationResult, printHeader } from "../utils/helpers.js";
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
	USDC_ADDRESS,
	WETH_ADDRESS,
} from "../utils/config.js";

const AAVE_POOL = getAddress("0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2");
const AAVE_WETH_USDC_POSITION: AavePositionRef = {
	pool: AAVE_POOL,
	collateralAsset: WETH_ADDRESS,
	debtAsset: USDC_ADDRESS,
};
const WETH_DEPOSIT_ABI = parseAbi(["function deposit() payable"]);
const COLLATERAL_AMOUNT = parseUnits("1", 18);
const AAVE_BORROW_AMOUNT = parseUnits("250", 6);
const MIGRATION_SUB_ACCOUNT_ID = 9;
const EULER_ACCOUNT = getSubAccountAddress(
	account.address,
	MIGRATION_SUB_ACCOUNT_ID,
);

async function aaveToEulerPositionMigrationExample({
	walletClient,
	publicClient,
}: Awaited<ReturnType<typeof initExample>>) {
	const sdk = await buildEulerSDK({
		accountServiceConfig: { adapter: "onchain" },
		queryCacheConfig: { enabled: false },
	});
	const walletAccount = walletClient.account;
	if (!walletAccount || typeof walletAccount === "string") {
		throw new Error("Example wallet client must have a local account");
	}

	const accountDataBefore = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;

	console.log("\n=== Step 1: Prepare Aave Position ===");
	await sendAndWait(
		publicClient,
		walletClient.writeContract({
			address: WETH_ADDRESS,
			abi: WETH_DEPOSIT_ABI,
			functionName: "deposit",
			value: COLLATERAL_AMOUNT,
			account: walletAccount,
			chain: mainnet,
			gas: 200_000n,
		}),
		"Wrapped ETH to WETH",
	);
	await sendAndWait(
		publicClient,
		walletClient.writeContract({
			address: WETH_ADDRESS,
			abi: erc20Abi,
			functionName: "approve",
			args: [AAVE_POOL, maxUint256],
			account: walletAccount,
			chain: mainnet,
			gas: 200_000n,
		}),
		"Approved Aave Pool for WETH collateral",
	);
	await sendAndWait(
		publicClient,
		walletClient.writeContract({
			address: AAVE_POOL,
			abi: aaveV3PoolAbi,
			functionName: "supply",
			args: [WETH_ADDRESS, COLLATERAL_AMOUNT, account.address, 0],
			account: walletAccount,
			chain: mainnet,
			gas: 1_000_000n,
		}),
		"Supplied WETH collateral to Aave",
	);
	await sendAndWait(
		publicClient,
		walletClient.writeContract({
			address: AAVE_POOL,
			abi: aaveV3PoolAbi,
			functionName: "borrow",
			args: [USDC_ADDRESS, AAVE_BORROW_AMOUNT, 2n, 0, account.address],
			account: walletAccount,
			chain: mainnet,
			gas: 1_000_000n,
		}),
		"Borrowed USDC from Aave",
	);

	const sourcePosition = await sdk.positionMigrationService.getPosition({
		connectorId: AAVE_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		positionRef: AAVE_WETH_USDC_POSITION,
	});
	console.log(`  Aave debt: ${formatUnits(sourcePosition.debt.amount, 6)} USDC`);
	console.log(
		`  Aave collateral: ${formatUnits(sourcePosition.collateral.amount, 18)} WETH`,
	);

	console.log("\n=== Step 2: Sign Aave aToken Permit ===");
	const eulerTarget = {
		eulerAccount: EULER_ACCOUNT,
		borrowVault: EULER_PRIME_USDC_VAULT,
		collateralVault: EULER_PRIME_WETH_VAULT,
	};
	const authorizationRequest =
		await sdk.positionMigrationService.getAuthorization({
			direction: "external-to-euler",
			connectorId: AAVE_CONNECTOR_ID,
			chainId: mainnet.id,
			owner: account.address,
			position: sourcePosition,
			target: eulerTarget,
			deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 60),
		});
	const signedAuthorization = authorizationRequest
		? {
				request: authorizationRequest,
				signature: (await signTypedDataAuthorization(
					walletClient,
					walletAccount,
					authorizationRequest,
				)) as Hex,
			}
		: undefined;
	console.log(
		signedAuthorization
			? "  Signed Aave aToken permit for Euler SwapVerifier"
			: "  Aave aToken allowance already set",
	);

	console.log("\n=== Step 3: Migrate Aave Position to Euler ===");
	const migrationPlan = await sdk.positionMigrationService.planMigration({
		direction: "external-to-euler",
		connectorId: AAVE_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		position: sourcePosition,
		target: eulerTarget,
		authorization: signedAuthorization,
	});

	await sdk.executionService.executeTransactionPlan({
		plan: migrationPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	const sourcePositionAfter = await sdk.positionMigrationService.getPosition({
		connectorId: AAVE_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		positionRef: AAVE_WETH_USDC_POSITION,
	});
	console.log(
		`  Aave debt after migration: ${formatUnits(
			sourcePositionAfter.debt.amount,
			6,
		)} USDC`,
	);
	console.log(
		`  Aave collateral after migration: ${formatUnits(
			sourcePositionAfter.collateral.amount,
			18,
		)} WETH`,
	);

	const eulerSubAccount = (
		await sdk.accountService.fetchSubAccount(
			mainnet.id,
			EULER_ACCOUNT,
			[EULER_PRIME_USDC_VAULT, EULER_PRIME_WETH_VAULT],
			{ populateVaults: false },
		)
	).result;

	await logOperationResult(
		mainnet.id,
		accountDataBefore,
		[eulerSubAccount],
		sdk,
	);
}

async function sendAndWait(
	publicClient: Awaited<ReturnType<typeof initExample>>["publicClient"],
	hashPromise: Promise<Hex>,
	label: string,
) {
	const hash = await hashPromise;
	await publicClient.waitForTransactionReceipt({ hash });
	console.log(`  ✓ ${label}`);
}

async function signTypedDataAuthorization(
	walletClient: Awaited<ReturnType<typeof initExample>>["walletClient"],
	walletAccount: Exclude<
		Awaited<ReturnType<typeof initExample>>["walletClient"]["account"],
		string | undefined
	>,
	authorizationRequest: MigrationAuthorizationRequest | undefined,
) {
	if (!authorizationRequest || authorizationRequest.kind !== "typedData") {
		throw new Error("Expected a typed-data migration authorization request");
	}

	const typedData = authorizationRequest.typedData;
	return walletClient.signTypedData({
		account: walletAccount,
		domain: typedData.domain,
		types: typedData.types,
		primaryType: typedData.primaryType,
		message: typedData.message,
	} as never);
}

printHeader("AAVE -> EULER POSITION MIGRATION EXAMPLE");
initExample()
	.then(aaveToEulerPositionMigrationExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
