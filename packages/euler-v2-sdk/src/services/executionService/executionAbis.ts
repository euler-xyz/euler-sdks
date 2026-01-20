export const executionAbis = {
  batchAbi: [{
    type: "function",
    name: "batch",
    inputs: [
      {
        name: "items",
        type: "tuple[]",
        internalType: "struct IEVC.BatchItem[]",
        components: [
          {
            name: "targetContract",
            type: "address",
            internalType: "address"
          },
          {
            name: "onBehalfOfAccount",
            type: "address",
            internalType: "address"
          },
          {
            name: "value",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      }
    ],
    outputs: [],
    stateMutability: "payable"
  }],
  batchSimulationAbi: [
    {
      type: "function",
      name: "batchSimulation",
      inputs: [
        {
          name: "items",
          type: "tuple[]",
          internalType: "struct IEVC.BatchItem[]",
          components: [
            {
              name: "targetContract",
              type: "address",
              internalType: "address"
            },
            {
              name: "onBehalfOfAccount",
              type: "address",
              internalType: "address"
            },
            {
              name: "value",
              type: "uint256",
              internalType: "uint256"
            },
            {
              name: "data",
              type: "bytes",
              internalType: "bytes"
            }
          ]
        }
      ],
      outputs: [
        {
          name: "batchItemsResult",
          type: "tuple[]",
          internalType: "struct IEVC.BatchItemResult[]",
          components: [
            {
              name: "success",
              type: "bool",
              internalType: "bool"
            },
            {
              name: "result",
              type: "bytes",
              internalType: "bytes"
            }
          ]
        },
        {
          name: "accountsStatusCheckResult",
          type: "tuple[]",
          internalType: "struct IEVC.StatusCheckResult[]",
          components: [
            {
              name: "checkedAddress",
              type: "address",
              internalType: "address"
            },
            {
              name: "isValid",
              type: "bool",
              internalType: "bool"
            },
            {
              name: "result",
              type: "bytes",
              internalType: "bytes"
            }
          ]
        },
        {
          name: "vaultsStatusCheckResult",
          type: "tuple[]",
          internalType: "struct IEVC.StatusCheckResult[]",
          components: [
            {
              name: "checkedAddress",
              type: "address",
              internalType: "address"
            },
            {
              name: "isValid",
              type: "bool",
              internalType: "bool"
            },
            {
              name: "result",
              type: "bytes",
              internalType: "bytes"
            }
          ]
        }
      ],
      stateMutability: "payable"
    }
  ],
  depositAbi: [
    {
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      name: "deposit",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  mintAbi: [
    {
      inputs: [
        { name: "shares", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      name: "mint",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  withdrawAbi: [
    {
      inputs: [
        { name: "assets", type: "uint256" },
        { name: "receiver", type: "address" },
        { name: "owner", type: "address" },
      ],
      name: "withdraw",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  redeemAbi: [
    {
      inputs: [
        { name: "shares", type: "uint256" },
        { name: "receiver", type: "address" },
        { name: "owner", type: "address" },
      ],
      name: "redeem",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  borrowAbi: [
    {
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      name: "borrow",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  repayAbi: [
    {
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      name: "repay",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  pullDebtAbi: [
    {
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "from", type: "address" },
      ],
      name: "pullDebt",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  enableControllerAbi: [
    {
      inputs: [
        { name: "account", type: "address" },
        { name: "vault", type: "address" },
      ],
      name: "enableController",
      outputs: [],
      stateMutability: "payable",
    },
  ],
  disableControllerAbi: [
    {
      inputs: [
        { name: "account", type: "address" },
      ],
      name: "disableController",
      outputs: [],
      stateMutability: "payable",
    },
  ],
  enableCollateralAbi: [
    {
      inputs: [
        { name: "account", type: "address" },
        { name: "vault", type: "address" },
      ],
      name: "enableCollateral",
      outputs: [],
      stateMutability: "payable",
    },
  ],
  disableCollateralAbi: [
    {
      inputs: [
        { name: "account", type: "address" },
        { name: "vault", type: "address" },
      ],
      name: "disableCollateral",
      outputs: [],
      stateMutability: "payable",
    },
  ],
  transferAbi: [
    {
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      name: "transfer",
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "nonpayable",
    },
  ],
}