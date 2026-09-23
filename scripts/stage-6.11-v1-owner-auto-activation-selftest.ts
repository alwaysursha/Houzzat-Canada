/**
 * V1 — auto-send owner activation safety (retry / concurrency).
 * Run: pnpm stage-6.11-v1-owner-auto-activation:selftest
 *
 * No real DB / Stripe / Resend. In-memory fakes only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { SendEmailResult } from "@/lib/email/send";
import type { RenderedEmail } from "@/lib/email/templates";
import {
  OWNER_ACTIVATION_AUDIT,
  OWNER_ACTIVATION_PATH_PREFIX,
  sendOwnerActivationEmail,
  tryAutoSendOwnerActivationAfterProvision,
} from "@/lib/platform/activation";
import { HOUZZATPRO_APP_BOOTSTRAP_ORIGIN } from "@/lib/tenancy/platform-hostname";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type FakeActivation = {
  id: string;
  workspaceId: string;
  userId: string;
  tokenHash: string;
  status: string;
  expiresAt: Date;
  sentAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdByType: string;
  createdByOperatorId: string | null;
  createdAt: Date;
};

type FakeState = {
  workspace: {
    id: string;
    name: string;
    status: string;
    currentSubscriptionId: string;
    billingOwnerUserId: string;
  };
  subscription: { id: string; status: string; workspaceId: string };
  user: {
    id: string;
    email: string;
    name: string | null;
    password: string | null;
    disabledAt: Date | null;
  };
  members: Array<{ userId: string; role: string; status: string }>;
  domains: Array<{ id: string; kind: string; status: string }>;
  provisioningRuns: Array<{ id: string; status: string }>;
  activations: FakeActivation[];
  audits: Array<{ action: string; metadata: unknown }>;
  emails: Array<{ to: string; subject: string; html: string }>;
};

function statusList(
  status: string | { in: string[] },
): string[] {
  if (typeof status === "object" && status && "in" in status) {
    return status.in;
  }
  return [status as string];
}

function makeDb(state: FakeState): PrismaClient {
  let actSeq = 0;
  const db = {
    subscription: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== state.subscription.id) return null;
        return {
          id: state.subscription.id,
          status: state.subscription.status,
          workspaceId: state.subscription.workspaceId,
        };
      },
    },
    workspace: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, unknown>;
      }) => {
        if (where.id !== state.workspace.id) return null;
        if (select && "domains" in select) {
          return {
            id: state.workspace.id,
            status: state.workspace.status,
            domains: state.domains.filter(
              (d) => d.kind === "PLATFORM" && d.status === "ACTIVE",
            ),
            members: state.members.filter(
              (m) => m.role === "OWNER" && m.status === "ACTIVE",
            ),
          };
        }
        return {
          id: state.workspace.id,
          name: state.workspace.name,
          status: state.workspace.status,
          currentSubscriptionId: state.workspace.currentSubscriptionId,
          billingOwnerUserId: state.workspace.billingOwnerUserId,
          members: state.members
            .filter((m) => m.role === "OWNER" && m.status === "ACTIVE")
            .map((m) => ({
              userId: m.userId,
              user: { ...state.user },
            })),
          provisioningRuns: state.provisioningRuns.filter(
            (r) => r.status === "SUCCEEDED",
          ),
        };
      },
    },
    workspaceOwnerActivation: {
      findMany: async ({
        where,
      }: {
        where: {
          workspaceId: string;
          userId: string;
          status: string | { in: string[] };
          expiresAt?: { gt?: Date; lte?: Date };
        };
      }) => {
        const statuses = statusList(where.status);
        return state.activations.filter((a) => {
          if (a.workspaceId !== where.workspaceId) return false;
          if (a.userId !== where.userId) return false;
          if (!statuses.includes(a.status)) return false;
          if (where.expiresAt?.gt && !(a.expiresAt > where.expiresAt.gt)) {
            return false;
          }
          if (where.expiresAt?.lte && !(a.expiresAt <= where.expiresAt.lte)) {
            return false;
          }
          return true;
        });
      },
      findFirst: async ({
        where,
      }: {
        where: {
          workspaceId: string;
          userId: string;
          status: string | { in: string[] };
          expiresAt: { gt: Date };
          revokedAt?: null;
          usedAt?: null;
        };
      }) => {
        const now = where.expiresAt.gt;
        const statuses = statusList(where.status);
        return (
          state.activations.find(
            (a) =>
              a.workspaceId === where.workspaceId &&
              a.userId === where.userId &&
              statuses.includes(a.status) &&
              a.expiresAt > now &&
              !a.revokedAt &&
              !a.usedAt,
          ) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: {
          workspaceId: string;
          userId: string;
          tokenHash: string;
          status: string;
          expiresAt: Date;
          createdByType: string;
          createdByOperatorId: string | null;
        };
      }) => {
        const row: FakeActivation = {
          id: `act_${++actSeq}`,
          ...data,
          sentAt: null,
          usedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        };
        state.activations.push(row);
        return { id: row.id };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = state.activations.find((a) => a.id === where.id);
        if (!row) throw new Error("activation missing");
        Object.assign(row, data);
        return row;
      },
    },
    workspaceOnboardingState: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) =>
        state.workspace.id === where.workspaceId
          ? { workspaceId: state.workspace.id }
          : null,
      create: async () => ({ workspaceId: state.workspace.id }),
    },
    platformAuditEvent: {
      create: async ({
        data,
      }: {
        data: { action: string; metadata?: unknown };
      }) => {
        state.audits.push({
          action: data.action,
          metadata: data.metadata ?? null,
        });
        return { id: `aud_${state.audits.length}` };
      },
      findFirst: async () => null,
    },
  };

  return db as unknown as PrismaClient;
}

async function stubSend(state: FakeState, fail = false) {
  return async (input: {
    to: string;
    rendered: RenderedEmail;
  }): Promise<SendEmailResult> => {
    if (fail) {
      return { ok: false, status: "failed", error: "provider_down" };
    }
    state.emails.push({
      to: input.to,
      subject: input.rendered.subject,
      html: input.rendered.html,
    });
    return {
      ok: true,
      status: "sent",
      providerId: `msg_${state.emails.length}`,
    };
  };
}

function baseState(): FakeState {
  return {
    workspace: {
      id: "ws_1",
      name: "Acme Realty",
      status: "ACTIVE",
      currentSubscriptionId: "sub_1",
      billingOwnerUserId: "user_1",
    },
    subscription: {
      id: "sub_1",
      status: "ACTIVE",
      workspaceId: "ws_1",
    },
    user: {
      id: "user_1",
      email: "owner@acme.test",
      name: "Owner",
      password: null,
      disabledAt: null,
    },
    members: [{ userId: "user_1", role: "OWNER", status: "ACTIVE" }],
    domains: [{ id: "dom_1", kind: "PLATFORM", status: "ACTIVE" }],
    provisioningRuns: [{ id: "run_1", status: "SUCCEEDED" }],
    activations: [],
    audits: [],
    emails: [],
  };
}

async function main() {
  console.log("\n=== V1 OWNER AUTO-ACTIVATION SAFETY ===\n");

  // A. successful auto-send
  {
    const state = baseState();
    const send = await stubSend(state);
    const result = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: makeDb(state),
      send,
      actorType: "WEBHOOK",
    });
    assert.equal(result.outcome, "sent");
    assert.equal(state.emails.length, 1);
    assert.equal(state.emails[0]!.to, "owner@acme.test");
    assert.equal(state.activations[0]!.status, "SENT");
    assert.ok(
      state.emails[0]!.html.includes(OWNER_ACTIVATION_PATH_PREFIX) ||
        state.emails[0]!.html.includes(HOUZZATPRO_APP_BOOTSTRAP_ORIGIN) ||
        state.emails[0]!.subject.length > 0,
    );
    console.log("[A] successful auto-send... PASS");
  }

  // B. SENT → no duplicate
  {
    const state = baseState();
    const send = await stubSend(state);
    const db = makeDb(state);
    await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send,
    });
    const second = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send,
    });
    assert.equal(second.outcome, "skipped");
    if (second.outcome === "skipped") {
      assert.equal(second.skipReason, "usable_activation_exists");
    }
    assert.equal(state.emails.length, 1);
    console.log("[B] repeated with SENT → no duplicate... PASS");
  }

  // C + D + E. email failure stays PENDING; webhook storm → no second send
  {
    const state = baseState();
    const failSend = await stubSend(state, true);
    const db = makeDb(state);
    const failed = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send: failSend,
    });
    assert.equal(failed.outcome, "failed_email");
    assert.equal(state.activations.length, 1);
    assert.equal(state.activations[0]!.status, "PENDING");
    assert.equal(state.emails.length, 0);

    const okSend = await stubSend(state);
    for (let i = 0; i < 5; i++) {
      const again = await tryAutoSendOwnerActivationAfterProvision({
        workspaceId: "ws_1",
        subscriptionId: "sub_1",
        prisma: db,
        send: okSend,
      });
      assert.equal(again.outcome, "skipped");
      if (again.outcome === "skipped") {
        assert.equal(again.skipReason, "usable_activation_exists");
      }
    }
    assert.equal(state.emails.length, 0);
    assert.equal(state.activations.length, 1);
    assert.equal(state.activations[0]!.status, "PENDING");
    console.log(
      "[C/D/E] email fail → PENDING; webhook storm → no second send... PASS",
    );
  }

  // F + G. existing unexpired PENDING → skip; not revoked
  {
    const state = baseState();
    const pendingId = "act_inflight";
    state.activations.push({
      id: pendingId,
      workspaceId: "ws_1",
      userId: "user_1",
      tokenHash: "hash_inflight",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
      sentAt: null,
      usedAt: null,
      revokedAt: null,
      createdByType: "WEBHOOK",
      createdByOperatorId: null,
      createdAt: new Date(),
    });
    const send = await stubSend(state);
    const result = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: makeDb(state),
      send,
    });
    assert.equal(result.outcome, "skipped");
    assert.equal(state.emails.length, 0);
    assert.equal(state.activations.length, 1);
    assert.equal(state.activations[0]!.id, pendingId);
    assert.equal(state.activations[0]!.status, "PENDING");
    assert.equal(state.activations[0]!.revokedAt, null);
    console.log("[F/G] unexpired PENDING → skip, not revoked... PASS");
  }

  // H. expired PENDING → one replacement
  {
    const state = baseState();
    state.activations.push({
      id: "act_old",
      workspaceId: "ws_1",
      userId: "user_1",
      tokenHash: "hash_old",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000),
      sentAt: null,
      usedAt: null,
      revokedAt: null,
      createdByType: "WEBHOOK",
      createdByOperatorId: null,
      createdAt: new Date(Date.now() - 10_000),
    });
    const send = await stubSend(state);
    const db = makeDb(state);
    const first = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send,
    });
    assert.equal(first.outcome, "sent");
    assert.equal(state.emails.length, 1);
    const old = state.activations.find((a) => a.id === "act_old");
    assert.equal(old?.status, "EXPIRED");
    const second = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send,
    });
    assert.equal(second.outcome, "skipped");
    assert.equal(state.emails.length, 1);
    console.log("[H] expired PENDING → one replacement... PASS");
  }

  // I. expired SENT → one replacement
  {
    const state = baseState();
    state.activations.push({
      id: "act_old_sent",
      workspaceId: "ws_1",
      userId: "user_1",
      tokenHash: "hash_old_sent",
      status: "SENT",
      expiresAt: new Date(Date.now() - 1000),
      sentAt: new Date(Date.now() - 10_000),
      usedAt: null,
      revokedAt: null,
      createdByType: "WEBHOOK",
      createdByOperatorId: null,
      createdAt: new Date(Date.now() - 10_000),
    });
    const send = await stubSend(state);
    const db = makeDb(state);
    const first = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send,
    });
    assert.equal(first.outcome, "sent");
    assert.equal(state.emails.length, 1);
    assert.equal(
      state.activations.find((a) => a.id === "act_old_sent")?.status,
      "EXPIRED",
    );
    const second = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send,
    });
    assert.equal(second.outcome, "skipped");
    assert.equal(state.emails.length, 1);
    console.log("[I] expired SENT → one replacement... PASS");
  }

  // J. password set → skip
  {
    const state = baseState();
    state.user.password = "hashed";
    const send = await stubSend(state);
    const result = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: makeDb(state),
      send,
    });
    assert.equal(result.outcome, "skipped");
    if (result.outcome === "skipped") {
      assert.equal(result.skipReason, "owner_password_set");
    }
    assert.equal(state.emails.length, 0);
    console.log("[J] password set → skip... PASS");
  }

  // K + L. manual resend after failed auto + rotates
  {
    const state = baseState();
    const failSend = await stubSend(state, true);
    const db = makeDb(state);
    await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: db,
      send: failSend,
    });
    assert.equal(state.activations[0]!.status, "PENDING");
    const oldId = state.activations[0]!.id;
    const okSend = await stubSend(state);
    const manual = await sendOwnerActivationEmail({
      workspaceId: "ws_1",
      operatorId: "op_1",
      prisma: db,
      send: okSend,
    });
    assert.equal(manual.outcome, "sent");
    assert.equal(state.emails.length, 1);
    const old = state.activations.find((a) => a.id === oldId);
    assert.equal(old?.status, "REVOKED");
    assert.ok(state.activations.some((a) => a.status === "SENT" && a.id !== oldId));
    console.log("[K/L] manual resend after fail rotates... PASS");
  }

  // M. TRIALING / TRIAL is a paid acceptance path — auto-send allowed
  {
    const state = baseState();
    state.subscription.status = "TRIALING";
    state.workspace.status = "TRIAL";
    const send = await stubSend(state);
    const result = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: makeDb(state),
      send,
    });
    assert.equal(result.outcome, "sent");
    assert.equal(state.emails.length, 1);
    console.log("[M] TRIALING auto-send allowed... PASS");
  }

  // N. provisioning failure path — no auto without ACTIVE workspace/domain
  {
    const state = baseState();
    state.domains = [];
    const send = await stubSend(state);
    const result = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: makeDb(state),
      send,
    });
    assert.equal(result.outcome, "skipped");
    if (result.outcome === "skipped") {
      assert.equal(result.skipReason, "missing_platform_domain");
    }
    assert.equal(state.emails.length, 0);
    console.log("[N] incomplete provision → no send... PASS");
  }

  // Near-concurrent re-check: second call sees PENDING from first mid-flight
  {
    const state = baseState();
    let sendCalls = 0;
    const slowSend = async (input: {
      to: string;
      rendered: RenderedEmail;
    }): Promise<SendEmailResult> => {
      sendCalls += 1;
      // Simulate peer seeing PENDING before SENT: inject a second auto-send
      // after create/PENDING exists (first call still in send).
      if (sendCalls === 1) {
        const peer = await tryAutoSendOwnerActivationAfterProvision({
          workspaceId: "ws_1",
          subscriptionId: "sub_1",
          prisma: makeDb(state),
          send: async () => {
            throw new Error("peer must not send");
          },
        });
        assert.equal(peer.outcome, "skipped");
      }
      state.emails.push({
        to: input.to,
        subject: input.rendered.subject,
        html: input.rendered.html,
      });
      return { ok: true, status: "sent", providerId: "msg_1" };
    };
    const first = await tryAutoSendOwnerActivationAfterProvision({
      workspaceId: "ws_1",
      subscriptionId: "sub_1",
      prisma: makeDb(state),
      send: slowSend,
    });
    assert.equal(first.outcome, "sent");
    assert.equal(state.emails.length, 1);
    assert.equal(sendCalls, 1);
    console.log("[O] in-flight PENDING blocks peer auto-send... PASS");
  }

  // Wiring / docs
  {
    const sendSrc = read("src/lib/platform/activation/send.ts");
    assert.ok(sendSrc.includes("unexpired PENDING"));
    assert.ok(sendSrc.includes("never revoke unexpired PENDING"));
    assert.ok(sendSrc.includes("expirePastDuePendingOrSent"));
    assert.ok(!sendSrc.includes("Drop stranded PENDING"));
    assert.ok(
      sendSrc.includes("status: { in: [\"PENDING\", \"SENT\"] }") ||
        sendSrc.includes('status: { in: ["PENDING", "SENT"] }'),
    );
    const provision = read("src/lib/platform/provisioning/provision.ts");
    assert.ok(provision.includes("tryAutoSendOwnerActivationAfterProvision"));
    const checkout = read("src/lib/platform/billing/checkout.ts");
    assert.ok(!checkout.includes("tryAutoSendOwnerActivationAfterProvision"));
    assert.equal(
      OWNER_ACTIVATION_AUDIT.AUTO_SKIPPED,
      "OWNER_ACTIVATION_AUTO_SKIPPED",
    );
    console.log("[P] wiring + comment rules... PASS");
  }

  console.log("\nV1 owner auto-activation safety selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
