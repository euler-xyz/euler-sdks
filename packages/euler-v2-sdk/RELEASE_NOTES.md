# euler-v2-sdk v0.1.3-beta

## Summary

This beta release promotes the new transaction plan execution flow, adds migration/cleanup planning helpers, and tightens V3 read-path defaults used by portfolio and account screens.

## Highlights

- Split transaction planning into encode, execute, and simulate helpers with operation-group metadata.
- Added same-asset position migrations, max-repay cleanup, and savings-sourced borrow/multiply examples.
- Expanded portfolio yield breakdown fields and refreshed the React example around computed portfolio data.
- Paginated V3 account positions and hardened reward valuation against malformed reward fields.
- Fixed keyring plugin batch prepending during transaction plan preparation.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
