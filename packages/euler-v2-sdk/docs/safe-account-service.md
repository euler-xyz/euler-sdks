# Safe Account Service

`safeAccountService` detects whether an address is a Safe (ex Gnosis Safe) smart account and reads its signer configuration.

The service is available on the SDK returned by `buildEulerSDK()`:

```typescript
const info = await sdk.safeAccountService.fetchSafeAccount({
  chainId: 1,
  account: '0xGovernor...',
})

if (info) {
  console.log(`Safe v${info.version}: ${info.threshold}/${info.owners.length}`)
}
```

## Read API

Use `fetchSafeAccount({ chainId, account })` to probe an address. It resolves to `SafeAccountInfo` when the address is a canonical Safe, or `null` when it is an EOA, a non-Safe contract, or a proxy pointing at an unrecognized singleton:

- `address` - the probed Safe proxy address (checksummed)
- `singleton` - the canonical Safe implementation the proxy points at
- `version` - Safe contract version of the singleton, e.g. `"1.4.1"`
- `threshold` - owner signatures required to execute a transaction
- `owners` - current Safe owners (checksummed)

## Detection model

Safe proxies (v1.1.1+) special-case the `masterCopy()` selector in their fallback and return the singleton address stored at slot 0. The probe fires `masterCopy()`, `getThreshold()`, and `getOwners()` concurrently — the provider's multicall batching coalesces them into one RPC request — and accepts the address as a Safe only when the singleton matches a known canonical deployment from [`safe-deployments`](https://github.com/safe-global/safe-deployments) and the threshold/owner invariants hold.

Because canonical singletons are deployed deterministically at identical addresses on every chain, detection works on any configured chain without external APIs. v1.0.0 proxies predate the `masterCopy()` special case and read as non-Safes.

`getSafeSingletonVersion(address)` is exported for callers that already have a singleton address and only need version recognition.

## Caching

Results are cached per `${chainId}:${account}` for `cacheMs` (default 5 minutes — threshold and owners can change), and concurrent probes for the same key share one RPC round-trip. RPC failures are not cached, so a later call retries.
