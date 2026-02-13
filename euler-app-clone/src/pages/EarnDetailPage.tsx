import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { useEarnVaultDetail } from "../queries/useEarnQueries.ts";
import { useSDK } from "../context/SdkContext.tsx";
import { TokenIcon } from "../components/TokenIcon.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { Spinner } from "../components/Spinner.tsx";
import {
  formatBigInt,
  formatAPYNumber,
  formatPercent,
  shortenAddress,
} from "../utils/format.ts";
import { getExplorerUrl } from "../utils/chains.ts";

export function EarnDetailPage() {
  const { chainId: chainParam, address } = useParams<{
    chainId: string;
    address: string;
  }>();
  const { setChainId, chainId } = useSDK();
  const navigate = useNavigate();

  const numChain = Number(chainParam);
  useEffect(() => {
    if (numChain && numChain !== chainId) setChainId(numChain);
  }, [numChain, chainId, setChainId]);

  const { data: vault, isLoading, error } = useEarnVaultDetail(numChain, address);

  if (isLoading) return <Spinner />;
  if (error) return <div className="error-state">Error: {String(error)}</div>;
  if (!vault) return <div className="empty-state">Vault not found</div>;

  return (
    <>
      <a className="detail-back" onClick={() => navigate(-1)} style={{ cursor: "pointer" }}>
        ← Back
      </a>

      <div className="detail-header">
        <TokenIcon address={vault.asset.address} symbol={vault.asset.symbol} size={40} />
        <div>
          <div className="detail-title">{vault.shares.name}</div>
          <div className="detail-address">
            <span className="detail-subtitle">{vault.address}</span>
            <button
              className="detail-address-copy"
              onClick={() => navigator.clipboard.writeText(vault.address)}
              title="Copy address"
            >
              Copy
            </button>
            <a
              href={getExplorerUrl(numChain, "address", vault.address)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "var(--font-size-sm)" }}
            >
              Explorer ↗
            </a>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          label="Total Assets"
          value={`${formatBigInt(vault.totalAssets, vault.asset.decimals)} ${vault.asset.symbol}`}
        />
        <StatCard label="Supply APY" value={formatAPYNumber(vault.supplyApy)} />
        <StatCard label="Performance Fee" value={formatPercent(vault.performanceFee)} />
        <StatCard
          label="Available Assets"
          value={`${formatBigInt(vault.availableAssets, vault.asset.decimals)} ${vault.asset.symbol}`}
        />
      </div>

      {vault.strategies.length > 0 && (
        <div className="detail-section">
          <h2 className="detail-section-title">Strategies ({vault.strategies.length})</h2>
          <div className="table-wrapper">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th className="num">Allocated</th>
                  <th className="num">Available</th>
                  <th className="num">Allocation Cap</th>
                  <th className="num">Supply APY</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vault.strategies.map((s) => {
                  const isPending = vault.isPendingRemoval(s);
                  return (
                    <tr key={s.address}>
                      <td>
                        <div className="token-cell">
                          <TokenIcon
                            address={s.vault?.asset.address}
                            symbol={s.vault?.asset.symbol ?? "?"}
                          />
                          <div className="token-cell-info">
                            <span className="token-cell-symbol">
                              {s.vault ? (
                                <Link to={`/vault/${numChain}/${s.address}`}>
                                  {s.vault.shares.name}
                                </Link>
                              ) : (
                                shortenAddress(s.address)
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="num">
                        {formatBigInt(s.allocatedAssets, vault.asset.decimals)} {vault.asset.symbol}
                      </td>
                      <td className="num">
                        {formatBigInt(s.availableAssets, vault.asset.decimals)} {vault.asset.symbol}
                      </td>
                      <td className="num">
                        {formatBigInt(s.allocationCap.current, vault.asset.decimals)} {vault.asset.symbol}
                      </td>
                      <td className="num">
                        <span className="apy-positive">
                          {s.vault
                            ? `${(parseFloat(s.vault.interestRates.supplyAPY) * 100).toFixed(2)}%`
                            : "--"}
                        </span>
                      </td>
                      <td>
                        {isPending ? (
                          <span className="badge badge-warning">Pending Removal</span>
                        ) : (
                          <span className="badge badge-success">Active</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="detail-section">
        <h2 className="detail-section-title">Governance</h2>
        <div className="config-grid">
          <div className="config-item">
            <div className="config-label">Owner</div>
            <div className="config-value">
              <a
                href={getExplorerUrl(numChain, "address", vault.governance.owner)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortenAddress(vault.governance.owner)}
              </a>
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Curator</div>
            <div className="config-value">
              <a
                href={getExplorerUrl(numChain, "address", vault.governance.curator)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortenAddress(vault.governance.curator)}
              </a>
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Guardian</div>
            <div className="config-value">
              <a
                href={getExplorerUrl(numChain, "address", vault.governance.guardian)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortenAddress(vault.governance.guardian)}
              </a>
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Creator</div>
            <div className="config-value">
              <a
                href={getExplorerUrl(numChain, "address", vault.governance.creator)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortenAddress(vault.governance.creator)}
              </a>
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Fee Receiver</div>
            <div className="config-value">
              {shortenAddress(vault.governance.feeReceiver)}
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Timelock</div>
            <div className="config-value">{vault.governance.timelock}s</div>
          </div>
        </div>
      </div>
    </>
  );
}
