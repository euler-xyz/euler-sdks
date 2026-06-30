/**
 * MORPHO -> EULER POSITION MIGRATION EXAMPLE
 *
 * This example prepares a Morpho Blue WETH/USDC position on a mainnet fork and
 * migrates it into Euler without closing the user's borrowed USDC exposure.
 *
 * OPERATION:
 *   1. Wrap ETH to WETH and supply WETH collateral to Morpho
 *   2. Borrow USDC from Morpho
 *   3. Sign Morpho authorization for the Euler SwapVerifier
 *   4. Borrow USDC on Euler, repay Morpho, withdraw WETH, deposit WETH to Euler
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/morpho-to-euler-position-migration-example.ts
 */

import "dotenv/config";
import { erc20Abi, formatUnits, getAddress, maxUint256, parseAbi, parseUnits, type Hex } from "viem";
import { mainnet } from "viem/chains";
import {
	buildEulerSDK,
	getMorphoMarketId,
	getSubAccountAddress,
	MORPHO_CONNECTOR_ID,
	morphoBlueAbi,
	type MorphoMarketParams,
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

const MORPHO_BLUE = getAddress("0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb");
const MORPHO_WETH_USDC_MARKET_ID =
	"0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd" as const;
const MORPHO_WETH_USDC_MARKET: MorphoMarketParams = {
	loanToken: USDC_ADDRESS,
	collateralToken: WETH_ADDRESS,
	oracle: getAddress("0x0F948CBa8231Db7898ef36A4212581Ad7b1B4580"),
	irm: getAddress("0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC"),
	lltv: 860000000000000000n,
};

const WETH_DEPOSIT_ABI = parseAbi(["function deposit() payable"]);
const COLLATERAL_AMOUNT = parseUnits("1", 18);
const MORPHO_BORROW_AMOUNT = parseUnits("250", 6);
const MIGRATION_SUB_ACCOUNT_ID = 7;
const EULER_ACCOUNT = getSubAccountAddress(
	account.address,
	MIGRATION_SUB_ACCOUNT_ID,
);

async function morphoToEulerPositionMigrationExample({
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

	const computedMarketId = getMorphoMarketId(MORPHO_WETH_USDC_MARKET);
	if (computedMarketId !== MORPHO_WETH_USDC_MARKET_ID) {
		throw new Error(
			`Unexpected Morpho market id ${computedMarketId}; expected ${MORPHO_WETH_USDC_MARKET_ID}`,
		);
	}

	const accountDataBefore = (
		await sdk.accountService.fetchAccount(mainnet.id, account.address, {
			populateVaults: false,
		})
	).result;

	console.log("\n=== Step 1: Prepare Morpho Position ===");
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
			args: [MORPHO_BLUE, maxUint256],
			account: walletAccount,
			chain: mainnet,
			gas: 200_000n,
		}),
		"Approved Morpho for WETH collateral",
	);
	await sendAndWait(
		publicClient,
		walletClient.writeContract({
			address: MORPHO_BLUE,
			abi: morphoBlueAbi,
			functionName: "supplyCollateral",
			args: [MORPHO_WETH_USDC_MARKET, COLLATERAL_AMOUNT, account.address, "0x"],
			account: walletAccount,
			chain: mainnet,
			gas: 1_000_000n,
		}),
		"Supplied WETH collateral to Morpho",
	);
	await sendAndWait(
		publicClient,
		walletClient.writeContract({
			address: MORPHO_BLUE,
			abi: morphoBlueAbi,
			functionName: "borrow",
			args: [
				MORPHO_WETH_USDC_MARKET,
				MORPHO_BORROW_AMOUNT,
				0n,
				account.address,
				account.address,
			],
			account: walletAccount,
			chain: mainnet,
			gas: 1_000_000n,
		}),
		"Borrowed USDC from Morpho",
	);

	const sourcePosition = await sdk.positionMigrationService.getPosition({
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		positionRef: MORPHO_WETH_USDC_MARKET,
	});
	console.log(
		`  Morpho debt: ${formatUnits(sourcePosition.debt.amount, 6)} USDC`,
	);
	console.log(
		`  Morpho collateral: ${formatUnits(
			sourcePosition.collateral.amount,
			18,
		)} WETH`,
	);

	console.log("\n=== Step 2: Sign Morpho SwapVerifier Authorization ===");
	const eulerTarget = {
		eulerAccount: EULER_ACCOUNT,
		borrowVault: EULER_PRIME_USDC_VAULT,
		collateralVault: EULER_PRIME_WETH_VAULT,
	};
	const authorizationRequest =
		await sdk.positionMigrationService.getAuthorization({
			direction: "external-to-euler",
			connectorId: MORPHO_CONNECTOR_ID,
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
			? "  Signed Morpho authorization for Euler SwapVerifier"
			: "  Morpho authorization already set",
	);

	console.log("\n=== Step 3: Migrate Morpho Position to Euler ===");
	const migrationPlan = await sdk.positionMigrationService.planMigration({
		direction: "external-to-euler",
		connectorId: MORPHO_CONNECTOR_ID,
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
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		positionRef: MORPHO_WETH_USDC_MARKET,
	});
	console.log(
		`  Morpho debt after migration: ${formatUnits(
			sourcePositionAfter.debt.amount,
			6,
		)} USDC`,
	);
	console.log(
		`  Morpho collateral after migration: ${formatUnits(
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
	authorizationRequest: Awaited<
		ReturnType<
			Awaited<
				ReturnType<typeof buildEulerSDK>
			>["positionMigrationService"]["getAuthorization"]
		>
	>,
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

printHeader("MORPHO -> EULER POSITION MIGRATION EXAMPLE");
initExample()
	.then(morphoToEulerPositionMigrationExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
