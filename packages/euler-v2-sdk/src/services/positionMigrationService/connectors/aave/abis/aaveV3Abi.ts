export const aaveV3PoolAbi = [
	{
		type: "function",
		name: "borrow",
		inputs: [
			{ name: "asset", type: "address", internalType: "address" },
			{ name: "amount", type: "uint256", internalType: "uint256" },
			{
				name: "interestRateMode",
				type: "uint256",
				internalType: "uint256",
			},
			{ name: "referralCode", type: "uint16", internalType: "uint16" },
			{ name: "onBehalfOf", type: "address", internalType: "address" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getReserveData",
		inputs: [{ name: "asset", type: "address", internalType: "address" }],
		outputs: [
			{
				name: "",
				type: "tuple",
				internalType: "struct DataTypes.ReserveData",
				components: [
					{
						name: "configuration",
						type: "tuple",
						internalType: "struct DataTypes.ReserveConfigurationMap",
						components: [
							{ name: "data", type: "uint256", internalType: "uint256" },
						],
					},
					{ name: "liquidityIndex", type: "uint128", internalType: "uint128" },
					{
						name: "currentLiquidityRate",
						type: "uint128",
						internalType: "uint128",
					},
					{
						name: "variableBorrowIndex",
						type: "uint128",
						internalType: "uint128",
					},
					{
						name: "currentVariableBorrowRate",
						type: "uint128",
						internalType: "uint128",
					},
					{
						name: "currentStableBorrowRate",
						type: "uint128",
						internalType: "uint128",
					},
					{
						name: "lastUpdateTimestamp",
						type: "uint40",
						internalType: "uint40",
					},
					{ name: "id", type: "uint16", internalType: "uint16" },
					{
						name: "aTokenAddress",
						type: "address",
						internalType: "address",
					},
					{
						name: "stableDebtTokenAddress",
						type: "address",
						internalType: "address",
					},
					{
						name: "variableDebtTokenAddress",
						type: "address",
						internalType: "address",
					},
					{
						name: "interestRateStrategyAddress",
						type: "address",
						internalType: "address",
					},
					{
						name: "accruedToTreasury",
						type: "uint128",
						internalType: "uint128",
					},
					{ name: "unbacked", type: "uint128", internalType: "uint128" },
					{
						name: "isolationModeTotalDebt",
						type: "uint128",
						internalType: "uint128",
					},
				],
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "repay",
		inputs: [
			{ name: "asset", type: "address", internalType: "address" },
			{ name: "amount", type: "uint256", internalType: "uint256" },
			{
				name: "interestRateMode",
				type: "uint256",
				internalType: "uint256",
			},
			{ name: "onBehalfOf", type: "address", internalType: "address" },
		],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "supply",
		inputs: [
			{ name: "asset", type: "address", internalType: "address" },
			{ name: "amount", type: "uint256", internalType: "uint256" },
			{ name: "onBehalfOf", type: "address", internalType: "address" },
			{ name: "referralCode", type: "uint16", internalType: "uint16" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "withdraw",
		inputs: [
			{ name: "asset", type: "address", internalType: "address" },
			{ name: "amount", type: "uint256", internalType: "uint256" },
			{ name: "to", type: "address", internalType: "address" },
		],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "nonpayable",
	},
] as const;

export const aaveATokenAbi = [
	{
		type: "function",
		name: "allowance",
		inputs: [
			{ name: "owner", type: "address", internalType: "address" },
			{ name: "spender", type: "address", internalType: "address" },
		],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "approve",
		inputs: [
			{ name: "spender", type: "address", internalType: "address" },
			{ name: "amount", type: "uint256", internalType: "uint256" },
		],
		outputs: [{ name: "", type: "bool", internalType: "bool" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "balanceOf",
		inputs: [{ name: "account", type: "address", internalType: "address" }],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "name",
		inputs: [],
		outputs: [{ name: "", type: "string", internalType: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "totalSupply",
		inputs: [],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nonces",
		inputs: [{ name: "owner", type: "address", internalType: "address" }],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "permit",
		inputs: [
			{ name: "owner", type: "address", internalType: "address" },
			{ name: "spender", type: "address", internalType: "address" },
			{ name: "value", type: "uint256", internalType: "uint256" },
			{ name: "deadline", type: "uint256", internalType: "uint256" },
			{ name: "v", type: "uint8", internalType: "uint8" },
			{ name: "r", type: "bytes32", internalType: "bytes32" },
			{ name: "s", type: "bytes32", internalType: "bytes32" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

export const aaveDebtTokenAbi = [
	{
		type: "function",
		name: "approveDelegation",
		inputs: [
			{ name: "delegatee", type: "address", internalType: "address" },
			{ name: "amount", type: "uint256", internalType: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "balanceOf",
		inputs: [{ name: "account", type: "address", internalType: "address" }],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "borrowAllowance",
		inputs: [
			{ name: "fromUser", type: "address", internalType: "address" },
			{ name: "toUser", type: "address", internalType: "address" },
		],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "delegationWithSig",
		inputs: [
			{ name: "delegator", type: "address", internalType: "address" },
			{ name: "delegatee", type: "address", internalType: "address" },
			{ name: "value", type: "uint256", internalType: "uint256" },
			{ name: "deadline", type: "uint256", internalType: "uint256" },
			{ name: "v", type: "uint8", internalType: "uint8" },
			{ name: "r", type: "bytes32", internalType: "bytes32" },
			{ name: "s", type: "bytes32", internalType: "bytes32" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "name",
		inputs: [],
		outputs: [{ name: "", type: "string", internalType: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nonces",
		inputs: [{ name: "owner", type: "address", internalType: "address" }],
		outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
] as const;
