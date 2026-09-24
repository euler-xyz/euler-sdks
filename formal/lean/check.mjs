import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const lake = process.env.LAKE || "lake";
const flags = process.argv.slice(2);
assert(flags.every((flag) => flag === "--write-fixture"), "Unknown argument");

function run(args) {
	const result = spawnSync(lake, args, {
		cwd: directory,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) {
		process.stderr.write(result.stdout || "");
		process.stderr.write(result.stderr || "");
		throw result.error || new Error(`lake ${args.join(" ")} failed (${result.status})`);
	}
	return result.stdout;
}

const version = run(["env", "lean", "--version"]);
assert.match(version, /^Lean \(version 4\.19\.0,/, "Use the pinned Lean 4.19.0 toolchain");
process.stdout.write(run(["build"]));

// Audit every theorem in the module's transitive proof dependencies. Kernel
// foundational axioms are allowed; sorryAx and any custom axiom fail the check.
const modules = ["EulerArithmetic", "BatchComposition"];
const names = modules.flatMap((module) => {
	const source = readFileSync(new URL(`${module}.lean`, import.meta.url), "utf8");
	const declarations = [...source.matchAll(/^(?:theorem|lemma) ([A-Za-z_][A-Za-z_0-9]*)/gm)]
		.map((match) => `${module}.${match[1]}`);
	assert(declarations.length > 0, `No theorems found in ${module}`);
	return declarations;
});
const auditPath = new URL(".lake/ArithmeticAudit.lean", import.meta.url);
writeFileSync(auditPath, [
	...modules.map((module) => `import ${module}`),
	...names.map((name) => `#print axioms ${name}`),
	"",
].join("\n"));
const audit = run(["env", "lean", fileURLToPath(auditPath)]);
const allowed = new Set(["propext", "Classical.choice", "Quot.sound"]);
for (const name of names) {
	const escaped = name.replaceAll(".", "\\.");
	const match = audit.match(new RegExp(`'${escaped}' (does not depend on any axioms|depends on axioms: \\[([^\\]]*)\\])`));
	assert(match, `Missing proof dependency audit for ${name}`);
	for (const axiom of (match[2] || "").split(",").map((value) => value.trim()).filter(Boolean)) {
		assert(allowed.has(axiom), `${name} depends on disallowed axiom ${axiom}`);
	}
}

// Use Lean's evaluator so fixture generation does not depend on a host C linker.
const freshOracle = run(["env", "lean", "--run", "Oracle.lean"]);
const fixturePath = new URL("oracle.json", import.meta.url);
if (flags.includes("--write-fixture")) writeFileSync(fixturePath, freshOracle);
assert.equal(readFileSync(fixturePath, "utf8"), freshOracle,
	"Lean oracle fixture is stale; regenerate intentionally with --write-fixture and review it");
const rows = JSON.parse(freshOracle);
assert.equal(rows.length, 497, "Oracle coverage changed: review the corpus and update its expected count");
console.log(`Lean 4.19.0: ${names.length} theorems checked; axiom audit passed; ${rows.length} fresh oracle rows match the checked-in fixture.`);
