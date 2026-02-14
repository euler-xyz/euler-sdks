import type { Address } from "viem";
import { getServerSdk } from "./sdk";

export async function getEulerEarnDetailData(
  chainId: number,
  address: Address,
) {
  const sdk = await getServerSdk();
  return sdk.eulerEarnService.fetchVault(chainId, address, {
    populateMarketPrices: true,
  });
}
