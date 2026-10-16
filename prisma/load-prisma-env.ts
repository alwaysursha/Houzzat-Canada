/**
 * Prisma CLI env loading with safe precedence for database URLs.
 *
 * Local files (.env, then .env.local) still fill missing values and .env.local
 * still overrides .env — but DATABASE_URL / DIRECT_URL that were already set in
 * the process environment (shell, CI, Vercel, migrate dry-run) must win.
 *
 * The "explicit" snapshot is taken once per env object (boot), so a later
 * reload cannot treat values previously loaded from files as externally supplied.
 */

import { config as loadDotenv } from "dotenv";

export type ExplicitDbUrlSnapshot = {
  hasDatabaseUrl: boolean;
  hasDirectUrl: boolean;
  databaseUrl: string | undefined;
  directUrl: string | undefined;
};

/** Capture whether DB URL keys were present before any dotenv mutation. */
export function snapshotExplicitDbUrls(
  env: NodeJS.ProcessEnv = process.env,
): ExplicitDbUrlSnapshot {
  return {
    hasDatabaseUrl: Object.prototype.hasOwnProperty.call(env, "DATABASE_URL"),
    hasDirectUrl: Object.prototype.hasOwnProperty.call(env, "DIRECT_URL"),
    databaseUrl: env.DATABASE_URL,
    directUrl: env.DIRECT_URL,
  };
}

/** Re-apply explicitly supplied DB URLs after dotenv may have overwritten them. */
export function restoreExplicitDbUrls(
  env: NodeJS.ProcessEnv,
  snapshot: ExplicitDbUrlSnapshot,
): void {
  if (snapshot.hasDatabaseUrl) {
    if (snapshot.databaseUrl === undefined) {
      delete env.DATABASE_URL;
    } else {
      env.DATABASE_URL = snapshot.databaseUrl;
    }
  }
  if (snapshot.hasDirectUrl) {
    if (snapshot.directUrl === undefined) {
      delete env.DIRECT_URL;
    } else {
      env.DIRECT_URL = snapshot.directUrl;
    }
  }
}

/**
 * Resolve the datasource URL Prisma should use (same precedence as prisma.config.ts).
 * Prefer DIRECT_URL when set (migrate/deploy), else DATABASE_URL.
 */
export function resolvePrismaDatasourceUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.DIRECT_URL ?? env.DATABASE_URL;
}

export type DotenvLoadOptions = {
  path?: string;
  override?: boolean;
  /** Target env bag (dotenv v16+). Defaults to process.env when omitted by caller. */
  processEnv?: NodeJS.ProcessEnv;
};

export type LoadPrismaEnvOptions = {
  env?: NodeJS.ProcessEnv;
  /** Injected for tests — defaults to dotenv.config */
  loadEnvFile?: (options?: DotenvLoadOptions) => unknown;
  envFile?: string;
  localEnvFile?: string;
  /**
   * When true, re-snapshot this env bag as "boot" (tests only).
   * Production/CLI should leave this unset so the first call wins.
   */
  resetBootSnapshot?: boolean;
};

/** Boot snapshots keyed by env object — first observation wins per process/env bag. */
const bootSnapshots = new WeakMap<object, ExplicitDbUrlSnapshot>();

/** Test helper: clear boot snapshot for an env bag (or process.env). */
export function resetPrismaEnvBootSnapshotForTests(
  env: NodeJS.ProcessEnv = process.env,
): void {
  bootSnapshots.delete(env as object);
}

function bootSnapshotFor(
  env: NodeJS.ProcessEnv,
  reset: boolean | undefined,
): ExplicitDbUrlSnapshot {
  if (reset) {
    bootSnapshots.delete(env as object);
  }
  const existing = bootSnapshots.get(env as object);
  if (existing) return existing;
  const created = snapshotExplicitDbUrls(env);
  bootSnapshots.set(env as object, created);
  return created;
}

/**
 * Load .env then .env.local (local overrides file defaults), then restore any
 * DATABASE_URL / DIRECT_URL that were present on the env bag at first load
 * (boot), not values that earlier loads copied from files.
 */
export function loadPrismaEnv(
  options: LoadPrismaEnvOptions = {},
): ExplicitDbUrlSnapshot {
  const env = options.env ?? process.env;
  const load = options.loadEnvFile ?? loadDotenv;
  const envFile = options.envFile ?? ".env";
  const localEnvFile = options.localEnvFile ?? ".env.local";

  const snapshot = bootSnapshotFor(env, options.resetBootSnapshot);

  // Always pass processEnv so loads mutate the intended bag (not a surprise
  // process.env when tests supply a custom env object).
  load({ path: envFile, processEnv: env });
  // .env.local overrides .env for local secrets — but not boot-explicit URLs
  // after restoreExplicitDbUrls runs.
  load({ path: localEnvFile, override: true, processEnv: env });

  restoreExplicitDbUrls(env, snapshot);
  return snapshot;
}
