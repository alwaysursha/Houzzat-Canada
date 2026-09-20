/**
 * Stage 6.7C — Commercial offer invitation email selftest.
 * Run: node --import tsx scripts/stage-6.7c-offer-invitation-email-selftest.ts
 *
 * No production writes. No real Resend sends.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createDraftCommercialOffer,
  hashCommercialOfferToken,
  notifyOfferInvitationEmail,
  OFFER_INVITATION_CTA_LABEL,
  OFFER_INVITATION_EMAIL_AUDIT,
  OFFER_INVITATION_SUBJECT,
  renderOfferInvitationEmail,
  sendCommercialOffer,
} from "../src/lib/platform/offers";
import type { SendEmailResult } from "../src/lib/email/send";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const EXPIRES_AT = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

type FakeProspect = {
  id: string;
  status: string;
  email: string;
  contactName: string;
};

type FakeOffer = {
  id: string;
  prospectId: string;
  createdByOperatorId: string;
  status: string;
  planCode: string;
  billingCadence: string;
  currency: string;
  standardRecurringAmountCents: number;
  negotiatedRecurringAmountCents: number;
  setupFeeCents: number;
  includedSeats: number;
  additionalSeats: number;
  trialDays: number | null;
  proposedStartDate: Date | null;
  expiresAt: Date | null;
  version: number;
  sentAt: Date | null;
  workspaceId: string | null;
};

type FakeState = {
  prospects: Map<string, FakeProspect>;
  offers: Map<string, FakeOffer>;
  lines: Array<{ id: string; offerId: string; sortOrder: number }>;
  tokens: Array<{
    id: string;
    offerId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  }>;
  activities: Array<{
    id: string;
    prospectId: string;
    type: string;
    body: string | null;
  }>;
  audits: Array<{
    action: string;
    entityId: string;
    entityType?: string;
    metadata: Record<string, unknown> | null;
    summary?: string;
  }>;
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
      async findUnique({ where }: { where: { id: string }; select?: unknown }) {
        return state.prospects.get(where.id) ?? null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string };
      }) {
        const p = state.prospects.get(where.id);
        if (!p) throw new Error("missing prospect");
        p.status = data.status;
        return p;
      },
    },
    platformProspectActivity: {
      async findFirst({
        where,
      }: {
        where: {
          prospectId: string;
          type: string;
          body: { contains: string };
        };
      }) {
        return (
          state.activities.find(
            (a) =>
              a.prospectId === where.prospectId &&
              a.type === where.type &&
              (a.body ?? "").includes(where.body.contains),
          ) ?? null
        );
      },
      async create({
        data,
      }: {
        data: {
          prospectId: string;
          type: string;
          operatorId?: string;
          body: string;
          completedAt?: Date;
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
    commercialOffer: {
      async create({
        data,
      }: {
        data: Omit<FakeOffer, "id" | "sentAt" | "workspaceId">;
      }) {
        const offer: FakeOffer = {
          id: id("off"),
          prospectId: data.prospectId,
          createdByOperatorId: data.createdByOperatorId,
          status: data.status,
          planCode: data.planCode,
          billingCadence: data.billingCadence,
          currency: data.currency,
          standardRecurringAmountCents: data.standardRecurringAmountCents,
          negotiatedRecurringAmountCents: data.negotiatedRecurringAmountCents,
          setupFeeCents: data.setupFeeCents,
          includedSeats: data.includedSeats,
          additionalSeats: data.additionalSeats,
          trialDays: data.trialDays ?? null,
          proposedStartDate: data.proposedStartDate ?? null,
          expiresAt: data.expiresAt ?? null,
          version: data.version,
          sentAt: null,
          workspaceId: null,
        };
        state.offers.set(offer.id, offer);
        return offer;
      },
      async findUnique({ where }: { where: { id: string }; include?: unknown; select?: unknown }) {
        const offer = state.offers.get(where.id);
        if (!offer) return null;
        return {
          ...offer,
          lineItems: state.lines.filter((l) => l.offerId === offer.id),
          tokens: state.tokens
            .filter((t) => t.offerId === offer.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        };
      },
      async findFirst({
        where,
      }: {
        where: { id: string; status?: string };
        select?: unknown;
      }) {
        const offer = state.offers.get(where.id);
        if (!offer) return null;
        if (where.status && offer.status !== where.status) return null;
        return { id: offer.id };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const offer = state.offers.get(where.id);
        if (!offer) throw new Error("missing offer");
        Object.assign(offer, data);
        return offer;
      },
    },
    commercialOfferLineItem: {
      async findMany({ where }: { where: { offerId: string } }) {
        return state.lines
          .filter((l) => l.offerId === where.offerId)
          .map((l) => ({ id: l.id }));
      },
      async delete({ where }: { where: { id: string } }) {
        state.lines = state.lines.filter((l) => l.id !== where.id);
        return { id: where.id };
      },
      async create({
        data,
      }: {
        data: { offerId: string; sortOrder?: number };
      }) {
        const row = {
          id: id("li"),
          offerId: data.offerId,
          sortOrder: data.sortOrder ?? 0,
        };
        state.lines.push(row);
        return row;
      },
    },
    commercialOfferToken: {
      async create({
        data,
      }: {
        data: { offerId: string; tokenHash: string; expiresAt: Date };
      }) {
        const row = {
          id: id("tok"),
          offerId: data.offerId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        };
        state.tokens.push(row);
        return row;
      },
      async findFirst({
        where,
      }: {
        where: { offerId: string; tokenHash?: string };
      }) {
        return (
          state.tokens.find(
            (t) =>
              t.offerId === where.offerId &&
              (where.tokenHash ? t.tokenHash === where.tokenHash : true),
          ) ?? null
        );
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { revokedAt: Date };
      }) {
        const tok = state.tokens.find((t) => t.id === where.id);
        if (!tok) throw new Error("missing token");
        tok.revokedAt = data.revokedAt;
        return tok;
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
        };
        select?: unknown;
      }) {
        const hit = state.audits.find((a) => {
          if (where.entityType && a.entityType !== where.entityType) return false;
          if (where.entityId && a.entityId !== where.entityId) return false;
          if (where.action && a.action !== where.action) return false;
          return true;
        });
        return hit ? { id: "existing" } : null;
      },
      async create({
        data,
      }: {
        data: {
          action: string;
          entityId: string;
          entityType?: string;
          metadata?: unknown;
          summary?: string;
        };
      }) {
        const row = {
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
    prospects: new Map([
      [
        "p1",
        {
          id: "p1",
          status: "DEMO_COMPLETED",
          email: "maria.offer@example.com",
          contactName: "Maria Khalid",
        },
      ],
    ]),
    offers: new Map(),
    lines: [],
    tokens: [],
    activities: [],
    audits: [],
    nextId: 1,
  };
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
    return { ok: true, status: "sent", providerId: "msg_offer" };
  };
}

async function draftAndSend(state: FakeState) {
  const db = createFakePrisma(state) as never;
  const created = await createDraftCommercialOffer({
    prospectId: "p1",
    operatorId: "op1",
    terms: {
      planCode: "TEAM",
      billingCadence: "ANNUAL",
      expiresAt: EXPIRES_AT,
    },
    prisma: db,
  });
  const sent = await sendCommercialOffer({
    offerId: created.offerId,
    operatorId: "op1",
    prisma: db,
  });
  return sent;
}

async function main() {
  console.log("\n=== STAGE 6.7C — OFFER INVITATION EMAIL ===\n");

  const prevNotify = process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
  process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = "ops@example.com";

  try {
    {
      const url = "https://houzzatpro.com/subscribe/test-token-value-aaaaaaaa";
      const rendered = renderOfferInvitationEmail({
        contactName: "Maria Khalid",
        offerUrl: url,
        expiresAt: EXPIRES_AT,
      });
      assert.equal(rendered.subject, OFFER_INVITATION_SUBJECT);
      assert.equal(rendered.kind, "houzzatpro_offer_invitation");
      assert.match(rendered.text, /Hi Maria Khalid,/);
      assert.ok(rendered.html.includes("Your personalized"));
      assert.ok(rendered.html.includes(OFFER_INVITATION_CTA_LABEL));
      assert.ok(rendered.html.includes(url));
      assert.ok(rendered.text.includes(`Review Your Offer: ${url}`));
      assert.ok(
        rendered.html.includes("This is your private offer link. Please do not share it with others."),
      );
      assert.ok(rendered.html.includes("#07111f"));
      assert.ok(rendered.html.includes("HouzzatPRO"));
      assert.ok(!/599,?000|planCode|TEAM/.test(rendered.html));
      console.log("[1] Invitation template + HouzzatPRO branding... PASS");
    }

    {
      const state = emptyState();
      const sent: SentMail[] = [];
      const first = await draftAndSend(state);
      assert.equal(first.outcome, "sent");
      assert.ok(first.privateUrl);
      assert.equal(state.offers.get(first.offerId)!.status, "SENT");

      const notify = await notifyOfferInvitationEmail({
        offerId: first.offerId,
        privateUrl: first.privateUrl,
        prisma: createFakePrisma(state) as never,
        send: sentCollector(sent),
      });
      assert.equal(notify.status, "sent");
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.to, "maria.offer@example.com");
      assert.equal(sent[0]!.subject, OFFER_INVITATION_SUBJECT);
      assert.ok(sent[0]!.html.includes(first.privateUrl));
      assert.equal(sent[0]!.kind, "houzzatpro_offer_invitation");
      assert.equal(sent[0]!.replyTo, "ops@example.com");
      assert.equal(state.offers.get(first.offerId)!.status, "SENT");

      const emailAudits = state.audits.filter(
        (a) => a.action === OFFER_INVITATION_EMAIL_AUDIT.ATTEMPTED,
      );
      assert.equal(emailAudits.length, 1);
      assert.equal(emailAudits[0]!.metadata?.status, "sent");
      assert.equal(emailAudits[0]!.metadata?.offerId, first.offerId);
      assert.equal(emailAudits[0]!.metadata?.prospectId, "p1");
      const dump = JSON.stringify(state.audits);
      assert.ok(!dump.includes(first.privateUrl));
      const rawToken = first.privateUrl.replace(
        "https://houzzatpro.com/subscribe/",
        "",
      );
      assert.ok(!dump.includes(rawToken));
      const tokenHash = hashCommercialOfferToken(rawToken);
      assert.ok(!dump.includes(tokenHash));
      console.log("[2] DRAFT → SENT → invitation emailed... PASS");
    }

    {
      const state = emptyState();
      const sent: SentMail[] = [];
      const first = await draftAndSend(state);
      await notifyOfferInvitationEmail({
        offerId: first.offerId,
        privateUrl: first.privateUrl!,
        prisma: createFakePrisma(state) as never,
        send: sentCollector(sent),
      });
      const again = await sendCommercialOffer({
        offerId: first.offerId,
        operatorId: "op1",
        prisma: createFakePrisma(state) as never,
      });
      assert.equal(again.outcome, "already_sent");
      assert.equal(again.privateUrl, null);
      assert.equal(state.tokens.filter((t) => !t.revokedAt).length, 1);
      if (again.outcome === "sent" && again.privateUrl) {
        await notifyOfferInvitationEmail({
          offerId: again.offerId,
          privateUrl: again.privateUrl,
          prisma: createFakePrisma(state) as never,
          send: sentCollector(sent),
        });
      }
      assert.equal(sent.length, 1);
      console.log("[3] already_sent does not send another email... PASS");
    }

    {
      const state = emptyState();
      const first = await draftAndSend(state);
      const notify = await notifyOfferInvitationEmail({
        offerId: first.offerId,
        privateUrl: first.privateUrl!,
        prisma: createFakePrisma(state) as never,
        send: async () =>
          ({ ok: false, status: "failed", error: "boom" }) satisfies SendEmailResult,
      });
      assert.equal(notify.status, "failed");
      assert.equal(notify.reason, "provider_error");
      assert.equal(state.offers.get(first.offerId)!.status, "SENT");
      assert.equal(first.outcome, "sent");
      const failAudit = state.audits.find(
        (a) => a.action === OFFER_INVITATION_EMAIL_AUDIT.ATTEMPTED,
      );
      assert.equal(failAudit?.metadata?.status, "failed");
      const dump = JSON.stringify(state.audits);
      assert.ok(!dump.includes("boom"));
      assert.ok(!dump.includes(first.privateUrl!));
      console.log("[4] Email failure leaves offer SENT... PASS");
    }

    {
      const sendRoute = read(
        "src/app/api/platform/v1/offers/[offerId]/send/route.ts",
      );
      const manage = read("src/lib/platform/offers/manage.ts");
      const actions = read("src/components/platform/PlatformOfferActions.tsx");
      const accept = read("src/lib/platform/offers/accept.ts");
      const privateOffer = read("src/lib/platform/offers/private-offer.ts");
      const subscribePage = read(
        "src/app/(marketing)/subscribe/[token]/page.tsx",
      );
      const emails = read(
        "src/lib/platform/offers/offer-invitation-emails.ts",
      );

      assert.ok(sendRoute.includes("notifyOfferInvitationEmail"));
      assert.ok(sendRoute.includes('result.outcome === "sent"'));
      assert.ok(sendRoute.includes("try {"));
      assert.ok(!sendRoute.includes("resendCommercialOfferInvitation"));
      assert.ok(!manage.includes("notifyOfferInvitationEmail"));
      assert.ok(!actions.includes("No email is sent in this stage"));
      assert.ok(actions.includes("email the secure proposal"));
      assert.ok(!accept.includes("notifyOfferInvitationEmail"));
      assert.ok(!privateOffer.includes("notifyOfferInvitationEmail"));
      assert.ok(!subscribePage.includes("notifyOfferInvitationEmail"));
      assert.ok(emails.includes("Never persist"));
      assert.ok(!emails.includes("console.info"));
      assert.ok(
        !/metadata:[^}]*privateUrl/.test(emails) &&
          !emails.includes("tokenHash") &&
          !emails.includes("rawToken"),
      );
      console.log("[5] Route/UI isolation + subscribe unchanged... PASS");
    }
  } finally {
    if (prevNotify === undefined) {
      delete process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
    } else {
      process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = prevNotify;
    }
  }

  console.log("\nSTAGE 6.7C SELFTEST PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
