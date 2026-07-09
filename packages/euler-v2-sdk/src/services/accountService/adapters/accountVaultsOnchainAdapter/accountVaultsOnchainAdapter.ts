import {
	type Address,
	type Hex,
	type PublicClient,
	concatHex,
	createPublicClient,
	decodeAbiParameters,
	encodeAbiParameters,
	getAddress,
	http,
	parseAbiParameters,
} from "viem";
import type { ProviderService } from "../../../providerService/index.js";
import type { DeploymentService } from "../../../deploymentService/index.js";
import type { IAccountVaultsAdapter } from "../accountOnchainAdapter/accountOnchainAdapter.js";
import type { AccountVaults } from "../accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import { ACCOUNT_DISCOVERY_LENS_BYTECODE } from "./generated/accountDiscoveryLens.js";

/**
 * Resolves the set of vaults whose `balanceOf` is brute-forced for deposit
 * discovery on a chain. Consumers (e.g. an app that already knows its verified
 * vault list) can inject this to bound the scan; otherwise the adapter reads the
 * on-chain governed + escrow (+ factory, when `includeDeprecated`) perspectives.
 */
export type ResolveVaultsFn = (chainId: number) => Promise<Address[]>;

export interface AccountVaultsOnchainAdapterConfig {
	/** Bounds the deposit scan to a known vault set. Defaults to the on-chain
	 *  perspectives (see {@link includeDeprecated}). */
	resolveVaults?: ResolveVaultsFn;
	/** When using the built-in perspective resolver, also scan the factory
	 *  perspective so positions in deprecated vaults are discovered (deprecated
	 *  vaults are de-listed from the governed perspective but remain in the
	 *  factory perspective). Defaults to `true`. Ignored when `resolveVaults` is
	 *  provided. */
	includeDeprecated?: boolean;
	/** Inclusive EVC sub-account id range to scan. Defaults to the full 0..255. */
	subAccountRange?: { start: number; end: number };
	/** Upper bound on `balanceOf` probes (sub-accounts × vaults) per eth_call.
	 *  The workload is split into chunks under this size and fired in parallel so
	 *  no single call approaches the provider's eth_call gas ceiling. */
	maxProbesPerCall?: number;
	/** Upper bound on sub-accounts per deployless call. The constructor returns
	 *  two address[][] arrays, so even empty results grow with the sub-account
	 *  count and can hit EVM create return-size limits before gas limits. */
	maxSubAccountsPerCall?: number;
	/** Max concurrent discovery eth_calls per fetch. */
	concurrency?: number;
}

const DEFAULT_SUB_ACCOUNT_RANGE = { start: 0, end: 255 } as const;
// The provider's eth_call gas ceiling is hit somewhere between ~25k and ~50k
// balanceOf probes in a single call; 8k leaves a wide safety margin across
// chains while keeping the chunk count (and thus request fan-out) small.
const DEFAULT_MAX_PROBES_PER_CALL = 8_000;
const DEFAULT_MAX_SUB_ACCOUNTS_PER_CALL = 64;
const DEFAULT_CONCURRENCY = 12;

const DISCOVERY_CTOR_PARAMS = parseAbiParameters(
	"address owner, uint256[] subAccountIds, address[] vaults, address evc",
);
const DISCOVERY_RETURN_PARAMS = parseAbiParameters(
	"address[][] deposits, address[][] borrows",
);
const VERIFIED_ARRAY_PARAMS = parseAbiParameters("address[]");
// verifiedArray() selector — enumerates a perspective's verified vaults.
const VERIFIED_ARRAY_SELECTOR: Hex = "0x8d5e21d3";

interface DiscoveryChunk {
	subAccountIds: number[];
	vaults: Address[];
}

/** Lowercase an address for calldata encoding. viem's strict-checksum
 *  validation inside encodeAbiParameters is unreliable under its checksum LRU
 *  cache; lowercase values sidestep it and encode to the same 20 bytes. */
const lower = (address: Address): Address => address.toLowerCase() as Address;

const chunkArray = <T>(items: readonly T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
};

async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const worker = async () => {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await fn(items[index]!, index);
		}
	};
	const workerCount = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

/**
 * Pure-RPC replacement for {@link AccountVaultsSubgraphAdapter}. Discovers an
 * owner's active sub-accounts and their positions without any subgraph:
 *
 *  - deposits: brute-forces `vault.balanceOf(subAccount)` across a bounded,
 *    verified vault set using a deployless discovery lens (an eth_call with no
 *    `to` and `data = creationCode ++ ctorArgs`; the constructor returns the
 *    result). This is the only reliable way to see a pure savings position,
 *    which leaves no EVC trace.
 *  - borrows: reads `EVC.getControllers(subAccount)` inside the same lens and
 *    keeps controllers with `debtOf > 0` — complete and cheap, independent of
 *    the vault set.
 *
 * The sub-account range × vault set is split into chunks each below the
 * provider's eth_call gas ceiling and fired in parallel, so the whole scan
 * completes in well under a second even for owners with many sub-accounts.
 */
export class AccountVaultsOnchainAdapter implements IAccountVaultsAdapter {
	private readonly subAccountRange: { start: number; end: number };
	private readonly maxProbesPerCall: number;
	private readonly maxSubAccountsPerCall: number;
	private readonly concurrency: number;
	private readonly resolveVaultsFn?: ResolveVaultsFn;
	private readonly includeDeprecated: boolean;

	private readonly discoveryClients = new Map<number, PublicClient>();
	private readonly vaultCache = new Map<number, Promise<Address[]>>();

	constructor(
		private readonly providerService: ProviderService,
		private readonly deploymentService: DeploymentService,
		config: AccountVaultsOnchainAdapterConfig = {},
		buildQuery?: BuildQueryFn,
	) {
		this.subAccountRange = config.subAccountRange ?? DEFAULT_SUB_ACCOUNT_RANGE;
		this.maxProbesPerCall =
			config.maxProbesPerCall ?? DEFAULT_MAX_PROBES_PER_CALL;
		this.maxSubAccountsPerCall =
			config.maxSubAccountsPerCall ?? DEFAULT_MAX_SUB_ACCOUNTS_PER_CALL;
		this.concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
		this.resolveVaultsFn = config.resolveVaults;
		this.includeDeprecated = config.includeDeprecated ?? true;
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	/** Raw deployless eth_call for one discovery chunk. Injectable via buildQuery
	 *  for logging/caching/profiling, matching the SDK's adapter convention. */
	queryDiscoveryChunk = async (
		client: PublicClient,
		deployData: Hex,
	): Promise<Hex> => {
		const result = await client.request({
			method: "eth_call",
			params: [{ data: deployData }, "latest"],
		});
		return result as Hex;
	};

	setQueryDiscoveryChunk(fn: typeof this.queryDiscoveryChunk): void {
		this.queryDiscoveryChunk = fn;
	}

	/** Raw `verifiedArray()` read used by the default vault resolver. */
	queryVerifiedArray = async (
		provider: PublicClient,
		perspective: Address,
	): Promise<readonly Address[]> => {
		const result = await provider.call({
			to: perspective,
			data: VERIFIED_ARRAY_SELECTOR,
		});
		if (!result.data) return [];
		const [addresses] = decodeAbiParameters(
			VERIFIED_ARRAY_PARAMS,
			result.data,
		);
		return addresses as readonly Address[];
	};

	setQueryVerifiedArray(fn: typeof this.queryVerifiedArray): void {
		this.queryVerifiedArray = fn;
	}

	async fetchAccountVaults(
		chainId: number,
		account: Address,
	): Promise<AccountVaults> {
		const owner = getAddress(account);
		const evc = this.deploymentService.getDeployment(chainId).addresses
			.coreAddrs.evc;

		const vaults = await this.getVaults(chainId);
		if (vaults.length === 0) return {};

		const subAccountIds: number[] = [];
		for (let id = this.subAccountRange.start; id <= this.subAccountRange.end; id++)
			subAccountIds.push(id);

		const chunks = this.buildChunks(subAccountIds, vaults);
		const client = this.getDiscoveryClient(chainId);

		const decoded = await mapWithConcurrency(
			chunks,
			this.concurrency,
			async (chunk) => {
				const deployData = this.encodeDiscoveryCall(owner, chunk, evc);
				const raw = await this.queryDiscoveryChunk(client, deployData);
				const [deposits, borrows] = decodeAbiParameters(
					DISCOVERY_RETURN_PARAMS,
					raw,
				);
				return { chunk, deposits, borrows };
			},
		);

		return this.mergeChunks(owner, decoded);
	}

	private encodeDiscoveryCall(
		owner: Address,
		chunk: DiscoveryChunk,
		evc: Address,
	): Hex {
		const args = encodeAbiParameters(DISCOVERY_CTOR_PARAMS, [
			lower(owner),
			chunk.subAccountIds.map((id) => BigInt(id)),
			chunk.vaults.map(lower),
			lower(evc),
		]);
		return concatHex([ACCOUNT_DISCOVERY_LENS_BYTECODE, args]);
	}

	private buildChunks(
		subAccountIds: number[],
		vaults: Address[],
	): DiscoveryChunk[] {
		const vaultChunkSize = Math.min(
			vaults.length,
			Math.max(1, this.maxProbesPerCall),
		);
		const subChunkSize = Math.min(
			this.maxSubAccountsPerCall,
			Math.max(1, Math.floor(this.maxProbesPerCall / vaultChunkSize)),
		);
		const idGroups = chunkArray(subAccountIds, subChunkSize);
		const vaultGroups = chunkArray(vaults, vaultChunkSize);
		const chunks: DiscoveryChunk[] = [];
		for (const ids of idGroups)
			for (const vaultGroup of vaultGroups)
				chunks.push({ subAccountIds: ids, vaults: vaultGroup });
		return chunks;
	}

	private mergeChunks(
		owner: Address,
		decoded: {
			chunk: DiscoveryChunk;
			deposits: readonly (readonly Address[])[];
			borrows: readonly (readonly Address[])[];
		}[],
	): AccountVaults {
		const ownerInt = BigInt(owner);
		const bySubAccount = new Map<
			string,
			{ deposits: Set<string>; borrows: Set<string> }
		>();

		const entryFor = (subAccountId: number) => {
			const subAccount = getAddress(
				`0x${(ownerInt ^ BigInt(subAccountId)).toString(16).padStart(40, "0")}` as Hex,
			);
			let entry = bySubAccount.get(subAccount);
			if (!entry) {
				entry = { deposits: new Set(), borrows: new Set() };
				bySubAccount.set(subAccount, entry);
			}
			return entry;
		};

		for (const { chunk, deposits, borrows } of decoded) {
			for (let i = 0; i < chunk.subAccountIds.length; i++) {
				const depHits = deposits[i] ?? [];
				const borHits = borrows[i] ?? [];
				if (depHits.length === 0 && borHits.length === 0) continue;
				const entry = entryFor(chunk.subAccountIds[i]!);
				for (const vault of depHits) entry.deposits.add(getAddress(vault));
				for (const vault of borHits) entry.borrows.add(getAddress(vault));
			}
		}

		const result: AccountVaults = {};
		for (const [subAccount, entry] of bySubAccount) {
			result[subAccount as Address] = {
				deposits: [...entry.deposits] as Address[],
				borrows: [...entry.borrows] as Address[],
			};
		}
		return result;
	}

	private async getVaults(chainId: number): Promise<Address[]> {
		let cached = this.vaultCache.get(chainId);
		if (!cached) {
			cached = this.loadVaults(chainId).catch((error) => {
				this.vaultCache.delete(chainId);
				throw error;
			});
			this.vaultCache.set(chainId, cached);
		}
		return cached;
	}

	private async loadVaults(chainId: number): Promise<Address[]> {
		if (this.resolveVaultsFn) {
			const resolved = await this.resolveVaultsFn(chainId);
			return dedupeAddresses(resolved);
		}
		return this.loadVaultsFromPerspectives(chainId);
	}

	private async loadVaultsFromPerspectives(
		chainId: number,
	): Promise<Address[]> {
		const provider = this.providerService.getProvider(chainId);
		const periphery =
			this.deploymentService.getDeployment(chainId).addresses.peripheryAddrs;
		const perspectives = [
			periphery?.governedPerspective,
			periphery?.escrowedCollateralPerspective,
			// The factory perspective lists every factory-deployed vault, including
			// deprecated ones that the governed perspective drops. Scanning it is
			// how deprecated-vault deposits get discovered.
			this.includeDeprecated ? periphery?.evkFactoryPerspective : undefined,
		].filter((address): address is Address => !!address);

		if (perspectives.length === 0) {
			throw new Error(
				`[AccountVaultsOnchainAdapter] no vault resolver configured and no governed/escrow perspective for chain ${chainId}.`,
			);
		}

		const lists = await Promise.all(
			perspectives.map((perspective) =>
				this.queryVerifiedArray(provider, perspective).catch(
					() => [] as readonly Address[],
				),
			),
		);
		return dedupeAddresses(lists.flat());
	}

	private getDiscoveryClient(chainId: number): PublicClient {
		const existing = this.discoveryClients.get(chainId);
		if (existing) return existing;

		const provider = this.providerService.getProvider(chainId);
		const url = (provider.transport as { url?: string })?.url;
		// A dedicated unbatched client so parallel chunk calls become independent
		// HTTP requests the RPC provider can spread across nodes — rather than one
		// JSON-RPC batch the upstream may process serially.
		const client = url
			? (createPublicClient({
					transport: http(url, { batch: false, retryCount: 1, timeout: 60_000 }),
				}) as PublicClient)
			: provider;
		this.discoveryClients.set(chainId, client);
		return client;
	}
}

function dedupeAddresses(addresses: readonly Address[]): Address[] {
	const seen = new Set<string>();
	const out: Address[] = [];
	for (const address of addresses) {
		const key = address.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(getAddress(address));
	}
	return out;
}
