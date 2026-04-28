# Basic Usage

## Setup

```typescript
import { buildEulerSDK } from '@eulerxyz/euler-v2-sdk'

const sdk = await buildEulerSDK({
  rpcUrls: { 1: 'https://...' },           // chainId -> RPC URL
  queryCacheConfig: { ttlMs: 5000 },       // Optional: default cache is 5s
  backendConfig: {                           // Optional: enables backend pricing
    endpoint: 'https://v3staging.eul.dev',
    chainId: 1,
  },
})
```

## Quick Deposit Example

```typescript
import { buildEulerSDK } from '@eulerxyz/euler-v2-sdk'
import { parseUnits } from 'viem'

const sdk = await buildEulerSDK({ rpcUrls: { 1: 'https://...' } })

const { result: account } = await sdk.accountService.fetchAccount(1, '0xYourAddress...', {
  populateVaults: false,
})

const plan = sdk.executionService.planDeposit({
  vault: '0xVault...',
  amount: parseUnits('100', 6),
  receiver: '0xYourSubAccountOrAddress...',
  account,
  asset: '0xAsset...',
  enableCollateral: true,
})

// Resolve approvals/signatures for your wallet flow, then execute the plan items.
// See examples/utils/executor.ts for a full reference executor.
```

For execution planning and transaction-plan structure, see [Execution Service](./execution-service.md).

## Fetching Accounts

An account represents an Ethereum address and its Euler sub-accounts (up to 256 per owner). Each sub-account has positions, enabled controllers/collaterals, and liquidity info.

### Basic fetch

```typescript
const { result: account } = await sdk.accountService.fetchAccount(1, '0xOwner...')

for (const [address, subAccount] of Object.entries(account.subAccounts)) {
  for (const position of subAccount.positions) {
    console.log(position.vaultAddress, position.assets, position.borrowed)
    console.log(position.vault?.shares.name)  // Undefined unless populateVaults: true
  }
}
```

`fetchAccount` resolves vault entities only when `populateVaults: true` is set. Otherwise each `position.vault` remains `undefined` and you only get raw position data.

### Portfolio view

Use `account.portfolio` when you want a top-level savings and borrow view across all sub-accounts:

```typescript
const { savings, borrows } = account.portfolio

for (const saving of savings) {
  console.log('saving', saving.account, saving.vaultAddress, saving.assets)
}

for (const { borrow, collaterals } of borrows) {
  console.log('borrow', borrow.account, borrow.vaultAddress, borrow.borrowed)
  console.log('collaterals', collaterals.map((collateral) => collateral.vaultAddress))
}
```

Borrow entries use `{ borrow, collaterals }`. A position with debt is always included as a borrow; any supplied balance on that same position is also treated as savings unless the vault is active collateral for a borrow in the same sub-account.

### Without vault resolution

When you only need raw position data (addresses, balances), skip vault resolution:

```typescript
const { result: account } = await sdk.accountService.fetchAccount(1, '0xOwner...', {
  populateVaults: false,
})
// position.vault is undefined, but position.vaultAddress, assets, borrowed are available
```

### With vault augmentations

Pass level-2 flags to control how resolved vaults are fetched (options are forwarded to the underlying vault services):

```typescript
const { result: account } = await sdk.accountService.fetchAccount(1, '0xOwner...', {
  populateAll: true,
  vaultFetchOptions: {
    populateAll: true,
  },
})
// position.vault.marketPriceUsd is populated on each resolved vault
```

### Fetching a single sub-account

```typescript
const { result: subAccount } = await sdk.accountService.fetchSubAccount(
  1,
  '0xSubAccount...',
  ['0xVault1...', '0xVault2...'],  // Optional: specific vaults to query
)
```

Pass vault addresses when the subgraph may not have indexed recent changes (e.g. local forks). When omitted, vaults are auto-collected from position data.

### Populating vaults later

You can fetch without population first, then populate later:

```typescript
const { result: account } = await sdk.accountService.fetchAccount(1, '0xOwner...', {
  populateVaults: false,
})

// ... later, when vault details are needed:
await account.populateVaults(sdk.vaultMetaService)
```

## Fetching Vaults

### By address

```typescript
const { result: vault } = await sdk.eVaultService.fetchVault(1, '0xVault...')
const { result: earn } = await sdk.eulerEarnService.fetchVault(1, '0xEarn...')
```

With augmentations:

```typescript
const { result: vault } = await sdk.eVaultService.fetchVault(1, '0xVault...', {
  populateAll: true, // Overrides granular flags and enables all EVault enrichments
})
```

### When you don't know the vault type

Use `vaultMetaService` — it detects the type automatically and routes to the correct service:

```typescript
const { result: vault } = await sdk.vaultMetaService.fetchVault(1, '0xAny...')
// Returns EVault | EulerEarn | SecuritizeCollateralVault | undefined
```

Use type guards to narrow:

```typescript
import { isEVault, isEulerEarn, isSecuritizeCollateralVault } from '@eulerxyz/euler-v2-sdk'

if (isEVault(vault)) {
  console.log(vault.interestRates.supplyAPY)
  console.log(vault.collaterals.length)
} else if (isEulerEarn(vault)) {
  console.log(vault.supplyApy)   // alias of vault.supplyApy1h
  console.log(vault.supplyApy1h)
  console.log(vault.strategies.length)
}
```

Batch fetch also routes automatically:

```typescript
const inputAddresses = [
  '0xEvault...',
  '0xEulerEarn...',
  '0xSecuritize...',
];
const { result: vaults, errors } = await sdk.vaultMetaService.fetchVaults(1, inputAddresses);
// `vaults[i]` matches `inputAddresses[i]`.
// On per-vault failure, `vaults[i]` is undefined and diagnostics include `entityId = inputAddresses[i]`.
```

## Fetching Verified Vaults (Perspectives)

Perspectives are on-chain contracts that verify vaults meet certain criteria. Each vault service has standard perspectives.

### EVault perspectives

```typescript
import { StandardEVaultPerspectives } from '@eulerxyz/euler-v2-sdk'

// GOVERNED — vaults with active governance
const { result: governed } = await sdk.eVaultService.fetchVerifiedVaults(1, [
  StandardEVaultPerspectives.GOVERNED,
])

// FACTORY — all vaults deployed via the EVK factory
const { result: all } = await sdk.eVaultService.fetchVerifiedVaults(1, [
  StandardEVaultPerspectives.FACTORY,
])

// Multiple perspectives (results are merged and deduplicated)
const { result: vaults } = await sdk.eVaultService.fetchVerifiedVaults(1, [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
])
```

Available EVault perspectives:

| Perspective | Description |
|-------------|-------------|
| `GOVERNED` | Vaults with active governance oversight |
| `FACTORY` | All vaults from the EVK factory |
| `EDGE` | Vaults from the edge factory |
| `ESCROW` | Escrowed collateral vaults |

### EulerEarn perspectives

```typescript
import { StandardEulerEarnPerspectives } from '@eulerxyz/euler-v2-sdk'

const { result: governed } = await sdk.eulerEarnService.fetchVerifiedVaults(1, [
  StandardEulerEarnPerspectives.GOVERNED,
], { populateAll: true })
```

Available EulerEarn perspectives:

| Perspective | Description |
|-------------|-------------|
| `GOVERNED` | EulerEarn vaults with governance |
| `FACTORY` | All EulerEarn vaults from factory |

### Custom perspective addresses

You can pass raw perspective contract addresses instead of enum values:

```typescript
const { result: vaults } = await sdk.eVaultService.fetchVerifiedVaults(1, [
  '0xCustomPerspective...',
])
```

### Addresses only

If you only need addresses (not full entities):

```typescript
const addresses = await sdk.eVaultService.fetchVerifiedVaultAddresses(1, [
  StandardEVaultPerspectives.GOVERNED,
])
```

### Across all vault types

`vaultMetaService` queries all registered services and merges results:

```typescript
import { StandardEVaultPerspectives, StandardEulerEarnPerspectives } from '@eulerxyz/euler-v2-sdk'

const { result: allVaults } = await sdk.vaultMetaService.fetchVerifiedVaults(1, [
  StandardEVaultPerspectives.GOVERNED,
  StandardEulerEarnPerspectives.GOVERNED,
])
// Returns (EVault | EulerEarn | SecuritizeCollateralVault | undefined)[]
```

## Fetching All Discoverable Vaults

Use `fetchAllVaults()` when you want each service's full discoverable set without manually wiring factory perspectives.

```typescript
const { result: eVaultsOnly } = await sdk.vaultMetaService.fetchAllVaults(1, {
  options: { populateAll: true }
})
```

## Oracle Adapter Metadata

Use `oracleAdapterService` to get adapter provider/methodology/check metadata for oracle adapter addresses:

```typescript
const adapterMap = await sdk.oracleAdapterService.fetchOracleAdapterMap(1);
const metadata = adapterMap['0xAdapterAddress...'.toLowerCase()];
console.log(metadata?.provider, metadata?.methodology, metadata?.checks);
```

## How Vault Types Work

The SDK handles three vault types: `EVault`, `EulerEarn`, and `SecuritizeCollateralVault`. Each has a dedicated service, but the routing is automatic.

### Type detection

Every vault is deployed from a factory contract. The `vaultMetaService` looks up each vault's factory address and maps it to the correct service:

```
vault address -> vault type resolver -> registered service -> correct entity type
```

By default the resolver uses `POST /v3/evk/vaults/resolve`, with the legacy subgraph factory lookup still available when explicitly configured. This happens transparently in `vaultMetaService.fetchVault(s)` and in `accountService.fetchAccount` (when resolving vaults for positions).

### Entity hierarchy

All vault types extend `ERC4626Vault`:

```
ERC4626Vault (base)
  ├── EVault              — lending markets with collaterals, oracles, interest rates
  ├── EulerEarn           — yield aggregators with strategies, supply APY
  └── SecuritizeCollateralVault — tokenized collateral vaults
```

Common properties (from `ERC4626Vault`):
- `address`, `chainId`, `type`
- `shares` (name, symbol, decimals), `asset` (name, symbol, decimals)
- `totalShares`, `totalAssets`
- `marketPriceUsd` (when fetched with `{ populateMarketPrices: true }`)

### Type-specific services

Use the type-specific service when you know what you're fetching:

| Service | Entity | Use when |
|---------|--------|----------|
| `sdk.eVaultService` | `EVault` | Fetching lending markets |
| `sdk.eulerEarnService` | `EulerEarn` | Fetching yield aggregators |
| `sdk.securitizeVaultService` | `SecuritizeCollateralVault` | Fetching securitize vaults |
| `sdk.vaultMetaService` | `VaultEntity` | Type unknown or mixed |
