import type { Address } from "viem";
import { getServerSdk } from "./sdk";

export async function getVaultDetailData(chainId: number, address: Address) {
  const sdk = await getServerSdk();
  return sdk.eVaultService.fetchVault(chainId, address, {
    populateCollaterals: true,
    populateMarketPrices: true,
  });
}
