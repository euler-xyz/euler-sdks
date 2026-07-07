import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { Account } from "../../src/entities/Account.js";
import type { EVCBatchItem } from "../../src/services/executionService/index.js";
import { swapperAbi } from "../../src/services/executionService/abis/swapperAbi.js";

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
