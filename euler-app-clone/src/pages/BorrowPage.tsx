import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAllEVaults } from "../queries/useVaultQueries.ts";
import { useSDK } from "../context/SdkContext.tsx";
import { TokenIcon } from "../components/TokenIcon.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { formatBigInt, formatAPY, formatPercent } from "../utils/format.ts";
import type { EVault } from "euler-v2-sdk";

type SortKey = "asset" | "borrowAPY" | "maxLTV" | "liquidationLTV" | "available";
type SortDir = "asc" | "desc";

function maxBorrowLTV(v: EVault): number {
  if (v.collaterals.length === 0) return 0;
  return Math.max(...v.collaterals.map((c) => c.borrowLTV));
}

function maxLiqLTV(v: EVault): number {
  if (v.collaterals.length === 0) return 0;
  return Math.max(...v.collaterals.map((c) => c.liquidationLTV));
}

function getSortValue(v: EVault, key: SortKey): number | string {
  switch (key) {
    case "asset": return v.asset.symbol.toLowerCase();
    case "borrowAPY": return parseFloat(v.interestRates.borrowAPY);
    case "maxLTV": return maxBorrowLTV(v);
    case "liquidationLTV": return maxLiqLTV(v);
    case "available": return Number(v.totalCash);
  }
}

export function BorrowPage() {
  const { chainId } = useSDK();
  const { data: vaults, isLoading, error } = useAllEVaults();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("available");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    let list = (vaults ?? []).filter((v) => v.collaterals.length > 0);
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

  if (error) return <div className="error-state">Error: {String(error)}</div>;

  return (
    <>
      <h1 className="page-title">Borrow</h1>
      <div className="search-container">
        <input
          className="search-input"
          placeholder="Search by asset or vault name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="empty-state">No borrowable vaults found</div>
      ) : (
        <div className="table-wrapper">
          <table className="vault-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("asset")}>Debt Asset {sortIcon("asset")}</th>
                <th>Collaterals</th>
                <th className="num" onClick={() => handleSort("borrowAPY")}>
                  Borrow APY {sortIcon("borrowAPY")}
                </th>
                <th className="num" onClick={() => handleSort("maxLTV")}>
                  Max LTV {sortIcon("maxLTV")}
                </th>
                <th className="num" onClick={() => handleSort("liquidationLTV")}>
                  Liq. LTV {sortIcon("liquidationLTV")}
                </th>
                <th className="num" onClick={() => handleSort("available")}>
                  Available {sortIcon("available")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr
                  key={v.address}
                  onClick={() => navigate(`/vault/${chainId}/${v.address}`)}
                >
                  <td>
                    <div className="token-cell">
                      <TokenIcon address={v.asset.address} symbol={v.asset.symbol} />
                      <div className="token-cell-info">
                        <span className="token-cell-symbol">{v.asset.symbol}</span>
                        <span className="token-cell-name">{v.shares.name}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="collateral-icons">
                      {v.collaterals.slice(0, 5).map((c) => (
                        <TokenIcon
                          key={c.address}
                          address={c.vault?.asset.address}
                          symbol={c.vault?.asset.symbol ?? "?"}
                          size={20}
                        />
                      ))}
                      {v.collaterals.length > 5 && (
                        <span className="collateral-count">+{v.collaterals.length - 5}</span>
                      )}
                    </div>
                  </td>
                  <td className="num">
                    <span style={{ color: "var(--color-warning)" }}>
                      {formatAPY(v.interestRates.borrowAPY)}
                    </span>
                  </td>
                  <td className="num">{formatPercent(maxBorrowLTV(v))}</td>
                  <td className="num">{formatPercent(maxLiqLTV(v))}</td>
                  <td className="num">
                    {formatBigInt(v.totalCash, v.asset.decimals)} {v.asset.symbol}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
