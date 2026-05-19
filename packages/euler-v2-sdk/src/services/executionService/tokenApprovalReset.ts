import { type Address, getAddress } from "viem";

const TOKENS_REQUIRING_ZERO_APPROVAL_RESET: Record<number, readonly Address[]> =
	{
		1: [getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7")],
	};

export function requiresZeroApprovalReset(
	chainId: number,
	token: Address,
): boolean {
	return (
		TOKENS_REQUIRING_ZERO_APPROVAL_RESET[chainId]?.some(
			(resetToken) => resetToken === getAddress(token),
		) ?? false
	);
}
