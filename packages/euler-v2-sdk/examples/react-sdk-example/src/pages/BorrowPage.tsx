import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  isEVault,
  getMaxMultiplier,
  getMaxRoe,
  type EVault,
} from "euler-v2-sdk";
import { useSDK } from "../context/SdkContext.tsx";
import { useAllVaults } from "../queries/sdkQueries.ts";
import { formatBigInt, formatPriceUsd } from "../utils/format.ts";
import { getEffectiveBorrowApy, getEffectiveSupplyApy } from "../utils/apy.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";

type BorrowSortKey =
  | "collateral"
  | "debt"
  | "supplyApy"
  | "borrowApy"
  | "maxRoe"
  | "maxMultiplier"
  | "lltv"
  | "liquidity";

type SortDir = "asc" | "desc";

type BorrowRow = {
  id: string;
  collateralVault: EVault;
  debtVault: EVault;
  collateralAddress: string;
  debtAddress: string;
  supplyApy?: number;
  borrowApy: number;
  maxRoe?: number;
  maxMultiplier?: number;
  lltv: number;
  liquidityAssets: bigint;
  liquidityUsd?: bigint;
};

function pct(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function multiple(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${value.toFixed(2)}x`;
}

function calcVaultSupplyApy(vault: EVault): number {
  return getEffectiveSupplyApy(vault);
}

function calcVaultBorrowApy(vault: EVault): number {
  return getEffectiveBorrowApy(vault);
}

function normalizeLltv(value: number | bigint): number {
  if (typeof value === "bigint") return Number(value) / 10_000;
  return value > 1 ? value / 10_000 : value;
}

function normalizeBigInt(value: bigint | number | string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return value;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function calcVaultSupplyUsd(vault: EVault): bigint | undefined {
  if (vault.marketPriceUsd === undefined) return undefined;
  const decimals = BigInt(vault.asset.decimals ?? 18);
  return (vault.totalAssets * vault.marketPriceUsd) / (10n ** decimals);
}

function getMarketName(vault: EVault | undefined): string | undefined {
  if (!vault?.eulerLabel) return undefined;
  return vault.eulerLabel.products[0]?.name ?? vault.eulerLabel.vault.name;
}

function getSortValue(row: BorrowRow, key: BorrowSortKey): number | string {
  switch (key) {
    case "collateral":
      return row.collateralVault.asset.symbol.toLowerCase();
    case "debt":
      return row.debtVault.asset.symbol.toLowerCase();
    case "supplyApy":
      return row.supplyApy ?? -1;
    case "borrowApy":
      return row.borrowApy;
    case "maxRoe":
      return row.maxRoe ?? -1;
    case "maxMultiplier":
      return row.maxMultiplier ?? -1;
    case "lltv":
      return row.lltv;
    case "liquidity":
      return row.liquidityUsd ? Number(row.liquidityUsd) : -1;
  }
}

export function BorrowPage() {
  const { chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<BorrowSortKey>("liquidity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [collateralAssetFilter, setCollateralAssetFilter] = useState<string>("all");
  const [debtAssetFilter, setDebtAssetFilter] = useState<string>("all");
  const [marketSearch, setMarketSearch] = useState<string>("");
  const [collateralAssetSearch, setCollateralAssetSearch] = useState<string>("");
  const [debtAssetSearch, setDebtAssetSearch] = useState<string>("");

  const { data: allVaults, isLoading, error } = useAllVaults();

  const eVaults = useMemo(() => (allVaults?.filter(isEVault) ?? []), [allVaults]);

  const rows = useMemo(() => {
    console.time("borrowRows:derive");
    const byAddress = new Map<string, EVault>(
      eVaults.map((v) => [v.address.toLowerCase(), v])
    );

    const nextRows: BorrowRow[] = [];

    for (const debtVault of eVaults) {
      const borrowApy = calcVaultBorrowApy(debtVault);
      const liquidityAssets =
        normalizeBigInt(
          debtVault.availableToBorrow as bigint | number | string | undefined
        ) ?? 0n;
      const marketPriceUsd = normalizeBigInt(
        debtVault.marketPriceUsd as bigint | number | string | undefined
      );
      const assetDecimals = Number(debtVault.asset.decimals ?? 18);
      const liquidityUsd =
        marketPriceUsd !== undefined
          ? (liquidityAssets * marketPriceUsd) /
            (10n ** BigInt(assetDecimals))
          : undefined;

      for (const collateral of debtVault.collaterals) {
        const lltv = normalizeLltv(collateral.liquidationLTV as number | bigint);
        const collateralVault = byAddress.get(collateral.address.toLowerCase());
        if (!collateralVault) {
          console.log('missing collateral', debtVault.address, collateral.address);
          continue;
        }
        const relationExists = debtVault.collaterals.some(
          (c) => c.address.toLowerCase() === collateralVault.address.toLowerCase()
        );
        if (!relationExists) continue;

        const supplyApy = calcVaultSupplyApy(collateralVault);
        const maxMultiplier = lltv > 0 && lltv < 1 ? getMaxMultiplier(lltv, 0) : undefined;
        const maxRoe =
          maxMultiplier !== undefined
            ? getMaxRoe(maxMultiplier, supplyApy, borrowApy)
            : undefined;

        nextRows.push({
          id: `${collateral.address.toLowerCase()}-${debtVault.address.toLowerCase()}`,
          collateralVault,
          debtVault,
          collateralAddress: collateral.address,
          debtAddress: debtVault.address,
          supplyApy,
          borrowApy,
          maxRoe,
          maxMultiplier,
          lltv,
          liquidityAssets,
          liquidityUsd,
        });
      }
    }

    console.timeEnd("borrowRows:derive");
    console.log('borrowRows.length: ', nextRows.length);
    return nextRows;
  }, [eVaults]);

  const marketSupplyUsdByName = useMemo(() => {
    const totals = new Map<string, bigint>();
    for (const vault of eVaults) {
      const market = getMarketName(vault);
      if (!market) continue;
      const suppliedUsd = calcVaultSupplyUsd(vault) ?? 0n;
      totals.set(market, (totals.get(market) ?? 0n) + suppliedUsd);
    }
    return totals;
  }, [eVaults]);

  const marketOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      const collateralMarket = getMarketName(row.collateralVault);
      const debtMarket = getMarketName(row.debtVault);
      if (collateralMarket) names.add(collateralMarket);
      if (debtMarket) names.add(debtMarket);
    }
    return Array.from(names).sort((a, b) => {
      const aSupply = marketSupplyUsdByName.get(a) ?? 0n;
      const bSupply = marketSupplyUsdByName.get(b) ?? 0n;
      if (aSupply === bSupply) return a.localeCompare(b);
      return aSupply > bSupply ? -1 : 1;
    });
  }, [rows, marketSupplyUsdByName]);

  const collateralAssetOptions = useMemo(() => {
    const assets = new Map<string, string>();
    for (const row of rows) {
      assets.set(row.collateralVault.asset.address.toLowerCase(), row.collateralVault.asset.symbol);
    }
    return Array.from(assets.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const debtAssetOptions = useMemo(() => {
    const assets = new Map<string, string>();
    for (const row of rows) {
      assets.set(row.debtVault.asset.address.toLowerCase(), row.debtVault.asset.symbol);
    }
    return Array.from(assets.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const searchedMarketOptions = useMemo(() => {
    const query = marketSearch.trim().toLowerCase();
    if (!query) return marketOptions;
    return marketOptions.filter((market) =>
      market === marketFilter || market.toLowerCase().includes(query)
    );
  }, [marketOptions, marketSearch, marketFilter]);

  const searchedCollateralAssetOptions = useMemo(() => {
    const query = collateralAssetSearch.trim().toLowerCase();
    if (!query) return collateralAssetOptions;
    return collateralAssetOptions.filter(([address, symbol]) =>
      address === collateralAssetFilter ||
      symbol.toLowerCase().includes(query) ||
      address.includes(query)
    );
  }, [collateralAssetOptions, collateralAssetSearch, collateralAssetFilter]);

  const searchedDebtAssetOptions = useMemo(() => {
    const query = debtAssetSearch.trim().toLowerCase();
    if (!query) return debtAssetOptions;
    return debtAssetOptions.filter(([address, symbol]) =>
      address === debtAssetFilter ||
      symbol.toLowerCase().includes(query) ||
      address.includes(query)
    );
  }, [debtAssetOptions, debtAssetSearch, debtAssetFilter]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (marketFilter !== "all") {
        const collateralMarket = getMarketName(row.collateralVault);
        const debtMarket = getMarketName(row.debtVault);
        if (collateralMarket !== marketFilter && debtMarket !== marketFilter) return false;
      }
      if (collateralAssetFilter !== "all") {
        if (row.collateralVault.asset.address.toLowerCase() !== collateralAssetFilter) return false;
      }
      if (debtAssetFilter !== "all") {
        if (row.debtVault.asset.address.toLowerCase() !== debtAssetFilter) return false;
      }
      return true;
    });
  }, [rows, marketFilter, collateralAssetFilter, debtAssetFilter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let cmp = 0;
      if (typeof va === "string" && typeof vb === "string") cmp = va.localeCompare(vb);
      else cmp = (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, sortKey, sortDir]);

  const toggleSort = (key: BorrowSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  const indicator = (key: BorrowSortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  if (sdkLoading) return <div className="status-message">Initializing SDK...</div>;
  if (sdkError) return <div className="error-message">SDK Error: {sdkError}</div>;

  return (
    <>
      <h3 className="section-title">Borrow</h3>
      {isLoading ? (
        <div className="status-message">Loading borrow markets...</div>
      ) : error ? (
        <div className="error-message">Error: {String(error)}</div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="filter-group">
              <label className="filter-label" htmlFor="borrow-market-filter">
                Market
              </label>
              <input
                type="text"
                className="filter-input"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder="Search markets"
              />
              <select
                id="borrow-market-filter"
                className="filter-select"
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
              >
                <option value="all">All markets</option>
                {searchedMarketOptions.map((market) => (
                  <option key={market} value={market}>
                    {market}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="filter-label" htmlFor="borrow-collateral-asset-filter">
                Collateral asset
              </label>
              <input
                type="text"
                className="filter-input"
                value={collateralAssetSearch}
                onChange={(e) => setCollateralAssetSearch(e.target.value)}
                placeholder="Search collateral"
              />
              <select
                id="borrow-collateral-asset-filter"
                className="filter-select"
                value={collateralAssetFilter}
                onChange={(e) => setCollateralAssetFilter(e.target.value)}
              >
                <option value="all">All collateral assets</option>
                {searchedCollateralAssetOptions.map(([address, symbol]) => (
                  <option key={address} value={address}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="filter-label" htmlFor="borrow-debt-asset-filter">
                Debt asset
              </label>
              <input
                type="text"
                className="filter-input"
                value={debtAssetSearch}
                onChange={(e) => setDebtAssetSearch(e.target.value)}
                placeholder="Search debt"
              />
              <select
                id="borrow-debt-asset-filter"
                className="filter-select"
                value={debtAssetFilter}
                onChange={(e) => setDebtAssetFilter(e.target.value)}
              >
                <option value="all">All debt assets</option>
                {searchedDebtAssetOptions.map(([address, symbol]) => (
                  <option key={address} value={address}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {sortedRows.length === 0 ? (
            <div className="status-message">No borrow markets match the selected filters.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th className="sortable" onClick={() => toggleSort("collateral")}>
                    Collateral Asset{indicator("collateral")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("debt")}>
                    Debt asset{indicator("debt")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("supplyApy")}>
                    Supply APY{indicator("supplyApy")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("borrowApy")}>
                    Borrow APY{indicator("borrowApy")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("maxRoe")}>
                    Max ROE{indicator("maxRoe")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("maxMultiplier")}>
                    Max multiplier{indicator("maxMultiplier")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("lltv")}>
                    LLTV{indicator("lltv")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("liquidity")}>
                    Liquidity{indicator("liquidity")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="clickable"
                    onClick={() =>
                      navigate(`/borrow/${chainId}/${row.collateralAddress}/${row.debtAddress}`)
                    }
                  >
                    <td>{index + 1}</td>
                    <td>
                      <div>{row.collateralVault.asset.symbol}</div>
                      <div className="table-subline">{getMarketName(row.collateralVault) ?? "-"}</div>
                      <div className="table-subline">
                        <CopyAddress address={row.collateralAddress} />
                      </div>
                    </td>
                    <td>
                      <div>{row.debtVault.asset.symbol}</div>
                      <div className="table-subline">{getMarketName(row.debtVault) ?? "-"}</div>
                      <div className="table-subline">
                        <CopyAddress address={row.debtAddress} />
                      </div>
                    </td>
                    <td>{pct(row.supplyApy)}</td>
                    <td>{pct(row.borrowApy)}</td>
                    <td>{pct(row.maxRoe)}</td>
                    <td>{multiple(row.maxMultiplier)}</td>
                    <td>{pct(row.lltv)}</td>
                    <td>
                      <div>{formatBigInt(row.liquidityAssets, row.debtVault.asset.decimals)}</div>
                      <div className="table-subline">{formatPriceUsd(row.liquidityUsd)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
