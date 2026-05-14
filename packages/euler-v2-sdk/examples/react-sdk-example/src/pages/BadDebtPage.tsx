import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { buildEulerSDK, type EulerSDK, type EVault } from "@eulerxyz/euler-v2-sdk";
import { useSDK } from "../context/SdkContext.tsx";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { formatBigInt, formatPriceUsd } from "../utils/format.ts";
import { fetchVaultAddressesFromLabelProducts } from "../queries/sdkQueries.ts";
import { V3_PROXY_ENDPOINT } from "../config/endpoints.ts";

type TrackingVaultBalanceRow = {
  id: string;
  account: string;
  debt: string;
};

type TrackingActiveAccountRow = {
  id: string;
  deposits: string[];
  borrows: string[];
};

type PriceEntry = {
  priceUsd: number;
  decimals: number;
  symbol: string;
};

type CollateralResult = {
  address: Address;
  symbol: string;
  decimals: number;
  assets: bigint;
  shares: bigint;
  marketPriceUsd: number;
  marketValueUsd: number;
};

type BadDebtPositionResult = {
  account: Address;
  borrowed: bigint;
  debtValueUsd: number;
  activeCollateralValueUsd: number;
  shortfallUsd: number;
  collaterals: CollateralResult[];
  missingPriceVaults: Address[];
  diagnosticsCount: number;
};

type AccountErrorResult = {
  account: Address;
  message: string;
};

type BadDebtResult = {
  chainId: number;
  vault: EVault;
  debtPositions: BadDebtPositionResult[];
  badPositions: BadDebtPositionResult[];
  accountErrors: AccountErrorResult[];
  checkedDebtPositions: number;
  skippedPositions: number;
  totalDebtValueUsd: number;
  totalCollateralMarketValueUsd: number;
  badDebtUsd: number;
  missingPriceVaults: Address[];
  discoveredAt: string;
};

type VaultOption = {
  address: Address;
  label: string;
  symbol: string;
};

const SUBGRAPH_ENDPOINTS: Record<number, string> = {
  1: "/api/subgraphs/euler-simple-mainnet",
  130: "/api/subgraphs/euler-simple-unichain",
  143: "/api/subgraphs/euler-simple-monad",
  146: "/api/subgraphs/euler-simple-sonic",
  1923: "/api/subgraphs/euler-simple-swell",
};

function formatUsd(value: number | undefined): string {
  if (value === undefined) return "-";
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPreciseUsd(value: number | undefined): string {
  if (value === undefined) return "-";
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1) return formatUsd(value);
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })}`;
}

function addressPrefix(address: Address): string {
  return address.toLowerCase().slice(0, 40);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getVaultLabel(vault: EVault): string {
  return vault.eulerLabel?.products[0]?.name ?? vault.shares.name ?? vault.asset.symbol;
}

function parseTrackingEntry(entry: string): { subAccount: Address; vault: Address } {
  return {
    subAccount: getAddress(entry.substring(0, 42)),
    vault: getAddress(`0x${entry.substring(42)}`),
  };
}

function amountToUsd(amount: bigint, decimals: number, priceUsd: number): number {
  return Number(formatUnits(amount, decimals)) * priceUsd;
}

async function postSubgraph<TData>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>
): Promise<TData> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message ?? "GraphQL error").join("; "));
  }
  if (!payload.data) throw new Error("Subgraph returned no data");
  return payload.data;
}

async function fetchDebtRows(
  endpoint: string,
  vault: Address
): Promise<TrackingVaultBalanceRow[]> {
  const rows: TrackingVaultBalanceRow[] = [];
  let lastId = "";

  for (;;) {
    const data = await postSubgraph<{
      trackingVaultBalances: TrackingVaultBalanceRow[];
    }>(
      endpoint,
      `query DebtRows($vault: Bytes!, $lastId: Bytes!) {
        trackingVaultBalances(
          first: 1000
          orderBy: id
          orderDirection: asc
          where: { vault: $vault, debt_gt: 0, id_gt: $lastId }
        ) {
          id
          account
          debt
        }
      }`,
      { vault: vault.toLowerCase(), lastId }
    );

    const page = data.trackingVaultBalances ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
    lastId = page[page.length - 1]?.id ?? "";
  }

  return rows;
}

async function fetchActiveAccounts(
  endpoint: string,
  debtRows: TrackingVaultBalanceRow[]
): Promise<Map<string, TrackingActiveAccountRow>> {
  const prefixes = [
    ...new Set(
      debtRows.map((row) => addressPrefix(getAddress(row.account)))
    ),
  ];
  const byPrefix = new Map<string, TrackingActiveAccountRow>();

  for (let index = 0; index < prefixes.length; index += 100) {
    const ids = prefixes.slice(index, index + 100);
    const data = await postSubgraph<{
      trackingActiveAccounts: TrackingActiveAccountRow[];
    }>(
      endpoint,
      `query ActiveAccounts($ids: [Bytes!]!) {
        trackingActiveAccounts(first: 1000, where: { id_in: $ids }) {
          id
          deposits
          borrows
        }
      }`,
      { ids }
    );

    for (const account of data.trackingActiveAccounts ?? []) {
      byPrefix.set(account.id.toLowerCase(), account);
    }
  }

  return byPrefix;
}

function buildMarketPrices(vault: EVault): Map<string, PriceEntry> {
  const prices = new Map<string, PriceEntry>();

  if (vault.marketPriceUsd != null) {
    prices.set(vault.address.toLowerCase(), {
      priceUsd: Number(vault.marketPriceUsd),
      decimals: vault.asset.decimals,
      symbol: vault.asset.symbol,
    });
  }

  for (const collateral of vault.collaterals) {
    if (collateral.marketPriceUsd == null || !collateral.vault) continue;
    prices.set(collateral.address.toLowerCase(), {
      priceUsd: Number(collateral.marketPriceUsd),
      decimals: collateral.vault.asset.decimals,
      symbol: collateral.vault.asset.symbol,
    });
  }

  return prices;
}

async function fetchVaultOptions(
  sdk: EulerSDK,
  chainId: number
): Promise<VaultOption[]> {
  const addresses = await fetchVaultAddressesFromLabelProducts(sdk, chainId);
  const response = await sdk.eVaultService.fetchVaults(chainId, addresses, {
    populateLabels: true,
  });

  return response.result
    .filter((vault): vault is EVault => vault !== undefined)
    .map((vault) => ({
      address: getAddress(vault.address),
      label: getVaultLabel(vault),
      symbol: vault.asset.symbol,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function buildBadDebtAccountSdk(): Promise<EulerSDK> {
  return buildEulerSDK({
    config: {
      v3ApiUrl: V3_PROXY_ENDPOINT,
      v3ApiKey: import.meta.env.EULER_SDK_V3_API_KEY,
    },
    accountServiceConfig: {
      adapter: "onchain",
    },
  });
}

async function calculateBadDebt(args: {
  sdk: EulerSDK;
  chainId: number;
  vaultAddress: Address;
}): Promise<BadDebtResult> {
  const endpoint = SUBGRAPH_ENDPOINTS[args.chainId];
  if (!endpoint) {
    throw new Error(`No tracking subgraph is configured for chain ${args.chainId}`);
  }

  const vaultResponse = await args.sdk.eVaultService.fetchVault(
    args.chainId,
    args.vaultAddress,
    { populateAll: true }
  );
  const vault = vaultResponse.result;
  if (!vault) throw new Error("Vault not found");

  const prices = buildMarketPrices(vault);
  const debtPrice = prices.get(vault.address.toLowerCase());
  if (!debtPrice) throw new Error("Debt vault market price is unavailable");

  const debtRows = await fetchDebtRows(endpoint, args.vaultAddress);
  const activeAccounts = await fetchActiveAccounts(endpoint, debtRows);
  const accountSdk = await buildBadDebtAccountSdk();
  const debtPositions: BadDebtPositionResult[] = [];
  const accountErrors: AccountErrorResult[] = [];
  let skippedPositions = 0;

  for (const row of debtRows) {
    const account = getAddress(row.account);
    const active = activeAccounts.get(addressPrefix(account));
    const depositVaults = (active?.deposits ?? [])
      .map(parseTrackingEntry)
      .filter((entry) => entry.subAccount.toLowerCase() === account.toLowerCase())
      .map((entry) => entry.vault);
    const vaultsToFetch = [...new Set([args.vaultAddress, ...depositVaults])];

    let accountResponse: Awaited<
      ReturnType<EulerSDK["accountService"]["fetchSubAccount"]>
    >;
    try {
      accountResponse = await accountSdk.accountService.fetchSubAccount(
        args.chainId,
        account,
        vaultsToFetch,
        { populateVaults: false }
      );
    } catch (error) {
      skippedPositions += 1;
      accountErrors.push({ account, message: formatError(error) });
      continue;
    }

    const subAccount = accountResponse.result;
    const debtPosition = subAccount?.positions.find(
      (position) =>
        position.vaultAddress.toLowerCase() === args.vaultAddress.toLowerCase()
    );

    if (!subAccount || !debtPosition || debtPosition.borrowed === 0n) {
      skippedPositions += 1;
      continue;
    }

    const enabledCollaterals = new Set(
      subAccount.enabledCollaterals.map((address) => address.toLowerCase())
    );
    const collaterals: CollateralResult[] = [];
    const missingPriceVaults = new Set<Address>();

    for (const position of subAccount.positions) {
      const key = position.vaultAddress.toLowerCase();
      if (key === args.vaultAddress.toLowerCase()) continue;
      if (!enabledCollaterals.has(key)) continue;
      if (position.assets === 0n && position.shares === 0n) continue;

      const price = prices.get(key);
      if (!price) {
        missingPriceVaults.add(getAddress(position.vaultAddress));
        continue;
      }

      collaterals.push({
        address: getAddress(position.vaultAddress),
        symbol: price.symbol,
        decimals: price.decimals,
        assets: position.assets,
        shares: position.shares,
        marketPriceUsd: price.priceUsd,
        marketValueUsd: amountToUsd(position.assets, price.decimals, price.priceUsd),
      });
    }

    const debtValueUsd = amountToUsd(
      debtPosition.borrowed,
      debtPrice.decimals,
      debtPrice.priceUsd
    );
    const activeCollateralValueUsd = collaterals.reduce(
      (sum, collateral) => sum + collateral.marketValueUsd,
      0
    );

    debtPositions.push({
      account,
      borrowed: debtPosition.borrowed,
      debtValueUsd,
      activeCollateralValueUsd,
      shortfallUsd: Math.max(debtValueUsd - activeCollateralValueUsd, 0),
      collaterals,
      missingPriceVaults: [...missingPriceVaults],
      diagnosticsCount: accountResponse.errors.length,
    });
  }

  const totalDebtValueUsd = debtPositions.reduce(
    (sum, position) => sum + position.debtValueUsd,
    0
  );
  const totalCollateralMarketValueUsd = debtPositions.reduce(
    (sum, position) => sum + position.activeCollateralValueUsd,
    0
  );
  const badPositions = debtPositions.filter((position) => position.shortfallUsd > 0);
  const badDebtUsd = badPositions.reduce(
    (sum, position) => sum + position.shortfallUsd,
    0
  );
  const missingPriceVaults = [
    ...new Set(
      debtPositions.flatMap((position) =>
        position.missingPriceVaults.map((address) => address.toLowerCase())
      )
    ),
  ].map((address) => getAddress(address));

  return {
    chainId: args.chainId,
    vault,
    debtPositions,
    badPositions,
    accountErrors,
    checkedDebtPositions: debtRows.length,
    skippedPositions,
    totalDebtValueUsd,
    totalCollateralMarketValueUsd,
    badDebtUsd,
    missingPriceVaults,
    discoveredAt: new Date().toISOString(),
  };
}

export function BadDebtPage() {
  const { sdk, chainId, loading, error, setChainId, chainNames } = useSDK();
  const [chainInput, setChainInput] = useState(String(chainId));
  const [vaultInput, setVaultInput] = useState("");
  const [submitted, setSubmitted] = useState<{
    chainId: number;
    vaultAddress: Address;
  } | null>(null);

  const parsedChainId = Number(chainInput);
  const normalizedVault = useMemo(() => {
    const trimmed = vaultInput.trim();
    if (!isAddress(trimmed)) return undefined;
    return getAddress(trimmed);
  }, [vaultInput]);

  const badDebtQuery = useQuery({
    queryKey: ["badDebt", submitted?.chainId, submitted?.vaultAddress],
    queryFn: () =>
      calculateBadDebt({
        sdk: sdk!,
        chainId: submitted!.chainId,
        vaultAddress: submitted!.vaultAddress,
      }),
    enabled: !!sdk && !!submitted,
    staleTime: 30_000,
  });
  const unsupportedChain =
    Number.isFinite(parsedChainId) && !SUBGRAPH_ENDPOINTS[parsedChainId];
  const vaultOptionsQuery = useQuery({
    queryKey: ["badDebtVaultOptions", parsedChainId],
    queryFn: () => fetchVaultOptions(sdk!, parsedChainId),
    enabled:
      !!sdk &&
      Number.isInteger(parsedChainId) &&
      !!SUBGRAPH_ENDPOINTS[parsedChainId],
    staleTime: 5 * 60_000,
  });
  const selectedVaultOption = normalizedVault
    ? vaultOptionsQuery.data?.find(
        (option) => option.address.toLowerCase() === normalizedVault.toLowerCase()
      )
    : undefined;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedVault || !Number.isFinite(parsedChainId)) return;
    setChainId(parsedChainId);
    setSubmitted({ chainId: parsedChainId, vaultAddress: normalizedVault });
  };

  if (loading) return <div className="status-message">Initializing SDK...</div>;
  if (error) return <div className="error-message">SDK Error: {error}</div>;

  const result = badDebtQuery.data;

  return (
    <>
      <div className="detail-header">
        <h2>Bad Debt</h2>
        <div className="address">
          Market-price valuation by debt position. Surplus collateral is not netted across accounts.
        </div>
      </div>

      <form className="bad-debt-form" onSubmit={handleSubmit}>
        <div className="filter-group">
          <label className="filter-label" htmlFor="bad-debt-chain">
            Chain
          </label>
          <input
            id="bad-debt-chain"
            className="filter-input"
            value={chainInput}
            onChange={(event) => setChainInput(event.target.value)}
            inputMode="numeric"
          />
          <div className="table-subline">
            {chainNames[parsedChainId] ?? "Unknown chain"}
          </div>
        </div>
        <div className="filter-group bad-debt-vault-field">
          <label className="filter-label" htmlFor="bad-debt-vault-select">
            Vault Name
          </label>
          <select
            id="bad-debt-vault-select"
            className="filter-input"
            value={selectedVaultOption?.address ?? ""}
            onChange={(event) => setVaultInput(event.target.value)}
            disabled={unsupportedChain || vaultOptionsQuery.isLoading}
          >
            <option value="">
              {vaultOptionsQuery.isLoading ? "Loading vault names..." : "Select a labeled vault"}
            </option>
            {(vaultOptionsQuery.data ?? []).map((option) => (
              <option key={option.address} value={option.address}>
                {option.label} ({option.symbol}) - {option.address}
              </option>
            ))}
          </select>
          <div className="table-subline">
            {vaultOptionsQuery.error
              ? `Vault names failed: ${String(vaultOptionsQuery.error)}`
              : selectedVaultOption?.label ?? "Optional label-backed selector"}
          </div>
        </div>
        <div className="filter-group bad-debt-vault-field">
          <label className="filter-label" htmlFor="bad-debt-vault">
            Vault Address
          </label>
          <input
            id="bad-debt-vault"
            className="filter-input"
            value={vaultInput}
            onChange={(event) => setVaultInput(event.target.value)}
            placeholder="0x..."
          />
          <div className="table-subline">
            {normalizedVault ?? "Enter an EVault address"}
          </div>
        </div>
        <button
          className="action-button"
          type="submit"
          disabled={
            !normalizedVault ||
            !Number.isFinite(parsedChainId) ||
            unsupportedChain ||
            badDebtQuery.isFetching
          }
        >
          Calculate
        </button>
      </form>

      {unsupportedChain ? (
        <div className="error-message">
          No tracking subgraph is configured for chain {parsedChainId}.
        </div>
      ) : null}

      {badDebtQuery.isFetching ? (
        <div className="status-message">Calculating bad debt...</div>
      ) : null}
      {badDebtQuery.error ? (
        <div className="error-message">Error: {String(badDebtQuery.error)}</div>
      ) : null}

      {result ? (
        <>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="label">Vault</div>
              <div className="value">
                {result.vault.asset.symbol} <CopyAddress address={result.vault.address} />
              </div>
            </div>
            <div className="detail-item">
              <div className="label">Debt Vault Price</div>
              <div className="value">{formatPriceUsd(result.vault.marketPriceUsd)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Debt Positions</div>
              <div className="value">{result.checkedDebtPositions}</div>
            </div>
            <div className="detail-item">
              <div className="label">Skipped Positions</div>
              <div className="value">{result.skippedPositions}</div>
            </div>
            <div className="detail-item">
              <div className="label">Debt Value</div>
              <div className="value">{formatUsd(result.totalDebtValueUsd)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Active Collateral Value</div>
              <div className="value">{formatUsd(result.totalCollateralMarketValueUsd)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Bad Positions</div>
              <div className="value">{result.badPositions.length}</div>
            </div>
            <div className="detail-item">
              <div className="label">Bad Debt</div>
              <div className="value">{formatPreciseUsd(result.badDebtUsd)}</div>
            </div>
          </div>

          {result.missingPriceVaults.length > 0 ? (
            <div className="failed-vaults-panel">
              <div className="failed-vaults-title">Missing Market Prices</div>
              <table>
                <tbody>
                  {result.missingPriceVaults.map((address) => (
                    <tr key={address}>
                      <td>
                        <CopyAddress address={address} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result.accountErrors.length > 0 ? (
            <div className="failed-vaults-panel">
              <div className="failed-vaults-title">Skipped Account Fetches</div>
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.accountErrors.map((entry) => (
                    <tr key={entry.account}>
                      <td>
                        <CopyAddress address={entry.account} />
                      </td>
                      <td>{entry.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <h3 className="section-title">Bad Positions</h3>
          {result.badPositions.length === 0 ? (
            <div className="status-message">No market-price shortfall found.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Borrowed</th>
                  <th>Debt Value</th>
                  <th>Collateral Value</th>
                  <th>Shortfall</th>
                  <th>Active Collaterals</th>
                </tr>
              </thead>
              <tbody>
                {result.badPositions.map((position) => (
                  <tr key={position.account}>
                    <td>
                      <CopyAddress address={position.account} />
                    </td>
                    <td>
                      {formatBigInt(
                        position.borrowed,
                        result.vault.asset.decimals,
                        6
                      )}{" "}
                      {result.vault.asset.symbol}
                    </td>
                    <td>{formatPreciseUsd(position.debtValueUsd)}</td>
                    <td>{formatPreciseUsd(position.activeCollateralValueUsd)}</td>
                    <td className="diff-large">
                      {formatPreciseUsd(position.shortfallUsd)}
                    </td>
                    <td>
                      {position.collaterals.length === 0 ? (
                        "-"
                      ) : (
                        <div className="bad-debt-collateral-list">
                          {position.collaterals.map((collateral) => (
                            <div key={collateral.address}>
                              <CopyAddress address={collateral.address} />{" "}
                              <span className="table-subline">
                                {formatBigInt(collateral.assets, collateral.decimals, 6)}{" "}
                                {collateral.symbol} · {formatPreciseUsd(collateral.marketValueUsd)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="section-title">All Debt Positions</h3>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Debt Value</th>
                <th>Collateral Value</th>
                <th>Shortfall</th>
                <th>Diagnostics</th>
              </tr>
            </thead>
            <tbody>
              {result.debtPositions.map((position) => (
                <tr key={position.account}>
                  <td>
                    <CopyAddress address={position.account} />
                  </td>
                  <td>{formatPreciseUsd(position.debtValueUsd)}</td>
                  <td>{formatPreciseUsd(position.activeCollateralValueUsd)}</td>
                  <td>{formatPreciseUsd(position.shortfallUsd)}</td>
                  <td>{position.diagnosticsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}
