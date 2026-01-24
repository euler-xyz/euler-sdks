import { EVCBatchItem, TransactionPlanItem, EulerSDK, } from "euler-v2-sdk";
import { maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { publicClient, walletClient } from "./config.js";

/**
 * Executes a transaction plan by handling different types of plan items:
 * - approve: Sends ERC20 approval transaction
 * - permit2: Gets nonce, creates typed data, signs it, and encodes permit2 call
 * - evcBatch: Prepends any permit2 batch items and sends to EVC.batch
 */
export async function executePlan(plan: TransactionPlanItem[], sdk: EulerSDK): Promise<void> {
  const permit2BatchItems: EVCBatchItem[] = [];

  for (const item of plan) {
    if (item.type === "approve") {
      const hash = await walletClient.sendTransaction({
        to: item.token,
        data: item.data,
        account: walletClient.account!,
        chain: mainnet,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ Approval ${item.amount == maxUint256 ? 'unlimited' : item.amount}`);
    } else if (item.type === "permit2") {

      // Get Permit2 contract address
      const deployment = sdk.deploymentService.getDeployment(mainnet.id);
      const permit2Address = deployment.addresses.coreAddrs.permit2;

      // Get current nonce from Permit2 contract
      const allowanceResult = await publicClient.readContract({
        address: permit2Address,
        abi: PERMIT2_ABI,
        functionName: "allowance",
        args: [item.owner, item.token, item.spender],
      });
      const nonce = Number(allowanceResult[2]);

      // Get typed data for signing
      const typedData = sdk.executionService.getPermit2TypedData({
        chainId: mainnet.id,
        token: item.token,
        amount: item.amount,
        spender: item.spender,
        nonce,
      });
 
      // Sign the typed data
      const signature = await walletClient.signTypedData({...typedData, account: walletClient.account!});

      // Encode permit2 call as batch item
      const permit2BatchItem = sdk.executionService.encodePermit2Call({
        chainId: mainnet.id,
        owner: item.owner,
        message: typedData.message,
        signature,
      });

      permit2BatchItems.push(permit2BatchItem);
      console.log("  ✓ Permit2 signature");
    } else if (item.type === "evcBatch") {
      const allBatchItems = [...permit2BatchItems, ...item.items];

      const deployment = sdk.deploymentService.getDeployment(mainnet.id);
      const evcAddress = deployment.addresses.coreAddrs.evc;

      // Encode batch call
      const batchData = sdk.executionService.encodeBatch(allBatchItems);

      const estimatedGas = await publicClient.estimateGas({
        to: evcAddress,
        data: batchData,
        account: walletClient.account!.address,
      });

      const gasWithBuffer = (estimatedGas * 120n) / 100n;

      // Send transaction to EVC.batch
      const hash = await walletClient.sendTransaction({
        to: evcAddress,
        data: batchData,
        account: walletClient.account!,
        chain: mainnet,
        gas: gasWithBuffer,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      permit2BatchItems.length = 0;
      console.log("  ✓ EVC batch");
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