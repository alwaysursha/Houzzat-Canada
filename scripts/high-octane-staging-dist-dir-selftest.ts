/**
 * HIGH OCTANE staging Next.js build directory stays fixed and opt-in.
 * Run: pnpm exec tsx scripts/high-octane-staging-dist-dir-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_NEXT_DIST_DIR,
  HIGH_OCTANE_STAGING_NEXT_DIST_DIR,
  resolveNextDistDir,
} from "../src/lib/next/high-octane-staging-dist-dir";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(resolveNextDistDir({}), DEFAULT_NEXT_DIST_DIR);
assert.equal(resolveNextDistDir({ HIGH_OCTANE_STAGING_DIST: undefined }), DEFAULT_NEXT_DIST_DIR);
assert.equal(resolveNextDistDir({ HIGH_OCTANE_STAGING_DIST: "1" }), HIGH_OCTANE_STAGING_NEXT_DIST_DIR);

for (const value of [
  "",
  "0",
  "true",
  "yes",
  "on",
  ".next",
  ".next-high-octane-staging",
  ".next-other",
  "../tmp",
  "/tmp/next",
  " 1",
  "1 ",
]) {
  assert.equal(
    resolveNextDistDir({ HIGH_OCTANE_STAGING_DIST: value }),
    DEFAULT_NEXT_DIST_DIR,
    value,
  );
}

assert.equal(DEFAULT_NEXT_DIST_DIR, ".next");
assert.equal(HIGH_OCTANE_STAGING_NEXT_DIST_DIR, ".next-high-octane-staging");
assert.notEqual(DEFAULT_NEXT_DIST_DIR, HIGH_OCTANE_STAGING_NEXT_DIST_DIR);
assert.equal(
  relative(join(root, DEFAULT_NEXT_DIST_DIR), join(root, HIGH_OCTANE_STAGING_NEXT_DIST_DIR)).startsWith(".."),
  true,
);

const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
assert.ok(nextConfig.includes("distDir: resolveNextDistDir()"));
assert.equal(nextConfig.includes("distDir: process.env"), false);

const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
assert.ok(gitignore.includes("/.next-high-octane-staging/"));

console.log("high-octane-staging-dist-dir-selftest: ok");
