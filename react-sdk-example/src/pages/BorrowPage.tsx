import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  StandardEVaultPerspectives,
  StandardEulerEarnPerspectives,
  isEVault,
  getMaxMultiplier,
  getMaxRoe,
  type EVault,
} from "euler-v2-sdk";
import { useSDK } from "../context/SdkContext.tsx";
import { useVerifiedVaults } from "../queries/sdkQueries.ts";
import { formatBigInt, formatPriceUsd } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";

const ALL_PERSPECTIVES = [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
  StandardEulerEarnPerspectives.GOVERNED,
];

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
  collateralVault?: EVault;
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
  return (
    Number(vault.interestRates.supplyAPY) +
    (vault.rewards?.totalRewardsApr ?? 0) +
    (vault.intrinsicApy ? vault.intrinsicApy.apy / 100 : 0)
  );
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

function getMarketName(vault: EVault | undefined): string | undefined {
  if (!vault?.eulerLabel) return undefined;
  return vault.eulerLabel.products[0]?.name ?? vault.eulerLabel.vault.name;
}

function getSortValue(row: BorrowRow, key: BorrowSortKey): number | string {
  switch (key) {
    case "collateral":
      return (row.collateralVault?.asset.symbol ?? row.collateralAddress).toLowerCase();
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

  const { data: allVaults, isLoading, error } = useVerifiedVaults(ALL_PERSPECTIVES);

  const eVaults = useMemo(() => (allVaults?.filter(isEVault) ?? []), [allVaults]);

  const rows = useMemo(() => {
    const byAddress = new Map<string, EVault>(
      eVaults.map((v) => [v.address.toLowerCase(), v])
    );

    const nextRows: BorrowRow[] = [];

    for (const debtVault of eVaults) {
      const borrowApy = Number(debtVault.interestRates.borrowAPY);
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
        const supplyApy = collateralVault
          ? calcVaultSupplyApy(collateralVault)
          : undefined;
        const maxMultiplier = lltv > 0 && lltv < 1 ? getMaxMultiplier(lltv, 0) : undefined;
        const maxRoe =
          supplyApy !== undefined && maxMultiplier !== undefined
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

    return nextRows;
  }, [eVaults]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let cmp = 0;
      if (typeof va === "string" && typeof vb === "string") cmp = va.localeCompare(vb);
      else cmp = (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

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
      ) : sortedRows.length === 0 ? (
        <div className="status-message">No borrow markets found.</div>
      ) : (
        <table>
          <thead>
            <tr>
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
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                className="clickable"
                onClick={() => navigate(`/vault/${chainId}/${row.debtAddress}`)}
              >
                <td>
                  <div>{row.collateralVault?.asset.symbol ?? "Unknown"}</div>
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
  );
}
