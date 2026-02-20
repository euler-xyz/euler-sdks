import {
  decodeSmartContractErrors,
  type EVCBatchItem,
  type EulerSDK,
  type TransactionPlanItem,
} from "euler-v2-sdk";
import type { Address, PublicClient, WalletClient } from "viem";
import { maxUint256 } from "viem";

const PERMIT2_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

export type PlanProgress = {
  completed: number;
  total: number;
  current?: TransactionPlanItem;
};

export async function executePlanWithProgress(args: {
  plan: TransactionPlanItem[];
  sdk: EulerSDK;
  chainId: number;
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: Address;
  onProgress?: (progress: PlanProgress) => void;
}): Promise<void> {
  const { plan, sdk, chainId, walletClient, publicClient, account, onProgress } = args;
  const permit2BatchItems: EVCBatchItem[] = [];
  let completed = 0;

  const update = (current?: TransactionPlanItem) => {
    onProgress?.({ completed, total: plan.length, current });
  };

  update();

  try {
    for (const item of plan) {
      if (item.type === "requiredApproval") {
        if (!item.resolved || item.resolved.length === 0) {
          completed += 1;
          update(item);
          continue;
        }

        for (const resolvedItem of item.resolved) {
          if (resolvedItem.type === "approve") {
            const hash = await walletClient.sendTransaction({
              to: resolvedItem.token,
              data: resolvedItem.data,
              account,
              chain: publicClient.chain,
            });

            await publicClient.waitForTransactionReceipt({ hash });
          } else if (resolvedItem.type === "permit2") {
            const deployment = sdk.deploymentService.getDeployment(chainId);
            const permit2Address = deployment.addresses.coreAddrs.permit2;

            const allowanceResult = await publicClient.readContract({
              address: permit2Address,
              abi: PERMIT2_ABI,
              functionName: "allowance",
              args: [resolvedItem.owner, resolvedItem.token, resolvedItem.spender],
            });
            const nonce = Number(allowanceResult[2]);

            const typedData = sdk.executionService.getPermit2TypedData({
              chainId,
              token: resolvedItem.token,
              amount: resolvedItem.amount,
              spender: resolvedItem.spender,
              nonce,
            });

            const signature = await walletClient.signTypedData({
              ...typedData,
              account,
            });

            const permit2BatchItem = sdk.executionService.encodePermit2Call({
              chainId,
              owner: resolvedItem.owner,
              message: typedData.message,
              signature,
            });

            permit2BatchItems.push(permit2BatchItem);
          }
        }
      } else if (item.type === "evcBatch") {
        const allBatchItems = [...permit2BatchItems, ...item.items];
        const deployment = sdk.deploymentService.getDeployment(chainId);
        const evcAddress = deployment.addresses.coreAddrs.evc;
        const batchData = sdk.executionService.encodeBatch(allBatchItems);
        const totalValue = allBatchItems.reduce((sum, bi) => sum + bi.value, 0n);

        const estimatedGas = await publicClient.estimateGas({
          to: evcAddress,
          data: batchData,
          value: totalValue,
          account,
        });
        const gasWithBuffer = (estimatedGas * 120n) / 100n;

        const hash = await walletClient.sendTransaction({
          to: evcAddress,
          data: batchData,
          value: totalValue,
          account,
          chain: publicClient.chain,
          gas: gasWithBuffer,
        });

        await publicClient.waitForTransactionReceipt({ hash });
        permit2BatchItems.length = 0;
      }

      completed += 1;
      update(item);
    }
  } catch (error) {
    const decoded = await decodeSmartContractErrors(error);
    if (decoded.length > 0) {
      const details = decoded
        .map((entry) => {
          const selector = entry.selector ? ` | selector: ${entry.selector}` : "";
          const params =
            entry.params.length > 0
              ? ` | params: ${entry.params.map((param) => String(param)).join(", ")}`
              : "";
          return `${entry.signature}${selector}${params}`;
        })
        .join("\n");
      throw new Error(`Execution failed:\n${details}`);
    }

    throw error;
  }
}

export function formatApprovalAmount(amount: bigint): string {
  return amount === maxUint256 ? "unlimited" : amount.toString();
}
