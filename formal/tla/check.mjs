import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const directory = dirname(fileURLToPath(import.meta.url));
const jar = process.env.TLA2TOOLS_JAR ?? resolve(directory, "../.tools/tla2tools-1.7.4.jar");
const java = process.env.JAVA ?? "java";
const expectedHash = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
if (!existsSync(jar)) throw new Error("Run pnpm setup:tlc or set TLA2TOOLS_JAR to the pinned TLA+ 1.7.4 tla2tools.jar (see README.md)");
const digest = createHash("sha256").update(readFileSync(jar)).digest("hex");
if (digest !== expectedHash) throw new Error(`Unexpected TLC SHA-256: ${digest}`);

const invariants = ["TypeOK", "RequestOrder", "PrerequisiteSuccess", "HookGate",
  "SignaturesBeforeSignedCalls", "CompletedOnlyAfterSuccess", "NonceChecksBeforeDispatch"];
// Every case uses exhaustive breadth-first model checking; no simulation,
// depth bound, state constraint, or liveness assumption restricts the search.
const cases = [
  { name: "prerequisites-and-two-signatures", n: 3, slots: "<<2, 3>>", finalized: false, revalidate: true },
  { name: "already-finalized", n: 3, slots: "<<2, 3>>", finalized: true, revalidate: true },
  { name: "validation-disabled", n: 3, slots: "<<2, 3>>", finalized: false, revalidate: false },
  { name: "first-request-signed", n: 2, slots: "<<1, 1>>", finalized: false, revalidate: true },
  { name: "two-prerequisites-two-slots", n: 4, slots: "<<3, 3>>", finalized: false, revalidate: true },
  { name: "unsigned-requests", n: 3, slots: "<<>>", finalized: false, revalidate: true },
  { name: "empty-plan", n: 0, slots: "<<>>", finalized: false, revalidate: true },
  { name: "empty-finalized-plan", n: 0, slots: "<<>>", finalized: true, revalidate: true },
  ...["receipt", "signature", "order", "completion"].map((mutation) => ({
    name: `mutant-${mutation}`, n: 2, slots: "<<2>>", finalized: false,
    revalidate: true, mutation,
    violation: { receipt: "PrerequisiteSuccess", signature: "SignaturesBeforeSignedCalls",
      order: "RequestOrder", completion: "CompletedOnlyAfterSuccess" }[mutation],
  })),
  { name: "nonce-race-boundary", n: 1, slots: "<<1>>", finalized: false,
    revalidate: true, violation: "NonceStillPinnedAtDispatch" },
  { name: "completion-reachable", n: 3, slots: "<<2, 3>>", finalized: false,
    revalidate: true, violation: "NeverCompletes" },
  { name: "unknown-broadcast-reachable", n: 1, slots: "<<>>", finalized: false,
    revalidate: false, violation: "NeverHasUnknownBroadcast" },
];
const work = mkdtempSync(join(tmpdir(), "euler-tlc-"));
const results = [];
for (const scenario of cases) {
  const config = [
    "SPECIFICATION Spec", "CONSTANTS", `  RequestCount = ${scenario.n}`,
    `  SlotRequests <- ${{"<<2, 3>>": "TwoSignedRequests", "<<1, 1>>": "TwoSlotsInFirstRequest",
      "<<3, 3>>": "TwoSlotsAfterTwoPrerequisites", "<<2>>": "SecondRequestSigned",
      "<<1>>": "FirstRequestSigned", "<<>>": "NoSignatures"}[scenario.slots]}`,
    `  AlreadyFinalized = ${String(scenario.finalized).toUpperCase()}`,
    `  Revalidate = ${String(scenario.revalidate).toUpperCase()}`,
    `  Mutation = "${scenario.mutation ?? "none"}"`, "INVARIANTS",
    ...(scenario.violation ? [scenario.violation] : invariants).map((name) => `  ${name}`), "",
  ].join("\n");
  const configPath = join(work, `${scenario.name}.cfg`);
  writeFileSync(configPath, config);
  // TLC extracts standard modules into java.io.tmpdir. Separate it per process
  // so simultaneous local/CI runs cannot delete one another's extracted files.
  const javaTmp = mkdtempSync(join(work, `${scenario.name}-java-`));
  const result = spawnSync(java, [`-Djava.io.tmpdir=${javaTmp}`, "-XX:+UseParallelGC", "-Xmx1g", "-cp", resolve(jar),
    "tlc2.TLC", "-workers", "1", "-seed", "1", "-metadir", join(work, scenario.name),
    "-config", configPath, "MaterializedExecution.tla"], {
    cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeFileSync(join(work, `${scenario.name}.log`), output);
  const expectedFailure = scenario.violation && result.status === 12 &&
    output.includes(`Invariant ${scenario.violation} is violated.`);
  const success = scenario.violation ? expectedFailure : result.status === 0 &&
    output.includes("Model checking completed. No error has been found.");
  if (!success) {
    process.stderr.write(output);
    throw new Error(`${scenario.name} failed unexpectedly (status ${result.status}, ${result.error ?? ""}); logs: ${work}`);
  }
  const count = output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
  const row = { scenario: scenario.name, result: scenario.violation ? `EXPECTED ${scenario.violation}` : "PASS",
    generated: count?.[1] ?? "unknown", distinct: count?.[2] ?? "unknown" };
  results.push(row);
  console.log(`${row.scenario}: ${row.result}; ${row.generated} generated, ${row.distinct} distinct`);
}
writeFileSync(join(work, "results.json"), JSON.stringify({ tlc: "1.7.4", sha256: digest, cases: results }, null, 2) + "\n");
console.log(`All ${cases.length} TLA+ checks matched expectations. Configs, logs, counterexample traces: ${work}`);
