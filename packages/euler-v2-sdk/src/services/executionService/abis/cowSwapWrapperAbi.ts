export const OPEN_POSITION_PARAMS_COMPONENTS = [
	{ name: "owner", type: "address" },
	{ name: "account", type: "address" },
	{ name: "deadline", type: "uint256" },
	{ name: "collateralVault", type: "address" },
	{ name: "borrowVault", type: "address" },
	{ name: "collateralAmount", type: "uint256" },
	{ name: "borrowAmount", type: "uint256" },
] as const;

export const OPEN_POSITION_WRAPPER_ABI = [
	{
		inputs: [
			{
				components: OPEN_POSITION_PARAMS_COMPONENTS,
				name: "params",
				type: "tuple",
			},
		],
		name: "encodePermitData",
		outputs: [{ name: "", type: "bytes" }],
		stateMutability: "view",
		type: "function",
	},
] as const;

export const COLLATERAL_SWAP_PARAMS_COMPONENTS = [
	{ name: "owner", type: "address" },
	{ name: "account", type: "address" },
	{ name: "deadline", type: "uint256" },
	{ name: "fromVault", type: "address" },
	{ name: "toVault", type: "address" },
	{ name: "fromAmount", type: "uint256" },
	{ name: "disableSourceCollateral", type: "bool" },
] as const;

export const COLLATERAL_SWAP_WRAPPER_ABI = [
	{
		inputs: [
			{
				components: COLLATERAL_SWAP_PARAMS_COMPONENTS,
				name: "params",
				type: "tuple",
			},
		],
		name: "encodePermitData",
		outputs: [{ name: "", type: "bytes" }],
		stateMutability: "view",
		type: "function",
	},
] as const;

export const CLOSE_POSITION_PARAMS_COMPONENTS = [
	{ name: "owner", type: "address" },
	{ name: "account", type: "address" },
	{ name: "deadline", type: "uint256" },
	{ name: "borrowVault", type: "address" },
	{ name: "collateralVault", type: "address" },
	{ name: "collateralAmount", type: "uint256" },
] as const;

export const CLOSE_POSITION_WRAPPER_ABI = [
	{
		inputs: [
			{
				components: CLOSE_POSITION_PARAMS_COMPONENTS,
				name: "params",
				type: "tuple",
			},
		],
		name: "encodePermitData",
		outputs: [{ name: "", type: "bytes" }],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "subaccount", type: "address" },
		],
		name: "getInbox",
		outputs: [{ name: "", type: "address" }],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "subaccount", type: "address" },
		],
		name: "getInboxAddressAndDomainSeparator",
		outputs: [
			{ name: "", type: "address" },
			{ name: "", type: "bytes32" },
		],
		stateMutability: "view",
		type: "function",
	},
] as const;
