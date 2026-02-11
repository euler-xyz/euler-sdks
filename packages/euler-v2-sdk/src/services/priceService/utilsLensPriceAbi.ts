export const utilsLensPriceAbi = [
  {
    type: "function",
    name: "getAssetPriceInfo",
    inputs: [
      { name: "asset", type: "address", internalType: "address" },
      { name: "unitOfAccount", type: "address", internalType: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct AssetPriceInfo",
        components: [
          { name: "queryFailure", type: "bool", internalType: "bool" },
          { name: "queryFailureReason", type: "bytes", internalType: "bytes" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
          { name: "oracle", type: "address", internalType: "address" },
          { name: "asset", type: "address", internalType: "address" },
          { name: "unitOfAccount", type: "address", internalType: "address" },
          { name: "amountIn", type: "uint256", internalType: "uint256" },
          { name: "amountOutMid", type: "uint256", internalType: "uint256" },
          { name: "amountOutBid", type: "uint256", internalType: "uint256" },
          { name: "amountOutAsk", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;
