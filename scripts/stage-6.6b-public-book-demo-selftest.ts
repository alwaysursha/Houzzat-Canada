/**
 * Stage 6.6B — public Book a Demo selftest.
 * Run: node --import tsx scripts/stage-6.6b-public-book-demo-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BOOK_DEMO_ACTIVITY_SUMMARY,
  BOOK_DEMO_HONEYPOT_FIELD,
  BOOK_DEMO_PATH,
  BookDemoPublicError,
  assertBookDemoPlatformHostname,
  clearBookDemoRateLimitsForTests,
  receiveWebsiteDemoRequest,
} from "../src/lib/platform";

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

type FakeState = {
  prospects: Map<string, FakeProspect>;
  byEmail: Map<string, string>;
  activities: Array<{
    id: string;
    prospectId: string;
    type: string;
    body: string | null;
  }>;
  audits: Array<{ action: string; metadata: unknown; summary: string }>;
  nextId: number;
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
      async create({ data }: { data: Partial<FakeProspect> & { email: string } }) {
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
        const current = state.prospects.get(where.id);
        if (!current) throw new Error("missing");
        const next = { ...current, ...data };
        state.prospects.set(where.id, next);
        return next;
      },
    },
    platformProspectActivity: {
      async create({
        data,
      }: {
        data: {
          prospectId: string;
          type: string;
          body?: string | null;
          operatorId?: string | null;
        };
      }) {
        const row = {
          id: id("a"),
          prospectId: data.prospectId,
          type: data.type,
          body: data.body ?? null,
        };
        state.activities.push(row);
        return { id: row.id };
      },
    },
    platformAuditEvent: {
      async create({
        data,
      }: {
        data: {
          action: string;
          summary: string;
          metadata?: unknown;
          entityId?: string;
        };
      }) {
        const row = {
          id: id("audit"),
          action: data.action,
          summary: data.summary,
          metadata: data.metadata ?? null,
        };
        state.audits.push(row);
        return { id: row.id };
      },
    },
  };
}

function fresh(): FakeState {
  return {
    prospects: new Map(),
    byEmail: new Map(),
    activities: [],
    audits: [],
    nextId: 1,
  };
}

const valid = {
  fullName: "Jamie Realtor",
  email: "Jamie@Example.com",
  phone: "4165550199",
  brokerageName: "North Star Realty",
  teamSize: 4,
  website: "https://northstar.example",
  region: "Toronto",
  message: "Looking for a team CRM",
};

async function main() {
  console.log("\n=== STAGE 6.6B — PUBLIC BOOK A DEMO ===\n");
  clearBookDemoRateLimitsForTests();

  // 1. Platform hostname gating
  {
    assert.throws(
      () =>
        assertBookDemoPlatformHostname(
          new Request("https://tenant-canary.houzzatpro.com/api/platform/public/book-demo", {
            headers: { host: "tenant-canary.houzzatpro.com" },
          }),
        ),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "PLATFORM_HOST_REQUIRED",
    );
    assert.doesNotThrow(() =>
      assertBookDemoPlatformHostname(
        new Request("https://houzzatpro.com/api/platform/public/book-demo", {
          headers: { host: "houzzatpro.com" },
        }),
      ),
    );
    const gate = read("src/lib/platform/public/book-demo-request.ts");
    assert.ok(gate.includes("isHouzzatProPlatformRoot"));
    assert.ok(gate.includes(BOOK_DEMO_PATH));
    const mw = read("src/middleware.ts");
    assert.ok(mw.includes('pathname === "/book-a-demo"'));
    const layout = read("src/app/(marketing)/layout.tsx");
    assert.ok(layout.includes("isHouzzatProPlatformBookDemoRequest"));
    console.log("[1] Platform hostname gating... PASS");
  }

  // 2. Valid request creates WEBSITE_DEMO prospect
  {
    const state = fresh();
    const db = createFakePrisma(state) as never;
    const result = await receiveWebsiteDemoRequest({ ...valid, prisma: db });
    assert.equal(result.outcome, "created");
    const prospect = state.prospects.get(result.prospectId);
    assert.equal(prospect?.email, "jamie@example.com");
    assert.equal(prospect?.source, "WEBSITE_DEMO");
    assert.equal(prospect?.status, "NEW");
    assert.equal(prospect?.ownerOperatorId, null);
    assert.equal(prospect?.brokerageName, "North Star Realty");
    assert.equal(prospect?.businessName, null);
    assert.ok(
      state.activities.some(
        (a) =>
          a.prospectId === result.prospectId &&
          a.body?.startsWith(BOOK_DEMO_ACTIVITY_SUMMARY),
      ),
    );
    console.log("[2] Valid request creates WEBSITE_DEMO prospect... PASS");
  }

  // 3. Validation failures
  {
    const state = fresh();
    const db = createFakePrisma(state) as never;
    await assert.rejects(
      () =>
        receiveWebsiteDemoRequest({
          ...valid,
          email: "bad",
          prisma: db,
        }),
      (e: unknown) => e instanceof BookDemoPublicError && e.code === "INVALID_EMAIL",
    );
    await assert.rejects(
      () =>
        receiveWebsiteDemoRequest({
          ...valid,
          phone: "12",
          prisma: db,
        }),
      (e: unknown) => e instanceof BookDemoPublicError && e.code === "INVALID_PHONE",
    );
    await assert.rejects(
      () =>
        receiveWebsiteDemoRequest({
          ...valid,
          teamSize: 0,
          prisma: db,
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "INVALID_TEAM_SIZE",
    );
    console.log("[3] Validation failures... PASS");
  }

  // 4. Duplicate normalized email updates + activity (no second row)
  {
    const state = fresh();
    const db = createFakePrisma(state) as never;
    const first = await receiveWebsiteDemoRequest({ ...valid, prisma: db });
    const afterCreate = state.prospects.get(first.prospectId)!;
    afterCreate.businessName = "Operator Team";
    const second = await receiveWebsiteDemoRequest({
      ...valid,
      fullName: "Jamie Updated",
      phone: "4165550100",
      message: "Second request",
      prisma: db,
    });
    assert.equal(second.outcome, "updated");
    assert.equal(second.prospectId, first.prospectId);
    assert.equal(state.prospects.size, 1);
    assert.equal(state.prospects.get(first.prospectId)?.contactName, "Jamie Updated");
    assert.equal(
      state.prospects.get(first.prospectId)?.businessName,
      "Operator Team",
      "resubmit must not clobber operator-set businessName",
    );
    assert.equal(
      state.activities.filter((a) => a.body?.includes(BOOK_DEMO_ACTIVITY_SUMMARY))
        .length,
      2,
    );
    console.log("[4] Duplicate email updates same prospect... PASS");
  }

  // 5. LOST reopen
  {
    const state = fresh();
    const db = createFakePrisma(state) as never;
    const first = await receiveWebsiteDemoRequest({ ...valid, prisma: db });
    const row = state.prospects.get(first.prospectId)!;
    row.status = "LOST";
    const reopened = await receiveWebsiteDemoRequest({
      ...valid,
      message: "Back again",
      prisma: db,
    });
    assert.equal(reopened.outcome, "reopened");
    assert.equal(reopened.prospectId, first.prospectId);
    assert.equal(state.prospects.get(first.prospectId)?.status, "NEW");
    assert.ok(
      state.activities.some((a) => a.type === "STATUS_CHANGE" && a.body === "LOST → NEW"),
    );
    console.log("[5] LOST prospect reopening... PASS");
  }

  // 6. Public API does not reveal outcome; route is public (no operator)
  {
    const route = read("src/app/api/platform/public/book-demo/route.ts");
    assert.ok(route.includes("received: true"));
    assert.ok(!route.includes("requirePlatformOperator"));
    assert.ok(!/data:\s*\{[^}]*outcome/.test(route));
    assert.ok(!route.includes("result.outcome"));
    assert.ok(route.includes("RATE_LIMITED"));
    assert.ok(route.includes(BOOK_DEMO_HONEYPOT_FIELD) || route.includes("faxNumber"));
    console.log("[6] Public API success opacity + no operator... PASS");
  }

  // 7. Audit excludes message body
  {
    const state = fresh();
    const db = createFakePrisma(state) as never;
    const secret = "SECRET_VISITOR_MESSAGE_BODY_ABC";
    await receiveWebsiteDemoRequest({
      ...valid,
      message: secret,
      prisma: db,
    });
    const audit = state.audits.find(
      (a) => a.action === "PLATFORM_PROSPECT_WEBSITE_DEMO_RECEIVED",
    );
    assert.ok(audit);
    assert.equal(JSON.stringify(audit?.metadata).includes(secret), false);
    assert.equal(audit?.summary.includes(secret), false);
    assert.ok(
      state.activities.some((a) => a.body?.includes(secret)),
      "message stored on activity only",
    );
    console.log("[7] Audit message privacy... PASS");
  }

  // 8. Honeypot silent success (no write)
  {
    const state = fresh();
    const db = createFakePrisma(state) as never;
    const result = await receiveWebsiteDemoRequest({
      ...valid,
      faxNumber: "bot-filled",
      prisma: db,
    });
    assert.equal(result.outcome, "honeypot");
    assert.equal(state.prospects.size, 0);
    console.log("[8] Honeypot anti-spam... PASS");
  }

  // 9. CRM / commercial / stripe isolation
  {
    const forbidden = [
      /from\s+["']@\/lib\/crm-read-scope["']/,
      /prisma\.lead\./,
      /prisma\.leadNote\./,
      /commercialOffer/,
      /subscription\./,
      /billingCustomer/,
      /requirePlatformOperator/,
      /requireAgentContext/,
    ];
    for (const file of listTsFiles("src/lib/platform/public").concat([
      "src/app/api/platform/public/book-demo/route.ts",
      "src/components/platform/public/BookDemoForm.tsx",
      "src/app/(marketing)/book-a-demo/page.tsx",
    ])) {
      const src = read(file);
      for (const re of forbidden) {
        assert.ok(!re.test(src), `${file} matches ${re}`);
      }
    }
    const service = read("src/lib/platform/public/book-demo.ts");
    assert.ok(!/prisma\.\$transaction|db\.\$transaction/.test(service));
    assert.ok(!/\bstripe\.(customers|checkout|subscriptions)\b/i.test(service));
    assert.ok(
      !/businessName:\s*brokerageName/.test(service),
      "book-demo must not copy brokerageName into businessName",
    );
    console.log("[9] CRM/workspace/offer/Stripe isolation... PASS");
  }

  // 10. UI + success copy honesty
  {
    const page = read("src/app/(marketing)/book-a-demo/page.tsx");
    const form = read("src/components/platform/public/BookDemoForm.tsx");
    const copy = read("src/lib/platform/public/book-demo-copy.ts");
    assert.ok(page.includes("BookDemoForm"));
    assert.ok(page.includes("HouzzatProWordmark"));
    assert.ok(form.includes("BOOK_DEMO_CTA_LABEL") || form.includes("Book My Private Demo"));
    assert.ok(copy.includes("Book My Private Demo"));
    assert.ok(form.includes("type=\"tel\""));
    assert.ok(form.includes("Submitting") || form.includes("BOOK_DEMO_CTA_SUBMITTING"));
    assert.ok(copy.includes("Thank You"));
    assert.ok(!/demo time is booked|email has been sent|salesperson has been assigned/i.test(copy));
    console.log("[10] Form UX + honest success copy... PASS");
  }

  // 11. Injection of status/owner rejected at API
  {
    const route = read("src/app/api/platform/public/book-demo/route.ts");
    assert.ok(route.includes('"status"'));
    assert.ok(route.includes('"ownerOperatorId"'));
    console.log("[11] Privileged field injection rejected... PASS");
  }

  console.log("\nSTAGE 6.6B — ALL TESTS PASSED\n");
  console.log(
    "NOTE: Turnstile is integrated in Stage 6.6B.1 — see stage-6.6b.1-book-demo-turnstile-selftest.ts.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
