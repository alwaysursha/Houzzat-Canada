/**
 * Scheduled Morning Digest pipeline: assigned-agent signature, both tenants.
 * Run: pnpm morning-digest-signature:selftest
 *
 * Uses the production buyer-digest loop, the production signature resolver,
 * and isolated fixtures. It does not read or write production listings.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runBuyerSavedSearchDigests } from "../src/lib/email/digests/buyer";
import type { DigestListingCard } from "../src/lib/email/digests/search";
import {
  applyRegisteredAgentContact,
  resolveLeadCustomerEmailChrome,
  type TenantEmailAgentIdentity,
  type TenantEmailBrandDeps,
  type TenantEmailProfessionalIdentity,
} from "../src/lib/email/tenant-email-brand";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";

const HOUZZAT = "ws-houzzat";
const OCTANE = "ws-octane";
const LISTED_AT = new Date("2026-11-24T10:00:00.000Z");

type FixtureAgent = {
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  designation: string | null;
};

const houzzatProfessional: TenantEmailProfessionalIdentity = {
  brokerageRegisteredName: "Royal Lepage Credit Valley Real Estate",
  agentRegisteredName: "Houzzat Desk",
  agentDesignation: "Sales Representative",
  agentCellPhone: "6472214949",
};

const octaneProfessional: TenantEmailProfessionalIdentity = {
  brokerageRegisteredName: "Right at Home Realty Brokerage",
  agentRegisteredName: "Saad Qureshi",
  agentDesignation: "Sales Representative",
  agentCellPhone: "9055550199",
};

const agents: FixtureAgent[] = [
  {
    workspaceId: HOUZZAT,
    userId: "agent-ali",
    name: "Ali Syed",
    email: "ali@houzzat.test",
    phone: "6472214949",
    role: "ADMIN",
    designation: null,
  },
  {
    workspaceId: HOUZZAT,
    userId: "agent-demo",
    name: "Demo Agent",
    email: "demo@houzzat.test",
    phone: "6473854949",
    role: "AGENT",
    designation: null,
  },
  {
    workspaceId: OCTANE,
    userId: "agent-saad",
    name: "Saad Qureshi",
    email: "saad@octane.test",
    phone: "9055550199",
    role: "OWNER",
    designation: "Sales Representative",
  },
  {
    workspaceId: OCTANE,
    userId: "agent-jordan",
    name: "Jordan Blake",
    email: "jordan@octane.test",
    phone: "9055550101",
    role: "AGENT",
    designation: "Broker",
  },
];

const primaryAgentId: Record<string, string> = {
  [HOUZZAT]: "agent-ali",
  [OCTANE]: "agent-saad",
};

const professionalByWorkspace: Record<string, TenantEmailProfessionalIdentity> = {
  [HOUZZAT]: houzzatProfessional,
  [OCTANE]: octaneProfessional,
};

const assignment = new Map<string, string>([
  [`${HOUZZAT}:customer-demo`, "agent-demo"],
  [`${HOUZZAT}:customer-ali`, "agent-ali"],
  [`${OCTANE}:customer-jordan`, "agent-jordan"],
]);

function identityFor(
  workspaceId: string,
  userId: string,
): TenantEmailAgentIdentity | null {
  const agent = agents.find(
    (row) => row.workspaceId === workspaceId && row.userId === userId,
  );
  if (!agent) return null;
  const mapped: TenantEmailAgentIdentity = {
    userId: agent.userId,
    name: agent.name,
    email: agent.email,
    phone: agent.phone,
    image: null,
    designation: agent.designation,
  };
  return applyRegisteredAgentContact(mapped, {
    role: agent.role,
    primaryAgentId: primaryAgentId[workspaceId] ?? null,
    professional: professionalByWorkspace[workspaceId] ?? null,
  });
}

function fixtureBrandDeps(): TenantEmailBrandDeps {
  return {
    loadBranding: async () => null,
    loadEmailIdentity: async () => null,
    loadProfessionalIdentity: async (workspaceId) =>
      professionalByWorkspace[workspaceId] ?? null,
    loadAgentInWorkspace: async (workspaceId, userId) =>
      identityFor(workspaceId, userId),
    loadAssignedAgentForLead: async () => null,
    loadAssignedAgentForCustomer: async (workspaceId, customerId) => {
      const userId = assignment.get(`${workspaceId}:${customerId}`);
      if (!userId) return null;
      return identityFor(workspaceId, userId);
    },
    loadAgentEmailHeadshotAssociation: async () => null,
    resolveWebsiteUrl: async (workspaceId) =>
      workspaceId === OCTANE
        ? "https://highoctaneniagara.ca"
        : "https://houzzat.com",
    loadWorkspaceSlug: async (workspaceId) =>
      workspaceId === OCTANE ? HIGH_OCTANE_STAGING_WORKSPACE_SLUG : "houzzat",
  };
}

function listing(input: {
  mlsNumber: string;
  addressLine: string;
  city: string;
}): DigestListingCard {
  return {
    mlsNumber: input.mlsNumber,
    addressLine: input.addressLine,
    unitNumber: null,
    city: input.city,
    community: null,
    listPrice: 899000,
    soldPrice: null,
    beds: 3,
    bedsLabel: "3",
    baths: 2,
    sqft: 1600,
    imageUrl: null,
    status: "ACTIVE",
    listedAt: LISTED_AT,
    soldAt: null,
  };
}

const listingsByCity: Record<string, DigestListingCard> = {
  Mississauga: listing({
    mlsNumber: "FIXTURE-DEMO",
    addressLine: "10 Fixture Lane",
    city: "Mississauga",
  }),
  Oakville: listing({
    mlsNumber: "FIXTURE-ALI",
    addressLine: "20 Fixture Lane",
    city: "Oakville",
  }),
  "Niagara-on-the-Lake": listing({
    mlsNumber: "FIXTURE-OCTANE",
    addressLine: "30 Fixture Court",
    city: "Niagara-on-the-Lake",
  }),
};

function signatureCount(html: string): number {
  return html.split('data-houzzat-agent-signature="1"').length - 1;
}

function assertScheduledCallersUseTheResolver() {
  const buyer = readFileSync("src/lib/email/digests/buyer.ts", "utf8");
  const seller = readFileSync("src/lib/email/digests/seller.ts", "utf8");
  const monitors = readFileSync("src/lib/account/monitors.ts", "utf8");
  const brand = readFileSync("src/lib/email/tenant-email-brand.ts", "utf8");
  const runner = readFileSync("scripts/run-digests-mac.sh", "utf8");
  const installer = readFileSync(
    "scripts/macos/install-digests-launchagent.sh",
    "utf8",
  );
  for (const source of [buyer, seller, monitors]) {
    assert.match(source, /resolveLeadCustomerEmailChrome/);
  }
  assert.match(brand, /applyRegisteredAgentContact/);
  assert.match(brand, /mailto:/);
  assert.match(runner, /houzzat.com\/api\/cron\/digests/);
  assert.match(runner, /refusing to render digests from this checkout/);
  assert.match(installer, /refusing to render digests from this checkout/);
  const localBranch = runner.indexOf('DIGEST_CRON_URL=local');
  const localRender = runner.indexOf("pnpm digests:run");
  assert.ok(localBranch !== -1 && localRender > localBranch);
}

async function main() {
  assertScheduledCallersUseTheResolver();

  const primaries = new Map<
    string,
    {
      id: string;
      name: string;
      query: Record<string, string>;
      emailAlerts: boolean;
      lastAlertedAt: Date | null;
    }
  >([
    [
      "customer-demo",
      {
        id: "search-demo",
        name: "Mississauga homes",
        query: { city: "Mississauga", status: "ACTIVE" },
        emailAlerts: true,
        lastAlertedAt: null,
      },
    ],
    [
      "customer-ali",
      {
        id: "search-ali",
        name: "Oakville homes",
        query: { city: "Oakville", status: "ACTIVE" },
        emailAlerts: true,
        lastAlertedAt: null,
      },
    ],
    [
      "customer-jordan",
      {
        id: "search-jordan",
        name: "Niagara homes",
        query: { city: "Niagara-on-the-Lake", status: "ACTIVE" },
        emailAlerts: true,
        lastAlertedAt: null,
      },
    ],
  ]);

  const users = [
    {
      id: "customer-demo",
      email: "demo-customer@houzzat.test",
      name: "Demo Customer",
      workspaceId: HOUZZAT,
      lastBuyerDigestAt: null as Date | null,
    },
    {
      id: "customer-ali",
      email: "ali-customer@houzzat.test",
      name: "Ali Customer",
      workspaceId: HOUZZAT,
      lastBuyerDigestAt: null as Date | null,
    },
    {
      id: "customer-jordan",
      email: "jordan-customer@octane.test",
      name: "Jordan Customer",
      workspaceId: OCTANE,
      lastBuyerDigestAt: null as Date | null,
    },
  ];

  const sent: { to: string; subject: string; html: string; text: string }[] = [];
  const brandDeps = fixtureBrandDeps();

  const deps = {
    listUsers: async () => users,
    findPrimary: async (userId: string) => primaries.get(userId) ?? null,
    categoryEnabled: async () => true,
    findListings: async (query: unknown, opts: { since: Date }) => {
      const city =
        query && typeof query === "object" && "city" in query
          ? String((query as { city?: unknown }).city ?? "")
          : "";
      const card = listingsByCity[city];
      if (!card || opts.since.getTime() >= card.listedAt.getTime()) return [];
      return [card];
    },
    preferenceChrome: async (input: {
      userId: string;
      workspaceId: string;
      email: string;
    }) => ({
      manageUrl: `https://prefs.test/${input.workspaceId}/${input.userId}`,
      unsubscribeIntentUrl: `https://unsub.test/${input.workspaceId}/${input.userId}`,
      oneClickUrl: `https://oneclick.test/${input.workspaceId}/${input.userId}`,
      headers: {},
      manageTokenId: `manage-${input.userId}`,
      oneClickTokenId: `one-${input.userId}`,
    }),
    leadChrome: (
      input: Parameters<typeof resolveLeadCustomerEmailChrome>[0],
    ) =>
      resolveLeadCustomerEmailChrome(input, brandDeps, {
        TENANT_EMAIL_BRANDING: "off",
      }),
    publishedOverride: async () => null,
    send: async (input: {
      to: string;
      rendered: { subject: string; html: string; text: string };
    }) => {
      sent.push({
        to: input.to,
        subject: input.rendered.subject,
        html: input.rendered.html,
        text: input.rendered.text,
      });
      return { ok: true as const, status: "sent" as const };
    },
    push: () => undefined,
    persistCursor: async (userId: string, searchId: string, now: Date) => {
      const user = users.find((row) => row.id === userId);
      if (user) user.lastBuyerDigestAt = now;
      const primary = [...primaries.values()].find((row) => row.id === searchId);
      if (primary) primary.lastAlertedAt = now;
    },
    sleep: async () => undefined,
  };

  const first = await runBuyerSavedSearchDigests({ deps });
  assert.equal(first.sent, 3);
  assert.equal(first.failed, 0);
  assert.equal(sent.length, 3);

  const byTo = new Map(sent.map((row) => [row.to, row]));
  const demo = byTo.get("demo-customer@houzzat.test");
  const ali = byTo.get("ali-customer@houzzat.test");
  const octane = byTo.get("jordan-customer@octane.test");
  assert.ok(demo && ali && octane);

  assert.equal(signatureCount(demo.html), 1);
  assert.match(demo.html, /Demo Agent/);
  assert.match(demo.html, /mailto:demo@houzzat\.test/);
  assert.match(demo.html, /6473854949/);
  assert.match(demo.html, /Royal Lepage Credit Valley Real Estate/);
  assert.doesNotMatch(demo.html, /Sales Representative/);
  assert.doesNotMatch(demo.html, /Ali Syed/);
  assert.doesNotMatch(demo.html, /ali@houzzat\.test/);
  assert.match(demo.html, /10 Fixture Lane/);
  assert.match(demo.html, /Mississauga/);
  assert.match(demo.html, /utm_campaign=property_alert/);
  assert.match(demo.html, /https:\/\/unsub\.test\/ws-houzzat\/customer-demo/);
  assert.match(demo.html, /https:\/\/prefs\.test\/ws-houzzat\/customer-demo/);
  assert.doesNotMatch(demo.html, /data-email-presentation="high-octane"/);
  assert.doesNotMatch(demo.html, /Right at Home/);
  assert.doesNotMatch(demo.html, /Jordan Blake/);
  assert.doesNotMatch(demo.text, /Sales Representative/);

  assert.equal(signatureCount(ali.html), 1);
  assert.match(ali.html, /Ali Syed/);
  assert.match(ali.html, /Sales Representative/);
  assert.match(ali.html, /mailto:ali@houzzat\.test/);
  assert.match(ali.html, /6472214949/);
  assert.match(ali.html, /Royal Lepage Credit Valley Real Estate/);
  assert.match(ali.html, /20 Fixture Lane/);
  assert.match(ali.html, /Oakville/);
  assert.match(ali.html, /https:\/\/unsub\.test\/ws-houzzat\/customer-ali/);
  assert.doesNotMatch(ali.html, /Demo Agent/);
  assert.doesNotMatch(ali.html, /demo@houzzat\.test/);
  assert.doesNotMatch(ali.html, /Right at Home/);

  assert.equal(signatureCount(octane.html), 1);
  assert.match(octane.html, /data-email-presentation="high-octane"/);
  assert.match(octane.html, /Jordan Blake/);
  assert.match(octane.html, /Broker/);
  assert.match(octane.html, /mailto:jordan@octane\.test/);
  assert.match(octane.html, /9055550101/);
  assert.match(octane.html, /Right at Home Realty Brokerage/);
  assert.match(octane.html, /30 Fixture Court/);
  assert.match(octane.html, /https:\/\/unsub\.test\/ws-octane\/customer-jordan/);
  assert.doesNotMatch(octane.html, /Saad Qureshi/);
  assert.doesNotMatch(octane.html, /saad@octane\.test/);
  assert.doesNotMatch(octane.html, /Royal Lepage/);
  assert.doesNotMatch(octane.html, /Ali Syed/);
  assert.doesNotMatch(octane.html, /10 Fixture Lane/);

  sent.length = 0;
  const second = await runBuyerSavedSearchDigests({ deps });
  assert.equal(second.sent, 0);
  assert.equal(sent.length, 0);

  const fallback = await resolveLeadCustomerEmailChrome(
    { workspaceId: HOUZZAT, customerId: "customer-unassigned" },
    brandDeps,
    { TENANT_EMAIL_BRANDING: "off" },
  );
  const fallbackHtml = fallback?.chrome.agentSignatureHtml ?? "";
  assert.match(fallbackHtml, /Houzzat Desk/);
  assert.match(fallbackHtml, /Royal Lepage Credit Valley Real Estate/);
  assert.doesNotMatch(fallbackHtml, /mailto:/);
  assert.doesNotMatch(fallbackHtml, /Demo Agent/);
  assert.doesNotMatch(fallbackHtml, /jordan@octane\.test/);

  console.log("morning-digest-signature-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
