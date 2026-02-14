import Link from "next/link";
import { Suspense } from "react";
import type { Address } from "viem";
import { CopyAddress } from "../components/CopyAddress";
import { getEulerEarnDetailData } from "../server/eulerEarnDetailData";
import {
  formatAPY,
  formatBigInt,
  formatPercent,
  formatPriceUsd,
} from "../utils/format";

interface EulerEarnDetailPageProps {
  chainId: number;
  address: Address;
}

function BackToVaultsLink({ chainId }: { chainId: number }) {
  return (
    <Link
      href={`/vaults?chainId=${chainId}&tab=eulerEarn`}
      className="back-link"
    >
      &larr; Back to vaults
    </Link>
  );
}

function EulerEarnDetailFallback({
  chainId,
  address,
}: EulerEarnDetailPageProps) {
  return (
    <>
      <BackToVaultsLink chainId={chainId} />
      <div className="detail-header">
        <h2>Loading vault...</h2>
        <div className="address">{address}</div>
      </div>
      <div className="status-message">Loading vault details...</div>
    </>
  );
}

async function EulerEarnDetailSection({
  chainId,
  address,
}: EulerEarnDetailPageProps) {
  try {
    const vault = await getEulerEarnDetailData(chainId, address);
    const supplyApy = vault.supplyApy;

    return (
      <>
        <BackToVaultsLink chainId={chainId} />

        <div className="detail-header">
          <h2>{vault.shares.name || "Unnamed Vault"}</h2>
          <div className="address">{vault.address}</div>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <div className="label">Asset</div>
            <div className="value">
              {vault.asset.symbol} ({vault.asset.name})
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Asset Address</div>
            <div className="value">{vault.asset.address}</div>
          </div>
          <div className="detail-item">
            <div className="label">Asset USD Price</div>
            <div className="value">{formatPriceUsd(vault.marketPriceUsd)}</div>
          </div>
          <div className="detail-item">
            <div className="label">Total Assets</div>
            <div className="value">
              {formatBigInt(vault.totalAssets, vault.asset.decimals)}{" "}
              {vault.asset.symbol}
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Total Shares</div>
            <div className="value">
              {formatBigInt(vault.totalShares, vault.shares.decimals)}
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Supply APY (weighted)</div>
            <div className="value">
              {supplyApy !== undefined ? formatPercent(supplyApy) : "-"}
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Performance Fee</div>
            <div className="value">{formatPercent(vault.performanceFee)}</div>
          </div>
          <div className="detail-item">
            <div className="label">Available Assets</div>
            <div className="value">
              {formatBigInt(vault.availableAssets, vault.asset.decimals)}{" "}
              {vault.asset.symbol}
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Lost Assets</div>
            <div className="value">
              {formatBigInt(vault.lostAssets, vault.asset.decimals)}{" "}
              {vault.asset.symbol}
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Strategies</div>
            <div className="value">{vault.strategies.length}</div>
          </div>
        </div>

        <h3 className="section-title">Governance</h3>
        <div className="detail-grid">
          <div className="detail-item">
            <div className="label">Owner</div>
            <div className="value">
              <CopyAddress address={vault.governance.owner} />
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Curator</div>
            <div className="value">
              <CopyAddress address={vault.governance.curator} />
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Guardian</div>
            <div className="value">
              <CopyAddress address={vault.governance.guardian} />
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Fee Receiver</div>
            <div className="value">
              <CopyAddress address={vault.governance.feeReceiver} />
            </div>
          </div>
          <div className="detail-item">
            <div className="label">Timelock</div>
            <div className="value">{vault.governance.timelock}s</div>
          </div>
        </div>

        <h3 className="section-title">
          Strategies ({vault.strategies.length})
        </h3>
        {vault.strategies.length === 0 ? (
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
                        {strategy.vault.shares.name ||
                          strategy.vault.asset.symbol}
                      </Link>
                    ) : (
                      strategy.shares.name ||
                      strategy.asset.symbol || (
                        <CopyAddress address={strategy.address} />
                      )
                    )}
                  </td>
                  <td>
                    <CopyAddress address={strategy.address} />
                  </td>
                  <td>{strategy.vaultType}</td>
                  <td>
                    {formatBigInt(
                      strategy.allocatedAssets,
                      vault.asset.decimals,
                    )}{" "}
                    {vault.asset.symbol}
                  </td>
                  <td>
                    {strategy.allocationCap.current === 0n
                      ? "Unlimited"
                      : formatBigInt(
                          strategy.allocationCap.current,
                          vault.asset.decimals,
                        )}
                  </td>
                  <td>
                    {strategy.vault
                      ? formatAPY(strategy.vault.interestRates.supplyAPY)
                      : "-"}
                  </td>
                  <td>
                    {formatBigInt(strategy.totalAssets, vault.asset.decimals)}{" "}
                    {vault.asset.symbol}
                  </td>
                  <td>{formatPriceUsd(strategy.vault?.marketPriceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  } catch (error) {
    return (
      <>
        <BackToVaultsLink chainId={chainId} />
        <div className="error-message">Error: {String(error)}</div>
      </>
    );
  }
}

export function EulerEarnDetailPage({
  chainId,
  address,
}: EulerEarnDetailPageProps) {
  return (
    <Suspense
      key={`${chainId}:${address}`}
      fallback={<EulerEarnDetailFallback chainId={chainId} address={address} />}
    >
      <EulerEarnDetailSection chainId={chainId} address={address} />
    </Suspense>
  );
}
