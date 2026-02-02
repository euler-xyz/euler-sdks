import { EVCBatchItem, TransactionPlanItem, EulerSDK, } from "euler-v2-sdk";
import { maxUint256, WalletClient } from "viem";
import { mainnet } from "viem/chains";
import { publicClient, walletClient } from "./config.js";

/**
 * Executes a transaction plan by handling different types of plan items:
 * - requiredApproval: Processes resolved approvals (approve calls or permit2 signatures)
 * - evcBatch: Prepends any permit2 batch items and sends to EVC.batch
 */
export async function executePlan(plan: TransactionPlanItem[], sdk: EulerSDK, wc: WalletClient = walletClient): Promise<void> {
  const permit2BatchItems: EVCBatchItem[] = [];

  for (const item of plan) {
    if (item.type === "requiredApproval") {
      // Process resolved approvals
      if (!item.resolved || item.resolved.length === 0) {
        // No approvals needed, skip
        continue;
      }

      for (const resolvedItem of item.resolved) {
        if (resolvedItem.type === "approve") {
          const hash = await wc.sendTransaction({
            to: resolvedItem.token,
            data: resolvedItem.data,
            account: wc.account!,
            chain: mainnet,
          });

          await publicClient.waitForTransactionReceipt({ hash });
          console.log(`  ✓ Approval ${resolvedItem.amount == maxUint256 ? 'unlimited' : resolvedItem.amount}`);
        } else if (resolvedItem.type === "permit2") {
          // Get Permit2 contract address
          const deployment = sdk.deploymentService.getDeployment(mainnet.id);
          const permit2Address = deployment.addresses.coreAddrs.permit2;

          // Get current nonce from Permit2 contract
          const allowanceResult = await publicClient.readContract({
            address: permit2Address,
            abi: PERMIT2_ABI,
            functionName: "allowance",
            args: [resolvedItem.owner, resolvedItem.token, resolvedItem.spender],
          });
          const nonce = Number(allowanceResult[2]);

          // Get typed data for signing
          const typedData = sdk.executionService.getPermit2TypedData({
            chainId: mainnet.id,
            token: resolvedItem.token,
            amount: resolvedItem.amount,
            spender: resolvedItem.spender,
            nonce,
          });
     
          // Sign the typed data
          const signature = await wc.signTypedData({...typedData, account: wc.account!});

          // Encode permit2 call as batch item
          const permit2BatchItem = sdk.executionService.encodePermit2Call({
            chainId: mainnet.id,
            owner: resolvedItem.owner,
            message: typedData.message,
            signature,
          });

          permit2BatchItems.push(permit2BatchItem);
          console.log("  ✓ Permit2 signature");
        }
      }
    } else if (item.type === "evcBatch") {
      const allBatchItems = [...permit2BatchItems, ...item.items];

      const deployment = sdk.deploymentService.getDeployment(mainnet.id);
      const evcAddress = deployment.addresses.coreAddrs.evc;

      // Encode batch call
      const batchData = sdk.executionService.encodeBatch(allBatchItems);

      const description = sdk.executionService.describeBatch(allBatchItems);
      // console.log('description: ', description);

      const estimatedGas = await publicClient.estimateGas({
        to: evcAddress,
        data: batchData,
        account: wc.account!.address,
      });

      const gasWithBuffer = (estimatedGas * 120n) / 100n;

      // Send transaction to EVC.batch
      const hash = await wc.sendTransaction({
        to: evcAddress,
        data: batchData,
        account: wc.account!,
        chain: mainnet,
        gas: gasWithBuffer,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      permit2BatchItems.length = 0;
      console.log("  ✓ EVC batch");
      description.forEach(desc => {
        console.log(`    - ${desc.functionName}`); 
      });
    }
  }
}

const PERMIT2_ABI = 
  [
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