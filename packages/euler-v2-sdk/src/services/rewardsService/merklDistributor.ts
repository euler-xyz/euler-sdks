import { type Address, getAddress } from "viem";

export const MERKL_DEFAULT_DISTRIBUTOR: Address =
	"0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
const MERKL_DEFAULT_DISTRIBUTOR_CHAIN_IDS = new Set([
	1, 10, 30, 56, 100, 122, 130, 137, 143, 146, 151, 169, 196, 239, 250, 252,
	480, 592, 747, 988, 999, 1135, 1284, 1329, 1868, 1923, 2020, 4114, 4217, 4326,
	5000, 5464, 6900, 8453, 9745, 13371, 16661, 25363, 31612, 34443, 42161, 42220,
	42793, 43111, 43114, 48900, 57073, 59144, 60808, 80094, 81457, 98866, 167000,
	534352, 685689, 747474, 1440000, 5064014, 21000000, 2046399126,
]);
const MERKL_DISTRIBUTOR_OVERRIDES = new Map<number, Address>([
	[50, "0xDd8098dA94cF3aEA5253545162F1Feb371278F5a"],
	[324, "0xe117ed7Ef16d3c28fCBA7eC49AFAD77f451a6a21"],
]);

/** The claim planner and direct API adapter must agree on each chain's target. */
export function resolveMerklDistributorAddress(
	chainId: number,
	configured: Address,
): Address | undefined {
	const configuredAddress = getAddress(configured);
	if (configuredAddress !== MERKL_DEFAULT_DISTRIBUTOR) return configuredAddress;
	return (
		MERKL_DISTRIBUTOR_OVERRIDES.get(chainId) ??
		(MERKL_DEFAULT_DISTRIBUTOR_CHAIN_IDS.has(chainId)
			? MERKL_DEFAULT_DISTRIBUTOR
			: undefined)
	);
}
