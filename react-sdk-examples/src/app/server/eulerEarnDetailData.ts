import type { Address } from "viem"
import { getServerSdk } from "./sdk"
import {
  getCachedEulerEarnListSnapshot,
  updateCachedEulerEarnListSnapshotFromLiveDetail,
} from "./vaultsData"

type ServerSdk = Awaited<ReturnType<typeof getServerSdk>>
export type EulerEarnDetail = Awaited<ReturnType<ServerSdk["eulerEarnService"]["fetchVault"]>>

export interface EulerEarnDetailListSnapshot {
  updatedAt: number | null
  address: string
  name: string
  assetSymbol: string
  totalAssets: string
  marketPriceUsd: string
  strategyCount: number
  performanceFee: string
}

export function getEulerEarnDetailListSnapshot(
  chainId: number,
  address: Address,
): EulerEarnDetailListSnapshot | null {
  const source = getCachedEulerEarnListSnapshot(chainId, address)
  if (!source.row) return null

  return {
    updatedAt: source.snapshotUpdatedAt,
    ...source.row,
  }
}

export async function fetchEulerEarnDetailLive(
  chainId: number,
  address: Address,
): Promise<EulerEarnDetail> {
  const sdk = await getServerSdk()
  const vault = await sdk.eulerEarnService.fetchVault(chainId, address, {
    populateMarketPrices: true,
  })
  updateCachedEulerEarnListSnapshotFromLiveDetail(chainId, vault)
  return vault
}
