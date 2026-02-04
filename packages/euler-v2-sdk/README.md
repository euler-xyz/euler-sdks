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

// Fetch account data
const account = await sdk.accountService.fetchAccount(mainnet.id, userAddress);

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

**`fetchAccount(chainId: number, address: Address): Promise<Account>`**

Fetches all account data including sub-accounts and their positions.

```typescript
const account = await sdk.accountService.fetchAccount(mainnet.id, userAddress);

// Access positions
const position = account.getPosition(subAccountAddress, vaultAddress);
console.log('Collateral:', position?.collateralValue);
console.log('Debt:', position?.borrowed);

// Check enabled collaterals
const subAccount = account.subAccounts[0];
console.log('Enabled collaterals:', subAccount.enabledCollaterals);
console.log('Controller:', subAccount.enabledControllers[0]);
```

**`fetchSubAccount(chainId: number, subAccount: Address, vaults?: Address[]): Promise<SubAccount | undefined>`**

Fetches a specific sub-account's data.

```typescript
const subAccount = await sdk.accountService.fetchSubAccount(
  mainnet.id, 
  subAccountAddress,
  [vaultAddress]
);
```

#### Account Entity

The `Account` entity provides helper methods:

- `getPosition(account: Address, vault: Address)`: Get position details for a vault
- `getSubAccount(account: Address)`: Get sub-account data
- `subAccounts`: Array of all sub-accounts with positions

### EVault Service

Queries vault information including assets, interest rates, and configurations.

#### Key Methods

**`fetchVault(chainId: number, vault: Address): Promise<EVault>`**

Fetches detailed vault information.

```typescript
const vault = await sdk.eVaultService.fetchVault(mainnet.id, vaultAddress);

console.log('Vault asset:', vault.asset);
console.log('Total supply:', vault.totalSupply);
console.log('Total borrowed:', vault.totalBorrowed);
console.log('Supply APY:', vault.supplyAPY);
console.log('Borrow APY:', vault.borrowAPY);
console.log('Utilization:', vault.utilization);
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

console.log('Total assets:', earnVault.totalAssetsDeposited);
console.log('Strategy allocations:', earnVault.strategies);
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

### Custom Data Sources

You can override default data sources:

```typescript
const sdk = await buildSDK({
  rpcUrls,
  accountVaultsDataSourceConfig: {
    subgraphURLs: {
      [mainnet.id]: 'https://your-custom-subgraph.com'
    }
  },
  eulerLabelsDataSourceConfig: {
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
