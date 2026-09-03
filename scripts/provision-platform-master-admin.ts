/**
 * Stage 6.2B — prepare first PlatformOperator MASTER_ADMIN (NO production write by default).
 *
 * Usage:
 *   pnpm platform:provision-master-admin
 *   pnpm platform:provision-master-admin -- --confirm-production-write
 *
 * Default email: teamalisyed@gmail.com (owner-approved existing User).
 */

import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });

import {
  PLATFORM_MASTER_ADMIN_EMAIL,
  normalizeActivationEmail,
  provisionPlatformMasterAdmin,
} from "@/lib/platform";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const email = normalizeActivationEmail(
    argValue("--email") ?? PLATFORM_MASTER_ADMIN_EMAIL,
  );
  const dryRun = hasFlag("--dry-run") || !hasFlag("--confirm-production-write");

  console.log("=== Stage 6.2B — PlatformOperator MASTER_ADMIN (prepared) ===");
  console.log("target email (normalized):", email);

  if (dryRun) {
    console.log(
      "Refusing writes (pass --confirm-production-write only after owner approval).",
    );
    console.log("Would provision MASTER_ADMIN PlatformOperator only (no CRM membership).");
    return;
  }

  const result = await provisionPlatformMasterAdmin({ email });
  console.log("RESULT", result);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
