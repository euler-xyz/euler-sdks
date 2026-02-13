import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../queries/useAccountQueries.ts";
import { useSDK } from "../context/SdkContext.tsx";
import { TokenIcon } from "../components/TokenIcon.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { HealthBadge } from "../components/HealthBadge.tsx";
import { formatBigInt, shortenAddress } from "../utils/format.ts";
import {
  getSubAccountId,
  type VaultEntity,
  type AccountPosition,
} from "euler-v2-sdk";

export function PortfolioPage() {
  const { chainId } = useSDK();
  const [input, setInput] = useState("");
  const [address, setAddress] = useState<string | undefined>();
  const { data: account, isLoading, error } = useAccount(chainId, address);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      setAddress(trimmed);
    }
  };

  const subAccounts = account
    ? Object.entries(account.subAccounts)
        .filter(([, sa]) => sa && sa.positions.length > 0)
        .sort(([a], [b]) => {
          const idA = getSubAccountId(account.owner, a as `0x${string}`);
          const idB = getSubAccountId(account.owner, b as `0x${string}`);
          return idA - idB;
        })
    : [];

  return (
    <>
      <h1 className="page-title">Portfolio</h1>

      <form onSubmit={handleSubmit}>
        <div className="portfolio-input-row">
          <input
            className="portfolio-input"
            placeholder="Enter Ethereum address (0x...)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            pattern="^0x[0-9a-fA-F]{40}$"
          />
          <button
            type="submit"
            className="portfolio-btn"
            disabled={!/^0x[0-9a-fA-F]{40}$/.test(input.trim())}
          >
            Look up
          </button>
        </div>
      </form>

      {isLoading && <Spinner />}
      {error && <div className="error-state">Error: {String(error)}</div>}

      {account && (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="stat-card">
              <div className="stat-card-label">Sub-accounts</div>
              <div className="stat-card-value">{subAccounts.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Lockdown Mode</div>
              <div className="stat-card-value">
                {account.isLockdownMode ? (
                  <span className="badge badge-warning">Enabled</span>
                ) : (
                  <span className="badge badge-success">Disabled</span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Permit Disabled</div>
              <div className="stat-card-value">
                {account.isPermitDisabledMode ? (
                  <span className="badge badge-warning">Yes</span>
                ) : (
                  <span className="badge badge-success">No</span>
                )}
              </div>
            </div>
          </div>

          {subAccounts.length === 0 && (
            <div className="empty-state">No positions found for this address</div>
          )}

          {subAccounts.map(([addr, sub]) => {
            if (!sub) return null;
            const subId = getSubAccountId(account.owner, addr as `0x${string}`);

            return (
              <div key={addr} className="sub-account-section">
                <div className="sub-account-header">
                  <span className="sub-account-id">Sub-account #{subId}</span>
                  <span className="sub-account-address">{shortenAddress(addr)}</span>
                </div>

                <table className="vault-table">
                  <thead>
                    <tr>
                      <th>Vault</th>
                      <th>Asset</th>
                      <th className="num">Deposited</th>
                      <th className="num">Borrowed</th>
                      <th>Collateral</th>
                      <th>Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sub.positions.map((pos: AccountPosition<VaultEntity>) => (
                      <tr key={pos.vaultAddress}>
                        <td>
                          <Link to={`/vault/${chainId}/${pos.vaultAddress}`}>
                            {pos.vault
                              ? pos.vault.shares.name || pos.vault.asset.symbol
                              : shortenAddress(pos.vaultAddress)}
                          </Link>
                        </td>
                        <td>
                          <div className="token-cell">
                            <TokenIcon
                              address={pos.vault?.asset.address ?? pos.asset}
                              symbol={pos.vault?.asset.symbol ?? "?"}
                            />
                            <span>
                              {pos.vault?.asset.symbol ?? shortenAddress(pos.asset)}
                            </span>
                          </div>
                        </td>
                        <td className="num">
                          {formatBigInt(
                            pos.assets,
                            pos.vault?.asset.decimals ?? 18,
                          )}
                        </td>
                        <td className="num">
                          {pos.borrowed > 0n
                            ? formatBigInt(
                                pos.borrowed,
                                pos.vault?.asset.decimals ?? 18,
                              )
                            : "--"}
                        </td>
                        <td>
                          {pos.isCollateral ? (
                            <span className="badge badge-success">Yes</span>
                          ) : (
                            <span className="badge badge-neutral">No</span>
                          )}
                        </td>
                        <td>
                          {pos.liquidity ? (
                            <HealthBadge
                              daysToLiquidation={pos.liquidity.daysToLiquidation}
                            />
                          ) : (
                            "--"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
