/**
 * EULER -> MORPHO POSITION MIGRATION EXAMPLE
 *
 * This example prepares an Euler WETH/USDC position on a mainnet fork and
 * migrates it into Morpho Blue without closing the user's borrowed USDC exposure.
 *
 * OPERATION:
 *   1. Deposit WETH collateral and borrow USDC on Euler
 *   2. Sign Morpho authorization for the Euler SwapVerifier
 *   3. Withdraw Euler collateral to Swapper, supply it to Morpho, borrow USDC
 *      from Morpho, and repay Euler debt
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/euler-to-morpho-position-migration-example.ts
 */

import "dotenv/config";
import { formatUnits, getAddress, parseUnits, type Hex } from "viem";
import { mainnet } from "viem/chains";
import {
	buildEulerSDK,
	eVaultAbi,
	getMorphoMarketId,
	getSubAccountAddress,
	MORPHO_CONNECTOR_ID,
	type MigrationAuthorizationRequest,
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

const MORPHO_WETH_USDC_MARKET_ID =
	"0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd" as const;
const MORPHO_WETH_USDC_MARKET: MorphoMarketParams = {
	loanToken: USDC_ADDRESS,
	collateralToken: WETH_ADDRESS,
	oracle: getAddress("0x0F948CBa8231Db7898ef36A4212581Ad7b1B4580"),
	irm: getAddress("0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC"),
	lltv: 860000000000000000n,
};

const COLLATERAL_AMOUNT = parseUnits("1", 18);
const EULER_BORROW_AMOUNT = parseUnits("250", 6);
const MIGRATION_SUB_ACCOUNT_ID = 8;
const EULER_ACCOUNT = getSubAccountAddress(
	account.address,
	MIGRATION_SUB_ACCOUNT_ID,
);

async function eulerToMorphoPositionMigrationExample({
	walletClient,
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

	console.log("\n=== Step 1: Prepare Euler Position ===");
	const prepareEulerPlan = sdk.executionService.planBorrow({
		account: accountDataBefore,
		vault: EULER_PRIME_USDC_VAULT,
		amount: EULER_BORROW_AMOUNT,
		receiver: account.address,
		borrowAccount: EULER_ACCOUNT,
		collateral: {
			vault: EULER_PRIME_WETH_VAULT,
			amount: COLLATERAL_AMOUNT,
			asset: WETH_ADDRESS,
		},
	});

	await sdk.executionService.executeTransactionPlan({
		plan: prepareEulerPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	const sourceAmountsBefore = await fetchEulerSourceAmounts(sdk);
	console.log(
		`  Euler debt: ${formatUnits(sourceAmountsBefore.debtAmount, 6)} USDC`,
	);
	console.log(
		`  Euler collateral: ${formatUnits(
			sourceAmountsBefore.collateralAmount,
			18,
		)} WETH`,
	);

	const targetPosition = await sdk.positionMigrationService.getPosition({
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		positionRef: MORPHO_WETH_USDC_MARKET,
	});

	console.log("\n=== Step 2: Sign Morpho SwapVerifier Authorization ===");
	const eulerSource = {
		eulerAccount: EULER_ACCOUNT,
		borrowVault: EULER_PRIME_USDC_VAULT,
		collateralVault: EULER_PRIME_WETH_VAULT,
		debtAmount: sourceAmountsBefore.debtAmount,
		collateralShares: sourceAmountsBefore.collateralShares,
	};
	const externalTarget = {
		interestBufferBps: 1n,
	};
	const authorizationRequest =
		await sdk.positionMigrationService.getAuthorization({
			direction: "euler-to-external",
			connectorId: MORPHO_CONNECTOR_ID,
			chainId: mainnet.id,
			owner: account.address,
			position: targetPosition,
			source: eulerSource,
			externalTarget,
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

	console.log("\n=== Step 3: Migrate Euler Position to Morpho ===");
	const migrationPlan = await sdk.positionMigrationService.planMigration({
		direction: "euler-to-external",
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		position: targetPosition,
		source: eulerSource,
		externalTarget,
		authorization: signedAuthorization,
	});

	await sdk.executionService.executeTransactionPlan({
		plan: migrationPlan,
		chainId: mainnet.id,
		account: walletAccountAddress(walletClient),
		...exampleExecutionCallbacks(walletClient),
		onProgress: createTransactionPlanLogger(sdk),
	});

	const sourceAmountsAfter = await fetchEulerSourceAmounts(sdk);
	const targetPositionAfter = await sdk.positionMigrationService.getPosition({
		connectorId: MORPHO_CONNECTOR_ID,
		chainId: mainnet.id,
		owner: account.address,
		positionRef: MORPHO_WETH_USDC_MARKET,
	});
	console.log(
		`  Euler debt after migration: ${formatUnits(
			sourceAmountsAfter.debtAmount,
			6,
		)} USDC`,
	);
	console.log(
		`  Euler collateral after migration: ${formatUnits(
			sourceAmountsAfter.collateralAmount,
			18,
		)} WETH`,
	);
	console.log(
		`  Morpho debt after migration: ${formatUnits(
			targetPositionAfter.debt.amount,
			6,
		)} USDC`,
	);
	console.log(
		`  Morpho collateral after migration: ${formatUnits(
			targetPositionAfter.collateral.amount,
			18,
		)} WETH`,
	);

	const eulerSubAccountAfter = (
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
		[eulerSubAccountAfter],
		sdk,
	);
}

async function fetchEulerSourceAmounts(
	sdk: Awaited<ReturnType<typeof buildEulerSDK>>,
) {
	const provider = sdk.providerService.getProvider(mainnet.id);
	const [debtAmount, collateralShares] = (await provider.multicall({
		contracts: [
			{
				address: EULER_PRIME_USDC_VAULT,
				abi: eVaultAbi,
				functionName: "debtOf",
				args: [EULER_ACCOUNT],
			},
			{
				address: EULER_PRIME_WETH_VAULT,
				abi: eVaultAbi,
				functionName: "balanceOf",
				args: [EULER_ACCOUNT],
			},
		],
		allowFailure: false,
	})) as [bigint, bigint];
	const collateralAmount = (await provider.readContract({
		address: EULER_PRIME_WETH_VAULT,
		abi: eVaultAbi,
		functionName: "convertToAssets",
		args: [collateralShares],
	})) as bigint;

	return { debtAmount, collateralShares, collateralAmount };
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

printHeader("EULER -> MORPHO POSITION MIGRATION EXAMPLE");
initExample()
	.then(eulerToMorphoPositionMigrationExample)
	.catch((error) => {
		console.error("Error:", error);
		process.exit(1);
	});
