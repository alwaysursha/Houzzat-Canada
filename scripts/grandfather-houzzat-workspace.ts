/**
 * Stage 6.2B — prepare Houzzat grandfathering (NO production write by default).
 *
 * Usage:
 *   pnpm workspace:grandfather-houzzat
 *   pnpm workspace:grandfather-houzzat -- --confirm-production-write
 *
 * Default billing email: alisyedrealtor@gmail.com (owner-approved).
 */

import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });

import {
  EntitlementProfileIncompleteError,
  HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL,
  grandfatherHouzzatWorkspace,
  isHouzzatLegacyProfileReady,
  normalizeActivationEmail,
  resolveHouzzatLegacyEntitlementProfile,
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
  const emailOverride = argValue("--email");
  const billingEmail = normalizeActivationEmail(
    emailOverride ?? HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL,
  );
  const dryRun = hasFlag("--dry-run") || !hasFlag("--confirm-production-write");

  console.log("=== Stage 6.2B — Houzzat grandfathering (prepared) ===");
  console.log("HOUZZAT_LEGACY ready:", isHouzzatLegacyProfileReady());
  const profile = resolveHouzzatLegacyEntitlementProfile();
  console.log("Profile:", {
    includedSeats: profile.includedSeats,
    additionalSeats: profile.additionalSeats,
    additionalSeatsAllowed: profile.additionalSeatsAllowed,
    seatLimit: profile.seatLimit,
    features: profile.features.filter((f) => f.enabled).map((f) => f.featureCode),
  });
  console.log("billingCustomerEmail (normalized):", billingEmail);

  if (dryRun) {
    console.log(
      "Refusing writes (pass --confirm-production-write only after owner approval).",
    );
    console.log("Would target workspace slug=houzzat");
    return;
  }

  try {
    const result = await grandfatherHouzzatWorkspace({
      billingCustomerEmail: billingEmail,
    });
    console.log("RESULT", result);
  } catch (err) {
    if (err instanceof EntitlementProfileIncompleteError) {
      console.error("BLOCKED:", err.message);
      process.exitCode = 2;
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
