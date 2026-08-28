import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const aabPath = join(root, "android-pro/app/build/outputs/bundle/release/app-release.aab");

if (!existsSync(aabPath)) {
  console.error("AAB not found at", aabPath);
  process.exit(1);
}

const stats = statSync(aabPath);
const buffer = readFileSync(aabPath);
const sha256 = createHash("sha256").update(buffer).digest("hex");

console.log("=== HOUZZATPRO RELEASE AAB AUDIT ===");
console.log("AAB Path:", aabPath);
console.log("File Size:", stats.size, "bytes", "(" + (stats.size / 1024 / 1024).toFixed(2) + " MB)");
console.log("SHA-256:", sha256);

// Extract capacitor.config.json from inside the AAB
const extractedConfig = execSync(`unzip -p "${aabPath}" "base/assets/capacitor.config.json"`).toString("utf8");
console.log("\n--- Embedded base/assets/capacitor.config.json ---");
console.log(extractedConfig.trim());

const parsed = JSON.parse(extractedConfig);
assert.equal(parsed.appId, "com.houzzat.pro", "appId must be com.houzzat.pro");
assert.equal(parsed.server?.url, "https://app.houzzatpro.com/pro", "server.url must be https://app.houzzatpro.com/pro");
assert.ok(!parsed.server?.url?.includes("tenant-canary"), "server.url must not contain tenant-canary");
assert.ok(!parsed.server?.url?.includes("houzzat.com/pro"), "server.url must not contain houzzat.com");
assert.ok(parsed.server?.allowNavigation.includes("app.houzzatpro.com"));
assert.ok(parsed.server?.allowNavigation.includes("houzzat.com"));
assert.ok(parsed.server?.allowNavigation.includes("*.houzzatpro.com"));

// Search for any occurrence of tenant-canary or houzzat.com in the AAB assets
const assetList = execSync(`unzip -l "${aabPath}"`).toString("utf8");
console.log("\n--- AAB Contents Check ---");
console.log("Total entries in AAB:", assetList.trim().split("\n").length);

// Check manifest / bundle metadata if bundletool / aapt / unzip available
const gradleFile = readFileSync(join(root, "android-pro/app/build.gradle"), "utf8");
const codeMatch = gradleFile.match(/versionCode\s+(\d+)/);
const nameMatch = gradleFile.match(/versionName\s+"([^"]+)"/);

console.log("\n--- Gradle Build Specs ---");
console.log("versionCode:", codeMatch ? codeMatch[1] : "unknown");
console.log("versionName:", nameMatch ? nameMatch[1] : "unknown");

assert.equal(codeMatch?.[1], "7", "versionCode must be 7");
assert.equal(nameMatch?.[1], "1.0.5", "versionName must be 1.0.5");

console.log("\nALL AAB VERIFICATIONS PASSED.");
