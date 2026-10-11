/**
 * Chat V1 Milestone 4U — LISTING_SHARE payload + snapshot (no DB).
 * Run: pnpm chat-listing-share:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LISTING_SHARE_CARD,
  LISTING_SHARE_PAYLOAD_VERSION,
  buildListingShareSnapshot,
  isListingSharePayload,
  isSafeListingShareImageUrl,
  parseListingShareClientRef,
  parseListingSharePayload,
  presentListingSharePayload,
  type ListingShareSourceListing,
} from "../src/lib/conversations/listing-share";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";
import { buildListingSourceAuthorityKey } from "../src/lib/typesense/listing-document";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const ORG_OTHER = "org_other_board";
const SAK_TRREB = buildListingSourceAuthorityKey(TRREB, "proptx")!;
const SAK_OTHER = buildListingSourceAuthorityKey(ORG_OTHER, "proptx")!;
const WS = "ws_houzzat";
const NOW = new Date("2026-10-10T12:00:00.000Z");

const entitled: WorkspaceListingEntitlement = {
  workspaceId: WS,
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS", "MEDIA", "SOLD", "HISTORY"],
    },
  ],
};

const otherTenant: WorkspaceListingEntitlement = {
  workspaceId: "ws_other",
  authorities: [
    {
      organizationId: ORG_OTHER,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_OTHER,
      capabilities: ["ACTIVE_LISTINGS", "MEDIA"],
    },
  ],
};

const emptyEntitlement: WorkspaceListingEntitlement = {
  workspaceId: WS,
  authorities: [],
};

function activeListing(
  overrides: Partial<ListingShareSourceListing> = {},
): ListingShareSourceListing {
  return {
    id: "listing_1",
    mlsNumber: "X1234567",
    status: "ACTIVE",
    transactionType: "SALE",
    propertyType: "DETACHED",
    listPrice: 899_000,
    soldPrice: 9_999_999,
    beds: 3,
    baths: 2,
    addressLine: "123 Main St",
    unitNumber: null,
    city: "Toronto",
    province: "ON",
    postalCode: "M5V 1A1",
    dataSource: "mls",
    organizationId: TRREB,
    providerKey: "proptx",
    ...overrides,
  };
}

function testSourceGuards() {
  const payloadSrc = read("src/lib/conversations/listing-share/payload.ts");
  const snapshotSrc = read("src/lib/conversations/listing-share/snapshot.ts");
  assert.match(payloadSrc, /LISTING_SHARE/);
  assert.match(payloadSrc, /\.strict\(\)/);
  assert.doesNotMatch(payloadSrc, /soldPrice:/);
  assert.doesNotMatch(payloadSrc, /from "@prisma\/client"/);
  assert.doesNotMatch(payloadSrc, /MessageAttachment/);
  assert.match(payloadSrc, /isSafeListingShareImageUrl/);
  assert.match(snapshotSrc, /evaluateWebListingDetailInventoryAccess/);
  assert.match(snapshotSrc, /resolveListingDetailAccess/);
  assert.match(snapshotSrc, /listingPhotoSrc/);
  assert.match(snapshotSrc, /listingPath/);
  assert.doesNotMatch(snapshotSrc, /sendAgentLeadChatMessage/);
  assert.doesNotMatch(snapshotSrc, /createConversationMessage/);
  assert.doesNotMatch(snapshotSrc, /prisma\./);
}

function testMalformedPayload() {
  assert.equal(parseListingSharePayload(null).ok, false);
  assert.equal(parseListingSharePayload({}).ok, false);
  assert.equal(
    parseListingSharePayload({
      card: LISTING_SHARE_CARD,
      version: LISTING_SHARE_PAYLOAD_VERSION,
      listingId: "x",
      mlsNumber: "X1",
      listPrice: 1,
      status: "ACTIVE",
      transactionType: "SALE",
      propertyType: "DETACHED",
      beds: 1,
      baths: 1,
      addressLine: "A",
      unitNumber: null,
      city: "T",
      province: "ON",
      postalCode: null,
      primaryImageUrl: null,
      href: "/listing/a/X1",
      sharedAt: NOW.toISOString(),
      soldPrice: 100,
    }).ok,
    false,
  );
  assert.equal(
    isSafeListingShareImageUrl("r2://bucket/key"),
    false,
  );
  assert.equal(
    isSafeListingShareImageUrl("https://evil.example/photo.jpg"),
    false,
  );
  assert.equal(
    isSafeListingShareImageUrl("https://ampre.ca/photo.jpg"),
    true,
  );
  assert.equal(
    parseListingShareClientRef({
      mlsNumber: "X1",
      listPrice: 1,
    }).ok,
    false,
  );
  assert.equal(
    parseListingShareClientRef({ mlsNumber: "x123" }).ok,
    true,
  );
}

function testAuthorizedActiveSnapshot() {
  const built = buildListingShareSnapshot({
    entitlement: entitled,
    trustedWorkspaceId: WS,
    listing: activeListing(),
    primaryMediaUrl: "https://ampre.ca/listing/primary.jpg",
    now: NOW,
    entitlementFilteringEnabled: true,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.payload.card, LISTING_SHARE_CARD);
  assert.equal(built.payload.version, 1);
  assert.equal(built.payload.listPrice, 899_000);
  assert.equal(built.payload.status, "ACTIVE");
  assert.equal(built.payload.mlsNumber, "X1234567");
  assert.ok(built.payload.href.startsWith("/listing/"));
  assert.ok(built.payload.href.includes("X1234567"));
  assert.equal(
    built.payload.primaryImageUrl,
    "https://ampre.ca/listing/primary.jpg",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(built.payload, "soldPrice"),
    false,
  );
  assert.equal(JSON.stringify(built.payload).includes("soldPrice"), false);
  assert.equal(JSON.stringify(built.payload).includes("9999999"), false);

  const presented = presentListingSharePayload(built.payload);
  assert.equal(presented?.listPrice, 899_000);
  assert.equal(isListingSharePayload(built.payload), true);
}

function testAuthorizationDenials() {
  assert.equal(
    buildListingShareSnapshot({
      entitlement: emptyEntitlement,
      trustedWorkspaceId: WS,
      listing: activeListing(),
      entitlementFilteringEnabled: true,
    }).ok,
    false,
  );

  assert.equal(
    (
      buildListingShareSnapshot({
        entitlement: otherTenant,
        trustedWorkspaceId: "ws_other",
        listing: activeListing(),
        entitlementFilteringEnabled: true,
      }) as { reason: string }
    ).reason,
    "WORKSPACE_NOT_ENTITLED",
  );

  // Cross-tenant: entitlement workspace mismatch vs trusted conversation ws
  assert.equal(
    (
      buildListingShareSnapshot({
        entitlement: entitled,
        trustedWorkspaceId: "ws_foreign",
        listing: activeListing(),
        entitlementFilteringEnabled: true,
      }) as { reason: string }
    ).reason,
    "WORKSPACE_NOT_ENTITLED",
  );

  for (const status of [
    "SOLD",
    "LEASED",
    "SUSPENDED",
    "EXPIRED",
    "TERMINATED",
  ] as const) {
    const result = buildListingShareSnapshot({
      entitlement: entitled,
      trustedWorkspaceId: WS,
      listing: activeListing({ status }),
      entitlementFilteringEnabled: true,
    });
    assert.equal(result.ok, false, status);
    if (!result.ok) {
      assert.ok(
        result.reason === "STATUS_NOT_SHAREABLE" ||
          result.reason === "RECIPIENT_RESTRICTED",
        status,
      );
    }
  }

  assert.equal(
    (
      buildListingShareSnapshot({
        entitlement: entitled,
        trustedWorkspaceId: WS,
        listing: null,
        entitlementFilteringEnabled: true,
      }) as { reason: string }
    ).reason,
    "LISTING_MISSING",
  );
}

function testMissingPhotoAndHistoricalPresentation() {
  const built = buildListingShareSnapshot({
    entitlement: entitled,
    trustedWorkspaceId: WS,
    listing: activeListing(),
    primaryMediaUrl: null,
    now: NOW,
    entitlementFilteringEnabled: true,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.payload.primaryImageUrl, null);

  // Unsafe media URL → null image, snapshot still ok
  const unsafe = buildListingShareSnapshot({
    entitlement: entitled,
    trustedWorkspaceId: WS,
    listing: activeListing(),
    primaryMediaUrl: "https://evil.example/x.jpg",
    now: NOW,
    entitlementFilteringEnabled: true,
  });
  assert.equal(unsafe.ok, true);
  if (unsafe.ok) assert.equal(unsafe.payload.primaryImageUrl, null);

  // Presentation never hydrates Listing — only parses snapshot
  const presentSrc = read(
    "src/lib/conversations/listing-share/payload.ts",
  );
  assert.match(presentSrc, /Does not load Listing/);
  assert.equal(presentListingSharePayload(built.payload)?.mlsNumber, "X1234567");
  assert.equal(presentListingSharePayload({ card: "ASSIGNED" }), null);
}

function testSoldConditionalShareable() {
  const built = buildListingShareSnapshot({
    entitlement: entitled,
    trustedWorkspaceId: WS,
    listing: activeListing({ status: "SOLD_CONDITIONAL" }),
    now: NOW,
    entitlementFilteringEnabled: true,
  });
  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.payload.status, "SOLD_CONDITIONAL");
    assert.equal(
      Object.prototype.hasOwnProperty.call(built.payload, "soldPrice"),
      false,
    );
  }
}

function main() {
  // Guest/IDX recipient floor assumes non-VOW-only site mode for these tests.
  process.env.PROPTX_FEED = "idx";
  testSourceGuards();
  testMalformedPayload();
  testAuthorizedActiveSnapshot();
  testAuthorizationDenials();
  testMissingPhotoAndHistoricalPresentation();
  testSoldConditionalShareable();
  console.log("chat-listing-share-selftest: ok");
}

main();
