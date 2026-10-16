/**
 * Regression: prisma env loading must not let .env.local overwrite explicit
 * DATABASE_URL / DIRECT_URL. Includes a fresh-process fixture-file check.
 * No real DB connections; dummy URLs only; credentials never printed.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadPrismaEnv,
  resetPrismaEnvBootSnapshotForTests,
  resolvePrismaDatasourceUrl,
  restoreExplicitDbUrls,
  snapshotExplicitDbUrls,
} from "../prisma/load-prisma-env";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function makeFileLoader(
  env: NodeJS.ProcessEnv,
  files: Map<string, Record<string, string>>,
) {
  return (options?: { path?: string; override?: boolean }) => {
    const path = options?.path ?? ".env";
    const values = files.get(path) ?? {};
    for (const [key, value] of Object.entries(values)) {
      if (options?.override) {
        env[key] = value;
      } else if (env[key] === undefined) {
        env[key] = value;
      }
    }
  };
}

function testSnapshotDetectsPresence() {
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgres://explicit-db",
  };
  const snap = snapshotExplicitDbUrls(env);
  assert.equal(snap.hasDatabaseUrl, true);
  assert.equal(snap.hasDirectUrl, false);
  assert.equal(snap.databaseUrl, "postgres://explicit-db");
}

function testRestoreWinsOverLaterMutation() {
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgres://explicit-db",
    DIRECT_URL: "postgres://explicit-direct",
  };
  const snap = snapshotExplicitDbUrls(env);
  env.DATABASE_URL = "postgres://from-dotenv-local";
  env.DIRECT_URL = "postgres://from-dotenv-local-direct";
  restoreExplicitDbUrls(env, snap);
  assert.equal(env.DATABASE_URL, "postgres://explicit-db");
  assert.equal(env.DIRECT_URL, "postgres://explicit-direct");
}

function testEmptyExplicitValuePreserved() {
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: "",
  };
  const snap = snapshotExplicitDbUrls(env);
  assert.equal(snap.hasDatabaseUrl, true);
  env.DATABASE_URL = "postgres://from-file";
  restoreExplicitDbUrls(env, snap);
  assert.equal(env.DATABASE_URL, "");
}

function testUnsetFallsThroughToFileValues() {
  const env: NodeJS.ProcessEnv = {};
  resetPrismaEnvBootSnapshotForTests(env);
  const files = new Map<string, Record<string, string>>([
    [
      ".env",
      {
        DATABASE_URL: "postgres://from-env",
        DIRECT_URL: "postgres://from-env-direct",
      },
    ],
    [
      ".env.local",
      {
        DATABASE_URL: "postgres://from-local",
        DIRECT_URL: "postgres://from-local-direct",
      },
    ],
  ]);

  loadPrismaEnv({
    env,
    resetBootSnapshot: true,
    envFile: ".env",
    localEnvFile: ".env.local",
    loadEnvFile: makeFileLoader(env, files),
  });

  assert.equal(env.DATABASE_URL, "postgres://from-local");
  assert.equal(env.DIRECT_URL, "postgres://from-local-direct");
  assert.equal(resolvePrismaDatasourceUrl(env), "postgres://from-local-direct");
}

function testExplicitNotOverwrittenByLocalFile() {
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgres://explicit-db",
    DIRECT_URL: "postgres://explicit-direct",
  };
  const files = new Map<string, Record<string, string>>([
    [
      ".env",
      {
        DATABASE_URL: "postgres://from-env",
        DIRECT_URL: "postgres://from-env-direct",
      },
    ],
    [
      ".env.local",
      {
        DATABASE_URL: "postgres://from-local",
        DIRECT_URL: "postgres://from-local-direct",
        OTHER: "ok",
      },
    ],
  ]);

  loadPrismaEnv({
    env,
    resetBootSnapshot: true,
    loadEnvFile: makeFileLoader(env, files),
  });

  assert.equal(env.DATABASE_URL, "postgres://explicit-db");
  assert.equal(env.DIRECT_URL, "postgres://explicit-direct");
  assert.equal(env.OTHER, "ok");
  assert.equal(resolvePrismaDatasourceUrl(env), "postgres://explicit-direct");
}

function testDirectUrlPrecedenceOverDatabaseUrl() {
  assert.equal(
    resolvePrismaDatasourceUrl({
      DATABASE_URL: "postgres://db",
      DIRECT_URL: "postgres://direct",
    }),
    "postgres://direct",
  );
  assert.equal(
    resolvePrismaDatasourceUrl({
      DATABASE_URL: "postgres://db",
    }),
    "postgres://db",
  );
  assert.equal(resolvePrismaDatasourceUrl({}), undefined);
}

function testPartialExplicitOnlyRestoresThatKey() {
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgres://explicit-db",
  };
  loadPrismaEnv({
    env,
    resetBootSnapshot: true,
    loadEnvFile: (options) => {
      if (options?.path === ".env.local" && options.override) {
        env.DATABASE_URL = "postgres://from-local";
        env.DIRECT_URL = "postgres://from-local-direct";
      } else if (!options?.override) {
        if (env.DATABASE_URL === undefined) {
          env.DATABASE_URL = "postgres://from-env";
        }
        if (env.DIRECT_URL === undefined) {
          env.DIRECT_URL = "postgres://from-env-direct";
        }
      }
    },
  });
  assert.equal(env.DATABASE_URL, "postgres://explicit-db");
  assert.equal(env.DIRECT_URL, "postgres://from-local-direct");
  assert.equal(resolvePrismaDatasourceUrl(env), "postgres://from-local-direct");
}

function testPartialExplicitDirectOnly() {
  const env: NodeJS.ProcessEnv = {
    DIRECT_URL: "postgres://explicit-direct",
  };
  loadPrismaEnv({
    env,
    resetBootSnapshot: true,
    loadEnvFile: makeFileLoader(
      env,
      new Map([
        [
          ".env.local",
          {
            DATABASE_URL: "postgres://from-local",
            DIRECT_URL: "postgres://from-local-direct",
          },
        ],
      ]),
    ),
  });
  assert.equal(env.DATABASE_URL, "postgres://from-local");
  assert.equal(env.DIRECT_URL, "postgres://explicit-direct");
  assert.equal(resolvePrismaDatasourceUrl(env), "postgres://explicit-direct");
}

/**
 * Repeated load must not freeze file-loaded values as "explicit".
 * Boot snapshot is taken once; second load can refresh from files when unset at boot.
 */
function testRepeatedLoadDoesNotTreatFileValuesAsExplicit() {
  const env: NodeJS.ProcessEnv = {};
  const files = new Map<string, Record<string, string>>([
    [
      ".env.local",
      {
        DATABASE_URL: "postgres://from-local-v1",
        DIRECT_URL: "postgres://from-local-direct-v1",
      },
    ],
  ]);

  loadPrismaEnv({
    env,
    resetBootSnapshot: true,
    loadEnvFile: makeFileLoader(env, files),
  });
  assert.equal(env.DATABASE_URL, "postgres://from-local-v1");

  files.set(".env.local", {
    DATABASE_URL: "postgres://from-local-v2",
    DIRECT_URL: "postgres://from-local-direct-v2",
  });

  loadPrismaEnv({
    env,
    // Intentionally no resetBootSnapshot — simulates accidental double load.
    loadEnvFile: makeFileLoader(env, files),
  });

  assert.equal(
    env.DATABASE_URL,
    "postgres://from-local-v2",
    "second load must still accept updated .env.local when boot had no explicit URL",
  );
  assert.equal(env.DIRECT_URL, "postgres://from-local-direct-v2");
}

function testRepeatedLoadKeepsBootExplicit() {
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgres://explicit-db",
  };
  const files = new Map<string, Record<string, string>>([
    [".env.local", { DATABASE_URL: "postgres://from-local-v1" }],
  ]);

  loadPrismaEnv({
    env,
    resetBootSnapshot: true,
    loadEnvFile: makeFileLoader(env, files),
  });
  assert.equal(env.DATABASE_URL, "postgres://explicit-db");

  files.set(".env.local", { DATABASE_URL: "postgres://from-local-v2" });
  loadPrismaEnv({
    env,
    loadEnvFile: makeFileLoader(env, files),
  });
  assert.equal(env.DATABASE_URL, "postgres://explicit-db");
}

function testConfigWiresLoader() {
  const configSrc = readFileSync(join(root, "prisma.config.ts"), "utf8");
  assert.match(configSrc, /loadPrismaEnv/);
  assert.match(configSrc, /resolvePrismaDatasourceUrl/);
  assert.doesNotMatch(configSrc, /override:\s*true/);
  const loaderSrc = readFileSync(join(root, "prisma/load-prisma-env.ts"), "utf8");
  assert.match(loaderSrc, /restoreExplicitDbUrls/);
  assert.match(loaderSrc, /bootSnapshots/);
  assert.match(loaderSrc, /override:\s*true/);
}

/**
 * Fresh Node process + real temp .env / .env.local files (dummy URLs only).
 */
function testFreshProcessWithFixtureFiles() {
  const dir = mkdtempSync(join(tmpdir(), "prisma-env-prec-"));
  try {
    const envPath = join(dir, ".env");
    const localPath = join(dir, ".env.local");
    const childScript = join(dir, "fresh-process-check.mts");
    writeFileSync(
      envPath,
      "DATABASE_URL=postgres://fixture-env\nDIRECT_URL=postgres://fixture-env-direct\n",
      { mode: 0o600 },
    );
    writeFileSync(
      localPath,
      "DATABASE_URL=postgres://fixture-local\nDIRECT_URL=postgres://fixture-local-direct\n",
      { mode: 0o600 },
    );
    writeFileSync(
      childScript,
      `import assert from "node:assert/strict";
import {
  loadPrismaEnv,
  resetPrismaEnvBootSnapshotForTests,
  resolvePrismaDatasourceUrl,
} from ${JSON.stringify(join(root, "prisma/load-prisma-env.ts"))};

const envFile = ${JSON.stringify(envPath)};
const localEnvFile = ${JSON.stringify(localPath)};

const env: NodeJS.ProcessEnv = {};
resetPrismaEnvBootSnapshotForTests(env);
loadPrismaEnv({
  env,
  resetBootSnapshot: true,
  envFile,
  localEnvFile,
});
assert.equal(env.DATABASE_URL, "postgres://fixture-local");
assert.equal(env.DIRECT_URL, "postgres://fixture-local-direct");
assert.equal(resolvePrismaDatasourceUrl(env), "postgres://fixture-local-direct");

const env2: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://fixture-explicit",
  DIRECT_URL: "postgres://fixture-explicit-direct",
};
resetPrismaEnvBootSnapshotForTests(env2);
loadPrismaEnv({
  env: env2,
  resetBootSnapshot: true,
  envFile,
  localEnvFile,
});
assert.equal(env2.DATABASE_URL, "postgres://fixture-explicit");
assert.equal(env2.DIRECT_URL, "postgres://fixture-explicit-direct");
assert.equal(resolvePrismaDatasourceUrl(env2), "postgres://fixture-explicit-direct");
console.log("fresh-process-fixture: ok");
`,
      { mode: 0o600 },
    );

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", childScript],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "",
          // Intentionally omit DATABASE_URL / DIRECT_URL from the child process.
        },
      },
    );

    // Never dump full stdout/stderr — only assert markers (avoids credential leaks).
    if (result.status !== 0) {
      const err = (result.stderr ?? "").slice(0, 400);
      assert.fail(`fresh-process fixture child failed (status ${result.status}): ${err}`);
    }
    assert.match(result.stdout ?? "", /fresh-process-fixture: ok/);
    assert.doesNotMatch(result.stdout ?? "", /password|npg_|:\/\/[^:]+:[^@]+@/i);
    assert.doesNotMatch(result.stderr ?? "", /password|npg_|:\/\/[^:]+:[^@]+@/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  testSnapshotDetectsPresence();
  testRestoreWinsOverLaterMutation();
  testEmptyExplicitValuePreserved();
  testUnsetFallsThroughToFileValues();
  testExplicitNotOverwrittenByLocalFile();
  testDirectUrlPrecedenceOverDatabaseUrl();
  testPartialExplicitOnlyRestoresThatKey();
  testPartialExplicitDirectOnly();
  testRepeatedLoadDoesNotTreatFileValuesAsExplicit();
  testRepeatedLoadKeepsBootExplicit();
  testConfigWiresLoader();
  testFreshProcessWithFixtureFiles();
  console.log("prisma-env-precedence-selftest: ok");
}

main();
