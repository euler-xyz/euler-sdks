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

export function formatAPY(apy: string | number): string {
  return formatPercentPoints(Number(apy));
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPercentPoints(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatWad(value: bigint | undefined, displayDecimals = 4): string {
  if (value === undefined) return "-";
  const num = Number(formatUnits(value, 18));
  if (num === 0) return "0";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: displayDecimals,
  });
}

export function formatWadPercent(value: bigint | undefined): string {
  if (value === undefined) return "-";
  const num = Number(formatUnits(value, 18)) * 100;
  return `${num.toFixed(2)}%`;
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

export function formatPriceInUnit(
  price: bigint | undefined,
  decimals: number,
  symbol: string
): string {
  if (price === undefined) return "-";
  const formatted = Number(formatUnits(price, decimals));
  if (formatted === 0) return `0 ${symbol}`;
  if (formatted < 0.0001) return `<0.0001 ${symbol}`;
  return `${formatted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} ${symbol}`;
}
