import type { EVCBatchItem } from "src/services/executionService/executionServiceTypes.js"
import { encodeFunctionData } from "viem"


export const encodeEVCBatch = (items: EVCBatchItem[]) => {
  return encodeFunctionData({
    abi: [{
      "type": "function",
      "name": "batch",
      "inputs": [
        {
          "name": "items",
          "type": "tuple[]",
          "internalType": "struct IEVC.BatchItem[]",
          "components": [
            {
              "name": "targetContract",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "onBehalfOfAccount",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "value",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "data",
              "type": "bytes",
              "internalType": "bytes"
            }
          ]
        }
      ],
      "outputs": [],
      "stateMutability": "payable"
    }],
    args: [items.map(item => ({
      targetContract: item.targetContract,
      onBehalfOfAccount: item.onBehalfOfAccount,
      value: item.value ?? 0n,
      data: item.data
    }))]
  })
}
