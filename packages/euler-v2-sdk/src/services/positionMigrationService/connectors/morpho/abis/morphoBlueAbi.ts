export const morphoBlueAbi = [
	{
		type: "function",
		name: "borrow",
		inputs: [
			{
				name: "marketParams",
				type: "tuple",
				components: [
					{ name: "loanToken", type: "address" },
					{ name: "collateralToken", type: "address" },
					{ name: "oracle", type: "address" },
					{ name: "irm", type: "address" },
					{ name: "lltv", type: "uint256" },
				],
			},
			{ name: "assets", type: "uint256" },
			{ name: "shares", type: "uint256" },
			{ name: "onBehalf", type: "address" },
			{ name: "receiver", type: "address" },
		],
		outputs: [
			{ name: "assetsBorrowed", type: "uint256" },
			{ name: "sharesBorrowed", type: "uint256" },
		],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "isAuthorized",
		inputs: [
			{ name: "authorizer", type: "address" },
			{ name: "authorized", type: "address" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "market",
		inputs: [{ name: "id", type: "bytes32" }],
		outputs: [
			{ name: "totalSupplyAssets", type: "uint128" },
			{ name: "totalSupplyShares", type: "uint128" },
			{ name: "totalBorrowAssets", type: "uint128" },
			{ name: "totalBorrowShares", type: "uint128" },
			{ name: "lastUpdate", type: "uint128" },
			{ name: "fee", type: "uint128" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nonce",
		inputs: [{ name: "authorizer", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "position",
		inputs: [
			{ name: "id", type: "bytes32" },
			{ name: "user", type: "address" },
		],
		outputs: [
			{ name: "supplyShares", type: "uint256" },
			{ name: "borrowShares", type: "uint128" },
			{ name: "collateral", type: "uint128" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "repay",
		inputs: [
			{
				name: "marketParams",
				type: "tuple",
				components: [
					{ name: "loanToken", type: "address" },
					{ name: "collateralToken", type: "address" },
					{ name: "oracle", type: "address" },
					{ name: "irm", type: "address" },
					{ name: "lltv", type: "uint256" },
				],
			},
			{ name: "assets", type: "uint256" },
			{ name: "shares", type: "uint256" },
			{ name: "onBehalf", type: "address" },
			{ name: "data", type: "bytes" },
		],
		outputs: [
			{ name: "assetsRepaid", type: "uint256" },
			{ name: "sharesRepaid", type: "uint256" },
		],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "setAuthorization",
		inputs: [
			{ name: "authorized", type: "address" },
			{ name: "newIsAuthorized", type: "bool" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "setAuthorizationWithSig",
		inputs: [
			{
				name: "authorization",
				type: "tuple",
				components: [
					{ name: "authorizer", type: "address" },
					{ name: "authorized", type: "address" },
					{ name: "isAuthorized", type: "bool" },
					{ name: "nonce", type: "uint256" },
					{ name: "deadline", type: "uint256" },
				],
			},
			{
				name: "signature",
				type: "tuple",
				components: [
					{ name: "v", type: "uint8" },
					{ name: "r", type: "bytes32" },
					{ name: "s", type: "bytes32" },
				],
			},
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "supplyCollateral",
		inputs: [
			{
				name: "marketParams",
				type: "tuple",
				components: [
					{ name: "loanToken", type: "address" },
					{ name: "collateralToken", type: "address" },
					{ name: "oracle", type: "address" },
					{ name: "irm", type: "address" },
					{ name: "lltv", type: "uint256" },
				],
			},
			{ name: "assets", type: "uint256" },
			{ name: "onBehalf", type: "address" },
			{ name: "data", type: "bytes" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "withdrawCollateral",
		inputs: [
			{
				name: "marketParams",
				type: "tuple",
				components: [
					{ name: "loanToken", type: "address" },
					{ name: "collateralToken", type: "address" },
					{ name: "oracle", type: "address" },
					{ name: "irm", type: "address" },
					{ name: "lltv", type: "uint256" },
				],
			},
			{ name: "assets", type: "uint256" },
			{ name: "onBehalf", type: "address" },
			{ name: "receiver", type: "address" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;
