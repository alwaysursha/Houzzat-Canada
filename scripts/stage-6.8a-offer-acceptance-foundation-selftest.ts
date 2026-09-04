/**
 * Stage 6.8A — private offer acceptance foundation selftest.
 * Run: node --import tsx scripts/stage-6.8a-offer-acceptance-foundation-selftest.ts
 *
 * No production writes. No Stripe. No real emails.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOUZZATPRO_PRIVACY_VERSION,
  HOUZZATPRO_TERMS_VERSION,
} from "../src/lib/platform/legal/versions";
import {
  acceptPrivateOfferByRawToken,
  commercialTermsHashFromOfferRow,
  computeCommercialTermsHash,
  createCommercialOfferRawToken,
  hashCommercialOfferToken,
  OfferAcceptPublicError,
  resolvePrivateOfferByRawToken,
} from "../src/lib/platform/offers";
import { COMMERCIAL_OFFER_AUDIT } from "../src/lib/platform/offers/constants";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

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

type FakeState = {
  prospects: Map<
    string,
    {
      id: string;
      email: string;
      contactName: string;
      businessName: string | null;
      brokerageName: string | null;
      status: string;
    }
  >;
  offers: Map<string, Record<string, unknown>>;
  lines: FakeLine[];
  tokens: Array<{
    id: string;
    offerId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    lastViewedAt: Date | null;
  }>;
  acceptances: Map<string, Record<string, unknown>>;
  activities: Array<{ prospectId: string; type: string; body: string | null }>;
  audits: Array<{ action: string; entityId: string; metadata: unknown }>;
  workspaces: number;
  subscriptions: number;
  nextId: number;
};

function emptyState(): FakeState {
  return {
    prospects: new Map(),
    offers: new Map(),
    lines: [],
    tokens: [],
    acceptances: new Map(),
    activities: [],
    audits: [],
    workspaces: 0,
    subscriptions: 0,
    nextId: 1,
  };
}

function seedOffer(state: FakeState, status = "VIEWED") {
  const prospectId = `pros_${state.nextId++}`;
  const offerId = `off_${state.nextId++}`;
  const raw = createCommercialOfferRawToken();
  state.prospects.set(prospectId, {
    id: prospectId,
    email: "alex@brokerage.test",
    contactName: "Alex Rivera",
    businessName: "Rivera Realty",
    brokerageName: "Rivera Brokerage",
    status: "OFFER_SENT",
  });
  state.offers.set(offerId, {
    id: offerId,
    prospectId,
    status,
    planCode: "TEAM",
    billingCadence: "ANNUAL",
    currency: "CAD",
    standardRecurringAmountCents: 599_000,
    negotiatedRecurringAmountCents: 549_000,
    setupFeeCents: 0,
    includedSeats: 4,
    additionalSeats: 1,
    trialDays: 14,
    proposedStartDate: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date(Date.now() + 7 * 86400000),
    version: 1,
    viewedAt: new Date(),
    acceptedAt: null,
    acceptedByEmail: null,
    acceptedSnapshotJson: null,
  });
  state.lines.push({
    id: `li_${state.nextId++}`,
    offerId,
    kind: "PLAN",
    code: "PLAN_BASE",
    description: "TEAM annual",
    amountCents: 549_000,
    isRecurring: true,
    quantity: 1,
    sortOrder: 0,
  });
  state.tokens.push({
    id: `tok_${state.nextId++}`,
    offerId,
    tokenHash: hashCommercialOfferToken(raw),
    expiresAt: new Date(Date.now() + 14 * 86400000),
    revokedAt: null,
    lastViewedAt: null,
  });
  return { raw, offerId, prospectId };
}

function createFakePrisma(state: FakeState) {
  const id = (p: string) => `${p}_${state.nextId++}`;
  const loadOffer = (offerId: string) => {
    const offer = state.offers.get(offerId);
    if (!offer) return null;
    return {
      ...offer,
      lineItems: state.lines
        .filter((l) => l.offerId === offerId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      prospect: state.prospects.get(String(offer.prospectId)),
      acceptance: state.acceptances.get(offerId)
        ? { ...state.acceptances.get(offerId) }
        : null,
    };
  };

  return {
    commercialOfferToken: {
      async findUnique({ where }: { where: { tokenHash: string }; include?: unknown }) {
        const token = state.tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!token) return null;
        return { ...token, offer: loadOffer(token.offerId) };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const tok = state.tokens.find((t) => t.id === where.id);
        if (!tok) throw new Error("missing token");
        Object.assign(tok, data);
        return tok;
      },
    },
    commercialOffer: {
      async findUnique({ where }: { where: { id: string }; select?: unknown; include?: unknown }) {
        return loadOffer(where.id);
      },
      async findFirst({
        where,
      }: {
        where: { id: string; status?: string | { in: string[] } };
        select?: unknown;
      }) {
        const offer = state.offers.get(where.id);
        if (!offer) return null;
        if (typeof where.status === "string" && offer.status !== where.status) {
          return null;
        }
        if (
          where.status &&
          typeof where.status === "object" &&
          Array.isArray(where.status.in) &&
          !where.status.in.includes(String(offer.status))
        ) {
          return null;
        }
        return { id: offer.id, status: offer.status };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const offer = state.offers.get(where.id);
        if (!offer) throw new Error("missing offer");
        Object.assign(offer, data);
        return offer;
      },
    },
    offerAcceptance: {
      async findUnique({ where }: { where: { offerId: string } }) {
        const row = state.acceptances.get(where.offerId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: Record<string, unknown>; select?: unknown }) {
        const offerId = String(data.offerId);
        if (state.acceptances.has(offerId)) {
          const err = new Error("Unique constraint failed") as Error & {
            code: string;
          };
          err.code = "P2002";
          throw err;
        }
        const row = { id: id("acc"), ...data };
        state.acceptances.set(offerId, row);
        return { id: row.id };
      },
    },
    platformProspect: {
      async findUnique({ where }: { where: { id: string }; select?: unknown }) {
        return state.prospects.get(where.id) ?? null;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = state.prospects.get(where.id);
        if (!row) throw new Error("missing prospect");
        Object.assign(row, data);
        return row;
      },
    },
    platformProspectActivity: {
      async create({
        data,
      }: {
        data: { prospectId: string; type: string; body: string | null };
      }) {
        state.activities.push(data);
        return { id: id("act") };
      },
    },
    platformAuditEvent: {
      async findFirst({
        where,
      }: {
        where: { entityType?: string; entityId?: string; action?: string };
        select?: unknown;
      }) {
        const hit = state.audits.find(
          (a) =>
            (!where.entityId || a.entityId === where.entityId) &&
            (!where.action || a.action === where.action),
        );
        return hit ? { id: "aud_existing" } : null;
      },
      async create({
        data,
      }: {
        data: { action: string; entityId: string; metadata?: unknown };
        select?: unknown;
      }) {
        state.audits.push({
          action: data.action,
          entityId: data.entityId,
          metadata: data.metadata ?? null,
        });
        return { id: id("aud") };
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
  };
}

async function main() {
  console.log("\n=== STAGE 6.8A — OFFER ACCEPTANCE FOUNDATION ===\n");

  // 0. Legal version authority present
  {
    assert.equal(HOUZZATPRO_TERMS_VERSION, "houzzatpro-terms-2026-09");
    assert.equal(HOUZZATPRO_PRIVACY_VERSION, "houzzatpro-privacy-2026-09");
    assert.ok(read("src/lib/platform/legal/content/houzzatpro-terms.ts").includes("Commercial Offer"));
    assert.ok(read("src/lib/platform/legal/content/houzzatpro-privacy.ts").includes("privacy@houzzatpro.com"));
    assert.ok(read("src/app/(marketing)/terms/page.tsx").includes("isHouzzatProPlatformRoot"));
    assert.ok(read("src/app/(marketing)/privacy/page.tsx").includes("HOUZZATPRO_PRIVACY_VERSION"));
    console.log("[0] HouzzatPRO legal docs + versions... PASS");
  }

  // 1. Deterministic commercialTermsHash
  {
    const base = {
      offerId: "off_1",
      version: 1,
      planCode: "TEAM",
      billingCadence: "ANNUAL",
      currency: "CAD",
      negotiatedRecurringAmountCents: 549_000,
      setupFeeCents: 0,
      includedSeats: 4,
      additionalSeats: 1,
      trialDays: 14,
      proposedStartDate: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-10-15T00:00:00.000Z",
      lineItems: [
        {
          kind: "PLAN",
          code: "PLAN_BASE",
          description: "TEAM",
          amountCents: 549_000,
          isRecurring: true,
          quantity: 1,
          sortOrder: 0,
        },
      ],
    };
    const a = computeCommercialTermsHash(base);
    const b = computeCommercialTermsHash({
      ...base,
      lineItems: [...base.lineItems].reverse(),
    });
    assert.equal(a, b);
    const c = computeCommercialTermsHash({
      ...base,
      negotiatedRecurringAmountCents: 500_000,
    });
    assert.notEqual(a, c);
    const d = computeCommercialTermsHash({
      ...base,
      lineItems: [
        ...base.lineItems,
        {
          kind: "ADDON",
          code: "GOOGLE_PPC",
          description: "PPC",
          amountCents: 1000,
          isRecurring: false,
          quantity: 1,
          sortOrder: 1,
        },
      ],
    });
    assert.notEqual(a, d);
    console.log("[1] commercialTermsHash deterministic + sensitive... PASS");
  }

  // 2. Happy path accept
  {
    const state = emptyState();
    const { raw, offerId, prospectId } = seedOffer(state);
    const db = createFakePrisma(state) as never;
    const result = await acceptPrivateOfferByRawToken({
      rawToken: raw,
      email: "alex@brokerage.test",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptCommercialTerms: true,
      prisma: db,
    });
    assert.equal(result.outcome, "accepted");
    assert.equal(state.offers.get(offerId)!.status, "ACCEPTED");
    assert.equal(state.offers.get(offerId)!.acceptedByEmail, "alex@brokerage.test");
    assert.equal(state.prospects.get(prospectId)!.status, "WON");
    assert.equal(state.acceptances.size, 1);
    assert.ok(
      state.audits.some((a) => a.action === COMMERCIAL_OFFER_AUDIT.ACCEPTED),
    );
    assert.equal(state.workspaces, 0);
    assert.equal(state.subscriptions, 0);
    assert.equal(state.tokens[0]!.revokedAt, null);
    console.log("[2] Valid accept → ACCEPTED + WON + audit... PASS");
  }

  // 3. Acknowledgement + email mismatch + client versions refused at route source
  {
    const state = emptyState();
    const { raw } = seedOffer(state);
    const db = createFakePrisma(state) as never;
    await assert.rejects(
      () =>
        acceptPrivateOfferByRawToken({
          rawToken: raw,
          email: "alex@brokerage.test",
          acceptTerms: false,
          acceptPrivacy: true,
          acceptCommercialTerms: true,
          prisma: db,
        }),
      (e: unknown) =>
        e instanceof OfferAcceptPublicError && e.code === "ACKNOWLEDGEMENTS_REQUIRED",
    );
    await assert.rejects(
      () =>
        acceptPrivateOfferByRawToken({
          rawToken: raw,
          email: "wrong@example.com",
          acceptTerms: true,
          acceptPrivacy: true,
          acceptCommercialTerms: true,
          prisma: db,
        }),
      (e: unknown) => {
        assert.ok(e instanceof OfferAcceptPublicError);
        assert.equal(e.code, "EMAIL_MISMATCH");
        assert.ok(!e.message.includes("alex@brokerage.test"));
        return true;
      },
    );
    const route = read(
      "src/app/api/platform/public/offers/[token]/accept/route.ts",
    );
    assert.ok(route.includes('"termsVersion"'));
    assert.ok(route.includes('"negotiatedRecurringAmountCents"'));
    console.log("[3] Acknowledgements + email mismatch + no client authority... PASS");
  }

  // 4. Idempotent + partial reconciliation
  {
    const state = emptyState();
    const { raw, offerId } = seedOffer(state);
    const db = createFakePrisma(state) as never;
    const first = await acceptPrivateOfferByRawToken({
      rawToken: raw,
      email: "Alex@Brokerage.TEST",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptCommercialTerms: true,
      prisma: db,
    });
    // Simulate partial failure: acceptance exists, status rolled back visually
    state.offers.get(offerId)!.status = "VIEWED";
    const second = await acceptPrivateOfferByRawToken({
      rawToken: raw,
      email: "alex@brokerage.test",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptCommercialTerms: true,
      prisma: db,
    });
    assert.equal(first.outcome, "accepted");
    assert.equal(second.outcome, "already_accepted");
    assert.equal(state.acceptances.size, 1);
    assert.equal(state.offers.get(offerId)!.status, "ACCEPTED");
    assert.equal(
      state.audits.filter((a) => a.action === COMMERCIAL_OFFER_AUDIT.ACCEPTED)
        .length,
      1,
    );
    console.log("[4] Idempotent accept + reconciliation... PASS");
  }

  // 5. Token lifecycle: ACCEPTED confirmation via same token; revoked opaque
  {
    const state = emptyState();
    const { raw, offerId } = seedOffer(state);
    const db = createFakePrisma(state) as never;
    await acceptPrivateOfferByRawToken({
      rawToken: raw,
      email: "alex@brokerage.test",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptCommercialTerms: true,
      prisma: db,
    });
    const view = await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: db,
    });
    assert.equal(view.ok, true);
    if (!view.ok) throw new Error("expected ok");
    assert.equal(view.kind, "accepted");
    state.tokens[0]!.revokedAt = new Date();
    const revoked = await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: db,
    });
    assert.equal(revoked.ok, false);
    void offerId;
    console.log("[5] ACCEPTED UX token lifecycle... PASS");
  }

  // 6. Hash from offer row + source isolation
  {
    const state = emptyState();
    const { offerId } = seedOffer(state);
    const offer = state.offers.get(offerId)!;
    const hash = commercialTermsHashFromOfferRow({
      id: String(offer.id),
      version: Number(offer.version),
      planCode: String(offer.planCode),
      billingCadence: String(offer.billingCadence),
      currency: String(offer.currency),
      negotiatedRecurringAmountCents: Number(offer.negotiatedRecurringAmountCents),
      setupFeeCents: Number(offer.setupFeeCents),
      includedSeats: Number(offer.includedSeats),
      additionalSeats: Number(offer.additionalSeats),
      trialDays: (offer.trialDays as number | null) ?? null,
      proposedStartDate: offer.proposedStartDate as Date,
      expiresAt: offer.expiresAt as Date,
      lineItems: state.lines.filter((l) => l.offerId === offerId),
    });
    assert.match(hash, /^[a-f0-9]{64}$/);

    const accept = read("src/lib/platform/offers/accept.ts");
    assert.ok(!/\$transaction/.test(accept));
    assert.ok(!/\.updateMany\s*\(/.test(accept));
    assert.ok(!/stripe/i.test(accept) || accept.includes("no Stripe"));
    assert.ok(!accept.includes("workspace.create"));
    assert.ok(accept.includes("COMMERCIAL_OFFER_AUDIT.ACCEPTED"));
    const form = read(
      "src/components/platform/public/PrivateOfferAcceptForm.tsx",
    );
    assert.ok(form.includes("acceptTerms"));
    assert.ok(!form.includes("Checkout"));
    assert.ok(!form.includes("Subscribe now"));
    console.log("[6] Hash + Neon/isolation source guards... PASS");
  }

  console.log("\nSTAGE 6.8A selftest: ALL PASS\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
