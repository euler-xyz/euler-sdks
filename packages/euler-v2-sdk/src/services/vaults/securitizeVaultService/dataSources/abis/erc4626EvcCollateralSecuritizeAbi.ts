/** ABI for ERC4626EVCCollateralSecuritize (evk-periphery) governorAdmin and supplyCapResolved. */
export const erc4626EvcCollateralSecuritizeAbi = [
  {
    type: "function",
    name: "governorAdmin",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "supplyCapResolved",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;
