# Euler V2 SDK Examples

This directory contains comprehensive examples demonstrating all the planX functions available in the Euler V2 SDK.

## Running Examples

First, start Anvil with a mainnet fork:

```bash
pnpm run anvil
```

Then in another terminal, run any example:

```bash
pnpm run <example-name>
```

## ✅ Working Examples

### Basic Operations
- **deposit-example** - Deposit assets into a vault with collateral enabled
- **withdraw-example** - Withdraw assets from a vault after depositing
- **redeem-example** - Redeem vault shares to receive underlying assets

### Borrowing & Repayment
- **borrow-example** - Deposit collateral and borrow against it
- **repay-from-wallet-example** - Repay debt using assets from wallet
- **repay-from-deposit-example** - Repay debt by withdrawing from a vault deposit
- **repay-with-swap-example** - Repay debt by swapping collateral assets

### Advanced Operations
- **multiply-example** - Open leveraged long positions using swap
- **swap-collateral-example** - Swap one collateral asset for another
- **swap-debt-example** - Refinance debt to a different asset

## ⚠️ Examples with Known Issues

### mint-example ❌
**Status**: Not implemented in SDK
**Issue**: The `planMint` function is declared in the interface but not implemented in the execution service.
**Error**: Transfer amount exceeds allowance

### transfer-example ❌
**Status**: Implementation issue or unsupported operation  
**Issue**: Fails with custom error 0x73748093 when attempting to transfer shares between sub-accounts
**Possible Cause**: May require additional permissions or operator setup

### pull-debt-example ❌
**Status**: Implementation issue or requires additional setup
**Issue**: Fails with custom error 0xf2fbfb2d when attempting to pull debt between sub-accounts  
**Possible Cause**: May require the receiving account to be set as an operator or have specific permissions

### swap-collateral-example & swap-debt-example ⚠️
**Status**: Requires live DEX quotes
**Note**: These examples fetch real-time swap quotes from DEX aggregators. If they fail:
1. Restart Anvil immediately before running
2. Try changing `SWAP_QUOTE_INDEX` to use a different quote provider
3. Blockchain state can become stale, causing swaps to fail

## Example Structure

All examples follow a consistent pattern:

1. **Header Documentation** - Explains what the example does, the assets/vaults involved, and any special considerations
2. **Setup** - Initialize SDK and fetch account data
3. **Plan Creation** - Use SDK's `planX` functions to create transaction plans
4. **Approval Resolution** - Resolve required approvals (Permit2 or regular approvals)
5. **Execution** - Execute the plan through the EVC batch system
6. **Results** - Log before/after state to show the operation's effect

## Configuration

Examples use the following configuration (from `utils/config.ts`):

- **RPC URL**: Local Anvil fork at `http://127.0.0.1:8545`
- **Vaults**: 
  - Euler Prime USDC Vault
  - Euler Prime USDT Vault
  - Euler Prime WETH Vault
- **Private Key**: Optional - set `PRIVATE_KEY` in `.env` to use an existing account, otherwise a test account is auto-created

## Troubleshooting

### "No swap quotes available"
- Restart Anvil to get fresh blockchain state
- Try a different `SWAP_QUOTE_INDEX` value in the example file

### "Insufficient balance" or "Insufficient collateral"
- The examples are designed to work with fresh Anvil forks
- Some examples modify blockchain state, so restart Anvil between runs

### Permission/Authorization Errors
- Some operations (transfer, pullDebt) may require additional setup
- Check that the correct sub-accounts and permissions are configured

## Adding New Examples

When creating new examples, follow these guidelines:

1. Use the existing examples as templates
2. Include comprehensive header documentation
3. Break complex operations into clear steps with logging
4. Handle errors gracefully with helpful messages
5. Show before/after state using `logOperationResult`
6. Add the script to `package.json`

## Example Output

All examples produce structured output showing:

- **Operation header** - Clear title of what's being demonstrated
- **Step-by-step logs** - Progress through each operation
- **Operation results** - Detailed before/after comparison showing:
  - New/updated sub-accounts
  - Position changes (shares, assets, borrowed amounts)
  - Collateral/controller status changes

Example output format:

```
================================================================================
DEPOSIT EXAMPLE
================================================================================

✓ Deposit plan created with 2 step(s)
✓ Approvals resolved, executing...
  ✓ EVC batch
    - deposit

════════════════════════════════════════════════════════════════════════════════
OPERATION RESULT
════════════════════════════════════════════════════════════════════════════════

📝 UPDATED SUB-ACCOUNT: 0x3d79...1957
  Positions:

    🔄 CHANGED Position:
    Vault:       Vault 0x797D...48a9
    Asset:       USDC
    Shares:      18.608748 USDC → 27.913107 USDC (+9.304359 USDC)
    Assets:      20.00003 USDC → 30.000029 USDC (+9.999999 USDC)
    Collateral:  true

════════════════════════════════════════════════════════════════════════════════
```

## Related Documentation

- [Euler V2 SDK Documentation](../../README.md)
- [EVC Documentation](https://github.com/euler-xyz/ethereum-vault-connector)
- [Euler Vault Kit](https://github.com/euler-xyz/euler-vault-kit)
