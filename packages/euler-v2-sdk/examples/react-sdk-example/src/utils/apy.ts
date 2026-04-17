import type { EVault, IntrinsicApyInfo, VaultRewardInfo } from "@eulerxyz/euler-v2-sdk";

type RewardAction = "LEND" | "BORROW";

export function getRewardsAprByAction(
  rewards: VaultRewardInfo | undefined,
  action: RewardAction,
): number {
  if (!rewards?.campaigns?.length) return 0;

  return rewards.campaigns.reduce((total, campaign) => {
    if (campaign.action !== action || !Number.isFinite(campaign.apr)) {
      return total;
    }

    return total + campaign.apr;
  }, 0);
}

export function getIntrinsicApyDecimal(
  intrinsicApy: IntrinsicApyInfo | undefined,
): number {
  return intrinsicApy ? intrinsicApy.apy / 100 : 0;
}

export function getEffectiveSupplyApy(vault: EVault): number {
  return (
    Number(vault.interestRates.supplyAPY) +
    getRewardsAprByAction(vault.rewards, "LEND") +
    getIntrinsicApyDecimal(vault.intrinsicApy)
  );
}

export function getEffectiveBorrowApy(vault: EVault): number {
  return (
    Number(vault.interestRates.borrowAPY) +
    getIntrinsicApyDecimal(vault.intrinsicApy) -
    getRewardsAprByAction(vault.rewards, "BORROW")
  );
}
