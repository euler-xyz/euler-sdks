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
- `threshold` - configured owner-signature threshold for owner-authorized Safe transactions (enabled Safe modules can execute via `execTransactionFromModule` without owner confirmations; the probe does not inspect modules or guards)
- `owners` - current Safe owners (checksummed)

## Detection model

Safe proxies (v1.1.1+) special-case the `masterCopy()` selector in their fallback and return the singleton address stored at slot 0. The probe fires `masterCopy()`, `getThreshold()`, and `getOwners()` concurrently — providers built by the SDK's `ProviderService` batch them into one multicall RPC request (custom `IProviderService` implementations without batching issue three) — and accepts the address as a Safe only when the singleton matches a known canonical deployment from [`safe-deployments`](https://github.com/safe-global/safe-deployments) and the threshold/owner invariants hold.

Because canonical singletons are deployed deterministically at identical addresses on every chain, detection works on any configured chain without external APIs. v1.0.0 proxies predate the `masterCopy()` special case and read as non-Safes.

Owner invariants mirror what Safe's `OwnerManager` enforces since v1.3.0: a threshold below 1 or above the owner count, zero or sentinel (`0x…01`) owners, duplicate owners, and self-ownership (the Safe listed as its own owner, GS203) are all rejected as lookalikes.

**Known limitation:** the self-ownership rule is deliberately applied to every allowlisted version, although Safe v1.1.1/v1.2.0 permitted a Safe to list itself as an owner (the restriction arrived in v1.3.0). A canonical legacy Safe configured that way therefore reads as a non-Safe — `null`, cached like any other negative result until the TTL expires. Such configurations are vanishingly rare, and self-ownership is otherwise a strong lookalike signal, so the strict check is preferred over version-aware validation.

`getSafeSingletonVersion(address)` is exported for callers that already have a singleton address and only need version recognition.

**Detection is a display/UX heuristic.** A purpose-built contract can mimic `masterCopy()`, `getThreshold()`, and `getOwners()` and pass these checks without being a real Safe proxy (that would require validating the proxy runtime bytecode). Use the result for badges, labels, and flow selection — never for authorization decisions.

## Caching and failure semantics

Results are cached per `${chainId}:${account}` for `cacheMs` (default 5 minutes — threshold and owners can change), and concurrent callers for the same key share one in-flight three-read probe.

Contract-level failures (empty call data from an EOA, revert from a non-Safe contract, malformed non-empty response data that fails ABI decoding) resolve to `null` and are cached like any other result. Transport-level failures (HTTP errors, timeouts, rate limits) make `fetchSafeAccount` reject instead — they are never cached as negative detections, so a later call retries.
