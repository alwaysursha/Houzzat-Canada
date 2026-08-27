/**
 * Stage 3K.5.8E — Tenant Canary push delivery canary CLI (dry-run default).
 *
 * Run: pnpm tenant-canary-push-delivery:dry-run
 * Send (Worker only — not via this CLI): see report curl example.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runTenantCanaryPushDeliveryCanary,
  TENANT_CANARY_PUSH_DELIVERY_CONFIRM,
  type TenantCanaryPushDeliveryResult,
} from "../src/lib/workspace-canary/tenant-canary-push-delivery-canary";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function formatReport(result: TenantCanaryPushDeliveryResult): string {
  const lines = [
    "TENANT CANARY PUSH DELIVERY CANARY",
    "",
    `status: ${result.status}`,
    `ok: ${result.ok}`,
    `workspace: ${result.workspace}`,
    `leadIdPrefix: ${result.leadIdPrefix ?? "(none)"}`,
    `leadSource: ${result.leadSource ?? "(none)"}`,
    `href: ${result.href ?? "(none)"}`,
    `authorizedRecipients: ${result.authorizedRecipients}`,
    `houzzatAuthorized: ${result.houzzatAuthorized}`,
    `physicalTargets: ${result.physicalTargets}`,
    `priorMarkerStatus: ${result.priorMarkerStatus ?? "(none)"}`,
    `firebaseConfigured: ${result.firebaseConfigured}`,
    `firebaseProjectExpected: ${result.firebaseProjectExpected}`,
    `email: ${result.email}`,
  ];
  if (result.delivery) {
    lines.push(`delivery: ${JSON.stringify(result.delivery)}`);
  }
  if (result.error) {
    lines.push(`error: ${result.error}`);
  }
  lines.push("");
  lines.push(
    result.mode === "dry-run"
      ? "DRY RUN — NO PUSH SENT"
      : "SEND MODE — FCM may execute",
  );
  return lines.join("\n");
}

async function main() {
  const modeArg = process.argv.includes("--send") ? "send" : "dry-run";
  if (modeArg === "send") {
    console.error(
      "REFUSE: use Worker POST /api/admin/workspace-canary/push-delivery on tenant-canary.houzzatpro.com for send mode",
    );
    process.exit(1);
  }

  const wrangler = read("wrangler.tenant-canary.jsonc");
  if (!wrangler.includes('"name": "houzzat-tenant-canary"')) {
    console.error("REFUSE: wrangler.tenant-canary.jsonc worker name mismatch");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("REFUSE: DATABASE_URL required for dry-run");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");
  try {
    const result = await runTenantCanaryPushDeliveryCanary(prisma, {
      mode: "dry-run",
      confirm: TENANT_CANARY_PUSH_DELIVERY_CONFIRM,
    });
    console.log(formatReport(result));
    if (!result.ok && result.status !== "firebase_missing") {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
