import { formatUnits } from "viem";

export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatBigInt(
  value: bigint,
  decimals: number,
  displayDecimals = 2,
): string {
  if (value === 0n) return "0";
  const formatted = formatUnits(value, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.01 && num > 0) return "<0.01";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(displayDecimals);
}

export function formatAPY(apyString: string): string {
  const num = parseFloat(apyString) * 100;
  if (isNaN(num)) return "--";
  if (num === 0) return "0.00%";
  if (num < 0.01 && num > 0) return "<0.01%";
  return `${num.toFixed(2)}%`;
}

export function formatAPYNumber(apy: number | undefined): string {
  if (apy === undefined) return "--";
  const pct = apy * 100;
  if (pct === 0) return "0.00%";
  if (pct < 0.01 && pct > 0) return "<0.01%";
  return `${pct.toFixed(2)}%`;
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatPriceUsd(priceWad: bigint): string {
  const num = parseFloat(formatUnits(priceWad, 18));
  if (num === 0) return "$0.00";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num < 0.01) return "<$0.01";
  return `$${num.toFixed(2)}`;
}

export function formatUsd(num: number): string {
  if (num === 0) return "$0.00";
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num < 0.01) return "<$0.01";
  return `$${num.toFixed(2)}`;
}
