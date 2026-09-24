import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stages = [
  [process.execPath, ["formal/lean/check.mjs"]],
  [process.execPath, ["formal/tla/check.mjs"]],
  ["pnpm", ["run", "verify:formal:tests"]],
];
for (const [command, args] of stages) {
  console.log(`\nRunning ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\nFormal proofs, finite models, negative controls, and SDK correspondence tests passed.");
