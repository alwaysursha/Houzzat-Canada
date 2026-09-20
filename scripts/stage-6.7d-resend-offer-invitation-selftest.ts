/**
 * Stage 6.7D — Safe resend of a commercial-offer invitation (token rotation).
 * Run: node --import tsx scripts/stage-6.7d-resend-offer-invitation-selftest.ts
 *
 * No production writes. No real Resend sends.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SendEmailResult } from "../src/lib/email/send";
import {
  CommercialOfferActionError,
  COMMERCIAL_OFFER_AUDIT,
  createDraftCommercialOffer,
  hashCommercialOfferToken,
  notifyOfferInvitationEmail,
  OFFER_INVITATION_CTA_LABEL,
  OFFER_INVITATION_SUBJECT,
  resendCommercialOfferInvitation,
  resolvePrivateOfferByRawToken,
  sendCommercialOffer,
} from "../src/lib/platform/offers";

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
  businessName: string | null;
  brokerageName: string | null;
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
  viewedAt: Date | null;
  acceptedAt: Date | null;
  workspaceId: string | null;
};

type FakeLine = {
  id: string;
  offerId: string;
  kind: string;
  code: string;
  description: string;
  amountCents: number;
  isRecurring: boolean;
  quantity: number;
  sortOrder: number;
};

type FakeToken = {
  id: string;
  offerId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastViewedAt: Date | null;
  createdAt: Date;
};

type FakeState = {
  prospects: Map<string, FakeProspect>;
  offers: Map<string, FakeOffer>;
  lines: FakeLine[];
  tokens: FakeToken[];
  acceptances: Map<string, { id: string }>;
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
  ops: string[];
  onTokenCreate: ((row: FakeToken) => void) | null;
  nextId: number;
};

type SentMail = {
  to: string;
  kind: string;
  subject: string;
  html: string;
  text: string;
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
          body: string;
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
        data: Omit<FakeOffer, "id" | "sentAt" | "viewedAt" | "acceptedAt" | "workspaceId">;
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
          viewedAt: null,
          acceptedAt: null,
          workspaceId: null,
        };
        state.offers.set(offer.id, offer);
        return offer;
      },
      async findUnique({
        where,
        include,
      }: {
        where: { id: string };
        include?: unknown;
        select?: unknown;
      }) {
        const offer = state.offers.get(where.id);
        if (!offer) return null;
        void include;
        return {
          ...offer,
          lineItems: state.lines
            .filter((l) => l.offerId === offer.id)
            .sort((a, b) => a.sortOrder - b.sortOrder),
          tokens: state.tokens
            .filter((t) => t.offerId === offer.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          acceptance: state.acceptances.get(offer.id) ?? null,
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
        data: Omit<FakeLine, "id">;
      }) {
        const row: FakeLine = {
          id: id("li"),
          offerId: data.offerId,
          kind: data.kind,
          code: data.code,
          description: data.description,
          amountCents: data.amountCents,
          isRecurring: data.isRecurring,
          quantity: data.quantity ?? 1,
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
        const row: FakeToken = {
          id: id("tok"),
          offerId: data.offerId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          lastViewedAt: null,
          createdAt: new Date(),
        };
        state.tokens.push(row);
        state.ops.push(`persist:${row.id}`);
        state.onTokenCreate?.(row);
        return row;
      },
      async findUnique({
        where,
        include,
      }: {
        where: { tokenHash?: string; id?: string };
        include?: {
          offer?: { include?: unknown };
        };
      }) {
        const token = state.tokens.find((t) =>
          where.tokenHash
            ? t.tokenHash === where.tokenHash
            : t.id === where.id,
        );
        if (!token) return null;
        if (!include?.offer) return token;
        const offer = state.offers.get(token.offerId);
        if (!offer) return { ...token, offer: null };
        const prospect = state.prospects.get(offer.prospectId)!;
        return {
          ...token,
          offer: {
            ...offer,
            lineItems: state.lines
              .filter((l) => l.offerId === offer.id)
              .sort((a, b) => a.sortOrder - b.sortOrder),
            acceptance: state.acceptances.get(offer.id) ?? null,
            subscription: null,
            prospect: {
              contactName: prospect.contactName,
              businessName: prospect.businessName,
              brokerageName: prospect.brokerageName,
            },
          },
        };
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
      async findMany({
        where,
      }: {
        where: { offerId: string; revokedAt?: null };
        select?: unknown;
      }) {
        return state.tokens
          .filter((t) => {
            if (t.offerId !== where.offerId) return false;
            if (where.revokedAt === null && t.revokedAt !== null) return false;
            return true;
          })
          .map((t) => ({ id: t.id }));
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { revokedAt?: Date; lastViewedAt?: Date };
      }) {
        const tok = state.tokens.find((t) => t.id === where.id);
        if (!tok) throw new Error("missing token");
        if (data.revokedAt) {
          tok.revokedAt = data.revokedAt;
          state.ops.push(`revoke:${tok.id}`);
        }
        if (data.lastViewedAt) tok.lastViewedAt = data.lastViewedAt;
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
          businessName: null,
          brokerageName: null,
        },
      ],
    ]),
    offers: new Map(),
    lines: [],
    tokens: [],
    acceptances: new Map(),
    activities: [],
    audits: [],
    ops: [],
    onTokenCreate: null,
    nextId: 1,
  };
}

function sentCollector(sent: SentMail[]) {
  return async (input: {
    to: string;
    rendered: { kind: string; subject: string; html: string; text: string };
  }): Promise<SendEmailResult> => {
    sent.push({
      to: input.to,
      kind: input.rendered.kind,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
    });
    return { ok: true, status: "sent", providerId: "msg_offer" };
  };
}

function extractRaw(privateUrl: string) {
  return privateUrl.replace("https://houzzatpro.com/subscribe/", "");
}

function assertNoSecrets(dump: string, urls: Array<string | null | undefined>) {
  for (const url of urls) {
    if (!url) continue;
    assert.ok(!dump.includes(url), "audit leaked private URL");
    const raw = extractRaw(url);
    assert.ok(!dump.includes(raw), "audit leaked raw token");
    assert.ok(
      !dump.includes(hashCommercialOfferToken(raw)),
      "audit leaked token hash",
    );
  }
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
  console.log("\n=== STAGE 6.7D — RESEND OFFER INVITATION ===\n");

  const prevNotify = process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
  process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = "ops@example.com";

  try {
    {
      const state = emptyState();
      const sentMail: SentMail[] = [];
      const first = await draftAndSend(state);
      assert.equal(first.outcome, "sent");
      const oldRaw = extractRaw(first.privateUrl!);
      const db = createFakePrisma(state) as never;
      const resent = await resendCommercialOfferInvitation({
        offerId: first.offerId,
        operatorId: "op1",
        prisma: db,
      });
      assert.equal(resent.outcome, "resent");
      assert.equal(resent.status, "SENT");
      assert.ok(resent.privateUrl);
      assert.notEqual(resent.privateUrl, first.privateUrl);
      assert.equal(resent.revokedCount, 1);
      const offer = state.offers.get(first.offerId)!;
      assert.equal(offer.status, "SENT");
      const newTok = state.tokens.find((t) => t.id === resent.newTokenId)!;
      const oldTok = state.tokens.find(
        (t) => t.tokenHash === hashCommercialOfferToken(oldRaw),
      )!;
      assert.ok(oldTok.revokedAt);
      assert.equal(newTok.revokedAt, null);
      assert.equal(newTok.expiresAt.getTime(), offer.expiresAt!.getTime());
      const persistIdx = state.ops.indexOf(`persist:${resent.newTokenId}`);
      const revokeIdx = state.ops.indexOf(`revoke:${oldTok.id}`);
      assert.ok(persistIdx >= 0 && revokeIdx >= 0);
      assert.ok(
        persistIdx < revokeIdx,
        "replacement token must persist before old revocation",
      );

      const notify = await notifyOfferInvitationEmail({
        offerId: resent.offerId,
        privateUrl: resent.privateUrl,
        commercialOfferTokenId: resent.newTokenId,
        prisma: db,
        send: sentCollector(sentMail),
      });
      assert.equal(notify.status, "sent");
      assert.equal(sentMail.length, 1);
      assert.equal(sentMail[0]!.subject, OFFER_INVITATION_SUBJECT);
      assert.ok(sentMail[0]!.html.includes(OFFER_INVITATION_CTA_LABEL));
      assert.ok(sentMail[0]!.html.includes(resent.privateUrl));
      assert.ok(!/rotat|resend|invalidat|previous link/i.test(sentMail[0]!.html));
      assert.ok(!/rotat|resend|invalidat|previous link/i.test(sentMail[0]!.text));

      const oldResolve = await resolvePrivateOfferByRawToken({
        rawToken: oldRaw,
        prisma: db,
      });
      assert.equal(oldResolve.ok, false);
      const newResolve = await resolvePrivateOfferByRawToken({
        rawToken: extractRaw(resent.privateUrl),
        prisma: db,
      });
      assert.equal(newResolve.ok, true);
      if (newResolve.ok) assert.equal(newResolve.kind, "proposal");

      const rotation = state.audits.find(
        (a) => a.action === COMMERCIAL_OFFER_AUDIT.INVITATION_RESENT,
      );
      assert.ok(rotation);
      assert.equal(rotation!.metadata?.newTokenId, resent.newTokenId);
      assert.equal(rotation!.metadata?.revokedCount, 1);
      assert.equal(rotation!.metadata?.prospectId, "p1");
      assertNoSecrets(JSON.stringify(state.audits), [
        first.privateUrl,
        resent.privateUrl,
      ]);
      console.log("[1] SENT → rotation + email; old link dead; new link works... PASS");
    }

    {
      const state = emptyState();
      const sentMail: SentMail[] = [];
      const first = await draftAndSend(state);
      const db = createFakePrisma(state) as never;
      const viewed = await resolvePrivateOfferByRawToken({
        rawToken: extractRaw(first.privateUrl!),
        prisma: db,
      });
      assert.equal(viewed.ok, true);
      assert.equal(state.offers.get(first.offerId)!.status, "VIEWED");
      const resent = await resendCommercialOfferInvitation({
        offerId: first.offerId,
        operatorId: "op1",
        prisma: db,
      });
      assert.equal(resent.status, "VIEWED");
      assert.equal(state.offers.get(first.offerId)!.status, "VIEWED");
      const notify = await notifyOfferInvitationEmail({
        offerId: resent.offerId,
        privateUrl: resent.privateUrl,
        commercialOfferTokenId: resent.newTokenId,
        prisma: db,
        send: sentCollector(sentMail),
      });
      assert.equal(notify.status, "sent");
      assert.equal(sentMail.length, 1);
      assert.equal(state.offers.get(first.offerId)!.status, "VIEWED");
      const after = await resolvePrivateOfferByRawToken({
        rawToken: extractRaw(resent.privateUrl),
        prisma: db,
      });
      assert.equal(after.ok, true);
      assert.equal(state.offers.get(first.offerId)!.status, "VIEWED");
      console.log("[2] VIEWED → rotation + email; status remains VIEWED... PASS");
    }

    {
      const state = emptyState();
      const first = await draftAndSend(state);
      const db = createFakePrisma(state) as never;
      state.offers.get(first.offerId)!.status = "ACCEPTED";
      state.acceptances.set(first.offerId, { id: "acc_1" });
      const before = state.tokens.map((t) => ({
        id: t.id,
        revokedAt: t.revokedAt,
      }));
      await assert.rejects(
        () =>
          resendCommercialOfferInvitation({
            offerId: first.offerId,
            operatorId: "op1",
            prisma: db,
          }),
        (error: unknown) =>
          error instanceof CommercialOfferActionError &&
          error.code === "OFFER_NOT_RESENDABLE" &&
          error.status === 409,
      );
      assert.equal(state.tokens.length, before.length);
      for (const row of before) {
        const tok = state.tokens.find((t) => t.id === row.id)!;
        assert.equal(tok.revokedAt, row.revokedAt);
      }
      console.log("[3] ACCEPTED cannot rotate... PASS");
    }

    {
      const state = emptyState();
      const first = await draftAndSend(state);
      const db = createFakePrisma(state) as never;
      state.offers.get(first.offerId)!.expiresAt = new Date(Date.now() - 1000);
      await assert.rejects(
        () =>
          resendCommercialOfferInvitation({
            offerId: first.offerId,
            operatorId: "op1",
            prisma: db,
          }),
        (error: unknown) =>
          error instanceof CommercialOfferActionError &&
          error.code === "INVALID_EXPIRY",
      );
      state.offers.get(first.offerId)!.expiresAt = EXPIRES_AT;
      state.offers.get(first.offerId)!.status = "EXPIRED";
      await assert.rejects(
        () =>
          resendCommercialOfferInvitation({
            offerId: first.offerId,
            operatorId: "op1",
            prisma: db,
          }),
        (error: unknown) =>
          error instanceof CommercialOfferActionError &&
          error.code === "OFFER_NOT_RESENDABLE",
      );
      const created = await createDraftCommercialOffer({
        prospectId: "p1",
        operatorId: "op1",
        terms: {
          planCode: "SOLO",
          billingCadence: "MONTHLY",
          expiresAt: EXPIRES_AT,
        },
        prisma: db,
      });
      await assert.rejects(
        () =>
          resendCommercialOfferInvitation({
            offerId: created.offerId,
            operatorId: "op1",
            prisma: db,
          }),
        (error: unknown) =>
          error instanceof CommercialOfferActionError &&
          error.code === "OFFER_NOT_RESENDABLE",
      );
      console.log("[4] expired / DRAFT cannot rotate... PASS");
    }

    {
      const state = emptyState();
      const first = await draftAndSend(state);
      const db = createFakePrisma(state) as never;
      const original = state.tokens.filter((t) => !t.revokedAt);
      assert.equal(original.length, 1);
      state.onTokenCreate = (row) => {
        state.offers.get(first.offerId)!.status = "ACCEPTED";
        state.acceptances.set(first.offerId, { id: "acc_race" });
        assert.equal(row.revokedAt, null);
        assert.equal(original[0]!.revokedAt, null);
      };
      await assert.rejects(
        () =>
          resendCommercialOfferInvitation({
            offerId: first.offerId,
            operatorId: "op1",
            prisma: db,
          }),
        (error: unknown) =>
          error instanceof CommercialOfferActionError &&
          error.code === "OFFER_NOT_RESENDABLE",
      );
      const createdAfter = state.tokens.filter(
        (t) => t.id !== original[0]!.id,
      );
      assert.equal(createdAfter.length, 1);
      assert.ok(createdAfter[0]!.revokedAt);
      assert.equal(original[0]!.revokedAt, null);
      const abort = state.audits.find(
        (a) => a.action === COMMERCIAL_OFFER_AUDIT.INVITATION_RESEND_ABORTED,
      );
      assert.ok(abort);
      assert.equal(abort!.metadata?.reason, "accepted_during_rotation");
      assert.equal(abort!.metadata?.newTokenId, createdAfter[0]!.id);
      assertNoSecrets(JSON.stringify(state.audits), [first.privateUrl]);
      console.log("[5] acceptance after mint revokes only the new token... PASS");
    }

    {
      const state = emptyState();
      const first = await draftAndSend(state);
      const db = createFakePrisma(state) as never;
      const resent = await resendCommercialOfferInvitation({
        offerId: first.offerId,
        operatorId: "op1",
        prisma: db,
      });
      const notify = await notifyOfferInvitationEmail({
        offerId: resent.offerId,
        privateUrl: resent.privateUrl,
        commercialOfferTokenId: resent.newTokenId,
        prisma: db,
        send: async () =>
          ({ ok: false, status: "failed", error: "boom" }) satisfies SendEmailResult,
      });
      assert.equal(notify.status, "failed");
      const newTok = state.tokens.find((t) => t.id === resent.newTokenId)!;
      assert.equal(newTok.revokedAt, null);
      assert.ok(resent.privateUrl);
      const live = await resolvePrivateOfferByRawToken({
        rawToken: extractRaw(resent.privateUrl),
        prisma: db,
      });
      assert.equal(live.ok, true);
      assert.ok(
        !JSON.stringify(state.audits).includes("boom"),
      );
      assertNoSecrets(JSON.stringify(state.audits), [
        first.privateUrl,
        resent.privateUrl,
      ]);
      console.log("[6] email failure leaves new token usable + one-time URL... PASS");
    }

    {
      const state = emptyState();
      const sentMail: SentMail[] = [];
      const first = await draftAndSend(state);
      const db = createFakePrisma(state) as never;
      const resent1 = await resendCommercialOfferInvitation({
        offerId: first.offerId,
        operatorId: "op1",
        prisma: db,
      });
      await notifyOfferInvitationEmail({
        offerId: resent1.offerId,
        privateUrl: resent1.privateUrl,
        commercialOfferTokenId: resent1.newTokenId,
        prisma: db,
        send: sentCollector(sentMail),
      });
      const resent2 = await resendCommercialOfferInvitation({
        offerId: first.offerId,
        operatorId: "op1",
        prisma: db,
      });
      await notifyOfferInvitationEmail({
        offerId: resent2.offerId,
        privateUrl: resent2.privateUrl,
        commercialOfferTokenId: resent2.newTokenId,
        prisma: db,
        send: sentCollector(sentMail),
      });
      assert.notEqual(resent2.privateUrl, resent1.privateUrl);
      assert.equal(sentMail.length, 2);
      const active = state.tokens.filter((t) => !t.revokedAt);
      assert.equal(active.length, 1);
      assert.equal(active[0]!.id, resent2.newTokenId);
      const dead1 = await resolvePrivateOfferByRawToken({
        rawToken: extractRaw(resent1.privateUrl),
        prisma: db,
      });
      const live2 = await resolvePrivateOfferByRawToken({
        rawToken: extractRaw(resent2.privateUrl),
        prisma: db,
      });
      assert.equal(dead1.ok, false);
      assert.equal(live2.ok, true);
      const again = await sendCommercialOffer({
        offerId: first.offerId,
        operatorId: "op1",
        prisma: db,
      });
      assert.equal(again.outcome, "already_sent");
      assert.equal(again.privateUrl, null);
      console.log("[7] second resend rotates again; first Send Offer unchanged... PASS");
    }

    {
      const resendLib = read("src/lib/platform/offers/resend-invitation.ts");
      const sendRoute = read(
        "src/app/api/platform/v1/offers/[offerId]/send/route.ts",
      );
      const resendRoute = read(
        "src/app/api/platform/v1/offers/[offerId]/resend-invitation/route.ts",
      );
      const manage = read("src/lib/platform/offers/manage.ts");
      const emails = read("src/lib/platform/offers/offer-invitation-emails.ts");
      const actions = read("src/components/platform/PlatformOfferActions.tsx");
      const templates = read(
        "src/lib/platform/offers/offer-invitation-email-templates.ts",
      );

      assert.ok(!resendLib.includes("updateMany"));
      assert.ok(!resendLib.includes("$transaction"));
      assert.ok(resendLib.includes("accepted_during_rotation"));
      assert.ok(resendRoute.includes("resendCommercialOfferInvitation"));
      assert.ok(resendRoute.includes("commercialOfferTokenId"));
      assert.ok(!sendRoute.includes("resendCommercialOfferInvitation"));
      assert.ok(manage.includes('outcome: "already_sent"'));
      assert.ok(!manage.includes("resendCommercialOfferInvitation"));
      assert.ok(emails.includes("commercialOfferTokenId"));
      assert.ok(emails.includes("VIEWED"));
      assert.ok(!emails.includes("tokenHash"));
      assert.ok(!emails.includes("rawToken"));
      assert.ok(actions.includes("Resend Offer Email"));
      assert.ok(actions.includes("create a new secure offer link and invalidate"));
      assert.ok(actions.includes("Copy Secure Link"));
      assert.ok(actions.includes('status === "SENT" || status === "VIEWED"'));
      assert.ok(!actions.includes("ACCEPTED") || actions.includes("canResend"));
      assert.ok(templates.includes(OFFER_INVITATION_SUBJECT));
      assert.ok(templates.includes(OFFER_INVITATION_CTA_LABEL));
      assert.ok(
        stateAuditsNeverMentionedInTemplate(templates),
      );
      console.log("[8] route/UI isolation + no secret identifiers in email module... PASS");
    }
  } finally {
    if (prevNotify === undefined) {
      delete process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL;
    } else {
      process.env.HOUZZATPRO_DEMO_NOTIFICATION_EMAIL = prevNotify;
    }
  }

  console.log("\nSTAGE 6.7D SELFTEST PASSED\n");
}

function stateAuditsNeverMentionedInTemplate(templates: string) {
  return (
    !/token rotation/i.test(templates) &&
    !/resend/i.test(templates) &&
    templates.includes("Your HouzzatPRO Proposal is Ready")
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
