import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../..');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
const sources = walk(resolve(root, 'packages/euler-v2-sdk/src')).filter((path) => path.endsWith('.ts')).map((path) => relative(root, path)).sort();
const reports = ['infrastructure', 'data', 'execution', 'swap-migration'];
const owners = new Map();
for (const report of reports) {
  const paths = JSON.parse(readFileSync(resolve(dir, `${report}-coverage.json`), 'utf8'));
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) throw new Error(`Invalid ${report} coverage list`);
  if (new Set(paths).size !== paths.length) throw new Error(`Duplicate paths in ${report} coverage list`);
  for (const path of paths) {
    if (!sources.includes(path)) throw new Error(`Unknown source path: ${path}`);
    owners.set(path, [...(owners.get(path) ?? []), report]);
  }
}
const missing = sources.filter((path) => !owners.has(path));
if (missing.length) throw new Error(`Source files without recorded review:\n${missing.join('\n')}`);
const entries = sources.map((path) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
  review: owners.get(path),
  level: /\/abis\/|Abi\.ts$|\/index\.ts$|Types\.ts$|\/types\.ts$|\/queryNames\.ts$/.test(path) ? 'interface/export review' : 'source and call-path review',
}));
const manifest = JSON.stringify({
  sdkBase: 'ff224741c251cae7673c5f835dcf3bbccd9d6605',
  reviewedAt: '2026-09-23',
  note: 'Every SDK source file has a review assignment, not a proof or exhaustive branch/test coverage. See each named report for depth, evidence and limits. Hashes identify the reviewed local source, including uncommitted changes.',
  entries,
}, null, 2) + '\n';
const path = resolve(dir, 'coverage.json');
if (process.argv.includes('--write')) writeFileSync(path, manifest);
else if (readFileSync(path, 'utf8') !== manifest) throw new Error('Coverage manifest is stale. Review changed sources before regenerating with --write.');
console.log(`Review inventory matches all ${entries.length} SDK source files; ${entries.filter((e) => e.level === 'interface/export review').length} are supporting interfaces/exports. This is inventory coverage, not a correctness proof.`);
