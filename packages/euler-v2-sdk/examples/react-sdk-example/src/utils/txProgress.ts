import {
  approvalAmountLabel,
  decodeSmartContractErrors,
  TransactionPlanExecutionError,
  type ExecuteTransactionPlanArgs,
  type TransactionPlanExecutionProgress,
  type TransactionPlanItem,
} from "@eulerxyz/euler-v2-sdk";

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

function progressStatusLabel(progress: TransactionPlanExecutionProgress): string | undefined {
  if (progress.status === "approval") {
    const approval = progress.item?.type === "requiredApproval"
      ? progress.item.resolved?.find((item) => item.type === "approve")
      : undefined;
    return approval ? `Approval tx (${approvalAmountLabel(approval.amount)})` : "Approval tx";
  }
  if (progress.status === "permit2Signature") return "Permit2 signature";
  if (progress.status === "evcBatch") return "EVC batch";
  if (progress.status === "contractCall") {
    return progress.item?.type === "contractCall" ? progress.item.functionName : "Contract call";
  }
  if (progress.status === "completed") return "Completed";
  return progress.status;
}

export function toPlanProgress(progress: TransactionPlanExecutionProgress): PlanProgress {
  return {
    completed: progress.completed,
    total: progress.total,
    current: progress.item,
    status: progressStatusLabel(progress),
  };
}

export function walletExecutionCallbacks(
  walletClient: {
    sendTransaction: (...args: any[]) => Promise<any>;
    signTypedData?: (...args: any[]) => Promise<any>;
  }
): Pick<ExecuteTransactionPlanArgs, "sendTransaction" | "signTypedData"> {
  return {
    sendTransaction: (parameters) =>
      walletClient.sendTransaction(
        parameters as Parameters<typeof walletClient.sendTransaction>[0]
      ),
    signTypedData: walletClient.signTypedData
      ? (parameters) =>
          walletClient.signTypedData!(
            parameters as Parameters<NonNullable<typeof walletClient.signTypedData>>[0]
          )
      : undefined,
  };
}

export async function formatTransactionPlanError(error: unknown): Promise<Error> {
  if (error instanceof TransactionPlanExecutionError && error.decodedErrors.length > 0) {
    const unique = Array.from(new Set(error.decodedErrors.map(formatDecodedErrorEntry)));
    return new Error(`Execution failed:\n- ${unique.join("\n- ")}`);
  }

  const decoded = await decodeSmartContractErrors(error);
  if (decoded.length > 0) {
    const unique = Array.from(new Set(decoded.map(formatDecodedErrorEntry)));
    return new Error(`Execution failed:\n- ${unique.join("\n- ")}`);
  }

  return error instanceof Error ? error : new Error(String(error));
}
