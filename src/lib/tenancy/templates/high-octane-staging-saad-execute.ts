/**
 * Staging-only interactive execution for Saad's staff login.
 * The password stays in memory. This module does not read argv, env, or files
 * for the password, and it does not open a database connection itself.
 */
import { OWNER_ACTIVATION_MIN_PASSWORD_LENGTH } from "@/lib/platform/activation/constants";
import {
  HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
  applyHighOctaneStagingSaadAccess,
  assessHighOctaneStagingSaadAccess,
  buildHighOctaneStagingSaadAccessPlan,
  stagingDirectConnectionDecision,
  type SaadAccessSnapshot,
  type SaadAccessWriter,
} from "@/lib/tenancy/templates/high-octane-staging-saad-access";
import { HIGH_OCTANE_STAGING_BRANCH_ID } from "@/lib/tenancy/templates/high-octane-staging-launch";

export const HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL = "staging saad access refused";

export type HiddenInput = {
  isTTY: boolean;
  setRawMode(enabled: boolean): void;
  on(event: "data", listener: (chunk: Buffer) => void): void;
  off(event: "data", listener: (chunk: Buffer) => void): void;
};

export type PromptOutput = {
  write(text: string): void;
};

export type SaadExecuteEnv = {
  stagingDirectUrl: string;
  stagingPooledUrl: string;
  applicationDatabaseUrl: string;
  applicationDirectUrl: string;
};

export type SaadInspection = {
  branchId: string | null;
  transactionReadOnly: boolean;
  snapshot: SaadAccessSnapshot;
};

export type SaadExecuteDependencies = {
  argv: readonly string[];
  interactive: boolean;
  nodeEnv: string | undefined;
  loadEnv(): SaadExecuteEnv;
  promptVisible(label: string): Promise<string>;
  promptHidden(label: string): Promise<string>;
  inspect(directUrl: string): Promise<SaadInspection>;
  createWriter(directUrl: string): SaadAccessWriter;
  apply?: typeof applyHighOctaneStagingSaadAccess;
  stdout: PromptOutput;
};

export type SaadExecuteResult =
  | { ok: true; applied: boolean }
  | { ok: false; reason: string };

type SignalProcess = {
  once(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): void;
};

/**
 * Read one line with terminal echo disabled. Echo is restored on success,
 * cancellation, and thrown errors.
 */
export async function promptHiddenLine(
  input: HiddenInput,
  output: PromptOutput,
  label: string,
  signals: SignalProcess = process,
): Promise<string> {
  if (!input.isTTY) {
    throw new Error(HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL);
  }
  output.write(label);
  let value = "";
  let skippingEscape = false;
  let settle: ((value: string) => void) | null = null;
  let fail: ((error: Error) => void) | null = null;
  const onData = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const char of text) {
      if (skippingEscape) {
        if ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "~") {
          skippingEscape = false;
        }
        continue;
      }
      if (char === "\u001b") {
        skippingEscape = true;
        continue;
      }
      if (char === "\u0003") {
        fail?.(new Error(HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL));
        fail = null;
        settle = null;
        return;
      }
      if (char === "\r" || char === "\n") {
        output.write("\n");
        settle?.(value);
        settle = null;
        fail = null;
        return;
      }
      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        continue;
      }
      if (char < " ") continue;
      value += char;
    }
  };
  const onSignal = () => {
    fail?.(new Error(HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL));
    fail = null;
    settle = null;
  };
  try {
    input.setRawMode(true);
    return await new Promise<string>((resolve, reject) => {
      settle = resolve;
      fail = reject;
      signals.once("SIGINT", onSignal);
      signals.once("SIGTERM", onSignal);
      input.on("data", onData);
    });
  } finally {
    input.off("data", onData);
    signals.off("SIGINT", onSignal);
    signals.off("SIGTERM", onSignal);
    input.setRawMode(false);
  }
}

function summaryLines(branchId: string): string[] {
  const plan = buildHighOctaneStagingSaadAccessPlan();
  return [
    "mode apply",
    `branch_id ${branchId}`,
    `workspace_slug ${plan.workspaceSlug}`,
    `user ${plan.user.name} ${plan.user.email} ${plan.user.role}`,
    `membership ${plan.membership.role} ${plan.membership.status}`,
    `profile ${plan.profile.firstName} ${plan.profile.lastName}`,
    `markets ${plan.profile.markets.join(", ")}`,
    "primary_agent update",
    "placeholder unchanged",
    "billing_owner unchanged",
    "subscription not_created",
    "branding unchanged",
    "domain unchanged",
    "theme unchanged",
  ];
}

function refused(reason: string): SaadExecuteResult {
  return { ok: false, reason };
}

/**
 * Confirm, then collect a password, then open the writer. Guards that fail
 * return before createWriter. The password is not included in the result.
 */
export async function executeHighOctaneStagingSaadAccess(
  deps: SaadExecuteDependencies,
): Promise<SaadExecuteResult> {
  if (deps.argv.length > 0) return refused("argv_rejected");
  if (!deps.interactive) return refused("not_interactive");

  const env = deps.loadEnv();
  const directUrl = env.stagingDirectUrl.trim();
  const hostDecision = stagingDirectConnectionDecision(directUrl);
  if (hostDecision !== "ok") return refused(`direct_${hostDecision}`);

  let inspected: SaadInspection;
  try {
    inspected = await deps.inspect(directUrl);
  } catch {
    return refused("inspection_failed");
  }
  if (inspected.branchId !== HIGH_OCTANE_STAGING_BRANCH_ID) return refused("wrong_branch");

  const assessment = assessHighOctaneStagingSaadAccess({
    directUrl,
    pooledUrl: env.stagingPooledUrl,
    applicationDatabaseUrl: env.applicationDatabaseUrl,
    applicationDirectUrl: env.applicationDirectUrl,
    branchId: inspected.branchId,
    transactionReadOnly: inspected.transactionReadOnly,
    nodeEnv: deps.nodeEnv,
    snapshot: inspected.snapshot,
  });
  if (assessment.outcome === "already_present") return { ok: true, applied: false };
  if (assessment.outcome !== "would_create") return refused("not_ready");

  for (const line of summaryLines(inspected.branchId)) deps.stdout.write(`${line}\n`);
  const confirmation = await deps.promptVisible(
    `Type ${HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION} to continue: `,
  );
  if (confirmation.trim() !== HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION) {
    return refused("confirmation_mismatch");
  }

  const password = await deps.promptHidden("Password: ");
  const repeated = await deps.promptHidden("Repeat password: ");
  if (password !== repeated) return refused("password_mismatch");
  if (password.length < OWNER_ACTIVATION_MIN_PASSWORD_LENGTH) return refused("password_requirements");

  const apply = deps.apply ?? applyHighOctaneStagingSaadAccess;
  try {
    const writer = deps.createWriter(directUrl);
    const applied = await apply({
      directUrl,
      pooledUrl: env.stagingPooledUrl,
      applicationDatabaseUrl: env.applicationDatabaseUrl,
      applicationDirectUrl: env.applicationDirectUrl,
      branchId: inspected.branchId,
      transactionReadOnly: inspected.transactionReadOnly,
      nodeEnv: deps.nodeEnv,
      snapshot: inspected.snapshot,
      confirmation: HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
      password,
      writer,
    });
    return { ok: true, applied: applied.applied };
  } catch {
    return refused("write_failed");
  }
}

export async function runHighOctaneStagingSaadExecute(
  deps: SaadExecuteDependencies,
): Promise<number> {
  try {
    const result = await executeHighOctaneStagingSaadAccess(deps);
    if (!result.ok) {
      deps.stdout.write(`${HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL}\n`);
      return 1;
    }
    deps.stdout.write(result.applied ? "applied YES\n" : "applied NO\n");
    return 0;
  } catch {
    deps.stdout.write(`${HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL}\n`);
    return 1;
  }
}
