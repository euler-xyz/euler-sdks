import {
	type Hex,
	type PublicClient,
	createPublicClient,
	custom,
	numberToHex,
} from "viem";

/**
 * The block every read through a pinned client is answered at. The hash form
 * is EIP-1898: `requireCanonical: true` makes the node refuse a hash that is
 * no longer on its canonical chain instead of answering from a stale fork.
 */
export type BlockPin =
	| { blockNumber: bigint }
	| { blockHash: Hex; requireCanonical?: boolean };

export type BlockPinnedClient = PublicClient & { blockPin: BlockPin };

/**
 * JSON-RPC read methods whose positional block parameter the pin replaces,
 * keyed by that parameter's index. Everything else passes through untouched.
 */
const BLOCK_PARAMETER_INDEX: Readonly<Record<string, number>> = {
	eth_call: 1,
	eth_getBalance: 1,
	eth_getCode: 1,
	eth_getTransactionCount: 1,
	eth_getStorageAt: 2,
};

/** The pin as the JSON-RPC block parameter: a hex number, or the EIP-1898 object. */
export function encodeBlockPin(
	pin: BlockPin,
): Hex | { blockHash: Hex; requireCanonical?: boolean } {
	if ("blockNumber" in pin) return numberToHex(pin.blockNumber);
	return pin.requireCanonical === undefined
		? { blockHash: pin.blockHash }
		: { blockHash: pin.blockHash, requireCanonical: pin.requireCanonical };
}

/** The client each pinned client forwards to, so re-pinning never stacks wrappers. */
const sourceClients = new WeakMap<object, PublicClient>();

/** The pin a client was created with by `pinClientToBlock`, if any. */
export function getClientBlockPin(client: PublicClient): BlockPin | undefined {
	return (client as Partial<BlockPinnedClient>).blockPin;
}

/** An immutable copy of the pin, so later mutation of the caller's object changes nothing. */
function snapshotBlockPin(pin: BlockPin): BlockPin {
	return Object.freeze(
		"blockNumber" in pin
			? { blockNumber: pin.blockNumber }
			: pin.requireCanonical === undefined
				? { blockHash: pin.blockHash }
				: { blockHash: pin.blockHash, requireCanonical: pin.requireCanonical },
	);
}

/**
 * A client whose every state read is answered at one block.
 *
 * viem's actions can name a block number but not a block hash, so the pin is
 * applied one layer down: the returned client forwards each JSON-RPC request
 * to `client`, replacing the block parameter of the read methods with the pin
 * before it leaves. That covers `call`, `readContract`, `multicall` (viem's
 * Multicall3 batching included), `getBalance`, `getCode`, `getStorageAt` and
 * `getTransactionCount`, and therefore every SDK service and adapter handed
 * this client — nothing needs a block argument of its own. Chain, batching
 * and cache settings are carried over; the original client is not modified.
 *
 * `normalizeQueryKeyValue` reads the pin off the client, so a query cache
 * keeps pinned and unpinned answers apart. The pin is copied and frozen at
 * creation and exposed read-only, so the block the RPC sees and the block the
 * cache key names cannot drift apart. Pinning an already pinned client pins
 * the client it forwards to, replacing the earlier pin rather than nesting it.
 */
export function pinClientToBlock(
	client: PublicClient,
	pin: BlockPin,
): BlockPinnedClient {
	const source = sourceClients.get(client) ?? client;
	const snapshot = snapshotBlockPin(pin);
	const block = encodeBlockPin(snapshot);
	const request = async ({
		method,
		params,
	}: {
		method: string;
		params?: unknown;
	}): Promise<unknown> => {
		const index = BLOCK_PARAMETER_INDEX[method];
		const pinnedParams = Array.isArray(params) ? [...params] : undefined;
		if (index !== undefined && pinnedParams) {
			pinnedParams[index] = block;
		}
		return source.request({
			method,
			params: pinnedParams ?? params,
		} as Parameters<PublicClient["request"]>[0]);
	};

	const pinned = createPublicClient({
		chain: source.chain,
		transport: custom({ request }),
		batch: source.batch,
		cacheTime: source.cacheTime,
		pollingInterval: source.pollingInterval,
		key: `${source.key}:pinned`,
		name: `${source.name} (pinned)`,
	});
	Object.defineProperty(pinned, "blockPin", {
		value: snapshot,
		enumerable: true,
		writable: false,
		configurable: false,
	});
	sourceClients.set(pinned, source);

	return pinned as unknown as BlockPinnedClient;
}
