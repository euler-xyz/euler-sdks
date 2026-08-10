import { type Abi, type Address, getAddress } from "viem";
import type { IProviderService } from "../providerService/index.js";
import type {
	FetchSafeAccountArgs,
	ISafeAccountService,
	SafeAccountInfo,
	SafeAccountServiceConfig,
} from "./safeAccountServiceTypes.js";

/**
 * Minimal fragments for probing Safe (ex Gnosis Safe) smart accounts.
 *
 * `masterCopy()` is not a regular function on the Safe singleton — Safe proxy
 * contracts (v1.1.1+) special-case the `0xa619486e` selector in their fallback
 * and return the singleton address stored at slot 0 without delegating. An
 * `eth_call` against any Safe proxy therefore answers it, while EOAs return
 * empty data and non-Safe contracts revert or fail decoding.
 */
export const safeAccountAbi = [
	{
		type: "function",
		name: "masterCopy",
		inputs: [],
		outputs: [{ name: "masterCopy", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getThreshold",
		inputs: [],
		outputs: [{ name: "threshold", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getOwners",
		inputs: [],
		outputs: [{ name: "owners", type: "address[]" }],
		stateMutability: "view",
	},
] as const satisfies Abi;

/**
 * Canonical Safe singleton (implementation) deployments, lowercased.
 *
 * Safe singletons are deployed deterministically at identical addresses on
 * every chain via the Safe Singleton Factory, so a single append-only list
 * covers all networks. Includes the "eip155" v1.3.0 variants used on chains
 * where the canonical deployment was not possible. zkSync-VM variants are
 * omitted — no supported chain needs them.
 *
 * Source: https://github.com/safe-global/safe-deployments
 *
 * v1.0.0 proxies predate the `masterCopy()` fallback special-case, so v1.0.0
 * Safes fail the probe and read as non-Safes.
 */
const SAFE_SINGLETON_VERSIONS: Record<string, string> = {
	"0x34cfac646f301356faa8b21e94227e3583fe3f5f": "1.1.1",
	"0x6851d6fdfafd08c0295c392436245e5bc78b0185": "1.2.0",
	"0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "1.3.0",
	"0x69f4d1788e39c87893c980c06edf4b7f686e2938": "1.3.0",
	"0x3e5c63644e683549055b9be8653de26e0b4cd36e": "1.3.0",
	"0xfb1bffc9d739b8d520daf37df666da4c687191ea": "1.3.0",
	"0x41675c099f32341bf84bfc5382af534df5c7461a": "1.4.1",
	"0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "1.4.1",
	"0xff51a5898e281db6dfc7855790607438df2ca44b": "1.5.0",
	"0xedd160febbd92e350d4d398fb636302fccd67c7e": "1.5.0",
};

/** Safe contract version for a known singleton address, if recognized. */
export function getSafeSingletonVersion(
	singleton: string | null | undefined,
): string | undefined {
	return singleton
		? SAFE_SINGLETON_VERSIONS[singleton.toLowerCase()]
		: undefined;
}

const DEFAULT_CACHE_MS = 5 * 60 * 1000;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
/** Safe's OwnerManager linked-list sentinel — never a legitimate owner. */
const SENTINEL_OWNER = "0x0000000000000000000000000000000000000001";

const CONTRACT_FAILURE_NAMES = new Set([
	"ContractFunctionZeroDataError",
	"ContractFunctionRevertedError",
	"AbiDecodingZeroDataError",
	"ExecutionRevertedError",
	"RawContractError",
]);
const CONTRACT_FAILURE_MESSAGE = /reverted|returned no data/i;

/**
 * True when a rejected read failed at the contract level (empty call data
 * from an EOA, revert from a non-Safe contract) — a definitive "not a Safe".
 * Anything else (HTTP failure, timeout, rate limit) is a transport problem
 * and must not be recorded as a negative detection. Matches by error name
 * and message rather than instanceof so wrapped and cross-package viem
 * errors classify correctly.
 */
function isDefinitiveContractFailure(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; current instanceof Error && depth < 8; depth++) {
		if (CONTRACT_FAILURE_NAMES.has(current.name)) return true;
		if (CONTRACT_FAILURE_MESSAGE.test(current.message)) return true;
		current = current.cause;
	}
	return false;
}

export class SafeAccountService implements ISafeAccountService {
	private readonly cache = new Map<
		string,
		{ expiresAt: number; value: SafeAccountInfo | null }
	>();
	private readonly inFlight: Record<string, Promise<SafeAccountInfo | null>> =
		{};

	constructor(
		private readonly providerService: IProviderService,
		private readonly config: SafeAccountServiceConfig = {},
	) {}

	/**
	 * Detect whether an address is a Safe smart account.
	 *
	 * Results are cached per `${chainId}:${account}` (threshold/owners can
	 * change, hence the TTL) and concurrent probes for the same key share one
	 * RPC round-trip. RPC failures are not cached so a later call retries.
	 *
	 * @param args.chainId - Chain to probe on.
	 * @param args.account - Address to probe.
	 */
	async fetchSafeAccount(
		args: FetchSafeAccountArgs,
	): Promise<SafeAccountInfo | null> {
		const key = `${args.chainId}:${args.account.toLowerCase()}`;
		const cached = this.cache.get(key);
		if (cached && cached.expiresAt > Date.now()) return cached.value;

		const pending = this.inFlight[key];
		if (pending) return pending;

		// Evict failed probes so a later call retries instead of replaying the
		// rejection for the lifetime of the service.
		const request = this.probeSafeAccount(args)
			.then((value) => {
				this.cache.set(key, {
					expiresAt: Date.now() + (this.config.cacheMs ?? DEFAULT_CACHE_MS),
					value,
				});
				return value;
			})
			.finally(() => {
				if (this.inFlight[key] === request) delete this.inFlight[key];
			});
		this.inFlight[key] = request;
		return request;
	}

	/**
	 * Fire the three probe reads concurrently — the provider's multicall
	 * batching coalesces them into a single RPC request. EOAs return empty
	 * call data and non-Safe contracts revert on the unknown selectors, so
	 * those failures mean "not a Safe". Transport-level failures are
	 * rethrown instead, so they surface to the caller and are never cached
	 * as negative detections.
	 */
	private async probeSafeAccount(
		args: FetchSafeAccountArgs,
	): Promise<SafeAccountInfo | null> {
		const provider = this.providerService.getProvider(args.chainId);
		const account = getAddress(args.account);

		const [singleton, threshold, owners] = await Promise.allSettled([
			provider.readContract({
				address: account,
				abi: safeAccountAbi,
				functionName: "masterCopy",
			}) as Promise<Address>,
			provider.readContract({
				address: account,
				abi: safeAccountAbi,
				functionName: "getThreshold",
			}) as Promise<bigint>,
			provider.readContract({
				address: account,
				abi: safeAccountAbi,
				functionName: "getOwners",
			}) as Promise<readonly Address[]>,
		]);

		for (const result of [singleton, threshold, owners]) {
			if (
				result.status === "rejected" &&
				!isDefinitiveContractFailure(result.reason)
			) {
				throw result.reason;
			}
		}

		if (singleton.status !== "fulfilled") return null;
		const version = getSafeSingletonVersion(singleton.value);
		if (!version) return null;
		if (threshold.status !== "fulfilled" || owners.status !== "fulfilled") {
			return null;
		}

		// Threshold/owner invariants mirror what the Safe contracts themselves
		// enforce (OwnerManager forbids zero/sentinel/duplicate owners);
		// anything violating them is a lookalike.
		const thresholdCount = Number(threshold.value);
		if (!Number.isSafeInteger(thresholdCount) || thresholdCount < 1) {
			return null;
		}
		if (owners.value.length < thresholdCount) return null;

		const normalizedOwners = owners.value.map((owner) => owner.toLowerCase());
		if (
			normalizedOwners.some(
				(owner) => owner === ZERO_ADDRESS || owner === SENTINEL_OWNER,
			)
		) {
			return null;
		}
		if (new Set(normalizedOwners).size !== normalizedOwners.length) {
			return null;
		}

		return {
			address: account,
			singleton: getAddress(singleton.value),
			version,
			threshold: thresholdCount,
			owners: owners.value.map((owner) => getAddress(owner)),
		};
	}
}
