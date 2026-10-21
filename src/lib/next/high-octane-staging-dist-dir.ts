/**
 * Next.js build directory for a second local staging process.
 * The directory is fixed. The environment variable is not a path.
 */

export const DEFAULT_NEXT_DIST_DIR = ".next" as const;
export const HIGH_OCTANE_STAGING_NEXT_DIST_DIR = ".next-high-octane-staging" as const;

export function resolveNextDistDir(
  env: NodeJS.ProcessEnv = process.env,
): typeof DEFAULT_NEXT_DIST_DIR | typeof HIGH_OCTANE_STAGING_NEXT_DIST_DIR {
  if (env.HIGH_OCTANE_STAGING_DIST === "1") {
    return HIGH_OCTANE_STAGING_NEXT_DIST_DIR;
  }
  return DEFAULT_NEXT_DIST_DIR;
}
