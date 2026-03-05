import { useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import {
  type DiagnosticIssue,
  useOracleAdapterMetadataMap,
  useVaultDetailWithDiagnostics,
} from "../queries/sdkQueries.ts";
import {
  formatBigInt,
  formatAPY,
  formatPercent,
  formatPriceUsd,
} from "../utils/format.ts";
import {
  createEntityDiagnosticIndex,
  formatDiagnosticIssues,
} from "../utils/diagnosticIndex.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ApyCell } from "../components/ApyCell.tsx";
import { ErrorIcon } from "../components/ErrorIcon.tsx";
import { OracleAdaptersInfo } from "../components/OracleAdaptersInfo.tsx";

function normalizeVaultDetailPath(path: string | undefined): string | undefined {
  if (!path) return path;
  if (path === "$.eVaults[0]") return "$";
  if (path.startsWith("$.eVaults[0].")) return `$.${path.slice("$.eVaults[0].".length)}`;
  if (path === "$.vaults[0]") return "$";
  if (path.startsWith("$.vaults[0].")) return `$.${path.slice("$.vaults[0].".length)}`;
  return path;
}

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

  const {
    data,
    isLoading,
    error,
    dataUpdatedAt: diagnosticsDataUpdatedAt,
  } = useVaultDetailWithDiagnostics(chainId, address);
  const { data: oracleAdapterMetadataMap } = useOracleAdapterMetadataMap(chainId);
  const vault = data?.vault;
  const diagnostics = data?.diagnostics ?? [];
  const failedVaults = data?.failedVaults ?? [];
  const visibleDiagnostics = useMemo(
    () => diagnostics.filter((issue) => issue.severity === "warning" || issue.severity === "error"),
    [diagnostics]
  );
  const collateralDiagnosticIndex = useMemo(() => {
    if (!vault) {
      return createEntityDiagnosticIndex({
        diagnostics: [],
        resolveEntityKey: () => undefined,
      });
    }

    return createEntityDiagnosticIndex({
      diagnostics,
      resolveEntityKey: (issue) => {
        const path = normalizeVaultDetailPath(issue.path);
        const match = path?.match(/^\$\.collaterals\[(\d+)\](?:\.|$)/);
        if (!match) return undefined;
        const collateral = vault.collaterals[Number(match[1])];
        if (!collateral) return undefined;
        return collateral.address.toLowerCase();
      },
      normalizePath: (path) => {
        const normalizedPath = normalizeVaultDetailPath(path);
        if (!normalizedPath) return "$";
        const match = normalizedPath.match(/^\$\.collaterals\[\d+\](?:\.(.*))?$/);
        if (!match) return normalizedPath;
        return match[1] ? `$.${match[1]}` : "$";
      },
    });
  }, [diagnostics, vault, diagnosticsDataUpdatedAt]);

  const renderCollateralFieldIcon = (collateralAddress: string, paths: string[]) => {
    const issues = collateralDiagnosticIndex.getExactFieldIssues(collateralAddress.toLowerCase(), paths);
    if (issues.length === 0) return null;
    return <ErrorIcon details={formatDiagnosticIssues(issues)} position="leading" />;
  };

  const fieldDiagnostics = (paths: string[]): DiagnosticIssue[] => {
    return visibleDiagnostics.filter((issue) => {
      const issuePath = normalizeVaultDetailPath(issue.path) ?? "";
      return paths.some((path) => (
        issuePath === path ||
        issuePath.startsWith(`${path}.`) ||
        issuePath.startsWith(`${path}[`)
      ));
    });
  };

  const renderDiagnostics = (paths: string[]) => {
    const matches = fieldDiagnostics(paths);
    if (matches.length === 0) return null;

    return (
      <div className="field-diagnostics">
        {matches.map((issue, index) => (
          <div
            key={`${issue.path ?? "unknown"}-${issue.code ?? "issue"}-${index}`}
            className={`field-diagnostic ${issue.severity === "error" ? "error" : "warning"}`}
          >
            {issue.message ?? issue.code ?? "Diagnostic issue"}
          </div>
        ))}
      </div>
    );
  };

  if (sdkLoading)
    return <div className="status-message">Initializing SDK...</div>;
  if (sdkError)
    return <div className="error-message">SDK Error: {sdkError}</div>;
  if (isLoading) return <div className="status-message">Loading vault...</div>;
  if (error)
    return <div className="error-message">Error: {String(error)}</div>;
  if (!vault) {
    const fallbackDetails = visibleDiagnostics.map((issue) => issue.message ?? issue.code ?? "Unknown error").join("\n");
    return (
      <>
        <Link to="/" className="back-link">
          &larr; Back to vaults
        </Link>
        <div className="failed-vaults-panel">
          <div className="failed-vaults-title">Vault Fetch Failed</div>
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{address ?? "-"}</td>
                <td>
                  <ErrorIcon details={(failedVaults[0]?.details ?? fallbackDetails) || "Failed to fetch vault"} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

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
          {renderDiagnostics(["$.asset"])}
        </div>
        <div className="detail-item">
          <div className="label">Asset Address</div>
          <div className="value">{vault.asset.address}</div>
          {renderDiagnostics(["$.asset.address"])}
        </div>
        <div className="detail-item">
          <div className="label">Unit of Account</div>
          <div className="value">
            {vault.unitOfAccount.symbol} ({vault.unitOfAccount.name})
          </div>
          {renderDiagnostics(["$.unitOfAccount"])}
        </div>
        <div className="detail-item">
          <div className="label">Asset USD Price</div>
          <div className="value">{formatPriceUsd(vault.marketPriceUsd)}</div>
          {renderDiagnostics(["$.marketPriceUsd"])}
        </div>
        <div className="detail-item">
          <div className="label">Total Assets</div>
          <div className="value">
            {formatBigInt(vault.totalAssets, vault.asset.decimals)}{" "}
            {vault.asset.symbol}
          </div>
          {renderDiagnostics(["$.totalAssets"])}
        </div>
        <div className="detail-item">
          <div className="label">Total Borrowed</div>
          <div className="value">
            {formatBigInt(vault.totalBorrowed, vault.asset.decimals)}{" "}
            {vault.asset.symbol}
          </div>
          {renderDiagnostics(["$.totalBorrowed"])}
        </div>
        <div className="detail-item">
          <div className="label">Total Cash</div>
          <div className="value">
            {formatBigInt(vault.totalCash, vault.asset.decimals)}{" "}
            {vault.asset.symbol}
          </div>
          {renderDiagnostics(["$.totalCash"])}
        </div>
        <div className="detail-item">
          <div className="label">Total Shares</div>
          <div className="value">
            {formatBigInt(vault.totalShares, vault.shares.decimals)}
          </div>
          {renderDiagnostics(["$.totalShares"])}
        </div>
        <div className="detail-item">
          <div className="label">Supply APY</div>
          <div className="value">
            <ApyCell
              baseApy={Number(vault.interestRates.supplyAPY)}
              rewards={vault.rewards}
              intrinsicApy={vault.intrinsicApy}
            />
          </div>
          {renderDiagnostics(["$.interestRates.supplyAPY", "$.rewards", "$.intrinsicApy"])}
        </div>
        <div className="detail-item">
          <div className="label">Borrow APY</div>
          <div className="value">
            {formatAPY(vault.interestRates.borrowAPY)}
          </div>
          {renderDiagnostics(["$.interestRates.borrowAPY"])}
        </div>
        <div className="detail-item">
          <div className="label">Supply Cap</div>
          <div className="value">
            {vault.caps.supplyCap === 0n
              ? "Unlimited"
              : formatBigInt(vault.caps.supplyCap, vault.asset.decimals)}
          </div>
          {renderDiagnostics(["$.caps.supplyCap"])}
        </div>
        <div className="detail-item">
          <div className="label">Borrow Cap</div>
          <div className="value">
            {vault.caps.borrowCap === 0n
              ? "Unlimited"
              : formatBigInt(vault.caps.borrowCap, vault.asset.decimals)}
          </div>
          {renderDiagnostics(["$.caps.borrowCap"])}
        </div>
        <div className="detail-item">
          <div className="label">Governor</div>
          <div className="value"><CopyAddress address={vault.governorAdmin} /></div>
          {renderDiagnostics(["$.governorAdmin"])}
        </div>
        <div className="detail-item">
          <div className="label">Interest Fee</div>
          <div className="value">{formatPercent(vault.fees.interestFee)}</div>
          {renderDiagnostics(["$.fees.interestFee"])}
        </div>
        <div className="detail-item">
          <div className="label">Oracle</div>
          <div className="value">
            {vault.oracle.name || <CopyAddress address={vault.oracle.oracle} />}
          </div>
          {renderDiagnostics(["$.oracle"])}
        </div>
        <div className="detail-item">
          <div className="label">IRM Type</div>
          <div className="value">{vault.interestRateModel.type}</div>
          {renderDiagnostics(["$.interestRateModel"])}
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
                  {renderCollateralFieldIcon(col.address, ["$", "$.vault"])}
                  {col.vault ? (
                    <Link to={`/vault/${chainId}/${col.address}`}>
                      {col.vault.shares.name || col.vault.asset.symbol}
                    </Link>
                  ) : (
                    <CopyAddress address={col.address} />
                  )}
                </td>
                <td>
                  {renderCollateralFieldIcon(col.address, ["$.address"])}
                  <CopyAddress address={col.address} />
                </td>
                <td>
                  {renderCollateralFieldIcon(col.address, ["$.borrowLTV"])}
                  {formatPercent(col.borrowLTV)}
                </td>
                <td>
                  {renderCollateralFieldIcon(col.address, ["$.liquidationLTV"])}
                  {formatPercent(col.liquidationLTV)}
                </td>
                <td>
                  {renderCollateralFieldIcon(col.address, ["$.marketPriceUsd", "$.oracleAdapters"])}
                  <OracleAdaptersInfo
                    chainId={chainId}
                    adapters={col.oracleAdapters}
                    metadataMap={oracleAdapterMetadataMap}
                  />
                  {formatPriceUsd(col.marketPriceUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
