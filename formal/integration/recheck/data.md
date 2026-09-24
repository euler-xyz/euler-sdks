# Independent recheck of D01–D15

This recheck supersedes broader interpretations of the D01–D15 descriptions in `../data-review.md`. It compares the original SDK at `ff224741c251cae7673c5f835dcf3bbccd9d6605` (read with `git show HEAD:path`) with the current uncommitted fixes and the sources below. No production files were changed during this recheck.

“Confirmed” means the stated code path and consequence follow from the inspected implementation; it does not mean a deployed incident was observed. “Conditional” identifies a supported but unverified deployment/input condition. “Hardening” identifies invalid/custom configuration or additional compatibility rather than a defect in the normal first-party configuration. None of these items proves theft, an onchain enforcement bypass, or complete SDK correctness.

## Source identities and evidence boundaries

SDK paths below are relative to `packages/euler-v2-sdk/`; all **baseline** line numbers refer to the original SDK commit, not the changing working tree. Upstream paths are relative to these repository roots and commits:

| Label | Local source root | Commit |
| --- | --- | --- |
| EVC | `/private/tmp/euler-sdk-integration-review/ethereum-vault-connector` | `838e5f72eaea25fab7d242760245244226096054` |
| EVK | `/private/tmp/euler-sdk-integration-review/euler-vault-kit` | `bfb325a6e6ca09613d940b46f72ccfe017353933` |
| Periphery | `/private/tmp/euler-sdk-integration-review/evk-periphery` | `816c5943e5fab3a213e907dd5beaf9542305593a` |
| Earn | `/private/tmp/euler-sdk-integration-review/euler-earn` | `ea3dacc05f4003a1326815429d70d0c77f0dabb4` |
| Oracle | `/private/tmp/euler-sdk-integration-review/euler-price-oracle` | `bc70a37b9a22d57e5d47d144644617f9be62ba3a` |
| API | `/Users/kanv/Documents/euler/euler-data-v3` | `fc9485fe2d7a38028871c59f2540118fe2a5c691` |

The API checkout has untracked review directories; the inspected tracked source is unchanged. The OpenAPI artifact is `/private/tmp/euler-sdk-integration-review/openapi.json`, SHA256 `eb30fc696a5d90a15b1ca8ce0786abdf82480b423eb4cc418eeb64988279a8d9`. It is supplementary schema evidence, not an attestation of every live response. None of the pinned contract sources by itself establishes deployed-bytecode identity.

Independent current validation: `pnpm -C packages/euler-v2-sdk exec vitest run test/dataIntegrationParity.test.ts test/accountPortfolio.test.ts test/oracleOnchainParity.test.ts` passed **56 tests in 3 files**, with no type errors. This recheck did not rerun those tests against the original production tree. Baseline conclusions below come from original-code inspection and source-derived reproductions; the current passing tests must not be presented as an independently observed baseline red run.

## Findings

## D01 — Confirmed inherited conversion defect; snapshot fix has an explicit remaining limit

**Verdict:** Confirmed; snapshot fix adequate within its documented scope, with pending-fee parity still conditional.

**Baseline:** [src/entities/ERC4626Vault.ts:97–105](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/ERC4626Vault.ts#L97-L105) returns `assets` directly from `previewWithdraw`. [src/entities/EulerEarn.ts:141–153](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/EulerEarn.ts#L141-L153) overrides `convertToAssets` and `convertToShares`, but does not override `previewWithdraw`. Inheritance does not dispatch through those overrides because the inherited method literally returns its argument. [src/services/executionService/executionService.ts:2556–2598](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/executionService.ts#L2556-L2598) uses the preview for `planRedeem({ assets })`, then encodes a share-denominated redemption.

**Authority:** Earn [src/EulerEarn.sol:580–610,653–692](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/EulerEarn.sol#L580-L610) accrues fees and applies the virtual-adjusted conversion, ceiling for withdraw and floor for redeem. [src/libraries/ConstantsLib.sol:23](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/libraries/ConstantsLib.sol#L23) fixes the virtual amount at 1,000,000. Periphery [src/Lens/EulerEarnVaultLens.sol:32–33](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/EulerEarnVaultLens.sol#L32-L33) reads `totalSupply()` and `totalAssets()`; Earn [src/EulerEarn.sol:616–619,898–928](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/EulerEarn.sol#L616-L619) establishes that those snapshots omit the pending shares included by live conversions.

**Trigger/consequence:** Once the exchange rate differs from 1:1, the inherited share estimate is wrong. For valid yield-accrued Earn state, the original estimate generally uses **too many** shares: an asset-target redemption can return more assets than requested or revert if the user has enough assets but insufficient shares for that estimate. Earn explicitly describes its exchange rate as never below 1 (`:608`); below-1 test fixtures exercise algebra, not an established Earn state.

**Fix:** The entity now ceilings the snapshot conversion, which is adequate for its newly documented snapshot semantics. It is **not** a fee-aware live preview. Independently recomputing the source formulas confirms the report's example: supply 100,000,000, assets 120,000,000, prior assets 100,000,000, 20% fee => 3,452,991 pending fee shares; 1,000,000 assets needs 834,711 shares by snapshot versus 863,248 live, and the snapshot estimate redeems 966,942 assets after accrual. This shortfall is a separate mechanism from the original 1:1 overestimate. The accompanying execution fix routes populated Earn asset requests through exact `withdraw`, which lets the contract calculate shares after accrual. Current snapshot-rounding tests establish minimal sufficient shares at the stored rate, not live fee parity. Display conversions remain conditional approximations when fees are pending.

## D02 — Confirmed contract-parity defect in liquidation LTV display/calculation

**Verdict:** Confirmed; fixed for canonical contract-derived inputs.

**Baseline:** [src/entities/EVault.ts:240–259](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/EVault.ts#L240-L259) interpolates JavaScript fractional basis points when initial and target LTV differ, including increases.

**Authority:** EVK [src/EVault/shared/types/LTVConfig.sol:35–56](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/types/LTVConfig.sol#L35-L56) returns the target immediately for increases and completed ramps; a decreasing active ramp uses integer division at `:50–52`. Its setter at `:59–68` stores a canonical initial LTV and target timestamp.

**Trigger/consequence:** Active decreasing ramps can disagree by a fraction of one basis point; increases can be displayed as gradual despite immediate contract effect. This can alter an SDK threshold calculation near the boundary. It does not change the contract's liquidation rule.

**Fix/evidence:** The current comparison only ramps decreases and uses integer basis-point arithmetic. Tests cover decreasing 8500→8000 with integer truncation, an increase, and a completed ramp. Adequate for canonical contract-derived basis-point inputs; not a guarantee for arbitrary malformed entity values or stale timestamps.

## D03 — Conditional high-decimal compatibility defect, with a confirmed exception path

**Verdict:** Conditional compatibility defect; the exception is confirmed for UoA decimals above 18.

**Baseline:** [src/entities/EVault.ts:399–419](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/EVault.ts#L399-L419) computes `10n ** BigInt(18 - price.decimals)` for asset and collateral risk prices.

**Authority:** Periphery [src/Lens/VaultLens.sol:47–50](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/VaultLens.sol#L47-L50) uses the UoA token's decimals; [src/Lens/Utils.sol:140–148](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/Utils.sol#L140-L148) accepts a decoded `uint8` without an 18-decimal cap. EVK [src/EVault/shared/LiquidityUtils.sol:84–116](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/LiquidityUtils.sol#L84-L116) establishes liability ask, collateral bid, and liquidation midpoint directions.

**Trigger/consequence:** A valid returned UoA precision above 18 makes the BigInt exponent negative and the getter throws. No deployed vault using this configuration was established in this recheck.

**Fix/evidence:** Division replaces multiplication above 18 decimals; the 24-decimal fixture covers asset mid/ask and collateral mid/bid. Adequate to remove that exception and preserve units. Scaling down truncates to WAD precision: this is not a proof that SDK risk prices reproduce every contract rounding result.

## D04 — Confirmed owner-mode loss when only a secondary subaccount is discovered

**Verdict:** Confirmed; fixed when at least one owner-prefix subaccount was fetched successfully.

**Baseline:** [src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts:198–219,250–255](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts#L198-L219) fetches discovered subaccounts, then reads modes only from the entry whose account equals its owner, defaulting to false otherwise.

**Authority:** EVC [src/EthereumVaultConnector.sol:260–272](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L260-L272) stores owner and both modes in `ownerLookup[addressPrefix]`. Periphery [src/Lens/AccountLens.sol:107–121](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/AccountLens.sol#L107-L121) reads those modes using each account's prefix.

**Trigger/consequence:** A secondary subaccount is indexed and fetched successfully, the primary address has no discovered position, and one of the prefix-wide modes is true. Baseline reports it false despite already possessing the true value.

**Fix/evidence:** Falling back to any successfully fetched subaccount of that owner prefix is consistent with EVC semantics; the secondary-only regression preserves both flags. Empty discovery and complete read failure remain outside the fix. The source of discovered accounts is still trusted to respect the requested prefix.

## D05 — Confirmed balance loss on degraded API metadata; metadata completeness remains unresolved

**Verdict:** Confirmed; known balances preserved, missing metadata remains unknown.

**Baseline:** [src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts:292–332](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts#L292-L332) inspects only the first row's optional `subAccount`; if absent it returns `positions: []`, even when balance rows are valid.

**Authority:** API [src/application/services/account-discovery-service.ts:850–875](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/services/account-discovery-service.ts#L850-L875) constructs independently nullable balance and subaccount fields from snapshots. `:1203–1228` catches state-read failures and leaves existing metadata unchanged; it can remain null. [src/interface/http/routes/accounts.ts:547–586](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/routes/accounts.ts#L547-L586) serializes balances and `subAccount: null` independently. This is an implementation-supported degraded/cached response, not solely an optional-field interpretation of the schema.

**Trigger/consequence:** Known shares/assets/debt with absent metadata are silently removed from the SDK subaccount. Absence only on the first row also loses metadata that a later row supplies.

**Fix/evidence:** Search all rows for metadata and preserve converted balance rows when none exists. The regression retains the known 20-asset position and a diagnostic. Adequate for balance preservation, but owner/controller/collateral arrays and modes remain defaulted/unknown in this fallback. It would be incorrect to call the result complete executable account state. This is distinct from D06: missing metadata does not itself mean the balances are unknown.

## D06 — Confirmed unknown-to-zero conversion prevents configured fallback

**Verdict:** Confirmed; nullable balances now make the snapshot unavailable so configured fallback can run.

**Baseline:** [src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts:240–263,566–610](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts#L240-L263) accepts nullable balance fields and calls `parseBigIntField`; [src/utils/parsing.ts:20–38](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/parsing.ts#L20-L38) converts non-string input to zero plus a warning. The account still has a defined result (`accountV3Adapter.ts:443–499`). [src/utils/fallbackAdapter.ts:73–105,174–186](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/fallbackAdapter.ts#L73-L105) intentionally does not fall back for warnings on defined results. [src/sdk/buildSDK.ts:703–711](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/sdk/buildSDK.ts#L703-L711) wires the V3→onchain fallback when configured.

**Authority:** API [src/application/services/account-discovery-service.ts:850–875](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/services/account-discovery-service.ts#L850-L875) uses null for unavailable balances; the account route at [src/interface/http/routes/accounts.ts:549–551](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/routes/accounts.ts#L549-L551) preserves those values. OpenAPI `AccountPosition.borrowed` also distinguishes unknown null from string zero.

**Trigger/consequence:** Unknown shares, assets, or debt become known zero, concealing an incomplete snapshot and suppressing a configured second source. This requires a degraded response; a valid zero remains valid.

**Fix/evidence:** Any null/missing required balance makes the account snapshot unavailable and reports an error, enabling the existing fallback. Separate tests cover each field. This deliberately trades partial V3 availability for complete-balance semantics, and can invoke onchain discovery even if most rows were valid. It does not promise a fallback is configured, that fallback discovery is complete, or that every malformed numeric string is rejected by this change.

## D07 — Confirmed parseable subgraph-error handling defect

**Verdict:** Confirmed; parseable failure envelopes are rejected.

**Baseline:** [src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts:44–63,103–115](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts#L44-L63) and [src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.ts:52–72](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.ts#L52-L72) parse JSON without checking HTTP success or GraphQL errors, defaulting missing arrays to empty.

**Authority:** The [original SDK query and response accesses](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts#L44-L63) establish the expected data contract. No EVC/EVK contract controls HTTP/GraphQL response semantics. This finding does not need an assumed onchain state.

**Trigger/consequence:** A parseable HTTP error body, GraphQL error envelope, or missing data can appear to be empty discovery/unknown type. Narrow the original wording: socket errors and invalid JSON already throw in the baseline; not every transport failure was silently accepted.

**Fix/evidence:** HTTP status, GraphQL errors, and array-shape checks are adequate for the demonstrated cases; missing account-subgraph configuration now throws too. Tests cover HTTP 503, GraphQL errors, absent account data, and vault-type GraphQL failure. Partial GraphQL data accompanied by errors is now rejected as a whole. This is a defensible completeness policy, not a recovery mechanism or deep validation of every returned entity.

## D08 — Conditional truncation at the documented Graph default; narrower trigger than “100 requests”

**Verdict:** Conditional on documented Graph default and more than 100 matching prefix entities; chunking fix adequate.

**Baseline:** [src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts:29–76](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts#L29-L76) deduplicates owner prefixes but sends every unique prefix in one list query without `first`. [src/utils/callBundler.ts:58–61](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/callBundler.ts#L58-L61) defaults to unlimited batch size and a five-millisecond batching window.

**Authority:** [The Graph's querying documentation](https://thegraph.com/docs/en/subgraphs/querying/best-practices/) states the default collection result size is 100. This is official documentation evidence inspected on 2026-09-23, not a pinned deployed subgraph schema/Graph Node version or a live endpoint reproduction. No source SHA is claimed for that web page.

**Trigger/consequence:** More than 100 **distinct, existing indexed prefix entities**, on the same chain and in one bundle, can be truncated by that default. More than 100 repeated requests for one prefix, or 101 requests with only 100 matching entities, does not establish truncation. Missing returned entries become empty discovery through baseline lines 66–73 and 103–115.

**Fix/evidence:** Explicit `first: 100` with unique-prefix chunks of at most 100 is adequate assuming one result entity per prefix and the documented query semantics. The 101-prefix regression checks request shape and chunk sizes `[100, 1]`; it does not exercise a real server's truncation behavior. No improvement in indexer freshness, missing events, reorg handling, or global completeness is established. D07 and D08 share a file but have different triggers.

## D09 — Invalid-configuration hardening; distinguish the two failure mechanisms

**Verdict:** Hardening for invalid/custom configuration; specific nontermination mechanisms confirmed.

**Baseline:** [src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.ts:95–105,149–161](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.ts#L95-L105) accepts positive fractional `batchSize`, floors it, then increments an in-memory request-building loop by that value. [src/services/oracleAdapterService/oracleAdapterService.ts:376–407,437–467](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/oracleAdapterService/oracleAdapterService.ts#L376-L407) bounds `pageSize` with `Math.min/max` and uses it in empty/short-page termination.

**Authority:** The [original SDK batching implementation](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.ts#L149-L161) establishes the defect: the EVault failure happens before sending a request and is independent of an API implementation. The oracle case depends on what the configured query returns, so no normal live-API infinite loop is established.

**Trigger/consequence:** EVault `0 < batchSize < 1` produces zero and a synchronous non-advancing allocation loop. Oracle `pageSize=NaN` stays NaN; with repeated empty results lacking usable pagination metadata, `0 < NaN` is false and the request loop does not terminate. In contrast, oracle `Infinity` already became 100, and negative/0.5 values already became 1: they were not the same nontermination bug. A real server may reject a NaN limit before any loop repeats.

**Fix/evidence:** Finite integer-effective validation/defaulting prevents both demonstrated mechanisms. Current tests cover EVault 0.5 and normalized oracle invalid values. Adequate configuration hardening. Do not present all invalid-value fixtures as independently established hangs or any of these as a defect in the default configuration.

## D10 — Confirmed dead alias entries; first-party API impact not established

**Verdict:** Hardening for aliases; dead mappings confirmed, first-party API outage not established.

**Baseline:** [src/services/vaults/vaultMetaService/adapters/VaultTypeV3Adapter.ts:49–63,86–106](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/vaultMetaService/adapters/VaultTypeV3Adapter.ts#L49-L63) stores mixed-case `eulerEarn`/`securitizeCollateral` keys but normalizes lookup input to lowercase. It also has a resource-path fallback for Earn/EVK.

**Authority:** API [src/application/ports/vault-resolver-read-model.ts:1](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/ports/vault-resolver-read-model.ts#L1) defines canonical `evk | earn | securitize`, all handled correctly by baseline. [src/application/services/vault-resolver-service.ts:24–69](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/services/vault-resolver-service.ts#L24-L69) returns those values and builds the Earn/EVK resource path.

**Trigger/consequence:** An alternate/custom response using one of the SDK's intended aliases, without a recognized resource fallback, can resolve as unknown. An Earn alias with the ordinary `/v3/earn/vaults/…` resource already recovers. Current first-party alias emission is **not established** and is contradicted by the inspected canonical producer type.

**Fix/evidence:** Lowercase keys repair the SDK's dormant alias mappings. The two synthetic alias tests omit resource, correctly reaching the defect. Classify this as compatibility hardening, not a demonstrated current V3 classification outage. “Advertised” should mean intended entries in the SDK map; the nearby config documentation only advertises canonical examples.

## D11 — Confirmed internal aggregate-yield inconsistency, not onchain yield accounting

**Verdict:** Confirmed internal display inconsistency; context fix adequate, reward economics not independently validated.

**Baseline:** [src/entities/Portfolio.ts:628–676](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/Portfolio.ts#L628-L676) creates aggregate borrowed yield entries with only vault and borrowed USD value. The individual borrow getter already delegates to `borrowYieldPositions` at `:240–254`, whose implementation at `:738–766` adds collateral addresses, multiplier, and equity.

**Authority/intent:** Original SDK [src/utils/accountComputations.ts:664–704](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/accountComputations.ts#L664-L704) explicitly gates BORROW_COLLATERAL and LOOPING rewards on that context; `:807–853` matches collateral addresses and multiplier bounds. These existing SDK business rules, not an EVM contract, are the relevant authority for the claim that aggregate and individual views should be consistent. This recheck does not validate campaign APRs, reward eligibility policies, or realized income against a reward provider.

**Trigger/consequence:** A portfolio with an otherwise eligible collateral-dependent/looping reward displays less reward contribution in its aggregate breakdown than in the corresponding individual borrow breakdown. Ordinary BORROW rewards do not need the missing context and are unaffected.

**Fix/evidence:** Reusing the existing helper preserves the filtered collateral set and supplies the same context. Current BORROW_COLLATERAL and LOOPING tests assert agreement for a single-borrow portfolio with known values. Adequate to fix the omitted-context mechanism. They are not proof of complete multi-position aggregation, pricing completeness, every eligibility edge, or investment performance.

## D12 — Confirmed stale derived values after repeated population

**Verdict:** Confirmed; stale derived values cleared on refresh.

**Baseline:** [src/entities/Account.ts:813–843](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/Account.ts#L813-L843) updates position USD fields only when the new price exists, and borrowed USD only for positive debt. Collateral market price is also assigned only when present. Original [src/entities/ERC4626Vault.ts:116–129](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/ERC4626Vault.ts#L116-L129) explicitly replaces a missing/failed price with undefined, so the stale-value transition is reachable through the ordinary population methods.

**Authority:** The [original vault price-refresh method](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/ERC4626Vault.ts#L116-L129) establishes replaceable price state; this is a local derived-data lifecycle defect, not a contract mismatch.

**Trigger/consequence:** Populate prices, then populate again after a price disappears, or after the same account entity's debt changes to zero. Old prices, supplied values, or borrowed values survive and can mislead portfolio display. Merely constructing a fresh account does not exhibit retained instance state.

**Fix/evidence:** Clear derived position fields before recomputing and assign collateral market price even when unavailable. The repeated-population test covers disappearance and debt repayment. Adequate for the demonstrated stale fields; undefined debt valuation after zero debt follows the existing unset-value convention. Partial aggregate valuation and stale upstream snapshots are separate unresolved concerns.

## D13 — Confirmed suppressed diagnostics on enrichment fallback

**Verdict:** Confirmed diagnostics defect; fixed, complementary to shared prepend validation.

**Baseline:** [src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.ts:182–185,244–290](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.ts#L182-L185) marks a second pass before it succeeds. On absent result/exception it returns the initial vault, but selects the absent final-pass diagnostic array instead of the initial errors. [src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts:458–487](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts#L458-L487) similarly falls back to an ordinary lens query without reporting enrichment failure.

**Authority:** EVC [src/EthereumVaultConnector.sol:619–638](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L619-L638) demonstrates that simulation collects individual call success/results; the SDK adapter's catch/undefined paths above independently establish fallback reachability. Failure can also arise from RPC or plugin exceptions. No assumption that all simulations fail is required.

**Trigger/consequence:** An enrichment attempt fails after an initial vault read that already had oracle diagnostics; the ordinary snapshot survives but warnings about its deficiencies disappear. The account branch conceals the failed enrichment while returning its ordinary result. The claim is about diagnostics and snapshot quality visibility, not newly corrupted raw balances.

**Fix/evidence:** Current fallback preserves initial errors and adds a `batchSimulation` warning; successful final-pass errors replace initial errors as intended. Tests exercise absent enrichment and original lens errors. Adequate. This is complementary to shared prepend-result validation, not a duplicate of the separate issue where failed prepend calls were mistaken for successful enrichment.

## D14 — Confirmed reverse CrossAdapter route rejection; Pyth effect is conditional

**Verdict:** Confirmed route-decoding defect; downstream Pyth-update consequence conditional.

**Baseline:** [src/utils/oracle.ts:684–705](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/oracle.ts#L684-L705) accepts only the configured base→quote direction. Original [src/plugins/pyth/pythPlugin.ts:810–836](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/pyth/pythPlugin.ts#L810-L836) collects read-prepend feeds from the selected route and returns no update when that route yields no feeds.

**Authority:** Oracle [src/adapter/CrossAdapter.sol:29–36,45–60](https://github.com/euler-xyz/euler-price-oracle/blob/bc70a37b9a22d57e5d47d144644617f9be62ba3a/src/adapter/CrossAdapter.sol#L29-L36) explicitly requires bidirectional component oracles and executes quote/cross then cross/base for inverse quotes.

**Trigger/consequence:** Querying the reverse of an otherwise valid configured CrossAdapter pair returns no decoded route in baseline. If that route contains a relevant Pyth leaf and no alternative prefetched route supplies it, read enrichment can omit the update. A deployed inverse/Pyth combination was not independently located, so the production Pyth consequence remains conditional. Missing route alone is established.

**Fix/evidence:** The current decoder checks forward/inverse identity, visits inverse legs in contract order with reversed pair context, and rejects unrelated pairs. The inverse-Pyth regression confirms the leaf survives. Adequate for this supported tree shape; no general proof of nested/custom oracle route completeness or price freshness follows.

## D15 — Confirmed mixed-chain public-method defect; normal single-chain calls unaffected

**Verdict:** Confirmed for mixed-chain public-method inputs; partitioning fix adequate.

**Baseline:** [src/services/vaults/eVaultService/eVaultService.ts:235–271,343–352](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/eVaultService.ts#L235-L271) groups collateral addresses without chain identity and fetches them using `eVaults[0].chainId`. [src/services/vaults/eulerEarnService/eulerEarnService.ts:254–297,348–355](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eulerEarnService/eulerEarnService.ts#L254-L297) does the same for strategy vaults. These public array-taking methods do not accept a separate chain argument or declare a homogeneous-chain precondition.

**Authority:** The [original chain-specific vault lookup](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/eVaultService.ts#L264-L271) defines the required lookup identity; the strategy service uses the same chain/address contract. No onchain contract can make an address globally identify one vault across chains.

**Trigger/consequence:** A caller supplies a heterogeneous array; all addresses are fetched on the first chain. Identical addresses on different chains can attach that first chain's entity to another chain's parent. A normal single-chain `fetchVaults` flow does not itself demonstrate this bug.

**Fix/evidence:** Current population partitions parents by chain, preserves fetch options, runs each original single-chain flow, and combines diagnostics. The same-address chain-1/chain-10 regression checks attached identities. Adequate for the mixed-array mechanism, without attesting to deployed address inventories or external adapters that themselves return incorrect identities.

## Overall assessment

No D01–D15 item was wholly refuted at its narrowed scope. D09 and D10 should be presented as hardening/compatibility rather than ordinary production outages. D03, D08, and the downstream Pyth consequence of D14 require explicit configuration/deployment conditions. D01's snapshot correction is intentionally incomplete as a live preview; the separate exact-asset execution change addresses the identified redemption consumer. D05's retained balances do not make missing controller metadata known. D11 establishes consistency with existing SDK reward rules, not correctness of the reward economy.

The inspected fixes address their demonstrated mechanisms without a new confirmed defect found in this recheck. The verification consists of original/source comparisons, independent arithmetic, and deterministic mocked regression execution. It does not establish deployment reachability for every condition, complete data discovery, absence of all bugs, or a formal end-to-end proof.
