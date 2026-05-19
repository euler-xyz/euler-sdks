# rEUL Lock Service

`reulLockService` owns rEUL vesting lock reads and unlock transaction planning.

The service is available on the SDK returned by `buildEulerSDK()`:

```typescript
const locks = await sdk.reulLockService.fetchLocks({
  chainId: 1,
  account: '0xOwner...',
})

const plan = sdk.reulLockService.buildUnlockPlan({
  chainId: 1,
  account: '0xOwner...',
  lockTimestamp: locks[0]!.timestamp,
})
```

## Read API

Use `fetchLocks({ chainId, account })` to read all rEUL locks for an account. It returns:

- `timestamp`
- `amount`
- `unlockableAmount`
- `amountToBeBurned`

The rEUL token address comes from deployment metadata at `addresses.tokenAddrs.rEUL`. Pass `rEulAddress` when using custom deployment data.

`batchSize` controls how many `getWithdrawAmountsByLockTimestamp` calls are sent concurrently. Each lock needs its own withdraw-amount read after `getLockedAmounts`, so this keeps accounts with many locks from creating an oversized RPC burst.

## Unlock Planning

Use `buildUnlockPlan({ chainId, account, lockTimestamp })` to create a standard `TransactionPlan` with one `contractCall` item:

```typescript
withdrawToByLockTimestamp(account, lockTimestamp, true)
```

Pass the returned plan to `sdk.executionService.executeTransactionPlan(...)`. The optional `allowRemainderLoss` argument defaults to `true` and maps directly to the contract call.
