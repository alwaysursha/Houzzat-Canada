/**
 * Stage 6.3 — read-only production verification via platform read services.
 * Run: node --import tsx scripts/stage-6.3-platform-read-verify.ts
 */

import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });

import {
  getPlatformSummary,
  getPlatformWorkspaceBySlug,
} from "@/lib/platform/read";

async function main() {
  const houzzat = await getPlatformWorkspaceBySlug("houzzat");
  const canary = await getPlatformWorkspaceBySlug("tenant-canary");
  const summary = await getPlatformSummary();

  console.log(
    JSON.stringify(
      {
        summary,
        houzzat: houzzat && {
          slug: houzzat.slug,
          status: houzzat.status,
          subscription: houzzat.currentSubscription,
          entitlementProfileCode: houzzat.entitlementProfileCode,
          seatQuota: houzzat.seatQuota,
          seatConsumption: houzzat.seatConsumption,
          entitlementsEnabledCount: houzzat.entitlementsEnabledCount,
          entitlements: houzzat.entitlements?.map((e) => ({
            featureCode: e.featureCode,
            enabled: e.enabled,
          })),
        },
        canary: canary && {
          slug: canary.slug,
          status: canary.status,
          currentSubscription: canary.currentSubscription,
          seatQuota: canary.seatQuota,
          entitlementsEnabledCount: canary.entitlementsEnabledCount,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
