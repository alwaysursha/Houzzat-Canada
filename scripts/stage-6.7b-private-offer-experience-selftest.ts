/**
 * Stage 6.7B — Private commercial offer experience selftest.
 * Run: node --import tsx scripts/stage-6.7b-private-offer-experience-selftest.ts
 *
 * No production writes.
 */

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  COMMERCIAL_OFFER_AUDIT,
  createCommercialOfferRawToken,
  hashCommercialOfferToken,
  resolvePrivateOfferByRawToken,
} from "../src/lib/platform/offers";
import { isHouzzatProPlatformRoot } from "../src/lib/tenancy/platform-hostname";

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

type FakeOffer = {
  id: string;
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
  viewedAt: Date | null;
  prospectId: string;
};

type FakeProspect = {
  id: string;
  contactName: string;
  businessName: string | null;
  brokerageName: string | null;
  email: string;
  phone: string | null;
  notesInternal: string | null;
};

type FakeState = {
  offers: Map<string, FakeOffer>;
  lines: FakeLine[];
  tokens: FakeToken[];
  prospects: Map<string, FakeProspect>;
  audits: Array<{
    action: string;
    entityId: string;
    entityType: string;
    metadata: unknown;
  }>;
  activities: number;
  workspaces: number;
  subscriptions: number;
  acceptances: number;
  stripeSessions: number;
  nextId: number;
};

function seedSentOffer(state: FakeState, overrides?: Partial<FakeOffer>) {
  const prospectId = `pros_${state.nextId++}`;
  const offerId = `off_${state.nextId++}`;
  const raw = createCommercialOfferRawToken();
  const tokenHash = hashCommercialOfferToken(raw);

  state.prospects.set(prospectId, {
    id: prospectId,
    contactName: "Jordan Lee",
    businessName: "Lee Realty",
    brokerageName: "Lee Brokerage Inc.",
    email: "jordan@example.com",
    phone: "+1-416-555-0100",
    notesInternal: "SECRET_INTERNAL_NOTE_DO_NOT_LEAK",
  });

  const offer: FakeOffer = {
    id: offerId,
    status: "SENT",
    planCode: "TEAM",
    billingCadence: "ANNUAL",
    currency: "CAD",
    standardRecurringAmountCents: 599_000,
    negotiatedRecurringAmountCents: 549_000,
    setupFeeCents: 0,
    includedSeats: 4,
    additionalSeats: 2,
    trialDays: 14,
    proposedStartDate: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    viewedAt: null,
    prospectId,
    ...overrides,
  };
  state.offers.set(offerId, offer);

  state.lines.push(
    {
      id: `li_${state.nextId++}`,
      offerId,
      kind: "PLAN",
      code: "PLAN_BASE",
      description: "TEAM plan (annual)",
      amountCents: 549_000,
      isRecurring: true,
      quantity: 1,
      sortOrder: 0,
    },
    {
      id: `li_${state.nextId++}`,
      offerId,
      kind: "ADDON",
      code: "ADDITIONAL_AGENT",
      description: "Additional agents",
      amountCents: 89_900,
      isRecurring: true,
      quantity: 2,
      sortOrder: 1,
    },
    {
      id: `li_${state.nextId++}`,
      offerId,
      kind: "ADDON",
      code: "CUSTOM_CONSUMER_APP",
      description: "Custom Consumer App (one-time)",
      amountCents: 2_500_000,
      isRecurring: false,
      quantity: 1,
      sortOrder: 2,
    },
    {
      id: `li_${state.nextId++}`,
      offerId,
      kind: "ADDON",
      code: "GOOGLE_PPC",
      description: "Google PPC service fee",
      amountCents: 75_000,
      isRecurring: false,
      quantity: 1,
      sortOrder: 3,
    },
  );

  const token: FakeToken = {
    id: `tok_${state.nextId++}`,
    offerId,
    tokenHash,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    lastViewedAt: null,
    createdAt: new Date(),
  };
  state.tokens.push(token);

  return { raw, offerId, tokenId: token.id, prospectId };
}

function createFakePrisma(state: FakeState) {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;
  return {
    commercialOfferToken: {
      async findUnique({
        where,
        include,
      }: {
        where: { tokenHash: string };
        include?: {
          offer?: {
            include?: {
              lineItems?: unknown;
              prospect?: { select?: Record<string, boolean> };
            };
          };
        };
      }) {
        const token = state.tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!token) return null;
        if (!include?.offer) return token;
        const offer = state.offers.get(token.offerId);
        if (!offer) return { ...token, offer: null };
        const prospect = state.prospects.get(offer.prospectId)!;
        const select = include.offer.include?.prospect?.select;
        const prospectOut = select
          ? Object.fromEntries(
              Object.keys(select).map((k) => [
                k,
                (prospect as Record<string, unknown>)[k],
              ]),
            )
          : prospect;
        return {
          ...token,
          offer: {
            ...offer,
            lineItems: state.lines
              .filter((l) => l.offerId === offer.id)
              .sort((a, b) => a.sortOrder - b.sortOrder),
            prospect: prospectOut,
          },
        };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { lastViewedAt?: Date; revokedAt?: Date };
      }) {
        const tok = state.tokens.find((t) => t.id === where.id);
        if (!tok) throw new Error("missing token");
        if (data.lastViewedAt) tok.lastViewedAt = data.lastViewedAt;
        if (data.revokedAt) tok.revokedAt = data.revokedAt;
        return tok;
      },
    },
    commercialOffer: {
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
    platformAuditEvent: {
      async findFirst({
        where,
      }: {
        where: { entityType: string; entityId: string; action: string };
        select?: unknown;
      }) {
        const row = state.audits.find(
          (a) =>
            a.entityType === where.entityType &&
            a.entityId === where.entityId &&
            a.action === where.action,
        );
        return row ? { id: "aud_existing" } : null;
      },
      async create({
        data,
      }: {
        data: {
          action: string;
          entityId: string;
          entityType: string;
          metadata?: unknown;
        };
        select?: unknown;
      }) {
        state.audits.push({
          action: data.action,
          entityId: data.entityId,
          entityType: data.entityType,
          metadata: data.metadata ?? null,
        });
        return { id: id("aud") };
      },
    },
    // Isolation counters — must never be touched by private resolve
    workspace: {
      async create() {
        state.workspaces += 1;
        throw new Error("workspace write forbidden");
      },
    },
    subscription: {
      async create() {
        state.subscriptions += 1;
        throw new Error("subscription write forbidden");
      },
    },
    offerAcceptance: {
      async create() {
        state.acceptances += 1;
        throw new Error("acceptance write forbidden");
      },
    },
    platformProspectActivity: {
      async create() {
        state.activities += 1;
        throw new Error("activity write forbidden");
      },
    },
  };
}

function emptyState(): FakeState {
  return {
    offers: new Map(),
    lines: [],
    tokens: [],
    prospects: new Map(),
    audits: [],
    activities: 0,
    workspaces: 0,
    subscriptions: 0,
    acceptances: 0,
    stripeSessions: 0,
    nextId: 1,
  };
}

async function main() {
  console.log("\n=== STAGE 6.7B — PRIVATE OFFER EXPERIENCE ===\n");

  // 1. Valid SENT token renders + SENT → VIEWED
  {
    const state = emptyState();
    const { raw, offerId } = seedSentOffer(state);
    const db = createFakePrisma(state) as never;
    const first = await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: db,
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("expected ok");
    assert.equal(first.presentation.status, "VIEWED");
    assert.equal(first.presentation.planCode, "TEAM");
    assert.equal(first.presentation.preparedFor.contactName, "Jordan Lee");
    assert.equal(
      first.presentation.preparedFor.companyName,
      "Lee Brokerage Inc.",
    );
    assert.equal(first.presentation.showNegotiatedRecurring, true);
    assert.equal(first.presentation.showNegotiatedSetup, true);
    assert.equal(first.presentation.setupFeeCents, 0);
    assert.ok(
      first.presentation.oneTimeLines.some(
        (l) => l.description === "Optional branded consumer app",
      ),
    );
    assert.ok(first.presentation.hasAdsAddon);
    assert.equal(state.offers.get(offerId)!.status, "VIEWED");
    assert.ok(state.offers.get(offerId)!.viewedAt instanceof Date);
    assert.ok(state.tokens[0]!.lastViewedAt instanceof Date);
    assert.equal(state.audits.length, 1);
    assert.equal(state.audits[0]!.action, COMMERCIAL_OFFER_AUDIT.VIEWED);
    console.log("[1] Valid SENT renders + SENT→VIEWED... PASS");
  }

  // 2. Idempotent refresh — no repeated audit / status churn / activities
  {
    const state = emptyState();
    const { raw, offerId } = seedSentOffer(state);
    const db = createFakePrisma(state) as never;
    const firstViewedAt = (
      await resolvePrivateOfferByRawToken({ rawToken: raw, prisma: db })
    ).ok
      ? state.offers.get(offerId)!.viewedAt
      : null;
    const firstLastViewed = state.tokens[0]!.lastViewedAt;

    await new Promise((r) => setTimeout(r, 5));
    const second = await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: db,
    });
    const third = await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: db,
    });
    assert.equal(second.ok, true);
    assert.equal(third.ok, true);
    assert.equal(state.offers.get(offerId)!.status, "VIEWED");
    assert.equal(
      state.offers.get(offerId)!.viewedAt?.getTime(),
      firstViewedAt?.getTime(),
    );
    assert.equal(state.audits.length, 1);
    assert.equal(state.activities, 0);
    assert.equal(state.workspaces, 0);
    assert.equal(state.subscriptions, 0);
    assert.equal(state.acceptances, 0);
    assert.ok(
      (state.tokens[0]!.lastViewedAt?.getTime() ?? 0) >=
        (firstLastViewed?.getTime() ?? 0),
    );
    assert.equal(state.tokens.length, 1);
    console.log("[2] Refresh idempotent (audit once, viewedAt once)... PASS");
  }

  // 3. VIEWED continues to render
  {
    const state = emptyState();
    const { raw } = seedSentOffer(state, {
      status: "VIEWED",
      viewedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const db = createFakePrisma(state) as never;
    const result = await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: db,
    });
    assert.equal(result.ok, true);
    console.log("[3] VIEWED continues rendering... PASS");
  }

  // 4. Unknown / expired / revoked / cancelled / draft / accepted → unavailable
  {
    const cases: Array<{
      label: string;
      mutate: (state: FakeState, offerId: string, token: FakeToken) => void;
    }> = [
      {
        label: "unknown",
        mutate: () => {
          /* no seed */
        },
      },
      {
        label: "expired token",
        mutate: (_s, _o, token) => {
          token.expiresAt = new Date(Date.now() - 1000);
        },
      },
      {
        label: "revoked token",
        mutate: (_s, _o, token) => {
          token.revokedAt = new Date();
        },
      },
      {
        label: "expired offer",
        mutate: (s, offerId) => {
          s.offers.get(offerId)!.expiresAt = new Date(Date.now() - 1000);
        },
      },
      {
        label: "cancelled",
        mutate: (s, offerId) => {
          s.offers.get(offerId)!.status = "CANCELLED";
        },
      },
      {
        label: "draft",
        mutate: (s, offerId) => {
          s.offers.get(offerId)!.status = "DRAFT";
        },
      },
      {
        label: "accepted",
        mutate: (s, offerId) => {
          s.offers.get(offerId)!.status = "ACCEPTED";
        },
      },
    ];

    for (const c of cases) {
      const state = emptyState();
      let raw = "x".repeat(32);
      if (c.label !== "unknown") {
        const seeded = seedSentOffer(state);
        raw = seeded.raw;
        c.mutate(state, seeded.offerId, state.tokens[0]!);
      } else {
        raw = createCommercialOfferRawToken();
      }
      const result = await resolvePrivateOfferByRawToken({
        rawToken: raw,
        prisma: createFakePrisma(state) as never,
      });
      assert.equal(result.ok, false, c.label);
      assert.deepEqual(result, { ok: false, reason: "unavailable" });
      assert.equal(state.audits.length, 0, c.label);
    }
    console.log(
      "[4] Unknown/expired/revoked/cancelled/draft/accepted → same unavailable... PASS",
    );
  }

  // 5. Privacy — presentation never includes internal prospect fields
  {
    const state = emptyState();
    const { raw } = seedSentOffer(state);
    const result = await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: createFakePrisma(state) as never,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected ok");
    const json = JSON.stringify(result.presentation);
    assert.ok(!json.includes("jordan@example.com"));
    assert.ok(!json.includes("416-555"));
    assert.ok(!json.includes("SECRET_INTERNAL"));
    assert.ok(!json.includes("tokenHash"));
    assert.ok(!json.includes(raw));
    assert.ok(!/"email"/i.test(json));
    assert.ok(!/"phone"/i.test(json));
    assert.ok(!/"notesInternal"/i.test(json));
    console.log("[5] Prospect privacy (no email/phone/notes/token)... PASS");
  }

  // 6. Raw token never persisted; hash lookup only
  {
    const state = emptyState();
    const { raw } = seedSentOffer(state);
    await resolvePrivateOfferByRawToken({
      rawToken: raw,
      prisma: createFakePrisma(state) as never,
    });
    const dump = JSON.stringify({
      tokens: state.tokens,
      offers: [...state.offers.values()],
      audits: state.audits,
    });
    assert.ok(!dump.includes(raw));
    assert.ok(state.tokens.every((t) => t.tokenHash === hashCommercialOfferToken(raw)));
    const meta = JSON.stringify(state.audits[0]!.metadata);
    assert.ok(!meta.includes(raw));
    assert.ok(!meta.includes("tokenHash"));
    assert.ok(!meta.includes(state.tokens[0]!.tokenHash));
    console.log("[6] Raw token never persisted / not in audit... PASS");
  }

  // 7. Host authority helpers
  {
    assert.equal(isHouzzatProPlatformRoot("houzzatpro.com"), true);
    assert.equal(isHouzzatProPlatformRoot("www.houzzatpro.com"), true);
    assert.equal(isHouzzatProPlatformRoot("houzzat.com"), false);
    assert.equal(isHouzzatProPlatformRoot("tenant-canary.houzzatpro.com"), false);
    assert.equal(isHouzzatProPlatformRoot("example.com"), false);
    console.log("[7] Platform host authority... PASS");
  }

  // 8. Source guards — Neon HTTP, no Stripe/accept, caching, indexing, host gate
  {
    const privateOffer = read("src/lib/platform/offers/private-offer.ts");
    const page = read("src/app/(marketing)/subscribe/[token]/page.tsx");
    const ui = read("src/components/platform/public/PrivateOfferProposal.tsx");
    const mw = read("src/middleware.ts");
    const layout = read("src/app/(marketing)/layout.tsx");
    const sitemap = read("src/app/sitemap.ts");
    const copy = read("src/lib/platform/offers/private-offer-copy.ts");

    assert.ok(!/\.updateMany\s*\(/.test(privateOffer));
    assert.ok(!/\$transaction/.test(privateOffer));
    assert.ok(privateOffer.includes("COMMERCIAL_OFFER_AUDIT.VIEWED"));
    assert.ok(privateOffer.includes("hashCommercialOfferToken"));
    assert.ok(!/from ["']stripe["']/.test(privateOffer));
    assert.ok(!privateOffer.includes("OfferAcceptance"));
    assert.ok(!/CheckoutSession|createCheckout/i.test(privateOffer));

    assert.ok(page.includes("force-dynamic"));
    assert.ok(page.includes("index: false"));
    assert.ok(page.includes("follow: false"));
    assert.ok(page.includes("isHouzzatProPlatformRoot"));
    assert.ok(page.includes("resolvePrivateOfferByRawToken"));
    assert.ok(page.includes("PrivateOfferUnavailable"));
    assert.ok(!/\bSubscribe now\b/i.test(page));
    assert.ok(!/\bCheckout\b/i.test(page));

    assert.ok(ui.includes("PRIVATE_OFFER_UNAVAILABLE_TITLE"));
    assert.ok(ui.includes("PRIVATE_OFFER_CTA_TITLE"));
    assert.ok(ui.includes("resolveHouzzatProSupportCta"));
    assert.ok(!ui.includes("Accept offer"));
    assert.ok(!/Subscribe now/i.test(ui));
    assert.ok(!/\bCheckout\b/i.test(ui));
    assert.ok(copy.includes("Ready to move forward?"));

    assert.ok(mw.includes('pathname.startsWith("/subscribe/")'));
    assert.ok(mw.includes("private, no-store"));
    assert.ok(layout.includes("isHouzzatProPlatformPrivateOfferRequest"));
    assert.ok(!sitemap.includes("/subscribe"));

    for (const file of [
      "src/lib/platform/offers/private-offer.ts",
      "src/app/(marketing)/subscribe/[token]/page.tsx",
      "src/components/platform/public/PrivateOfferProposal.tsx",
    ]) {
      const src = read(file);
      assert.ok(!/\$transaction/.test(src), file);
      assert.ok(!/\.updateMany\s*\(/.test(src), file);
    }

    // No CRM write helpers in private offer path
    assert.ok(!privateOffer.includes("platformProspectActivity"));
    assert.ok(!privateOffer.includes("createLead"));
    console.log("[8] Source guards (cache/noindex/host/Neon/isolation)... PASS");
  }

  // 9. Token hash helper integrity
  {
    const raw = randomBytes(32).toString("base64url");
    const a = hashCommercialOfferToken(raw);
    const b = createHash("sha256").update(raw, "utf8").digest("hex");
    assert.equal(a, b);
    assert.notEqual(a, raw);
    console.log("[9] SHA-256 token hash integrity... PASS");
  }

  // 10. Regression surface — 6.7A manage still Neon-safe
  {
    const manage = read("src/lib/platform/offers/manage.ts");
    assert.ok(!/\.updateMany\s*\(/.test(manage));
    assert.ok(!/\$transaction/.test(manage));
    const offerFiles = listTsFiles("src/lib/platform/offers");
    for (const file of offerFiles) {
      const src = read(file);
      assert.ok(!/\$transaction/.test(src), file);
      assert.ok(!/\.updateMany\s*\(/.test(src), file);
    }
    console.log("[10] Offers module Neon HTTP regression... PASS");
  }

  console.log("\nSTAGE 6.7B selftest: ALL PASS\n");
  console.log(
    "NOTE: ACCEPTED offers render the same opaque unavailable state for now;",
  );
  console.log(
    "acceptance UX is intentionally deferred (not invented in 6.7B).\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
