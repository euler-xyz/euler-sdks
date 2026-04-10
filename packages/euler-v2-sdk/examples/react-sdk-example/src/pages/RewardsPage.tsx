import { useSDK } from "../context/SdkContext.tsx";
import { useChainRewards } from "../queries/sdkQueries.ts";
import { formatPercent } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";

export function RewardsPage() {
  const { chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const { data: entries, isLoading, error } = useChainRewards();

  if (sdkLoading)
    return <div className="status-message">Initializing SDK...</div>;
  if (sdkError)
    return <div className="error-message">SDK Error: {sdkError}</div>;
  if (isLoading)
    return <div className="status-message">Loading rewards for chain {chainId}...</div>;
  if (error)
    return <div className="error-message">Error: {String(error)}</div>;
  if (!entries || entries.length === 0)
    return <div className="status-message">No reward campaigns found for chain {chainId}</div>;

  return (
    <>
      <h2 className="section-title">
        Reward Campaigns &mdash; Chain {chainId} ({entries.length} vaults)
      </h2>

      <table>
        <thead>
          <tr>
            <th>Vault</th>
            <th>Total Rewards APR</th>
            <th>Campaigns</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ vaultAddress, info }) => (
            <tr key={vaultAddress}>
              <td><CopyAddress address={vaultAddress} /></td>
              <td>{formatPercent(info.totalRewardsApr)}</td>
              <td>{info.campaigns.length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title">Campaign Details</h2>

      {entries.map(({ vaultAddress, info }) => (
        <details key={vaultAddress} className="rewards-vault-details">
          <summary>
            <CopyAddress address={vaultAddress} /> &mdash;{" "}
            {formatPercent(info.totalRewardsApr)} ({info.campaigns.length}{" "}
            campaign{info.campaigns.length !== 1 ? "s" : ""})
          </summary>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Action</th>
                <th>Reward Token</th>
                <th>Token Address</th>
                <th>APR</th>
                <th>Daily Rewards</th>
                <th>Ends</th>
                <th>Campaign ID</th>
              </tr>
            </thead>
            <tbody>
              {info.campaigns.map((c) => (
                <tr key={`${c.source}:${c.campaignId}`}>
                  <td>{c.source}</td>
                  <td>{c.action}</td>
                  <td>{c.rewardTokenSymbol}</td>
                  <td>
                    {c.rewardTokenAddress
                      ? <CopyAddress address={c.rewardTokenAddress} />
                      : "-"}
                  </td>
                  <td>{formatPercent(c.apr)}</td>
                  <td>{c.dailyRewards?.toLocaleString() ?? "-"}</td>
                  <td>
                    {c.endTimestamp
                      ? new Date(c.endTimestamp * 1000).toLocaleDateString()
                      : "-"}
                  </td>
                  <td style={{ fontSize: 10, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.campaignId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </>
  );
}
