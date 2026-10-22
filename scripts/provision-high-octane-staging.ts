/**
 * HIGH OCTANE staging provisioner.
 * Dry run only. Reads the verified staging branch and prints the plan.
 * It does not insert, update, send mail, or call paid provisioning.
 *
 * Run: pnpm exec tsx scripts/provision-high-octane-staging.ts
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { HIGH_OCTANE_STAGING_DIRECT_HOST } from "../src/lib/tenancy/templates/high-octane-staging-launch";
import {
  assessHighOctaneStagingProvision,
  emptyProvisionSnapshot,
  loadProvisionSnapshot,
  type ProvisionAssessment,
} from "../src/lib/tenancy/templates/high-octane-staging-provision";

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

function printReport(assessment: ProvisionAssessment, branchId: string | null): void {
  const plan = assessment.plan;
  console.log("mode dry-run");
  console.log("writes_executed NO");
  console.log(`outcome ${assessment.outcome}`);
  console.log(`atomic ${plan.atomic ? "YES" : "NO"}`);
  console.log(`branch_id ${branchId ?? "unverified"}`);
  console.log(`production_url_used NO`);
  console.log("paid_provisioner NO");
  console.log("listing_connection NO");
  console.log("activation_email NO");
  console.log(`workspace_slug ${plan.workspaceSlug}`);
  console.log(`workspace_name ${plan.workspaceName}`);
  console.log(
    `domain ${plan.domain.hostname} ${plan.domain.kind} ${plan.domain.role} ${plan.domain.status}`,
  );
  console.log(`template_id ${plan.templateId}`);
  console.log(`theme_id ${plan.themeId}`);
  console.log(`catalog_selectable ${plan.catalogSelectable}`);
  console.log(`catalog_presentation_ready ${plan.catalogPresentationReady}`);
  console.log(`public_theme_without_staging_gate ${plan.publicTemplateWithoutStagingGate}`);
  console.log(`staging_gate_template ${plan.stagingGateTemplateId ?? "none"}`);
  console.log(`production_node_template ${plan.productionNodeTemplateId ?? "none"}`);
  console.log(`houzzat_slug_template ${plan.ordinaryTenantTemplateId ?? "none"}`);
  console.log(`owner_email ${plan.owner.email}`);
  console.log("owner_password unset");
  console.log(`owner_role ${plan.owner.role}`);
  console.log(`owner_membership ${plan.owner.membershipRole} ${plan.owner.membershipStatus}`);
  console.log(`public_agent ${plan.identity.agentRegisteredName}`);
  console.log(`public_brokerage ${plan.identity.brokerageRegisteredName}`);
  console.log(`public_phone ${plan.identity.agentCellPhone}`);
  console.log(`public_email ${plan.branding.contactEmail}`);
  console.log(`models ${plan.models.join(", ")}`);
  console.log("billing_owner none");
  console.log("workspace_data_connection none");
  console.log(
    `authorized_write_ready ${assessment.outcome === "would_create" ? "YES" : "NO"}`,
  );
  if (assessment.blockers.length === 0) console.log("blockers none");
  for (const blocker of assessment.blockers) console.log(`blocker ${blocker}`);
}

async function inspectStaging(directUrl: string): Promise<{
  branchId: string | null;
  transactionReadOnly: boolean;
  snapshot: Awaited<ReturnType<typeof loadProvisionSnapshot>>;
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
    const snapshot = await loadProvisionSnapshot(async (sql, params = []) => {
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
  const assessment = assessHighOctaneStagingProvision({
    directUrl,
    pooledUrl,
    applicationDatabaseUrl,
    applicationDirectUrl,
    branchId: inspected?.branchId ?? null,
    transactionReadOnly: inspected?.transactionReadOnly ?? false,
    nodeEnv: process.env.NODE_ENV,
    snapshot: inspected?.snapshot ?? emptyProvisionSnapshot(),
  });
  printReport(assessment, inspected?.branchId ?? null);
  if (!assessment.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.log(`blocker ${redact(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
