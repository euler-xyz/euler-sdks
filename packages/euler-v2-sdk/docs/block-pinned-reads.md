# Block-Pinned Reads and Read Bundling

Two utilities for consumers that need every on-chain value to come from one
block — a canonical block hash, typically — and want many lens reads answered
by one `eth_call`.

- `pinClientToBlock(client, pin)` returns a client whose state reads are all
  answered at `pin`. Hand it to any SDK service or adapter and their reads are
  pinned; nothing takes a block argument.
- `readMany(client, items, options?)` bundles raw `{ to, data }` reads into one
  call and answers each item with its own success flag and bytes.

## `pinClientToBlock(client, pin)`

```typescript
import { pinClientToBlock, buildEulerSDK } from '@eulerxyz/euler-v2-sdk'

const pinned = pinClientToBlock(client, { blockHash, requireCanonical: true })
// or: pinClientToBlock(client, { blockNumber: 21_000_000n })

// Pinning governs reads made through the pinned client and nothing else.
// buildEulerSDK's default adapters answer from Data V3 first and only fall
// back to the chain, so select the on-chain adapters explicitly (or set
// `disableV3: true`); V3/API data is never pinned.
const sdk = await buildEulerSDK({
  config: {
    eVaultServiceAdapter: 'onchain',
    eulerEarnServiceAdapter: 'onchain',
    accountServiceAdapter: 'onchain',
  },
  servicesOverrides: {
    providerService: {
      getProvider: () => pinned,
      getSupportedChainIds: () => [pinned.chain!.id],
    },
  },
})
const { result } = await sdk.eVaultService.fetchVaults(1, addresses) // at the hash
```

| Pin | JSON-RPC block parameter sent |
| --- | --- |
| `{ blockNumber }` | the number as hex |
| `{ blockHash, requireCanonical? }` | the EIP-1898 object, verbatim; `requireCanonical` omitted when not given |

viem's actions can name a block number but not a block hash, so the pin is
applied to the JSON-RPC request itself: the returned client forwards every
request to `client` and replaces the block parameter of the state-read
methods before it leaves. Covered: `eth_call` (so `call`, `readContract`,
`simulateContract`, and `multicall` — including the Multicall3 batching the
SDK's own provider clients enable), `eth_getBalance`, `eth_getCode`,
`eth_getStorageAt`, `eth_getTransactionCount`. Every other method passes
through untouched, so `getBlockNumber`, `getBlock`, logs and transactions
behave as on the original client. Chain, batching and cache settings are
carried over; the original client is not modified.

Only reads that go through the pinned client are pinned. Services whose
adapter answers from Data V3 or another HTTP source (V3 vault and account
data, prices, rewards, labels, intrinsic APY) do not consult the provider for
that answer, so they are unaffected by a pin; on-chain fallbacks and the
on-chain adapters are.

`requireCanonical: true` makes the node refuse a hash that is no longer on its
canonical chain instead of answering from a stale fork — use it whenever the
hash was chosen earlier than the read. When it is not given the block object
carries only `blockHash`, which is EIP-1898's default (`false`); an RPC proxy
that validates the block argument may require the flag to be present and
`true`, so set it on the pin explicitly behind such a proxy. Nodes that do not
implement EIP-1898 reject the hash form with a JSON-RPC error; the number form
works everywhere.

The pin is readable with `getClientBlockPin(client)`, and
`normalizeQueryKeyValue` includes it in query cache keys, so pinned and
unpinned answers never share a cache entry.

## `readMany(client, items, options?)`

```typescript
import { readMany, vaultLensAbi, getVaultInfoFullLensBatchItem, convertVaultInfoFullToIEVault, EVault } from '@eulerxyz/euler-v2-sdk'
import { decodeFunctionResult, zeroAddress } from 'viem'

const items = vaults.map((vault) => {
  const { targetContract, data } = getVaultInfoFullLensBatchItem(vaultLens, vault, zeroAddress)
  return { to: targetContract, data }
})
const results = await readMany(pinned, items) // one eth_call, at the pin

const entities = results.flatMap((result, index) => {
  if (!result.success) return [] // result.data holds the revert bytes
  const info = decodeFunctionResult({ abi: vaultLensAbi, functionName: 'getVaultInfoFull', data: result.data })
  return [new EVault(convertVaultInfoFullToIEVault(info, chainId, []))]
})
```

| Option | Carrier | Use for |
| --- | --- | --- |
| `{ carrier: 'multicall3', multicall3Address? }` (default) | Multicall3 `aggregate3` with `allowFailure` | pure views; the address defaults to the client chain's Multicall3, then the canonical `MULTICALL3_ADDRESS` |
| `{ carrier: 'evc', evcAddress, onBehalfOfAccount? }` | EVC `batchSimulation` | items that carry `value`, such as Pyth price updates ahead of a lens read; `onBehalfOfAccount` defaults to the zero address |

Each `ReadManyResult` is `{ success, data }`: the return data on success, the
revert data otherwise. Nothing is thrown per item, so one reverting read never
hides the rest; only an empty response from the carrier, or a `value` item on
the `multicall3` carrier, throws. The bundle reads through `client`, so a
pinned client answers every item at its pin.

## Building items

Exported item builders produce `EVCBatchItem`s (`targetContract`,
`onBehalfOfAccount`, `value`, `data`); `readMany` takes `{ to, data, value? }`,
so map `targetContract` to `to`.

| Export | Reads |
| --- | --- |
| `getVaultInfoFullLensBatchItem(vaultLens, vault, onBehalfOf)` | `VaultLens.getVaultInfoFull`; decode with `vaultLensAbi`, convert with `convertVaultInfoFullToIEVault` |
| `getEulerEarnVaultInfoFullLensBatchItem(earnLens, vault, onBehalfOf)` | `EulerEarnVaultLens.getVaultInfoFull` |
| `getVaultInfoERC4626LensBatchItem(utilsLens, vault, onBehalfOf)` | `UtilsLens.getVaultInfoERC4626` |
| `getSecuritizeGovernorAdminBatchItem(vault, onBehalfOf?)`, `getSecuritizeSupplyCapResolvedBatchItem(vault, onBehalfOf?)` | Securitize collateral vault direct reads |
| `getEVCAccountInfoLensBatchItem`, `getVaultAccountInfoLensBatchItem` | `AccountLens` reads |
| `getPerspectiveVerifiedArrayBatchItem(perspective, onBehalfOf)` | a perspective's verified set; decode with `perspectiveVerifiedArrayAbi` |
| `encodeEVCBatch(items)` | calldata for `EVC.batch(items)` when a consumer submits a batch itself |

## Lens reads

Each lens view is packaged as a `LensRead` with three forms that share one ABI
and never take a block argument — read through a pinned client and all three
answer at its pin:

| Form | Use |
| --- | --- |
| `batchItem(lens, args, onBehalfOf?)` | an `EVCBatchItem` for `readMany` (map `targetContract` to `to`) or an EVC batch |
| `decode(data)` | decodes the bytes a successful bundled read answered with, typed from the ABI |
| `read(client, lens, args)` | one `readContract` through `client` |

| Set | Views | Decode further with |
| --- | --- | --- |
| `oracleLens` | `getOracleInfo(oracle, bases, quotes)`, `getValidAdapters(base, quote)`, `isStalePullOracle(oracle, failureReason)` | `decodeOracleInfo` / `decodeOracleRoutes` (`utils/oracle.ts`) on the `OracleDetailedInfo` |
| `irmLens` | `getInterestRateModelInfo(irm)` | `decodeIRMParams(type, params)` (`utils/irm.ts`) on the `InterestRateModelDetailedInfo` |
| `vaultLens` | `getVaultInfoFull`, `getVaultInfoStatic`, `getVaultInfoDynamic`, `getRecognizedCollateralsLTVInfo`, `getVaultInterestRateModelInfo` | `convertVaultInfoFullToIEVault` on `getVaultInfoFull` |

```typescript
import { oracleLens, irmLens, readMany, decodeOracleInfo, decodeIRMParams } from '@eulerxyz/euler-v2-sdk'

const items = [
  oracleLens.getOracleInfo.batchItem(oracleLensAddress, [router, [base], [quote]]),
  irmLens.getInterestRateModelInfo.batchItem(irmLensAddress, [irm]),
].map(({ targetContract, data }) => ({ to: targetContract, data }))

const [oracle, irm] = await readMany(pinned, items)
if (oracle.success) {
  const adapters = decodeOracleInfo(oracleLens.getOracleInfo.decode(oracle.data))
}
if (irm.success) {
  const info = irmLens.getInterestRateModelInfo.decode(irm.data)
  const params = decodeIRMParams(info.interestRateModelType, info.interestRateModelParams)
}
```

`defineLensRead(abi, functionName)` builds the same package over any ABI, for a
lens view the SDK does not list. The OracleLens and IRMLens ABIs are vendored
from euler-interfaces (`oracleLensAbi`, `irmLensAbi`); VaultLens reads use the
`vaultLensAbi` the SDK already bundles.
