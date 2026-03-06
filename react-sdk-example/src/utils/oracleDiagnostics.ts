import { getAddress, isAddress } from "viem";

export type AdapterMetadataMap = Record<string, Record<string, unknown>>;
export type TokenSymbolMap = Record<string, string>;

export type CollateralAdapterContext = {
  address: string;
  vault?: { asset: { address: string } };
  oraclePriceRaw?: { amountOutMid?: bigint };
  oracleAdapters?: Array<{ oracle: string; base: string; quote: string }>;
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
  unitOfAccountAddress: string;
  metadataMap: AdapterMetadataMap | undefined;
  tokenSymbolMap: TokenSymbolMap | undefined;
}): string | undefined {
  const { chainId, collateral, unitOfAccountAddress, metadataMap, tokenSymbolMap } = args;
  const adapterPriceUnavailable = (collateral.oraclePriceRaw?.amountOutMid ?? 0n) <= 0n;
  if (!adapterPriceUnavailable) return undefined;

  const expectedBase = normalizeAddress(collateral.vault?.asset.address ?? collateral.address);
  const expectedQuote = normalizeAddress(unitOfAccountAddress);
  if (!expectedBase || !expectedQuote) return undefined;

  const mismatches: string[] = [];
  for (const adapter of collateral.oracleAdapters ?? []) {
    const metadata = metadataMap?.[adapter.oracle.toLowerCase()];
    const actualBase = normalizeAddress(metadata?.base ?? adapter.base);
    const actualQuote = normalizeAddress(metadata?.quote ?? adapter.quote);
    if (!actualBase || !actualQuote) continue;

    const problems: string[] = [];
    if (actualBase !== expectedBase) {
      problems.push(
        `base ${addressWithSymbol(actualBase, tokenSymbolMap)} (expected ${addressWithSymbol(expectedBase, tokenSymbolMap)})`
      );
    }
    if (actualQuote !== expectedQuote) {
      problems.push(
        `quote ${addressWithSymbol(actualQuote, tokenSymbolMap)} (expected ${addressWithSymbol(expectedQuote, tokenSymbolMap)})`
      );
    }
    if (problems.length === 0) continue;

    mismatches.push(
      `Adapter ${adapter.oracle} pair mismatch on chain ${chainId}: ${problems.join(", ")}`
    );
  }

  if (mismatches.length === 0) return undefined;
  return mismatches.join("\n");
}
