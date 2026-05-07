# Euler SDK React Example

This Vite app demonstrates a React data layer built around `buildEulerSDK`.

## What It Uses

- One SDK instance from `src/context/SdkContext.tsx`.
- React Query decoration for SDK `query*` methods in `src/queries/sdkQueries.ts`.
- Account, portfolio, vault, reward, oracle-adapter, FeeFlow, swap, execution, and wallet reads through SDK services.
- `walletService.fetchWallet` for wallet balances. Balance-only requests omit `spenders`; allowance-aware flows pass the spender addresses they need.

Wallet query stale times are intentionally short because native balances, ERC20 balances, direct allowances, and Permit2 allowances change with user transactions.

## Running

```bash
pnpm install
pnpm -C packages/euler-v2-sdk/examples/react-sdk-example dev
```

Set RPC and API environment values in `.env` as needed for the chains you want to inspect.
