export const utilsLensAbi = [
  {
    type: "function",
    name: "getVaultInfoERC4626",
    inputs: [{ name: "vault", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct VaultInfoERC4626",
        components: [
          { name: "timestamp", type: "uint256", internalType: "uint256" },
          { name: "vault", type: "address", internalType: "address" },
          { name: "vaultName", type: "string", internalType: "string" },
          { name: "vaultSymbol", type: "string", internalType: "string" },
          { name: "vaultDecimals", type: "uint256", internalType: "uint256" },
          { name: "asset", type: "address", internalType: "address" },
          { name: "assetName", type: "string", internalType: "string" },
          { name: "assetSymbol", type: "string", internalType: "string" },
          { name: "assetDecimals", type: "uint256", internalType: "uint256" },
          { name: "totalShares", type: "uint256", internalType: "uint256" },
          { name: "totalAssets", type: "uint256", internalType: "uint256" },
          { name: "isEVault", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;
