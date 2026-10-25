/**
 * Interactive HIGH OCTANE staging login for Saad.
 * Requires a terminal. Refuses arguments, pipes, and password environment variables.
 * Does not print passwords, hashes, or connection strings.
 *
 * Run: pnpm exec tsx scripts/apply-high-octane-saad-access.ts
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { HIGH_OCTANE_STAGING_DIRECT_HOST } from "../src/lib/tenancy/templates/high-octane-staging-launch";
import {
  createHighOctaneStagingSaadAccessWriter,
  loadSaadAccessSnapshot,
} from "../src/lib/tenancy/templates/high-octane-staging-saad-access";
import {
  HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL,
  promptHiddenLine,
  runHighOctaneStagingSaadExecute,
  type HiddenInput,
  type SaadExecuteEnv,
  type SaadInspection,
} from "../src/lib/tenancy/templates/high-octane-staging-saad-execute";

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

function loadEnv(): SaadExecuteEnv {
  const fileEnv = readEnvFile(".env.local");
  return {
    stagingDirectUrl: fileEnv.STAGING_DIRECT_URL?.trim() ?? "",
    stagingPooledUrl: fileEnv.STAGING_DATABASE_URL?.trim() ?? "",
    applicationDatabaseUrl: fileEnv.DATABASE_URL?.trim() ?? "",
    applicationDirectUrl: fileEnv.DIRECT_URL?.trim() ?? "",
  };
}

async function inspect(directUrl: string): Promise<SaadInspection> {
  let host = "";
  try {
    host = new URL(directUrl).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (host !== HIGH_OCTANE_STAGING_DIRECT_HOST) {
    throw new Error(HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL);
  }
  const client = new Client({ connectionString: directUrl, statement_timeout: 20000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const mode = await client.query("SHOW transaction_read_only");
    const branch = await client.query(
      "SELECT current_setting('neon.branch_id', true) AS branch_id",
    );
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
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* The fixed refusal replaces the driver error. */
    }
    throw new Error(HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function stdinAsHidden(): HiddenInput {
  const stdin = process.stdin;
  return {
    isTTY: Boolean(stdin.isTTY),
    setRawMode(enabled: boolean) {
      if (typeof stdin.setRawMode !== "function") {
        throw new Error(HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL);
      }
      stdin.setRawMode(enabled);
    },
    on(event, listener) {
      stdin.on(event, listener);
    },
    off(event, listener) {
      stdin.off(event, listener);
    },
  };
}

function promptVisible(label: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(label);
    process.stdin.resume();
    process.stdin.once("data", (chunk: Buffer | string) => {
      resolve(String(chunk).replace(/\r?\n$/, ""));
    });
  });
}

async function main(): Promise<void> {
  const code = await runHighOctaneStagingSaadExecute({
    argv: process.argv.slice(2),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    nodeEnv: process.env.NODE_ENV,
    loadEnv,
    promptVisible,
    promptHidden: (label) => promptHiddenLine(stdinAsHidden(), process.stdout, label),
    inspect,
    createWriter: (directUrl) => createHighOctaneStagingSaadAccessWriter(directUrl),
    stdout: process.stdout,
  });
  process.exitCode = code;
}

main().catch(() => {
  process.stdout.write(`${HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL}\n`);
  process.exitCode = 1;
});
