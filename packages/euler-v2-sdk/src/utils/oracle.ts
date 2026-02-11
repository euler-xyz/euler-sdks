import { decodeAbiParameters, type Address, type Hex, isHex, toHex } from 'viem'

export type OracleInfo = {
  oracle: Address
  name: string
  adapters: OracleAdapterEntry[]
}

export type OracleDetailedInfo = {
  oracle: Address
  name: string
  oracleInfo: Hex
}


export interface OraclePrice {
  queryFailure: boolean;
  queryFailureReason: Hex;
  amountIn: bigint;
  amountOutMid: bigint;
  amountOutBid: bigint;
  amountOutAsk: bigint;
  timestamp: number;
}

export type EulerRouterInfo = {
  governor: Address
  fallbackOracle: Address
  fallbackOracleInfo: OracleDetailedInfo
  bases: Address[]
  quotes: Address[]
  resolvedAssets: Address[][]
  resolvedOracles: Address[]
  resolvedOraclesInfo: OracleDetailedInfo[]
}

export type CrossAdapterInfo = {
  base: Address
  cross: Address
  quote: Address
  oracleBaseCross: Address
  oracleCrossQuote: Address
  oracleBaseCrossInfo: OracleDetailedInfo
  oracleCrossQuoteInfo: OracleDetailedInfo
}

export type PythOracleInfo = {
  pyth: Address
  base: Address
  quote: Address
  feedId: Hex
  maxStaleness: bigint
  maxConfWidth: bigint
}

export type PythFeed = {
  pythAddress: Address
  feedId: Hex
}

export type OracleAdapterEntry = {
  oracle: Address
  name: string
  base: Address
  quote: Address
}

type OracleAdapterOptions = {
  base?: Address
  quote?: Address
  leafOnly?: boolean
}

const ORACLE_DETAILED_INFO_COMPONENTS = [
  { name: 'oracle', type: 'address' },
  { name: 'name', type: 'string' },
  { name: 'oracleInfo', type: 'bytes' },
] as const

const EULER_ROUTER_COMPONENTS = [
  { name: 'governor', type: 'address' },
  { name: 'fallbackOracle', type: 'address' },
  { name: 'fallbackOracleInfo', type: 'tuple', components: ORACLE_DETAILED_INFO_COMPONENTS },
  { name: 'bases', type: 'address[]' },
  { name: 'quotes', type: 'address[]' },
  { name: 'resolvedAssets', type: 'address[][]' },
  { name: 'resolvedOracles', type: 'address[]' },
  { name: 'resolvedOraclesInfo', type: 'tuple[]', components: ORACLE_DETAILED_INFO_COMPONENTS },
] as const

const CROSS_ADAPTER_COMPONENTS = [
  { name: 'base', type: 'address' },
  { name: 'cross', type: 'address' },
  { name: 'quote', type: 'address' },
  { name: 'oracleBaseCross', type: 'address' },
  { name: 'oracleCrossQuote', type: 'address' },
  { name: 'oracleBaseCrossInfo', type: 'tuple', components: ORACLE_DETAILED_INFO_COMPONENTS },
  { name: 'oracleCrossQuoteInfo', type: 'tuple', components: ORACLE_DETAILED_INFO_COMPONENTS },
] as const

const PYTH_ORACLE_COMPONENTS = [
  { name: 'pyth', type: 'address' },
  { name: 'base', type: 'address' },
  { name: 'quote', type: 'address' },
  { name: 'feedId', type: 'bytes32' },
  { name: 'maxStaleness', type: 'uint256' },
  { name: 'maxConfWidth', type: 'uint256' },
] as const

const normalizeHex = (value: Hex | string | Uint8Array): Hex => {
  if (typeof value === 'string') {
    return (isHex(value) ? value : `0x${value}`) as Hex
  }
  return toHex(value)
}

export const decodeEulerRouterInfo = (oracleInfo: Hex | string | Uint8Array): EulerRouterInfo | null => {
  try {
    const [decoded] = decodeAbiParameters(
      [{ type: 'tuple', components: EULER_ROUTER_COMPONENTS }],
      normalizeHex(oracleInfo),
    )
    return decoded as EulerRouterInfo
  }
  catch {
    return null
  }
}

export const decodeCrossAdapterInfo = (oracleInfo: Hex | string | Uint8Array): CrossAdapterInfo | null => {
  try {
    const [decoded] = decodeAbiParameters(
      [{ type: 'tuple', components: CROSS_ADAPTER_COMPONENTS }],
      normalizeHex(oracleInfo),
    )
    return decoded as CrossAdapterInfo
  }
  catch {
    return null
  }
}

export const decodePythOracleInfo = (oracleInfo: Hex | string | Uint8Array): PythOracleInfo | null => {
  try {
    const [decoded] = decodeAbiParameters(
      [{ type: 'tuple', components: PYTH_ORACLE_COMPONENTS }],
      normalizeHex(oracleInfo),
    )
    return decoded as PythOracleInfo
  }
  catch {
    return null
  }
}

export const collectPythFeedIds = (
  oracleInfo: OracleDetailedInfo | null | undefined,
  maxDepth = 3,
): PythFeed[] => {
  const feeds: PythFeed[] = []
  const visited = new Set<string>()

  const visit = (info: OracleDetailedInfo | null | undefined, depth: number) => {
    if (!info || depth > maxDepth) return
    const key = `${info.oracle}-${info.name}-${info.oracleInfo}`
    if (visited.has(key)) return
    visited.add(key)

    if (info.name === 'PythOracle') {
      const decoded = decodePythOracleInfo(info.oracleInfo)
      if (decoded) {
        feeds.push({
          pythAddress: decoded.pyth,
          feedId: normalizeHex(decoded.feedId),
        })
      }
      return
    }

    if (info.name === 'EulerRouter') {
      const decoded = decodeEulerRouterInfo(info.oracleInfo)
      if (!decoded) return
      visit(decoded.fallbackOracleInfo, depth + 1)
      decoded.resolvedOraclesInfo?.forEach(child => visit(child, depth + 1))
      return
    }

    if (info.name === 'CrossAdapter') {
      const decoded = decodeCrossAdapterInfo(info.oracleInfo)
      if (!decoded) return
      visit(decoded.oracleBaseCrossInfo, depth + 1)
      visit(decoded.oracleCrossQuoteInfo, depth + 1)
    }
  }

  visit(oracleInfo, 0)

  const deduped = new Map<string, PythFeed>()
  feeds.forEach((feed) => {
    const key = `${feed.pythAddress.toLowerCase()}:${feed.feedId.toLowerCase()}`
    if (!deduped.has(key)) {
      deduped.set(key, feed)
    }
  })

  return [...deduped.values()]
}

type OracleAdapterContext = {
  base?: Address
  quote?: Address
}

const resolveAdapterPair = (context: OracleAdapterContext, override?: OracleAdapterContext) => {
  const base = override?.base ?? context.base
  const quote = override?.quote ?? context.quote
  if (!base || !quote) return null
  return { base, quote }
}

export const decodeOracleInfo = (
  oracleInfo: OracleDetailedInfo | null | undefined,
  maxDepth = 3,
  options: OracleAdapterOptions = {},
): OracleAdapterEntry[] => {
  const adapters: OracleAdapterEntry[] = []
  const visited = new Set<string>()
  const leafOnly = options.leafOnly ?? false

  const addAdapter = (info: OracleDetailedInfo, base: Address, quote: Address) => {
    adapters.push({ oracle: info.oracle, name: info.name, base, quote })
  }

  const visit = (info: OracleDetailedInfo | null | undefined, depth: number, context: OracleAdapterContext) => {
    if (!info || depth > maxDepth) return
    const key = `${info.oracle}-${info.name}-${info.oracleInfo}-${context.base || ''}-${context.quote || ''}`
    if (visited.has(key)) return
    visited.add(key)

    if (info.name === 'EulerRouter') {
      const decoded = decodeEulerRouterInfo(info.oracleInfo)
      if (!decoded) return
      const targetBase = context.base?.toLowerCase()
      const targetQuote = context.quote?.toLowerCase()
      let matched = false
      const total = Math.max(
        decoded.resolvedOraclesInfo?.length ?? 0,
        decoded.bases?.length ?? 0,
        decoded.quotes?.length ?? 0,
      )
      for (let i = 0; i < total; i += 1) {
        const child = decoded.resolvedOraclesInfo?.[i]
        const base = decoded.bases?.[i]
        const quote = decoded.quotes?.[i]
        if (!child) continue
        if (targetBase && targetQuote) {
          if (!base || !quote) continue
          if (base.toLowerCase() !== targetBase || quote.toLowerCase() !== targetQuote) continue
          matched = true
        }
        visit(child, depth + 1, { base, quote })
      }
      if (decoded.fallbackOracleInfo && (!targetBase || !targetQuote || !matched)) {
        visit(decoded.fallbackOracleInfo, depth + 1, context)
      }
      return
    }

    if (info.name === 'CrossAdapter') {
      const decoded = decodeCrossAdapterInfo(info.oracleInfo)
      if (!decoded) return
      if (!leafOnly) {
        addAdapter(info, decoded.base, decoded.quote)
      }
      visit(decoded.oracleBaseCrossInfo, depth + 1, { base: decoded.base, quote: decoded.cross })
      visit(decoded.oracleCrossQuoteInfo, depth + 1, { base: decoded.cross, quote: decoded.quote })
      return
    }

    if (info.name === 'PythOracle') {
      const decoded = decodePythOracleInfo(info.oracleInfo)
      const pair = resolveAdapterPair(context, decoded ? { base: decoded.base, quote: decoded.quote } : undefined)
      if (pair) {
        addAdapter(info, pair.base, pair.quote)
      }
      return
    }

    const pair = resolveAdapterPair(context)
    if (pair) {
      addAdapter(info, pair.base, pair.quote)
    }
  }

  visit(oracleInfo, 0, { base: options.base, quote: options.quote })

  const deduped = new Map<string, OracleAdapterEntry>()
  adapters.forEach((adapter) => {
    const key = `${adapter.oracle.toLowerCase()}:${adapter.base.toLowerCase()}:${adapter.quote.toLowerCase()}`
    if (!deduped.has(key)) {
      deduped.set(key, adapter)
    }
  })

  return [...deduped.values()]
}

const isChainlinkOracleName = (name: string) => name.toLowerCase().includes('chainlink')

export const collectChainlinkOracles = (
  oracleInfo: OracleDetailedInfo | null | undefined,
  maxDepth = 3,
): Address[] => {
  const oracles: Address[] = []
  const visited = new Set<string>()

  const visit = (info: OracleDetailedInfo | null | undefined, depth: number) => {
    if (!info || depth > maxDepth) return
    const key = `${info.oracle}-${info.name}-${info.oracleInfo}`
    if (visited.has(key)) return
    visited.add(key)

    if (isChainlinkOracleName(info.name)) {
      oracles.push(info.oracle)
      return
    }

    if (info.name === 'EulerRouter') {
      const decoded = decodeEulerRouterInfo(info.oracleInfo)
      if (!decoded) return
      visit(decoded.fallbackOracleInfo, depth + 1)
      decoded.resolvedOraclesInfo?.forEach(child => visit(child, depth + 1))
      return
    }

    if (info.name === 'CrossAdapter') {
      const decoded = decodeCrossAdapterInfo(info.oracleInfo)
      if (!decoded) return
      visit(decoded.oracleBaseCrossInfo, depth + 1)
      visit(decoded.oracleCrossQuoteInfo, depth + 1)
    }
  }

  visit(oracleInfo, 0)

  const deduped = new Map<string, Address>()
  oracles.forEach((oracle) => {
    const key = oracle.toLowerCase()
    if (!deduped.has(key)) {
      deduped.set(key, oracle)
    }
  })

  return [...deduped.values()]
}
