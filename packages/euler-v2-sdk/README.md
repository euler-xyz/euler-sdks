# Euler V2 SDK

TypeScript SDK for interacting with the Euler V2 Lending Platform.

## Installation

```bash
pnpm install euler-v2-sdk
```

## Quick Start

```typescript
import { buildSDK } from 'euler-v2-sdk';
import { mainnet } from 'viem/chains';

// Initialize the SDK
const sdk = await buildSDK({
  rpcUrls: {
    [mainnet.id]: 'https://your-rpc-url.com'
  }
});

// Fetch account data (use fetchAccount for vault entities in positions; pass { populateVaults: false } for execution plans)
const account = await sdk.accountService.fetchAccount(mainnet.id, userAddress, { populateVaults: false });

// Fetch vault information
const vault = await sdk.eVaultService.fetchVault(mainnet.id, vaultAddress);

// Create a transaction plan
const depositPlan = sdk.executionService.planDeposit({
  vault: vaultAddress,
  amount: parseUnits("100", 6),
  receiver: userAddress,
  account,
  asset: assetAddress,
  enableCollateral: true,
  usePermit2: true
});

//..execute plan, see examples/executor.ts
```

## Running Examples

The SDK includes examples demonstrating common operations. To run them:

1. **Build the SDK package**

```bash
pnpm build
```

1. **Set up environment variables:**

Create a `.env` file in the `packages/euler-v2-sdk/examples` directory:

```bash
FORK_RPC_URL="https://your-mainnet-rpc-url"

# Optional: Set PRIVATE_KEY to use an existing account on the fork
# If not set, a test account will be created and funded automatically
# PRIVATE_KEY="0x..."
```

2. **Start a local fork (in one terminal):**

```bash
pnpm run anvil
```

3. **Run an example (in another terminal):**

```bash
pnpm run deposit-example
```

**NOTE**: The local blockchain might need to be restarted before running another example

## Additional Docs

- [Decoding Smart Contract Errors](./docs/decode-smart-contract-errors.md)

### Available Examples

- **`deposit-example`**: Demonstrates depositing assets into a vault
- **`multiply-example`**: Shows how to create leveraged positions
- **`repay-with-swap-example`**: Shows how to borrow and repay debt by swapping collateral

## Architecture

The SDK is organized into modular services that handle different aspects of the Euler V2 protocol:

### Core Services

- **Account Service**: Fetch and manage user accounts, sub-accounts, and positions
- **EVault Service**: Query vault information, assets, and metadata
- **Euler Earn Service**: Interact with Euler Earn aggregated vaults
- **Vault Meta Service**: Unified vault fetching (EVault + Euler Earn) with extensible vault types and `getFactoryByType(chainId, type)`
- **Swap Service**: Generate swap quotes for asset exchanges
- **Execution Service**: Build and plan transactions with proper EVC batch encoding

### Supporting Services

- **Deployment Service**: Access contract addresses and ABIs for each chain
- **Provider Service**: Manage RPC connections across multiple chains
- **ABI Service**: Provide contract ABIs for encoding/decoding
- **Euler Labels Service**: Fetch human-readable labels and metadata

## Services Reference

### Account Service

Manages account data including positions, collateral, and debt across sub-accounts.

#### Key Methods

**`fetchAccount(chainId: number, address: Address, options?: AccountFetchOptions): Promise<Account<TVaultEntity>>`**

Fetches account data. By default, vault entities in positions and liquidity collaterals are populated. Pass `{ populateVaults: false }` to skip vault resolution.

```typescript
// With vault population (default)
const account = await sdk.accountService.fetchAccount(mainnet.id, userAddress);

// Access positions (vault entities are populated on positions/liquidity)
const position = account.getPosition(subAccountAddress, vaultAddress);
console.log('Debt:', position?.borrowed);
console.log('Vault name:', position?.vault?.shares.name);

// Without vault population
const account = await sdk.accountService.fetchAccount(mainnet.id, userAddress, {
  populateVaults: false,
});

// With level-2 augmentations
const account = await sdk.accountService.fetchAccount(mainnet.id, userAddress, {
  populateVaults: true,
  vaultFetchOptions: {
    populateMarketPrices: true,
    populateCollaterals: true,
    populateStrategyVaults: true,
  },
});
```

**`fetchSubAccount(chainId: number, subAccount: Address, vaults?: Address[], options?: AccountFetchOptions): Promise<SubAccount<TVaultEntity> | undefined>`**

Fetches a sub-account. Pass vault addresses when the subgraph may not have indexed recent changes.

```typescript
const subAccount = await sdk.accountService.fetchSubAccount(
  mainnet.id,
  subAccountAddress,
  [vaultAddress],
  { populateVaults: false }
);
```

**`populateVaults(accounts: Account<never>[], options?: AccountFetchOptions): Promise<Account<TVaultEntity>[]>`**

Populates vault entities on an array of accounts. Use when you fetched accounts without population and want to resolve vaults later in bulk.

#### Account Entity

The `Account` entity provides helper methods:

- `getPosition(account: Address, vault: Address)`: Get position details for a vault
- `getSubAccount(account: Address)`: Get sub-account data
- `subAccounts`: Array of all sub-accounts with positions

### Vault Entities

Vault entities share a common base and a `type` string for discrimination:

- **`ERC4626Vault`** – Base entity with `type`, `chainId`, `address`, `shares`, `asset`, `totalShares`, `totalAssets`. Implements **`IERC4626VaultConversion`** with 1:1 `convertToAssets(shares)` and `convertToShares(assets)`.
- **`EVault`** – Extends `ERC4626Vault`; `type` is `VaultType.EVault`. Overrides conversion using `VIRTUAL_DEPOSIT_AMOUNT` (matches on-chain EVault logic).
- **`EulerEarn`** – Extends `ERC4626Vault`; `type` is `VaultType.EulerEarn`. Same conversion as EVault (virtual deposit).

Use `entity.type` to branch (e.g. `vault.type === VaultType.EVault`) or pass to `vaultMetaService.getFactoryByType(chainId, vault.type)`. Custom vault types use whatever `type` string you register with the meta service.

### EVault Service

Queries vault information including assets, interest rates, and configurations.

#### Key Methods

**`fetchVault(chainId: number, vault: Address): Promise<EVault>`**

Fetches detailed vault information.

```typescript
const vault = await sdk.eVaultService.fetchVault(mainnet.id, vaultAddress);

console.log('Vault type:', vault.type); // VaultType.EVault
console.log('Vault asset:', vault.asset);
console.log('Total shares / assets:', vault.totalShares, vault.totalAssets);
console.log('Supply APY:', vault.interestRates.supplyAPY);
console.log('Borrow APY:', vault.interestRates.borrowAPY);
// Share/asset conversion (uses VIRTUAL_DEPOSIT like the contract)
const assets = vault.convertToAssets(shares);
const sharesOut = vault.convertToShares(assets);
```

**`fetchVaults(chainId: number, vaults: Address[]): Promise<EVault[]>`**

Fetch multiple vaults in a single call.

```typescript
const vaults = await sdk.eVaultService.fetchVaults(mainnet.id, [vault1, vault2]);
```

**`fetchVerifiedVaults(chainId: number, perspectives: (StandardEVaultPerspectives | Address)[]): Promise<EVault[]>`**

Fetch all vaults verified by specific perspectives (governance, factories, etc.).

```typescript
import { StandardEVaultPerspectives } from 'euler-v2-sdk';

// Get all governed vaults
const governedVaults = await sdk.eVaultService.fetchVerifiedVaults(
  mainnet.id,
  [StandardEVaultPerspectives.GOVERNED]
);

// Get vaults from multiple perspectives
const allVaults = await sdk.eVaultService.fetchVerifiedVaults(
  mainnet.id,
  [
    StandardEVaultPerspectives.GOVERNED,
    StandardEVaultPerspectives.FACTORY,
    StandardEVaultPerspectives.ESCROW
  ]
);
```

### Euler Earn Service

Manages Euler Earn aggregated yield vaults.

#### Key Methods

**`fetchVault(chainId: number, vault: Address): Promise<EulerEarn>`**

Fetches Euler Earn vault information.

```typescript
const earnVault = await sdk.eulerEarnService.fetchVault(mainnet.id, earnVaultAddress);

console.log('Vault type:', earnVault.type); // VaultType.EulerEarn
console.log('Total assets:', earnVault.totalAssets);
console.log('Strategy allocations:', earnVault.strategies);
// Share/asset conversion (uses VIRTUAL_DEPOSIT)
const assets = earnVault.convertToAssets(shares);
```

**`fetchVerifiedVaults(chainId: number, perspectives: (StandardEulerEarnPerspectives | Address)[]): Promise<EulerEarn[]>`**

Fetch all Euler Earn vaults verified by specific perspectives.

```typescript
import { StandardEulerEarnPerspectives } from 'euler-v2-sdk';

const earnVaults = await sdk.eulerEarnService.fetchVerifiedVaults(
  mainnet.id,
  [StandardEulerEarnPerspectives.FACTORY]
);
```

### Vault Meta Service

Unified interface for fetching vaults without knowing their type in advance. Uses a vault-type subgraph to resolve each address to EVault or Euler Earn (or other registered types) and delegates to the appropriate underlying service. Return type is `EVault | EulerEarn` by default and is extensible when you register additional vault services with a **vault type** so that `getFactoryByType(chainId, type)` and entity `type` stay in sync.

#### Key Methods

Same as other vault services: `fetchVault`, `fetchVaults`, `fetchVerifiedVaultAddresses`, `fetchVerifiedVaults`, `factory`. In addition:

**`getFactoryByType(chainId: number, type: VaultTypeString): Address | undefined`**

Returns the factory address for the given chain and vault type (e.g. `VaultType.EVault`, `VaultType.EulerEarn`, or a custom type you registered). Returns `undefined` if the type is not registered.

```typescript
import { VaultType } from 'euler-v2-sdk';

const factory = sdk.vaultMetaService.getFactoryByType(mainnet.id, VaultType.EVault);
// Or using a vault entity's type
const vault = await sdk.vaultMetaService.fetchVault(mainnet.id, vaultAddress);
const factory2 = sdk.vaultMetaService.getFactoryByType(mainnet.id, vault.type);
```

```typescript
// Fetch any vault by address; type is resolved automatically
const vault = await sdk.vaultMetaService.fetchVault(mainnet.id, vaultAddress);
// vault: EVault | EulerEarn (or extended union)

const vaults = await sdk.vaultMetaService.fetchVaults(mainnet.id, [addr1, addr2]);
```

#### Extending Vault Meta Service and Vault Types

Vault types are extendable in the same way as custom services. Use **`VaultServiceEntry`**: either a plain `RegisteredVaultService` or `{ type: VaultTypeString, service: RegisteredVaultService }`. When you pass `{ type, service }`, that type is available to `getFactoryByType(chainId, type)` and should match the `type` property on your custom vault entity.

**1. At build time via `additionalVaultServices`**

Pass extra services as `VaultServiceEntry[]`; use `{ type, service }` to register a custom vault type. Use the generic `buildSDK<TVaultEntity>` so that `vaultMetaService.fetchVault` / `fetchVaults` return the extended union type.

```typescript
import { buildSDK, type VaultEntity, type VaultServiceEntry } from 'euler-v2-sdk';

type ExtendedVaultEntity = VaultEntity | CustomVault;

const sdk = await buildSDK<ExtendedVaultEntity>({
  rpcUrls: { [mainnet.id]: 'https://...' },
  additionalVaultServices: [
    { type: 'CustomVault', service: myCustomVaultService },
  ] as VaultServiceEntry<ExtendedVaultEntity>[],
});
// getFactoryByType(mainnet.id, 'CustomVault') returns the custom service's factory
const vault = await sdk.vaultMetaService.fetchVault(mainnet.id, addr); // Type: ExtendedVaultEntity
```

**2. At runtime via `registerVaultService`**

Register a service (or a typed entry) after the SDK is built. Use `{ type, service }` to make the type available to `getFactoryByType`.

```typescript
const sdk = await buildSDK({ rpcUrls: { ... } });
sdk.vaultMetaService.registerVaultService({ type: 'CustomVault', service: myCustomVaultService });
// or without a type (getFactoryByType won't resolve it):
sdk.vaultMetaService.registerVaultService(myCustomVaultService);
```

**3. Typing an extended entity union**

When you add a custom vault type:

- Your custom service must implement `IVaultService<CustomVault, string>` (`fetchVault`, `fetchVaults`, `fetchVerifiedVaultAddresses`, `fetchVerifiedVaults`, `factory(chainId)`).
- Your custom entity should have a `type` string (e.g. `'CustomVault'`) consistent with what you pass in `{ type, service }`.
- The vault-type subgraph must return a `factory` for each vault; the meta service matches that factory to `service.factory(chainId)` to choose the delegate.

```typescript
import {
  VaultMetaService,
  type VaultEntity,
  type VaultServiceEntry,
  type VaultTypeString,
} from 'euler-v2-sdk';

interface CustomVault {
  type: VaultTypeString; // e.g. 'CustomVault'
  address: Address;
  // ... your fields
}

type ExtendedVaultEntity = VaultEntity | CustomVault;

const meta = new VaultMetaService<ExtendedVaultEntity>({
  vaultTypeAdapter: myVaultTypeAdapter,
  vaultServices: [
    { type: 'EVault', service: eVaultService },
    { type: 'EulerEarn', service: eulerEarnService },
    { type: 'CustomVault', service: customVaultService },
  ] as VaultServiceEntry<ExtendedVaultEntity>[],
});

const vault = await meta.fetchVault(chainId, addr); // Type: ExtendedVaultEntity
const factory = meta.getFactoryByType(chainId, 'CustomVault'); // Address | undefined
```

If you only use `registerVaultService` at runtime and don’t construct `VaultMetaService<ExtendedVaultEntity>` yourself, TypeScript will still infer the default `VaultEntity`; the runtime behavior includes all registered services.

### Swap Service

Generates swap quotes for asset exchanges with proper routing and slippage.

#### Key Methods

**`getDepositQuote(args: GetDepositQuoteArgs): Promise<SwapQuote>`**

Gets a quote for swapping and depositing into a vault (e.g., swap collateral).

```typescript
const swapQuote = await sdk.swapService.getDepositQuote({
  chainId: mainnet.id,
  accountIn: userAddress,
  accountOut: userAddress,
  vaultIn: sourceVault,
  receiver: destinationVault,
  amountIn: parseUnits("100", 6),
  slippage: 0.005, // 0.5%
});
```

**`getRepayQuote(args: GetRepayQuoteArgs): Promise<SwapQuote>`**

Gets a quote for swapping assets to repay debt.

```typescript
const repayQuote = await sdk.swapService.getRepayQuote({
  chainId: mainnet.id,
  accountIn: userAddress,
  accountOut: userAddress,
  vaultIn: collateralVault,
  receiver: debtVault,
  amountOutMin: debtAmount,
  slippage: 0.005,
});
```

#### Swap Quote Structure

The `SwapQuote` contains:
- `swap`: Swapper address and encoded calldata
- `verify`: Verifier address and encoded calldata (ensures minimum output or maximum debt repayment)
- Price and amount information

### Execution Service

Builds transaction plans with proper EVC batch encoding, handling approvals, collateral, and controller management.

#### Transaction Planning

The execution service provides `plan*` methods that return a complete transaction plan including:
- Token approvals (or Permit2 signatures)
- EVC batch items for atomic execution
- Automatic collateral and controller management

#### Key Methods

**`planDeposit(args: PlanDepositArgs): TransactionPlanItem[]`**

Creates a transaction plan for depositing assets into a vault.

```typescript
const depositPlan = sdk.executionService.planDeposit({
  vault: vaultAddress,
  amount: parseUnits("100", 6),
  receiver: subAccountAddress,
  account, // Account entity from accountService
  asset: assetAddress,
  enableCollateral: true,
  usePermit2: true, // Use Permit2 for gas-efficient approvals
  unlimitedApproval: true // Approve max amount
});

// Plan contains approval/permit2 + EVC batch transaction
```

**`planBorrow(args: PlanBorrowArgs): TransactionPlanItem[]`**

Plans a borrow operation with optional collateral deposit.

```typescript
const borrowPlan = sdk.executionService.planBorrow({
  vault: borrowVault,
  amount: borrowAmount,
  receiver: userAddress,
  borrowAccount: subAccountAddress,
  account,
  collateral: {
    vault: collateralVault,
    amount: collateralAmount,
    asset: collateralAsset
  },
  usePermit2: true
});
```

**`planRepayFromWallet(args: PlanRepayFromWalletArgs): TransactionPlanItem[]`**

Plans repaying debt from wallet tokens.

```typescript
const repayPlan = sdk.executionService.planRepayFromWallet({
  liabilityVault: debtVault,
  liabilityAmount: repayAmount,
  receiver: subAccountAddress,
  account,
  usePermit2: true
});
```

**`planRepayWithSwap(args: PlanRepayWithSwapArgs): TransactionPlanItem[]`**

Plans repaying debt by swapping collateral.

```typescript
const swapQuote = await sdk.swapService.getRepayQuote({...});

const repaySwapPlan = sdk.executionService.planRepayWithSwap({
  swapQuote,
  account
});
```

**`planSwapCollateral(args: PlanSwapCollateralArgs): TransactionPlanItem[]`**

Plans swapping from one collateral asset to another.

```typescript
const swapQuote = await sdk.swapService.getDepositQuote({...});

const swapPlan = sdk.executionService.planSwapCollateral({
  swapQuote,
  account
});
```

**`planMultiplyWithSwap(args: PlanMultiplyWithSwapArgs): TransactionPlanItem[]`**

Plans a leveraged position (multiply) when the liability and long assets are different.

```typescript
const swapQuote = await sdk.swapService.getDepositQuote({...});

const multiplyPlan = sdk.executionService.planMultiplyWithSwap({
  collateralVault,
  collateralAmount,
  collateralAsset,
  account,
  swapQuote,
  usePermit2: true
});
```

**`planMultiplySameAsset(args: PlanMultiplySameAssetArgs): TransactionPlanItem[]`**

Plans a leveraged position when the liability and long assets are the same (no swap needed).

```typescript
const multiplyPlan = sdk.executionService.planMultiplySameAsset({
  collateralVault,
  collateralAmount,
  collateralAsset,
  liabilityVault,
  liabilityAmount,
  longVault,
  receiver: userAddress,
  account,
  usePermit2: true
});
```

**`mergePlans(plans: TransactionPlan[]): TransactionPlan`**

Merges multiple transaction plans into one. Required approvals for the same (token, owner, spender) are summed; EVC batch items from all plans are concatenated in order. Use this to combine several operations (e.g. borrow + deposit + repay) into a single plan for one execution.

```typescript
const borrowPlan = sdk.executionService.planBorrow({ ... });
const depositPlan = sdk.executionService.planDeposit({ ... });
const repayPlan = sdk.executionService.planRepayFromWallet({ ... });

const merged = sdk.executionService.mergePlans([borrowPlan, depositPlan, repayPlan]);
const resolved = await sdk.executionService.resolveRequiredApprovals({
  plan: merged,
  chainId,
  account: account.address,
});
// execute resolved plan once
```

#### Transaction Plan Structure

A `TransactionPlanItem` can be:

1. **Approval**: ERC20 token approval
```typescript
{
  type: 'approve',
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
  data: Hex
}
```

2. **Permit2 Signature**: Off-chain signature for Permit2
```typescript
{
  type: 'permit2',
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint
}
```

3. **EVC Batch**: Atomic batch execution through EVC
```typescript
{
  type: 'evcBatch',
  items: EVCBatchItem[]
}
```

#### Encoding Methods

For lower-level control, use `encode*` methods to get raw EVC batch items:

```typescript
const batchItems = sdk.executionService.encodeDeposit({
  chainId: mainnet.id,
  vault: vaultAddress,
  amount: depositAmount,
  receiver: userAddress,
  owner: userAddress,
  enableCollateral: true
});

// Manually encode batch
const batchCalldata = sdk.executionService.encodeBatch(batchItems);
```

#### Batch Item Descriptions

Decode batch items for debugging or display:

```typescript
const descriptions = sdk.executionService.describeBatch(batchItems);

descriptions.forEach(desc => {
  console.log('Function:', desc.functionName);
  console.log('Target:', desc.targetContract);
  console.log('Args:', desc.args);
});
```

## Advanced Configuration

### Custom Adapters

You can override default adapters:

```typescript
const sdk = await buildSDK({
  rpcUrls,
  accountVaultsAdapterConfig: {
    subgraphURLs: {
      [mainnet.id]: 'https://your-custom-subgraph.com'
    }
  },
  eulerLabelsAdapterConfig: {
    labelsBaseUrl: 'https://your-labels-url.com'
  },
  swapServiceConfig: {
    1inchApiBaseUrl: 'https://your-1inch-api.com',
    apiKey: 'your-api-key'
  }
});
```

### Service Overrides

Replace entire services with custom implementations:

```typescript
const sdk = await buildSDK({
  rpcUrls,
  servicesOverrides: {
    swapService: new CustomSwapService(),
    executionService: new CustomExecutionService()
  }
});
```

## Development

### Building the SDK

```bash
cd packages/euler-v2-sdk
pnpm install
pnpm run build
```

### Type Checking

```bash
pnpm run typecheck
```

### Watch Mode

```bash
pnpm run build:watch
```

## License

MIT
