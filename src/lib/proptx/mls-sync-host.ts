import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Path of the Sync Mac marker. Override only relocates the file.
 * The file must still exist and be non-empty. Copying the repo or
 * `.env.local` does not authorize synchronization.
 */
export const MLS_SYNC_HOST_MARKER_ENV = "MLS_SYNC_HOST_MARKER";

export function mlsSyncHostMarkerPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const override = env[MLS_SYNC_HOST_MARKER_ENV]?.trim();
  if (override) return override;
  return join(home, ".houzzat", "mls-sync-host");
}

export class MlsSyncHostError extends Error {
  readonly code = "MLS_SYNC_HOST_REQUIRED";

  constructor(path: string) {
    super(
      `MLS synchronization refused. This machine is not the Sync Mac (marker missing or empty: ${path}).`,
    );
    this.name = "MlsSyncHostError";
  }
}

/** Fail closed before any PropTx request or Neon/Typesense MLS write. */
export function assertMlsSyncExecutionHost(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = mlsSyncHostMarkerPath(env);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new MlsSyncHostError(path);
  }
  if (!raw.trim()) throw new MlsSyncHostError(path);
}
