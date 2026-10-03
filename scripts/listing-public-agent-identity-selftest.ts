/**
 * Workspace public agent identity for Listing Detail.
 * Run: pnpm listing-public-agent-identity:selftest
 *
 * Hermetic: injected Prisma only. Never reads MLS brokerageName as the agent.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type { ListingPanelPayload } from "@/lib/listings/build-listing-panel";
import { panelPayloadToDetailViewProps } from "@/lib/listings/map-panel-to-detail-view";
import {
  resolvePublicAgentIdentity,
  type PublicAgentIdentity,
} from "@/lib/tenancy/resolve-public-agent-identity";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type WorkspaceRow = {
  brokerageAffiliation: string | null;
  primaryAgentId: string | null;
  professionalIdentity: {
    agentRegisteredName: string | null;
    agentDesignation: string | null;
    agentCellPhone: string | null;
    brokerageRegisteredName: string | null;
    brokeragePhone: string | null;
  } | null;
  branding: {
    displayName: string | null;
    contactEmail: string | null;
    agentProfilePhotoUrl: string | null;
    brokerageLogoUrl: string | null;
  } | null;
  primaryAgent: {
    name: string | null;
    email: string | null;
    phone: string | null;
    agentProfile: {
      bio: string | null;
      phone: string | null;
      markets: string[];
      active: boolean;
    } | null;
  } | null;
};

function workspace(
  partial: Partial<WorkspaceRow> & { name: string; email: string },
): WorkspaceRow {
  return {
    brokerageAffiliation: partial.brokerageAffiliation ?? null,
    primaryAgentId: "agent-user",
    professionalIdentity: partial.professionalIdentity ?? {
      agentRegisteredName: partial.name,
      agentDesignation: "Sales Representative",
      agentCellPhone: "416-555-0100",
      brokerageRegisteredName: "Workspace Brokerage",
      brokeragePhone: "905-555-0100",
    },
    branding: partial.branding ?? {
      displayName: "Workspace",
      contactEmail: partial.email,
      agentProfilePhotoUrl: "https://cdn.example/a.jpg",
      brokerageLogoUrl: "https://cdn.example/logo.png",
    },
    primaryAgent: partial.primaryAgent ?? {
      name: partial.name,
      email: partial.email,
      phone: "416-555-0101",
      agentProfile: {
        bio: "Bio",
        phone: "416-555-0102",
        markets: ["Mississauga"],
        active: true,
      },
    },
  };
}

function prismaFor(rows: Record<string, WorkspaceRow | null>) {
  const calls: string[] = [];
  const client = {
    workspace: {
      findUnique: async (args: { where: { id: string } }) => {
        calls.push(args.where.id);
        return rows[args.where.id] ?? null;
      },
    },
  };
  return { client: client as unknown as PrismaClient, calls };
}

function assertPublicOnly(identity: PublicAgentIdentity) {
  const keys = Object.keys(identity).sort();
  assert.deepEqual(keys, [
    "bio",
    "brokerageLogoUrl",
    "brokerageName",
    "brokeragePhone",
    "email",
    "markets",
    "name",
    "phone",
    "photoUrl",
    "title",
  ]);
}

async function main() {
  const a = workspace({ name: "Agent A", email: "a@workspace-a.test" });
  const b = workspace({
    name: "Agent B",
    email: "b@workspace-b.test",
    professionalIdentity: {
      agentRegisteredName: "Agent B",
      agentDesignation: "Broker",
      agentCellPhone: "647-555-0199",
      brokerageRegisteredName: "Other Brokerage",
      brokeragePhone: "905-555-0199",
    },
    branding: {
      displayName: "Other",
      contactEmail: "b@workspace-b.test",
      agentProfilePhotoUrl: "https://cdn.example/b.jpg",
      brokerageLogoUrl: "https://cdn.example/b-logo.png",
    },
  });

  const isolated = prismaFor({ "ws-a": a, "ws-b": b });
  const identityA = await resolvePublicAgentIdentity("ws-a", isolated.client);
  const identityB = await resolvePublicAgentIdentity("ws-b", isolated.client);
  assert.deepEqual(isolated.calls, ["ws-a", "ws-b"]);
  assert.equal(identityA.name, "Agent A");
  assert.equal(identityA.email, "a@workspace-a.test");
  assert.equal(identityB.name, "Agent B");
  assert.equal(identityB.brokerageName, "Other Brokerage");
  assert.notEqual(identityA.email, identityB.email);
  assert.notEqual(identityA.photoUrl, identityB.photoUrl);
  assertPublicOnly(identityA);

  const emptyCalls = prismaFor({});
  const missingWorkspace = await resolvePublicAgentIdentity(
    "   ",
    emptyCalls.client,
  );
  assert.equal(emptyCalls.calls.length, 0);
  assert.equal(missingWorkspace.name, null);
  assert.deepEqual(missingWorkspace.markets, []);

  const sparse = prismaFor({
    "ws-sparse": {
      brokerageAffiliation: "   ",
      primaryAgentId: null,
      professionalIdentity: {
        agentRegisteredName: "Named Agent",
        agentDesignation: "  ",
        agentCellPhone: "",
        brokerageRegisteredName: null,
        brokeragePhone: null,
      },
      branding: {
        displayName: "Brand",
        contactEmail: null,
        agentProfilePhotoUrl: null,
        brokerageLogoUrl: null,
      },
      primaryAgent: null,
    },
  });
  const sparseIdentity = await resolvePublicAgentIdentity(
    "ws-sparse",
    sparse.client,
  );
  assert.equal(sparseIdentity.name, "Named Agent");
  assert.equal(sparseIdentity.title, null);
  assert.equal(sparseIdentity.photoUrl, null);
  assert.equal(sparseIdentity.phone, null);
  assert.equal(sparseIdentity.email, null);
  assert.equal(sparseIdentity.brokerageName, null);
  assert.equal(sparseIdentity.bio, null);

  const unknown = await resolvePublicAgentIdentity(
    "ws-missing",
    prismaFor({}).client,
  );
  assert.equal(unknown.name, null);

  const props = panelPayloadToDetailViewProps({
    access: {
      signedIn: true,
      canSeeRestricted: true,
      detailsLocked: false,
      needsEmailVerification: false,
      vowBlocked: false,
      gateDetails: {
        title: "Details",
        body: "Body",
        cta: "sign-in",
        ctaLabel: "Sign in",
      },
      gateSold: {
        title: "Sold",
        body: "Body",
        cta: "sign-in",
        ctaLabel: "Sign in",
      },
    },
    canonicalPath: "/listing/sample/X1",
    photos: [],
    listingHistoryRows: [],
    sessionContact: null,
    publicAgent: identityA,
    listing: {
      id: "listing-1",
      mlsNumber: "X1",
      listingKey: null,
      status: "ACTIVE",
      transactionType: "SALE",
      segment: "RESIDENTIAL",
      propertyType: "DETACHED",
      dataSource: "proptx",
      listPrice: 1,
      soldPrice: null,
      beds: 3,
      baths: 2,
      sqft: null,
      parkingSpaces: 2,
      addressLine: "1 Main St",
      unitNumber: null,
      city: "Mississauga",
      community: null,
      province: "ON",
      postalCode: null,
      description: "",
      brokerageName: "MLS Listing Brokerage",
      taxes: null,
      maintenanceFee: null,
      yearBuilt: null,
      lat: 0,
      lng: 0,
      listedAt: "2026-01-01T00:00:00.000Z",
      soldAt: null,
      updatedAtMls: null,
      facts: null,
      history: [],
      media: [],
      rooms: [],
      openHouses: [],
    },
  } as ListingPanelPayload);
  assert.equal(props.publicAgent?.name, "Agent A");
  assert.equal(props.publicAgent?.brokerageName, "Workspace Brokerage");
  assert.notEqual(props.publicAgent?.name, "MLS Listing Brokerage");
  assert.notEqual(
    props.publicAgent?.brokerageName,
    props.listing.brokerageName,
  );

  const withoutAgent = panelPayloadToDetailViewProps({
    ...({
      access: props && {
        signedIn: false,
        canSeeRestricted: false,
        detailsLocked: false,
        needsEmailVerification: false,
        vowBlocked: false,
        gateDetails: {
          title: "Details",
          body: "Body",
          cta: "sign-in",
          ctaLabel: "Sign in",
        },
        gateSold: {
          title: "Sold",
          body: "Body",
          cta: "sign-in",
          ctaLabel: "Sign in",
        },
      },
      canonicalPath: "/listing/sample/X1",
      photos: [],
      listingHistoryRows: [],
      sessionContact: null,
      listing: {
        id: "listing-1",
        mlsNumber: "X1",
        listingKey: null,
        status: "ACTIVE",
        transactionType: "SALE",
        segment: "RESIDENTIAL",
        propertyType: "DETACHED",
        dataSource: "proptx",
        listPrice: 1,
        soldPrice: null,
        beds: 3,
        baths: 2,
        sqft: null,
        parkingSpaces: 2,
        addressLine: "1 Main St",
        unitNumber: null,
        city: "Mississauga",
        community: null,
        province: "ON",
        postalCode: null,
        description: "",
        brokerageName: "MLS Listing Brokerage",
        taxes: null,
        maintenanceFee: null,
        yearBuilt: null,
        lat: 0,
        lng: 0,
        listedAt: "2026-01-01T00:00:00.000Z",
        soldAt: null,
        updatedAtMls: null,
        facts: null,
        history: [],
        media: [],
        rooms: [],
        openHouses: [],
      },
    } as ListingPanelPayload),
  });
  assert.equal(withoutAgent.publicAgent, null);
  assert.equal(withoutAgent.listing.brokerageName, "MLS Listing Brokerage");

  const page = read("src/app/(marketing)/listing/[...parts]/page.tsx");
  const panel = read("src/app/api/listings/[mlsNumber]/panel/route.ts");
  const view = read("src/components/listings/ListingDetailView.tsx");
  const mapper = read("src/lib/listings/map-panel-to-detail-view.ts");

  assert.ok(page.includes("resolvePublicAgentIdentity(tenancy.workspaceId)"));
  assert.ok(page.includes("publicAgent={publicAgent}"));
  assert.ok(!page.includes("publicAgent={listing.brokerageName"));
  assert.ok(!page.includes("Ali Syed"));
  assert.ok(panel.includes("resolvePublicAgentIdentity(workspaceId)"));
  assert.ok(panel.includes("entitlement.workspaceId.trim()"));
  assert.ok(!panel.includes('searchParams.get("workspaceId")'));
  assert.ok(!panel.includes("listing.brokerageName"));
  assert.ok(mapper.includes("publicAgent: payload.publicAgent ?? null"));
  assert.ok(view.includes("publicAgent?: PublicAgentIdentity | null"));
  assert.ok(view.includes("<ListingAgentCard agent={publicAgent}"));
  assert.ok(!view.includes("publicAgent.name"));
  assert.equal(view.split("<ViewingRequestPanel").length - 1, 1);
  const agentCard = read("src/components/listings/ListingAgentCard.tsx");
  assert.ok(agentCard.includes("Your assigned Agent"));
  assert.ok(agentCard.includes("photoUrl"));
  assert.ok(agentCard.includes("brokerageLogoUrl"));
  assert.ok(agentCard.includes("brokerageName"));
  assert.ok(agentCard.includes("formatPhoneDisplay"));
  assert.ok(!agentCard.includes("sessionContact"));
  assert.ok(!agentCard.includes("Ali Syed"));
  assert.ok(!agentCard.includes("Contact Agent"));
  assert.ok(!agentCard.includes("mailto:"));

  const concierge = read("src/components/listings/ViewingRequestPanel.tsx");
  assert.ok(concierge.includes("useLeadRequestRestore"));
  assert.equal(concierge.split("useLeadRequestRestore(").length - 1, 1);
  assert.ok(concierge.includes('kind="inquiry"'));
  assert.ok(concierge.includes("kind={restoredViewing}"));
  assert.ok(concierge.includes("virtual_viewing"));
  assert.ok(concierge.includes("Ask about this home"));
  assert.ok(concierge.includes("Request Tour"));
  assert.ok(concierge.includes("RoutePlannerToggleButton"));
  assert.ok(view.includes('className="hidden md:block"'));
  assert.ok(!concierge.includes("Your assigned Agent"));
  assert.ok(!concierge.includes("Ali Syed"));
  assert.ok(!concierge.includes("Royal LePage"));
  assert.ok(!concierge.includes("647-221-4949"));
  assert.ok(!concierge.includes("MobilePublicAgentSection"));
  assert.ok(!concierge.includes("Twilio"));
  // Public agent presentation lives on ListingAgentCard (not concierge).
  assert.ok(agentCard.includes("rounded-full"));
  assert.ok(agentCard.includes("telHref") || agentCard.includes("tel:"));
  assert.ok(
    view.indexOf("<ListingNotesPanel") < view.indexOf("<ListingAgentCard"),
  );
  assert.ok(
    view.indexOf("<ListingAgentCard") < view.indexOf("<DriveTimePanel"),
  );
  const mobile = read("src/components/listings/ListingMobileActionBar.tsx");
  const booking = read("src/components/listings/ViewingBookingModal.tsx");
  assert.ok(mobile.includes("setBookingOpen(true)"));
  assert.equal(booking.split("useLeadRequestRestore(").length - 1, 1);
  assert.ok(
    page.includes("isListingSheet") && panel.includes("publicAgent"),
    "canonical page and panel route both carry the public identity",
  );

  console.log("listing-public-agent-identity selftest: ok");
}

void main();
