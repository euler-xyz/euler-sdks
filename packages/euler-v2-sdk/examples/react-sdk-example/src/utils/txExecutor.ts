import {
  decodeSmartContractErrors,
  ethereumVaultConnectorAbi,
  type EVCBatchItem,
  type EulerSDK,
  type TransactionPlanItem,
} from "@eulerxyz/euler-v2-sdk";
import type { Address, PublicClient, WalletClient } from "viem";
import { encodeFunctionData, maxUint256 } from "viem";

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
  status?: string;
};

const formatDecodedErrorEntry = (entry: { signature: string; params: unknown[] }): string => {
  if (entry.signature === "Error(string)") {
    if (entry.params.length > 0) {
      return humanizeErrorText(String(entry.params[0]));
    }
    return "Execution reverted";
  }

  return humanizeErrorText(entry.signature);
};

const humanizeErrorText = (raw: string): string => {
  const value = raw.trim();
  if (!value) return "Execution reverted";

  if (/^0x[0-9a-fA-F]{20,}$/.test(value)) return "Execution reverted";

  const nestedSelectorMatch = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\([^)]*\)\(0x[0-9a-fA-F].*\)$/);
  if (nestedSelectorMatch?.[1]) return humanizeErrorText(nestedSelectorMatch[1]);

  const fnMatch = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\([^)]*\)$/);
  if (fnMatch?.[1]) return humanizeErrorText(fnMatch[1]);

  if (value.includes(":")) return value;

  const withoutPrefix = value.replace(/^E_/, "");
  const spaced = withoutPrefix
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  if (!spaced) return "Execution reverted";
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1).toLowerCase()}`;
};

const splitAndFormatDetails = (details: string): string => {
  const unique = new Set<string>();
  for (const part of details.split(" ; ")) {
    const clean = humanizeErrorText(part);
    if (clean) unique.add(clean);
  }
  return [...unique].join("; ");
};

const formatSimulationMessage = (message: string): string => {
  const payload = message.replace(/^Simulation failed:\s*/u, "");
  const lines = payload
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const formatted = lines.map((line) => {
    const batchMatch = line.match(/^Batch (\d+) \((.+)\) reverted: (.+)$/);
    if (batchMatch) {
      const [, index, label, details] = batchMatch;
      return `- Batch ${index} (${label}): ${splitAndFormatDetails(details)}`;
    }

    const accountMatch = line.match(/^Account health check failed: (\S+) \((.+)\)$/);
    if (accountMatch) {
      const [, address, details] = accountMatch;
      return `- Account health (${address}): ${splitAndFormatDetails(details)}`;
    }

    const vaultMatch = line.match(/^Vault status check failed: (\S+) \((.+)\)$/);
    if (vaultMatch) {
      const [, address, details] = vaultMatch;
      return `- Vault status (${address}): ${splitAndFormatDetails(details)}`;
    }

    return `- ${humanizeErrorText(line)}`;
  });

  return `Simulation failed:\n${formatted.join("\n")}`;
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

  const update = (current?: TransactionPlanItem, status?: string) => {
    onProgress?.({ completed, total: plan.length, current, status });
  };

  const describeBatchLabel = (batch: EVCBatchItem[], index: number): string => {
    try {
      const descriptions = sdk.executionService.describeBatch(batch);
      return descriptions[index]?.functionName ?? `item ${index + 1}`;
    } catch {
      return `item ${index + 1}`;
    }
  };

  const simulateBatchOrThrow = async (batch: EVCBatchItem[]) => {
    const deployment = sdk.deploymentService.getDeployment(chainId);
    const evcAddress = deployment.addresses.coreAddrs.evc;

    const mapped = batch.map((item) => ({
      targetContract: item.targetContract,
      onBehalfOfAccount: item.onBehalfOfAccount,
      value: item.value,
      data: item.data,
    }));

    const { result } = await publicClient.simulateContract({
      address: evcAddress,
      abi: ethereumVaultConnectorAbi,
      functionName: "batchSimulation",
      args: [mapped],
      account,
    });

    const [batchResults, accountChecks, vaultChecks] = result;
    const errors: string[] = [];

    for (let i = 0; i < batchResults.length; i += 1) {
      const r = batchResults[i]!;
      if (r.success) continue;
      const label = describeBatchLabel(batch, i);
      const decoded = await decodeSmartContractErrors(r.result);
      if (decoded.length > 0) {
        const details = decoded.map(formatDecodedErrorEntry).join(" ; ");
        errors.push(`Batch ${i + 1} (${label}) reverted: ${details}`);
      } else {
        errors.push(`Batch ${i + 1} (${label}) reverted: ${r.result}`);
      }
    }

    for (const check of accountChecks) {
      if (!check.isValid) {
        const decoded = await decodeSmartContractErrors(check.result);
        if (decoded.length > 0) {
          const details = decoded.map(formatDecodedErrorEntry).join(" ; ");
          errors.push(`Account health check failed: ${check.checkedAddress} (${details})`);
        } else {
          errors.push(`Account health check failed: ${check.checkedAddress}`);
        }
      }
    }
    for (const check of vaultChecks) {
      if (!check.isValid) {
        const decoded = await decodeSmartContractErrors(check.result);
        if (decoded.length > 0) {
          const details = decoded.map(formatDecodedErrorEntry).join(" ; ");
          errors.push(`Vault status check failed: ${check.checkedAddress} (${details})`);
        } else {
          errors.push(`Vault status check failed: ${check.checkedAddress}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Simulation failed:\n${errors.join("\n")}`);
    }
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
            update(item, `Approval tx (${formatApprovalAmount(resolvedItem.amount)})`);
            const hash = await walletClient.sendTransaction({
              to: resolvedItem.token,
              data: resolvedItem.data,
              account,
              chain: publicClient.chain,
            });

            await publicClient.waitForTransactionReceipt({ hash });
          } else if (resolvedItem.type === "permit2") {
            update(item, "Permit2 signature");
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
        update(item, "Simulating batch");
        const allBatchItems = [...permit2BatchItems, ...item.items];
        const deployment = sdk.deploymentService.getDeployment(chainId);
        const evcAddress = deployment.addresses.coreAddrs.evc;
        const batchData = sdk.executionService.encodeBatch(allBatchItems);
        const totalValue = allBatchItems.reduce((sum, bi) => sum + bi.value, 0n);

        // await simulateBatchOrThrow(allBatchItems);

        update(item, "EVC batch");
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
      } else if (item.type === "contractCall") {
        if (item.chainId !== chainId) {
          throw new Error(`Plan item targets chain ${item.chainId}, but executor is configured for chain ${chainId}`);
        }

        update(item, item.functionName);
        const hash = await walletClient.sendTransaction({
          to: item.to,
          data: encodeFunctionData({
            abi: item.abi,
            functionName: item.functionName,
            args: item.args,
          }),
          value: item.value,
          account,
          chain: publicClient.chain,
        });

        await publicClient.waitForTransactionReceipt({ hash });
        permit2BatchItems.length = 0;
      }

      completed += 1;
      update(item, "Completed");
    }
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : String(error);
    if (originalMessage.startsWith("Simulation failed:")) {
      throw new Error(formatSimulationMessage(originalMessage));
    }

    const decoded = await decodeSmartContractErrors(error);
    if (decoded.length > 0) {
      const unique = Array.from(new Set(decoded.map(formatDecodedErrorEntry)));
      throw new Error(`Execution failed:\n- ${unique.join("\n- ")}`);
    }

    throw error;
  }
}

export function formatApprovalAmount(amount: bigint): string {
  return amount === maxUint256 ? "unlimited" : amount.toString();
}
