import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import type { Address } from "viem"
import { CopyAddress } from "../components/CopyAddress"
import {
  fetchVaultDetailLive,
  getVaultDetailListSnapshot,
  type VaultDetail,
  type VaultDetailListSnapshot,
} from "../server/vaultDetailData"
import { formatAPY, formatBigInt, formatPercent, formatPriceUsd } from "../utils/format"

interface VaultDetailPageProps {
  chainId: number
  address: Address
}

function BackToVaultsLink({ chainId }: { chainId: number }) {
  return (
    <Link href={`/vaults?chainId=${chainId}`} className="back-link">
      &larr; Back to vaults
    </Link>
  )
}

function VaultDetailFallback({ chainId, address }: VaultDetailPageProps) {
  return (
    <>
      <BackToVaultsLink chainId={chainId} />
      <div className="vaults-progress-slot" aria-live="polite" aria-busy="true">
        <div className="vaults-progress-bar" />
      </div>
      <div className="detail-header">
        <h2>Loading vault...</h2>
        <div className="address">{address}</div>
      </div>
      <div className="status-message">Loading vault details...</div>
    </>
  )
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function VaultDetailContent({
  chainId,
  address,
  vault,
  snapshot,
  topStatusContent,
  showProgressBar = false,
}: {
  chainId: number
  address: Address
  vault: VaultDetail | null
  snapshot: VaultDetailListSnapshot | null
  topStatusContent: ReactNode
  showProgressBar?: boolean
}) {
  const loadingValue = "Loading..."
  const headerName = vault?.shares.name || snapshot?.name || "Loading vault details..."
  const headerAddress = vault?.address || snapshot?.address || address
  const collateralsCount = vault
    ? String(vault.collaterals.length)
    : snapshot
      ? String(snapshot.collateralCount)
      : loadingValue

  return (
    <>
      <BackToVaultsLink chainId={chainId} />
      <div className="vaults-progress-slot" aria-live="polite" aria-busy={showProgressBar}>
        {showProgressBar ? <div className="vaults-progress-bar" /> : null}
      </div>
      <div className="detail-status-slot">{topStatusContent}</div>

      <div className="detail-header">
        <h2>{headerName}</h2>
        <div className="address">{headerAddress}</div>
      </div>

      <div className="detail-grid">
        <div className="detail-item">
          <div className="label">Asset</div>
          <div className="value">
            {vault ? `${vault.asset.symbol} (${vault.asset.name})` : snapshot?.assetSymbol || loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Asset Address</div>
          <div className="value">{vault?.asset.address || loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Unit of Account</div>
          <div className="value">
            {vault ? `${vault.unitOfAccount.symbol} (${vault.unitOfAccount.name})` : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Asset USD Price</div>
          <div className="value">
            {vault ? formatPriceUsd(vault.marketPriceUsd) : snapshot?.marketPriceUsd || loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Total Assets</div>
          <div className="value">
            {vault
              ? `${formatBigInt(vault.totalAssets, vault.asset.decimals)} ${vault.asset.symbol}`
              : snapshot
                ? `${snapshot.totalSupply} ${snapshot.assetSymbol}`
                : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Total Borrowed</div>
          <div className="value">
            {vault
              ? `${formatBigInt(vault.totalBorrowed, vault.asset.decimals)} ${vault.asset.symbol}`
              : snapshot
                ? `${snapshot.totalBorrows} ${snapshot.assetSymbol}`
                : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Total Cash</div>
          <div className="value">
            {vault ? `${formatBigInt(vault.totalCash, vault.asset.decimals)} ${vault.asset.symbol}` : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Total Shares</div>
          <div className="value">{vault ? formatBigInt(vault.totalShares, vault.shares.decimals) : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Supply APY</div>
          <div className="value">
            {vault ? formatAPY(vault.interestRates.supplyAPY) : snapshot?.supplyApy || loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Borrow APY</div>
          <div className="value">
            {vault ? formatAPY(vault.interestRates.borrowAPY) : snapshot?.borrowApy || loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Supply Cap</div>
          <div className="value">
            {vault
              ? vault.caps.supplyCap === 0n
                ? "Unlimited"
                : formatBigInt(vault.caps.supplyCap, vault.asset.decimals)
              : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Borrow Cap</div>
          <div className="value">
            {vault
              ? vault.caps.borrowCap === 0n
                ? "Unlimited"
                : formatBigInt(vault.caps.borrowCap, vault.asset.decimals)
              : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Governor</div>
          <div className="value">{vault ? <CopyAddress address={vault.governorAdmin} /> : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Interest Fee</div>
          <div className="value">{vault ? formatPercent(vault.fees.interestFee) : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Oracle</div>
          <div className="value">
            {vault ? vault.oracle.name || <CopyAddress address={vault.oracle.oracle} /> : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">IRM Type</div>
          <div className="value">{vault ? vault.interestRateModel.type : loadingValue}</div>
        </div>
      </div>

      <h3 className="section-title">Collaterals ({collateralsCount})</h3>
      {vault ? (
        vault.collaterals.length === 0 ? (
          <div className="status-message">No collaterals configured</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Collateral</th>
                <th>Address</th>
                <th>Borrow LTV</th>
                <th>Liquidation LTV</th>
                <th>USD Price</th>
              </tr>
            </thead>
            <tbody>
              {vault.collaterals.map((col) => (
                <tr key={col.address}>
                  <td>
                    {col.vault ? (
                      <Link href={`/vault/${chainId}/${col.address}`}>
                        {col.vault.shares.name || col.vault.asset.symbol}
                      </Link>
                    ) : (
                      <CopyAddress address={col.address} />
                    )}
                  </td>
                  <td>
                    <CopyAddress address={col.address} />
                  </td>
                  <td>{formatPercent(col.borrowLTV)}</td>
                  <td>{formatPercent(col.liquidationLTV)}</td>
                  <td>{formatPriceUsd(col.marketPriceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <table>
          <thead>
            <tr>
              <th>Collateral</th>
              <th>Address</th>
              <th>Borrow LTV</th>
              <th>Liquidation LTV</th>
              <th>USD Price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{loadingValue}</td>
              <td>{loadingValue}</td>
              <td>{loadingValue}</td>
              <td>{loadingValue}</td>
              <td>{loadingValue}</td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  )
}

async function VaultDetailLiveSection({
  chainId,
  address,
  snapshot,
}: VaultDetailPageProps & { snapshot: VaultDetailListSnapshot | null }) {
  try {
    const vault = await fetchVaultDetailLive(chainId, address)
    return (
      <VaultDetailContent
        chainId={chainId}
        address={address}
        vault={vault}
        snapshot={snapshot}
        topStatusContent={null}
      />
    )
  } catch (error) {
    const message = toErrorMessage(error)
    if (!snapshot) {
      return (
        <>
          <BackToVaultsLink chainId={chainId} />
          <div className="error-message">Error: {message}</div>
        </>
      )
    }

    return (
      <VaultDetailContent
        chainId={chainId}
        address={address}
        vault={null}
        snapshot={snapshot}
        topStatusContent={
          <div className="vaults-refresh-warning">
            Showing cached list snapshot. Live vault refresh failed. {`Error: ${message}`}
          </div>
        }
      />
    )
  }
}

function VaultDetailSnapshotFallback({
  chainId,
  address,
  snapshot,
}: VaultDetailPageProps & { snapshot: VaultDetailListSnapshot }) {
  return (
    <VaultDetailContent
      chainId={chainId}
      address={address}
      vault={null}
      snapshot={snapshot}
      topStatusContent={
        <div className="status-message detail-inline-status">
          Showing cached list snapshot while loading full vault details...
        </div>
      }
      showProgressBar
    />
  )
}

export function VaultDetailPage({ chainId, address }: VaultDetailPageProps) {
  const snapshot = getVaultDetailListSnapshot(chainId, address)

  return (
    <Suspense
      key={`${chainId}:${address}`}
      fallback={
        snapshot ? (
          <VaultDetailSnapshotFallback chainId={chainId} address={address} snapshot={snapshot} />
        ) : (
          <VaultDetailFallback chainId={chainId} address={address} />
        )
      }
    >
      <VaultDetailLiveSection chainId={chainId} address={address} snapshot={snapshot} />
    </Suspense>
  )
}
