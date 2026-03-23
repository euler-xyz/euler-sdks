/**
 * Permit2 IAllowanceTransfer.permit (PermitSingle) - used for encoding permit2 calls in EVC batches.
 */
export const permit2PermitAbi = [
	{
		type: "function",
		name: "permit",
		inputs: [
			{ name: "owner", type: "address", internalType: "address" },
			{
				name: "permitSingle",
				type: "tuple",
				internalType: "struct IAllowanceTransfer.PermitSingle",
				components: [
					{
						name: "details",
						type: "tuple",
						internalType: "struct IAllowanceTransfer.PermitDetails",
						components: [
							{ name: "token", type: "address", internalType: "address" },
							{ name: "amount", type: "uint160", internalType: "uint160" },
							{ name: "expiration", type: "uint48", internalType: "uint48" },
							{ name: "nonce", type: "uint48", internalType: "uint48" },
						],
					},
					{ name: "spender", type: "address", internalType: "address" },
					{ name: "sigDeadline", type: "uint256", internalType: "uint256" },
				],
			},
			{ name: "signature", type: "bytes", internalType: "bytes" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;
