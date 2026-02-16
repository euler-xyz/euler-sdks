import type { Address } from "viem"
import { getServerSdk } from "./sdk"
import {
  getCachedVaultListSnapshot,
  updateCachedVaultListSnapshotFromLiveDetail,
} from "./vaultsData"

type ServerSdk = Awaited<ReturnType<typeof getServerSdk>>
export type VaultDetail = Awaited<ReturnType<ServerSdk["eVaultService"]["fetchVault"]>>

export interface VaultDetailListSnapshot {
  updatedAt: number | null
  address: string
  name: string
  assetSymbol: string
  totalSupply: string
  totalBorrows: string
  supplyApy: string
  borrowApy: string
  marketPriceUsd: string
  collateralCount: number
}

export function getVaultDetailListSnapshot(
  chainId: number,
  address: Address,
): VaultDetailListSnapshot | null {
  const source = getCachedVaultListSnapshot(chainId, address)
  if (!source.row) return null

  return {
    updatedAt: source.snapshotUpdatedAt,
    ...source.row,
  }
}

export async function fetchVaultDetailLive(chainId: number, address: Address): Promise<VaultDetail> {
  const sdk = await getServerSdk()
  const vault = await sdk.eVaultService.fetchVault(chainId, address, {
    populateCollaterals: true,
    populateMarketPrices: true,
  })
  updateCachedVaultListSnapshotFromLiveDetail(chainId, vault)
  return vault
}
