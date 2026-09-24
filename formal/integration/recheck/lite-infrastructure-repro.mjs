import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

// This read-only installed copy was checked byte-for-byte against the exact
// 3.3.0 npm archive whose integrity is pinned by Lite's lockfile.
const sdkRoot = '/Users/kanv/Documents/euler/euler-lite/node_modules/@eulerxyz/euler-v2-sdk';
const require = createRequire(`${sdkRoot}/package.json`);
const { encodeFunctionResult, erc20Abi } = require('viem');
const load = path => import(pathToFileURL(`${sdkRoot}/dist/src/${path}.js`).href);
const { createQueryCacheBuildQuery } = await load('utils/buildQuery');
const { executeBatchSimulation } = await load('plugins/batchSimulation');
const { ethereumVaultConnectorAbi } = await load('services/executionService/abis/ethereumVaultConnectorAbi');
const { PythPluginAdapter } = await load('plugins/pyth/pythPlugin');
const results = [];

const clock = Date.now;
try {
  let now = 0;
  Date.now = () => now;
  const pending = [];
  const query = createQueryCacheBuildQuery()('queryExample', () => new Promise(resolve => pending.push(resolve)), {});
  const a = query('same');
  now = 5001;
  const b = query('same');
  pending[1]('new');
  assert.equal(await b, 'new');
  pending[0]('old');
  assert.equal(await a, 'old');
  assert.equal(await query('same'), 'old');
  results.push({ id: 'I01', outcome: 'reproduced', observed: 'Late old response replaced the completed new response under default 5-second SDK cache settings.', boundary: 'SDK cache used by Lite server. Browser uses its own wrapper; server-route concurrency not reproduced end-to-end.' });
} finally { Date.now = clock; }

const address = '0x0000000000000000000000000000000000000001';
const provider = { call: async () => ({ data: encodeFunctionResult({ abi: ethereumVaultConnectorAbi, functionName: 'batchSimulation', result: [[{ success: false, result: '0x' }, { success: true, result: encodeFunctionResult({ abi: erc20Abi, functionName: 'totalSupply', result: 42n }) }], [], []] }) }) };
const read = await executeBatchSimulation({ provider, evcAddress: address, prependItems: [{ targetContract: address, onBehalfOfAccount: address, value: 0n, data: '0x' }], totalValue: 0n, lensAddress: address, lensAbi: erc20Abi, lensFunctionName: 'totalSupply', lensArgs: [] });
assert.equal(read, 42n);
results.push({ id: 'I04', outcome: 'reproduced', observed: 'Failed prepend plus successful lens read returned 42 as a successful enriched result.', boundary: 'Published helper with a controlled ABI-encoded RPC result. Lite onchain account reads call this helper; no live oracle failure was induced.' });

let feeCalls = 0;
const feeProvider = { chain: { id: 1 }, readContract: async ({ args }) => { feeCalls++; return BigInt(args[0].length); } };
const adapter = new PythPluginAdapter('https://example.invalid', createQueryCacheBuildQuery());
assert.equal(await adapter.queryPythUpdateFee(feeProvider, address, ['0xab']), 1n);
assert.equal(await adapter.queryPythUpdateFee(feeProvider, address, ['0xab', '0xab']), 1n);
assert.equal(feeCalls, 1);
results.push({ id: 'I06', outcome: 'cache collision reproduced only', observed: 'One blob and two identical blobs reuse one fee response.', boundary: 'Synthetic differing-multiplicity inputs and fee callback. Does not prove Hermes emits this pattern or a live deployment charges a nonzero multiplicity-dependent fee.' });

writeFileSync(fileURLToPath(new URL('./lite-infrastructure-repro-results.json', import.meta.url)), JSON.stringify({ packageVersion: '3.3.0', boundary: 'Controlled package-level tests; no browser interaction, live transaction, or production incident validation.', results }, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
