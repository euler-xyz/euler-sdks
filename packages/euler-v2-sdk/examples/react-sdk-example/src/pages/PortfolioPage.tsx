import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import {
  useAccount as useWagmiAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import {
  queryClient,
  useAccountAllChainsWithDiagnostics,
  type AccountByChainResult,
} from "../queries/sdkQueries.ts";
import { getSubAccountId } from "@eulerxyz/euler-v2-sdk";
import { getAddress, type Address } from "viem";
import { formatBigInt, formatPriceUsd, formatWad, formatWadPercent } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { RoeCell } from "../components/RoeCell.tsx";
import { ErrorIcon } from "../components/ErrorIcon.tsx";
import { RawEntityDialog } from "../components/RawEntityDialog.tsx";
import type { VaultEntity, AccountPosition, UserReward } from "@eulerxyz/euler-v2-sdk";
import { executePlanWithProgress, type PlanProgress } from "../utils/txExecutor.ts";

// Persist across navigations but not across full page reloads
let lastAddress: string | undefined;

function formatUsdValue(value: bigint | undefined): string {
  if (value === undefined) return "-";
  return formatPriceUsd(value);
}

function sumBigints(values: Array<bigint | undefined>): bigint | undefined {
  let total: bigint | undefined;
  for (const v of values) {
    if (v === undefined) continue;
    total = (total ?? 0n) + v;
  }
  return total;
}

function hasActivity(result: AccountByChainResult): boolean {
  const account = result.account;
  if (!account) return false;
  if ((account.userRewards?.length ?? 0) > 0) return true;
  for (const sa of Object.values(account.subAccounts)) {
    if (sa && sa.positions.length > 0) return true;
  }
  return false;
}

export function PortfolioPage() {
  const { loading: sdkLoading, error: sdkError, chainNames } = useSDK();
  const { address: walletAddress, isConnected } = useWagmiAccount();
  const walletChainId = useChainId();
  const { isPending: isSwitching } = useSwitchChain();
  const [input, setInput] = useState(lastAddress ?? "");
  const [address, setAddress] = useState<string | undefined>(lastAddress);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [claimProgress, setClaimProgress] = useState<PlanProgress | null>(null);
  const [activeClaimKey, setActiveClaimKey] = useState<string | null>(null);

  const { data, isLoading, error } = useAccountAllChainsWithDiagnostics(address);
  const results = useMemo<AccountByChainResult[]>(() => data ?? [], [data]);
  const activeResults = useMemo(() => results.filter(hasActivity), [results]);

  useEffect(() => {
    if (!lastAddress && isConnected && walletAddress) {
      lastAddress = walletAddress;
      setInput(walletAddress);
      setAddress(walletAddress);
    }
  }, [isConnected, walletAddress]);

  // Owner is the same across chains; pick the first resolved account to derive it.
  const owner = activeResults[0]?.account?.owner ?? results.find((r) => r.account)?.account?.owner;
  const connectedWalletMatchesViewedAccount =
    !!walletAddress && !!owner && getAddress(walletAddress) === getAddress(owner);

  const totals = useMemo(() => {
    return {
      supplied: sumBigints(results.map((r) => r.account?.totalSuppliedValueUsd)),
      borrowed: sumBigints(results.map((r) => r.account?.totalBorrowedValueUsd)),
      nav: sumBigints(results.map((r) => r.account?.netAssetValueUsd)),
      rewards: sumBigints(results.map((r) => r.account?.totalRewardsValueUsd)),
    };
  }, [results]);

  const resetClaimMessages = () => {
    setClaimError(null);
    setClaimSuccess(null);
  };

  const invalidateRewardQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["account"] }),
      queryClient.invalidateQueries({ queryKey: ["accountWithDiagnostics"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryMerklUserRewards"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryBrevisUserProofs"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryFuulTotals"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryFuulClaimChecks"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryV3RewardsBreakdown"] }),
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.match(/^0x[a-fA-F0-9]{40}$/)) {
      lastAddress = trimmed;
      setAddress(trimmed);
    }
  };

  if (sdkLoading)
    return <div className="status-message">Initializing SDK...</div>;
  if (sdkError)
    return <div className="error-message">SDK Error: {sdkError}</div>;

  return (
    <>
      <h3 className="section-title">Portfolio</h3>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter account address (0x...)"
            style={{
              flex: 1,
              fontFamily: "inherit",
              fontSize: 14,
              padding: "6px 10px",
              border: "1px solid #000",
              background: "#fff",
            }}
          />
          <button
            type="submit"
            style={{
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 16px",
              border: "2px solid #000",
              background: "#000",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Load
          </button>
          {isConnected && walletAddress && (
            <button
              type="button"
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                padding: "6px 12px",
                border: "2px solid #000",
                background: "#fff",
                color: "#000",
                cursor: "pointer",
              }}
              onClick={() => {
                lastAddress = walletAddress;
                setInput(walletAddress);
                setAddress(walletAddress);
              }}
            >
              Use Connected Wallet
            </button>
          )}
        </div>
      </form>

      {!address && (
        <div className="status-message">
          Enter an Ethereum address to view its Euler V2 positions across all enabled chains.
        </div>
      )}

      {address && isLoading && (
        <div className="status-message">
          Loading account across {results.length > 0 ? results.length : "enabled"} chains...
        </div>
      )}

      {address && error && (
        <div className="error-message">Error: {String(error)}</div>
      )}

      {address && !isLoading && !error && results.length > 0 && (
        <>
          <div className="detail-grid" style={{ marginBottom: 24 }}>
            <div className="detail-item">
              <div className="label">Owner</div>
              <div className="value">{owner ?? address}</div>
            </div>
            <div className="detail-item">
              <div className="label">Chains With Activity</div>
              <div className="value">
                {activeResults.length} / {results.length}
              </div>
            </div>
            <div className="detail-item">
              <div className="label">Total Supplied (USD)</div>
              <div className="value">{formatUsdValue(totals.supplied)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Total Borrowed (USD)</div>
              <div className="value">{formatUsdValue(totals.borrowed)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Net Asset Value (USD)</div>
              <div className="value">{formatUsdValue(totals.nav)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Your Rewards (USD)</div>
              <div className="value">{formatUsdValue(totals.rewards)}</div>
            </div>
          </div>

          {isConnected && !connectedWalletMatchesViewedAccount && (
            <div className="status-message" style={{ marginBottom: 12 }}>
              Connect the viewed account to claim rewards.
            </div>
          )}

          {claimError && (
            <div className="error-message" style={{ marginBottom: 12 }}>
              {claimError}
            </div>
          )}
          {claimSuccess && (
            <div className="status-message" style={{ marginBottom: 12 }}>
              {claimSuccess}
            </div>
          )}

          {activeResults.length === 0 && (
            <div className="status-message">
              No activity found on any of the enabled chains.
            </div>
          )}

          {activeResults.map((result) => (
            <ChainPortfolioSection
              key={result.chainId}
              result={result}
              chainName={result.chainName ?? chainNames[result.chainId] ?? String(result.chainId)}
              connectedWalletMatchesViewedAccount={connectedWalletMatchesViewedAccount}
              walletChainId={walletChainId}
              isSwitching={isSwitching}
              activeClaimKey={activeClaimKey}
              setActiveClaimKey={setActiveClaimKey}
              claimProgress={claimProgress}
              setClaimProgress={setClaimProgress}
              setClaimError={setClaimError}
              setClaimSuccess={setClaimSuccess}
              resetClaimMessages={resetClaimMessages}
              invalidateRewardQueries={invalidateRewardQueries}
            />
          ))}

          {results
            .filter((r) => r.error)
            .map((r) => (
              <div
                key={`err-${r.chainId}`}
                className="error-message"
                style={{ marginBottom: 12 }}
              >
                {r.chainName}: {r.error}
              </div>
            ))}
        </>
      )}
    </>
  );
}

type ChainPortfolioSectionProps = {
  result: AccountByChainResult;
  chainName: string;
  connectedWalletMatchesViewedAccount: boolean;
  walletChainId: number | undefined;
  isSwitching: boolean;
  activeClaimKey: string | null;
  setActiveClaimKey: (key: string | null) => void;
  claimProgress: PlanProgress | null;
  setClaimProgress: (progress: PlanProgress | null) => void;
  setClaimError: (msg: string | null) => void;
  setClaimSuccess: (msg: string | null) => void;
  resetClaimMessages: () => void;
  invalidateRewardQueries: () => Promise<void>;
};

function ChainPortfolioSection({
  result,
  chainName,
  connectedWalletMatchesViewedAccount,
  walletChainId,
  isSwitching,
  activeClaimKey,
  setActiveClaimKey,
  claimProgress,
  setClaimProgress,
  setClaimError,
  setClaimSuccess,
  resetClaimMessages,
  invalidateRewardQueries,
}: ChainPortfolioSectionProps) {
  const { sdk } = useSDK();
  const { address: walletAddress } = useWagmiAccount();
  const { switchChain } = useSwitchChain();
  const chainId = result.chainId;
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const account = result.account;

  const failedVaultDetailsByAddress = useMemo(() => {
    const map = new Map<string, string>();
    for (const failed of result.failedVaults) {
      if (!failed.address) continue;
      map.set(failed.address.toLowerCase(), failed.details);
    }
    return map;
  }, [result.failedVaults]);

  const subAccountEntries = useMemo(
    () =>
      account
        ? Object.entries(account.subAccounts)
            .filter(
              (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
                entry[1] !== undefined && entry[1].positions.length > 0
            )
            .sort(([a], [b]) => {
              const idA = getSubAccountId(account.owner, a as Address);
              const idB = getSubAccountId(account.owner, b as Address);
              return idA - idB;
            })
        : [],
    [account]
  );

  if (!account) return null;

  const handleClaim = async (reward?: UserReward) => {
    resetClaimMessages();

    try {
      if (!walletAddress) throw new Error("Connect a wallet to claim rewards.");
      if (getAddress(walletAddress) !== getAddress(account.owner)) {
        throw new Error("Connect the same wallet as the viewed account to claim rewards.");
      }
      if (walletChainId !== chainId) {
        if (!switchChain) {
          throw new Error(`Switch your wallet to ${chainName} before claiming.`);
        }
        await switchChain({ chainId });
        return;
      }
      if (!walletClient || !publicClient) {
        throw new Error("Wallet client not ready.");
      }

      const claimRewards = !reward
        ? account.userRewards ?? []
        : reward.provider === "merkl"
          ? (account.userRewards ?? []).filter(
              (candidate) =>
                candidate.provider === "merkl" &&
                candidate.chainId === reward.chainId &&
                (candidate.claimAddress?.toLowerCase() ?? "") ===
                  (reward.claimAddress?.toLowerCase() ?? "")
            )
          : [reward];

      const claimKey = !reward
        ? `all:${chainId}`
        : reward.provider === "merkl"
          ? `merkl:${chainId}:${reward.chainId}:${reward.claimAddress ?? "none"}`
          : `${chainId}:${reward.provider}:${reward.token.address}:${reward.claimAddress ?? "none"}`;
      setActiveClaimKey(claimKey);

      const plan = reward
        ? await sdk!.rewardsService.buildClaimPlans({
            rewards: claimRewards,
            account: walletAddress as Address,
          })
        : await sdk!.rewardsService.buildClaimAllPlan({
            chainId,
            account: walletAddress as Address,
          });

      if (plan.length === 0) {
        throw new Error("No claimable rewards found.");
      }

      setClaimProgress({ completed: 0, total: plan.length });

      await executePlanWithProgress({
        plan,
        sdk: sdk!,
        chainId,
        walletClient,
        publicClient,
        account: walletAddress as Address,
        onProgress: (progress) => {
          setClaimProgress({
            completed: progress.completed,
            total: progress.total,
            status: progress.status,
          });
        },
      });

      await invalidateRewardQueries();
      setClaimSuccess(
        reward
          ? reward.provider === "merkl" && claimRewards.length > 1
            ? `Claimed ${claimRewards.length} Merkl rewards on ${chainName}.`
            : `Claimed ${reward.token.symbol} rewards on ${chainName}.`
          : `Claimed all rewards on ${chainName}.`
      );
    } catch (err) {
      setClaimError(String(err));
    } finally {
      setClaimProgress(null);
      setActiveClaimKey(null);
    }
  };

  const claimAllKey = `all:${chainId}`;
  const rewards = account.userRewards ?? [];

  return (
    <section style={{ marginBottom: 48 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <h3 className="section-title" style={{ marginBottom: 0 }}>
          {chainName}
        </h3>
        <RawEntityDialog title={`Raw Account Entity (${chainName})`} entity={account} />
      </div>

      <div className="detail-grid" style={{ marginBottom: 16 }}>
        <div className="detail-item">
          <div className="label">Sub-accounts</div>
          <div className="value">{subAccountEntries.length}</div>
        </div>
        <div className="detail-item">
          <div className="label">Lockdown Mode</div>
          <div className="value">{account.isLockdownMode ? "Yes" : "No"}</div>
        </div>
        <div className="detail-item">
          <div className="label">Permit Disabled</div>
          <div className="value">{account.isPermitDisabledMode ? "Yes" : "No"}</div>
        </div>
        <div className="detail-item">
          <div className="label">Supplied (USD)</div>
          <div className="value">{formatUsdValue(account.totalSuppliedValueUsd)}</div>
        </div>
        <div className="detail-item">
          <div className="label">Borrowed (USD)</div>
          <div className="value">{formatUsdValue(account.totalBorrowedValueUsd)}</div>
        </div>
        <div className="detail-item">
          <div className="label">Net Value (USD)</div>
          <div className="value">{formatUsdValue(account.netAssetValueUsd)}</div>
        </div>
        <div className="detail-item">
          <div className="label">Rewards (USD)</div>
          <div className="value">{formatUsdValue(account.totalRewardsValueUsd)}</div>
        </div>
      </div>

      {rewards.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <h4
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 0,
                color: "#666",
              }}
            >
              Your Rewards on {chainName}
            </h4>
            <button
              type="button"
              disabled={
                !connectedWalletMatchesViewedAccount ||
                !!claimProgress ||
                isSwitching
              }
              onClick={() => void handleClaim()}
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 12px",
                border: "2px solid #000",
                background:
                  !connectedWalletMatchesViewedAccount || claimProgress || isSwitching
                    ? "#eee"
                    : "#000",
                color:
                  !connectedWalletMatchesViewedAccount || claimProgress || isSwitching
                    ? "#777"
                    : "#fff",
                cursor:
                  !connectedWalletMatchesViewedAccount || claimProgress || isSwitching
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {activeClaimKey === claimAllKey && claimProgress
                ? `Claiming... ${claimProgress.completed}/${claimProgress.total}`
                : "Claim All"}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Unclaimed</th>
                <th>Token Price</th>
                <th>Provider</th>
                <th>Claim Address</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((reward: UserReward, idx: number) => {
                const rewardKey =
                  reward.provider === "merkl"
                    ? `merkl:${chainId}:${reward.chainId}:${reward.claimAddress ?? "none"}`
                    : `${chainId}:${reward.provider}:${reward.token.address}:${reward.claimAddress ?? "none"}`;
                return (
                  <tr key={`${reward.token.address}-${reward.provider}-${idx}`}>
                    <td>{reward.token.symbol}</td>
                    <td>
                      {formatBigInt(
                        BigInt(reward.unclaimed),
                        reward.token.decimals
                      )}
                    </td>
                    <td>
                      {reward.tokenPrice > 0
                        ? `$${reward.tokenPrice.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}`
                        : "-"}
                    </td>
                    <td>{reward.provider}</td>
                    <td>
                      {reward.claimAddress
                        ? <CopyAddress address={reward.claimAddress} />
                        : "-"}
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={
                          !connectedWalletMatchesViewedAccount ||
                          !!claimProgress ||
                          isSwitching
                        }
                        onClick={() => void handleClaim(reward)}
                        style={{
                          fontFamily: "inherit",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "4px 10px",
                          border: "2px solid #000",
                          background:
                            !connectedWalletMatchesViewedAccount || claimProgress || isSwitching
                              ? "#eee"
                              : "#fff",
                          color:
                            !connectedWalletMatchesViewedAccount || claimProgress || isSwitching
                              ? "#777"
                              : "#000",
                          cursor:
                            !connectedWalletMatchesViewedAccount || claimProgress || isSwitching
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {activeClaimKey === rewardKey && claimProgress
                          ? `Claiming... ${claimProgress.completed}/${claimProgress.total}`
                          : "Claim"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subAccountEntries.length === 0 && rewards.length === 0 && (
        <div className="status-message">No positions or rewards on {chainName}.</div>
      )}

      {subAccountEntries.map(([addr, sub]) => {
        const subId = getSubAccountId(account.owner, addr as Address);
        return (
          <div key={addr} style={{ marginBottom: 32 }}>
            <h4 className="section-title" style={{ fontSize: 14 }}>
              Sub-account #{subId} &mdash; <CopyAddress address={addr} />
            </h4>

            <div className="detail-grid" style={{ marginBottom: 16 }}>
              <div className="detail-item">
                <div className="label">Health Factor</div>
                <div className="value">{formatWad(sub.healthFactor)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Current LTV</div>
                <div className="value">{formatWadPercent(sub.currentLTV)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Liquidation LTV</div>
                <div className="value">{formatWadPercent(sub.liquidationLTV)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Multiplier</div>
                <div className="value">{sub.multiplier != null ? `${formatWad(sub.multiplier, 2)}x` : "-"}</div>
              </div>
              <div className="detail-item">
                <div className="label">Net Value (USD)</div>
                <div className="value">{formatUsdValue(sub.netValueUsd)}</div>
              </div>
              <div className="detail-item">
                <div className="label">ROE</div>
                <div className="value"><RoeCell roe={sub.roe} /></div>
              </div>
            </div>

            {sub.positions.length === 0 ? (
              <div className="status-message">No positions</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Vault</th>
                    <th>Asset</th>
                    <th>Deposited</th>
                    <th>Borrowed</th>
                    <th>Borrow Liq. Price (USD)</th>
                    <th>Collateral</th>
                    <th>Controller</th>
                  </tr>
                </thead>
                <tbody>
                  {sub.positions.map(
                    (pos: AccountPosition<VaultEntity>) => (
                      <tr key={pos.vaultAddress}>
                        <td>
                          <Link
                            to={`/vault/${chainId}/${pos.vaultAddress}`}
                          >
                            {pos.vault
                              ? pos.vault.shares.name ||
                                pos.vault.asset.symbol
                              : (
                                <>
                                  <CopyAddress address={pos.vaultAddress} />
                                  {failedVaultDetailsByAddress.has(pos.vaultAddress.toLowerCase()) && (
                                    <ErrorIcon details={failedVaultDetailsByAddress.get(pos.vaultAddress.toLowerCase())} />
                                  )}
                                </>
                              )}
                          </Link>
                        </td>
                        <td>
                          {pos.vault
                            ? pos.vault.asset.symbol
                            : <CopyAddress address={pos.asset} />}
                        </td>
                        <td>
                          <span className="portfolio-amount-tooltip-trigger">
                            {formatBigInt(
                              pos.assets,
                              pos.vault?.asset.decimals ?? 18
                            )}
                            <span className="portfolio-amount-tooltip">
                              <span className="portfolio-amount-tooltip-row portfolio-amount-tooltip-heading">
                                <span>Assets</span>
                                <span>
                                  {formatBigInt(
                                    pos.assets,
                                    pos.vault?.asset.decimals ?? 18,
                                    6
                                  )}{" "}
                                  {pos.vault?.asset.symbol ?? ""}
                                </span>
                              </span>
                              <span className="portfolio-amount-tooltip-divider" />
                              <span className="portfolio-amount-tooltip-row">
                                <span>Shares</span>
                                <span>
                                  {formatBigInt(
                                    pos.shares,
                                    pos.vault?.shares.decimals ?? 18,
                                    6
                                  )}{" "}
                                  {pos.vault?.shares.symbol ?? ""}
                                </span>
                              </span>
                            </span>
                          </span>
                        </td>
                        <td>
                          {pos.borrowed > 0n
                            ? formatBigInt(
                                pos.borrowed,
                                pos.vault?.asset.decimals ?? 18
                              )
                            : "-"}
                        </td>
                        <td>{formatPriceUsd(pos.borrowLiquidationPriceUsd)}</td>
                        <td>{pos.isCollateral ? "Yes" : "No"}</td>
                        <td>{pos.isController ? "Yes" : "No"}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}

            {sub.positions.some(
              (p: AccountPosition<VaultEntity>) => p.liquidity
            ) && (
              <>
                <h4
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 8,
                    color: "#666",
                  }}
                >
                  Liquidity / Health
                </h4>
                <table>
                  <thead>
                    <tr>
                      <th>Borrow Vault</th>
                      <th>Days to Liquidation</th>
                      <th>Borrow Liq. Price (USD)</th>
                      <th>Collaterals</th>
                      <th>Collateral Liq. Prices (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sub.positions
                      .filter(
                        (p: AccountPosition<VaultEntity>) => p.liquidity
                      )
                      .map((p: AccountPosition<VaultEntity>) => {
                        const liq = p.liquidity!;
                        const collLiqPricesUsd = p.collateralLiqiidationPricesUsd;
                        return (
                          <tr key={`liq-${p.vaultAddress}`}>
                            <td>
                              {p.vault
                                ? p.vault.shares.name ||
                                  p.vault.asset.symbol
                                : (
                                  <>
                                    <CopyAddress address={p.vaultAddress} />
                                    {failedVaultDetailsByAddress.has(p.vaultAddress.toLowerCase()) && (
                                      <ErrorIcon details={failedVaultDetailsByAddress.get(p.vaultAddress.toLowerCase())} />
                                    )}
                                  </>
                                )}
                            </td>
                            <td>{String(liq.daysToLiquidation)}</td>
                            <td>{formatPriceUsd(p.borrowLiquidationPriceUsd)}</td>
                            <td>
                              {liq.collaterals.map((c, i) => (
                                <span key={c.address}>
                                  {i > 0 && ", "}
                                  {c.vault
                                    ? c.vault.shares.name ||
                                      c.vault.asset.symbol
                                    : (
                                      <>
                                        <CopyAddress address={c.address} />
                                        {failedVaultDetailsByAddress.has(c.address.toLowerCase()) && (
                                          <ErrorIcon details={failedVaultDetailsByAddress.get(c.address.toLowerCase())} />
                                        )}
                                      </>
                                    )}
                                </span>
                              ))}
                            </td>
                            <td>
                              {liq.collaterals.map((c, i) => (
                                <span key={c.address}>
                                  {i > 0 && ", "}
                                  {collLiqPricesUsd?.[c.address] != null
                                    ? formatPriceUsd(collLiqPricesUsd[c.address])
                                    : "-"}
                                </span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
