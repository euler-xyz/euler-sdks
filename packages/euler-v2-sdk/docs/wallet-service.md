# Wallet Service

`walletService` fetches wallet-owned balances and spend allowances for assets that a UI or execution flow already knows it needs.

```typescript
import { zeroAddress } from "viem";

const { result: wallet, errors } = await sdk.walletService.fetchWallet(
  1,
  "0xOwner...",
  [
    { asset: zeroAddress },
    { asset: "0xUSDC...", spenders: ["0xVault..."] },
    { asset: "0xWETH..." },
  ],
);

const ethBalance = wallet.getBalance(zeroAddress);
const usdcBalance = wallet.getBalance("0xUSDC...");
const usdcForVault = wallet.getAllowances("0xUSDC...", "0xVault...");
```

## Request Shape

Each request entry is an asset plus optional spenders:

```typescript
type AssetWithSpenders = {
  asset: Address;
  spenders?: Address[];
};
```

Use `zeroAddress` for the native token balance. Native-token entries do not fetch allowance data. Omit `spenders` when only a balance is needed.

## Returned Shape

`fetchWallet` returns a diagnostics envelope:

```typescript
type WalletFetch = ServiceResult<Wallet>;
```

The `Wallet` helper exposes:

- `getAsset(asset)` for the raw `WalletAsset`.
- `getBalance(asset)` for a balance, defaulting to `0n` when the requested asset is missing.
- `getAllowances(asset, spender)` for spender-specific approval state.

Allowance entries contain:

```typescript
type AssetAllowances = {
  assetForVault: bigint;
  assetForPermit2: bigint;
  assetForVaultInPermit2: bigint;
  permit2ExpirationTime: number;
  permit2Nonce: number;
};
```

`assetForVault` is the direct ERC20 allowance from the account to the spender. `assetForPermit2` is the ERC20 allowance from the account to Permit2. `assetForVaultInPermit2`, `permit2ExpirationTime`, and `permit2Nonce` are read from Permit2 for the account/token/spender tuple.

## Read Path

The on-chain wallet adapter uses these query methods:

- `queryNativeBalance` for `eth_getBalance`.
- `queryTokenBalances` for batched ERC20 balance reads through `utilsLens.tokenBalances`.
- `queryBalanceOf` as the per-token fallback when a batched token-balance read fails.
- `queryAllowance` for direct ERC20 approvals and account-to-Permit2 approvals.
- `queryPermit2Allowance` for Permit2 spender allowance state.

All query methods are compatible with `buildQuery`, so applications can apply the same caching/logging/interception layer used for account and vault reads. Wallet state is user-specific and transaction-sensitive, so short stale times are recommended.
