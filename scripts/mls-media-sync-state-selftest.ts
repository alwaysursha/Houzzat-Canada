/**
 * Media sync completion state. Mocks only — no PropTx, no database.
 * Run: pnpm mls:media-sync:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEDIA_DELAYED_COOLDOWN_MS,
  MEDIA_DELAYED_GRACE_MS,
  completionMediaSourceStamp,
  mediaStampAfterOutcome,
  nightlyMediaBackfillRank,
  reconcileCappedMedia,
  shouldFetchListingMedia,
  type MediaSyncSnapshot,
} from "../src/lib/proptx/mls-media-sync-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-09-21T22:00:00.000Z");
const photoT1 = new Date("2026-09-01T12:00:00.000Z");
const photoT2 = new Date("2026-09-20T12:00:00.000Z");
const oldListed = new Date(now.getTime() - 10 * 24 * HOUR);
const freshListed = new Date(now.getTime() - 2 * HOUR);
const syncedRecently = new Date(now.getTime() - 1 * HOUR);
const syncedCooldownAgo = new Date(now.getTime() - MEDIA_DELAYED_COOLDOWN_MS - HOUR);

function snap(overrides: Partial<MediaSyncSnapshot> = {}): MediaSyncSnapshot {
  return {
    mediaCount: 3,
    mediaSourceTimestamp: photoT1,
    mediaSyncedAt: syncedRecently,
    listedAt: oldListed,
    photosChangeTimestamp: photoT1,
    now,
    ...overrides,
  };
}

function main() {
  console.log("\n=== MLS MEDIA SYNC STATE ===\n");

  {
    const one = shouldFetchListingMedia(snap({ mediaCount: 1 }));
    const three = shouldFetchListingMedia(snap({ mediaCount: 3 }));
    assert.equal(one.fetch, false);
    assert.equal(one.reason, "complete");
    assert.equal(three.fetch, false);
    assert.equal(three.reason, "complete");
    assert.equal(nightlyMediaBackfillRank({ ...snap({ mediaCount: 1 }), status: "ACTIVE" }), null);
    assert.equal(nightlyMediaBackfillRank({ ...snap({ mediaCount: 3 }), status: "ACTIVE" }), null);
    console.log("[1] stamped 1-photo and 3-photo listings are complete... PASS");
  }

  {
    const decision = shouldFetchListingMedia(
      snap({
        mediaCount: 5,
        photosChangeTimestamp: photoT2,
      }),
    );
    assert.equal(decision.fetch, true);
    assert.equal(decision.reason, "photo-timestamp");
    assert.equal(
      nightlyMediaBackfillRank({
        ...snap({ mediaCount: 5, photosChangeTimestamp: photoT2 }),
        status: "ACTIVE",
      }),
      2,
    );
    console.log("[2] 5-photo listing refreshes when the photo timestamp advances... PASS");
  }

  {
    const due = shouldFetchListingMedia(
      snap({
        mediaCount: 3,
        listedAt: new Date(now.getTime() - 30 * HOUR),
        mediaSyncedAt: syncedCooldownAgo,
      }),
    );
    assert.equal(due.fetch, true);
    assert.equal(due.reason, "delayed-retry");
    assert.ok(30 * HOUR < MEDIA_DELAYED_GRACE_MS);

    const inside = shouldFetchListingMedia(
      snap({
        mediaCount: 3,
        listedAt: freshListed,
        mediaSyncedAt: syncedRecently,
      }),
    );
    assert.equal(inside.fetch, false);
    assert.equal(inside.reason, "complete");
    const again = shouldFetchListingMedia(
      snap({
        mediaCount: 1,
        listedAt: freshListed,
        mediaSyncedAt: syncedRecently,
      }),
    );
    assert.equal(again.fetch, false);
    const graceOver = shouldFetchListingMedia(
      snap({
        mediaCount: 3,
        listedAt: new Date(now.getTime() - MEDIA_DELAYED_GRACE_MS - HOUR),
        mediaSyncedAt: syncedCooldownAgo,
      }),
    );
    assert.equal(graceOver.fetch, false);
    console.log("[3] delayed-photo retry waits out the cooldown... PASS");
  }

  {
    const zero = shouldFetchListingMedia(
      snap({
        mediaCount: 0,
        mediaSourceTimestamp: null,
        mediaSyncedAt: null,
        photosChangeTimestamp: null,
      }),
    );
    const still = shouldFetchListingMedia(
      snap({
        mediaCount: 0,
        mediaSourceTimestamp: null,
        mediaSyncedAt: syncedRecently,
        photosChangeTimestamp: photoT1,
      }),
    );
    assert.equal(zero.fetch, true);
    assert.equal(zero.reason, "zero-photos");
    assert.equal(still.fetch, true);
    assert.equal(still.reason, "zero-photos");
    assert.equal(
      nightlyMediaBackfillRank({
        ...snap({
          mediaCount: 0,
          mediaSourceTimestamp: null,
          mediaSyncedAt: null,
          photosChangeTimestamp: null,
        }),
        status: "SOLD_CONDITIONAL",
      }),
      0,
    );
    console.log("[4] zero photos stay retryable, including SOLD_CONDITIONAL... PASS");
  }

  {
    const previous = {
      mediaSourceTimestamp: photoT1,
      mediaSyncedAt: syncedRecently,
    };
    const completed = {
      mediaSourceTimestamp: photoT2,
      mediaSyncedAt: now,
    };
    assert.deepEqual(
      mediaStampAfterOutcome("error", previous, completed),
      previous,
    );
    assert.deepEqual(
      mediaStampAfterOutcome("empty", previous, completed),
      previous,
    );
    assert.deepEqual(
      mediaStampAfterOutcome("complete", previous, completed),
      completed,
    );
    console.log("[5] failed or empty fetches do not replace the stamp... PASS");
  }

  {
    const replaced = reconcileCappedMedia(
      [
        { url: "https://cdn.example/a.jpg", sortOrder: 0, isPrimary: true },
        { url: "https://cdn.example/b.jpg", sortOrder: 1, isPrimary: false },
        { url: "https://cdn.example/c.jpg", sortOrder: 2, isPrimary: false },
      ],
      [
        { url: "https://cdn.example/b.jpg", sortOrder: 0, isPrimary: true },
        { url: "https://cdn.example/a.jpg", sortOrder: 1, isPrimary: false },
        { url: "https://cdn.example/d.jpg", sortOrder: 2, isPrimary: false },
      ],
    );
    assert.deepEqual(
      replaced.deleteUrls,
      ["https://cdn.example/c.jpg"],
    );
    assert.equal(replaced.upserts[0]?.url, "https://cdn.example/b.jpg");
    assert.equal(replaced.upserts[0]?.isPrimary, true);
    assert.equal(replaced.upserts[1]?.sortOrder, 1);
    assert.equal(replaced.upserts[2]?.url, "https://cdn.example/d.jpg");

    const deleted = reconcileCappedMedia(
      [
        { url: "https://cdn.example/a.jpg", sortOrder: 0, isPrimary: true },
        { url: "https://cdn.example/b.jpg", sortOrder: 1, isPrimary: false },
      ],
      [{ url: "https://cdn.example/a.jpg", sortOrder: 0, isPrimary: true }],
    );
    assert.deepEqual(deleted.deleteUrls, ["https://cdn.example/b.jpg"]);
    console.log("[6] reorder, replace, and delete reconcile the capped set... PASS");
  }

  {
    const fresh = shouldFetchListingMedia(
      snap({
        mediaCount: 4,
        mediaSourceTimestamp: null,
        mediaSyncedAt: null,
        photosChangeTimestamp: null,
        listedAt: freshListed,
      }),
    );
    assert.equal(fresh.fetch, true);
    assert.equal(fresh.reason, "new-or-unsynced");
    assert.equal(
      nightlyMediaBackfillRank({
        ...snap({
          mediaCount: 4,
          mediaSourceTimestamp: null,
          mediaSyncedAt: null,
          photosChangeTimestamp: null,
        }),
        status: "ACTIVE",
      }),
      1,
    );

    const sameStamp = shouldFetchListingMedia(
      snap({
        mediaCount: 5,
        photosChangeTimestamp: photoT1,
        listedAt: freshListed,
      }),
    );
    assert.equal(sameStamp.fetch, false);

    const missingPhotoStamp = shouldFetchListingMedia(
      snap({
        mediaCount: 3,
        photosChangeTimestamp: null,
        listedAt: oldListed,
      }),
    );
    assert.equal(missingPhotoStamp.fetch, false);
    assert.equal(
      completionMediaSourceStamp({
        photosChangeTimestamp: null,
        modificationTimestamp: photoT2,
        fallback: oldListed,
      }).toISOString(),
      photoT2.toISOString(),
    );
    console.log("[7] new listings fetch once; same or missing photo stamps do not... PASS");
  }

  {
    const sync = read("src/lib/proptx/sync.ts");
    const backfillStart = sync.indexOf("async function syncMediaBackfill");
    const backfillEnd = sync.indexOf("async function syncSoldAtBackfill");
    const backfill = sync.slice(backfillStart, backfillEnd);
    assert.ok(!backfill.includes("<> ${cap}"));
    assert.ok(!backfill.includes(") <> "));
    assert.ok(backfill.includes("SOLD_CONDITIONAL"));
    assert.ok(backfill.includes("mediaSourceTimestamp"));
    assert.ok(backfill.includes("photosChangeTimestamp"));
    assert.ok(backfill.includes("mediaSyncedAt"));
    assert.ok(backfill.includes("shouldFetchListingMedia"));
    assert.ok(backfill.includes("commitMediaSyncStamp"));
    assert.ok(!backfill.includes("setCursor"));
    assert.ok(!backfill.includes("getCursor"));

    const upsertStart = sync.indexOf("async function upsertPropertyRow");
    const upsertEnd = sync.indexOf("export async function upsertPropTxPropertiesOnDemand");
    const upsert = sync.slice(upsertStart, upsertEnd);
    const skipAt = upsert.indexOf("FAST_UNCHANGED_SKIP");
    const fetchAt = upsert.indexOf("shouldFetchListingMedia");
    assert.ok(skipAt >= 0 && fetchAt > skipAt);
    assert.ok(upsert.includes("if (!decision.write)"));
    assert.ok(!upsert.includes("mediaCount < NEON_LISTING_MEDIA_CAP"));
    assert.ok(upsert.includes("outcome !== \"complete\"") || sync.includes('if (outcome !== "complete") return'));

    const onDemand = sync.slice(
      upsertEnd,
      sync.indexOf("async function syncJustListedProperties"),
    );
    assert.ok(!onDemand.includes("syncMediaForListing"));

    const mediaFnStart = sync.indexOf("async function syncMedia(");
    const mediaFnEnd = sync.indexOf("async function syncOpenHouses");
    const mediaFn = sync.slice(mediaFnStart, mediaFnEnd);
    const backfillOnlyAt = mediaFn.indexOf("if (options.backfillOnly) return");
    const cursorAt = mediaFn.indexOf("setCursor(RESOURCE_MEDIA");
    assert.ok(backfillOnlyAt >= 0 && cursorAt > backfillOnlyAt);
    assert.ok(read("scripts/mls-media-backfill.ts").includes("mediaBackfillOnly: true"));

    const fastStart = sync.indexOf("async function runMlsFastPropertyPasses");
    const fastEnd = sync.indexOf("export async function runPropTxMlsSync");
    const fastFn = sync.slice(fastStart, fastEnd);
    const runFn = sync.slice(fastEnd, sync.indexOf("function emptyStats"));
    assert.equal(fastFn.split("fastUnchangedSkip: true").length - 1, 2);
    assert.ok(!fastFn.includes("setCursor"));
    assert.ok(!runFn.includes("fastUnchangedSkip"));
    assert.ok(runFn.includes("await syncMediaBackfill"));
    assert.ok(runFn.includes("setCursor") || sync.includes("RESOURCE_PROPERTY"));
    console.log("[8] nightly selector, fast short-circuit, and Media cursor stay in place... PASS");
  }

  {
    const gallery = read("src/app/api/listings/[mlsNumber]/gallery/route.ts");
    const page = read("src/app/(marketing)/listing/[...parts]/listing-operational.tsx");
    const lookup = read("src/lib/proptx/on-demand-lookup.ts");
    assert.ok(gallery.includes("await fetchListingPhotosFromPropTx"));
    assert.ok(gallery.includes("photos: photos.map("));
    assert.ok(!gallery.includes("persistNeonListingMediaCap"));
    assert.ok(!gallery.includes("photos.slice(0, NEON_LISTING_MEDIA_CAP)"));
    assert.ok(page.includes("fetchListingPhotosFromPropTx("));
    assert.ok(!page.includes("persistNeonListingMediaCap"));
    assert.ok(!lookup.includes("upsertPropTxPropertiesOnDemand"));
    assert.ok(!lookup.includes("listingMedia.create"));
    assert.ok(read("prisma/schema.prisma").includes("mediaSourceTimestamp"));
    assert.ok(
      read("prisma/migrations/20260921220000_listing_media_sync_state/migration.sql").includes(
        'ADD COLUMN "mediaSourceTimestamp"',
      ),
    );
    console.log("[9] live gallery still loads; website paths do not write ListingMedia... PASS");
  }

  console.log("\nMLS MEDIA SYNC STATE SELFTEST PASSED\n");
}

main();
