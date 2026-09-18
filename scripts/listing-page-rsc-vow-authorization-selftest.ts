/**
 * Hermetic VOW redaction for listing-page RSC → client props.
 * Run: pnpm listing-page-rsc-vow-authorization:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMAIL_VERIFY_GRACE_MS, hasFullClientAccess } from "@/lib/account-access";
import {
  resolveListingDetailAccess,
  serializeListingDetailClientModel,
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
const RESTRICTED_ORIGINAL = 860_000;
const now = new Date("2026-09-01T12:00:00.000Z");

function sampleSoldListing(): ListingDetail {
  return {
    id: "id_W1111111",
    mlsNumber: "W1111111",
    listingKey: "key_W1111111",
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
        listingId: "id_W1111111",
        url: "https://cdn.example/photo.jpg",
        sortOrder: 0,
        isPrimary: true,
      },
    ],
    openHouses: [],
    rooms: [],
    history: [
      {
        id: "hist_restricted_cut",
        listingId: "id_W1111111",
        event: "Price Change",
        price: RESTRICTED_HISTORY_PRICE,
        originalPrice: RESTRICTED_ORIGINAL,
        contractDate: new Date("2026-04-01T00:00:00.000Z"),
        lastUpdatedAt: now,
        externalMls: null,
        visibility: "restricted",
        note: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  } as ListingDetail;
}

function clientProps(
  user: { id: string; emailVerified?: Date | null; createdAt?: Date | null } | null,
) {
  const listing = sampleSoldListing();
  const access = resolveListingDetailAccess(user, listing);
  const model = serializeListingDetailClientModel(
    listing,
    access.canSeeRestricted,
  );
  return JSON.parse(
    JSON.stringify({
      listing: model.listing,
      listingHistoryRows: model.listingHistoryRows,
      canSeeRestricted: access.canSeeRestricted,
    }),
  ) as {
    listing: { soldPrice: number | null; listPrice: number; addressLine: string; history: Array<{ visibility?: string; price: number | null; originalPrice: number | null }> };
    listingHistoryRows: Array<{
      price: number | null;
      originalPrice: number | null;
      public: boolean;
    }>;
    canSeeRestricted: boolean;
  };
}

function assertNoRestrictedSoldDollars(payload: unknown, label: string) {
  const raw = JSON.stringify(payload);
  for (const amount of [SOLD_PRICE, RESTRICTED_HISTORY_PRICE, RESTRICTED_ORIGINAL]) {
    assert.equal(
      raw.includes(String(amount)),
      false,
      `${label}: restricted amount ${amount} leaked in RSC client props`,
    );
  }
}

function main() {
  const guest = clientProps(null);
  assert.equal(guest.canSeeRestricted, false);
  assert.equal(guest.listing.soldPrice, null);
  assert.equal(guest.listing.listPrice, LIST_PRICE);
  assert.equal(guest.listing.addressLine, "10 Test Street");
  assert.equal(
    guest.listing.history.some((h) => h.visibility === "restricted"),
    false,
  );
  for (const row of guest.listingHistoryRows) {
    if (!row.public) {
      assert.equal(row.price, null);
      assert.equal(row.originalPrice, null);
    }
  }
  const guestCurrent = guest.listingHistoryRows.find((r) =>
    JSON.stringify(r).includes("current-"),
  );
  if (guestCurrent) {
    assert.equal(guestCurrent.price, LIST_PRICE);
  }
  assertNoRestrictedSoldDollars(guest, "signed-out");

  const lockedUser = {
    id: "cust_locked",
    emailVerified: null,
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS - 86_400_000),
  };
  assert.equal(hasClientAccess(lockedUser), false);
  assertNoRestrictedSoldDollars(clientProps(lockedUser), "unauthorized-customer");

  const verified = {
    id: "cust_ok",
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  assert.equal(hasFullClientAccess(verified), true);
  const authorized = clientProps(verified);
  assert.equal(authorized.canSeeRestricted, true);
  assert.equal(authorized.listing.soldPrice, SOLD_PRICE);
  assert.ok(
    authorized.listing.history.some(
      (h) => h.price === RESTRICTED_HISTORY_PRICE,
    ),
  );
  const authCurrent = authorized.listingHistoryRows.find((r) =>
    JSON.stringify(r).includes("current-"),
  );
  assert.equal(authCurrent?.price, SOLD_PRICE);

  const graceUser = {
    id: "cust_grace",
    emailVerified: null,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  };
  assert.equal(hasClientAccess(graceUser), true);
  assert.equal(clientProps(graceUser).listing.soldPrice, SOLD_PRICE);

  const page = read("src/app/(marketing)/listing/[...parts]/page.tsx");
  assert.ok(page.includes("serializeListingDetailClientModel"));
  assert.ok(page.includes("listing={listingForClient}"));
  assert.ok(!page.includes("buildAddressListingHistoryRows({"));
  assert.ok(!/listing=\{listing\}(?!ForClient)/.test(page));

  const view = read("src/components/listings/ListingDetailView.tsx");
  assert.ok(view.includes("listing.soldPrice != null || !canSeeRestricted"));
  const soldFor = read("src/components/listings/SoldForPrice.tsx");
  assert.ok(soldFor.includes("locked || soldPrice == null"));

  console.log("listing-page-rsc-vow-authorization selftest: ok");
}

main();
