import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import { useEulerEarnDetail } from "../queries/sdkQueries.ts";
import {
  formatBigInt,
  formatAPY,
  formatPercent,
  formatPriceUsd,
} from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ApyCell } from "../components/ApyCell.tsx";

export function EulerEarnDetailPage() {
  const { chainId: chainIdParam, address } = useParams<{
    chainId: string;
    address: string;
  }>();
  const { loading: sdkLoading, error: sdkError, setChainId } = useSDK();

  const chainId = Number(chainIdParam);

  useEffect(() => {
    setChainId(chainId);
  }, [chainId, setChainId]);

  const { data: vault, isLoading, error } = useEulerEarnDetail(chainId, address);

  if (sdkLoading)
    return <div className="status-message">Initializing SDK...</div>;
  if (sdkError)
    return <div className="error-message">SDK Error: {sdkError}</div>;
  if (isLoading)
    return <div className="status-message">Loading vault...</div>;
  if (error)
    return <div className="error-message">Error: {String(error)}</div>;
  if (!vault) return <div className="status-message">Vault not found</div>;

  const supplyApy = vault.supplyApy;

  return (
    <>
      <Link to="/" className="back-link">
        &larr; Back to vaults
      </Link>

      <div className="detail-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {vault.eulerLabel?.entities[0]?.logo && (
            <img
              src={vault.eulerLabel.entities[0].logo}
              alt=""
              style={{ width: 32, height: 32, borderRadius: 4 }}
            />
          )}
          <h2>{vault.eulerLabel?.vault.name || vault.shares.name || "Unnamed Vault"}</h2>
        </div>
        <div className="address">{vault.address}</div>
        {vault.eulerLabel?.vault.description && (
          <div style={{ marginTop: 8, opacity: 0.7, fontSize: "0.9em" }}>
            {vault.eulerLabel.vault.description}
          </div>
        )}
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
            {supplyApy !== undefined
              ? <ApyCell baseApy={supplyApy} rewards={vault.rewards} intrinsicApy={vault.intrinsicApy} />
              : "-"}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Performance Fee</div>
          <div className="value">
            {formatPercent(vault.performanceFee)}
          </div>
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

      {vault.eulerLabel && (
        <>
          {vault.eulerLabel.entities.length > 0 && (
            <>
              <h3 className="section-title">Entity</h3>
              <div className="detail-grid">
                {vault.eulerLabel.entities.map((entity, i) => (
                  <div className="detail-item" key={i}>
                    <div className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {entity.logo && (
                        <img src={entity.logo} alt="" style={{ width: 20, height: 20, borderRadius: 3 }} />
                      )}
                      {entity.name}
                    </div>
                    <div className="value">
                      {entity.url ? (
                        <a href={entity.url} target="_blank" rel="noopener noreferrer">{entity.url}</a>
                      ) : entity.description || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {vault.eulerLabel.products.length > 0 && (
            <>
              <h3 className="section-title">Products</h3>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Description</th>
                    <th>Vaults</th>
                  </tr>
                </thead>
                <tbody>
                  {vault.eulerLabel.products.map((product, i) => (
                    <tr key={i}>
                      <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {product.logo && (
                          <img src={product.logo} alt="" style={{ width: 20, height: 20, borderRadius: 3 }} />
                        )}
                        {product.url ? (
                          <a href={product.url} target="_blank" rel="noopener noreferrer">{product.name}</a>
                        ) : product.name}
                      </td>
                      <td>{product.description || "-"}</td>
                      <td>{product.vaults.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {vault.eulerLabel.points.length > 0 && (
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
                          <img src={point.logo} alt="" style={{ width: 20, height: 20, borderRadius: 3 }} />
                        )}
                        {point.url ? (
                          <a href={point.url} target="_blank" rel="noopener noreferrer">{point.name}</a>
                        ) : point.name}
                      </td>
                      <td>{point.description || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      <h3 className="section-title">Governance</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <div className="label">Owner</div>
          <div className="value"><CopyAddress address={vault.governance.owner} /></div>
        </div>
        <div className="detail-item">
          <div className="label">Curator</div>
          <div className="value"><CopyAddress address={vault.governance.curator} /></div>
        </div>
        <div className="detail-item">
          <div className="label">Guardian</div>
          <div className="value"><CopyAddress address={vault.governance.guardian} /></div>
        </div>
        <div className="detail-item">
          <div className="label">Fee Receiver</div>
          <div className="value"><CopyAddress address={vault.governance.feeReceiver} /></div>
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
                    <Link to={`/vault/${chainId}/${strategy.address}`}>
                      {strategy.vault.shares.name || strategy.vault.asset.symbol}
                    </Link>
                  ) : (
                    strategy.shares.name || strategy.asset.symbol || <CopyAddress address={strategy.address} />
                  )}
                </td>
                <td><CopyAddress address={strategy.address} /></td>
                <td>{strategy.vaultType}</td>
                <td>
                  {formatBigInt(strategy.allocatedAssets, vault.asset.decimals)}{" "}
                  {vault.asset.symbol}
                </td>
                <td>
                  {strategy.allocationCap.current === 0n
                    ? "Unlimited"
                    : formatBigInt(strategy.allocationCap.current, vault.asset.decimals)}
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
}
