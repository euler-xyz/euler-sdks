# Decoding Smart Contract Errors

Use `decodeSmartContractErrors` to extract and decode revert errors from unknown execution error shapes.

## Import

```ts
import { decodeSmartContractErrors } from "euler-v2-sdk";
```

## Signature

```ts
type DecodedSmartContractError = {
  message: string;
  params: unknown[];
};

function decodeSmartContractErrors(
  input: unknown,
  options?: { fetchTimeout?: number }
): Promise<DecodedSmartContractError[]>;
```

## What It Returns

Each result has:

- `message`
  - custom error signature like `Swapper_SwapError(address,bytes)`, or
  - decoded revert reason string for `Error(string)` (for example `"Slippage Limit Exceeded"`).
- `params`
  - decoded params for that error (empty for plain revert reason strings).

## Behavior

The decoder applies heuristics and recursive parsing:

1. Collect candidate strings from the input.
2. Find known Euler custom errors by signature/name text.
3. Extract possible revert hex payloads.
4. Resolve selector signatures (local Euler map first; remote lookup only if unknown).
5. ABI-decode full payloads when possible.
6. Recursively decode nested revert bytes.
7. Deduplicate final results.

## Example

```ts
const error =
  "custom error 0x436fa211: 000000000000000000000000cf5540fffcdc3d510b18bfca6d2b9987b0772559" +
  "0000000000000000000000000000000000000000000000000000000000000040" +
  "0000000000000000000000000000000000000000000000000000000000000064" +
  "08c379a000000000000000000000000000000000000000000000000000000000" +
  "0000002000000000000000000000000000000000000000000000000000000000" +
  "00000017536c697070616765204c696d69742045786365656465640000000000";

const decoded = await decodeSmartContractErrors(error);

console.log(decoded);
// [
//   {
//     message: 'Swapper_SwapError(address,bytes)',
//     params: [
//       '0xCf5540fFFCdC3d510B18bFcA6d2b9987b0772559',
//       '0x08c379a0...'
//     ]
//   },
//   {
//     message: 'Slippage Limit Exceeded',
//     params: []
//   }
// ]
```

## Notes

- The function accepts arbitrary input (`unknown`) and handles nested objects/errors.
- Network lookup is used only for selectors not found in the built-in Euler selector map.
- Use `fetchTimeout` (ms) to control timeout for unknown-selector OpenChain/Sourcify lookups. Default is `2000`.
- `Error(string)` is returned as the decoded message text, not as `Error(string)`.
