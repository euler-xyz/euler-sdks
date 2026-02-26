# Basic Usage

## Setup

```typescript
import { buildEulerSDK } from 'euler-v2-sdk'

const sdk = await buildEulerSDK({
  rpcUrls: { 1: 'https://...' },           // chainId -> RPC URL
  backendConfig: {                           // Optional: enables backend pricing
    endpoint: 'https://pricing.euler.finance',
    chainId: 1,
  },
})
```

## Quick Deposit Example

```typescript
import { buildEulerSDK } from 'euler-v2-sdk'
import { parseUnits } from 'viem'

const sdk = await buildEulerSDK({ rpcUrls: { 1: 'https://...' } })

const account = await sdk.accountService.fetchAccount(1, '0xYourAddress...', {
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
const account = await sdk.accountService.fetchAccount(1, '0xOwner...')

for (const [address, subAccount] of Object.entries(account.subAccounts)) {
  for (const position of subAccount.positions) {
    console.log(position.vaultAddress, position.assets, position.borrowed)
    console.log(position.vault?.shares.name)  // Undefined unless populateVaults: true
  }
}
```

`fetchAccount` resolves vault entities only when `populateVaults: true` is set. Otherwise each `position.vault` remains `undefined` and you only get raw position data.

### Without vault resolution

When you only need raw position data (addresses, balances), skip vault resolution:

```typescript
const account = await sdk.accountService.fetchAccount(1, '0xOwner...', {
  populateVaults: false,
})
// position.vault is undefined, but position.vaultAddress, assets, borrowed are available
```

### With vault augmentations

Pass level-2 flags to control how resolved vaults are fetched (options are forwarded to the underlying vault services):

```typescript
const account = await sdk.accountService.fetchAccount(1, '0xOwner...', {
  populateVaults: true,
  populateMarketPrices: true,
  vaultFetchOptions: {
    populateCollaterals: true,
    populateStrategyVaults: true,
  },
})
// position.vault.marketPriceUsd is populated on each resolved vault
```

### Fetching a single sub-account

```typescript
const subAccount = await sdk.accountService.fetchSubAccount(
  1,
  '0xSubAccount...',
  ['0xVault1...', '0xVault2...'],  // Optional: specific vaults to query
)
```

Pass vault addresses when the subgraph may not have indexed recent changes (e.g. local forks). When omitted, vaults are auto-collected from position data.

### Populating vaults later

You can fetch without population first, then populate later:

```typescript
const account = await sdk.accountService.fetchAccount(1, '0xOwner...', {
  populateVaults: false,
})

// ... later, when vault details are needed:
await account.populateVaults(sdk.vaultMetaService)
```

## Fetching Vaults

### By address

```typescript
const vault = await sdk.eVaultService.fetchVault(1, '0xVault...')
const earn = await sdk.eulerEarnService.fetchVault(1, '0xEarn...')
```

With augmentations:

```typescript
const vault = await sdk.eVaultService.fetchVault(1, '0xVault...', {
  populateCollaterals: true,   // Populate collateral.vault entities
  populateMarketPrices: true,  // Populate marketPriceUsd on vault and collaterals
})
```

### When you don't know the vault type

Use `vaultMetaService` — it detects the type automatically and routes to the correct service:

```typescript
const vault = await sdk.vaultMetaService.fetchVault(1, '0xAny...')
// Returns EVault | EulerEarn | SecuritizeCollateralVault | undefined
```

Use type guards to narrow:

```typescript
import { isEVault, isEulerEarn, isSecuritizeCollateralVault } from 'euler-v2-sdk'

if (isEVault(vault)) {
  console.log(vault.interestRates.supplyAPY)
  console.log(vault.collaterals.length)
} else if (isEulerEarn(vault)) {
  console.log(vault.supplyApy)
  console.log(vault.strategies.length)
}
```

Batch fetch also routes automatically:

```typescript
const vaults = await sdk.vaultMetaService.fetchVaults(1, [
  '0xEvault...',
  '0xEulerEarn...',
  '0xSecuritize...',
])
// Each element is the correct entity type
```

## Fetching Verified Vaults (Perspectives)

Perspectives are on-chain contracts that verify vaults meet certain criteria. Each vault service has standard perspectives.

### EVault perspectives

```typescript
import { StandardEVaultPerspectives } from 'euler-v2-sdk'

// GOVERNED — vaults with active governance
const governed = await sdk.eVaultService.fetchVerifiedVaults(1, [
  StandardEVaultPerspectives.GOVERNED,
])

// FACTORY — all vaults deployed via the EVK factory
const all = await sdk.eVaultService.fetchVerifiedVaults(1, [
  StandardEVaultPerspectives.FACTORY,
])

// Multiple perspectives (results are merged and deduplicated)
const vaults = await sdk.eVaultService.fetchVerifiedVaults(1, [
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
import { StandardEulerEarnPerspectives } from 'euler-v2-sdk'

const governed = await sdk.eulerEarnService.fetchVerifiedVaults(1, [
  StandardEulerEarnPerspectives.GOVERNED,
], { populateStrategyVaults: true })
```

Available EulerEarn perspectives:

| Perspective | Description |
|-------------|-------------|
| `GOVERNED` | EulerEarn vaults with governance |
| `FACTORY` | All EulerEarn vaults from factory |

### Custom perspective addresses

You can pass raw perspective contract addresses instead of enum values:

```typescript
const vaults = await sdk.eVaultService.fetchVerifiedVaults(1, [
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
import { StandardEVaultPerspectives, StandardEulerEarnPerspectives } from 'euler-v2-sdk'

const allVaults = await sdk.vaultMetaService.fetchVerifiedVaults(1, [
  StandardEVaultPerspectives.GOVERNED,
  StandardEulerEarnPerspectives.GOVERNED,
])
// Returns (EVault | EulerEarn | SecuritizeCollateralVault)[]
```

## How Vault Types Work

The SDK handles three vault types: `EVault`, `EulerEarn`, and `SecuritizeCollateralVault`. Each has a dedicated service, but the routing is automatic.

### Type detection

Every vault is deployed from a factory contract. The `vaultMetaService` looks up each vault's factory address and maps it to the correct service:

```
vault address -> factory address (via subgraph) -> registered service -> correct entity type
```

This happens transparently in `vaultMetaService.fetchVault(s)` and in `accountService.fetchAccount` (when resolving vaults for positions).

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
