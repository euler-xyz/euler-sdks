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
  allowRemainderLoss: false,
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

Use `buildUnlockPlan({ chainId, account, lockTimestamp, allowRemainderLoss })` to create a `TransactionPlan` containing one named EVC batch operation:

```typescript
withdrawToByLockTimestamp(account, lockTimestamp, allowRemainderLoss)
```

`allowRemainderLoss` is required and maps directly to the contract call. Set it to `true` only after the application has shown the current `amountToBeBurned` and the user has explicitly accepted that loss. Set it to `false` when any remainder loss must reject the unlock.

Pass the returned plan to `sdk.executionService.executeTransactionPlan(...)`. Do not place an rEUL claim before an unlock in the same batch unless the review is calculated from the exact post-claim lock state.
