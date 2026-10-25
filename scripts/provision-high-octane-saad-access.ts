/**
 * HIGH OCTANE staging staff-access inspector.
 * Dry run only. Reads the verified staging branch and prints the plan.
 * It does not insert, update, hash a password, send mail, or call paid provisioning.
 *
 * Run: pnpm exec tsx scripts/provision-high-octane-saad-access.ts --dry-run
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { HIGH_OCTANE_STAGING_DIRECT_HOST } from "../src/lib/tenancy/templates/high-octane-staging-launch";
import {
  assessHighOctaneStagingSaadAccess,
  emptySaadAccessSnapshot,
  loadSaadAccessSnapshot,
  type SaadAccessAssessment,
} from "../src/lib/tenancy/templates/high-octane-staging-saad-access";

function redact(value: string): string {
  return value.replace(/postgres(?:ql)?:\/\/[^\s'"\\]+/gi, "[redacted-url]");
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    (trimmed[0] === '"' || trimmed[0] === "'") &&
    trimmed[0] === trimmed.at(-1)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvFile(path: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const raw of readFileSync(path, "utf8").split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (out[key] === undefined) out[key] = unquote(line.slice(index + 1));
  }
  return out;
}

function printReport(assessment: SaadAccessAssessment, branchId: string | null): void {
  const plan = assessment.plan;
  console.log("mode dry-run");
  console.log("writes_executed NO");
  console.log(`outcome ${assessment.outcome}`);
  console.log(`branch_id ${branchId ?? "unverified"}`);
  console.log("production_url_used NO");
  console.log("password_printed NO");
  console.log("activation_email NO");
  console.log("sms NO");
  console.log(`workspace_slug ${plan.workspaceSlug}`);
  console.log(`user ${plan.user.name} ${plan.user.email} ${plan.user.role}`);
  console.log(`user_password ${plan.user.password}`);
  console.log(`user_phone ${plan.user.phoneE164}`);
  console.log(
    `membership ${plan.membership.role} ${plan.membership.status}`,
  );
  console.log(
    `profile ${plan.profile.firstName} ${plan.profile.lastName} markets ${plan.profile.markets.join(", ")}`,
  );
  console.log(`primary_agent ${plan.primaryAgent}`);
  console.log(`placeholder ${plan.placeholderEmail} password_remains_unset`);
  console.log("billing_owner unchanged");
  console.log(`subscription ${plan.subscription}`);
  console.log(`branding ${plan.branding}`);
  console.log(`domain ${plan.domain}`);
  console.log(`theme ${plan.theme}`);
  console.log(`models ${plan.models.join(", ")}`);
  console.log(`activation_risk ${plan.activationRisk}`);
  if (assessment.blockers.length === 0) console.log("blockers none");
  for (const blocker of assessment.blockers) console.log(`blocker ${blocker}`);
}

async function inspectStaging(directUrl: string): Promise<{
  branchId: string | null;
  transactionReadOnly: boolean;
  snapshot: Awaited<ReturnType<typeof loadSaadAccessSnapshot>>;
}> {
  const host = new URL(directUrl).hostname.toLowerCase();
  if (host !== HIGH_OCTANE_STAGING_DIRECT_HOST) {
    throw new Error("refusing connection");
  }
  const client = new Client({ connectionString: directUrl, statement_timeout: 20000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const mode = await client.query("SHOW transaction_read_only");
    const branch = await client.query("SELECT current_setting('neon.branch_id', true) AS branch_id");
    const snapshot = await loadSaadAccessSnapshot(async (sql, params = []) => {
      const result = await client.query(sql, params);
      return result.rows as Record<string, unknown>[];
    });
    await client.query("COMMIT");
    const branchId = branch.rows[0]?.branch_id;
    return {
      branchId: typeof branchId === "string" && branchId ? branchId : null,
      transactionReadOnly: mode.rows[0]?.transaction_read_only === "on",
      snapshot,
    };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) {
    console.log("mode refused");
    console.log("writes_executed NO");
    console.log("blocker write_not_authorized");
    process.exitCode = 1;
    return;
  }
  const fileEnv = readEnvFile(".env.local");
  const directUrl = fileEnv.STAGING_DIRECT_URL?.trim() ?? "";
  const pooledUrl = fileEnv.STAGING_DATABASE_URL?.trim() ?? "";
  const applicationDatabaseUrl = fileEnv.DATABASE_URL?.trim() ?? "";
  const applicationDirectUrl = fileEnv.DIRECT_URL?.trim() ?? "";
  let inspected: Awaited<ReturnType<typeof inspectStaging>> | null = null;
  let host = "";
  try {
    host = directUrl ? new URL(directUrl).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  if (host === HIGH_OCTANE_STAGING_DIRECT_HOST) {
    try {
      inspected = await inspectStaging(directUrl);
    } catch (error) {
      const message = redact(error instanceof Error ? error.message : String(error));
      console.log("mode dry-run");
      console.log("writes_executed NO");
      console.log(`blocker inspection_failed:${message}`);
      process.exitCode = 1;
      return;
    }
  }
  const assessment = assessHighOctaneStagingSaadAccess({
    directUrl,
    pooledUrl,
    applicationDatabaseUrl,
    applicationDirectUrl,
    branchId: inspected?.branchId ?? null,
    transactionReadOnly: inspected?.transactionReadOnly ?? false,
    nodeEnv: process.env.NODE_ENV,
    snapshot: inspected?.snapshot ?? emptySaadAccessSnapshot(),
  });
  printReport(assessment, inspected?.branchId ?? null);
  if (!assessment.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.log(`blocker ${redact(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
