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
import { queryClient, useAccountWithDiagnostics } from "../queries/sdkQueries.ts";
import { getSubAccountId } from "euler-v2-sdk";
import { getAddress, type Address } from "viem";
import { formatBigInt, formatPriceUsd, formatWad, formatWadPercent } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { RoeCell } from "../components/RoeCell.tsx";
import { ErrorIcon } from "../components/ErrorIcon.tsx";
import { RawEntityDialog } from "../components/RawEntityDialog.tsx";
import type { VaultEntity, AccountPosition, UserReward } from "euler-v2-sdk";
import { executePlanWithProgress, type PlanProgress } from "../utils/txExecutor.ts";

// Persist across navigations but not across full page reloads
let lastAddress: string | undefined;

function formatUsdValue(value: bigint | undefined): string {
  if (value === undefined) return "-";
  return formatPriceUsd(value);
}

export function PortfolioPage() {
  const { sdk, chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const { address: walletAddress, isConnected } = useWagmiAccount();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [input, setInput] = useState(lastAddress ?? "");
  const [address, setAddress] = useState<string | undefined>(lastAddress);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [claimProgress, setClaimProgress] = useState<PlanProgress | null>(null);
  const [activeClaimKey, setActiveClaimKey] = useState<string | null>(null);

  const { data, isLoading, error } = useAccountWithDiagnostics(chainId, address);
  const account = data?.account;
  const failedVaults = data?.failedVaults ?? [];
  const failedVaultDetailsByAddress = useMemo(() => {
    const map = new Map<string, string>();
    for (const failed of failedVaults) {
      if (!failed.address) continue;
      map.set(failed.address.toLowerCase(), failed.details);
    }
    return map;
  }, [failedVaults]);

  useEffect(() => {
    if (!lastAddress && isConnected && walletAddress) {
      lastAddress = walletAddress;
      setInput(walletAddress);
      setAddress(walletAddress);
    }
  }, [isConnected, walletAddress]);

  const connectedWalletMatchesViewedAccount =
    !!walletAddress &&
    !!account &&
    getAddress(walletAddress) === getAddress(account.owner);

  const resetClaimMessages = () => {
    setClaimError(null);
    setClaimSuccess(null);
  };

  const invalidateRewardQueries = async (accountAddress: Address) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["account", chainId, accountAddress] }),
      queryClient.invalidateQueries({ queryKey: ["accountWithDiagnostics", chainId, accountAddress] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryMerklUserRewards"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryBrevisUserProofs"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryFuulTotals"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryFuulClaimChecks"] }),
      queryClient.invalidateQueries({ queryKey: ["sdk", "queryV3RewardsBreakdown"] }),
    ]);
  };

  const ensureWalletReady = async (): Promise<boolean> => {
    if (!walletAddress) {
      throw new Error("Connect a wallet to claim rewards.");
    }
    if (!walletClient || !publicClient) {
      throw new Error("Wallet client not ready.");
    }
    if (walletChainId !== chainId) {
      if (!switchChain) {
        throw new Error(`Switch your wallet to chain ${chainId} before claiming.`);
      }
      await switchChain({ chainId });
      return false;
    }
    if (!account) {
      throw new Error("Account data not loaded.");
    }
    if (getAddress(walletAddress) !== getAddress(account.owner)) {
      throw new Error("Connect the same wallet as the viewed account to claim rewards.");
    }
    return true;
  };

  const handleClaim = async (reward?: UserReward) => {
    resetClaimMessages();

    try {
      const ready = await ensureWalletReady();
      if (!ready || !walletAddress || !walletClient || !publicClient || !account) return;

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
        ? "all"
        : reward.provider === "merkl"
          ? `merkl:${reward.chainId}:${reward.claimAddress ?? "none"}`
          : `${reward.provider}:${reward.token.address}:${reward.claimAddress ?? "none"}`;
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

      await invalidateRewardQueries(walletAddress as Address);
      setClaimSuccess(
        reward
          ? reward.provider === "merkl" && claimRewards.length > 1
            ? `Claimed ${claimRewards.length} Merkl rewards in one transaction.`
            : `Claimed ${reward.token.symbol} rewards.`
          : "Claimed all rewards."
      );
    } catch (err) {
      setClaimError(String(err));
    } finally {
      setClaimProgress(null);
      setActiveClaimKey(null);
    }
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

  const subAccountEntries = account
    ? Object.entries(account.subAccounts)
        .filter(
          (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
            entry[1] !== undefined
        )
        .sort(([a], [b]) => {
          const idA = getSubAccountId(account.owner, a as Address);
          const idB = getSubAccountId(account.owner, b as Address);
          return idA - idB;
        })
    : [];

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
          Enter an Ethereum address to view its Euler V2 positions.
        </div>
      )}

      {isConnected && walletChainId !== chainId && (
        <div className="wallet-chain-warning">
          Wallet is connected to a different chain than the app. Switch the app chain
          or use the wallet switch button in the header.
        </div>
      )}

      {address && isLoading && (
        <div className="status-message">Loading account...</div>
      )}

      {address && error && (
        <div className="error-message">Error: {String(error)}</div>
      )}

      {account && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <RawEntityDialog title="Raw Account Entity" entity={account} />
          </div>
          <div className="detail-grid" style={{ marginBottom: 24 }}>
            <div className="detail-item">
              <div className="label">Owner</div>
              <div className="value">{account.owner}</div>
            </div>
            <div className="detail-item">
              <div className="label">Sub-accounts</div>
              <div className="value">{subAccountEntries.length}</div>
            </div>
            <div className="detail-item">
              <div className="label">Lockdown Mode</div>
              <div className="value">
                {account.isLockdownMode ? "Yes" : "No"}
              </div>
            </div>
            <div className="detail-item">
              <div className="label">Permit Disabled</div>
              <div className="value">
                {account.isPermitDisabledMode ? "Yes" : "No"}
              </div>
            </div>
            <div className="detail-item">
              <div className="label">Total Supplied (USD)</div>
              <div className="value">{formatUsdValue(account.totalSuppliedValueUsd)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Total Borrowed (USD)</div>
              <div className="value">{formatUsdValue(account.totalBorrowedValueUsd)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Net Asset Value (USD)</div>
              <div className="value">{formatUsdValue(account.netAssetValueUsd)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Your Rewards (USD)</div>
              <div className="value">{formatUsdValue(account.totalRewardsValueUsd)}</div>
            </div>
          </div>

          {account.userRewards && account.userRewards.length > 0 && (
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
                  Your Rewards
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
                  {activeClaimKey === "all" && claimProgress
                    ? `Claiming... ${claimProgress.completed}/${claimProgress.total}`
                    : "Claim All"}
                </button>
              </div>
              {!connectedWalletMatchesViewedAccount && (
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
                  {account.userRewards.map(
                    (reward: UserReward, idx: number) => (
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
                            {activeClaimKey ===
                              (reward.provider === "merkl"
                                ? `merkl:${reward.chainId}:${reward.claimAddress ?? "none"}`
                                : `${reward.provider}:${reward.token.address}:${reward.claimAddress ?? "none"}`) &&
                            claimProgress
                              ? `Claiming... ${claimProgress.completed}/${claimProgress.total}`
                              : "Claim"}
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {subAccountEntries.length === 0 && (
            <div className="status-message">
              No active sub-accounts found.
            </div>
          )}

          {subAccountEntries.map(([addr, sub]) => {
            const subId = getSubAccountId(account.owner, addr as Address);
            return (
              <div key={addr} style={{ marginBottom: 32 }}>
                <h3 className="section-title">
                  Sub-account #{subId} &mdash; <CopyAddress address={addr} />
                </h3>

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
                              {formatBigInt(
                                pos.assets,
                                pos.vault?.asset.decimals ?? 18
                              )}
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
                              <td>
                                {String(liq.daysToLiquidation)}
                              </td>
                              <td>{formatPriceUsd(p.borrowLiquidationPriceUsd)}</td>
                              <td>
                                {liq.collaterals
                                  .map((c, i) => (
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
                                {liq.collaterals
                                  .map((c, i) => (
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
        </>
      )}
    </>
  );
}
