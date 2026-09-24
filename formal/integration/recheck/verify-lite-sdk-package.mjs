import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(resolve(repo, 'packages/euler-v2-sdk/package.json'));
const ts = require('typescript');
const base = 'ff224741c251cae7673c5f835dcf3bbccd9d6605';
const review = '/private/tmp/euler-sdk-integration-review';
const published = resolve(review, 'sdk-published-3.3.0/package/dist/src');
const tarball = readFileSync(resolve(review, 'sdk-3.3.0.tgz'));
const lock = JSON.parse(readFileSync(resolve(review, 'euler-lite-master/package-lock.json'), 'utf8'));
const expected = lock.packages['node_modules/@eulerxyz/euler-v2-sdk'].integrity;
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
if (integrity !== expected) throw new Error('Tarball does not match Lite lockfile');
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)]);
const canonical = text => ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile('comparison.js', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS));
const matches = [], mismatches = [], missing = [];
for (const path of files(published).filter(p => p.endsWith('.js'))) {
  const name = relative(published, path);
  let original;
  try {
    original = execFileSync('git', ['show', `${base}:packages/euler-v2-sdk/src/${name.replace(/\.js$/, '.ts')}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { missing.push(name); continue; }
  const emitted = ts.transpileModule(original, { fileName: name.replace(/\.js$/, '.ts'), compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, esModuleInterop: true } }).outputText;
  (canonical(emitted) === canonical(readFileSync(path, 'utf8')) ? matches : mismatches).push(name);
}
const result = { sdkBase: base, packageVersion: '3.3.0', integrity, integrityMatchesLiteLock: true, comparison: 'TypeScript transpilation followed by JavaScript printer normalization; comments and formatting excluded. This checks emitted code, not deployment provenance.', matchedCount: matches.length, mismatches, missing, matches };
result.mismatchExplanation = {
  'utils/buildQuery.js': 'Published package lacks original-main PublicClient blockPin cache-key field; the stale completion race is identical.',
  'index.js': 'Export-only additions in original-main.',
  'services/vaults/eVaultService/index.js': 'Export-only additions in original-main.',
  'services/vaults/securitizeVaultService/index.js': 'Export-only additions in original-main.',
};
const installed = '/Users/kanv/Documents/euler/euler-lite/node_modules/@eulerxyz/euler-v2-sdk/dist/src';
result.installedCopy = installed;
result.installedPublishedJavaScriptByteMatches = files(published).filter(p => p.endsWith('.js') && readFileSync(p).equals(readFileSync(resolve(installed, relative(published, p))))).length;
writeFileSync(resolve(repo, 'formal/integration/recheck/lite-sdk-package-validation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ matched: matches.length, mismatches, missing }));
