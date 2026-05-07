import type { VaultRewardInfo, IntrinsicApyInfo } from "@eulerxyz/euler-v2-sdk";
import { formatPercentPoints } from "../utils/format.ts";
import { getIntrinsicApyPercentPoints, getRewardsAprByAction } from "../utils/apy.ts";

interface ApyCellProps {
  /** Base vault APY in percentage points (e.g. 5 = 5%). */
  baseApy: number;
  rewards?: VaultRewardInfo;
  intrinsicApy?: IntrinsicApyInfo;
  action?: "LEND" | "BORROW";
}

export function ApyCell({
  baseApy,
  rewards,
  intrinsicApy: intrinsicApyInfo,
  action = "LEND",
}: ApyCellProps) {
  const rewardsApr =
    action === "BORROW"
      ? getRewardsAprByAction(rewards, "BORROW")
      : getRewardsAprByAction(rewards, "LEND");
  const intrinsicApy = getIntrinsicApyPercentPoints(intrinsicApyInfo);
  const totalApy =
    action === "BORROW"
      ? baseApy + intrinsicApy - rewardsApr
      : baseApy + rewardsApr + intrinsicApy;
  const hasExtras = rewardsApr > 0 || intrinsicApy > 0;
  const rewardsLabel = action === "BORROW" ? "Borrow Rewards APR" : "Rewards APR";

  if (!hasExtras) {
    return <>{formatPercentPoints(totalApy)}</>;
  }

  return (
    <span className="apy-with-rewards">
      {formatPercentPoints(totalApy)} ✦
      <span className="apy-tooltip">
        <span className="apy-tooltip-row">
          <span>Base APY</span>
          <span>{formatPercentPoints(baseApy)}</span>
        </span>
        {intrinsicApy > 0 && (
          <span className="apy-tooltip-row">
            <span>Intrinsic APY ({intrinsicApyInfo!.provider})</span>
            <span>{formatPercentPoints(intrinsicApy)}</span>
          </span>
        )}
        {rewardsApr > 0 && (
          <span className="apy-tooltip-row">
            <span>{rewardsLabel}</span>
            <span>{action === "BORROW" ? `-${formatPercentPoints(rewardsApr)}` : formatPercentPoints(rewardsApr)}</span>
          </span>
        )}
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row apy-tooltip-total">
          <span>Total</span>
          <span>{formatPercentPoints(totalApy)}</span>
        </span>
        {rewards?.campaigns
          .filter((c) => c.action === action)
          .map((c) => (
          <span className="apy-tooltip-row apy-tooltip-campaign" key={`${c.source}:${c.campaignId}`}>
            <span>{c.rewardTokenSymbol} ({c.source})</span>
            <span>{action === "BORROW" ? `-${formatPercentPoints(c.apr * 100)}` : formatPercentPoints(c.apr * 100)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
