import {
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  zeroAddress,
} from "viem";
import type { EVCBatchItem } from "../services/executionService/executionServiceTypes.js";
import { ethereumVaultConnectorAbi } from "../services/executionService/abis/ethereumVaultConnectorAbi.js";
import { type BuildQueryFn, applyBuildQuery } from "../utils/buildQuery.js";

interface BatchItemResult {
  success: boolean;
  result: Hex;
}

export interface ExecuteBatchSimulationParams {
  provider: PublicClient;
  evcAddress: Address;
  prependItems: EVCBatchItem[];
  totalValue: bigint;
  lensAddress: Address;
  lensAbi: Abi | readonly unknown[];
  lensFunctionName: string;
  lensArgs: unknown[];
}

/**
 * Data source for EVC batchSimulation calls.
 * Follows the SDK's injectable query pattern: the raw RPC call is a `query*` arrow
 * function property, wrapped by `applyBuildQuery` for logging/caching/profiling.
 */
export class BatchSimulationDataSource {
  constructor(buildQuery?: BuildQueryFn) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  /**
   * Execute an EVC batchSimulation via eth_call.
   * The calldata should already be encoded as batchSimulation(items).
   */
  queryBatchSimulation = async (
    provider: PublicClient,
    evcAddress: Address,
    calldata: Hex,
    value: bigint,
  ): Promise<Hex | undefined> => {
    const result = await provider.call({
      to: evcAddress,
      data: calldata,
      value,
    });
    return result.data;
  };
}

/**
 * Wraps a lens contract call inside EVC.batchSimulation() with prepended batch items.
 * This enables read-time injection of state changes (e.g. Pyth price updates) that
 * are atomically applied before the lens read, without any on-chain transaction.
 *
 * Returns the decoded lens call result, or undefined on failure.
 */
export async function executeBatchSimulation<T>(
  params: ExecuteBatchSimulationParams,
  dataSource?: BatchSimulationDataSource,
): Promise<T | undefined> {
  const {
    provider,
    evcAddress,
    prependItems,
    totalValue,
    lensAddress,
    lensAbi,
    lensFunctionName,
    lensArgs,
  } = params;

  try {
    const lensCalldata = encodeFunctionData({
      abi: lensAbi as Abi,
      functionName: lensFunctionName,
      args: lensArgs,
    });

    const lensBatchItem: EVCBatchItem = {
      targetContract: lensAddress,
      onBehalfOfAccount: zeroAddress,
      value: 0n,
      data: lensCalldata,
    };

    const batchItems = [...prependItems, lensBatchItem];

    const calldata = encodeFunctionData({
      abi: ethereumVaultConnectorAbi,
      functionName: "batchSimulation",
      args: [batchItems],
    });

    const ds = dataSource ?? new BatchSimulationDataSource();
    const resultData = await ds.queryBatchSimulation(provider, evcAddress, calldata, totalValue);

    if (!resultData) return undefined;

    const decoded = decodeFunctionResult({
      abi: ethereumVaultConnectorAbi,
      functionName: "batchSimulation",
      data: resultData,
    });

    // batchSimulation returns [BatchItemResult[], StatusCheckResult[], StatusCheckResult[]]
    const batchResults = (decoded as readonly unknown[])[0] as BatchItemResult[];
    if (!batchResults || batchResults.length === 0) return undefined;

    // The lens call is the last item in the batch
    const lensResult = batchResults[batchResults.length - 1]!;
    if (!lensResult.success) return undefined;

    // Decode the lens result using the lens ABI
    const lensDecoded = decodeFunctionResult({
      abi: lensAbi as Abi,
      functionName: lensFunctionName,
      data: lensResult.result,
    });

    return lensDecoded as T;
  } catch {
    return undefined;
  }
}
