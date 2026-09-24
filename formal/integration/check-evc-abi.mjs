import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Requires a compiled checkout of the pinned EVC source. Does not fetch or send
// transactions. The Solidity fixture/review describe the local compilation.
const sdkRoot = fileURLToPath(new URL('../../packages/euler-v2-sdk/', import.meta.url));
const require = createRequire(resolve(sdkRoot, 'package.json'));
const ts = require('typescript');
const { formatAbiItem } = require('viem/utils');
const upstreamRoot = process.argv[2];
assert(upstreamRoot, 'Usage: node formal/integration/check-evc-abi.mjs <EVC checkout>');
const pinnedCommit = '838e5f72eaea25fab7d242760245244226096054';
assert.equal(execFileSync('git', ['-C', upstreamRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pinnedCommit, 'Unexpected upstream revision');
const source = readFileSync(resolve(sdkRoot, 'src/services/executionService/abis/ethereumVaultConnectorAbi.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { ethereumVaultConnectorAbi: sdk } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { abi: upstream } = JSON.parse(readFileSync(resolve(upstreamRoot, 'out/EthereumVaultConnector.sol/EthereumVaultConnector.json'), 'utf8'));
const parameterType = (parameter) => parameter.type.startsWith('tuple')
  ? `(${parameter.components.map(parameterType).join(',')})${parameter.type.slice(5)}`
  : parameter.type;
let checked = 0;
for (const item of sdk.filter((entry) => entry.type === 'function')) {
  const signature = formatAbiItem(item);
  const found = upstream.find((entry) => entry.type === 'function' && formatAbiItem(entry) === signature);
  assert(found, `Missing upstream function ${signature}`);
  assert.deepEqual(item.outputs.map(parameterType), found.outputs.map(parameterType), `${signature} return types`);
  assert.equal(item.stateMutability, found.stateMutability, `${signature} mutability`);
  checked++;
}
console.log(`Matched ${checked} SDK EVC function signatures, return types and mutability against ${pinnedCommit}.`);
