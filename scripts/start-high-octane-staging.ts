/**
 * HIGH OCTANE staging launcher.
 * Default is a dry run: read-only branch check and a sanitized plan.
 * Next.js starts only with an explicit --start argument, and only after the plan is ready.
 *
 * Run: pnpm exec tsx scripts/start-high-octane-staging.ts
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import {
  HIGH_OCTANE_STAGING_AUTH_SECRET_ENV,
  HIGH_OCTANE_STAGING_BRANCH_ID,
  HIGH_OCTANE_STAGING_DIRECT_HOST,
  evaluateHighOctaneStagingLaunch,
  finishLaunch,
  type LaunchDecision,
} from "../src/lib/tenancy/templates/high-octane-staging-launch";

/** Not a Next.js env file. The Houzzat dev server does not load this name. */
const STAGING_SECRET_FILE = ".env.high-octane-staging";

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

function applyDedicatedStagingAuthSecret(fileEnv: Record<string, string | undefined>): string[] {
  if (!existsSync(STAGING_SECRET_FILE)) return [];
  const dedicated = readEnvFile(STAGING_SECRET_FILE);
  const unexpected = Object.keys(dedicated).filter((key) => key !== HIGH_OCTANE_STAGING_AUTH_SECRET_ENV);
  const secret = dedicated[HIGH_OCTANE_STAGING_AUTH_SECRET_ENV]?.trim();
  if (secret) fileEnv[HIGH_OCTANE_STAGING_AUTH_SECRET_ENV] = secret;
  return unexpected;
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

async function readStagingBranchId(connectionString: string): Promise<string> {
  const host = new URL(connectionString).hostname.toLowerCase();
  if (host !== HIGH_OCTANE_STAGING_DIRECT_HOST) {
    throw new Error("refusing connection");
  }
  const client = new Client({ connectionString, statement_timeout: 20000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const mode = await client.query("SHOW transaction_read_only");
    const branch = await client.query("SELECT current_setting('neon.branch_id', true) AS branch_id");
    await client.query("COMMIT");
    if (mode.rows[0]?.transaction_read_only !== "on") {
      throw new Error("branch probe was not read-only");
    }
    const branchId = branch.rows[0]?.branch_id;
    if (typeof branchId !== "string" || !branchId) {
      throw new Error("branch id unavailable");
    }
    return branchId;
  } finally {
    await client.end();
  }
}

function printReport(decision: LaunchDecision): void {
  const report = decision.report;
  console.log(`mode ${report.mode}`);
  console.log(`ready ${report.ready ? "YES" : "NO"}`);
  console.log(`direct_host_verified ${report.directHostVerified ? "YES" : "NO"}`);
  console.log(`pooled_host_verified ${report.pooledHostVerified ? "YES" : "NO"}`);
  console.log(`branch_verified ${report.branchVerified ? "YES" : "NO"}`);
  console.log(`branch_id ${report.branchId ?? "unverified"}`);
  console.log(`dist_dir ${report.distDir}`);
  console.log(`origin ${report.origin}`);
  console.log(`hostname ${report.hostname}`);
  console.log(`port ${report.port}`);
  console.log(`auth_secret_present ${report.authSecretPresent ? "YES" : "NO"}`);
  console.log(`auth_secret_dedicated ${report.authSecretDedicated ? "YES" : "NO"}`);
  console.log(`next_started ${report.nextStarted ? "YES" : "NO"}`);
  console.log(`prisma_generate ${report.prismaGenerate ? "YES" : "NO"}`);
  console.log(`output_isolated ${report.mutableOutputIsolated ? "YES" : "NO"}`);
  console.log(`future_command ${decision.command.command} ${decision.command.args.join(" ")}`);
  for (const integration of report.integrations) {
    console.log(`integration ${integration.name} ${integration.state}`);
  }
  if (report.blockers.length === 0) console.log("blockers none");
  for (const blocker of report.blockers) console.log(`blocker ${blocker}`);
}

async function main(): Promise<void> {
  const startRequested = process.argv.includes("--start");
  const fileEnv = readEnvFile(".env.local");
  const unexpectedSecretKeys = applyDedicatedStagingAuthSecret(fileEnv);
  const direct = fileEnv.STAGING_DIRECT_URL?.trim() ?? "";
  let host = "";
  try {
    host = direct ? new URL(direct).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }

  let branchId: string | null = null;
  let probeBlocker: string | null = null;
  if (host === HIGH_OCTANE_STAGING_DIRECT_HOST) {
    try {
      branchId = await readStagingBranchId(direct);
    } catch (error) {
      probeBlocker = "staging_branch_probe_failed";
      const message = error instanceof Error ? error.message : String(error);
      console.log(`probe_error ${redact(message).slice(0, 180)}`);
    }
  }

  const decision = evaluateHighOctaneStagingLaunch({
    fileEnv,
    branchId,
    mode: startRequested ? "start" : "dry-run",
  });
  if (probeBlocker) decision.blockers.push(probeBlocker);
  for (const key of unexpectedSecretKeys) {
    decision.blockers.push(`staging_secret_file_unexpected:${key}`);
  }
  if (branchId && branchId !== HIGH_OCTANE_STAGING_BRANCH_ID) {
    decision.childEnv.DATABASE_URL = "";
    decision.childEnv.DIRECT_URL = "";
    decision.childEnv.STAGING_DATABASE_URL = "";
    decision.childEnv.STAGING_DIRECT_URL = "";
  }
  decision.report.blockers = decision.blockers;
  decision.report.ready = decision.blockers.length === 0;
  decision.ok = decision.report.ready;
  printReport(decision);

  if (!startRequested) {
    finishLaunch(decision, "dry-run", () => {
      throw new Error("dry-run tried to start Next.js");
    });
    process.exit(decision.ok ? 0 : 1);
  }

  finishLaunch(decision, "start", (command, args, env) => {
    const child = spawn(command, [...args], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        USER: process.env.USER ?? "",
        ...env,
      },
    });
    child.on("exit", (code) => process.exit(code ?? 1));
  });
  if (!decision.ok) process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`FAILED ${redact(message).slice(0, 240)}`);
  process.exit(1);
});
