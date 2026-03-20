import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import {
  queryClient,
  unwrapServiceResult,
  useAllVaultsWithDiagnostics,
  useWalletBalance,
} from "../queries/sdkQueries.ts";
import {
  isEVault,
  isEulerEarn,
  type EVault,
  type EulerEarn,
} from "euler-v2-sdk";
import { formatUnits, parseUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { formatBigInt, formatPriceUsd } from "../utils/format.ts";
import {
  createEntityDiagnosticIndex,
  formatDiagnosticIssues,
} from "../utils/diagnosticIndex.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ApyCell } from "../components/ApyCell.tsx";
import { ErrorIcon } from "../components/ErrorIcon.tsx";
import { executePlanWithProgress } from "../utils/txExecutor.ts";

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

function calcVaultSupplyUsd(vault: EVault): bigint | undefined {
  if (vault.marketPriceUsd === undefined) return undefined;
  const decimals = BigInt(vault.asset.decimals ?? 18);
  return (vault.totalAssets * vault.marketPriceUsd) / (10n ** decimals);
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

function useDebouncedValue<T>(value: T, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

function amountToUsdWad(
  amount: string,
  decimals: number,
  priceWad: bigint | undefined
): bigint | undefined {
  if (!amount || !priceWad) return undefined;
  try {
    const amountRaw = parseUnits(amount as `${number}`, decimals);
    return (amountRaw * priceWad) / (10n ** BigInt(decimals));
  } catch {
    return undefined;
  }
}

function balanceToUsdWad(
  balance: bigint | undefined,
  decimals: number,
  priceWad: bigint | undefined
): bigint | undefined {
  if (balance === undefined || !priceWad) return undefined;
  return (balance * priceWad) / (10n ** BigInt(decimals));
}

function DepositFormRow({
  vault,
  chainId,
  onClose,
}: {
  vault: EVault;
  chainId: number;
  onClose: () => void;
}) {
  const { sdk } = useSDK();
  const { address: walletAddress, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; status?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const debouncedAmount = useDebouncedValue(amount, 400);

  const { data: walletBalance } = useWalletBalance(
    chainId,
    walletAddress,
    vault.asset.address
  );

  const priceWad = vault.marketPriceUsd ?? undefined;
  const amountUsdWad = useMemo(
    () => amountToUsdWad(debouncedAmount, vault.asset.decimals, priceWad),
    [debouncedAmount, vault.asset.decimals, priceWad]
  );
  const balanceUsdWad = useMemo(
    () => balanceToUsdWad(walletBalance, vault.asset.decimals, priceWad),
    [walletBalance, vault.asset.decimals, priceWad]
  );

  const formattedBalance = walletBalance !== undefined
    ? formatBigInt(walletBalance, vault.asset.decimals)
    : "-";
  const balanceUsd = formatPriceUsd(balanceUsdWad);
  const isChainMismatch = isConnected && walletChainId !== chainId;

  const handleSupply = async () => {
    if (!sdk || !walletAddress) {
      setError("Connect wallet first.");
      return;
    }
    setError(null);
    setSuccess(null);

    if (isChainMismatch) {
      if (!switchChain) {
        setError(`Switch wallet to chain ${chainId} and try again.`);
        return;
      }
      try {
        await switchChain({ chainId });
      } catch (err) {
        setError(String(err));
      }
      return;
    }

    if (!walletClient || !publicClient) {
      setError("Wallet client not ready yet. Retry in a second.");
      return;
    }

    if (!amount.trim()) {
      setError("Enter an amount to supply.");
      return;
    }

    let amountRaw: bigint;
    try {
      amountRaw = parseUnits(amount as `${number}`, vault.asset.decimals);
    } catch {
      setError("Invalid amount.");
      return;
    }

    if (amountRaw <= 0n) {
      setError("Amount must be greater than zero.");
      return;
    }

    setIsSubmitting(true);

    try {
      const accountData = unwrapServiceResult<any>(
        "accountService.fetchAccount",
        await sdk.accountService.fetchAccount(chainId, walletAddress as Address, {
          populateVaults: false,
        })
      );

      let plan = sdk.executionService.planDeposit({
        vault: vault.address,
        amount: amountRaw,
        receiver: walletAddress as Address,
        account: accountData,
        asset: vault.asset.address,
        enableCollateral: false,
      });

      plan = await sdk.executionService.resolveRequiredApprovals({
        plan,
        chainId,
        account: walletAddress as Address,
        usePermit2: true,
        unlimitedApproval: false,
      });

      setProgress({ completed: 0, total: plan.length });

      await executePlanWithProgress({
        plan,
        sdk,
        chainId,
        walletClient,
        publicClient,
        account: walletAddress as Address,
        onProgress: (p) => {
          setProgress({ completed: p.completed, total: p.total, status: p.status });
        },
      });

      queryClient.invalidateQueries({
        queryKey: ["walletBalance", chainId, walletAddress, vault.asset.address],
      });

      setAmount("");
      setSuccess("Supply completed.");
      setProgress(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <tr className="deposit-row">
      <td colSpan={10}>
        <div className="deposit-panel">
          <div className="deposit-header">
            <div>
              Deposit into <strong>{vault.shares.name || vault.asset.symbol}</strong>
            </div>
            <button type="button" className="link-button" onClick={onClose}>
              Close
            </button>
          </div>

          {!isConnected && (
            <div className="status-message">
              Connect a wallet to deposit.
            </div>
          )}

              {isConnected && (
            <>
              {isChainMismatch && (
                <div className="wallet-chain-warning">
                  Wallet is connected to a different chain. We will prompt a switch to {chainId}.
                </div>
              )}
              <div className="deposit-balance">
                <span>
                  Wallet Balance: {formattedBalance} {vault.asset.symbol}
                </span>
                <span>({balanceUsd})</span>
                <button
                  type="button"
                  className="wallet-button"
                  onClick={() => {
                    if (walletBalance === undefined) return;
                    setAmount(formatUnits(walletBalance, vault.asset.decimals));
                  }}
                  disabled={walletBalance === undefined || walletBalance === 0n}
                >
                  Max
                </button>
              </div>

              <div className="deposit-form">
                <label className="deposit-label">
                  Amount ({vault.asset.symbol})
                </label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  className="deposit-input"
                  disabled={isSubmitting}
                />
                <div className="deposit-usd">
                  USD value: {formatPriceUsd(amountUsdWad)}
                </div>
                <div className="deposit-actions">
                  <button
                    type="button"
                    className="wallet-button"
                    onClick={handleSupply}
                    disabled={isSubmitting || !isConnected}
                  >
                    {isSwitching
                      ? "Switching..."
                      : isSubmitting
                      ? "Supplying..."
                      : "Supply"}
                  </button>
                </div>
              </div>
              {progress && (
                <div className="plan-progress">
                  <div className="plan-progress-label">
                    Progress: {progress.completed}/{progress.total}
                  </div>
                  {progress.status && (
                    <div className="plan-progress-status">{progress.status}</div>
                  )}
                  <div className="plan-progress-bar">
                    <div
                      className="plan-progress-fill"
                      style={{
                        width: `${Math.round(
                          (progress.completed / Math.max(progress.total, 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {success && <div className="success-message">{success}</div>}
              {error && <div className="error-message">{error}</div>}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultListPage() {
  const { chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("evaults");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [assetFilter, setAssetFilter] = useState<string>("all");
  const [marketSearch, setMarketSearch] = useState<string>("");
  const [assetSearch, setAssetSearch] = useState<string>("");
  const { isConnected } = useAccount();
  const [openDeposit, setOpenDeposit] = useState<string | null>(null);

  const {
    data: vaultData,
    isLoading,
    error,
    dataUpdatedAt: diagnosticsDataUpdatedAt,
  } = useAllVaultsWithDiagnostics();
  const allVaults = vaultData?.vaults ?? [];
  const failedVaults = vaultData?.failedVaults ?? [];
  const diagnostics = vaultData?.diagnostics ?? [];

  const eVaults = allVaults?.filter(isEVault) ?? [];
  const earnVaults = allVaults?.filter(isEulerEarn) ?? [];

  const eVaultMarkets = useMemo(() => {
    const byName = new Map<string, bigint>();
    for (const vault of eVaults) {
      const market = vault.eulerLabel?.products[0]?.name ?? vault.eulerLabel?.vault.name;
      if (!market) continue;
      const suppliedUsd = calcVaultSupplyUsd(vault) ?? 0n;
      byName.set(market, (byName.get(market) ?? 0n) + suppliedUsd);
    }
    return Array.from(byName.entries())
      .sort((a, b) => {
        if (a[1] === b[1]) return a[0].localeCompare(b[0]);
        return a[1] > b[1] ? -1 : 1;
      })
      .map(([name]) => name);
  }, [eVaults]);

  const eVaultAssets = useMemo(() => {
    const assets = new Map<string, string>();
    for (const vault of eVaults) {
      assets.set(vault.asset.address.toLowerCase(), vault.asset.symbol);
    }
    return Array.from(assets.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [eVaults]);

  const searchedEVaultMarkets = useMemo(() => {
    const query = marketSearch.trim().toLowerCase();
    if (!query) return eVaultMarkets;
    return eVaultMarkets.filter((market) =>
      market === marketFilter || market.toLowerCase().includes(query)
    );
  }, [eVaultMarkets, marketSearch, marketFilter]);

  const searchedEVaultAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    if (!query) return eVaultAssets;
    return eVaultAssets.filter(([address, symbol]) =>
      address === assetFilter ||
      symbol.toLowerCase().includes(query) ||
      address.includes(query)
    );
  }, [eVaultAssets, assetSearch, assetFilter]);

  const filteredEVaults = useMemo(() => {
    return eVaults.filter((vault) => {
      if (marketFilter !== "all") {
        const market = vault.eulerLabel?.products[0]?.name ?? vault.eulerLabel?.vault.name;
        if (market !== marketFilter) return false;
      }
      if (assetFilter !== "all") {
        if (vault.asset.address.toLowerCase() !== assetFilter) return false;
      }
      return true;
    });
  }, [eVaults, marketFilter, assetFilter]);

  const eVaultSort = useSorted(filteredEVaults, "totalSupply" as EVaultSortKey, getEVaultSortValue);
  const earnSort = useSorted(earnVaults, "totalAssets" as EarnSortKey, getEarnSortValue);

  const vaultDiagnosticIndex = useMemo(
    () =>
      createEntityDiagnosticIndex({
        diagnostics,
        resolveEntityKey: (issue) => {
          if (!issue.entityId || issue.entityId.length !== 42) return undefined;
          return issue.entityId.toLowerCase();
        },
        normalizePath: (path) => {
          if (!path) return "$";
          const match = path.match(/^\$\.vaults\[\d+\](?:\.(.*))?$/);
          if (!match) return path;
          return match[1] ? `$.${match[1]}` : "$";
        },
      }),
    [diagnostics, diagnosticsDataUpdatedAt]
  );

  const renderFieldIcon = (
    address: string,
    paths: string[],
    position: "leading" | "trailing" = "leading"
  ) => {
    const issues = vaultDiagnosticIndex.getFieldIssues(address.toLowerCase(), paths);
    if (issues.length === 0) return null;
    return <ErrorIcon details={formatDiagnosticIssues(issues)} position={position} />;
  };

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
          ) : (
            <>
              {failedVaults.length > 0 && (
                <div className="failed-vaults-panel">
                  <div className="failed-vaults-title">Failed Vault Fetches</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Address</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedVaults.map((failed) => (
                        <tr key={`failed-evault-${failed.address}`}>
                          <td><CopyAddress address={failed.address as Address} /></td>
                          <td>
                            <ErrorIcon details={failed.details} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {eVaults.length === 0 ? (
                <div className="status-message">No EVaults found</div>
              ) : (
              <>
              <div className="filter-bar">
                <div className="filter-group">
                  <label className="filter-label" htmlFor="vault-market-filter">
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
                    id="vault-market-filter"
                    className="filter-select"
                    value={marketFilter}
                    onChange={(e) => setMarketFilter(e.target.value)}
                  >
                    <option value="all">All markets</option>
                    {searchedEVaultMarkets.map((market) => (
                      <option key={market} value={market}>
                        {market}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <label className="filter-label" htmlFor="vault-asset-filter">
                    Asset
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Search assets"
                  />
                  <select
                    id="vault-asset-filter"
                    className="filter-select"
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                  >
                    <option value="all">All assets</option>
                    {searchedEVaultAssets.map(([address, symbol]) => (
                      <option key={address} value={address}>
                        {symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {eVaultSort.sorted.length === 0 ? (
                <div className="status-message">No EVaults match the selected filters.</div>
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
                      <th>Deposit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eVaultSort.sorted.map((vault) => (
                      <Fragment key={vault.address}>
                        <tr
                          className="clickable"
                          onClick={() =>
                            navigate(`/vault/${chainId}/${vault.address}`)
                          }
                        >
                          <td>
                            {renderFieldIcon(vault.address, ["$.shares.name", "$.eulerLabel.vault.name", "$.eulerLabel.products"])}
                            {vault.shares.name || "-"}
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.asset.symbol", "$.asset.name"])}
                            {vault.asset.symbol}
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.address"])}
                            <CopyAddress address={vault.address} />
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.totalAssets"])}
                            {formatBigInt(vault.totalAssets, vault.asset.decimals)}
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.totalBorrowed"])}
                            {formatBigInt(vault.totalBorrowed, vault.asset.decimals)}
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.interestRates.supplyAPY", "$.rewards", "$.intrinsicApy"])}
                            <ApyCell
                              baseApy={Number(vault.interestRates.supplyAPY)}
                              rewards={vault.rewards}
                              intrinsicApy={vault.intrinsicApy}
                            />
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.interestRates.borrowAPY"])}
                            <ApyCell
                              baseApy={Number(vault.interestRates.borrowAPY)}
                            />
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.marketPriceUsd"])}
                            {formatPriceUsd(vault.marketPriceUsd)}
                          </td>
                          <td>
                            {renderFieldIcon(vault.address, ["$.collaterals"])}
                            {vault.collaterals.length}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="wallet-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isConnected) return;
                                setOpenDeposit((prev) =>
                                  prev === vault.address ? null : vault.address
                                );
                              }}
                              disabled={!isConnected}
                            >
                              Deposit
                            </button>
                          </td>
                        </tr>
                        {openDeposit === vault.address && (
                          <DepositFormRow
                            vault={vault}
                            chainId={chainId}
                            onClose={() => setOpenDeposit(null)}
                          />
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
              </>
              )}
            </>
          )}
        </>
      )}

      {tab === "eulerEarn" && (
        <>
          {isLoading ? (
            <div className="status-message">Loading Euler Earn vaults...</div>
          ) : error ? (
            <div className="error-message">Error: {String(error)}</div>
          ) : (
            <>
              {failedVaults.length > 0 && (
                <div className="failed-vaults-panel">
                  <div className="failed-vaults-title">Failed Vault Fetches</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Address</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedVaults.map((failed) => (
                        <tr key={`failed-earn-${failed.address}`}>
                          <td><CopyAddress address={failed.address as Address} /></td>
                          <td>
                            <ErrorIcon details={failed.details} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {earnVaults.length === 0 ? (
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
                    <td>
                      {renderFieldIcon(vault.address, ["$.shares.name", "$.eulerLabel.vault.name"], "leading")}
                      {vault.shares.name || "-"}
                    </td>
                    <td>
                      {renderFieldIcon(vault.address, ["$.asset.symbol", "$.asset.name"])}
                      {vault.asset.symbol}
                    </td>
                    <td>
                      {renderFieldIcon(vault.address, ["$.address"])}
                      <CopyAddress address={vault.address} />
                    </td>
                    <td>
                      {renderFieldIcon(vault.address, ["$.totalAssets"])}
                      {formatBigInt(vault.totalAssets, vault.asset.decimals)}
                    </td>
                    <td>
                      {renderFieldIcon(vault.address, ["$.supplyApy", "$.rewards", "$.intrinsicApy"])}
                      {vault.supplyApy !== undefined
                        ? <ApyCell baseApy={vault.supplyApy} rewards={vault.rewards} intrinsicApy={vault.intrinsicApy} />
                        : "-"}
                    </td>
                    <td>
                      {renderFieldIcon(vault.address, ["$.marketPriceUsd"])}
                      {formatPriceUsd(vault.marketPriceUsd)}
                    </td>
                    <td>
                      {renderFieldIcon(vault.address, ["$.strategies"])}
                      {vault.strategies.length}
                    </td>
                    <td>
                      {renderFieldIcon(vault.address, ["$.performanceFee"])}
                      {(vault.performanceFee * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              )}
            </>
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
