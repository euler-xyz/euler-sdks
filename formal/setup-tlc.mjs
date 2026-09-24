import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Only the checker is downloaded. Java and Lean remain explicit local prerequisites.
const version = "1.7.4";
const checksum = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
const directory = join(dirname(fileURLToPath(import.meta.url)), ".tools");
const destination = join(directory, `tla2tools-${version}.jar`);
const digest = (data) => createHash("sha256").update(data).digest("hex");
if (existsSync(destination) && digest(readFileSync(destination)) === checksum) {
  console.log(`Pinned TLC already available: ${destination}`);
} else {
  const response = await fetch(`https://github.com/tlaplus/tlaplus/releases/download/v${version}/tla2tools.jar`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`TLC download failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== checksum) throw new Error("Downloaded TLC does not match the pinned SHA-256");
  mkdirSync(directory, { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, data, { flag: "wx" });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
  console.log(`Downloaded and verified TLC ${version}: ${destination}`);
}
