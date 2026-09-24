import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../../packages/euler-v2-sdk/node_modules/typescript/lib/typescript.js";

// Reproduces the integration review's field-name/order comparison. This is
// deliberately not a Solidity ABI compiler, type-width check, or deployment check.
// Usage: node formal/integration/check-lens-structs.mjs /path/to/evk-periphery
const repository = fileURLToPath(new URL("../../", import.meta.url));
const periphery = process.argv[2] || process.env.PERIPHERY_ROOT;
assert(periphery && process.argv.length <= 3,
	"Pass an evk-periphery checkout path, or set PERIPHERY_ROOT. No downloads are performed.");
const manifest = JSON.parse(readFileSync(new URL("sources.json", import.meta.url), "utf8"));
const commit = manifest.repositories["evk-periphery"].commit;
assert.match(commit, /^[0-9a-f]{40}$/);

// Read the recorded Git object, not an arbitrary working-tree revision.
const solidity = execFileSync("git", [
	"-C", resolve(periphery), "show", `${commit}:src/Lens/LensTypes.sol`,
], { encoding: "utf8" })
	.replace(/\/\*[^]*?\*\//g, "")
	.replace(/\/\/[^\n]*/g, "");
const structs = new Map([...solidity.matchAll(/struct\s+(\w+)\s*\{([^}]+)\}/g)]
	.map(([, name, body]) => [name, [...body.matchAll(/(\w+(?:\[\])*)\s+(\w+)\s*;/g)]
		.map(([, type, field]) => ({ type, field }))]));
assert(structs.size > 0, "No LensTypes structs parsed; inspect the source grammar");

const paths = [
	"services/accountService/adapters/accountOnchainAdapter/abis/accountLensAbi.ts",
	"services/vaults/eVaultService/adapters/eVaultOnchainAdapter/abis/vaultLensAbi.ts",
	"services/vaults/eulerEarnService/adapters/abis/eulerEarnVaultLensAbi.ts",
	"services/vaults/securitizeVaultService/adapters/abis/utilsLensAbi.ts",
	"services/vaults/securitizeVaultService/adapters/abis/erc4626EvcCollateralSecuritizeAbi.ts",
	"services/priceService/utilsLensPriceAbi.ts",
];
const checked = new Set();
const unmatched = new Set();
let occurrences = 0;

function visit(node, path) {
	if (node.components) {
		const name = node.internalType?.replace(/^struct /, "").replace(/\[\]$/, "");
		const expected = structs.get(name);
		if (expected) {
			assert(expected.length > 0, `No fields parsed for ${name}`);
			assert.deepEqual(node.components.map((field) => field.name),
				expected.map((field) => field.field), `${path}: ${name} field names/order differ`);
			checked.add(name);
			occurrences++;
		} else {
			unmatched.add(`${path}: ${name ?? "unnamed tuple"}`);
		}
		for (const child of node.components) visit(child, path);
	}
	for (const child of [...(node.inputs ?? []), ...(node.outputs ?? [])]) visit(child, path);
}

for (const path of paths) {
	const source = readFileSync(resolve(repository, "packages/euler-v2-sdk/src", path), "utf8");
	// The selected files contain literal ABI exports and type-only imports.
	// Transpilation removes TypeScript annotations; this does not compile Solidity.
	const javascript = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.ES2022 },
	}).outputText;
	const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
	const arrays = Object.values(module).filter(Array.isArray);
	assert(arrays.length > 0, `${path}: no ABI arrays found`);
	for (const abi of arrays) for (const item of abi) visit(item, path);
}
assert.equal(checked.size, 21, "Compared struct count changed; review coverage before updating it");
console.log(JSON.stringify({
	peripheryCommit: commit,
	checkedDistinctStructs: checked.size,
	checkedTupleOccurrences: occurrences,
	structs: [...checked].sort(),
	unmatchedTuples: [...unmatched].sort(),
	limitations: [
		"Checks exact ordered field names in matching LensTypes structs only.",
		"Does not check Solidity types, widths, signedness, selectors, function signatures, or deployed bytecode.",
		"Uses a parser for the current simple LensTypes struct grammar, not a Solidity compiler.",
	],
}, null, 2));
