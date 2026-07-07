import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { Account } from "../../src/entities/Account.js";
import type { EVCBatchItem } from "../../src/services/executionService/index.js";
import { eVaultAbi } from "../../src/services/executionService/abis/eVaultAbi.js";
import { swapperAbi } from "../../src/services/executionService/abis/swapperAbi.js";
import { swapVerifierAbi } from "../../src/services/executionService/abis/swapVerifierAbi.js";

export const SWAPPER_HANDLER_GENERIC =
	"0x47656e6572696300000000000000000000000000000000000000000000000000" as const;

export const GENERIC_HANDLER_DATA_ABI = [
	{ name: "target", type: "address" },
	{ name: "payload", type: "bytes" },
] as const;

export type EulerCollateralSourceCall =
	| {
			functionName: "withdraw";
			amount: bigint;
			receiver: Address;
			owner: Address;
	  }
	| {
			functionName: "redeem";
			shares: bigint;
			receiver: Address;
			owner: Address;
	  };

export type VerifyDebtMaxCall = {
	vault: Address;
	account: Address;
	amountMax: bigint;
	deadline: bigint;
};

export function createEulerSourceAccount(args: {
	chainId: number;
	owner: Address;
	eulerAccount: Address;
	debtVault: Address;
	collateralVault: Address;
	debtAsset: Address;
	collateralAsset: Address;
	debtAmount: bigint;
	collateralAssets: bigint;
	collateralShares: bigint;
}) {
	return new Account({
		chainId: args.chainId,
		owner: getAddress(args.owner),
		subAccounts: {
			[getAddress(args.eulerAccount)]: {
				timestamp: 0,
				account: getAddress(args.eulerAccount),
				owner: getAddress(args.owner),
				lastAccountStatusCheckTimestamp: 0,
				enabledControllers: [getAddress(args.debtVault)],
				enabledCollaterals: [getAddress(args.collateralVault)],
				positions: [
					{
						account: getAddress(args.eulerAccount),
						vaultAddress: getAddress(args.debtVault),
						asset: getAddress(args.debtAsset),
						shares: 0n,
						assets: 0n,
						borrowed: args.debtAmount,
						isController: true,
						isCollateral: false,
						balanceForwarderEnabled: false,
					},
					{
						account: getAddress(args.eulerAccount),
						vaultAddress: getAddress(args.collateralVault),
						asset: getAddress(args.collateralAsset),
						shares: args.collateralShares,
						assets: args.collateralAssets,
						borrowed: 0n,
						isController: false,
						isCollateral: true,
						balanceForwarderEnabled: false,
					},
				],
			},
		},
	});
}

export function decodeSwapperMulticall(
	item: EVCBatchItem,
	swapper: Address,
): Hex[] {
	if (getAddress(item.targetContract) !== getAddress(swapper)) return [];
	try {
		const decoded = decodeFunctionData({ abi: swapperAbi, data: item.data });
		if (decoded.functionName !== "multicall") return [];
		const [calls] = decoded.args as [readonly Hex[]];
		return [...calls];
	} catch {
		return [];
	}
}

export function getEulerCollateralSourceCall(
	item: EVCBatchItem,
	collateralVault: Address,
): EulerCollateralSourceCall | undefined {
	if (getAddress(item.targetContract) !== getAddress(collateralVault))
		return undefined;
	const decoded = decodeFunctionData({ abi: eVaultAbi, data: item.data });
	if (decoded.functionName === "withdraw") {
		const [amount, receiver, owner] = decoded.args as [
			bigint,
			Address,
			Address,
		];
		return {
			functionName: "withdraw",
			amount,
			receiver: getAddress(receiver),
			owner: getAddress(owner),
		};
	}
	if (decoded.functionName === "redeem") {
		const [shares, receiver, owner] = decoded.args as [
			bigint,
			Address,
			Address,
		];
		return {
			functionName: "redeem",
			shares,
			receiver: getAddress(receiver),
			owner: getAddress(owner),
		};
	}
	return undefined;
}

export function getVerifyAmountMinAndDepositAmount(
	item: EVCBatchItem,
	args: {
		swapVerifier: Address;
		vault: Address;
		receiver: Address;
	},
): bigint | undefined {
	if (getAddress(item.targetContract) !== getAddress(args.swapVerifier))
		return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "verifyAmountMinAndDeposit") return undefined;
	const [vault, receiver, amountMin] = decoded.args as [
		Address,
		Address,
		bigint,
		bigint,
	];
	if (getAddress(vault) !== getAddress(args.vault)) return undefined;
	if (getAddress(receiver) !== getAddress(args.receiver)) return undefined;
	return amountMin;
}

export function getVerifyDebtMaxCall(
	item: EVCBatchItem,
	swapVerifier: Address,
): VerifyDebtMaxCall | undefined {
	if (getAddress(item.targetContract) !== getAddress(swapVerifier))
		return undefined;
	const decoded = decodeFunctionData({ abi: swapVerifierAbi, data: item.data });
	if (decoded.functionName !== "verifyDebtMax") return undefined;
	const [vault, account, amountMax, deadline] = decoded.args as [
		Address,
		Address,
		bigint,
		bigint,
	];
	return {
		vault: getAddress(vault),
		account: getAddress(account),
		amountMax,
		deadline,
	};
}
