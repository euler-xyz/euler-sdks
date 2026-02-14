import { getAddress } from "viem";
import type { Address } from "viem";
import type { TokenListItem, TokenlistServiceConfig } from "./tokenlistServiceTypes.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

/** Raw token shape from Euler API GET /v1/tokens response. */
interface ApiToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  groups?: string[];
  metadata?: TokenListItem["metadata"];
  coingeckoId?: string;
}

export interface ITokenlistService {
  loadTokenlist(chainId: number): Promise<TokenListItem[]>;
  getToken(chainId: number, asset: Address): TokenListItem | undefined;
  isLoaded(chainId: number): boolean;
}

export class TokenlistService implements ITokenlistService {
  private readonly config: TokenlistServiceConfig;
  private readonly cache = new Map<number, TokenListItem[]>();

  constructor(config: TokenlistServiceConfig, buildQuery?: BuildQueryFn) {
    this.config = config;
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryTokenList = async (
    url: string
  ): Promise<ApiToken[]> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch token list: ${response.status} ${response.statusText}`
      );
    }
    const raw = (await response.json()) as ApiToken[];
    if (!Array.isArray(raw)) {
      throw new Error(`Invalid token list response: expected array`);
    }
    return raw;
  };

  setQueryTokenList(fn: typeof this.queryTokenList): void {
    this.queryTokenList = fn;
  }

  async loadTokenlist(chainId: number): Promise<TokenListItem[]> {
    const url = `${this.config.apiBaseUrl.replace(/\/$/, "")}/v1/tokens?chainId=${chainId}`;
    const raw = await this.queryTokenList(url);
    const list: TokenListItem[] = raw
      .filter((t) => t?.address)
      .map((t) => ({
        chainId: t.chainId,
        address: getAddress(t.address) as Address,
        name: t.name ?? "",
        symbol: t.symbol ?? "",
        decimals: Number(t.decimals) ?? 0,
        logoURI: t.logoURI ?? "",
        ...(t.groups?.length ? { groups: t.groups } : undefined),
        ...(t.metadata ? { metadata: t.metadata } : undefined),
        ...(t.coingeckoId != null ? { coingeckoId: t.coingeckoId } : undefined),
      }));
    this.cache.set(chainId, list);
    return list;
  }

  getToken(chainId: number, asset: Address): TokenListItem | undefined {
    const list = this.cache.get(chainId);
    if (list === undefined) {
      throw new Error(`Token list for chain ${chainId} is not loaded. Call loadTokenlist(${chainId}) first.`);
    }
    const normalized = getAddress(asset);
    return list.find((t) => getAddress(t.address) === normalized);
  }

  isLoaded(chainId: number): boolean {
    return this.cache.has(chainId);
  }
}
