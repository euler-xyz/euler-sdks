import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEulerEarnVaults } from "../queries/useEarnQueries.ts";
import { useSDK } from "../context/SdkContext.tsx";
import { TokenIcon } from "../components/TokenIcon.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { formatBigInt, formatAPYNumber, formatPercent } from "../utils/format.ts";
import type { EulerEarn } from "euler-v2-sdk";

type SortKey = "name" | "asset" | "supplyAPY" | "totalAssets" | "strategies" | "fee";
type SortDir = "asc" | "desc";

function getSortValue(v: EulerEarn, key: SortKey): string | number {
  switch (key) {
    case "name": return v.shares.name.toLowerCase();
    case "asset": return v.asset.symbol.toLowerCase();
    case "supplyAPY": return v.supplyApy ?? -1;
    case "totalAssets": return Number(v.totalAssets);
    case "strategies": return v.strategies.length;
    case "fee": return v.performanceFee;
  }
}

export function EarnPage() {
  const { chainId } = useSDK();
  const { data: vaults, isLoading, error } = useEulerEarnVaults();
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
          v.shares.name.toLowerCase().includes(q),
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
      <h1 className="page-title">Earn</h1>
      <div className="search-container">
        <input
          className="search-input"
          placeholder="Search Euler Earn vaults..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="empty-state">No Euler Earn vaults found on this chain</div>
      ) : (
        <div className="table-wrapper">
          <table className="vault-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("name")}>Vault {sortIcon("name")}</th>
                <th onClick={() => handleSort("asset")}>Asset {sortIcon("asset")}</th>
                <th className="num" onClick={() => handleSort("supplyAPY")}>
                  Supply APY {sortIcon("supplyAPY")}
                </th>
                <th className="num" onClick={() => handleSort("totalAssets")}>
                  Total Assets {sortIcon("totalAssets")}
                </th>
                <th className="num" onClick={() => handleSort("strategies")}>
                  Strategies {sortIcon("strategies")}
                </th>
                <th className="num" onClick={() => handleSort("fee")}>
                  Perf. Fee {sortIcon("fee")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr
                  key={v.address}
                  onClick={() => navigate(`/earn/${chainId}/${v.address}`)}
                >
                  <td style={{ fontWeight: 600 }}>{v.shares.name}</td>
                  <td>
                    <div className="token-cell">
                      <TokenIcon address={v.asset.address} symbol={v.asset.symbol} />
                      <span>{v.asset.symbol}</span>
                    </div>
                  </td>
                  <td className="num">
                    <span className="apy-positive">{formatAPYNumber(v.supplyApy)}</span>
                  </td>
                  <td className="num">
                    {formatBigInt(v.totalAssets, v.asset.decimals)} {v.asset.symbol}
                  </td>
                  <td className="num">
                    <span className="badge badge-neutral">{v.strategies.length}</span>
                  </td>
                  <td className="num">{formatPercent(v.performanceFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
