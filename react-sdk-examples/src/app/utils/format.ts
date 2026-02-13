import { formatUnits } from "viem";

export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatBigInt(
  value: bigint,
  decimals: number,
  displayDecimals = 2
): string {
  const formatted = formatUnits(value, decimals);
  const num = Number(formatted);
  if (num === 0) return "0";
  if (num < 0.01) return "<0.01";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  });
}

export function formatAPY(apyString: string): string {
  const apy = Number(apyString) * 100;
  return `${apy.toFixed(2)}%`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPriceUsd(priceWad: bigint | undefined): string {
  if (priceWad === undefined) return "-";
  const price = Number(formatUnits(priceWad, 18));
  if (price === 0) return "$0";
  if (price < 0.01) return "<$0.01";
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
