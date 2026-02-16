type QueryKey = readonly unknown[]

import { defineChain, getAddress, http } from "viem"
import { createConfig } from "wagmi"
import { readContractQueryOptions } from "wagmi/query"
import { CHAIN_NAMES, RPC_URLS } from "../config/chains"

const EULER_VIRTUAL_USD_ADDRESS = "0x0000000000000000000000000000000000000348"

const CHAIN_IDS = Object.keys(RPC_URLS).map(Number)

function createWagmiQueryConfig() {
  const chains = CHAIN_IDS.map((chainId) =>
    defineChain({
      id: chainId,
      name: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
      nativeCurrency: {
        name: "Native",
        symbol: "ETH",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [RPC_URLS[chainId] ?? ""],
        },
      },
    }),
  )

  if (chains.length === 0) {
    throw new Error("No chains configured for wagmi query key generation")
  }

  const transports = Object.fromEntries(
    CHAIN_IDS.map((chainId) => [chainId, http(RPC_URLS[chainId] ?? "")]),
  )

  return createConfig({
    chains: chains as [ReturnType<typeof defineChain>, ...ReturnType<typeof defineChain>[]],
    transports: transports as never,
    connectors: [],
    multiInjectedProviderDiscovery: false,
    storage: null,
    ssr: true,
  })
}

const wagmiQueryConfig = createWagmiQueryConfig()

function getChainIdFromProvider(provider: unknown): number | "unknown" {
  if (
    provider !== null &&
    typeof provider === "object" &&
    "chain" in provider &&
    "transport" in provider
  ) {
    const client = provider as { chain?: { id?: unknown } }
    if (typeof client.chain?.id === "number") return client.chain.id
  }

  return "unknown"
}

function normalizeAddressLike(value: unknown): string {
  if (typeof value !== "string") return String(value)
  return value.toLowerCase()
}

function serializeQueryKeyValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === "bigint") return `bigint:${value.toString()}`
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (typeof value === "symbol") return String(value)
  if (typeof value === "function") return "[function]"

  if (value instanceof Date) return value.toISOString()

  if (value !== null && typeof value === "object" && "chain" in value && "transport" in value) {
    return `client:${getChainIdFromProvider(value)}`
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeQueryKeyValue(item, seen))
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (seen.has(obj)) return "[circular]"
    seen.add(obj)

    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(obj)) {
      out[key] = serializeQueryKeyValue(nested, seen)
    }
    return out
  }

  return String(value)
}

export function serializeSdkQueryArg(arg: unknown): unknown {
  return serializeQueryKeyValue(arg)
}

function normalizeQueryKey(key: QueryKey): QueryKey {
  const normalized = serializeQueryKeyValue(key)
  if (!Array.isArray(normalized)) return key
  return normalized as QueryKey
}

function buildReadContractQueryKey(
  chainId: number | "unknown",
  address: unknown,
  functionName: string,
  args: unknown[],
): QueryKey | null {
  if (typeof chainId !== "number") return null
  if (typeof address !== "string") return null

  const queryOptions = readContractQueryOptions(wagmiQueryConfig, {
    chainId,
    address: getAddress(address),
    functionName,
    args,
  })

  return normalizeQueryKey(queryOptions.queryKey as QueryKey)
}

function buildWagmiReadContractKey(queryName: string, args: unknown[]): QueryKey | null {
  const chainId = getChainIdFromProvider(args[0])

  // this part of sdk ?!
  if (queryName === "queryVaultInfoFull") {
    return buildReadContractQueryKey(chainId, args[1], "getVaultInfoFull", [
      normalizeAddressLike(args[2]),
    ])
  }

  if (queryName === "queryEulerEarnVaultInfoFull") {
    return buildReadContractQueryKey(chainId, args[1], "getVaultInfoFull", [
      normalizeAddressLike(args[2]),
    ])
  }

  if (queryName === "queryVerifiedArray" || queryName === "queryEulerEarnVerifiedArray") {
    return buildReadContractQueryKey(chainId, args[1], "verifiedArray", [])
  }

  if (queryName === "queryAssetPriceInfo") {
    return buildReadContractQueryKey(chainId, args[1], "getAssetPriceInfo", [
      normalizeAddressLike(args[2]),
      EULER_VIRTUAL_USD_ADDRESS.toLowerCase(),
    ])
  }

  if (queryName === "queryEVCAccountInfo") {
    return buildReadContractQueryKey(chainId, args[1], "getEVCAccountInfo", [
      normalizeAddressLike(args[2]),
      normalizeAddressLike(args[3]),
    ])
  }

  if (queryName === "queryVaultAccountInfo") {
    return buildReadContractQueryKey(chainId, args[1], "getVaultAccountInfo", [
      normalizeAddressLike(args[2]),
      normalizeAddressLike(args[3]),
    ])
  }

  if (queryName === "queryVaultInfoERC4626") {
    return buildReadContractQueryKey(chainId, args[1], "getVaultInfoERC4626", [
      normalizeAddressLike(args[2]),
    ])
  }

  if (queryName === "queryGovernorAdmin") {
    return buildReadContractQueryKey(chainId, args[1], "governorAdmin", [])
  }

  if (queryName === "querySupplyCapResolved") {
    return buildReadContractQueryKey(chainId, args[1], "supplyCapResolved", [])
  }

  if (queryName === "queryBalanceOf") {
    return buildReadContractQueryKey(chainId, args[1], "balanceOf", [normalizeAddressLike(args[2])])
  }

  if (queryName === "queryAllowance") {
    return buildReadContractQueryKey(chainId, args[1], "allowance", [
      normalizeAddressLike(args[2]),
      normalizeAddressLike(args[3]),
    ])
  }

  if (queryName === "queryPermit2Allowance") {
    return buildReadContractQueryKey(chainId, args[1], "allowance", [
      normalizeAddressLike(args[2]),
      normalizeAddressLike(args[3]),
      normalizeAddressLike(args[4]),
    ])
  }

  return null
}

export function buildSdkQueryKey(queryName: string, args: unknown[]): QueryKey {
  const wagmiReadContractKey = buildWagmiReadContractKey(queryName, args)
  if (wagmiReadContractKey) return wagmiReadContractKey

  return ["sdk", queryName, ...args.map(serializeSdkQueryArg)] as const
}
