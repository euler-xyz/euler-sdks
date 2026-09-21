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

const sdk = await buildEulerSDK({
  servicesOverrides: {
    providerService: { getProvider: () => pinned },
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

`requireCanonical: true` makes the node refuse a hash that is no longer on its
canonical chain instead of answering from a stale fork — use it whenever the
hash was chosen earlier than the read. Nodes that do not implement EIP-1898
reject the hash form with a JSON-RPC error; the number form works everywhere.

The pin is readable with `getClientBlockPin(client)`, and
`normalizeQueryKeyValue` includes it in query cache keys, so pinned and
unpinned answers never share a cache entry.

## `readMany(client, items, options?)`

```typescript
import { readMany, vaultLensAbi, getVaultInfoFullLensBatchItem, convertVaultInfoFullToIEVault, EVault } from '@eulerxyz/euler-v2-sdk'
import { decodeFunctionResult } from 'viem'

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
