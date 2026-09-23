import { getAddress } from "viem";
import type { Address } from "viem";
import type {
	TokenListItem,
	TokenlistServiceConfig,
} from "./tokenlistServiceTypes.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

/** Raw token shape from Euler API GET /v3/tokens response. */
interface ApiToken {
	chainId: number;
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	logoURI?: string;
	groups?: string[];
	tags?: string[];
	metadata?: TokenListItem["metadata"];
	coingeckoId?: string;
}

interface ApiTokenListPage {
	data: ApiToken[];
	meta?: {
		total?: number | string;
		offset?: number | string;
		limit?: number | string;
	};
}

type ApiTokenListResponse = ApiToken[] | ApiTokenListPage;

export interface ITokenlistService {
	loadTokenlist(chainId: number): Promise<TokenListItem[]>;
	getToken(chainId: number, asset: Address): TokenListItem | undefined;
	isLoaded(chainId: number): boolean;
}

function setSearchParam(url: string, key: string, value: string): string {
	const hashIndex = url.indexOf("#");
	const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
	const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
	const queryIndex = withoutHash.indexOf("?");
	const base =
		queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
	const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
	const params = new URLSearchParams(query);
	params.set(key, value);
	const serialized = params.toString();
	return `${base}${serialized ? `?${serialized}` : ""}${hash}`;
}

async function fetchTokenListPage(url: string): Promise<ApiTokenListResponse> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch token list: ${response.status} ${response.statusText}`,
		);
	}
	const raw = (await response.json()) as ApiTokenListResponse;
	if (Array.isArray(raw)) return raw;
	if (raw && Array.isArray(raw.data)) return raw;
	throw new Error(`Invalid token list response: expected array or data array`);
}

function nowMs(): number {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class TokenlistService implements ITokenlistService {
	private readonly config: TokenlistServiceConfig;
	private readonly cache = new Map<number, TokenListItem[]>();

	constructor(config: TokenlistServiceConfig, buildQuery?: BuildQueryFn) {
		this.config = config;
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	queryTokenList = async (url: string): Promise<ApiToken[]> => {
		const firstPage = await fetchTokenListPage(url);
		if (Array.isArray(firstPage)) return firstPage;

		const tokens = [...firstPage.data];
		const total = Number(firstPage.meta?.total);
		const limit = Number(firstPage.meta?.limit);
		const firstOffset = Number(firstPage.meta?.offset ?? 0);
		if (
			!Number.isFinite(total) ||
			!Number.isFinite(limit) ||
			limit <= 0 ||
			firstOffset + firstPage.data.length >= total
		) {
			return tokens;
		}

		for (
			let offset = firstOffset + limit;
			offset < total;
			offset += limit
		) {
			const page = await fetchTokenListPage(
				setSearchParam(url, "offset", String(offset)),
			);
			if (Array.isArray(page)) {
				throw new Error(`Invalid token list response: expected paginated data`);
			}
			tokens.push(...page.data);
		}
		return tokens;
	};

	setQueryTokenList(fn: typeof this.queryTokenList): void {
		this.queryTokenList = fn;
	}

	async loadTokenlist(chainId: number): Promise<TokenListItem[]> {
		const url = this.config.getTokenListUrl(chainId);
		const startedAt = nowMs();
		console.info(
			`[sdk-tokenlist] loadTokenlist start chainId=${chainId} url=${url}`,
		);
		const raw = await this.queryTokenList(url);
		const fetchedAt = nowMs();
		const list: TokenListItem[] = raw
			.filter((t) => t?.address)
			.map((t) => {
				const tags = Array.isArray(t.tags)
					? t.tags.filter((tag): tag is string => typeof tag === "string")
					: [];
				return {
					chainId: t.chainId,
					address: getAddress(t.address) as Address,
					name: t.name ?? "",
					symbol: t.symbol ?? "",
					decimals: Number(t.decimals) ?? 0,
					logoURI: t.logoURI ?? "",
					...(t.groups?.length ? { groups: t.groups } : undefined),
					...(tags.length ? { tags } : undefined),
					...(t.metadata ? { metadata: t.metadata } : undefined),
					...(t.coingeckoId != null ? { coingeckoId: t.coingeckoId } : undefined),
				};
			});
		this.cache.set(chainId, list);
		const finishedAt = nowMs();
		console.info(
			`[sdk-tokenlist] loadTokenlist done chainId=${chainId} raw=${raw.length} tokens=${list.length} fetchMs=${(fetchedAt - startedAt).toFixed(1)} totalMs=${(finishedAt - startedAt).toFixed(1)}`,
		);
		return list;
	}

	getToken(chainId: number, asset: Address): TokenListItem | undefined {
		const list = this.cache.get(chainId);
		if (list === undefined) {
			throw new Error(
				`Token list for chain ${chainId} is not loaded. Call loadTokenlist(${chainId}) first.`,
			);
		}
		const normalized = getAddress(asset);
		return list.find((t) => getAddress(t.address) === normalized);
	}

	isLoaded(chainId: number): boolean {
		return this.cache.has(chainId);
	}
}
