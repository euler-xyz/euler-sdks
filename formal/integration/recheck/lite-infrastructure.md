# Infrastructure findings through Euler Lite

Public master `e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1`; published SDK3.3.0 verified against the lockfile. The previously reviewed development snapshot has identical infrastructure paths. Source reachability is distinct from a demonstrated browser/production incident.

## I01 — Server cache, browser bypasses it

**conditional-server**. Lite browser passes sdkBuildQuery/sdkFreshBuildQuery backed by TanStack, so the SDK default cache race does not describe the browser cache. The server builds a shared per-chain SDK without a custom wrapper. Concurrent labels/public-metadata and vault snapshot work can share underlying queries; an old read lasting longer than the default five-second TTL can be overtaken and overwrite a newer result. Same-route in-flight dedup reduces opportunities.

Controlled default SDK-cache reproduction passes; full concurrent server-route reproduction not performed.

Evidence: [utils/sdk-query-cache.ts:49](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/sdk-query-cache.ts#L49), [composables/useEulerSdk.ts:315](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L315), [server/utils/sdk-server.ts:119](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/server/utils/sdk-server.ts#L119), [server/utils/labels-view.ts:136](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/server/utils/labels-view.ts#L136), [server/utils/vaults-cache.ts:224](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/server/utils/vaults-cache.ts#L224).

## I02 — No triggering Lite batching configuration

**not-normal**. Lite does not import the exported call bundlers or configure their zero-delay/concurrency/synchronous-callback trigger. Built-in SDK callbacks retain their ordinary defaults.

Source tracing; no Lite reproduction.

Evidence: [composables/useEulerSdk.ts:180](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L180), [server/utils/sdk-server.ts:105](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/server/utils/sdk-server.ts#L105).

## I03 — No invalid sizes or aggregate helper usage

**not-normal**. The exported aggregate helper is not used by Lite. Its rEUL lock call supplies chain/account/contract and leaves batchSize at the safe default.

Source tracing; no Lite reproduction.

Evidence: [composables/useREULLocks.ts:57](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useREULLocks.ts#L57).

## I04 — Pyth-enriched account and vault reads

**reachable**. Lite installs Pyth on its fresh/onchain SDK and uses that instance for portfolio reads. If an update call fails but the lens read succeeds, published3.3.0 accepts the final result. The oracle adapter price panel also independently slices off update results without checking them; an SDK helper fix alone does not repair that separate Lite logic. Existing prices may still be valid.

Published helper reproduced with ABI-encoded failed-update/successful-read output; no live failing oracle or browser session.

Evidence: [composables/useEulerSdk.ts:324](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L324), [composables/useEulerAccount.ts:149](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerAccount.ts#L149), [composables/useOracleAdapterPrices.ts:278](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useOracleAdapterPrices.ts#L278).

## I05 — Same issue as E09

**duplicate**. Use E09 classification and call-chain evidence in lite-execution.md.

Duplicate, not another finding.

Evidence: [composables/useEulerSdk.ts:324](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L324).

## I06 — Pyth fee cache key is used, live failure unestablished

**conditional-upstream**. Lite uses PythPluginAdapter and preserves its custom cache-key function through the TanStack wrapper. Differing duplicate multiplicities can collide. Normal feed IDs are deduplicated, and no ordinary Hermes response with the needed blob pattern or nonzero fee deployment was established.

Published cache collision reproduced with synthetic inputs. This does not establish a production fee failure.

Evidence: [utils/pyth.ts:22](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/pyth.ts#L22), [utils/pyth.ts:382](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/pyth.ts#L382), [utils/sdk-query-cache.ts:52](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/sdk-query-cache.ts#L52), [utils/sdk-query-policy.ts:172](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/sdk-query-policy.ts#L172).

## I07 — Keyring gated transaction preparation

**reachable**. Lite installs the Keyring plugin with hook targets and a credential callback. A failed gate/config/credential read can be silently skipped; the later transaction preview can fail for missing credentials. Lite caches credentials by chain/account/hook/policy and checks expiration and current Keyring address, narrowing the wrong-identity callback case. Onchain access control remains intact.

Source-reachable failure path; no live gated-vault failure induced.

Evidence: [composables/useEulerSdk.ts:325](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L325), [utils/sdk-keyring.ts:20](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/sdk-keyring.ts#L20), [utils/sdk-keyring.ts:59](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/sdk-keyring.ts#L59), [features/reviewed-execution/planning/plugin-data.ts:28](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/features/reviewed-execution/planning/plugin-data.ts#L28).

## I08 — Fallback deployment without configured V3

**conditional-config**. Lite explicitly sets disableV3 when fallback is selected and V3 is absent; the SDK retains built-in V3 dependencies. Lite additionally installs its own intrinsic-APY service explicitly using V3. Consequently a fix to disabled SDK defaults alone cannot promise that Lite becomes wholly RPC-only.

Source trace for supported deployment mode; active production environment not inspected.

Evidence: [composables/useEulerSdk.ts:236](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L236), [composables/useEulerSdk.ts:305](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L305), [server/utils/sdk-server.ts:115](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/server/utils/sdk-server.ts#L115).

## I09 — Entity reuse and mixed-chain trigger not demonstrated

**not-normal**. Ordinary vault refresh creates new entities; snapshot enrichment runs on newly hydrated entities and requests are chain-specific. No normal Lite flow was found that refreshes SDK labels/APY on the same old populated object after removal, or passes mixed-chain labels to populateLabels. Lite also has its own only-set-if-present APY wrapper, so merely fixing the SDK method would not fix a hypothetical reuse through that wrapper.

Affected SDK methods and analogous Lite wrapper exist; user-visible trigger not established.

Evidence: [utils/yuzu-intrinsic-apy.ts:118](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/yuzu-intrinsic-apy.ts#L118), [composables/useVaults.ts:659](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useVaults.ts#L659), [composables/useVaults.ts:682](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useVaults.ts#L682), [utils/euler-labels-fetch.ts:4](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/utils/euler-labels-fetch.ts#L4).

## I10 — Wallet token balances and input limits

**reachable**. Lite uses walletService.fetchWallet for token balances and copies the returned balances into its wallet map. If the token balanceOf reverts but UtilsLens supplies zero, no outer error reaches Lite diagnostics; balance can look zero and limit supply/swap input. Requires a token read that actually fails.

Source call-chain confirmed; no live failing token selected.

Evidence: [composables/useWallets.ts:163](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useWallets.ts#L163), [composables/useWallets.ts:176](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useWallets.ts#L176), [composables/useWallets.ts:182](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useWallets.ts#L182).

## I11 — No custom undefined-throw adapter or callback

**not-normal**. Lite configures standard adapters and does not register onFallback. The demonstrated undefined-rejection custom-adapter case and missing notification have no normal Lite-specific trigger/consumer. Ordinary dual-source failures still propagate.

Source tracing; no Lite reproduction.

Evidence: [composables/useEulerSdk.ts:315](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/composables/useEulerSdk.ts#L315), [server/utils/sdk-server.ts:122](https://github.com/euler-xyz/euler-lite/blob/e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1/server/utils/sdk-server.ts#L122).
