/**
 * Stage 6.6C — Book a Demo email notifications selftest.
 * Run: node --import tsx scripts/stage-6.6c-demo-request-emails-selftest.ts
 *
 * No production writes. No real Resend sends.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BOOK_DEMO_EMAIL_AUDIT,
  buildMasterAdminProspectUrl,
  notifyBookDemoEmails,
  receiveWebsiteDemoRequest,
  renderBookDemoConfirmationEmail,
  renderBookDemoInternalNotificationEmail,
} from "../src/lib/platform/public";
import type { SendEmailResult } from "../src/lib/email/send";
import { emailFromHouzzatPro } from "../src/lib/email/config";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function listTsFiles(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(rel));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

type FakeProspect = {
  id: string;
  contactName: string;
  email: string;
  phone: string | null;
  brokerageName: string | null;
  businessName: string | null;
  estimatedTeamSize: number | null;
  website: string | null;
  region: string | null;
  source: string;
  status: string;
  ownerOperatorId: string | null;
  notesInternal: string | null;
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
  activities: Array<{
    id: string;
    prospectId: string;
    type: string;
    body: string | null;
  }>;
  audits: FakeAudit[];
  nextId: number;
  workspaces: number;
  subscriptions: number;
  offers: number;
  stripe: number;
  leads: number;
};

function createFakePrisma(state: FakeState) {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;
  return {
    platformProspect: {
      async findUnique({ where }: { where: { email?: string; id?: string } }) {
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
        data: Partial<FakeProspect> & { email: string };
      }) {
        const row: FakeProspect = {
          id: id("p"),
          contactName: data.contactName ?? "",
          email: data.email,
          phone: data.phone ?? null,
          brokerageName: data.brokerageName ?? null,
          businessName: data.businessName ?? null,
          estimatedTeamSize: data.estimatedTeamSize ?? null,
          website: data.website ?? null,
          region: data.region ?? null,
          source: data.source ?? "WEBSITE_DEMO",
          status: data.status ?? "NEW",
          ownerOperatorId: data.ownerOperatorId ?? null,
          notesInternal: data.notesInternal ?? null,
        };
        state.prospects.set(row.id, row);
        state.byEmail.set(row.email, row.id);
        return { id: row.id };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeProspect>;
      }) {
        const row = state.prospects.get(where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
      },
    },
    platformProspectActivity: {
      async create({
        data,
      }: {
        data: {
          prospectId: string;
          type: string;
          body: string | null;
          operatorId: string | null;
        };
      }) {
        const row = {
          id: id("act"),
          prospectId: data.prospectId,
          type: data.type,
          body: data.body,
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
    workspace: {
      async create() {
        state.workspaces += 1;
        throw new Error("workspace forbidden");
      },
    },
    subscription: {
      async create() {
        state.subscriptions += 1;
        throw new Error("subscription forbidden");
      },
    },
    commercialOffer: {
      async create() {
        state.offers += 1;
        throw new Error("offer forbidden");
      },
    },
    lead: {
      async create() {
        state.leads += 1;
        throw new Error("crm forbidden");
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
    workspaces: 0,
    subscriptions: 0,
    offers: 0,
    stripe: 0,
    leads: 0,
  };
}

async function main() {
  console.log("\n=== STAGE 6.6C — DEMO REQUEST EMAILS ===\n");

  const prevNotify = process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
  process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = "ops@example.com";

  try {
    // 1. Intake persists + emails attempted to correct recipients
    {
      const state = emptyState();
      const sent: Array<{ to: string; kind: string; from?: string | null; replyTo?: string | null; subject: string; html: string; text: string }> = [];
      const intake = await receiveWebsiteDemoRequest({
        fullName: "Alex Rivera",
        email: "alex@brokerage.test",
        phone: "4165551212",
        brokerageName: "Rivera Realty",
        teamSize: 6,
        website: "https://rivera.test",
        region: "Toronto",
        message: "Looking for TEAM plan",
        prisma: createFakePrisma(state) as never,
      });
      assert.equal(intake.outcome, "created");
      assert.ok(intake.emailPayload);
      assert.equal(state.prospects.size, 1);

      const notify = await notifyBookDemoEmails({
        prospectId: intake.prospectId,
        activityId: intake.activityId,
        fields: intake.emailPayload!,
        prisma: createFakePrisma(state) as never,
        send: async (input) => {
          sent.push({
            to: input.to,
            kind: input.rendered.kind,
            from: input.from,
            replyTo: input.replyTo,
            subject: input.rendered.subject,
            html: input.rendered.html,
            text: input.rendered.text,
          });
          return { ok: true, status: "sent", providerId: "re_test" };
        },
      });

      assert.equal(notify.internal.status, "sent");
      assert.equal(notify.confirmation.status, "sent");
      assert.equal(sent.length, 2);
      assert.equal(sent[0]!.to, "ops@example.com");
      assert.equal(sent[0]!.kind, "houzzatpro_demo_internal");
      assert.equal(sent[1]!.to, "alex@brokerage.test");
      assert.equal(sent[1]!.kind, "houzzatpro_demo_confirmation");
      assert.equal(sent[1]!.replyTo, "ops@example.com");
      assert.match(sent[0]!.subject, /Alex Rivera/);
      assert.match(sent[0]!.html, /View Prospect in Master Admin/);
      assert.match(
        sent[0]!.html,
        new RegExp(`/platform/prospects/${intake.prospectId}`),
      );
      assert.ok(!sent[0]!.html.includes("SECRET"));
      assert.ok(!/notesInternal|ownerOperator|tokenHash|CRM|Stripe/i.test(sent[0]!.html));
      assert.ok(!/notesInternal|phone|416555|Looking for TEAM/i.test(sent[1]!.html));
      assert.ok(sent[0]!.html.includes("HouzzatPRO"));
      assert.ok(!sent[0]!.html.includes("tenant"));
      assert.ok(!sent[1]!.html.includes("brandLogoUrl"));
      console.log("[1] Persist + internal/confirmation recipients... PASS");
    }

    // 2. Email failure does not fail intake / no rollback
    {
      const state = emptyState();
      const intake = await receiveWebsiteDemoRequest({
        fullName: "Casey Ng",
        email: "casey@fail.test",
        phone: "4165559999",
        brokerageName: "Ng Group",
        teamSize: 2,
        prisma: createFakePrisma(state) as never,
      });
      assert.equal(state.prospects.size, 1);
      const notify = await notifyBookDemoEmails({
        prospectId: intake.prospectId,
        activityId: intake.activityId,
        fields: intake.emailPayload!,
        prisma: createFakePrisma(state) as never,
        send: async () =>
          ({ ok: false, status: "failed", error: "boom" }) satisfies SendEmailResult,
      });
      assert.equal(notify.internal.status, "failed");
      assert.equal(notify.confirmation.status, "failed");
      assert.equal(state.prospects.size, 1);
      assert.equal(state.prospects.get(intake.prospectId)!.email, "casey@fail.test");
      const emailAudits = state.audits.filter((a) =>
        a.action.startsWith("DEMO_"),
      );
      assert.equal(emailAudits.length, 2);
      assert.ok(emailAudits.every((a) => a.metadata?.status === "failed"));
      console.log("[2] Email failure keeps prospect... PASS");
    }

    // 3. Idempotency — same activityId does not re-send
    {
      const state = emptyState();
      const intake = await receiveWebsiteDemoRequest({
        fullName: "Dana Cho",
        email: "dana@once.test",
        phone: "4165551111",
        brokerageName: "Cho Co",
        teamSize: 3,
        prisma: createFakePrisma(state) as never,
      });
      let sends = 0;
      const send = async () => {
        sends += 1;
        return { ok: true, status: "sent" as const, providerId: "x" };
      };
      const db = createFakePrisma(state) as never;
      await notifyBookDemoEmails({
        prospectId: intake.prospectId,
        activityId: intake.activityId,
        fields: intake.emailPayload!,
        prisma: db,
        send,
      });
      await notifyBookDemoEmails({
        prospectId: intake.prospectId,
        activityId: intake.activityId,
        fields: intake.emailPayload!,
        prisma: db,
        send,
      });
      assert.equal(sends, 2); // one internal + one confirmation on first call only
      const internal = state.audits.filter(
        (a) => a.action === BOOK_DEMO_EMAIL_AUDIT.INTERNAL_ATTEMPTED,
      );
      const confirm = state.audits.filter(
        (a) => a.action === BOOK_DEMO_EMAIL_AUDIT.CONFIRMATION_ATTEMPTED,
      );
      assert.equal(internal.length, 1);
      assert.equal(confirm.length, 1);
      console.log("[3] Retry same activityId is idempotent... PASS");
    }

    // 4. Duplicate email updates same prospect; new activity gets new emails
    {
      const state = emptyState();
      const db = createFakePrisma(state) as never;
      const first = await receiveWebsiteDemoRequest({
        fullName: "Evan Park",
        email: "evan@dup.test",
        phone: "4165552222",
        brokerageName: "Park Inc",
        teamSize: 4,
        prisma: db,
      });
      const second = await receiveWebsiteDemoRequest({
        fullName: "Evan Park",
        email: "evan@dup.test",
        phone: "4165552222",
        brokerageName: "Park Inc",
        teamSize: 5,
        prisma: db,
      });
      assert.equal(state.prospects.size, 1);
      assert.equal(first.prospectId, second.prospectId);
      assert.notEqual(first.activityId, second.activityId);
      assert.equal(second.outcome, "updated");

      let sends = 0;
      await notifyBookDemoEmails({
        prospectId: second.prospectId,
        activityId: second.activityId,
        fields: second.emailPayload!,
        prisma: db,
        send: async () => {
          sends += 1;
          return { ok: true, status: "sent", providerId: "y" };
        },
      });
      assert.equal(sends, 2);
      console.log("[4] Duplicate prospect update + new intake emails... PASS");
    }

    // 5. Honeypot — no email payload
    {
      const state = emptyState();
      const result = await receiveWebsiteDemoRequest({
        fullName: "Bot",
        email: "bot@spam.test",
        phone: "4165550000",
        brokerageName: "Spam",
        teamSize: 1,
        faxNumber: "filled",
        prisma: createFakePrisma(state) as never,
      });
      assert.equal(result.outcome, "honeypot");
      assert.equal(result.emailPayload, null);
      assert.equal(state.prospects.size, 0);
      console.log("[5] Honeypot skips email payload... PASS");
    }

    // 6. Templates privacy + Master Admin CTA + branding
    {
      const internal = renderBookDemoInternalNotificationEmail({
        prospectId: "pros_abc",
        fields: {
          contactName: "Sam Lee",
          email: "sam@lee.test",
          phone: "4165553333",
          brokerageName: "Lee Realty",
          teamSize: 8,
          website: "https://lee.test",
          region: "Mississauga",
          message: "Interested in brokerage",
        },
      });
      assert.equal(
        buildMasterAdminProspectUrl("pros_abc"),
        "https://houzzatpro.com/platform/prospects/pros_abc",
      );
      assert.ok(internal.html.includes("https://houzzatpro.com/platform/prospects/pros_abc"));
      assert.ok(internal.html.includes("HouzzatPRO"));
      assert.ok(internal.html.includes("Website Demo Request"));
      assert.ok(!internal.html.includes("notesInternal"));
      assert.ok(!/tax included|plus HST/i.test(internal.html));

      const confirm = renderBookDemoConfirmationEmail({ contactName: "Sam Lee" });
      assert.match(confirm.subject, /We received your HouzzatPRO demo request/);
      assert.ok(!/booked|calendar|assigned|within 24/i.test(confirm.text));
      assert.ok(confirm.html.includes("houzzatpro.com"));
      assert.ok(!confirm.html.includes("sam@lee.test"));
      assert.ok(!confirm.html.includes("416555"));
      console.log("[6] Template privacy + CTA + honest copy... PASS");
    }

    // 7. From identity + missing notification email skips internal only
    {
      const from = emailFromHouzzatPro();
      assert.ok(/HouzzatPRO|notify@/i.test(from));
      const prev = process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
      delete process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
      const state = emptyState();
      const intake = await receiveWebsiteDemoRequest({
        fullName: "Fran Wu",
        email: "fran@skip.test",
        phone: "4165554444",
        brokerageName: "Wu Co",
        teamSize: 1,
        prisma: createFakePrisma(state) as never,
      });
      const sent: string[] = [];
      const notify = await notifyBookDemoEmails({
        prospectId: intake.prospectId,
        activityId: intake.activityId,
        fields: intake.emailPayload!,
        prisma: createFakePrisma(state) as never,
        send: async (input) => {
          sent.push(input.to);
          return { ok: true, status: "sent", providerId: "z" };
        },
      });
      assert.equal(notify.internal.status, "skipped");
      assert.equal(notify.internal.reason, "missing_notification_email");
      assert.equal(notify.confirmation.status, "sent");
      assert.deepEqual(sent, ["fran@skip.test"]);
      process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = prev;
      console.log("[7] From identity + missing internal recipient... PASS");
    }

    // 8. Isolation + secrets + source guards
    {
      const route = read("src/app/api/platform/public/book-demo/route.ts");
      const emails = read("src/lib/platform/public/book-demo-emails.ts");
      const templates = read(
        "src/lib/platform/public/book-demo-email-templates.ts",
      );
      const form = read("src/components/platform/public/BookDemoForm.tsx");
      assert.ok(route.includes("notifyBookDemoEmails"));
      assert.ok(route.includes("outcome !== \"honeypot\""));
      assert.ok(!route.includes("RESEND_API_KEY"));
      assert.ok(!form.includes("RESEND_API_KEY"));
      assert.ok(!form.includes("HOUZZATPRO_DEMO_NOTIFICATION_EMAIL"));
      assert.ok(emails.includes("DEMO_INTERNAL_EMAIL_ATTEMPTED"));
      assert.ok(emails.includes("DEMO_CONFIRMATION_EMAIL_ATTEMPTED"));
      assert.ok(!emails.includes("$transaction"));
      assert.ok(!templates.includes("brandLogoUrl"));
      assert.ok(!/\$transaction/.test(emails));
      assert.ok(!/\.updateMany\s*\(/.test(emails));

      for (const file of listTsFiles("src/lib/platform/public")) {
        const src = read(file);
        assert.ok(!/from ["']stripe["']/.test(src), file);
        assert.ok(!/createCheckoutSession/.test(src), file);
      }
      console.log("[8] Isolation + no client secrets... PASS");
    }

    // 9. Audit metadata has no message bodies / secrets
    {
      const state = emptyState();
      const intake = await receiveWebsiteDemoRequest({
        fullName: "Gina",
        email: "gina@meta.test",
        phone: "4165555555",
        brokerageName: "Gina Co",
        teamSize: 2,
        message: "PRIVATE_MESSAGE_BODY",
        prisma: createFakePrisma(state) as never,
      });
      await notifyBookDemoEmails({
        prospectId: intake.prospectId,
        activityId: intake.activityId,
        fields: intake.emailPayload!,
        prisma: createFakePrisma(state) as never,
        send: async () => ({ ok: true, status: "sent", providerId: "m" }),
      });
      const dump = JSON.stringify(state.audits);
      assert.ok(!dump.includes("PRIVATE_MESSAGE_BODY"));
      assert.ok(!dump.includes("RESEND"));
      assert.ok(!dump.includes("re_"));
      console.log("[9] Audit metadata stays safe... PASS");
    }
  } finally {
    if (prevNotify === undefined) {
      delete process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
    } else {
      process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = prevNotify;
    }
  }

  console.log("\nSTAGE 6.6C selftest: ALL PASS\n");
  console.log(
    "NOTE: Concurrent duplicate attempts for the same activityId can still race",
  );
  console.log(
    "before PlatformAuditEvent findFirst without a unique delivery table.\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
