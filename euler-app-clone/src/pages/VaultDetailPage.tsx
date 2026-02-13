import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { useVaultDetail } from "../queries/useVaultQueries.ts";
import { useSDK } from "../context/SdkContext.tsx";
import { TokenIcon } from "../components/TokenIcon.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { Spinner } from "../components/Spinner.tsx";
import {
  formatBigInt,
  formatAPY,
  formatPercent,
  formatPriceUsd,
  shortenAddress,
} from "../utils/format.ts";
import { getExplorerUrl } from "../utils/chains.ts";
const IRM_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "Kink",
  2: "Adaptive Curve",
  3: "Kinky",
  4: "Fixed Cyclical Binary",
};

export function VaultDetailPage() {
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

  const { data: vault, isLoading, error } = useVaultDetail(numChain, address);

  if (isLoading) return <Spinner />;
  if (error) return <div className="error-state">Error: {String(error)}</div>;
  if (!vault) return <div className="empty-state">Vault not found</div>;

  const utilization =
    vault.totalAssets > 0n
      ? Number(vault.totalBorrowed * 10000n / vault.totalAssets) / 100
      : 0;

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
          label="Total Supply"
          value={`${formatBigInt(vault.totalAssets, vault.asset.decimals)} ${vault.asset.symbol}`}
        />
        <StatCard
          label="Total Borrowed"
          value={`${formatBigInt(vault.totalBorrowed, vault.asset.decimals)} ${vault.asset.symbol}`}
        />
        <StatCard
          label="Available Liquidity"
          value={`${formatBigInt(vault.totalCash, vault.asset.decimals)} ${vault.asset.symbol}`}
        />
        <StatCard label="Utilization" value={`${utilization.toFixed(2)}%`} />
        <StatCard label="Supply APY" value={formatAPY(vault.interestRates.supplyAPY)} />
        <StatCard label="Borrow APY" value={formatAPY(vault.interestRates.borrowAPY)} />
        <StatCard
          label="Supply Cap"
          value={
            vault.caps.supplyCap === 0n
              ? "Unlimited"
              : `${formatBigInt(vault.caps.supplyCap, vault.asset.decimals)} ${vault.asset.symbol}`
          }
        />
        <StatCard
          label="Borrow Cap"
          value={
            vault.caps.borrowCap === 0n
              ? "Unlimited"
              : `${formatBigInt(vault.caps.borrowCap, vault.asset.decimals)} ${vault.asset.symbol}`
          }
        />
      </div>

      {vault.collaterals.length > 0 && (
        <div className="detail-section">
          <h2 className="detail-section-title">Collaterals</h2>
          <div className="table-wrapper">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Collateral</th>
                  <th className="num">Borrow LTV</th>
                  <th className="num">Liquidation LTV</th>
                  <th className="num">USD Price</th>
                </tr>
              </thead>
              <tbody>
                {vault.collaterals.map((c) => (
                  <tr key={c.address}>
                    <td>
                      <div className="token-cell">
                        <TokenIcon
                          address={c.vault?.asset.address}
                          symbol={c.vault?.asset.symbol ?? "?"}
                        />
                        <div className="token-cell-info">
                          <span className="token-cell-symbol">
                            {c.vault ? (
                              <Link to={`/vault/${numChain}/${c.address}`}>
                                {c.vault.asset.symbol}
                              </Link>
                            ) : (
                              shortenAddress(c.address)
                            )}
                          </span>
                          {c.vault && (
                            <span className="token-cell-name">{c.vault.shares.name}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num">{formatPercent(c.borrowLTV)}</td>
                    <td className="num">{formatPercent(c.liquidationLTV)}</td>
                    <td className="num">
                      {c.marketPriceUsd ? formatPriceUsd(c.marketPriceUsd) : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="detail-section">
        <h2 className="detail-section-title">Configuration</h2>
        <div className="config-grid">
          <div className="config-item">
            <div className="config-label">Unit of Account</div>
            <div className="config-value">
              {vault.unitOfAccount.symbol} ({vault.unitOfAccount.name})
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Oracle</div>
            <div className="config-value">{vault.oracle.name || shortenAddress(vault.oracle.oracle)}</div>
          </div>
          <div className="config-item">
            <div className="config-label">IRM Type</div>
            <div className="config-value">
              {IRM_NAMES[vault.interestRateModel.type] ?? "Unknown"}
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Interest Fee</div>
            <div className="config-value">{formatPercent(vault.fees.interestFee)}</div>
          </div>
          <div className="config-item">
            <div className="config-label">Max Liq. Discount</div>
            <div className="config-value">{formatPercent(vault.liquidation.maxLiquidationDiscount)}</div>
          </div>
          <div className="config-item">
            <div className="config-label">Liq. Cool-off</div>
            <div className="config-value">{vault.liquidation.liquidationCoolOffTime}s</div>
          </div>
          <div className="config-item">
            <div className="config-label">Governor</div>
            <div className="config-value">
              <a
                href={getExplorerUrl(numChain, "address", vault.governorAdmin)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortenAddress(vault.governorAdmin)}
              </a>
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Creator</div>
            <div className="config-value">
              <a
                href={getExplorerUrl(numChain, "address", vault.creator)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortenAddress(vault.creator)}
              </a>
            </div>
          </div>
          <div className="config-item">
            <div className="config-label">Hook Target</div>
            <div className="config-value">
              {vault.hooks.hookTarget === "0x0000000000000000000000000000000000000000"
                ? "None"
                : shortenAddress(vault.hooks.hookTarget)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
