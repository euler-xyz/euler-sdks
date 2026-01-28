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
      type: "function",
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
      type: "function",
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
      type: "function",
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
      type: "function",
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
      type: "function",
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
      type: "function",
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      name: "repay",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  liquidateAbi: [
    {
      type: "function",
      inputs: [
        { name: "violator", type: "address" },
        { name: "collateral", type: "address" },
        { name: "repayAssets", type: "uint256" },
        { name: "minYieldBalance", type: "uint256" },
      ],
      name: "liquidate",
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  pullDebtAbi: [
    {
      type: "function",
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
      type: "function",
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
      type: "function",
      inputs: [],
      name: "disableController",
      outputs: [],
      stateMutability: "payable",
    },
  ],
  enableCollateralAbi: [
    {
      type: "function",
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
      type: "function",
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
      type: "function",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      name: "transfer",
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "nonpayable",
    },
  ],
  repayWithSharesAbi: [
    {
      type: "function",
      name: "repayWithShares",
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      outputs: [
        { name: "shares", type: "uint256" },
        { name: "debt", type: "uint256" },
      ],
      stateMutability: "nonpayable",
    },
  ],
  skimAbi: [
    {
      type: "function",
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      name: "skim",
      outputs: [ 
        { name: "", type: "uint256" },
      ],
      stateMutability: "nonpayable",
    },
  ],
  permit2Abi: [
    {
      type: 'function',
      name: 'permit',
      inputs: [
        { name: 'owner', type: 'address', internalType: 'address' },
        {
          name: 'permitSingle',
          type: 'tuple',
          internalType: 'struct IAllowanceTransfer.PermitSingle',
          components: [
            {
              name: 'details',
              type: 'tuple',
              internalType: 'struct IAllowanceTransfer.PermitDetails',
              components: [
                { name: 'token', type: 'address', internalType: 'address' },
                { name: 'amount', type: 'uint160', internalType: 'uint160' },
                { name: 'expiration', type: 'uint48', internalType: 'uint48' },
                { name: 'nonce', type: 'uint48', internalType: 'uint48' },
              ],
            },
            { name: 'spender', type: 'address', internalType: 'address' },
            { name: 'sigDeadline', type: 'uint256', internalType: 'uint256' },
          ],
        },
        { name: 'signature', type: 'bytes', internalType: 'bytes' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ],
  swapperAbi: [
    {
      type: "function",
      name: "multicall",
      inputs: [
        {
          name: "calls",
          type: "bytes[]",
          internalType: "bytes[]"
        }
      ],
      outputs: [],
      stateMutability: "nonpayable"
    },
  ],
  swapVerifierAbi: [
    {
      type: "function",
      name: "verifyAmountMinAndSkim",
      inputs: [
        {
          name: "vault",
          type: "address",
          internalType: "address"
        },
        {
          name: "receiver",
          type: "address",
          internalType: "address"
        },
        {
          name: "amountMin",
          type: "uint256",
          internalType: "uint256"
        },
        {
          name: "deadline",
          type: "uint256",
          internalType: "uint256"
        }
      ],
      outputs: [],
      stateMutability: "nonpayable"
    },
    {
      type: "function",
      name: "verifyDebtMax",
      inputs: [
        {
          name: "vault",
          type: "address",
          internalType: "address"
        },
        {
          name: "account",
          type: "address",
          internalType: "address"
        },
        {
          name: "amountMax",
          type: "uint256",
          internalType: "uint256"
        },
        {
          name: "deadline",
          type: "uint256",
          internalType: "uint256"
        }
      ],
      outputs: [],
      stateMutability: "view"
    },
  ]
}