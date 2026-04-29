import {
	approvalAmountLabel,
	type EulerSDK,
	type TransactionPlanExecutionProgress,
} from "@eulerxyz/euler-v2-sdk";
import type { Address, WalletClient } from "viem";

export function walletAccountAddress(walletClient: WalletClient): Address {
	const account = walletClient.account;
	if (!account) {
		throw new Error("Wallet client account is required");
	}
	return typeof account === "string" ? account : account.address;
}

export function createTransactionPlanLogger(sdk: EulerSDK) {
	return ({ item, status, hash }: TransactionPlanExecutionProgress) => {
		if (status !== "completed" || !item) return;
		if (item.type === "requiredApproval") {
			for (const resolvedItem of item.resolved ?? []) {
				if (resolvedItem.type === "approve") {
					console.log(`  ✓ Approval ${approvalAmountLabel(resolvedItem.amount)}`);
				} else {
					console.log("  ✓ Permit2 signature");
				}
			}
			return;
		}
		if (item.type === "evcBatch") {
			console.log("  ✓ EVC batch");
			for (const desc of sdk.executionService.describeBatch(item.items)) {
				console.log(`    - ${desc.functionName}`);
			}
			return;
		}
		console.log(`  ✓ ${item.functionName}${hash ? ` (${hash})` : ""}`);
	};
}
