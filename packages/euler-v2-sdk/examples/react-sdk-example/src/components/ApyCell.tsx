import type { VaultRewardInfo, IntrinsicApyInfo } from "euler-v2-sdk";
import { formatPercent } from "../utils/format.ts";
import { getIntrinsicApyDecimal, getRewardsAprByAction } from "../utils/apy.ts";

interface ApyCellProps {
  /** Base vault APY as a decimal fraction (e.g. 0.05 = 5%). */
  baseApy: number;
  rewards?: VaultRewardInfo;
  intrinsicApy?: IntrinsicApyInfo;
  action?: "LEND" | "BORROW";
}

export function ApyCell({
  baseApy,
  rewards,
  intrinsicApy,
  action = "LEND",
}: ApyCellProps) {
  const rewardsApr =
    action === "BORROW"
      ? getRewardsAprByAction(rewards, "BORROW")
      : getRewardsAprByAction(rewards, "LEND");
  const intrinsicApyDecimal = getIntrinsicApyDecimal(intrinsicApy);
  const totalApy =
    action === "BORROW"
      ? baseApy + intrinsicApyDecimal - rewardsApr
      : baseApy + rewardsApr + intrinsicApyDecimal;
  const hasExtras = rewardsApr > 0 || intrinsicApyDecimal > 0;
  const rewardsLabel = action === "BORROW" ? "Borrow Rewards APR" : "Rewards APR";

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
            <span>{rewardsLabel}</span>
            <span>{action === "BORROW" ? `-${formatPercent(rewardsApr)}` : formatPercent(rewardsApr)}</span>
          </span>
        )}
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row apy-tooltip-total">
          <span>Total</span>
          <span>{formatPercent(totalApy)}</span>
        </span>
        {rewards?.campaigns
          .filter((c) => c.action === action)
          .map((c) => (
          <span className="apy-tooltip-row apy-tooltip-campaign" key={`${c.source}:${c.campaignId}`}>
            <span>{c.rewardTokenSymbol} ({c.source})</span>
            <span>{action === "BORROW" ? `-${formatPercent(c.apr)}` : formatPercent(c.apr)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
