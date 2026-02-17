import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import { useVerifiedVaults } from "../queries/sdkQueries.ts";
import {
  StandardEVaultPerspectives,
  StandardEulerEarnPerspectives,
  isEVault,
  isEulerEarn,
  type EVault,
  type EulerEarn,
} from "euler-v2-sdk";
import { formatBigInt, formatPriceUsd } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ApyCell } from "../components/ApyCell.tsx";

const ALL_PERSPECTIVES = [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
  StandardEulerEarnPerspectives.GOVERNED,
];

type Tab = "evaults" | "eulerEarn" | "securitize";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// EVault sorting
// ---------------------------------------------------------------------------

type EVaultSortKey =
  | "name"
  | "asset"
  | "totalSupply"
  | "totalBorrows"
  | "supplyAPY"
  | "borrowAPY"
  | "usdPrice"
  | "collaterals";

function getEVaultSortValue(vault: EVault, key: EVaultSortKey): number | string {
  switch (key) {
    case "name":
      return (vault.shares.name || "").toLowerCase();
    case "asset":
      return vault.asset.symbol.toLowerCase();
    case "totalSupply": {
      const amt = Number(vault.totalAssets) / 10 ** vault.asset.decimals;
      const price = Number(vault.marketPriceUsd ?? 0n) / 1e18;
      return amt * price;
    }
    case "totalBorrows": {
      const amt = Number(vault.totalBorrowed) / 10 ** vault.asset.decimals;
      const price = Number(vault.marketPriceUsd ?? 0n) / 1e18;
      return amt * price;
    }
    case "supplyAPY":
      return Number(vault.interestRates.supplyAPY) + (vault.rewards?.totalRewardsApr ?? 0) + (vault.intrinsicApy ? vault.intrinsicApy.apy / 100 : 0);
    case "borrowAPY":
      return Number(vault.interestRates.borrowAPY);
    case "usdPrice":
      return vault.marketPriceUsd !== undefined ? Number(vault.marketPriceUsd) : -1;
    case "collaterals":
      return vault.collaterals.length;
  }
}

// ---------------------------------------------------------------------------
// EulerEarn sorting
// ---------------------------------------------------------------------------

type EarnSortKey =
  | "name"
  | "asset"
  | "totalAssets"
  | "supplyAPY"
  | "usdPrice"
  | "strategies"
  | "perfFee";

function getEarnSortValue(vault: EulerEarn, key: EarnSortKey): number | string {
  switch (key) {
    case "name":
      return (vault.shares.name || "").toLowerCase();
    case "asset":
      return vault.asset.symbol.toLowerCase();
    case "totalAssets": {
      const amt = Number(vault.totalAssets) / 10 ** vault.asset.decimals;
      const price = Number(vault.marketPriceUsd ?? 0n) / 1e18;
      return amt * price;
    }
    case "supplyAPY":
      return (vault.supplyApy ?? 0) + (vault.rewards?.totalRewardsApr ?? 0) + (vault.intrinsicApy ? vault.intrinsicApy.apy / 100 : 0);
    case "usdPrice":
      return vault.marketPriceUsd !== undefined ? Number(vault.marketPriceUsd) : -1;
    case "strategies":
      return vault.strategies.length;
    case "perfFee":
      return vault.performanceFee;
  }
}

// ---------------------------------------------------------------------------
// Generic sort helper
// ---------------------------------------------------------------------------

function useSorted<T, K extends string>(
  items: T[],
  defaultKey: K,
  getValue: (item: T, key: K) => number | string
) {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      let cmp: number;
      if (typeof va === "string" && typeof vb === "string") {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (va as number) - (vb as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, sortDir, getValue]);

  const toggleSort = (key: K) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const indicator = (key: K) =>
    key === sortKey ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  return { sorted, toggleSort, indicator, sortKey };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultListPage() {
  const { chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("evaults");

  const { data: allVaults, isLoading, error } = useVerifiedVaults(ALL_PERSPECTIVES);

  const eVaults = allVaults?.filter(isEVault) ?? [];
  const earnVaults = allVaults?.filter(isEulerEarn) ?? [];

  const eVaultSort = useSorted(eVaults, "totalSupply" as EVaultSortKey, getEVaultSortValue);
  const earnSort = useSorted(earnVaults, "totalAssets" as EarnSortKey, getEarnSortValue);

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
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("name")}>
                    Name{eVaultSort.indicator("name")}
                  </th>
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("asset")}>
                    Asset{eVaultSort.indicator("asset")}
                  </th>
                  <th>Address</th>
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("totalSupply")}>
                    Total Supply{eVaultSort.indicator("totalSupply")}
                  </th>
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("totalBorrows")}>
                    Total Borrows{eVaultSort.indicator("totalBorrows")}
                  </th>
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("supplyAPY")}>
                    Supply APY{eVaultSort.indicator("supplyAPY")}
                  </th>
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("borrowAPY")}>
                    Borrow APY{eVaultSort.indicator("borrowAPY")}
                  </th>
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("usdPrice")}>
                    USD Price{eVaultSort.indicator("usdPrice")}
                  </th>
                  <th className="sortable" onClick={() => eVaultSort.toggleSort("collaterals")}>
                    Collaterals{eVaultSort.indicator("collaterals")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {eVaultSort.sorted.map((vault) => (
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
                    <td>
                      <ApyCell
                        baseApy={Number(vault.interestRates.supplyAPY)}
                        rewards={vault.rewards}
                        intrinsicApy={vault.intrinsicApy}
                      />
                    </td>
                    <td>
                      <ApyCell
                        baseApy={Number(vault.interestRates.borrowAPY)}
                      />
                    </td>
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
                  <th className="sortable" onClick={() => earnSort.toggleSort("name")}>
                    Name{earnSort.indicator("name")}
                  </th>
                  <th className="sortable" onClick={() => earnSort.toggleSort("asset")}>
                    Asset{earnSort.indicator("asset")}
                  </th>
                  <th>Address</th>
                  <th className="sortable" onClick={() => earnSort.toggleSort("totalAssets")}>
                    Total Assets{earnSort.indicator("totalAssets")}
                  </th>
                  <th className="sortable" onClick={() => earnSort.toggleSort("supplyAPY")}>
                    Supply APY{earnSort.indicator("supplyAPY")}
                  </th>
                  <th className="sortable" onClick={() => earnSort.toggleSort("usdPrice")}>
                    USD Price{earnSort.indicator("usdPrice")}
                  </th>
                  <th className="sortable" onClick={() => earnSort.toggleSort("strategies")}>
                    Strategies{earnSort.indicator("strategies")}
                  </th>
                  <th className="sortable" onClick={() => earnSort.toggleSort("perfFee")}>
                    Perf. Fee{earnSort.indicator("perfFee")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {earnSort.sorted.map((vault) => (
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
                        ? <ApyCell baseApy={vault.supplyApy} rewards={vault.rewards} intrinsicApy={vault.intrinsicApy} />
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
