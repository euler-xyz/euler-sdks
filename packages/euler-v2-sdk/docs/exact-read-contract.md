# Exact Read Contract

An exact read is a canonical, block-hash-bound query for review systems that
must prove every returned fact came from one immutable chain state. This
contract is reusable across SDK services; EVault reads are its first
implementation.

## Context

An exact context carries:

- `mode: "exact"` as the discriminant
- `blockNumber` and `blockHash` as one inseparable block identity
- `requireCanonical: true`
- an optional injected `PublicClient`
- an optional caller-owned `AbortSignal`

Service options remain backward compatible because the context is optional.
Current reads do not inherit exact-read guarantees.

## Provider And Source Rules

An exact adapter:

1. validates its context before any source call
2. confirms that the provider is connected to the requested chain
3. verifies the canonical block hash before reading
4. binds every contract call to the requested hash with EIP-1898
5. verifies the canonical block hash again after the batch
6. returns exact provenance in the result envelope

An indexed source must reject exact mode unless it can prove equivalent
block-hash semantics. A fallback adapter may route that explicit rejection to a
capable onchain adapter, but it must preserve exact provenance and surface the
fallback diagnostic. Missing or mismatched provenance fails closed.

Cache keys include the requested chain, target, block number, and block hash.
Calls carrying an `AbortSignal` bypass shared query caching so one caller's
cancellation cannot control another caller's result.

## EVault API

Pass an exact read context to `fetchVault` or `fetchVaults`:

```ts
const result = await sdk.eVaultService.fetchVaults(chainId, vaultAddresses, {
  readContext: {
    mode: "exact",
    blockNumber,
    blockHash,
    requireCanonical: true,
    provider,
    signal,
  },
});
```

`provider` is optional when the SDK's configured provider supports the chain.
Injecting it lets applications use their own RPC transport without changing the
SDK's global provider registry.

The EVault onchain adapter calls `VaultLens.getVaultInfoFull` with EIP-1898
`{ blockHash, requireCanonical: true }`. Because VaultLens expands AmountCap
values, the adapter also calls the vault's `caps()` function at the same block
hash. It retains that encoded EVK evidence under `vault.rawConfig`, alongside
configuration flags, hook configuration, and root oracle information. Current
reads do not claim this exact raw-evidence envelope.

The two exact calls for one vault settle as a pair before the next vault starts.
This keeps the exact path within a two-request upstream bound even when one
member of the pair fails before the other completes.

## Intentional EVault Boundaries

V3 is an indexed current-state source and rejects exact reads. In the default
V3-to-onchain fallback, that rejection routes the same request to the onchain
adapter; the result retains exact provenance and adds the standard
`FALLBACK_USED` diagnostic.

Discovery and enrichment are current-state operations. Exact mode therefore
requires explicit vault addresses and rejects `fetchAllVaults`,
`fetchVerifiedVaults`, populate options, label enrichment, rewards, market
prices, and plugin read simulation.

Viem does not expose a per-request `AbortSignal` on `eth_call`. The SDK stops
waiting for and consuming a result as soon as the caller aborts, but the
underlying transport may still complete its request.

Existing custom EVault adapters may omit the new `read` field for current
reads; the service marks those results as `source: "custom"`. A custom adapter
must return matching canonical provenance to satisfy an exact request.

Existing custom `IEVaultService` overrides may also omit `read`. The public
service result keeps provenance optional for source compatibility, while the
built-in `EVaultService` and its built-in adapters return a required provenance
field. Exact-read consumers must treat missing provenance from a custom service
as unsupported rather than inferring exactness from the request.
