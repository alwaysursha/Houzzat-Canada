/**
 * Interactive HIGH OCTANE staging execution guards. No database connection.
 * Run: pnpm exec tsx scripts/high-octane-staging-saad-execute-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HIGH_OCTANE_STAGING_BRANCH_ID,
  HIGH_OCTANE_STAGING_DIRECT_HOST,
  HIGH_OCTANE_STAGING_POOLED_HOST,
} from "../src/lib/tenancy/templates/high-octane-staging-launch";
import {
  HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
  buildHighOctaneStagingSaadAccessPlan,
  type SaadAccessSnapshot,
  type SaadAccessWriteClient,
  type SaadAccessWriter,
} from "../src/lib/tenancy/templates/high-octane-staging-saad-access";
import {
  HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL,
  executeHighOctaneStagingSaadAccess,
  promptHiddenLine,
  runHighOctaneStagingSaadExecute,
  type HiddenInput,
  type SaadExecuteDependencies,
  type SaadExecuteEnv,
  type SaadInspection,
} from "../src/lib/tenancy/templates/high-octane-staging-saad-execute";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stagingDirect = `postgresql://staging:secret@${HIGH_OCTANE_STAGING_DIRECT_HOST}/neondb`;
const stagingPooled = `postgresql://staging:secret@${HIGH_OCTANE_STAGING_POOLED_HOST}/neondb`;
const productionDirect =
  "postgresql://prod:secret@ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech/neondb";
const productionPooled =
  "postgresql://prod:secret@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const password = "correct-horse-2";

function currentSnapshot(): SaadAccessSnapshot {
  const plan = buildHighOctaneStagingSaadAccessPlan();
  return {
    workspace: {
      id: "ws-high-octane",
      slug: plan.workspaceSlug,
      status: "ACTIVE",
      hasBillingOwner: false,
      hasCurrentSubscription: false,
      themeId: "royal-collection-one:signature",
      contactEmail: plan.user.email,
      domainHostname: "localhost",
      primaryAgentEmail: plan.placeholderEmail,
      memberCount: 1,
    },
    placeholder: {
      hasPassword: false,
      role: "AGENT",
      membershipRole: "OWNER",
      membershipStatus: "ACTIVE",
    },
    saadCount: 0,
    saad: null,
  };
}

function approvedEnv(overrides: Partial<SaadExecuteEnv> = {}): SaadExecuteEnv {
  return {
    stagingDirectUrl: stagingDirect,
    stagingPooledUrl: stagingPooled,
    applicationDatabaseUrl: productionPooled,
    applicationDirectUrl: productionDirect,
    ...overrides,
  };
}

function memoryWriter(snapshot: SaadAccessSnapshot): {
  writer: SaadAccessWriter;
  created: { password?: string };
} {
  const created: { password?: string } = {};
  const writer: SaadAccessWriter = {
    async transaction(fn) {
      const tx: SaadAccessWriteClient = {
        async readBranchId() {
          return HIGH_OCTANE_STAGING_BRANCH_ID;
        },
        async query() {
          return [{ report: snapshot }];
        },
        async createUser(data) {
          created.password = typeof data.password === "string" ? data.password : undefined;
          return { id: "saad-user" };
        },
        async createProfile() {
          return undefined;
        },
        async createMember() {
          return undefined;
        },
        async setPrimaryAgent() {
          return undefined;
        },
      };
      return fn(tx);
    },
  };
  return { writer, created };
}

function harness(options: {
  argv?: readonly string[];
  interactive?: boolean;
  env?: SaadExecuteEnv;
  branchId?: string | null;
  snapshot?: SaadAccessSnapshot;
  confirmation?: string;
  hidden?: string[];
  inspectError?: boolean;
  writerError?: string;
}): {
  deps: SaadExecuteDependencies;
  output: string[];
  inspected: string[];
  writerUrls: string[];
  envReads: number;
  visiblePrompts: number;
  hiddenPrompts: number;
  created: { password?: string };
} {
  const output: string[] = [];
  const inspected: string[] = [];
  const writerUrls: string[] = [];
  let envReads = 0;
  let visiblePrompts = 0;
  let hiddenPrompts = 0;
  const hidden = [...(options.hidden ?? [])];
  const created: { password?: string } = {};
  const deps: SaadExecuteDependencies = {
    argv: options.argv ?? [],
    interactive: options.interactive ?? true,
    nodeEnv: "development",
    loadEnv() {
      envReads += 1;
      return options.env ?? approvedEnv();
    },
    async promptVisible() {
      visiblePrompts += 1;
      return options.confirmation ?? HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION;
    },
    async promptHidden() {
      hiddenPrompts += 1;
      const next = hidden.shift();
      if (next === undefined) throw new Error("hidden prompt was not expected");
      return next;
    },
    async inspect(directUrl) {
      inspected.push(directUrl);
      if (options.inspectError) throw new Error(`postgres://secret ${password}`);
      return {
        branchId: options.branchId === undefined ? HIGH_OCTANE_STAGING_BRANCH_ID : options.branchId,
        transactionReadOnly: true,
        snapshot: options.snapshot ?? currentSnapshot(),
      } satisfies SaadInspection;
    },
    createWriter(directUrl) {
      writerUrls.push(directUrl);
      if (options.writerError) throw new Error(options.writerError);
      const memory = memoryWriter(options.snapshot ?? currentSnapshot());
      return {
        async transaction(fn) {
          const result = await memory.writer.transaction(fn);
          created.password = memory.created.password;
          return result;
        },
      };
    },
    stdout: {
      write(text) {
        output.push(text);
      },
    },
  };
  return {
    deps,
    output,
    inspected,
    writerUrls,
    get envReads() {
      return envReads;
    },
    get visiblePrompts() {
      return visiblePrompts;
    },
    get hiddenPrompts() {
      return hiddenPrompts;
    },
    created,
  };
}

function fakeSignals() {
  const listeners: Record<"SIGINT" | "SIGTERM", Set<() => void>> = {
    SIGINT: new Set(),
    SIGTERM: new Set(),
  };
  return {
    listeners,
    once(event: "SIGINT" | "SIGTERM", listener: () => void) {
      listeners[event].add(listener);
    },
    off(event: "SIGINT" | "SIGTERM", listener: () => void) {
      listeners[event].delete(listener);
    },
    emit(event: "SIGINT" | "SIGTERM") {
      for (const listener of [...listeners[event]]) listener();
    },
  };
}

function fakeInput(
  chunks: string[],
  options: { tty?: boolean; throwOnEnable?: boolean } = {},
): { input: HiddenInput; modes: boolean[] } {
  const modes: boolean[] = [];
  const input: HiddenInput = {
    isTTY: options.tty ?? true,
    setRawMode(enabled) {
      modes.push(enabled);
      if (enabled && options.throwOnEnable) throw new Error("raw mode failed");
    },
    on(_event, listener) {
      for (const chunk of chunks) listener(Buffer.from(chunk));
    },
    off() {
      return undefined;
    },
  };
  return { input, modes };
}

async function main(): Promise<void> {
  const production = harness({ env: approvedEnv({ stagingDirectUrl: productionDirect }) });
  const productionResult = await executeHighOctaneStagingSaadAccess(production.deps);
  assert.deepEqual(productionResult, { ok: false, reason: "direct_production" });
  assert.deepEqual(production.inspected, []);
  assert.deepEqual(production.writerUrls, []);
  assert.equal(production.visiblePrompts, 0);
  const productionRun = await runHighOctaneStagingSaadExecute(production.deps);
  assert.equal(productionRun, 1);
  assert.equal(production.output.join(""), `${HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL}\n`);

  const pooled = harness({ env: approvedEnv({ stagingDirectUrl: stagingPooled }) });
  assert.deepEqual(await executeHighOctaneStagingSaadAccess(pooled.deps), {
    ok: false,
    reason: "direct_pooled",
  });
  assert.deepEqual(pooled.inspected, []);
  assert.deepEqual(pooled.writerUrls, []);

  const wrongBranch = harness({ branchId: "br-falling-credit-axrjacil" });
  assert.deepEqual(await executeHighOctaneStagingSaadAccess(wrongBranch.deps), {
    ok: false,
    reason: "wrong_branch",
  });
  assert.deepEqual(wrongBranch.inspected, [stagingDirect]);
  assert.deepEqual(wrongBranch.writerUrls, []);
  assert.equal(wrongBranch.visiblePrompts, 0);
  assert.equal(wrongBranch.hiddenPrompts, 0);

  const piped = harness({ interactive: false, hidden: [password, password] });
  assert.deepEqual(await executeHighOctaneStagingSaadAccess(piped.deps), {
    ok: false,
    reason: "not_interactive",
  });
  assert.equal(piped.envReads, 0);
  assert.deepEqual(piped.inspected, []);
  assert.deepEqual(piped.writerUrls, []);

  const args = harness({ argv: ["--password", password], hidden: [password, password] });
  assert.deepEqual(await executeHighOctaneStagingSaadAccess(args.deps), {
    ok: false,
    reason: "argv_rejected",
  });
  assert.equal(args.envReads, 0);
  assert.deepEqual(args.writerUrls, []);

  const mismatch = harness({ hidden: [password, `${password}-other`] });
  assert.deepEqual(await executeHighOctaneStagingSaadAccess(mismatch.deps), {
    ok: false,
    reason: "password_mismatch",
  });
  assert.equal(mismatch.hiddenPrompts, 2);
  assert.deepEqual(mismatch.writerUrls, []);

  const shortPassword = "1234567";
  const short = harness({ hidden: [shortPassword, shortPassword] });
  assert.deepEqual(await executeHighOctaneStagingSaadAccess(short.deps), {
    ok: false,
    reason: "password_requirements",
  });
  assert.deepEqual(short.writerUrls, []);

  const confirmation = harness({ confirmation: "APPLY", hidden: [password, password] });
  assert.deepEqual(await executeHighOctaneStagingSaadAccess(confirmation.deps), {
    ok: false,
    reason: "confirmation_mismatch",
  });
  assert.equal(confirmation.hiddenPrompts, 0);
  assert.deepEqual(confirmation.writerUrls, []);

  const leaked = harness({
    hidden: [password, password],
    writerError: `postgres://secret ${password} $2b$hash`,
  });
  const leakedCode = await runHighOctaneStagingSaadExecute(leaked.deps);
  assert.equal(leakedCode, 1);
  const leakedText = leaked.output.join("");
  assert.equal(leakedText.endsWith(`${HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL}\n`), true);
  assert.equal(leakedText.includes(password), false);
  assert.equal(leakedText.includes("postgres://"), false);
  assert.equal(leakedText.includes("$2"), false);
  assert.equal(leakedText.includes("caller_supplied"), false);
  assert.deepEqual(leaked.writerUrls, [stagingDirect]);

  const ready = harness({ hidden: [password, password] });
  const code = await runHighOctaneStagingSaadExecute(ready.deps);
  assert.equal(code, 0);
  const text = ready.output.join("");
  assert.equal(text.includes("applied YES\n"), true);
  assert.equal(text.includes(`branch_id ${HIGH_OCTANE_STAGING_BRANCH_ID}`), true);
  assert.equal(text.includes("membership OWNER ACTIVE"), true);
  assert.equal(text.includes("primary_agent update"), true);
  assert.equal(text.includes("placeholder unchanged"), true);
  assert.equal(text.includes("billing_owner unchanged"), true);
  assert.equal(text.includes("subscription not_created"), true);
  assert.equal(text.includes(password), false);
  assert.equal(text.includes("postgres://"), false);
  assert.equal(text.includes("$2"), false);
  assert.equal(text.includes("caller_supplied"), false);
  assert.deepEqual(ready.writerUrls, [stagingDirect]);
  assert.equal(ready.created.password?.startsWith("$2"), true);
  assert.notEqual(ready.created.password, password);

  const output: string[] = [];
  const hiddenPrompt = fakeInput([`${password}\r`]);
  const entered = await promptHiddenLine(
    hiddenPrompt.input,
    { write: (line) => output.push(line) },
    "Password: ",
    fakeSignals(),
  );
  assert.equal(entered, password);
  assert.deepEqual(hiddenPrompt.modes, [true, false]);
  assert.equal(output.join(""), "Password: \n");
  assert.equal(output.join("").includes(password), false);

  const arrows = fakeInput(["\u001b[A", "ab\u007f", "c\r"]);
  assert.equal(
    await promptHiddenLine(arrows.input, { write() {} }, "Password: ", fakeSignals()),
    "ac",
  );
  assert.deepEqual(arrows.modes, [true, false]);

  const cancelled = fakeInput(["\u0003"]);
  await assert.rejects(
    () => promptHiddenLine(cancelled.input, { write() {} }, "Password: ", fakeSignals()),
    (error: unknown) => error instanceof Error && error.message === HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL,
  );
  assert.deepEqual(cancelled.modes, [true, false]);

  const interrupted = fakeInput([]);
  const signals = fakeSignals();
  const pending = promptHiddenLine(interrupted.input, { write() {} }, "Password: ", signals);
  signals.emit("SIGINT");
  await assert.rejects(pending);
  assert.deepEqual(interrupted.modes, [true, false]);
  assert.equal(signals.listeners.SIGINT.size, 0);
  assert.equal(signals.listeners.SIGTERM.size, 0);

  const broken = fakeInput([], { throwOnEnable: true });
  await assert.rejects(() =>
    promptHiddenLine(broken.input, { write() {} }, "Password: ", fakeSignals()),
  );
  assert.deepEqual(broken.modes, [true, false]);

  const closed = fakeInput([`${password}\r`], { tty: false });
  await assert.rejects(
    () => promptHiddenLine(closed.input, { write() {} }, "Password: ", fakeSignals()),
    (error: unknown) => error instanceof Error && error.message === HIGH_OCTANE_STAGING_SAAD_EXECUTE_REFUSAL,
  );
  assert.deepEqual(closed.modes, []);

  const executeSource = readFileSync(
    join(root, "src/lib/tenancy/templates/high-octane-staging-saad-execute.ts"),
    "utf8",
  );
  const applyScript = readFileSync(join(root, "scripts/apply-high-octane-saad-access.ts"), "utf8");
  const dryRun = readFileSync(join(root, "scripts/provision-high-octane-saad-access.ts"), "utf8");
  assert.equal(executeSource.includes(password), false);
  assert.equal(executeSource.includes("process.argv"), false);
  assert.equal(executeSource.includes("process.env"), false);
  assert.equal(executeSource.includes("retry"), false);
  assert.equal(applyScript.includes("--password"), false);
  assert.equal(applyScript.includes("PASSWORD"), false);
  assert.equal(applyScript.includes("@/lib/prisma"), false);
  assert.equal(applyScript.includes("STAGING_DIRECT_URL"), true);
  assert.equal(applyScript.includes("createHighOctaneStagingSaadAccessWriter(directUrl)"), true);
  assert.equal(applyScript.includes("createHighOctaneStagingSaadAccessWriter(fileEnv.DATABASE_URL)"), false);
  assert.equal(applyScript.includes("createHighOctaneStagingSaadAccessWriter(process.env.DATABASE_URL)"), false);
  assert.equal(applyScript.includes("?? fileEnv.DATABASE_URL"), false);
  assert.equal(applyScript.includes("?? process.env.DIRECT_URL"), false);
  assert.equal(applyScript.includes("BEGIN READ ONLY"), true);
  assert.equal(applyScript.includes("catch (error"), false);
  assert.equal(applyScript.includes("console.error"), false);
  assert.equal(dryRun.includes("applyHighOctaneStagingSaadAccess"), false);
  assert.equal(dryRun.includes("createHighOctaneStagingSaadAccessWriter"), false);
  assert.equal(dryRun.includes("high-octane-staging-saad-execute"), false);
  assert.equal(dryRun.includes("BEGIN READ ONLY"), true);

  console.log("high-octane-staging-saad-execute-selftest: ok");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "execute selftest failed";
  console.error(message.includes(password) ? "execute selftest failed" : message);
  process.exitCode = 1;
});
