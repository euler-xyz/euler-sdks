import { getAddress, isAddress } from "viem";
import {
  getOracleRouteAdapters,
  type OracleAdapterAssessment,
  type OracleRoute,
} from "@eulerxyz/euler-v2-sdk";

export type AdapterAssessmentMap = Record<string, OracleAdapterAssessment>;
export type TokenSymbolMap = Record<string, string>;

export type CollateralAdapterContext = {
  oraclePriceRaw?: { amountOutMid?: bigint };
  oracleRoute?: OracleRoute;
};

function normalizeAddress(address: unknown): string | undefined {
  if (typeof address !== "string" || !isAddress(address)) return undefined;
  return getAddress(address);
}

export function addressWithSymbol(
  address: string,
  tokenSymbolMap: TokenSymbolMap | undefined
): string {
  const symbol = tokenSymbolMap?.[address.toLowerCase()];
  return symbol ? `${symbol} (${address})` : address;
}

export function getAdapterMismatchDetails(args: {
  chainId: number;
  collateral: CollateralAdapterContext;
  assessmentMap: AdapterAssessmentMap | undefined;
  tokenSymbolMap: TokenSymbolMap | undefined;
}): string | undefined {
  const { chainId, collateral, assessmentMap, tokenSymbolMap } = args;
  const adapterPriceUnavailable = (collateral.oraclePriceRaw?.amountOutMid ?? 0n) <= 0n;
  if (!adapterPriceUnavailable) return undefined;

  const mismatches: string[] = [];
  for (const adapter of getOracleRouteAdapters(collateral.oracleRoute)) {
    const assessment = assessmentMap?.[adapter.oracle.toLowerCase()];
    const config = assessment?.recognized ? assessment.config : undefined;
    const assessedBase = normalizeAddress(config?.base);
    const assessedQuote = normalizeAddress(config?.quote);
    const routeBase = normalizeAddress(adapter.base);
    const routeQuote = normalizeAddress(adapter.quote);
    if (!assessedBase || !assessedQuote || !routeBase || !routeQuote) continue;

    const pairMatches =
      (assessedBase === routeBase && assessedQuote === routeQuote) ||
      (assessedBase === routeQuote && assessedQuote === routeBase);
    if (pairMatches) continue;

    mismatches.push(
      `Adapter ${adapter.oracle} pair mismatch on chain ${chainId}: assessment reports ${addressWithSymbol(assessedBase, tokenSymbolMap)} / ${addressWithSymbol(assessedQuote, tokenSymbolMap)}, but the route step uses ${addressWithSymbol(routeBase, tokenSymbolMap)} / ${addressWithSymbol(routeQuote, tokenSymbolMap)}`
    );
  }

  if (mismatches.length === 0) return undefined;
  return mismatches.join("\n");
}
