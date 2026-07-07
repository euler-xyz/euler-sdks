import type { Hex } from "viem";
import type { MigrationAuthorizationRequest } from "@eulerxyz/euler-v2-sdk";
import type { ExampleContext } from "./config.js";

type ExampleWalletAccount = Exclude<
	ExampleContext["walletClient"]["account"],
	string | undefined
>;

export async function sendAndWait(
	publicClient: ExampleContext["publicClient"],
	hashPromise: Promise<Hex>,
	label: string,
) {
	const hash = await hashPromise;
	await publicClient.waitForTransactionReceipt({ hash });
	console.log(`  ✓ ${label}`);
}

export async function signTypedDataAuthorization(
	walletClient: ExampleContext["walletClient"],
	walletAccount: ExampleWalletAccount,
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
