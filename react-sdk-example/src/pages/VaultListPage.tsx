import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import { useVerifiedVaults } from "../queries/sdkQueries.ts";
import {
  StandardEVaultPerspectives,
  StandardEulerEarnPerspectives,
  isEVault,
  isEulerEarn,
} from "euler-v2-sdk";
import { formatBigInt, formatAPY, formatPercent, formatPriceUsd } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";

const ALL_PERSPECTIVES = [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
  StandardEulerEarnPerspectives.GOVERNED,
];

type Tab = "evaults" | "eulerEarn" | "securitize";

export function VaultListPage() {
  const { chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("evaults");

  const { data: allVaults, isLoading, error } = useVerifiedVaults(ALL_PERSPECTIVES);

  const eVaults = allVaults?.filter(isEVault) ?? [];
  const earnVaults = allVaults?.filter(isEulerEarn) ?? [];

  if (sdkLoading)
    return <div className="status-message">Initializing SDK...</div>;
  if (sdkError)
    return <div className="error-message">SDK Error: {sdkError}</div>;

  return (
    <>
      <div className="tabs">
        <button
          className={`tab ${tab === "evaults" ? "active" : ""}`}
          onClick={() => setTab("evaults")}
        >
          EVaults ({isLoading ? "..." : eVaults.length})
        </button>
        <button
          className={`tab ${tab === "eulerEarn" ? "active" : ""}`}
          onClick={() => setTab("eulerEarn")}
        >
          Euler Earn ({isLoading ? "..." : earnVaults.length})
        </button>
        <button
          className={`tab ${tab === "securitize" ? "active" : ""}`}
          onClick={() => setTab("securitize")}
        >
          Securitize
        </button>
      </div>

      {tab === "evaults" && (
        <>
          {isLoading ? (
            <div className="status-message">Loading EVaults...</div>
          ) : error ? (
            <div className="error-message">Error: {String(error)}</div>
          ) : eVaults.length === 0 ? (
            <div className="status-message">No EVaults found</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Asset</th>
                  <th>Address</th>
                  <th>Total Supply</th>
                  <th>Total Borrows</th>
                  <th>Supply APY</th>
                  <th>Borrow APY</th>
                  <th>USD Price</th>
                  <th>Collaterals</th>
                </tr>
              </thead>
              <tbody>
                {eVaults.map((vault) => (
                  <tr
                    key={vault.address}
                    className="clickable"
                    onClick={() =>
                      navigate(`/vault/${chainId}/${vault.address}`)
                    }
                  >
                    <td>{vault.shares.name || "-"}</td>
                    <td>{vault.asset.symbol}</td>
                    <td><CopyAddress address={vault.address} /></td>
                    <td>
                      {formatBigInt(vault.totalAssets, vault.asset.decimals)}
                    </td>
                    <td>
                      {formatBigInt(vault.totalBorrowed, vault.asset.decimals)}
                    </td>
                    <td>{formatAPY(vault.interestRates.supplyAPY)}</td>
                    <td>{formatAPY(vault.interestRates.borrowAPY)}</td>
                    <td>{formatPriceUsd(vault.marketPriceUsd)}</td>
                    <td>{vault.collaterals.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === "eulerEarn" && (
        <>
          {isLoading ? (
            <div className="status-message">Loading Euler Earn vaults...</div>
          ) : error ? (
            <div className="error-message">Error: {String(error)}</div>
          ) : earnVaults.length === 0 ? (
            <div className="status-message">No Euler Earn vaults found</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Asset</th>
                  <th>Address</th>
                  <th>Total Assets</th>
                  <th>Supply APY</th>
                  <th>USD Price</th>
                  <th>Strategies</th>
                  <th>Perf. Fee</th>
                </tr>
              </thead>
              <tbody>
                {earnVaults.map((vault) => (
                  <tr
                    key={vault.address}
                    className="clickable"
                    onClick={() =>
                      navigate(`/earn/${chainId}/${vault.address}`)
                    }
                  >
                    <td>{vault.shares.name || "-"}</td>
                    <td>{vault.asset.symbol}</td>
                    <td><CopyAddress address={vault.address} /></td>
                    <td>
                      {formatBigInt(vault.totalAssets, vault.asset.decimals)}
                    </td>
                    <td>
                      {vault.supplyApy !== undefined
                        ? formatPercent(vault.supplyApy)
                        : "-"}
                    </td>
                    <td>{formatPriceUsd(vault.marketPriceUsd)}</td>
                    <td>{vault.strategies.length}</td>
                    <td>{(vault.performanceFee * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === "securitize" && (
        <div className="status-message">
          Securitize vaults have no predefined perspectives. They are resolved
          per-address when used as collateral in EVaults.
        </div>
      )}
    </>
  );
}
