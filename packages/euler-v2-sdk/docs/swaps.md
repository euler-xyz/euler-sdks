# Swaps

The SDK provides a swap service that fetches quotes from multiple DEX aggregators and builds transaction calldata for Euler's Swapper contract. Swaps are used for repaying debt with collateral, swapping collateral between vaults, swapping debt between vaults, swapping wallet assets into another wallet, and opening leveraged (multiply) positions.

## Overview

All swap operations follow the same pattern:

1. **Fetch quotes** — call one of the quote methods to get quotes from multiple providers
2. **Select a quote** — pick the best quote (they are ordered best-first)
3. **Plan the operation** — pass the quote to `executionService.plan*` to build the EVC batch
4. **Execute** — send the transaction

The [orderlow router API](https://github.com/euler-xyz/euler-orderflow-router) is a meta-aggregator that queries multiple DEX aggregators in parallel and returns quotes sorted from best to worst.

## Swap Operations

### Repay with Swap

Withdraw collateral, swap it to the liability asset, and repay debt. Used when you want to reduce debt using existing collateral.

```typescript
const quotes = await sdk.swapService.fetchRepayQuotes({
  chainId: 1,
  fromVault: COLLATERAL_VAULT,
  fromAsset: USDC,
  fromAccount: subAccountAddress,
  liabilityVault: DEBT_VAULT,
  liabilityAsset: USDT,
  liabilityAmount: repayAmount, // set to currentDebt for full repay
  currentDebt,
  toAccount: subAccountAddress,
  origin: walletAddress,
  swapperMode: SwapperMode.TARGET_DEBT,
  slippage: 0.5,
})

const plan = sdk.executionService.planRepayWithSwap({
  account: accountData,
  swapQuote: quotes[0],
  cleanupOnMax: repayAmount === currentDebt,
})
```

`cleanupOnMax` is optional. Use it for full repay flows when the post-repay batch should disable active collaterals on the repaid sub-account, move those collateral shares to the owner, and move remaining source-vault shares to the owner.

### Swap Collateral

Withdraw from one collateral vault, swap, and deposit into another. Used for rebalancing collateral composition.

```typescript
const quotes = await sdk.swapService.fetchDepositQuote({
  chainId: 1,
  fromVault: USDC_VAULT,
  toVault: WETH_VAULT,
  fromAccount: subAccountAddress,
  toAccount: subAccountAddress,
  fromAsset: USDC,
  toAsset: WETH,
  amount: swapAmount,
  origin: walletAddress,
  slippage: 0.5,
})

const plan = sdk.executionService.planSwapCollateral({
  account: accountData,
  swapQuote: quotes[0],
})
```

### Swap Debt

Borrow a new asset, swap it to the current debt asset, and repay. Used for refinancing into a different debt asset.

```typescript
const quotes = await sdk.swapService.fetchRepayQuotes({
  chainId: 1,
  fromVault: NEW_DEBT_VAULT,   // vault to borrow from
  fromAsset: USDC,
  fromAccount: subAccountAddress,
  liabilityVault: OLD_DEBT_VAULT, // vault to repay
  liabilityAsset: USDT,
  liabilityAmount: currentDebt,   // full repay
  currentDebt,
  toAccount: subAccountAddress,
  origin: walletAddress,
  swapperMode: SwapperMode.TARGET_DEBT,
  slippage: 0.5,
})

const plan = sdk.executionService.planSwapDebt({
  account: accountData,
  swapQuote: quotes[0],
})
```

### Wallet To Wallet Swap

Pull an input token from the sender wallet, execute the swap, and transfer the output token to a wallet receiver. Used when you want a direct wallet-level swap without involving Euler vault deposits.

Under the hood, this helper sets the quote flags needed for a true wallet path:
`unusedInputReceiver = origin`, `skipSweepDepositOut = true`, and `transferOutputToReceiver = true`.

```typescript
const quotes = await sdk.swapService.fetchWalletSwapQuote({
  chainId: 1,
  fromAsset: USDC,
  toAsset: WETH,
  amount: swapAmount,
  receiver: receiverWallet,
  origin: senderWallet,
  slippage: 0.5,
})

const plan = sdk.executionService.planSwapFromWallet({
  account: accountData,
  swapQuote: quotes[0],
  amount: swapAmount,
  tokenIn: USDC,
})
```

### Multiply (Leverage)

Open a leveraged position by depositing collateral, borrowing against it, swapping the borrowed asset to a long asset, and depositing the result as additional collateral. There are two variants:

**Multiply with swap** — when the borrowed asset differs from the long asset (requires a DEX swap):

```typescript
// Get a swap quote: borrow USDT, swap to WETH
const quotes = await sdk.swapService.fetchDepositQuote({
  chainId: 1,
  fromVault: LIABILITY_VAULT,  // vault to borrow from
  toVault: LONG_VAULT,         // vault to deposit swapped asset into
  fromAccount: subAccountAddress,
  toAccount: subAccountAddress,
  fromAsset: USDT,
  toAsset: WETH,
  amount: borrowAmount,
  origin: walletAddress,
  slippage: 0.5,
})

const plan = sdk.executionService.planMultiplyWithSwap({
  account: accountData,
  collateralVault: USDC_VAULT,       // initial collateral vault
  collateralAmount: depositAmount,   // initial deposit (0n to skip)
  collateralAsset: USDC,
  swapQuote: quotes[0],
})
```

**Multiply same asset** — when the borrowed asset and long asset are the same (no swap needed):

```typescript
const plan = sdk.executionService.planMultiplySameAsset({
  account: accountData,
  collateralVault: USDC_VAULT,
  collateralAmount: depositAmount,
  collateralAsset: USDC,
  liabilityVault: WETH_VAULT,       // vault to borrow from
  liabilityAmount: borrowAmount,
  longVault: WETH_COLLATERAL_VAULT, // vault to deposit borrowed asset into
  receiver: subAccountAddress,
})
```

## Swapper Modes

| Mode | Value | Description |
|------|-------|-------------|
| `EXACT_IN` | 0 | Sell an exact amount of input token. The output amount varies. |
| `EXACT_OUT` | 1 | Buy an exact amount of output token. The input amount varies. |
| `TARGET_DEBT` | 2 | Repay toward a target debt. Set `liabilityAmount` to `currentDebt` for full repay. |

## Provider Filtering

The swap API is a meta-aggregator — each call queries all available providers and returns the best quotes. You can also query a specific provider by passing the `provider` parameter:

```typescript
// Fetch available providers for a chain (cacheable for a long time)
const providers = await sdk.swapService.fetchProviders(1)
// ["1inch", "uniswap", "odos", "paraswap", ...]

// Fetch a quote from a specific provider
const quotes = await sdk.swapService.fetchDepositQuote({
  // ...same args as before
  provider: "1inch",
})
```

With the `fetchProviders` endpoint and `provider` filter, it is possible to build a [LlamaSwap](https://swap.defillama.com/)-like meta-aggregation UI by sending one request per provider in parallel, letting users compare quotes across all sources. The providers list changes rarely and can be cached for a long time.

## Swap Verification

Every quote returned by the API includes verifier calldata (`quote.verify`) that is checked on-chain by the `SwapVerifier` contract. The SDK validates this data client-side before returning quotes. This ensures the swap payload has not been tampered with and that the minimum output amount or maximum debt is enforced.

Verification modes used by the SDK:

- `skimMin` for swap output that should be deposited/skimmed into a vault position
- `transferMin` for swap output that should be transferred to a wallet/address receiver
- `debtMax` for swap output that repays debt up to a bounded maximum
