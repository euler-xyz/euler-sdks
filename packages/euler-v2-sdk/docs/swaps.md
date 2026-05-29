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

### Wallet Swap and Borrow

Pull an input token from the wallet, swap it into a collateral vault, then borrow
against the received collateral in the same EVC batch.

```typescript
const quotes = await sdk.swapService.fetchDepositQuote({
  chainId: 1,
  fromVault: zeroAddress,
  toVault: WETH_VAULT,
  fromAccount: zeroAddress,
  toAccount: subAccountAddress,
  fromAsset: USDC,
  toAsset: WETH,
  amount: walletInputAmount,
  origin: walletAddress,
  slippage: 0.5,
  unusedInputReceiver: walletAddress,
})

const plan = sdk.executionService.planSwapAndBorrowFromWallet({
  account: accountData,
  swapQuote: quotes[0],
  amount: walletInputAmount,
  tokenIn: USDC,
  borrowVault: USDT_VAULT,
  borrowAmount,
  borrowAccount: subAccountAddress,
  collateralVault: WETH_VAULT,
  receiver: walletAddress,
})
```

### Wallet Swap and Repay

Pull an input token from the wallet, swap it into the liability asset, and repay a
debt position. Use an exact-input quote when selling a fixed wallet amount. For
target-debt quotes, use `amountInMax` as the wallet transfer amount because the
exact input is bounded by the quote. Provide a real `fromVault` / `fromAccount`
as the router's sweep context; the planner still pulls the input token from the
wallet.

```typescript
const quotes = await sdk.swapService.fetchRepayQuotes({
  chainId: 1,
  fromVault: USDC_VAULT,
  fromAsset: USDC,
  fromAccount: subAccountAddress,
  liabilityVault: USDT_VAULT,
  liabilityAsset: USDT,
  currentDebt,
  toAccount: subAccountAddress,
  origin: walletAddress,
  swapperMode: SwapperMode.EXACT_IN,
  collateralAmount: walletInputAmount,
  slippage: 0.5,
})

const quote = quotes[0]
const amountIn = BigInt(quote.amountIn)
const plan = sdk.executionService.planSwapAndRepayFromWallet({
  account: accountData,
  swapQuote: quote,
  amount: amountIn,
  tokenIn: USDC,
  liabilityVault: USDT_VAULT,
  repayAccount: subAccountAddress,
  isMax: false,
})
```

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

`cleanupOnMax` is optional. Use it for full repay flows when the post-repay batch should disable active collaterals on the repaid sub-account, move those collateral shares to the owner, and move remaining source-vault shares to the owner. The collateral-share transfer applies only to EVK collateral vaults; non-EVK collaterals (e.g. Securitize RWA vaults) are disabled but not swept.

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

CoW collateral swaps use the same `fetchDepositQuote` method with a `cowSwap`
payload and then the CoW planner:

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
  provider: "cow",
  cowSwap: {
    type: "collateralSwap",
    owner: walletAddress,
    sharesAmount: sharesToSell,
    disableSourceCollateral: true,
  },
})

const plan = sdk.executionService.planSwapCollateralWithCoW({
  account: accountData,
  swapQuote: quotes[0],
  disableSourceCollateral: true,
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

### Same-Asset Position Migrations

When both vaults use the same underlying asset, use the no-swap migration
planners instead of requesting a DEX quote.

```typescript
const collateralPlan = sdk.executionService.planMigrateSameAssetCollateral({
  account: accountData,
  fromVault: OLD_COLLATERAL_VAULT,
  toVault: NEW_COLLATERAL_VAULT,
  amount,
  positionAccount: subAccountAddress,
  toAsset: USDC,
  isMax: true,
})

const debtPlan = sdk.executionService.planMigrateSameAssetDebt({
  account: accountData,
  oldLiabilityVault: OLD_DEBT_VAULT,
  newLiabilityVault: NEW_DEBT_VAULT,
  liabilityAccount: subAccountAddress,
  newLiabilityAsset: USDT,
})
```

For same-asset debt migration, the account must have collateral that keeps the
destination debt vault liquid after the migration. If the old and new markets do
not share a positive-LTV collateral, enable collateral accepted by the destination
vault before running `planMigrateSameAssetDebt`.

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

### Withdraw or Redeem and Swap to Wallet

Withdraw assets or redeem shares from a vault to the Swapper, then transfer the
swapped output token to a wallet receiver.

```typescript
const quotes = await sdk.swapService.fetchSwapQuotes({
  chainId: 1,
  tokenIn: USDC,
  tokenOut: WETH,
  accountIn: subAccountAddress,
  accountOut: zeroAddress,
  amount: withdrawAmount,
  vaultIn: USDC_VAULT,
  receiver: walletAddress,
  origin: walletAddress,
  slippage: 0.5,
  swapperMode: SwapperMode.EXACT_IN,
  isRepay: false,
  targetDebt: 0n,
  currentDebt: 0n,
  transferOutputToReceiver: true,
})

const withdrawPlan = sdk.executionService.planWithdrawAndSwap({
  account: accountData,
  vault: USDC_VAULT,
  assets: withdrawAmount,
  owner: subAccountAddress,
  swapQuote: quotes[0],
})

const redeemPlan = sdk.executionService.planRedeemAndSwap({
  account: accountData,
  vault: USDC_VAULT,
  shares: sharesToRedeem,
  owner: subAccountAddress,
  swapQuote: quotes[0],
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

CoW open-position quotes also use `fetchDepositQuote`; pass `cowSwap` so the
swap API can build the wrapper appData:

```typescript
const quotes = await sdk.swapService.fetchDepositQuote({
  chainId: 1,
  fromVault: LIABILITY_VAULT,
  toVault: LONG_VAULT,
  fromAccount: subAccountAddress,
  toAccount: subAccountAddress,
  fromAsset: USDT,
  toAsset: WETH,
  amount: borrowAmount,
  origin: walletAddress,
  slippage: 0.5,
  provider: "cow",
  cowSwap: {
    type: "openPosition",
    owner: walletAddress,
    collateralVault: USDC_VAULT,
    collateralAmount: depositAmount,
  },
})

const plan = sdk.executionService.planOpenPositionWithCoW({
  account: accountData,
  collateralVault: USDC_VAULT,
  collateralAmount: depositAmount,
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

## CoW Swap Provider Flow

CoW swaps are supported for open-position, close-position, and collateral-swap
flows. CoW quotes carry provider order metadata and execute through signed CoW
orders instead of an immediate Swapper EVC batch.

Use the regular quote methods with `cowSwap` to build CoW provider metadata. If
`provider` is `"cow"` or unset, the SDK attaches the generated
CoW metadata. If `provider` is a different provider, no generated CoW metadata
is sent.

CoW quotes must be planned with:

- `planOpenPositionWithCoW`
- `planClosePositionWithCow`
- `planSwapCollateralWithCoW`

Execute the returned plan with `executionService.executeCowSwapTransactionPlan`. CoW
plans cannot be simulated or gas-estimated because settlement is performed later
by CoW Protocol.

Track submitted orders with `fetchCowSwapOrderStatus` or
`pollCowSwapOrderStatus`. Open-position and collateral-swap orders are cancelled
with `cancelCowSwapOrder`. Close-position orders are cancelled by invalidating
the signed EVC permit nonce with `planCancelClosePositionWithCow`.

See [`cow-swaps.md`](./cow-swaps.md) for the full flow and
[`open-position-with-cow-live-example.ts`](../examples/execution/open-position-with-cow-live-example.ts)
for a live mainnet example.

## Swap Verification

Every quote returned by the API includes verifier calldata (`quote.verify`) that is checked on-chain by the `SwapVerifier` contract. The SDK validates this data client-side before returning quotes. This ensures the swap payload has not been tampered with and that the minimum output amount or maximum debt is enforced.

Verification modes used by the SDK:

- `skimMin` for swap output that should be deposited/skimmed into a vault position
- `transferMin` for swap output that should be transferred to a wallet/address receiver
- `debtMax` for swap output that repays debt up to a bounded maximum
