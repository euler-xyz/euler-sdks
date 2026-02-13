import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAllEVaults } from "../queries/useVaultQueries.ts";
import { useSDK } from "../context/SdkContext.tsx";
import { TokenIcon } from "../components/TokenIcon.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { formatBigInt, formatAPY } from "../utils/format.ts";
import type { EVault } from "euler-v2-sdk";

type SortKey = "asset" | "supplyAPY" | "borrowAPY" | "totalAssets" | "utilization" | "collaterals";
type SortDir = "asc" | "desc";

function getUtilization(v: EVault): number {
  if (v.totalAssets === 0n) return 0;
  return Number(v.totalBorrowed * 10000n / v.totalAssets) / 100;
}

function getSortValue(v: EVault, key: SortKey): string | number {
  switch (key) {
    case "asset": return v.asset.symbol.toLowerCase();
    case "supplyAPY": return parseFloat(v.interestRates.supplyAPY);
    case "borrowAPY": return parseFloat(v.interestRates.borrowAPY);
    case "totalAssets": return Number(v.totalAssets);
    case "utilization": return getUtilization(v);
    case "collaterals": return v.collaterals.length;
  }
}

export function LendPage() {
  const { chainId } = useSDK();
  const { data: vaults, isLoading, error } = useAllEVaults();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalAssets");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    let list = vaults ?? [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.asset.symbol.toLowerCase().includes(q) ||
          v.shares.name.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [vaults, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (
      <span className="sort-icon active">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
    ) : (
      <span className="sort-icon">{"\u25BC"}</span>
    );

  if (error) return <div className="error-state">Error loading vaults: {String(error)}</div>;

  return (
    <>
      <h1 className="page-title">Lend</h1>
      <div className="search-container">
        <input
          className="search-input"
          placeholder="Search by asset, vault name, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="empty-state">No vaults found</div>
      ) : (
        <div className="table-wrapper">
          <table className="vault-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("asset")}>Asset {sortIcon("asset")}</th>
                <th>Vault</th>
                <th className="num" onClick={() => handleSort("supplyAPY")}>
                  Supply APY {sortIcon("supplyAPY")}
                </th>
                <th className="num" onClick={() => handleSort("borrowAPY")}>
                  Borrow APY {sortIcon("borrowAPY")}
                </th>
                <th className="num" onClick={() => handleSort("totalAssets")}>
                  Total Supply {sortIcon("totalAssets")}
                </th>
                <th className="num" onClick={() => handleSort("utilization")}>
                  Utilization {sortIcon("utilization")}
                </th>
                <th className="num" onClick={() => handleSort("collaterals")}>
                  Collaterals {sortIcon("collaterals")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const util = getUtilization(v);
                return (
                  <tr
                    key={v.address}
                    onClick={() => navigate(`/vault/${chainId}/${v.address}`)}
                  >
                    <td>
                      <div className="token-cell">
                        <TokenIcon address={v.asset.address} symbol={v.asset.symbol} />
                        <div className="token-cell-info">
                          <span className="token-cell-symbol">{v.asset.symbol}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
                      {v.shares.name}
                    </td>
                    <td className="num">
                      <span className="apy-positive">{formatAPY(v.interestRates.supplyAPY)}</span>
                    </td>
                    <td className="num">
                      <span style={{ color: "var(--color-text-tertiary)" }}>
                        {formatAPY(v.interestRates.borrowAPY)}
                      </span>
                    </td>
                    <td className="num">
                      {formatBigInt(v.totalAssets, v.asset.decimals)} {v.asset.symbol}
                    </td>
                    <td className="num">
                      <div className="utilization-bar">
                        <span>{util.toFixed(1)}%</span>
                        <div className="utilization-bar-track">
                          <div
                            className="utilization-bar-fill"
                            style={{ width: `${Math.min(util, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <span className="badge badge-neutral">{v.collaterals.length}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
