# Position Migration Service

`positionMigrationService` moves an existing lending position between an
external protocol (Aave V3, Morpho Blue, Morpho Vaults / MetaMorpho) and Euler,
in a single atomic EVC batch, without first closing the user's borrow exposure.

It handles three concerns:

- discovering migratable source positions and candidate migration targets through
  pluggable **connectors**
- producing the protocol-specific **authorization** the user must sign (aToken
  permit, debt delegation, Morpho authorization, vault-share permit)
- building an EVC batch / `TransactionPlan` that borrows on the destination,
  repays the source, moves collateral, and (optionally) swaps collateral or debt
  assets along the way

`executionService` stays generic: it converts the migration batch into a
`TransactionPlan` and executes it, but it does not know how to read an Aave
reserve or encode a Morpho authorization. That protocol knowledge lives in the
connectors.

> Same-asset, intra-Euler collateral/debt migration is a different feature and
> lives on `executionService` (`planMigrateSameAssetCollateral`,
> `planMigrateSameAssetDebt`). This service is for **cross-protocol** position
> migration.

## Directions

Every operation is parameterized by a `direction`:

- `external-to-euler` — pull a position out of Aave/Morpho/MetaMorpho into an
  Euler vault pair (the destination is an **Euler target** the caller supplies).
- `euler-to-external` — push an Euler position into an external protocol (the
  destination is an **external market**, optionally discovered via `listTargets`).

## Connectors and supported flows

Connectors are registered by `id`. `buildEulerSDK` wires the three built-in
connectors by default.

| Connector `id` | Protocol | `external-to-euler` | `euler-to-external` | Authorization (typed-data / transaction) |
|---|---|---|---|---|
| `aave` | Aave V3 | Yes | Yes | in: `aTokenPermit` / `aToken.approve`; out: `variableDebtDelegation` / `variableDebtToken.approveDelegation` |
| `morpho` | Morpho Blue | Yes | Yes | `Authorization` via `setAuthorizationWithSig` / `morpho.setAuthorization` |
| `metamorpho` | Morpho Vaults | Yes | — | `metamorphoPermit` (vault-share EIP-2612) / `vault.approve` |

Notes:

- MetaMorpho migration is **supply-only** (no borrow leg) and inbound only.
- Aave and Morpho outbound flows **reject swap quotes** — outbound migration
  moves like-for-like assets and finishes by proving the source debt is fully
  repaid.
- Which `connectorId:direction` pairs are live is gated by an internal
  `ENABLED_MIGRATIONS` allowlist. A disabled pair throws
  `External position migration is temporarily disabled ...`. Currently enabled:
  `aave` (both), `morpho` (both), `metamorpho:external-to-euler`.

Use `getConnectors()` to enumerate registered connectors and
`getConnectorProtocolAddress(connectorId, chainId)` for the on-chain protocol
address (e.g. the Aave pool or Morpho singleton).

## Core types

- `MigrationPosition` — a normalized source/target position:
  `{ connectorId, protocol, id, chainId, owner, ref, debt, collateral, raw }`,
  where `debt`/`collateral` are `{ asset, amount, shares? }`.
- `MigrationTarget` — a candidate destination market from `listTargets`:
  `{ connectorId, protocol, id, chainId, ref, debt, collateral, liquidity?, raw? }`.
- `EulerMigrationTarget` — the Euler destination for `external-to-euler`:
  `{ eulerAccount, collateralVault, borrowVault?, swapper?, borrowAmount?, interestBufferBps?, minCollateralAssets?, enableController?, enableCollateral?, collateralSwapVerification? }`.
- `EulerMigrationSource` — the Euler origin for `euler-to-external`:
  `{ eulerAccount, borrowVault, collateralVault, swapper?, debtAmount?, collateralAmount?, collateralShares? }`.
- `ExternalMigrationTarget` — external-destination overrides for `euler-to-external`:
  `{ positionRef?, borrowAmount?, collateralAmount?, repayAmount?, interestBufferBps? }`.
- `MigrationAuthorizationRequest` — a discriminated union of
  `{ kind: "typedData", typedData: { domain, types, primaryType, message } }` and
  `{ kind: "transaction", call?, revocation? }`, where each call is a
  `MigrationAuthorizationCall` (`{ to, abi, functionName, args, value? }`).
  Connectors emit `typedData` by default and `transaction` when
  `authorizationKind: "transaction"` is requested — see
  [Contract wallets](#contract-wallets-authorizationkind-transaction). Built-in
  transaction requests always include `revocation`; `call` is omitted when no
  prerequisite grant is needed, and the shared fields remain optional for
  custom-connector compatibility. A request may carry a nested
  `postMigrationAuthorization` (used when a typed-data authorization is revoked
  in-batch after the migration).
- `SignedMigrationAuthorization` — `{ request, signature?, data?, postMigrationAuthorization? }`;
  this is what you pass back into `planMigration` after signing.

The connector reference (`positionRef` / `ref`) differs per protocol:

- Aave: `AavePositionRef` — `{ collateralAsset, debtAsset?, pool? }`
- Morpho: `MorphoMarketParams` — `{ loanToken, collateralToken, oracle, irm, lltv }`
- MetaMorpho: `{ vault, version: "v1" | "v2" }`

## API surface

Discovery and reads:

- `getConnectors()` / `getConnector(id)` / `registerConnector(connector)`
- `getConnectorProtocolAddress(connectorId, chainId)`
- `getPosition({ connectorId, chainId, owner, positionRef })`
- `listPositions({ connectorId?, chainId, owner, positionRefs? })` — omit
  `connectorId` to fan out across connectors
- `listTargets({ connectorId?, chainId, direction, debtAsset, collateralAsset, minLiquidity? })`
  — candidate destination markets (used mainly for `euler-to-external`); with no
  `connectorId` it aggregates enabled connectors and only throws if **every**
  connector fails.

Authorization and plan building:

- `getAuthorization({ direction, connectorId, chainId, owner, position | positionRef, target | source, externalTarget?, deadline?, authorizationKind?, removeAuthorizationAfterMigration?, account? })`
  — returns the request to sign or, with `authorizationKind: "transaction"`,
  the prerequisite and cleanup calls. It returns `undefined` when the connector
  requires neither action.
- `buildMigrationBatch(args)` — the raw `EVCBatchItem[]`.
- `planMigration(args)` — `buildMigrationBatch` + `convertBatchItemsToPlan`,
  returning a `TransactionPlan` (operation name defaults to `"positionMigration"`).
- `planMigrationSimulation(args)` — a simulation-ready result (see below).

## End-to-end: external → Euler (Aave example)

```typescript
import {
  AAVE_CONNECTOR_ID,
  buildEulerSDK,
  getSubAccountAddress,
  type AavePositionRef,
} from "@eulerxyz/euler-v2-sdk";
import { mainnet } from "viem/chains";

const sdk = await buildEulerSDK();
const owner = "0xYourEOA";
const eulerAccount = getSubAccountAddress(owner, 9);

const positionRef: AavePositionRef = {
  pool: AAVE_POOL,
  collateralAsset: WETH_ADDRESS,
  debtAsset: USDC_ADDRESS,
};

// 1. Read the source position
const position = await sdk.positionMigrationService.getPosition({
  connectorId: AAVE_CONNECTOR_ID,
  chainId: mainnet.id,
  owner,
  positionRef,
});

// 2. Resolve + sign the authorization (undefined => already authorized)
const target = {
  eulerAccount,
  borrowVault: EULER_USDC_VAULT,
  collateralVault: EULER_WETH_VAULT,
};
const request = await sdk.positionMigrationService.getAuthorization({
  direction: "external-to-euler",
  connectorId: AAVE_CONNECTOR_ID,
  chainId: mainnet.id,
  owner,
  position,
  target,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
});
const authorization = request
  ? { request, signature: await walletClient.signTypedData({
      account: walletAccount,
      domain: request.typedData.domain,
      types: request.typedData.types,
      primaryType: request.typedData.primaryType,
      message: request.typedData.message,
    }) }
  : undefined;

// 3. Build and execute the plan
const plan = await sdk.positionMigrationService.planMigration({
  direction: "external-to-euler",
  connectorId: AAVE_CONNECTOR_ID,
  chainId: mainnet.id,
  owner,
  position,
  target,
  authorization,
});

await sdk.executionService.executeTransactionPlan({
  plan,
  chainId: mainnet.id,
  account: owner,
  /* signer callbacks */
});
```

## End-to-end: Euler → external (Morpho example)

Outbound migration reads the Euler source amounts, signs a Morpho
authorization for the SwapVerifier, and settles the external position. Supply
the source debt/collateral amounts explicitly, or pass an `account` snapshot and
let the connector resolve them.

```typescript
const source = {
  eulerAccount,
  borrowVault: EULER_USDC_VAULT,
  collateralVault: EULER_WETH_VAULT,
  debtAmount,
  collateralAmount,
  collateralShares,
};
const externalTarget = { interestBufferBps: 1n };

const request = await sdk.positionMigrationService.getAuthorization({
  direction: "euler-to-external",
  connectorId: MORPHO_CONNECTOR_ID,
  chainId: mainnet.id,
  owner,
  position: targetMarketPosition, // getPosition against the destination MorphoMarketParams
  source,
  externalTarget,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
});

const plan = await sdk.positionMigrationService.planMigration({
  direction: "euler-to-external",
  connectorId: MORPHO_CONNECTOR_ID,
  chainId: mainnet.id,
  owner,
  position: targetMarketPosition,
  source,
  externalTarget,
  authorization, // { request, signature } or undefined
});
```

For `euler-to-external` the service always appends an item that disables the
source borrow controller. Pass `cleanupEulerPosition: true` (with an `account`
snapshot) to also disable and sweep the source sub-account's secondary
collaterals back to the owner.

## Authorization and signing

In the default typed-data form, `getAuthorization` may return `undefined` when
the on-chain allowance/authorization already covers the migration, so always
guard for it before signing. Otherwise sign `request.typedData` and pass
`{ request, signature }` as `authorization`.

Per-connector authorizations:

- **Aave inbound** — EIP-2612 `Permit` on the aToken for the SwapVerifier
  (`authorizationType: "aTokenPermit"`).
- **Aave outbound** — `DelegationWithSig` on the variable-debt token
  (`authorizationType: "variableDebtDelegation"`).
- **Morpho** — a single `Authorization` message consumed via
  `setAuthorizationWithSig`, granting the SwapVerifier a standing authorization.
  With `removeAuthorizationAfterMigration: true` the connector attaches a paired
  revocation as `postMigrationAuthorization`. Morpho typed-data requests do not
  carry an `authorizationType` discriminator, so identify them by `connectorId`
  and primary type; transaction requests use
  `authorizationType: "morphoAuthorization"`.
- **MetaMorpho** — EIP-2612 `Permit` on the vault-share token
  (`authorizationType: "metamorphoPermit"`). `version: "v1"` covers v1/v1.1
  (domain resolved via `eip712Domain()`); `version: "v2"` uses the minimal
  `{ chainId, verifyingContract }` domain.

### Contract wallets: `authorizationKind: "transaction"`

Aave, Morpho, and MetaMorpho verify their permit / delegation / authorization
signatures without an ERC-1271 fallback, so a contract wallet (e.g. a Safe)
cannot satisfy the typed-data form. Pass
`authorizationKind: "transaction"` to `getAuthorization` and the connector
returns a `msg.sender`-authenticated grant instead:

```ts
const request = await sdk.positionMigrationService.getAuthorization({
  direction: "external-to-euler",
  connectorId: "aave",
  chainId,
  owner,
  position,
  target,
  authorizationKind: "transaction",
});

if (request?.kind === "transaction") {
  // Use the owner-controlled client (for example, the Safe execution path),
  // adapt the SDK's `to` field to viem's `address`, and wait for confirmation.
  const sendAndConfirm = async ({ to, ...call }: MigrationAuthorizationCall) => {
    const hash = await ownerWalletClient.writeContract({ address: to, ...call });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Authorization transaction ${hash} reverted`);
    }
    return receipt;
  };

  // 1. Confirm the grant when one is required.
  if (request.call) {
    await sendAndConfirm(request.call);
  }

  // 2. Build without an `authorization` — the connector reads the live
  //    allowance and omits the authorization item from the batch.
  const plan = await sdk.positionMigrationService.planMigration({
    ...args,
    removeAuthorizationAfterMigration: false,
  });
  const result = await sdk.executionService.executeTransactionPlan({
    ...execution,
    plan,
  });
  // Retain any core hash from `result.hashes` in application state.

  // 3. The returned result contains terminal receipts, so cleanup is safe.
  if (request.revocation) {
    await sendAndConfirm(request.revocation);
  }
}
```

The snippet shows the confirmed happy path. The consuming application owns
failure classification and durable cleanup:

1. Confirm the grant before building the migration.
2. Execute the migration and retain any returned core hash.
3. Revoke after a known no-dispatch outcome or a terminal core receipt.
4. If submission status is unknown, persist the cleanup and reconcile the core
   transaction before revoking.

A missing hash alone does not prove that nothing was dispatched. Wallet- and
provider-specific prompt-rejection classification belongs in the consuming
application.

Per connector the grant is `aToken.approve` (inbound Aave),
`variableDebtToken.approveDelegation` (outbound Aave),
`morpho.setAuthorization` and `vault.approve` (MetaMorpho shares). Each
`revocation` restores the prior allowance, except Morpho cleanup always disables
the SwapVerifier authorization because that standing authorization is owned by
the migration flow.

Constraints:

- **Mine the grant before building.** The connectors read the live allowance to
  decide whether the batch still needs an authorization item; a grant that has
  not landed makes `planMigration` throw "… is required".
- **The grant cannot be a batch item.** The EVC forwards batch items with itself
  as `msg.sender`, so an in-batch `approve` would grant from the EVC.
- **`deadline` and `removeAuthorizationAfterMigration` do not apply.** A
  `msg.sender` grant carries no expiry, and the revocation is always returned;
  the in-batch disable needs a signature this form cannot supply.
- **Revoke only after a known terminal or no-dispatch outcome.** A successful or
  reverted core receipt is terminal, and a planning failure before core dispatch
  is a known no-dispatch outcome. If dispatch or receipt status is unknown, keep
  the authorization active, persist the pending cleanup, and reconcile the core
  transaction before revoking it.
- **Report cleanup separately.** A reverted or unconfirmed revocation is a
  cleanup failure. Preserve the primary migration error and surface both, for
  example with `AggregateError`; a cleanup error must not replace the primary.
- Morpho transaction authorization always returns cleanup while authorization
  stands. Its `call` is omitted when already authorized, so callers do not send
  a redundant grant but still revoke after the migration reaches a known safe
  cleanup point.

## Simulation

`planMigrationSimulation(args)` builds the migration batch exactly once and
returns:

- `plan` — an execution-ready plan with the required authorization represented
  by `stateOverrides` that force the allowance/authorization storage slot. This
  lets you dry-run the migration without a real signature or mined grant.
- `stateOverrides` — the `StateOverride[]` to pass to the simulator alongside
  `plan`. Cleanup-only requests rely on the already-active on-chain state and
  need no grant override.
- `previewPlan` — the calldata preview. Typed-data requests include their
  stub-signed authorization call (or your signature if supplied); transaction
  grants stay outside the EVC batch, so they are not included.
- `authorizationRequest?` — the request the user must sign or send at execution
  time, resolved internally so you don't need a separate `getAuthorization`
  call. Pass `authorizationKind: "transaction"` to simulate the contract-wallet
  flow before mining its grant.

Feed `plan` + `stateOverrides` into
`executionService.simulateTransactionPlan(...)` for a pre-trade safety check, and
gate execution on `canExecute` as with any other plan.

## Collateral and debt swaps

`external-to-euler` migrations can change the collateral and/or debt asset by
attaching swap quotes from `swapService`:

- `collateralSwapQuote` — swaps the source collateral into the target collateral
  vault asset.
- `debtSwapQuote` — swaps the target borrow asset into the source debt asset.

Quotes must target the Euler Swapper, and `buildMigrationBatch` validates that
each quote's `tokenIn`/`tokenOut` line up with the source position and the target
vault assets (mismatches throw). `EulerMigrationTarget.collateralSwapVerification`
controls how swapped collateral is credited:

- `"skim"` (default) — routes swap output to the target EVault and skims it
  (EVault targets only).
- `"deposit"` — routes output to the SwapVerifier and deposits via
  `verifyAmountMinAndDeposit`, which works for any ERC-4626 target (e.g.
  EulerEarn). Requires a supply-only migration and a quote requested with
  `transferOutputToReceiver`.

Outbound (`euler-to-external`) migrations do not accept swap quotes.

## Configuration

Configure via `buildEulerSDK`:

```typescript
const sdk = await buildEulerSDK({
  positionMigrationServiceConfig: {
    // includeDefaultConnectors: false, // drop aave/morpho/metamorpho
    // connectors: [myCustomConnector],
  },
  positionMigrationConnectorConfig: {
    aave: { /* poolAddresses, deployments, graphqlEndpoint, defaultInterestBufferBps, referralCode */ },
    morpho: { /* morphoAddresses, morphoGraphqlUrl, defaultInterestBufferBps, defaultMinLiquidity */ },
    metamorpho: {},
  },
});
```

- `positionMigrationServiceConfig.includeDefaultConnectors: false` registers no
  built-in connectors (use with `connectors: [...]` for a fully custom setup).
- `positionMigrationServiceConfig.connectors` appends extra connectors.
- `positionMigrationConnectorConfig.{aave,morpho,metamorpho}` passes per-connector
  options (protocol addresses, GraphQL endpoints for target discovery, default
  interest buffers, referral codes). MetaMorpho takes no options.

Register a connector at runtime with `registerConnector(connector)` by
implementing the `PositionMigrationConnector` interface.

## Execution model

Migration plans run through the same execution service as core Euler plans:

1. read the source position (and, for outbound, the destination market)
2. resolve the authorization, then sign or send any prerequisite it contains
3. build the plan with `planMigration` (or simulate with `planMigrationSimulation`)
4. pass the `TransactionPlan` to `executionService.executeTransactionPlan(...)`
5. refetch positions after confirmation to confirm the source is closed

For a review-integrity flow, use the `previewPlan` and `authorizationRequest`
returned by `planMigrationSimulation`, then call
`prepareMigrationAuthorizationSlots({ previewPlan, authorizationRequest })`.
For every built-in typed authorization it returns exactly one flattened EVC batch
coordinate and a versioned ABI path sealed to the EIP-712 hash and the complete
stub-signed batch item. After signing, pass the reviewed item, path, hash, and
signature to `executionService.encodeMigrationAuthorizationCall(...)`. That
encoder changes only the declared signature fields and rejects target, signer,
native value, non-signature calldata, typed-data hash, or path drift.

The returned `abiArgumentPath` is opaque application-authenticated metadata, not
an independently trusted SDK capability. The application must cover the complete
migration slot metadata with its accepted review digest before returning it to
the SDK.

## References

- [`services.md`](./services.md) — service map and capability matrix
- [`execution-service.md`](./execution-service.md) — plan/approval/execution model
- [`swaps.md`](./swaps.md) — swap quote APIs used by collateral/debt swaps
- [`simulations-and-state-overrides.md`](./simulations-and-state-overrides.md) — simulation and state-override utilities
- Examples: [`examples/execution/aave-to-euler-position-migration-example.ts`](../examples/execution/aave-to-euler-position-migration-example.ts),
  [`euler-to-aave-position-migration-example.ts`](../examples/execution/euler-to-aave-position-migration-example.ts),
  [`morpho-to-euler-position-migration-example.ts`](../examples/execution/morpho-to-euler-position-migration-example.ts),
  [`euler-to-morpho-position-migration-example.ts`](../examples/execution/euler-to-morpho-position-migration-example.ts)
</content>
</invoke>
