import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import type { Address } from "viem"
import { CopyAddress } from "../components/CopyAddress"
import {
  fetchEulerEarnDetailLive,
  getEulerEarnDetailListSnapshot,
  type EulerEarnDetail,
  type EulerEarnDetailListSnapshot,
} from "../server/eulerEarnDetailData"
import { formatAPY, formatBigInt, formatPercent, formatPriceUsd } from "../utils/format"

interface EulerEarnDetailPageProps {
  chainId: number
  address: Address
}

function BackToVaultsLink({ chainId }: { chainId: number }) {
  return (
    <Link href={`/vaults?chainId=${chainId}&tab=eulerEarn`} className="back-link">
      &larr; Back to vaults
    </Link>
  )
}

function EulerEarnDetailFallback({ chainId, address }: EulerEarnDetailPageProps) {
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

function EulerEarnDetailContent({
  chainId,
  address,
  vault,
  snapshot,
  topStatusContent,
  showProgressBar = false,
}: {
  chainId: number
  address: Address
  vault: EulerEarnDetail | null
  snapshot: EulerEarnDetailListSnapshot | null
  topStatusContent: ReactNode
  showProgressBar?: boolean
}) {
  const loadingValue = "Loading..."
  const headerName = vault?.shares.name || snapshot?.name || "Loading vault details..."
  const headerAddress = vault?.address || snapshot?.address || address
  const strategiesCount = vault
    ? String(vault.strategies.length)
    : snapshot
      ? String(snapshot.strategyCount)
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
                ? `${snapshot.totalAssets} ${snapshot.assetSymbol}`
                : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Total Shares</div>
          <div className="value">{vault ? formatBigInt(vault.totalShares, vault.shares.decimals) : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Supply APY (weighted)</div>
          <div className="value">
            {vault ? (vault.supplyApy !== undefined ? formatPercent(vault.supplyApy) : "-") : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Performance Fee</div>
          <div className="value">
            {vault ? formatPercent(vault.performanceFee) : snapshot?.performanceFee || loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Available Assets</div>
          <div className="value">
            {vault
              ? `${formatBigInt(vault.availableAssets, vault.asset.decimals)} ${vault.asset.symbol}`
              : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Lost Assets</div>
          <div className="value">
            {vault ? `${formatBigInt(vault.lostAssets, vault.asset.decimals)} ${vault.asset.symbol}` : loadingValue}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Strategies</div>
          <div className="value">{vault ? String(vault.strategies.length) : strategiesCount}</div>
        </div>
      </div>

      <h3 className="section-title">Governance</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <div className="label">Owner</div>
          <div className="value">{vault ? <CopyAddress address={vault.governance.owner} /> : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Curator</div>
          <div className="value">{vault ? <CopyAddress address={vault.governance.curator} /> : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Guardian</div>
          <div className="value">{vault ? <CopyAddress address={vault.governance.guardian} /> : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Fee Receiver</div>
          <div className="value">{vault ? <CopyAddress address={vault.governance.feeReceiver} /> : loadingValue}</div>
        </div>
        <div className="detail-item">
          <div className="label">Timelock</div>
          <div className="value">{vault ? `${vault.governance.timelock}s` : loadingValue}</div>
        </div>
      </div>

      <h3 className="section-title">Strategies ({strategiesCount})</h3>
      {vault ? (
        vault.strategies.length === 0 ? (
          <div className="status-message">No strategies configured</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Address</th>
                <th>Type</th>
                <th>Allocated</th>
                <th>Cap</th>
                <th>Supply APY</th>
                <th>Total Assets</th>
                <th>USD Price</th>
              </tr>
            </thead>
            <tbody>
              {vault.strategies.map((strategy) => (
                <tr key={strategy.address}>
                  <td>
                    {strategy.vault ? (
                      <Link href={`/vault/${chainId}/${strategy.address}`}>
                        {strategy.vault.shares.name || strategy.vault.asset.symbol}
                      </Link>
                    ) : (
                      strategy.shares.name || strategy.asset.symbol || <CopyAddress address={strategy.address} />
                    )}
                  </td>
                  <td>
                    <CopyAddress address={strategy.address} />
                  </td>
                  <td>{strategy.vaultType}</td>
                  <td>
                    {formatBigInt(strategy.allocatedAssets, vault.asset.decimals)} {vault.asset.symbol}
                  </td>
                  <td>
                    {strategy.allocationCap.current === 0n
                      ? "Unlimited"
                      : formatBigInt(strategy.allocationCap.current, vault.asset.decimals)}
                  </td>
                  <td>{strategy.vault ? formatAPY(strategy.vault.interestRates.supplyAPY) : "-"}</td>
                  <td>
                    {formatBigInt(strategy.totalAssets, vault.asset.decimals)} {vault.asset.symbol}
                  </td>
                  <td>{formatPriceUsd(strategy.vault?.marketPriceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Address</th>
              <th>Type</th>
              <th>Allocated</th>
              <th>Cap</th>
              <th>Supply APY</th>
              <th>Total Assets</th>
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

async function EulerEarnDetailLiveSection({
  chainId,
  address,
  snapshot,
}: EulerEarnDetailPageProps & { snapshot: EulerEarnDetailListSnapshot | null }) {
  try {
    const vault = await fetchEulerEarnDetailLive(chainId, address)
    return (
      <EulerEarnDetailContent
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
      <EulerEarnDetailContent
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

function EulerEarnDetailSnapshotFallback({
  chainId,
  address,
  snapshot,
}: EulerEarnDetailPageProps & { snapshot: EulerEarnDetailListSnapshot }) {
  return (
    <EulerEarnDetailContent
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

export function EulerEarnDetailPage({ chainId, address }: EulerEarnDetailPageProps) {
  const snapshot = getEulerEarnDetailListSnapshot(chainId, address)

  return (
    <Suspense
      key={`${chainId}:${address}`}
      fallback={
        snapshot ? (
          <EulerEarnDetailSnapshotFallback chainId={chainId} address={address} snapshot={snapshot} />
        ) : (
          <EulerEarnDetailFallback chainId={chainId} address={address} />
        )
      }
    >
      <EulerEarnDetailLiveSection chainId={chainId} address={address} snapshot={snapshot} />
    </Suspense>
  )
}
