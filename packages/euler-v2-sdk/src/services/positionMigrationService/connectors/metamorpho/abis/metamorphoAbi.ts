/**
 * Minimal ABI shared by MetaMorpho v1/v1.1 and Morpho Vaults V2 — the
 * ERC-4626 + ERC-2612 surface used for position reads, permits and redeems.
 * `eip712Domain` (EIP-5267) is only implemented by v1/v1.1 (OZ ERC20Permit).
 */
export const metamorphoAbi = [
	{
		type: "function",
		name: "asset",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "function",
		name: "name",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
	},
	{
		type: "function",
		name: "symbol",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
	},
	{
		type: "function",
		name: "decimals",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
	},
	{
		type: "function",
		name: "balanceOf",
		stateMutability: "view",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "convertToAssets",
		stateMutability: "view",
		inputs: [{ name: "shares", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "allowance",
		stateMutability: "view",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "spender", type: "address" },
		],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "approve",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
	{
		type: "function",
		name: "nonces",
		stateMutability: "view",
		inputs: [{ name: "owner", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "redeem",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "shares", type: "uint256" },
			{ name: "receiver", type: "address" },
			{ name: "owner", type: "address" },
		],
		outputs: [{ name: "assets", type: "uint256" }],
	},
	{
		type: "function",
		name: "permit",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "spender", type: "address" },
			{ name: "value", type: "uint256" },
			{ name: "deadline", type: "uint256" },
			{ name: "v", type: "uint8" },
			{ name: "r", type: "bytes32" },
			{ name: "s", type: "bytes32" },
		],
		outputs: [],
	},
	{
		type: "function",
		name: "eip712Domain",
		stateMutability: "view",
		inputs: [],
		outputs: [
			{ name: "fields", type: "bytes1" },
			{ name: "name", type: "string" },
			{ name: "version", type: "string" },
			{ name: "chainId", type: "uint256" },
			{ name: "verifyingContract", type: "address" },
			{ name: "salt", type: "bytes32" },
			{ name: "extensions", type: "uint256[]" },
		],
	},
] as const;
