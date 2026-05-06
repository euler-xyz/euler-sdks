import type { SubAccountRoe } from "@eulerxyz/euler-v2-sdk";
import { formatPercentPoints } from "../utils/format.ts";

interface RoeCellProps {
  roe: SubAccountRoe | undefined;
}

export function RoeCell({ roe }: RoeCellProps) {
  if (!roe) return <>-</>;

  const hasRewards = roe.rewards !== 0;
  const hasIntrinsic = roe.intrinsicApy !== 0;

  return (
    <span className="apy-with-rewards">
      {formatPercentPoints(roe.total)}{hasRewards ? " ✦" : ""}
      <span className="apy-tooltip">
        <span className="apy-tooltip-row apy-tooltip-heading">
          <span>ROE Breakdown</span>
        </span>
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row">
          <span>Lending & borrowing APY</span>
          <span>{formatPercentPoints(roe.lending + roe.borrowing)}</span>
        </span>
        {hasIntrinsic && (
          <span className="apy-tooltip-row">
            <span>Intrinsic APY</span>
            <span>{roe.intrinsicApy > 0 ? "+ " : "- "}{formatPercentPoints(Math.abs(roe.intrinsicApy))}</span>
          </span>
        )}
        {hasRewards && (
          <span className="apy-tooltip-row">
            <span>Rewards APY</span>
            <span>{roe.rewards > 0 ? "+ " : "- "}{formatPercentPoints(Math.abs(roe.rewards))}</span>
          </span>
        )}
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row apy-tooltip-total">
          <span>Return on equity</span>
          <span>= {formatPercentPoints(roe.total)}</span>
        </span>
      </span>
    </span>
  );
}
