import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { CopyAddress } from "../components/CopyAddress";
import { CHAIN_NAMES, resolveChainId } from "../config/chains";
import type { VaultTableData } from "../server/vaultsData";

export const dynamic = "force-dynamic";

type Tab = "evaults" | "eulerEarn" | "securitize";

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

interface PageProps {
  searchParams?: Promise<SearchParams>;
}

function resolveTab(value: SearchParamValue): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "eulerEarn" || raw === "securitize") return raw;
  return "evaults";
}

function tabHref(chainId: number, tab: Tab): string {
  return `/vaults?chainId=${chainId}&tab=${tab}`;
}

async function getVaultTableDataFromApi(
  chainId: number,
): Promise<VaultTableData> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";

  if (!host) {
    throw new Error("Missing host header for API request");
  }

  const response = await fetch(
    `${protocol}://${host}/api/vaults?chainId=${chainId}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Vault API request failed with ${response.status}`);
  }

  return (await response.json()) as VaultTableData;
}

function VaultsDataFallback({ chainId, tab }: { chainId: number; tab: Tab }) {
  return (
    <>
      <div className="status-message">
        Chain: {CHAIN_NAMES[chainId] ?? `Chain ${chainId}`} ({chainId}).
      </div>
      {tab === "securitize" ? (
        <div className="status-message">
          Securitize vaults have no predefined perspectives. They are resolved
          per-address when used as collateral in EVaults.
        </div>
      ) : (
        <div className="status-message">Loading vault table...</div>
      )}
    </>
  );
}

async function VaultsDataSection({
  chainId,
  tab,
}: {
  chainId: number;
  tab: Tab;
}) {
  const { chainName, eVaults, earnVaults } =
    await getVaultTableDataFromApi(chainId);

  return (
    <>
      <div className="status-message">
        Chain: {chainName} ({chainId}).
      </div>

      {tab === "evaults" &&
        (eVaults.length === 0 ? (
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

      {tab === "eulerEarn" &&
        (earnVaults.length === 0 ? (
          <div className="status-message">No Euler Earn vaults found</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Asset</th>
                <th>Address</th>
                <th>Total Assets</th>
                <th>USD Price</th>
                <th>Strategies</th>
                <th>Perf. Fee</th>
              </tr>
            </thead>
            <tbody>
              {earnVaults.map((vault) => (
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

      {tab === "securitize" && (
        <div className="status-message">
          Securitize vaults have no predefined perspectives. They are resolved
          per-address when used as collateral in EVaults.
        </div>
      )}
    </>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const chainId = resolveChainId(params.chainId);
  const tab = resolveTab(params.tab);

  return (
    <>
      <div className="tabs">
        <Link
          className={`tab ${tab === "evaults" ? "active" : ""}`}
          href={tabHref(chainId, "evaults")}
        >
          EVaults
        </Link>
        <Link
          className={`tab ${tab === "eulerEarn" ? "active" : ""}`}
          href={tabHref(chainId, "eulerEarn")}
        >
          Euler Earn
        </Link>
        <Link
          className={`tab ${tab === "securitize" ? "active" : ""}`}
          href={tabHref(chainId, "securitize")}
        >
          Securitize
        </Link>
      </div>

      <Suspense
        key={`${chainId}:${tab}`}
        fallback={<VaultsDataFallback chainId={chainId} tab={tab} />}
      >
        <VaultsDataSection chainId={chainId} tab={tab} />
      </Suspense>
    </>
  );
}
