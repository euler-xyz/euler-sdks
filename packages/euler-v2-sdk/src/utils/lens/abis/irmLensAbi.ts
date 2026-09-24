// Vendored from euler-interfaces/abis/IRMLens.json (bc34eda, 2025-08-12).

export const irmLensAbi = [
	{
		type: "constructor",
		inputs: [
			{
				name: "_kinkIRMFactory",
				type: "address",
				internalType: "address",
			},
			{
				name: "_adaptiveCurveIRMFactory",
				type: "address",
				internalType: "address",
			},
			{
				name: "_kinkyIRMFactory",
				type: "address",
				internalType: "address",
			},
			{
				name: "_fixedCyclicalBinaryIRMFactory",
				type: "address",
				internalType: "address",
			},
		],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "TTL_ERROR",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "int256",
				internalType: "int256",
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "TTL_INFINITY",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "int256",
				internalType: "int256",
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "TTL_LIQUIDATION",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "int256",
				internalType: "int256",
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "TTL_MORE_THAN_ONE_YEAR",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "int256",
				internalType: "int256",
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "adaptiveCurveIRMFactory",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "address",
				internalType: "address",
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "fixedCyclicalBinaryIRMFactory",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "address",
				internalType: "address",
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getInterestRateModelInfo",
		inputs: [
			{
				name: "irm",
				type: "address",
				internalType: "address",
			},
		],
		outputs: [
			{
				name: "",
				type: "tuple",
				internalType: "struct InterestRateModelDetailedInfo",
				components: [
					{
						name: "interestRateModel",
						type: "address",
						internalType: "address",
					},
					{
						name: "interestRateModelType",
						type: "uint8",
						internalType: "enum InterestRateModelType",
					},
					{
						name: "interestRateModelParams",
						type: "bytes",
						internalType: "bytes",
					},
				],
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "kinkIRMFactory",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "address",
				internalType: "address",
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "kinkyIRMFactory",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "address",
				internalType: "address",
			},
		],
		stateMutability: "view",
	},
] as const;
