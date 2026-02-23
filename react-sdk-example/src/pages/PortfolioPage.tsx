import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";
import { useAccount as useWagmiAccount, useChainId } from "wagmi";
import { useAccount as useSdkAccount } from "../queries/sdkQueries.ts";
import { getSubAccountId } from "euler-v2-sdk";
import type { Address } from "viem";
import { formatBigInt, formatPriceUsd, formatWad, formatWadPercent } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { RoeCell } from "../components/RoeCell.tsx";
import type { VaultEntity, AccountPosition, UserReward } from "euler-v2-sdk";

// Persist across navigations but not across full page reloads
let lastAddress: string | undefined;

function formatUsdValue(value: bigint | undefined): string {
  if (value === undefined) return "-";
  return formatPriceUsd(value);
}

export function PortfolioPage() {
  const { chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const { address: walletAddress, isConnected } = useWagmiAccount();
  const walletChainId = useChainId();
  const [input, setInput] = useState(lastAddress ?? "");
  const [address, setAddress] = useState<string | undefined>(lastAddress);

  const { data: account, isLoading, error } = useSdkAccount(chainId, address);

  useEffect(() => {
    if (!lastAddress && isConnected && walletAddress) {
      lastAddress = walletAddress;
      setInput(walletAddress);
      setAddress(walletAddress);
    }
  }, [isConnected, walletAddress]);

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
              <h4
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 8,
                  color: "#666",
                }}
              >
                Your Rewards
              </h4>
              <table>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Unclaimed</th>
                    <th>Token Price</th>
                    <th>Provider</th>
                    <th>Claim Address</th>
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
                          <CopyAddress address={reward.claimAddress} />
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
                                  : <CopyAddress address={pos.vaultAddress} />}
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
                                    : <CopyAddress address={p.vaultAddress} />}
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
                                          : <CopyAddress address={c.address} />}
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
