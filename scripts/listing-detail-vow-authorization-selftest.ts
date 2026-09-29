/**
 * Hermetic VOW redaction for GET /api/listings/[mlsNumber].
 * Run: pnpm listing-detail-vow-authorization:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMAIL_VERIFY_GRACE_MS, hasFullClientAccess } from "@/lib/account-access";
import {
  buildAuthorizedAddressListingHistoryRows,
  buildListingPanelPayload,
  redactListingVowRestrictedFields,
  resolveListingDetailAccess,
} from "@/lib/listings/build-listing-panel";
import type { ListingDetail } from "@/lib/listings/types";
import { hasClientAccess } from "@/lib/vow";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const SOLD_PRICE = 875_000;
const LIST_PRICE = 899_000;
const RESTRICTED_HISTORY_PRICE = 840_000;
const SIBLING_SOLD_PRICE = 650_000;
const MLS_A = "W1111111";
const MLS_B = "W2222222";

const now = new Date("2026-09-01T12:00:00.000Z");

function historyRow(partial: {
  id: string;
  event: string;
  price: number | null;
  visibility: string;
  originalPrice?: number | null;
  note?: string | null;
}) {
  return {
    id: partial.id,
    listingId: "listing_1",
    event: partial.event,
    price: partial.price,
    originalPrice: partial.originalPrice ?? null,
    contractDate: now,
    lastUpdatedAt: now,
    externalMls: null,
    visibility: partial.visibility,
    note: partial.note ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function sampleSoldListing(mlsNumber: string): ListingDetail {
  return {
    id: `id_${mlsNumber}`,
    mlsNumber,
    listingKey: `key_${mlsNumber}`,
    status: "SOLD",
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    dataSource: "mls",
    propertyType: "DETACHED",
    listPrice: LIST_PRICE,
    soldPrice: SOLD_PRICE,
    beds: 3,
    baths: 2,
    sqft: 1800,
    parkingSpaces: 2,
    yearBuilt: 1998,
    taxes: 4200,
    maintenanceFee: null,
    addressLine: "10 Test Street",
    unitNumber: null,
    city: "Toronto",
    community: "The Annex",
    postalCode: "M5R1A1",
    province: "ON",
    lat: 43.67,
    lng: -79.4,
    description: "Public listing remarks.",
    brokerageName: "Test Brokerage",
    facts: { lotSize: "25 x 120" },
    listedAt: new Date("2026-03-01T00:00:00.000Z"),
    soldAt: new Date("2026-06-15T00:00:00.000Z"),
    updatedAtMls: now,
    daysOnMarket: 40,
    addressHistoryEnrichedAt: null,
    isMock: true,
    organizationId: "org_trreb",
    providerKey: "proptx",
    ownerUserId: null,
    ownerStatus: null,
    listedUntil: null,
    ownerReviewedAt: null,
    ownerReviewedById: null,
    ownerReviewNote: null,
    createdAt: now,
    updatedAt: now,
    media: [
      {
        id: "media_1",
        listingId: `id_${mlsNumber}`,
        url: "https://cdn.example/photo.jpg",
        sortOrder: 0,
        isPrimary: true,
      },
    ],
    openHouses: [],
    rooms: [],
    history: [
      historyRow({
        id: "hist_public_listed",
        event: "Listed",
        price: LIST_PRICE,
        visibility: "public",
      }),
      historyRow({
        id: "hist_restricted_sold",
        event: "Sold",
        price: RESTRICTED_HISTORY_PRICE,
        visibility: "restricted",
      }),
      historyRow({
        id: "hist_synced",
        event: "Synced",
        price: SOLD_PRICE,
        visibility: "restricted",
        note: "synthetic:empty",
      }),
    ],
  } as ListingDetail;
}

const sibling = {
  mlsNumber: "W9999999",
  status: "SOLD" as const,
  transactionType: "SALE" as const,
  listPrice: 700_000,
  soldPrice: SIBLING_SOLD_PRICE,
  listedAt: new Date("2024-01-01T00:00:00.000Z"),
  soldAt: new Date("2024-04-01T00:00:00.000Z"),
  updatedAtMls: now,
  addressLine: "10 Test Street",
  unitNumber: null,
  city: "Toronto",
  province: "ON",
  postalCode: "M5R1A1",
  history: [],
};

function serializeApiBody(
  listing: ListingDetail,
  user: { id: string; emailVerified?: Date | null; createdAt?: Date | null } | null,
) {
  const access = resolveListingDetailAccess(user, listing);
  const redacted = redactListingVowRestrictedFields(
    listing,
    access.canSeeRestricted,
  );
  const historyRows = buildAuthorizedAddressListingHistoryRows({
    mlsNumber: listing.mlsNumber,
    listPrice: listing.listPrice,
    listedAt: listing.listedAt,
    updatedAtMls: listing.updatedAtMls,
    soldAt: listing.soldAt,
    soldPrice: listing.soldPrice,
    status: listing.status,
    transactionType: listing.transactionType,
    history: listing.history,
    siblings: [sibling],
    canSeeRestricted: access.canSeeRestricted,
  });
  return JSON.parse(
    JSON.stringify({
      listing: { ...redacted, media: listing.media },
      historyRows,
      provider: "neon",
      access,
    }),
  ) as {
    listing: ListingDetail;
    historyRows: Array<{
      id: string;
      price: number | null;
      originalPrice: number | null;
      public: boolean;
      event: string;
    }>;
    access: { canSeeRestricted: boolean };
  };
}

function assertNoRestrictedSoldDollars(payload: unknown, label: string) {
  const raw = JSON.stringify(payload);
  assert.equal(
    raw.includes(String(SOLD_PRICE)),
    false,
    `${label}: soldPrice dollars leaked`,
  );
  assert.equal(
    raw.includes(String(RESTRICTED_HISTORY_PRICE)),
    false,
    `${label}: restricted history price leaked`,
  );
  assert.equal(
    raw.includes(String(SIBLING_SOLD_PRICE)),
    false,
    `${label}: sibling sold price leaked`,
  );
}

function overlayShowsSoldPrice(listing: { status: string; soldPrice: number | null }) {
  const isClosed = listing.status === "SOLD" || listing.status === "LEASED";
  return isClosed && listing.soldPrice != null;
}

function main() {
  const visitor = serializeApiBody(sampleSoldListing(MLS_A), null);
  assert.equal(visitor.access.canSeeRestricted, false);
  assert.equal(visitor.listing.soldPrice, null);
  assert.equal(visitor.listing.listPrice, LIST_PRICE);
  assert.equal(visitor.listing.addressLine, "10 Test Street");
  assert.equal(visitor.listing.description, "Public listing remarks.");
  assert.equal(visitor.listing.media.length, 1);
  assert.equal(
    visitor.listing.history.some((h) => h.visibility === "restricted"),
    false,
  );
  assert.equal(
    visitor.listing.history.some((h) => h.event === "Sold"),
    false,
  );
  const guestCurrent = visitor.historyRows.find((r) => r.id.startsWith("current-"));
  assert.ok(guestCurrent);
  assert.equal(guestCurrent!.price, LIST_PRICE);
  for (const row of visitor.historyRows) {
    if (!row.public) {
      assert.equal(row.price, null);
      assert.equal(row.originalPrice, null);
    }
  }
  assert.equal(overlayShowsSoldPrice(visitor.listing), false);
  assertNoRestrictedSoldDollars(visitor, "signed-out");

  const unverifiedLocked = serializeApiBody(sampleSoldListing(MLS_A), {
    id: "cust_locked",
    emailVerified: null,
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS - 86_400_000),
  });
  assert.equal(
    hasFullClientAccess({
      id: "cust_locked",
      emailVerified: null,
      createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS - 86_400_000),
    }),
    false,
  );
  assert.equal(unverifiedLocked.listing.soldPrice, null);
  assertNoRestrictedSoldDollars(unverifiedLocked, "unauthorized-customer");

  const verified = {
    id: "cust_ok",
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const authorized = serializeApiBody(sampleSoldListing(MLS_A), verified);
  assert.equal(hasClientAccess(verified), true);
  assert.equal(authorized.listing.soldPrice, SOLD_PRICE);
  assert.ok(
    authorized.listing.history.some(
      (h) => h.visibility === "restricted" && h.price === RESTRICTED_HISTORY_PRICE,
    ),
  );
  const authCurrent = authorized.historyRows.find((r) => r.id.startsWith("current-"));
  assert.equal(authCurrent?.price, SOLD_PRICE);
  assert.equal(overlayShowsSoldPrice(authorized.listing), true);

  const graceUser = {
    id: "cust_grace",
    emailVerified: null,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  };
  const grace = serializeApiBody(sampleSoldListing(MLS_A), graceUser);
  assert.equal(hasClientAccess(graceUser), true);
  assert.equal(grace.listing.soldPrice, SOLD_PRICE);

  const staffLikeVerified = serializeApiBody(sampleSoldListing(MLS_A), {
    id: "agent_1",
    emailVerified: new Date("2025-01-01T00:00:00.000Z"),
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  });
  assert.equal(staffLikeVerified.listing.soldPrice, SOLD_PRICE);

  const disabledCanonical = hasFullClientAccess({
    id: "disabled_verified",
    emailVerified: new Date("2025-01-01T00:00:00.000Z"),
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  });
  assert.equal(
    disabledCanonical,
    true,
    "canonical hasClientAccess does not inspect disabledAt",
  );

  const otherMls = serializeApiBody(sampleSoldListing(MLS_B), null);
  assert.equal(otherMls.listing.mlsNumber, MLS_B);
  assert.equal(otherMls.listing.soldPrice, null);
  assertNoRestrictedSoldDollars(otherMls, "mls-swap");

  const panelGuest = buildListingPanelPayload(sampleSoldListing(MLS_A), null);
  assert.equal(panelGuest.ok, true);
  if (panelGuest.ok) {
    assert.equal(panelGuest.payload.listing.soldPrice, null);
    assert.equal(
      panelGuest.payload.listing.history.some((h) => h.visibility === "restricted"),
      false,
    );
  }

  const route = read("src/app/api/listings/[mlsNumber]/route.ts");
  assert.ok(route.includes("resolveListingDetailAccess"));
  assert.ok(route.includes("redactListingVowRestrictedFields"));
  assert.ok(route.includes("buildAuthorizedAddressListingHistoryRows"));
  assert.ok(route.includes("canSeeRestricted"));
  assert.ok(!route.includes("listing: { ...listing, media }"));

  const byMls = read("src/app/api/listings/by-mls/route.ts");
  assert.ok(byMls.includes("hasClientAccess"));
  assert.ok(byMls.includes("soldPrice: null"));
  const search = read("src/app/api/listings/search/route.ts");
  assert.ok(search.includes("hasClientAccess"));
  assert.ok(search.includes("soldPrice: null"));

  console.log("listing-detail-vow-authorization selftest: ok");
}

main();
