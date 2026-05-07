import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import { useSecuritizeVaultDetail } from "../queries/sdkQueries.ts";
import {
  formatBigInt,
  formatPriceUsd,
  tokenAmountToUsdValue,
} from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ApyCell } from "../components/ApyCell.tsx";
import { RawEntityDialog } from "../components/RawEntityDialog.tsx";
import { CHAIN_NAMES } from "../config/chains.ts";

const MAX_UINT256 = (1n << 256n) - 1n;

export function SecuritizeDetailPage() {
  const { chainId: chainIdParam, address } = useParams<{
    chainId: string;
    address: string;
  }>();
  const { loading: sdkLoading, error: sdkError, setChainId } = useSDK();

  const chainId = Number(chainIdParam);

  useEffect(() => {
    setChainId(chainId);
  }, [chainId, setChainId]);

  const { data: vault, isLoading, error } = useSecuritizeVaultDetail(
    chainId,
    address
  );

  if (sdkLoading)
    return <div className="status-message">Initializing SDK...</div>;
  if (sdkError)
    return <div className="error-message">SDK Error: {sdkError}</div>;
  if (isLoading)
    return <div className="status-message">Loading vault...</div>;
  if (error)
    return <div className="error-message">Error: {String(error)}</div>;
  if (!vault) return <div className="status-message">Vault not found</div>;

  const totalSupplyUsd = tokenAmountToUsdValue(
    vault.totalAssets,
    vault.asset.decimals,
    vault.marketPriceUsd
  );

  const exchangeRate =
    vault.totalShares === 0n
      ? 1
      : Number(vault.totalAssets) / Number(vault.totalShares);

  const isUnlimitedCap = vault.supplyCap === 0n || vault.supplyCap === MAX_UINT256;

  const entity = vault.eulerLabel?.entities[0];
  const product = vault.eulerLabel?.products[0];

  return (
    <>
      <Link to="/securitize" className="back-link">
        &larr; Back to Securitize
      </Link>

      <div className="detail-header">
        <div style={{ float: "right" }}>
          <RawEntityDialog title="Raw Securitize Vault Entity" entity={vault} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {entity?.logo && (
            <img
              src={entity.logo}
              alt=""
              style={{ width: 32, height: 32, borderRadius: 4 }}
            />
          )}
          <div>
            <h2 style={{ margin: 0 }}>
              {vault.eulerLabel?.products[0]?.name || vault.shares.name || "Unnamed Vault"}
            </h2>
            <div style={{ opacity: 0.7, fontSize: "0.9em" }}>
              {vault.shares.symbol}
            </div>
          </div>
        </div>
        {vault.eulerLabel?.products[0]?.description && (
          <div style={{ marginTop: 12, opacity: 0.8 }}>
            {vault.eulerLabel.products[0]?.description}
          </div>
        )}
      </div>

      <h3 className="section-title">Overview</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <div className="label">Price</div>
          <div className="value">{formatPriceUsd(vault.marketPriceUsd)}</div>
        </div>
        <div className="detail-item">
          <div className="label">Chain</div>
          <div className="value">{CHAIN_NAMES[chainId] ?? chainId}</div>
        </div>
        <div className="detail-item">
          <div className="label">Market</div>
          <div className="value">
            {product?.url ? (
              <a href={product.url} target="_blank" rel="noopener noreferrer">
                {product.name}
              </a>
            ) : (
              product?.name ?? "-"
            )}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Risk manager</div>
          <div className="value">
            {entity ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {entity.logo && (
                  <img
                    src={entity.logo}
                    alt=""
                    style={{ width: 20, height: 20, borderRadius: 3 }}
                  />
                )}
                {entity.url ? (
                  <a href={entity.url} target="_blank" rel="noopener noreferrer">
                    {entity.name}
                  </a>
                ) : (
                  entity.name
                )}
              </div>
            ) : (
              "-"
            )}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Vault type</div>
          <div className="value">Governed · Securitize Digital Security</div>
        </div>
        <div className="detail-item">
          <div className="label">Can be borrowed</div>
          <div className="value">{vault.isBorrowable ? "Yes" : "No"}</div>
        </div>
      </div>

      <h3 className="section-title">Statistics</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <div className="label">Total supply</div>
          <div className="value">
            {formatBigInt(vault.totalAssets, vault.asset.decimals)}{" "}
            {vault.asset.symbol}
            {totalSupplyUsd !== undefined && (
              <span style={{ opacity: 0.7, marginLeft: 8 }}>
                ({formatPriceUsd(totalSupplyUsd)})
              </span>
            )}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Supply APY</div>
          <div className="value">
            <ApyCell
              baseApy={0}
              rewards={vault.rewards}
              intrinsicApy={vault.intrinsicApy}
            />
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Total shares</div>
          <div className="value">
            {formatBigInt(vault.totalShares, vault.shares.decimals)}
          </div>
        </div>
      </div>

      <h3 className="section-title">Risk parameters</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <div className="label">Supply cap</div>
          <div className="value">
            {isUnlimitedCap
              ? "∞"
              : `${formatBigInt(vault.supplyCap, vault.asset.decimals)} ${vault.asset.symbol}`}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Share token exchange rate</div>
          <div className="value">{exchangeRate.toFixed(2)}</div>
        </div>
      </div>

      <h3 className="section-title">Addresses</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <div className="label">
            {vault.asset.symbol} token
          </div>
          <div className="value">
            <CopyAddress address={vault.asset.address} />
          </div>
        </div>
        <div className="detail-item">
          <div className="label">
            {vault.shares.symbol} vault
          </div>
          <div className="value">
            <CopyAddress address={vault.address} />
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Governor</div>
          <div className="value">
            <CopyAddress address={vault.governor} />
          </div>
        </div>
      </div>

      {vault.eulerLabel?.points && vault.eulerLabel.points.length > 0 && (
        <>
          <h3 className="section-title">Points</h3>
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {vault.eulerLabel.points.map((point, i) => (
                <tr key={i}>
                  <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {point.logo && (
                      <img
                        src={point.logo}
                        alt=""
                        style={{ width: 20, height: 20, borderRadius: 3 }}
                      />
                    )}
                    {point.url ? (
                      <a
                        href={point.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {point.name}
                      </a>
                    ) : (
                      point.name
                    )}
                  </td>
                  <td>{point.description || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
