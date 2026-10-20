import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

function run(args, cwd) {
	const result = spawnSync(process.execPath, args, {
		cwd,
		encoding: "utf8",
		timeout: 30_000,
	});
	assert.equal(result.error, undefined);
	assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("built package root supports the documented source-aware consumer", async (t) => {
	const consumer = await mkdtemp(join(tmpdir(), "euler-sdk-package-api-"));
	t.after(() => rm(consumer, { recursive: true, force: true }));
	await mkdir(join(consumer, "node_modules/@eulerxyz"), { recursive: true });
	await symlink(
		packageRoot,
		join(consumer, "node_modules/@eulerxyz/euler-v2-sdk"),
		"dir",
	);
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify({ private: true, type: "module" }),
	);

	const docs = await readFile(
		new URL("../docs/configuration.md", import.meta.url),
		"utf8",
	);
	const recipes = [...docs.matchAll(/```typescript\r?\n([\s\S]*?)```/g)]
		.map((match) => match[1])
		.filter((snippet) => snippet.includes("new AccountVaultsSubgraphAdapter("));
	assert.equal(
		recipes.length,
		1,
		"configuration.md must contain one source-aware discovery recipe",
	);

	// The recipe is copied verbatim; only its application inputs and public type checks are supplied here.
	await writeFile(
		join(consumer, "consumer.ts"),
		`
const chainId = 1;
const account = "0x0000000000000000000000000000000000000001";
${recipes[0]}
import type {
  AccountVaults,
  AccountVaultsSubgraphAdapterConfig,
  SubgraphReadOptions,
  SubgraphReadResult,
} from "@eulerxyz/euler-v2-sdk";
const config: AccountVaultsSubgraphAdapterConfig = { subgraphURLs: {} };
const options: SubgraphReadOptions = { expectedSource: baseline.source };
const typedResult: SubgraphReadResult<AccountVaults> = next;
const typedVaults: AccountVaults = typedResult.value;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const valueIsTyped: IsAny<typeof next.value> = false;
export { account, chainId, discovery, baseline, next, config, options, typedVaults, valueIsTyped };
`,
	);
	await writeFile(
		join(consumer, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				strict: true,
				skipLibCheck: true,
				noEmitOnError: true,
				types: [],
			},
			files: ["consumer.ts"],
		}),
	);
	run(
		[require.resolve("typescript/bin/tsc"), "--project", "tsconfig.json"],
		consumer,
	);
	await copyFile(
		new URL("./fixtures/package-api-runtime.mjs", import.meta.url),
		join(consumer, "runtime.mjs"),
	);
	run(["runtime.mjs"], consumer);
});
