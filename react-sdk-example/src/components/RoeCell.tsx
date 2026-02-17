import type { SubAccountRoe } from "euler-v2-sdk";
import { formatPercent } from "../utils/format.ts";

interface RoeCellProps {
  roe: SubAccountRoe | undefined;
}

export function RoeCell({ roe }: RoeCellProps) {
  if (!roe) return <>-</>;

  const hasRewards = roe.rewards !== 0;
  const hasIntrinsic = roe.intrinsicApy !== 0;

  return (
    <span className="apy-with-rewards">
      {formatPercent(roe.total)}
      <span className="apy-tooltip">
        <span className="apy-tooltip-row apy-tooltip-heading">
          <span>ROE Breakdown</span>
        </span>
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row">
          <span>Lending & borrowing APY</span>
          <span>{formatPercent(roe.lending + roe.borrowing)}</span>
        </span>
        {hasIntrinsic && (
          <span className="apy-tooltip-row">
            <span>Intrinsic APY</span>
            <span>{roe.intrinsicApy > 0 ? "+ " : "- "}{formatPercent(Math.abs(roe.intrinsicApy))}</span>
          </span>
        )}
        {hasRewards && (
          <span className="apy-tooltip-row">
            <span>Rewards APY</span>
            <span>{roe.rewards > 0 ? "+ " : "- "}{formatPercent(Math.abs(roe.rewards))}</span>
          </span>
        )}
        <span className="apy-tooltip-divider" />
        <span className="apy-tooltip-row apy-tooltip-total">
          <span>Return on equity</span>
          <span>= {formatPercent(roe.total)}</span>
        </span>
      </span>
    </span>
  );
}
