import type { Address } from "viem";

export const BTC_REFERENCE_ASSET_ADDRESS =
	"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

const ORACLE_REFERENCE_ASSET_DECIMALS = 18;

export function normalizeOracleReferenceAssetDecimals(
	address: Address,
	decimals: number,
): number {
	return address.toLowerCase() === BTC_REFERENCE_ASSET_ADDRESS.toLowerCase()
		? ORACLE_REFERENCE_ASSET_DECIMALS
		: decimals;
}
