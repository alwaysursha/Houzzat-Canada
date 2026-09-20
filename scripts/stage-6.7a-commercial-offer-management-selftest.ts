/**
 * Stage 6.7A — Commercial offer creation/management selftest.
 * Run: node --import tsx scripts/stage-6.7a-commercial-offer-management-selftest.ts
 *
 * No production writes.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ADDITIONAL_AGENT_ANNUAL_CENTS,
  ADDITIONAL_AGENT_MONTHLY_CENTS,
  STANDARD_SETUP_FEE_CENTS,
} from "../src/lib/platform/catalog/plans";
import {
  ADS_MINIMUM_MONTHLY_BUDGET_CENTS,
  buildPrivateOfferUrl,
  cancelCommercialOffer,
  CommercialOfferActionError,
  COMMERCIAL_OFFER_AUDIT,
  createCommercialOfferRawToken,
  createDraftCommercialOffer,
  hashCommercialOfferToken,
  resolveOfferCommercialTerms,
  sendCommercialOffer,
  updateDraftCommercialOffer,
} from "../src/lib/platform/offers";
import { serializeOfferSummary } from "../src/lib/platform/read/serialize";

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
  metadata?: unknown;
};

type FakeToken = {
  id: string;
  offerId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

type FakeState = {
  prospects: Map<string, { id: string; status: string }>;
  offers: Map<string, FakeOffer>;
  lines: FakeLine[];
  tokens: FakeToken[];
  activities: Array<{
    id: string;
    prospectId: string;
    type: string;
    body: string | null;
  }>;
  audits: Array<{ action: string; entityId: string; metadata: unknown }>;
  nextId: number;
  workspaces: number;
  subscriptions: number;
  leads: number;
};

function createFakePrisma(state: FakeState) {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;
  return {
    platformProspect: {
      async findUnique({ where }: { where: { id: string } }) {
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
          operatorId: string;
          body: string;
          completedAt: Date;
        };
        select?: unknown;
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
      async create({ data }: { data: Omit<FakeOffer, "id" | "sentAt" | "workspaceId"> & { status: string; version: number } }) {
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
      async findUnique({
        where,
        include,
      }: {
        where: { id: string };
        include?: unknown;
      }) {
        const offer = state.offers.get(where.id);
        if (!offer) return null;
        if (!include) return offer;
        return {
          ...offer,
          lineItems: state.lines
            .filter((l) => l.offerId === offer.id)
            .sort((a, b) => a.sortOrder - b.sortOrder),
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
        for (const [k, v] of Object.entries(data)) {
          if (k === "version" && v && typeof v === "object" && "increment" in (v as object)) {
            offer.version += (v as { increment: number }).increment;
            continue;
          }
          (offer as Record<string, unknown>)[k] = v;
        }
        return offer;
      },
      async updateMany({
        where,
        data,
      }: {
        where: { id: string; status?: string };
        data: Record<string, unknown>;
      }) {
        const offer = state.offers.get(where.id);
        if (!offer) return { count: 0 };
        if (where.status && offer.status !== where.status) return { count: 0 };
        Object.assign(offer, data);
        return { count: 1 };
      },
    },
    commercialOfferLineItem: {
      async findMany({ where }: { where: { offerId: string }; select?: unknown }) {
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
        data: Omit<FakeLine, "id"> & { id?: string };
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
          metadata: data.metadata,
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
          createdAt: new Date(),
        };
        state.tokens.push(row);
        return row;
      },
      async findFirst({
        where,
      }: {
        where: { offerId: string; tokenHash?: string };
        select?: unknown;
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
        data: { revokedAt: Date };
      }) {
        const tok = state.tokens.find((t) => t.id === where.id);
        if (!tok) throw new Error("missing token");
        tok.revokedAt = data.revokedAt;
        return tok;
      },
    },
    platformAuditEvent: {
      async create({
        data,
      }: {
        data: {
          action: string;
          entityId: string;
          metadata?: unknown;
        };
        select?: unknown;
      }) {
        const row = { id: id("aud"), ...data };
        state.audits.push({
          action: data.action,
          entityId: data.entityId,
          metadata: data.metadata ?? null,
        });
        return { id: row.id };
      },
    },
  };
}

async function main() {
  console.log("\n=== STAGE 6.7A — COMMERCIAL OFFER MANAGEMENT ===\n");

  // 1. Catalog authority + negotiated prices don't mutate catalog
  {
    const before = STANDARD_SETUP_FEE_CENTS;
    const terms = resolveOfferCommercialTerms({
      planCode: "TEAM",
      billingCadence: "ANNUAL",
      negotiatedRecurringAmountCents: 500_000,
      setupFeeCents: 0,
    });
    assert.equal(terms.standardRecurringAmountCents, 599_000);
    assert.equal(terms.negotiatedRecurringAmountCents, 500_000);
    assert.equal(terms.setupFeeCents, 0);
    assert.equal(STANDARD_SETUP_FEE_CENTS, before);
    assert.equal(terms.includedSeats, 4);
    console.log("[1] Standard catalog + negotiated prices... PASS");
  }

  // 2. Seat rules by cadence — Solo forever blocked; Team/Brokerage priced
  {
    assert.throws(
      () =>
        resolveOfferCommercialTerms({
          planCode: "SOLO",
          billingCadence: "ANNUAL",
          additionalSeats: 1,
        }),
      (e: unknown) =>
        e instanceof CommercialOfferActionError &&
        e.code === "SOLO_ADDITIONAL_SEATS_FORBIDDEN",
    );
    assert.throws(
      () =>
        resolveOfferCommercialTerms({
          planCode: "SOLO",
          billingCadence: "MONTHLY",
          additionalSeats: 1,
        }),
      (e: unknown) =>
        e instanceof CommercialOfferActionError &&
        e.code === "SOLO_ADDITIONAL_SEATS_FORBIDDEN",
    );

    for (const planCode of ["TEAM", "BROKERAGE"] as const) {
      const monthly = resolveOfferCommercialTerms({
        planCode,
        billingCadence: "MONTHLY",
        additionalSeats: 3,
      });
      assert.equal(monthly.additionalSeats, 3);
      assert.ok(
        monthly.lineItems.some(
          (l) =>
            l.kind === "ADDITIONAL_SEAT" &&
            l.amountCents === ADDITIONAL_AGENT_MONTHLY_CENTS &&
            l.quantity === 3,
        ),
      );
      assert.equal(
        monthly.recurringTotalCents,
        monthly.negotiatedRecurringAmountCents +
          3 * ADDITIONAL_AGENT_MONTHLY_CENTS,
      );

      const annual = resolveOfferCommercialTerms({
        planCode,
        billingCadence: "ANNUAL",
        additionalSeats: 2,
      });
      assert.ok(
        annual.lineItems.some(
          (l) =>
            l.kind === "ADDITIONAL_SEAT" &&
            l.amountCents === ADDITIONAL_AGENT_ANNUAL_CENTS &&
            l.quantity === 2,
        ),
      );
      assert.equal(
        annual.recurringTotalCents,
        annual.negotiatedRecurringAmountCents +
          2 * ADDITIONAL_AGENT_ANNUAL_CENTS,
      );
    }

    assert.ok(!read("src/lib/platform/offers/line-items.ts").includes(
      "MONTHLY_ADDITIONAL_SEATS_UNDECIDED",
    ));
    console.log("[2] Seat rules + monthly/annual additional agent pricing... PASS");
  }

  // 3. Custom app plan restrictions + PPC/Meta not invented
  {
    assert.throws(
      () =>
        resolveOfferCommercialTerms({
          planCode: "SOLO",
          billingCadence: "MONTHLY",
          addOns: [{ code: "CUSTOM_CONSUMER_APP" }],
        }),
      (e: unknown) =>
        e instanceof CommercialOfferActionError &&
        e.code === "CUSTOM_APP_PLAN_FORBIDDEN",
    );
    const withApp = resolveOfferCommercialTerms({
      planCode: "BROKERAGE",
      billingCadence: "ANNUAL",
      addOns: [{ code: "CUSTOM_CONSUMER_APP" }],
    });
    assert.ok(
      withApp.lineItems.some(
        (l) => l.code === "CUSTOM_CONSUMER_APP" && l.amountCents === 199_900,
      ),
    );
    assert.throws(
      () =>
        resolveOfferCommercialTerms({
          planCode: "TEAM",
          billingCadence: "MONTHLY",
          addOns: [{ code: "GOOGLE_PPC" }],
        }),
      (e: unknown) =>
        e instanceof CommercialOfferActionError &&
        e.code === "ADS_FEE_REQUIRES_OPERATOR_AMOUNT",
    );
    const withPpc = resolveOfferCommercialTerms({
      planCode: "TEAM",
      billingCadence: "MONTHLY",
      addOns: [{ code: "GOOGLE_PPC", amountCents: 150_000 }],
    });
    const ppc = withPpc.lineItems.find((l) => l.code === "GOOGLE_PPC");
    assert.ok(ppc);
    assert.equal(ppc!.amountCents, 150_000);
    assert.equal(ADS_MINIMUM_MONTHLY_BUDGET_CENTS, 75_000);
    // $750 ad budget is guidance only — never auto-included in totals
    assert.equal(
      withPpc.oneTimeTotalCents,
      STANDARD_SETUP_FEE_CENTS + 150_000,
    );
    assert.ok(!withPpc.lineItems.some((l) => l.amountCents === 75_000));
    assert.ok(
      JSON.stringify(ppc!.metadata ?? {}).includes("adSpendNotIncludedInTotals"),
    );
    console.log("[3] Add-on restrictions + operator PPC amount (no ad-spend auto)... PASS");
  }

  // 4. Server totals authoritative
  {
    const terms = resolveOfferCommercialTerms({
      planCode: "TEAM",
      billingCadence: "ANNUAL",
      negotiatedRecurringAmountCents: 599_000,
      setupFeeCents: STANDARD_SETUP_FEE_CENTS,
      additionalSeats: 1,
      adjustments: [
        {
          kind: "DISCOUNT",
          code: "SETUP_WAIVE_PARTIAL",
          description: "Setup courtesy discount",
          amountCents: 10_000,
          isRecurring: false,
        },
      ],
    });
    assert.equal(
      terms.recurringTotalCents,
      599_000 + ADDITIONAL_AGENT_ANNUAL_CENTS,
    );
    assert.equal(terms.oneTimeTotalCents, STANDARD_SETUP_FEE_CENTS - 10_000);
    console.log("[4] Server totals... PASS");
  }

  // 5. Token security helpers
  {
    const raw = createCommercialOfferRawToken();
    assert.ok(raw.length >= 40);
    const hash = hashCommercialOfferToken(raw);
    assert.equal(hash.length, 64);
    assert.notEqual(raw, hash);
    const url = buildPrivateOfferUrl(raw);
    assert.ok(url.startsWith("https://houzzatpro.com/subscribe/"));
    assert.ok(url.includes(raw));
    console.log("[5] Token generate/hash/URL... PASS");
  }

  // 6–12. Draft create/edit/send/cancel with fake prisma
  {
    const state: FakeState = {
      prospects: new Map([["p1", { id: "p1", status: "DEMO_COMPLETED" }]]),
      offers: new Map(),
      lines: [],
      tokens: [],
      activities: [],
      audits: [],
      nextId: 1,
      workspaces: 0,
      subscriptions: 0,
      leads: 0,
    };
    const db = createFakePrisma(state) as never;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const created = await createDraftCommercialOffer({
      prospectId: "p1",
      operatorId: "op1",
      terms: {
        planCode: "TEAM",
        billingCadence: "ANNUAL",
        expiresAt,
        setupFeeCents: STANDARD_SETUP_FEE_CENTS,
      },
      prisma: db,
    });
    assert.equal(created.status, "DRAFT");
    assert.ok(state.audits.some((a) => a.action === COMMERCIAL_OFFER_AUDIT.CREATED));

    const updated = await updateDraftCommercialOffer({
      offerId: created.offerId,
      operatorId: "op1",
      terms: {
        planCode: "TEAM",
        billingCadence: "ANNUAL",
        negotiatedRecurringAmountCents: 550_000,
        expiresAt,
        setupFeeCents: 0,
      },
      prisma: db,
    });
    assert.equal(updated.status, "DRAFT");
    const offerRow = state.offers.get(created.offerId)!;
    assert.equal(offerRow.negotiatedRecurringAmountCents, 550_000);
    assert.equal(offerRow.setupFeeCents, 0);

    const sent = await sendCommercialOffer({
      offerId: created.offerId,
      operatorId: "op1",
      prisma: db,
    });
    assert.equal(sent.outcome, "sent");
    assert.equal(sent.status, "SENT");
    assert.ok(sent.privateUrl);
    assert.equal(sent.rawTokenShownOnce, true);
    assert.equal(state.offers.get(created.offerId)!.status, "SENT");
    assert.equal(state.prospects.get("p1")!.status, "OFFER_SENT");
    assert.ok(state.activities.some((a) => a.type === "OFFER_LINKED"));
    assert.ok(!state.activities.some((a) => a.type === "WON"));
    assert.equal(state.tokens.filter((t) => !t.revokedAt).length, 1);
    const activeHash = state.tokens.find((t) => !t.revokedAt)!.tokenHash;
    assert.ok(!sent.privateUrl!.includes(activeHash));
    for (const audit of state.audits) {
      const meta = JSON.stringify(audit.metadata ?? {});
      assert.ok(!meta.includes(activeHash));
      assert.ok(!/privateUrl|rawToken|tokenHash/i.test(meta) || !meta.includes(activeHash));
    }

    const again = await sendCommercialOffer({
      offerId: created.offerId,
      operatorId: "op1",
      prisma: db,
    });
    assert.equal(again.outcome, "already_sent");
    assert.equal(again.privateUrl, null);
    assert.equal(state.tokens.filter((t) => !t.revokedAt).length, 1);

    await assert.rejects(
      () =>
        updateDraftCommercialOffer({
          offerId: created.offerId,
          operatorId: "op1",
          terms: {
            planCode: "TEAM",
            billingCadence: "ANNUAL",
            expiresAt,
          },
          prisma: db,
        }),
      (e: unknown) =>
        e instanceof CommercialOfferActionError && e.code === "OFFER_NOT_EDITABLE",
    );

    const cancelled = await cancelCommercialOffer({
      offerId: created.offerId,
      operatorId: "op1",
      prisma: db,
    });
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(state.tokens.every((t) => t.revokedAt != null));
    assert.equal(state.workspaces, 0);
    assert.equal(state.subscriptions, 0);
    assert.equal(state.leads, 0);

    console.log("[6] Draft create/edit... PASS");
    console.log("[7] Send + private URL once + prospect OFFER_SENT... PASS");
    console.log("[8] Idempotent duplicate send... PASS");
    console.log("[9] SENT immutable... PASS");
    console.log("[10] Cancel revokes tokens... PASS");
    console.log("[11] No workspace/subscription/CRM writes... PASS");
  }

  // 12. Serialize never exposes tokenHash
  {
    const serialized = serializeOfferSummary({
      id: "o1",
      prospectId: "p1",
      createdByOperatorId: "op1",
      status: "SENT",
      planCode: "TEAM",
      billingCadence: "ANNUAL",
      currency: "CAD",
      standardRecurringAmountCents: 599_000,
      negotiatedRecurringAmountCents: 599_000,
      setupFeeCents: 0,
      includedSeats: 4,
      additionalSeats: 0,
      trialDays: null,
      proposedStartDate: null,
      expiresAt: new Date(),
      version: 1,
      acceptedSnapshotJson: null,
      sentAt: new Date(),
      viewedAt: null,
      acceptedAt: null,
      acceptedByEmail: null,
      workspaceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lineItems: [],
      tokens: [
        {
          id: "t1",
          offerId: "o1",
          tokenHash: "deadbeef".repeat(8),
          expiresAt: new Date(),
          revokedAt: null,
          lastViewedAt: null,
          createdAt: new Date(),
        },
      ],
      acceptance: null,
      subscription: null,
      provisioningRun: null,
    });
    const json = JSON.stringify(serialized);
    assert.ok(!json.includes("tokenHash"));
    assert.ok(!json.includes("deadbeef"));
    assert.ok("recurringTotalCents" in serialized);
    console.log("[12] Read serialize strips tokenHash + totals... PASS");
  }

  // 13. Routes / UI / auth / isolation source checks
  {
    const createRoute = read("src/app/api/platform/v1/offers/route.ts");
    const sendRoute = read(
      "src/app/api/platform/v1/offers/[offerId]/send/route.ts",
    );
    const cancelRoute = read(
      "src/app/api/platform/v1/offers/[offerId]/cancel/route.ts",
    );
    const manage = read("src/lib/platform/offers/manage.ts");
    assert.ok(createRoute.includes("createDraftCommercialOffer"));
    assert.ok(createRoute.includes("runPlatformRouteWithOperator"));
    assert.ok(sendRoute.includes("sendCommercialOffer"));
    assert.ok(cancelRoute.includes("cancelCommercialOffer"));
    assert.ok(manage.includes("hashCommercialOfferToken"));
    assert.ok(manage.includes("COMMERCIAL_OFFER_AUDIT.SENT"));
    assert.ok(!manage.includes("updateMany"));
    assert.ok(!manage.includes("$transaction"));
    assert.ok(manage.includes("OFFER_SENT"));
    assert.ok(manage.includes("OFFER_LINKED"));
    assert.ok(!/status:\s*"WON"/.test(manage));
    assert.ok(
      read("src/lib/platform/offers/constants.ts").includes(
        "COMMERCIAL_OFFER_SENT",
      ),
    );

    const form = read("src/components/platform/PlatformOfferForm.tsx");
    const actions = read("src/components/platform/PlatformOfferActions.tsx");
    const prospectPage = read(
      "src/app/platform/(shell)/prospects/[prospectId]/page.tsx",
    );
    const offersPage = read("src/app/platform/(shell)/offers/page.tsx");
    assert.ok(form.includes("Create draft offer") || form.includes("Save draft offer"));
    assert.ok(actions.includes("Send Offer"));
    assert.ok(actions.includes("shown once"));
    assert.ok(prospectPage.includes("Create Offer"));
    assert.ok(offersPage.includes("+ New Offer"));
    assert.ok(!form.includes("tokenHash"));
    assert.ok(!actions.includes("tokenHash"));

    const handler = read("src/lib/platform/api/handler.ts");
    assert.ok(handler.includes("CommercialOfferActionError"));

    const auth = read("src/lib/platform/auth/require-platform-operator.ts");
    assert.ok(auth.includes("MASTER_ADMIN"));

    for (const file of listTsFiles("src/lib/platform/offers").concat([
      "src/app/api/platform/v1/offers/route.ts",
      "src/app/api/platform/v1/offers/[offerId]/route.ts",
      "src/app/api/platform/v1/offers/[offerId]/send/route.ts",
      "src/app/api/platform/v1/offers/[offerId]/cancel/route.ts",
      "src/app/api/platform/v1/offers/[offerId]/resend-invitation/route.ts",
    ])) {
      const src = read(file);
      assert.ok(!/prisma\.lead\b/.test(src), file);
      assert.ok(!/stripe\.(customers|checkout|subscriptions)/i.test(src), file);
      assert.ok(!/requireAgentContext/.test(src), file);
      assert.ok(!/\$transaction/.test(src), file);
    }
    console.log("[13] Routes/UI/auth/isolation... PASS");
  }

  console.log("\nSTAGE 6.7A — ALL TESTS PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
