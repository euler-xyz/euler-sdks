import { useQuery } from "@tanstack/react-query";
import {
  buildEulerSDK,
  defaultVaultTypeSubgraphAdapterConfig,
  type BuildSDKOptions,
  type EulerEarn,
  type EulerSDK,
  type EVault,
} from "@eulerxyz/euler-v2-sdk";
import { formatUnits, type Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";
import { APP_CHAIN_IDS_MINUS_BOB, CHAIN_NAMES } from "../config/chains.ts";
import { getV3ApiEndpoint } from "../config/endpoints.ts";
import { useProxyV3Calls } from "../queries/queryOptionsStore.ts";
import {
  fetchEarnVaultAddressesFromLabels,
  fetchVaultAddressesFromLabelProducts,
  sdkBuildQuery,
} from "../queries/sdkQueries.ts";

const DIFF_THRESHOLD = 0.03;

type TotalsSource = "onchain" | "v3";

type ChainSourceTotals = {
  chainId: number;
  source: TotalsSource;
  eVaultCount: number;
  earnCount: number;
  vaultCount: number;
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  earnTotalAssetsUsd: number;
  utilization: number;
  missingPriceCount: number;
  missingVaultCount: number;
  errorCount: number;
  error?: string;
};

type ChainTotalsComparison = {
  chainId: number;
  onchain: ChainSourceTotals;
  v3: ChainSourceTotals;
};

type TotalsReport = {
  chains: ChainTotalsComparison[];
  aggregate: {
    onchain: ChainSourceTotals;
    v3: ChainSourceTotals;
  };
};

function buildTotalsSdk(
  source: TotalsSource,
  v3ApiEndpoint: string
): Promise<EulerSDK> {
  const useV3Adapters = source === "v3";
  const sdkConfig: BuildSDKOptions = {
    config: {
      v3ApiUrl: v3ApiEndpoint,
      v3ApiKey: import.meta.env.EULER_SDK_V3_API_KEY,
    },
    buildQuery: sdkBuildQuery,
    eVaultServiceConfig: {
      adapter: useV3Adapters ? "v3" : "onchain",
    },
    eulerEarnServiceConfig: {
      adapter: useV3Adapters ? "v3" : "onchain",
    },
    vaultTypeAdapterConfig: useV3Adapters ? undefined : defaultVaultTypeSubgraphAdapterConfig,
  };

  return buildEulerSDK(sdkConfig);
}

function vaultUsd(totalAssets: bigint, price: bigint | undefined, decimals: number): number {
  if (price === undefined) return 0;
  return Number(formatUnits((totalAssets * price) / 10n ** BigInt(decimals), 18));
}

function summarizeVaults(
  chainId: number,
  source: TotalsSource,
  eVaults: EVault[],
  earns: EulerEarn[],
  missingVaultCount: number,
  errorCount: number,
  error?: string
): ChainSourceTotals {
  const totalSuppliedUsd = eVaults.reduce(
    (sum, vault) =>
      sum + vaultUsd(vault.totalAssets, vault.marketPriceUsd, vault.asset.decimals),
    0
  );
  const totalBorrowedUsd = eVaults.reduce(
    (sum, vault) =>
      sum + vaultUsd(vault.totalBorrowed, vault.marketPriceUsd, vault.asset.decimals),
    0
  );
  const earnTotalAssetsUsd = earns.reduce(
    (sum, vault) =>
      sum + vaultUsd(vault.totalAssets, vault.marketPriceUsd, vault.asset.decimals),
    0
  );
  const missingPriceCount =
    eVaults.filter((vault) => vault.marketPriceUsd === undefined).length +
    earns.filter((vault) => vault.marketPriceUsd === undefined).length;

  return {
    chainId,
    source,
    eVaultCount: eVaults.length,
    earnCount: earns.length,
    vaultCount: eVaults.length + earns.length,
    totalSuppliedUsd,
    totalBorrowedUsd,
    earnTotalAssetsUsd,
    utilization: totalSuppliedUsd > 0 ? totalBorrowedUsd / totalSuppliedUsd : 0,
    missingPriceCount,
    missingVaultCount,
    errorCount,
    error,
  };
}

function emptyTotals(chainId: number, source: TotalsSource, error: string): ChainSourceTotals {
  return summarizeVaults(chainId, source, [], [], 0, 1, error);
}

async function fetchChainSourceTotals(
  chainId: number,
  source: TotalsSource,
  sdk: EulerSDK,
  eVaultAddresses: Address[],
  earnAddresses: Address[]
): Promise<ChainSourceTotals> {
  try {
    const [eVaultResult, earnResult] = await Promise.all([
      eVaultAddresses.length > 0
        ? sdk.eVaultService.fetchVaults(chainId, eVaultAddresses, {
            populateMarketPrices: true,
          })
        : Promise.resolve({ result: [], errors: [] }),
      earnAddresses.length > 0
        ? sdk.eulerEarnService.fetchVaults(chainId, earnAddresses, {
            populateMarketPrices: true,
          })
        : Promise.resolve({ result: [], errors: [] }),
    ]);
    const eVaults = eVaultResult.result.filter(
      (vault): vault is EVault => vault !== undefined
    );
    const earns = earnResult.result.filter(
      (vault): vault is EulerEarn => vault !== undefined
    );
    const missingVaultCount =
      eVaultResult.result.filter((vault) => vault === undefined).length +
      earnResult.result.filter((vault) => vault === undefined).length;

    return summarizeVaults(
      chainId,
      source,
      eVaults,
      earns,
      missingVaultCount,
      eVaultResult.errors.length + earnResult.errors.length
    );
  } catch (error) {
    return emptyTotals(
      chainId,
      source,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function fetchProductLabeledAddresses(onchainSdk: EulerSDK, chainId: number) {
  const [eVaultAddresses, earnAddresses] = await Promise.all([
    fetchVaultAddressesFromLabelProducts(onchainSdk, chainId),
    fetchEarnVaultAddressesFromLabels(chainId),
  ]);

  return { eVaultAddresses, earnAddresses };
}

function aggregateTotals(source: TotalsSource, rows: ChainSourceTotals[]): ChainSourceTotals {
  const totalSuppliedUsd = rows.reduce((sum, row) => sum + row.totalSuppliedUsd, 0);
  const totalBorrowedUsd = rows.reduce((sum, row) => sum + row.totalBorrowedUsd, 0);

  return {
    chainId: 0,
    source,
    eVaultCount: rows.reduce((sum, row) => sum + row.eVaultCount, 0),
    earnCount: rows.reduce((sum, row) => sum + row.earnCount, 0),
    vaultCount: rows.reduce((sum, row) => sum + row.vaultCount, 0),
    totalSuppliedUsd,
    totalBorrowedUsd,
    earnTotalAssetsUsd: rows.reduce((sum, row) => sum + row.earnTotalAssetsUsd, 0),
    utilization: totalSuppliedUsd > 0 ? totalBorrowedUsd / totalSuppliedUsd : 0,
    missingPriceCount: rows.reduce((sum, row) => sum + row.missingPriceCount, 0),
    missingVaultCount: rows.reduce((sum, row) => sum + row.missingVaultCount, 0),
    errorCount: rows.reduce((sum, row) => sum + row.errorCount, 0),
  };
}

async function fetchTotalsReport(v3ApiEndpoint: string): Promise<TotalsReport> {
  const [onchainSdk, v3Sdk] = await Promise.all([
    buildTotalsSdk("onchain", v3ApiEndpoint),
    buildTotalsSdk("v3", v3ApiEndpoint),
  ]);

  const chains = await Promise.all(
    APP_CHAIN_IDS_MINUS_BOB.map(async (chainId) => {
      try {
        const { eVaultAddresses, earnAddresses } = await fetchProductLabeledAddresses(
          onchainSdk,
          chainId
        );
        const [onchain, v3] = await Promise.all([
          fetchChainSourceTotals(
            chainId,
            "onchain",
            onchainSdk,
            eVaultAddresses,
            earnAddresses
          ),
          fetchChainSourceTotals(chainId, "v3", v3Sdk, eVaultAddresses, earnAddresses),
        ]);

        return { chainId, onchain, v3 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          chainId,
          onchain: emptyTotals(chainId, "onchain", message),
          v3: emptyTotals(chainId, "v3", message),
        };
      }
    })
  );

  return {
    chains,
    aggregate: {
      onchain: aggregateTotals(
        "onchain",
        chains.map((chain) => chain.onchain)
      ),
      v3: aggregateTotals(
        "v3",
        chains.map((chain) => chain.v3)
      ),
    },
  };
}

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  if (value === Number.POSITIVE_INFINITY) return "∞";
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function diffRatio(base: number, next: number): number | undefined {
  if (base === 0 && next === 0) return 0;
  if (base === 0) return Number.POSITIVE_INFINITY;
  return Math.abs(next - base) / Math.abs(base);
}

function DiffCell({ base, next }: { base: number; next: number }) {
  const ratio = diffRatio(base, next);
  const isLarge = ratio === undefined || ratio > DIFF_THRESHOLD;
  return (
    <td className={isLarge ? "diff-large" : undefined}>
      {formatPercent(ratio)}
    </td>
  );
}

function SourceTable({
  title,
  rows,
}: {
  title: string;
  rows: ChainSourceTotals[];
}) {
  return (
    <section className="totals-section">
      <h2 className="section-title">{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Chain</th>
            <th>EVaults</th>
            <th>Earn</th>
            <th>Supplied</th>
            <th>Borrowed</th>
            <th>Earn Assets</th>
            <th>Utilization</th>
            <th>Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.source}:${row.chainId}`}>
              <td>{CHAIN_NAMES[row.chainId] ?? row.chainId}</td>
              <td>{formatCount(row.eVaultCount)}</td>
              <td>{formatCount(row.earnCount)}</td>
              <td>{formatUsd(row.totalSuppliedUsd)}</td>
              <td>{formatUsd(row.totalBorrowedUsd)}</td>
              <td>{formatUsd(row.earnTotalAssetsUsd)}</td>
              <td>{formatPercent(row.utilization)}</td>
              <td>
                {row.error ? (
                  <span className="diff-large">{row.error}</span>
                ) : (
                  [
                    row.missingPriceCount ? `${row.missingPriceCount} prices` : null,
                    row.missingVaultCount ? `${row.missingVaultCount} vaults` : null,
                    row.errorCount ? `${row.errorCount} errors` : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ComparisonTable({ rows }: { rows: ChainTotalsComparison[] }) {
  return (
    <section className="totals-section">
      <h2 className="section-title">Chain Comparison</h2>
      <table>
        <thead>
          <tr>
            <th>Chain</th>
            <th>Vault Count Diff</th>
            <th>Supplied Diff</th>
            <th>Borrowed Diff</th>
            <th>Earn Assets Diff</th>
            <th>Onchain Supplied</th>
            <th>V3 Supplied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ chainId, onchain, v3 }) => (
            <tr key={chainId}>
              <td>{CHAIN_NAMES[chainId] ?? chainId}</td>
              <DiffCell base={onchain.vaultCount} next={v3.vaultCount} />
              <DiffCell base={onchain.totalSuppliedUsd} next={v3.totalSuppliedUsd} />
              <DiffCell base={onchain.totalBorrowedUsd} next={v3.totalBorrowedUsd} />
              <DiffCell base={onchain.earnTotalAssetsUsd} next={v3.earnTotalAssetsUsd} />
              <td>{formatUsd(onchain.totalSuppliedUsd)}</td>
              <td>{formatUsd(v3.totalSuppliedUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AggregateTable({ report }: { report: TotalsReport }) {
  const { onchain, v3 } = report.aggregate;

  return (
    <section className="totals-section">
      <h2 className="section-title">Aggregate</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Onchain</th>
            <th>V3</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vaults</td>
            <td>{formatCount(onchain.vaultCount)}</td>
            <td>{formatCount(v3.vaultCount)}</td>
            <DiffCell base={onchain.vaultCount} next={v3.vaultCount} />
          </tr>
          <tr>
            <td>Supplied</td>
            <td>{formatUsd(onchain.totalSuppliedUsd)}</td>
            <td>{formatUsd(v3.totalSuppliedUsd)}</td>
            <DiffCell base={onchain.totalSuppliedUsd} next={v3.totalSuppliedUsd} />
          </tr>
          <tr>
            <td>Borrowed</td>
            <td>{formatUsd(onchain.totalBorrowedUsd)}</td>
            <td>{formatUsd(v3.totalBorrowedUsd)}</td>
            <DiffCell base={onchain.totalBorrowedUsd} next={v3.totalBorrowedUsd} />
          </tr>
          <tr>
            <td>Earn Assets</td>
            <td>{formatUsd(onchain.earnTotalAssetsUsd)}</td>
            <td>{formatUsd(v3.earnTotalAssetsUsd)}</td>
            <DiffCell base={onchain.earnTotalAssetsUsd} next={v3.earnTotalAssetsUsd} />
          </tr>
          <tr>
            <td>Utilization</td>
            <td>{formatPercent(onchain.utilization)}</td>
            <td>{formatPercent(v3.utilization)}</td>
            <DiffCell base={onchain.utilization} next={v3.utilization} />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export function TotalsPage() {
  const { loading: sdkLoading, error: sdkError } = useSDK();
  const proxyV3Calls = useProxyV3Calls();
  const v3ApiEndpoint = getV3ApiEndpoint(proxyV3Calls);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["totals-page", APP_CHAIN_IDS_MINUS_BOB, v3ApiEndpoint],
    queryFn: () => fetchTotalsReport(v3ApiEndpoint),
    staleTime: 60_000,
    enabled: !sdkLoading && !sdkError,
  });

  if (sdkLoading) return <div className="status-message">Initializing SDK...</div>;
  if (sdkError) return <div className="error-message">SDK Error: {sdkError}</div>;
  if (isLoading) return <div className="status-message">Fetching totals...</div>;
  if (error) return <div className="error-message">{String(error)}</div>;
  if (!data) return <div className="status-message">No totals found.</div>;

  return (
    <div>
      <div className="totals-header">
        <div>
          <h1 className="page-title">Totals</h1>
          <p className="page-subtitle">
            Product-labeled EVaults and Euler Earn vaults across the app chains.
          </p>
        </div>
        <button
          type="button"
          className="action-button secondary"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <SourceTable
        title="Onchain Adapter"
        rows={data.chains.map((chain) => chain.onchain)}
      />
      <SourceTable title="V3 Adapter" rows={data.chains.map((chain) => chain.v3)} />
      <ComparisonTable rows={data.chains} />
      <AggregateTable report={data} />
    </div>
  );
}
