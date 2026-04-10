import type { VaultRewardInfo, IntrinsicApyInfo } from "euler-v2-sdk";
import { formatPercent } from "../utils/format.ts";

interface ApyCellProps {
  /** Base vault APY as a decimal fraction (e.g. 0.05 = 5%). */
  baseApy: number;
  rewards?: VaultRewardInfo;
  intrinsicApy?: IntrinsicApyInfo;
}

export function ApyCell({ baseApy, rewards, intrinsicApy }: ApyCellProps) {
  const rewardsApr = rewards?.totalRewardsApr ?? 0;
  const intrinsicApyDecimal = intrinsicApy ? intrinsicApy.apy / 100 : 0;
  const totalApy = baseApy + rewardsApr + intrinsicApyDecimal;
  const hasExtras = rewardsApr > 0 || intrinsicApyDecimal > 0;

  if (!hasExtras) {
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
        {intrinsicApyDecimal > 0 && (
          <span className="apy-tooltip-row">
            <span>Intrinsic APY ({intrinsicApy!.provider})</span>
            <span>{formatPercent(intrinsicApyDecimal)}</span>
          </span>
        )}
        {rewardsApr > 0 && (
          <span className="apy-tooltip-row">
            <span>Rewards APR</span>
            <span>{formatPercent(rewardsApr)}</span>
          </span>
        )}
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row apy-tooltip-total">
          <span>Total</span>
          <span>{formatPercent(totalApy)}</span>
        </span>
        {rewards?.campaigns.map((c) => (
          <span className="apy-tooltip-row apy-tooltip-campaign" key={`${c.source}:${c.campaignId}`}>
            <span>{c.rewardTokenSymbol} ({c.source})</span>
            <span>{formatPercent(c.apr)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
