import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import { useVaultDetail } from "../queries/sdkQueries.ts";
import {
  formatBigInt,
  formatAPY,
  formatPercent,
  formatPriceUsd,
} from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";

export function VaultDetailPage() {
  const { chainId: chainIdParam, address } = useParams<{
    chainId: string;
    address: string;
  }>();
  const { loading: sdkLoading, error: sdkError, setChainId } = useSDK();

  const chainId = Number(chainIdParam);

  useEffect(() => {
    setChainId(chainId);
  }, [chainId, setChainId]);

  const { data: vault, isLoading, error } = useVaultDetail(chainId, address);

  if (sdkLoading)
    return <div className="status-message">Initializing SDK...</div>;
  if (sdkError)
    return <div className="error-message">SDK Error: {sdkError}</div>;
  if (isLoading) return <div className="status-message">Loading vault...</div>;
  if (error)
    return <div className="error-message">Error: {String(error)}</div>;
  if (!vault) return <div className="status-message">Vault not found</div>;

  return (
    <>
      <Link to="/" className="back-link">
        &larr; Back to vaults
      </Link>

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
          <div className="label">Unit of Account</div>
          <div className="value">
            {vault.unitOfAccount.symbol} ({vault.unitOfAccount.name})
          </div>
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
          <div className="label">Total Borrowed</div>
          <div className="value">
            {formatBigInt(vault.totalBorrowed, vault.asset.decimals)}{" "}
            {vault.asset.symbol}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Total Cash</div>
          <div className="value">
            {formatBigInt(vault.totalCash, vault.asset.decimals)}{" "}
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
          <div className="label">Supply APY</div>
          <div className="value">
            {formatAPY(vault.interestRates.supplyAPY)}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Borrow APY</div>
          <div className="value">
            {formatAPY(vault.interestRates.borrowAPY)}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Supply Cap</div>
          <div className="value">
            {vault.caps.supplyCap === 0n
              ? "Unlimited"
              : formatBigInt(vault.caps.supplyCap, vault.asset.decimals)}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Borrow Cap</div>
          <div className="value">
            {vault.caps.borrowCap === 0n
              ? "Unlimited"
              : formatBigInt(vault.caps.borrowCap, vault.asset.decimals)}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Governor</div>
          <div className="value"><CopyAddress address={vault.governorAdmin} /></div>
        </div>
        <div className="detail-item">
          <div className="label">Interest Fee</div>
          <div className="value">{formatPercent(vault.fees.interestFee)}</div>
        </div>
        <div className="detail-item">
          <div className="label">Oracle</div>
          <div className="value">
            {vault.oracle.name || <CopyAddress address={vault.oracle.oracle} />}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">IRM Type</div>
          <div className="value">{vault.interestRateModel.type}</div>
        </div>
      </div>

      <h3 className="section-title">
        Collaterals ({vault.collaterals.length})
      </h3>
      {vault.collaterals.length === 0 ? (
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
                    <Link to={`/vault/${chainId}/${col.address}`}>
                      {col.vault.shares.name || col.vault.asset.symbol}
                    </Link>
                  ) : (
                    <CopyAddress address={col.address} />
                  )}
                </td>
                <td><CopyAddress address={col.address} /></td>
                <td>{formatPercent(col.borrowLTV)}</td>
                <td>{formatPercent(col.liquidationLTV)}</td>
                <td>{formatPriceUsd(col.marketPriceUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
