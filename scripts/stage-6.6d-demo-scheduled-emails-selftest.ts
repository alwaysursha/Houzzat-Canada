/**
 * Stage 6.6D — Demo scheduled / rescheduled customer email selftest.
 * Run: node --import tsx scripts/stage-6.6d-demo-scheduled-emails-selftest.ts
 *
 * No production writes. No real Resend sends.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPlatformProspectDemoAction,
  createOrReopenPlatformProspect,
  DEMO_SCHEDULED_EMAIL_AUDIT,
  notifyDemoScheduledEmail,
  renderDemoRescheduledEmail,
  renderDemoScheduledEmail,
} from "../src/lib/platform";
import { renderBookDemoConfirmationEmail } from "../src/lib/platform/public";
import {
  formatHouzzatProZonedDateTime,
  HOUZZATPRO_DEFAULT_TIME_ZONE,
  HOUZZATPRO_DEFAULT_TIME_ZONE_LABEL,
} from "../src/lib/platform/datetime";
import { formatPlatformScheduledAt } from "../src/lib/platform/ui/format";
import type { SendEmailResult } from "../src/lib/email/send";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const FIRST_AT = "2026-09-10T15:00:00.000Z";
const SECOND_AT = "2026-09-11T16:00:00.000Z";

type FakeProspect = {
  id: string;
  contactName: string;
  email: string;
  status: string;
  notesInternal: string | null;
};

type FakeActivity = {
  id: string;
  prospectId: string;
  type: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  operatorId: string | null;
  body: string | null;
  createdAt: Date;
};

type FakeAudit = {
  id: string;
  action: string;
  entityId: string;
  entityType: string;
  metadata: Record<string, unknown> | null;
  summary: string;
};

type FakeState = {
  prospects: Map<string, FakeProspect>;
  byEmail: Map<string, string>;
  activities: FakeActivity[];
  audits: FakeAudit[];
  nextId: number;
};

type SentMail = {
  to: string;
  kind: string;
  subject: string;
  html: string;
  text: string;
  from?: string | null;
  replyTo?: string | null;
};

function createFakePrisma(state: FakeState) {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;
  return {
    platformProspect: {
      async findUnique({
        where,
      }: {
        where: { id?: string; email?: string };
        select?: unknown;
      }) {
        if (where.id) return state.prospects.get(where.id) ?? null;
        if (where.email) {
          const pid = state.byEmail.get(where.email);
          return pid ? (state.prospects.get(pid) ?? null) : null;
        }
        return null;
      },
      async create({
        data,
      }: {
        data: Partial<FakeProspect> & { email: string; contactName: string };
      }) {
        const row: FakeProspect = {
          id: id("p"),
          contactName: data.contactName,
          email: data.email,
          status: data.status ?? "NEW",
          notesInternal: data.notesInternal ?? null,
        };
        state.prospects.set(row.id, row);
        state.byEmail.set(row.email, row.id);
        return { id: row.id, status: row.status };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeProspect>;
      }) {
        const current = state.prospects.get(where.id);
        if (!current) throw new Error("missing prospect");
        const next = { ...current, ...data };
        state.prospects.set(where.id, next);
        return next;
      },
    },
    platformProspectActivity: {
      async findUnique({ where }: { where: { id: string }; select?: unknown }) {
        return state.activities.find((a) => a.id === where.id) ?? null;
      },
      async findFirst({
        where,
        orderBy,
      }: {
        where: {
          prospectId?: string;
          type?: string;
          id?: string | { not: string };
        };
        orderBy?: Array<Record<string, "asc" | "desc">>;
        select?: unknown;
      }) {
        let rows = state.activities.filter((a) => {
          if (where.prospectId && a.prospectId !== where.prospectId) return false;
          if (where.type && a.type !== where.type) return false;
          if (typeof where.id === "string" && a.id !== where.id) return false;
          if (
            where.id &&
            typeof where.id === "object" &&
            "not" in where.id &&
            a.id === where.id.not
          ) {
            return false;
          }
          return true;
        });
        const primary = orderBy?.[0];
        const key = primary ? Object.keys(primary)[0] : null;
        const dir = key && primary ? primary[key] : "desc";
        if (key) {
          rows = [...rows].sort((a, b) => {
            const av = (a as unknown as Record<string, unknown>)[key];
            const bv = (b as unknown as Record<string, unknown>)[key];
            const at =
              av instanceof Date
                ? av.getTime()
                : typeof av === "string"
                  ? av
                  : 0;
            const bt =
              bv instanceof Date
                ? bv.getTime()
                : typeof bv === "string"
                  ? bv
                  : 0;
            if (at < bt) return dir === "asc" ? -1 : 1;
            if (at > bt) return dir === "asc" ? 1 : -1;
            return 0;
          });
        }
        return rows[0] ?? null;
      },
      async create({
        data,
      }: {
        data: {
          prospectId: string;
          type: string;
          operatorId?: string | null;
          body?: string | null;
          scheduledAt?: Date | null;
          completedAt?: Date | null;
        };
        select?: unknown;
      }) {
        const row: FakeActivity = {
          id: id("a"),
          prospectId: data.prospectId,
          type: data.type,
          operatorId: data.operatorId ?? null,
          body: data.body ?? null,
          scheduledAt: data.scheduledAt ?? null,
          completedAt: data.completedAt ?? null,
          createdAt: new Date(1_700_000_000_000 + state.nextId),
        };
        state.activities.push(row);
        return { id: row.id };
      },
    },
    platformAuditEvent: {
      async findFirst({
        where,
      }: {
        where: {
          entityType?: string;
          entityId?: string;
          action?: string;
          metadata?: { path?: string[]; equals?: unknown };
        };
        select?: unknown;
      }) {
        const hit = state.audits.find((a) => {
          if (where.entityType && a.entityType !== where.entityType) return false;
          if (where.entityId && a.entityId !== where.entityId) return false;
          if (where.action && a.action !== where.action) return false;
          if (where.metadata?.path && where.metadata.equals !== undefined) {
            let cur: unknown = a.metadata;
            for (const key of where.metadata.path) {
              if (!cur || typeof cur !== "object") return false;
              cur = (cur as Record<string, unknown>)[key];
            }
            if (cur !== where.metadata.equals) return false;
          }
          return true;
        });
        return hit ? { id: hit.id } : null;
      },
      async create({
        data,
      }: {
        data: {
          action: string;
          entityId: string;
          entityType: string;
          metadata?: unknown;
          summary: string;
        };
        select?: unknown;
      }) {
        const row: FakeAudit = {
          id: id("aud"),
          action: data.action,
          entityId: data.entityId,
          entityType: data.entityType,
          metadata: (data.metadata as Record<string, unknown>) ?? null,
          summary: data.summary,
        };
        state.audits.push(row);
        return { id: row.id };
      },
    },
  };
}

function emptyState(): FakeState {
  return {
    prospects: new Map(),
    byEmail: new Map(),
    activities: [],
    audits: [],
    nextId: 1,
  };
}

async function seedProspect(state: FakeState, email: string, name: string) {
  const db = createFakePrisma(state) as never;
  const created = await createOrReopenPlatformProspect({
    contactName: name,
    email,
    operatorId: "op_1",
    prisma: db,
  });
  const row = state.prospects.get(created.prospectId)!;
  row.notesInternal = "INTERNAL_SALES_NOTE_DO_NOT_EMAIL";
  return created.prospectId;
}

async function schedule(
  state: FakeState,
  prospectId: string,
  scheduledAt: string,
  note?: string,
) {
  return applyPlatformProspectDemoAction({
    prospectId,
    operatorId: "op_1",
    action: "schedule",
    scheduledAt,
    note: note ?? null,
    prisma: createFakePrisma(state) as never,
  });
}

function sentCollector(sent: SentMail[]) {
  return async (input: {
    to: string;
    rendered: { kind: string; subject: string; html: string; text: string };
    from?: string | null;
    replyTo?: string | null;
  }): Promise<SendEmailResult> => {
    sent.push({
      to: input.to,
      kind: input.rendered.kind,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      from: input.from,
      replyTo: input.replyTo ?? null,
    });
    return { ok: true, status: "sent", providerId: "msg_test" };
  };
}

function assertEasternFormatting(payload: { html: string; text: string }) {
  const parts = formatHouzzatProZonedDateTime(FIRST_AT, { dateMonth: "long" });
  assert.ok(parts);
  assert.equal(parts.timeZoneId, HOUZZATPRO_DEFAULT_TIME_ZONE);
  assert.equal(parts.timeZoneLabel, HOUZZATPRO_DEFAULT_TIME_ZONE_LABEL);
  assert.match(parts.time, /11:00/);
  assert.ok(!/3:00/.test(parts.time));
  assert.ok(payload.html.includes(parts.date));
  assert.ok(payload.html.includes(parts.time));
  assert.ok(payload.html.includes(HOUZZATPRO_DEFAULT_TIME_ZONE_LABEL));
  assert.ok(payload.text.includes(`Date: ${parts.date}`));
  assert.ok(payload.text.includes(`Time: ${parts.time}`));
  assert.ok(
    payload.text.includes(`Time Zone: ${HOUZZATPRO_DEFAULT_TIME_ZONE_LABEL}`),
  );
  assert.ok(!payload.html.includes("15:00"));
  assert.ok(!payload.text.includes("INTERNAL_SALES_NOTE"));
  assert.ok(!payload.html.includes("PRIVATE_MEETING_NOTE"));
}

async function main() {
  console.log("\n=== STAGE 6.6D — DEMO SCHEDULED CUSTOMER EMAIL ===\n");

  const prevNotify = process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
  process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = "ops@example.com";

  try {
    {
      const rendered = renderDemoScheduledEmail({
        contactName: "Maria Khalid",
        scheduledAt: FIRST_AT,
      });
      assert.equal(rendered.subject, "Your HouzzatPRO Demo is Scheduled");
      assert.match(rendered.text, /Hi Maria Khalid,/);
      assert.ok(rendered.html.includes("Your HouzzatPRO demo has been scheduled."));
      assert.ok(
        rendered.text.includes(
          "We look forward to showing you how HouzzatPRO can help you build and grow your real estate business.",
        ),
      );
      assertEasternFormatting(rendered);
      assert.equal(rendered.kind, "houzzatpro_demo_scheduled");
      console.log("[1] Scheduled template + America/Toronto... PASS");
    }

    {
      const rendered = renderDemoRescheduledEmail({
        contactName: "Maria Khalid",
        scheduledAt: FIRST_AT,
      });
      assert.equal(
        rendered.subject,
        "Your HouzzatPRO Demo Has Been Rescheduled",
      );
      assert.ok(
        rendered.html.includes("Your HouzzatPRO demo has been rescheduled."),
      );
      assertEasternFormatting(rendered);
      console.log("[2] Rescheduled template... PASS");
    }

    {
      const admin = formatPlatformScheduledAt(FIRST_AT);
      const parts = formatHouzzatProZonedDateTime(FIRST_AT, { dateMonth: "short" });
      assert.ok(parts);
      assert.ok(admin.includes(parts.time));
      assert.ok(admin.includes(HOUZZATPRO_DEFAULT_TIME_ZONE_LABEL));
      assert.ok(!admin.includes("3:00"));
      const page = read(
        "src/app/platform/(shell)/prospects/[prospectId]/page.tsx",
      );
      assert.ok(page.includes("formatPlatformScheduledAt"));
      console.log("[3] Admin scheduled display uses Eastern Time... PASS");
    }

    {
      const state = emptyState();
      const prospectId = await seedProspect(
        state,
        "maria.schedule@example.com",
        "Maria Khalid",
      );
      const sent: SentMail[] = [];
      const result = await schedule(
        state,
        prospectId,
        FIRST_AT,
        "PRIVATE_MEETING_NOTE",
      );
      assert.equal(state.prospects.get(prospectId)?.status, "DEMO_SCHEDULED");
      const notify = await notifyDemoScheduledEmail({
        prospectId,
        activityId: result.activityId!,
        prisma: createFakePrisma(state) as never,
        send: sentCollector(sent),
      });
      assert.equal(notify.status, "sent");
      assert.equal(notify.variant, "scheduled");
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.to, "maria.schedule@example.com");
      assert.equal(sent[0]!.subject, "Your HouzzatPRO Demo is Scheduled");
      assert.equal(sent[0]!.replyTo, "ops@example.com");
      assertEasternFormatting(sent[0]!);
      const emailAudits = state.audits.filter(
        (a) => a.action === DEMO_SCHEDULED_EMAIL_AUDIT.ATTEMPTED,
      );
      assert.equal(emailAudits.length, 1);
      assert.equal(emailAudits[0]!.metadata?.status, "sent");
      assert.equal(emailAudits[0]!.metadata?.activityId, result.activityId);
      assert.equal(emailAudits[0]!.metadata?.variant, "scheduled");
      const dump = JSON.stringify(state.audits);
      assert.ok(!dump.includes("PRIVATE_MEETING_NOTE"));
      assert.ok(!dump.includes("INTERNAL_SALES_NOTE"));
      assert.ok(!dump.includes(sent[0]!.html.slice(0, 40)));
      console.log("[4] First schedule → Scheduled email... PASS");
    }

    {
      const state = emptyState();
      const prospectId = await seedProspect(
        state,
        "maria.resched@example.com",
        "Maria Khalid",
      );
      const sent: SentMail[] = [];
      const first = await schedule(state, prospectId, FIRST_AT);
      await notifyDemoScheduledEmail({
        prospectId,
        activityId: first.activityId!,
        prisma: createFakePrisma(state) as never,
        send: sentCollector(sent),
      });
      const second = await schedule(state, prospectId, SECOND_AT);
      const notify = await notifyDemoScheduledEmail({
        prospectId,
        activityId: second.activityId!,
        prisma: createFakePrisma(state) as never,
        send: sentCollector(sent),
      });
      assert.equal(notify.status, "sent");
      assert.equal(notify.variant, "rescheduled");
      assert.equal(sent.length, 2);
      assert.equal(
        sent[1]!.subject,
        "Your HouzzatPRO Demo Has Been Rescheduled",
      );
      assert.equal(sent[1]!.to, "maria.resched@example.com");
      console.log("[5] Reschedule → Rescheduled email... PASS");
    }

    {
      const state = emptyState();
      const prospectId = await seedProspect(
        state,
        "maria.dup@example.com",
        "Maria Khalid",
      );
      const sent: SentMail[] = [];
      const first = await schedule(state, prospectId, FIRST_AT);
      await notifyDemoScheduledEmail({
        prospectId,
        activityId: first.activityId!,
        prisma: createFakePrisma(state) as never,
        send: sentCollector(sent),
      });
      const repeat = await schedule(state, prospectId, FIRST_AT);
      assert.ok(repeat.activityId);
      assert.notEqual(repeat.activityId, first.activityId);
      const notify = await notifyDemoScheduledEmail({
        prospectId,
        activityId: repeat.activityId!,
        prisma: createFakePrisma(state) as never,
        send: sentCollector(sent),
      });
      assert.equal(notify.status, "skipped");
      assert.equal(notify.reason, "duplicate_datetime");
      assert.equal(sent.length, 1);
      const skipAudit = state.audits.filter(
        (a) =>
          a.action === DEMO_SCHEDULED_EMAIL_AUDIT.ATTEMPTED &&
          a.metadata?.activityId === repeat.activityId,
      );
      assert.equal(skipAudit.length, 1);
      assert.equal(skipAudit[0]!.metadata?.status, "skipped");
      assert.equal(skipAudit[0]!.metadata?.reason, "duplicate_datetime");
      assert.equal(state.prospects.get(prospectId)?.status, "DEMO_SCHEDULED");
      console.log("[6] Identical datetime repeat → no duplicate email... PASS");
    }

    {
      const state = emptyState();
      const prospectId = await seedProspect(
        state,
        "maria.fail@example.com",
        "Maria Khalid",
      );
      const result = await schedule(state, prospectId, FIRST_AT);
      assert.equal(state.prospects.get(prospectId)?.status, "DEMO_SCHEDULED");
      const notify = await notifyDemoScheduledEmail({
        prospectId,
        activityId: result.activityId!,
        prisma: createFakePrisma(state) as never,
        send: async () =>
          ({ ok: false, status: "failed", error: "boom" }) satisfies SendEmailResult,
      });
      assert.equal(notify.status, "failed");
      assert.equal(notify.reason, "provider_error");
      assert.equal(state.prospects.get(prospectId)?.status, "DEMO_SCHEDULED");
      assert.ok(
        state.activities.some(
          (a) => a.type === "DEMO_SCHEDULED" && a.id === result.activityId,
        ),
      );
      const failAudit = state.audits.find(
        (a) =>
          a.action === DEMO_SCHEDULED_EMAIL_AUDIT.ATTEMPTED &&
          a.metadata?.activityId === result.activityId,
      );
      assert.equal(failAudit?.metadata?.status, "failed");
      assert.ok(!JSON.stringify(failAudit).includes("boom"));

      const thrown = await notifyDemoScheduledEmail({
        prospectId,
        activityId: result.activityId!,
        prisma: createFakePrisma(state) as never,
        send: async () => {
          throw new Error("should not fail scheduling");
        },
      });
      assert.equal(thrown.status, "skipped");
      assert.equal(thrown.reason, "already_attempted");
      assert.equal(state.prospects.get(prospectId)?.status, "DEMO_SCHEDULED");
      console.log("[7] Email failure does not fail scheduling... PASS");
    }

    {
      const confirm = renderBookDemoConfirmationEmail({
        contactName: "Maria Khalid",
      });
      assert.equal(confirm.subject, "We received your HouzzatPRO demo request");
      assert.ok(
        confirm.text.includes(
          "We've received your demo request and our team will review the information you provided",
        ),
      );
      const bookRoute = read("src/app/api/platform/public/book-demo/route.ts");
      const demoRoute = read(
        "src/app/api/platform/v1/prospects/[prospectId]/demo/route.ts",
      );
      const emails = read("src/lib/platform/public/book-demo-emails.ts");
      assert.ok(bookRoute.includes("notifyBookDemoEmails"));
      assert.ok(!bookRoute.includes("notifyDemoScheduledEmail"));
      assert.ok(demoRoute.includes("notifyDemoScheduledEmail"));
      assert.ok(demoRoute.includes('action === "schedule"'));
      assert.ok(demoRoute.includes("try {"));
      assert.ok(!demoRoute.includes("notifyBookDemoEmails"));
      assert.ok(!emails.includes("notifyDemoScheduledEmail"));
      assert.ok(!emails.includes("Your HouzzatPRO Demo is Scheduled"));
      console.log("[8] /book-a-demo intake emails unaffected... PASS");
    }
  } finally {
    if (prevNotify === undefined) {
      delete process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
    } else {
      process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = prevNotify;
    }
  }

  console.log("\nSTAGE 6.6D SELFTEST PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
