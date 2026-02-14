import Link from "next/link";
import { CopyAddress } from "../components/CopyAddress";
import { resolveChainId } from "../config/chains";
import {
  getVaultTableData,
  parseVaultTableQuery,
  type SortDir,
  type VaultsTab,
  type VaultTableData,
  type VaultTableQuery,
} from "../server/vaultsData";
import { VaultsNavigationProgress } from "./VaultsNavigationProgress";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

interface PageProps {
  searchParams?: Promise<SearchParams>;
}

function defaultSortForTab(tab: VaultsTab): {
  sortBy: string;
  sortDir: SortDir;
} {
  return tab === "evaults"
    ? { sortBy: "totalSupply", sortDir: "desc" }
    : { sortBy: "totalAssets", sortDir: "desc" };
}

function tabLabel(tab: VaultsTab): string {
  return tab === "evaults" ? "EVaults" : "Euler Earn";
}

function isTextSort(sortBy: string): boolean {
  return sortBy === "name" || sortBy === "asset" || sortBy === "address";
}

function nextSortDir(query: VaultTableQuery, sortBy: string): SortDir {
  if (query.sortBy === sortBy) {
    return query.sortDir === "asc" ? "desc" : "asc";
  }
  return isTextSort(sortBy) ? "asc" : "desc";
}

function sortIndicator(query: VaultTableQuery, sortBy: string): string {
  if (query.sortBy !== sortBy) return "";
  return query.sortDir === "asc" ? " ↑" : " ↓";
}

function buildVaultsHref(
  chainId: number,
  query: VaultTableQuery,
  overrides: Partial<VaultTableQuery> = {},
): string {
  const next = {
    ...query,
    ...overrides,
  };

  const params = new URLSearchParams();
  params.set("chainId", String(chainId));
  params.set("tab", next.tab);
  params.set("page", String(next.page));
  params.set("pageSize", String(next.pageSize));
  params.set("sortBy", next.sortBy);
  params.set("sortDir", next.sortDir);
  if (next.q) params.set("q", next.q);

  return `/vaults?${params.toString()}`;
}

function FilterControls({
  chainId,
  query,
  disabled = false,
}: {
  chainId: number;
  query: VaultTableQuery;
  disabled?: boolean;
}) {
  return (
    <div className="status-message vaults-controls-row">
      <form method="get">
        <input type="hidden" name="chainId" value={String(chainId)} />
        <input type="hidden" name="tab" value={query.tab} />
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="pageSize" value={String(query.pageSize)} />
        <input type="hidden" name="sortBy" value={query.sortBy} />
        <input type="hidden" name="sortDir" value={query.sortDir} />
        <input
          type="text"
          name="q"
          placeholder="Filter name / asset / address"
          defaultValue={query.q}
          disabled={disabled}
        />{" "}
        <button type="submit" disabled={disabled}>
          Apply
        </button>{" "}
        {query.q ? (
          disabled ? (
            <span>Clear</span>
          ) : (
            <Link
              href={buildVaultsHref(chainId, query, {
                q: "",
                page: 1,
              })}
              prefetch={false}
            >
              Clear
            </Link>
          )
        ) : (
          <span className="vaults-inline-placeholder" aria-hidden="true">
            Clear
          </span>
        )}
      </form>
    </div>
  );
}

function PaginationControls({
  chainId,
  query,
  page,
  totalPages,
  disabled = false,
}: {
  chainId: number;
  query: VaultTableQuery;
  page: number;
  totalPages: number;
  disabled?: boolean;
}) {
  const safeTotalPages = Math.max(totalPages, 1);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);

  return (
    <div className="status-message vaults-controls-row">
      {!disabled && safePage > 1 ? (
        <Link
          href={buildVaultsHref(chainId, query, { page: safePage - 1 })}
          prefetch={false}
        >
          Previous
        </Link>
      ) : (
        <span>Previous</span>
      )}{" "}
      | Page {safePage} / {safeTotalPages} |{" "}
      {!disabled && safePage < safeTotalPages ? (
        <Link
          href={buildVaultsHref(chainId, query, { page: safePage + 1 })}
          prefetch={false}
        >
          Next
        </Link>
      ) : (
        <span>Next</span>
      )}
    </div>
  );
}

async function VaultsDataSection({
  chainId,
  query,
}: {
  chainId: number;
  query: VaultTableQuery;
}) {
  const data: VaultTableData = await getVaultTableData(chainId, query);
  const readyToken = `${data.tab}:${data.page}:${data.pageSize}:${data.totalRows}:${data.q}:${data.sortBy}:${data.sortDir}:${data.snapshotUpdatedAt}:${data.isRefreshing ? "1" : "0"}:${data.refreshErrorAt ?? 0}`;
  const refreshErrorLabel = data.refreshErrorAt
    ? new Date(data.refreshErrorAt).toLocaleTimeString()
    : "";

  const normalizedQuery: VaultTableQuery = {
    tab: data.tab,
    page: data.page,
    pageSize: data.pageSize,
    q: data.q,
    sortBy: data.sortBy,
    sortDir: data.sortDir,
  };

  const showingFrom =
    data.totalRows === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const showingTo = Math.min(data.page * data.pageSize, data.totalRows);

  return (
    <>
      <VaultsNavigationProgress
        readyToken={readyToken}
        serverRefreshing={data.isRefreshing}
      />

      {data.refreshError ? (
        <div className="vaults-refresh-warning">
          Showing cached data. Background refresh failed
          {refreshErrorLabel ? ` at ${refreshErrorLabel}` : ""}:{" "}
          {data.refreshError}
        </div>
      ) : null}

      <div className="status-message">
        Chain: {data.chainName} ({chainId}) | {tabLabel(data.tab)}:{" "}
        {data.eVaultsCount}
        {" / "}Euler Earn: {data.earnVaultsCount}
      </div>

      <FilterControls chainId={chainId} query={normalizedQuery} />

      <div className="status-message">
        Showing {showingFrom}-{showingTo} of {data.totalRows}
      </div>

      <PaginationControls
        chainId={chainId}
        query={normalizedQuery}
        page={data.page}
        totalPages={data.totalPages}
      />

      {data.tab === "evaults" &&
        (data.eVaults.length === 0 ? (
          <div className="status-message">No EVaults found</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "name",
                      sortDir: nextSortDir(normalizedQuery, "name"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Name{sortIndicator(normalizedQuery, "name")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "asset",
                      sortDir: nextSortDir(normalizedQuery, "asset"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Asset{sortIndicator(normalizedQuery, "asset")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "address",
                      sortDir: nextSortDir(normalizedQuery, "address"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Address{sortIndicator(normalizedQuery, "address")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "totalSupply",
                      sortDir: nextSortDir(normalizedQuery, "totalSupply"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Total Supply{sortIndicator(normalizedQuery, "totalSupply")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "totalBorrows",
                      sortDir: nextSortDir(normalizedQuery, "totalBorrows"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Total Borrows
                    {sortIndicator(normalizedQuery, "totalBorrows")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "supplyApy",
                      sortDir: nextSortDir(normalizedQuery, "supplyApy"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Supply APY{sortIndicator(normalizedQuery, "supplyApy")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "borrowApy",
                      sortDir: nextSortDir(normalizedQuery, "borrowApy"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Borrow APY{sortIndicator(normalizedQuery, "borrowApy")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "price",
                      sortDir: nextSortDir(normalizedQuery, "price"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    USD Price{sortIndicator(normalizedQuery, "price")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "collaterals",
                      sortDir: nextSortDir(normalizedQuery, "collaterals"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Collaterals{sortIndicator(normalizedQuery, "collaterals")}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.eVaults.map((vault) => (
                <tr key={vault.address}>
                  <td>
                    <Link href={`/vault/${chainId}/${vault.address}`}>
                      {vault.name}
                    </Link>
                  </td>
                  <td>{vault.assetSymbol}</td>
                  <td>
                    <CopyAddress address={vault.address} />
                  </td>
                  <td>{vault.totalSupply}</td>
                  <td>{vault.totalBorrows}</td>
                  <td>{vault.supplyApy}</td>
                  <td>{vault.borrowApy}</td>
                  <td>{vault.marketPriceUsd}</td>
                  <td>{vault.collateralCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {data.tab === "eulerEarn" &&
        (data.earnVaults.length === 0 ? (
          <div className="status-message">No Euler Earn vaults found</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "name",
                      sortDir: nextSortDir(normalizedQuery, "name"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Name{sortIndicator(normalizedQuery, "name")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "asset",
                      sortDir: nextSortDir(normalizedQuery, "asset"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Asset{sortIndicator(normalizedQuery, "asset")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "address",
                      sortDir: nextSortDir(normalizedQuery, "address"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Address{sortIndicator(normalizedQuery, "address")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "totalAssets",
                      sortDir: nextSortDir(normalizedQuery, "totalAssets"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Total Assets{sortIndicator(normalizedQuery, "totalAssets")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "price",
                      sortDir: nextSortDir(normalizedQuery, "price"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    USD Price{sortIndicator(normalizedQuery, "price")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "strategies",
                      sortDir: nextSortDir(normalizedQuery, "strategies"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Strategies{sortIndicator(normalizedQuery, "strategies")}
                  </Link>
                </th>
                <th>
                  <Link
                    href={buildVaultsHref(chainId, normalizedQuery, {
                      sortBy: "performanceFee",
                      sortDir: nextSortDir(normalizedQuery, "performanceFee"),
                      page: 1,
                    })}
                    prefetch={false}
                  >
                    Perf. Fee{sortIndicator(normalizedQuery, "performanceFee")}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.earnVaults.map((vault) => (
                <tr key={vault.address}>
                  <td>
                    <Link href={`/earn/${chainId}/${vault.address}`}>
                      {vault.name}
                    </Link>
                  </td>
                  <td>{vault.assetSymbol}</td>
                  <td>
                    <CopyAddress address={vault.address} />
                  </td>
                  <td>{vault.totalAssets}</td>
                  <td>{vault.marketPriceUsd}</td>
                  <td>{vault.strategyCount}</td>
                  <td>{vault.performanceFee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      <PaginationControls
        chainId={chainId}
        query={normalizedQuery}
        page={data.page}
        totalPages={data.totalPages}
      />
    </>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const chainId = resolveChainId(params.chainId);
  const query = parseVaultTableQuery({
    tab: params.tab,
    page: params.page,
    pageSize: params.pageSize,
    q: params.q,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
  });

  return (
    <div data-vaults-page>
      <div className="tabs">
        <Link
          className={`tab ${query.tab === "evaults" ? "active" : ""}`}
          href={buildVaultsHref(chainId, query, {
            tab: "evaults",
            page: 1,
            ...defaultSortForTab("evaults"),
          })}
          prefetch={false}
        >
          EVaults
        </Link>
        <Link
          className={`tab ${query.tab === "eulerEarn" ? "active" : ""}`}
          href={buildVaultsHref(chainId, query, {
            tab: "eulerEarn",
            page: 1,
            ...defaultSortForTab("eulerEarn"),
          })}
          prefetch={false}
        >
          Euler Earn
        </Link>
      </div>
      <VaultsDataSection chainId={chainId} query={query} />
    </div>
  );
}
