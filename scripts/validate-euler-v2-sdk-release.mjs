#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "@eulerxyz/euler-v2-sdk";
const tagPrefix = "euler-v2-sdk-v";
const packageDir = "packages/euler-v2-sdk";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const requestedTag = args.find((arg) => !arg.startsWith("--")) ?? process.env.RELEASE_TAG ?? "";
const jsonOutput = args.includes("--json");

function fail(message) {
  console.error(`release validation failed: ${message}`);
  process.exit(1);
}

async function readJson(relativePath) {
  const raw = await readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(raw);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSemver(version) {
  const match = version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );

  if (!match) {
    fail(`package version "${version}" is not valid semver`);
  }

  return {
    version,
    npmTag: match[4]?.split(".")[0] ?? "latest",
    isPrerelease: Boolean(match[4]),
  };
}

function validateTag(tag, version) {
  if (!tag) {
    fail("release tag is required");
  }

  if (!tag.startsWith(tagPrefix)) {
    fail(`tag "${tag}" must start with "${tagPrefix}"`);
  }

  const expectedTag = `${tagPrefix}${version}`;
  if (tag !== expectedTag) {
    fail(`tag "${tag}" does not match ${packageName} package version ${version}; expected "${expectedTag}"`);
  }
}

function requireText(text, pattern, description) {
  if (!pattern.test(text)) {
    fail(description);
  }
}

const packageJson = await readJson(`${packageDir}/package.json`);

if (packageJson.name !== packageName) {
  fail(`expected package name "${packageName}", found "${packageJson.name}"`);
}

if (packageJson.private === true) {
  fail(`${packageName} must not be private when publishing to npm`);
}

if (packageJson.repository?.directory !== packageDir) {
  fail(`package repository.directory must be "${packageDir}"`);
}

if (packageJson.publishConfig?.access !== "public") {
  fail('package publishConfig.access must be "public"');
}

if (packageJson.publishConfig?.provenance !== true) {
  fail("package publishConfig.provenance must be true");
}

if (!packageJson.files?.includes("dist")) {
  fail('package files must include "dist"');
}

if (packageJson.scripts?.prepublishOnly !== "pnpm run release:check") {
  fail('package prepublishOnly must be "pnpm run release:check"');
}

if (packageJson.scripts?.["release:check"] !== "pnpm run clean && pnpm run build && pnpm run typecheck && npm pack --dry-run") {
  fail("package release:check must run clean, build, typecheck, and npm pack --dry-run");
}

const release = parseSemver(packageJson.version);
validateTag(requestedTag, release.version);

const changelog = await readFile(path.join(rootDir, packageDir, "CHANGELOG.md"), "utf8");
const releaseNotes = await readFile(path.join(rootDir, packageDir, "RELEASE_NOTES.md"), "utf8");

requireText(
  changelog,
  new RegExp(`^## \\[${escapeRegExp(release.version)}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m"),
  `CHANGELOG.md must contain a dated entry for ${release.version}`,
);

requireText(
  releaseNotes,
  new RegExp(`^# euler-v2-sdk v${escapeRegExp(release.version)}$`, "m"),
  `RELEASE_NOTES.md must start with "euler-v2-sdk v${release.version}"`,
);

const result = {
  packageName,
  packageDir,
  version: release.version,
  tag: requestedTag,
  npmTag: release.npmTag,
  prerelease: release.isPrerelease,
};

if (jsonOutput) {
  console.log(JSON.stringify(result));
} else {
  console.log(
    `Validated ${packageName} ${release.version} for tag ${requestedTag}; npm dist-tag ${release.npmTag}.`,
  );
}
