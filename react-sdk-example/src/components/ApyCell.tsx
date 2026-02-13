import type { VaultRewardInfo } from "euler-v2-sdk";
import { formatPercent } from "../utils/format.ts";

interface ApyCellProps {
  /** Base vault APY as a decimal fraction (e.g. 0.05 = 5%). */
  baseApy: number;
  rewards?: VaultRewardInfo;
}

export function ApyCell({ baseApy, rewards }: ApyCellProps) {
  const rewardsApr = rewards?.totalRewardsApr ?? 0;
  const totalApy = baseApy + rewardsApr;
  const hasRewards = rewardsApr > 0;

  if (!hasRewards) {
    return <>{formatPercent(totalApy)}</>;
  }

  return (
    <span className="apy-with-rewards">
      {formatPercent(totalApy)} ✦
      <span className="apy-tooltip">
        <span className="apy-tooltip-row">
          <span>Base APY</span>
          <span>{formatPercent(baseApy)}</span>
        </span>
        <span className="apy-tooltip-row">
          <span>Rewards APR</span>
          <span>{formatPercent(rewardsApr)}</span>
        </span>
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row apy-tooltip-total">
          <span>Total</span>
          <span>{formatPercent(totalApy)}</span>
        </span>
        {rewards!.campaigns.map((c) => (
          <span className="apy-tooltip-row apy-tooltip-campaign" key={`${c.source}:${c.campaignId}`}>
            <span>{c.rewardTokenSymbol} ({c.source})</span>
            <span>{formatPercent(c.apr)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
