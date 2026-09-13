/**
 * Expired-grace full-gallery verification UX.
 * Run: pnpm exec tsx scripts/gallery-verify-lock-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_VERIFY_GRACE_MS,
  GALLERY_VERIFY_COPY,
  resolveClientAccess,
} from "../src/lib/account-access";
import {
  fetchListingGalleryPayload,
  parseGalleryCapped,
  parseGalleryTotalPhotoCount,
} from "../src/lib/listings/gallery-client";
import { NEON_LISTING_MEDIA_CAP } from "../src/lib/listings/gallery-constants";
import {
  galleryShowAllPhotosLabel,
  shouldShowGalleryVerifyLock,
} from "../src/lib/listings/merge-gallery-photos";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const store = new Map<string, string>();
const sessionStorageMock: Storage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.get(key) ?? null;
  },
  key() {
    return null;
  },
  removeItem(key: string) {
    store.delete(key);
  },
  setItem(key: string, value: string) {
    store.set(key, String(value));
  },
};

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorageMock,
});

function testAccessKindsDoNotChangeLockRules() {
  const visitor = resolveClientAccess(null);
  assert.equal(visitor.kind, "visitor");
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: visitor.needsEmailVerification,
      detailsLocked: false,
      visiblePhotoCount: 5,
      totalPhotoCount: 16,
    }),
    false,
  );

  const verified = resolveClientAccess({
    id: "u1",
    emailVerified: new Date(),
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS * 2),
  });
  assert.equal(verified.kind, "verified_unlocked");
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: verified.needsEmailVerification,
      detailsLocked: false,
      visiblePhotoCount: 5,
      totalPhotoCount: 16,
    }),
    false,
  );

  const inGrace = resolveClientAccess({
    id: "u2",
    emailVerified: null,
    createdAt: new Date(),
  });
  assert.equal(inGrace.kind, "unverified_unlocked");
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: inGrace.needsEmailVerification,
      detailsLocked: false,
      visiblePhotoCount: 5,
      totalPhotoCount: 16,
    }),
    false,
  );

  const expired = resolveClientAccess({
    id: "u3",
    emailVerified: null,
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS - 1000),
  });
  assert.equal(expired.kind, "unverified_locked");
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: expired.needsEmailVerification,
      detailsLocked: false,
      visiblePhotoCount: 5,
      totalPhotoCount: 16,
    }),
    true,
  );
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: true,
      detailsLocked: true,
      visiblePhotoCount: 5,
      totalPhotoCount: 16,
    }),
    false,
  );
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: true,
      detailsLocked: false,
      visiblePhotoCount: 3,
      totalPhotoCount: 3,
    }),
    false,
  );
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: true,
      detailsLocked: false,
      visiblePhotoCount: 5,
      totalPhotoCount: 5,
    }),
    false,
  );
  assert.equal(
    shouldShowGalleryVerifyLock({
      needsEmailVerification: true,
      detailsLocked: false,
      visiblePhotoCount: 5,
      totalPhotoCount: null,
    }),
    true,
  );
  console.log("[0] lock tile by account kind / totals... PASS");
}

function testShowAllLabel() {
  assert.equal(
    galleryShowAllPhotosLabel({
      visiblePhotoCount: 5,
      totalPhotoCount: 16,
      locked: false,
    }),
    "Show all 5 photos",
  );
  assert.equal(
    galleryShowAllPhotosLabel({
      visiblePhotoCount: 5,
      totalPhotoCount: 16,
      locked: true,
    }),
    "View All 16 Photos",
  );
  assert.equal(
    galleryShowAllPhotosLabel({
      visiblePhotoCount: 5,
      totalPhotoCount: null,
      locked: true,
    }),
    "View All Photos",
  );
  console.log("[1] Show all / View All labels... PASS");
}

function testCopyAndSharedVerifyUx() {
  assert.equal(GALLERY_VERIFY_COPY.title, "View the Full Photo Gallery");
  assert.equal(
    GALLERY_VERIFY_COPY.body,
    "Verify your email to unlock all photos for this property. Houzzat is free to use — verification simply helps us keep accounts secure.",
  );
  assert.equal(GALLERY_VERIFY_COPY.ctaLabel, "Verify Email");

  const card = read("src/components/listings/GalleryVerifyLockCard.tsx");
  assert.ok(card.includes("GALLERY_VERIFY_COPY"));
  assert.ok(card.includes("openClientToolsVerification"));
  assert.ok(card.includes("GALLERY_VERIFY_COPY.ctaLabel"));

  const gallery = read("src/components/listings/ListingGallery.tsx");
  assert.ok(gallery.includes("GalleryVerifyLockCard"));
  assert.ok(gallery.includes("galleryShowAllPhotosLabel"));
  assert.ok(!gallery.includes("EmailVerificationRequired"));
  assert.ok(!gallery.includes("verifyGateIndex"));
  assert.ok(
    !gallery.includes("mt-2 overflow-hidden rounded-2xl"),
    "must not render a full-width lock section under the photo grid",
  );
  const desktop = gallery.slice(
    gallery.indexOf("Desktop cover grid"),
    gallery.indexOf("Step 1 — mobile stacked gallery"),
  );
  assert.ok(desktop.includes("md:grid-cols-3 md:grid-rows-2"));
  assert.ok(desktop.includes("<GalleryVerifyLockCard"));
  assert.ok(desktop.includes("openClientToolsVerification"));
  const viewAllClick = desktop.slice(
    desktop.indexOf("if (showVerifyLock)"),
    desktop.indexOf("openViewerAt(0)"),
  );
  assert.ok(viewAllClick.includes("openClientToolsVerification"));
  assert.ok(desktop.includes("openViewerAt(0)"));

  const dialog = read(
    "src/components/auth/ClientToolsVerificationProvider.tsx",
  );
  assert.ok(dialog.includes('purpose="client-tools"'));
  assert.ok(dialog.includes("openClientToolsVerification"));
  console.log("[2] lock card is 6th grid tile; View All opens verify dialog... PASS");
}

function testGalleryRouteDoesNotLeakUrls() {
  const route = read("src/app/api/listings/[mlsNumber]/gallery/route.ts");
  assert.ok(route.includes("loadListingDetailApiAccess"));
  assert.ok(
    !route.includes("requireFullCustomerUser"),
    "gallery must keep listing-detail access, not customer-tools gate",
  );

  const detailsIdx = route.indexOf("if (access.detailsLocked)");
  const verifyIdx = route.indexOf("if (access.needsEmailVerification)");
  const afterVerify = route.indexOf("if (!listing.listingKey)");
  assert.ok(detailsIdx > 0 && verifyIdx > detailsIdx && afterVerify > verifyIdx);

  const detailsBlock = route.slice(detailsIdx, verifyIdx);
  assert.ok(!detailsBlock.includes("fetchListingPhotosFromPropTx"));
  assert.ok(detailsBlock.includes("photos: neonPhotos"));
  assert.ok(!detailsBlock.includes("totalPhotoCount"));

  const verifyBlock = route.slice(verifyIdx, afterVerify);
  assert.ok(verifyBlock.includes("totalPhotoCount = live.length"));
  assert.ok(verifyBlock.includes("photos: neonPhotos"));
  assert.ok(verifyBlock.includes("galleryCapped: true"));
  assert.ok(!verifyBlock.includes("photos: live"));
  assert.ok(!verifyBlock.includes("persistNeonListingMediaCap"));
  console.log("[3] /gallery count-only for verify-lock; detailsLocked unchanged... PASS");
}

function testParseCountIgnoresExtraPhotoPayload() {
  assert.equal(
    parseGalleryTotalPhotoCount({ totalPhotoCount: 16 }),
    16,
  );
  assert.equal(parseGalleryTotalPhotoCount({ photos: [{ url: "x" }] }), null);
  assert.equal(parseGalleryCapped({ galleryCapped: true }), true);
  assert.equal(parseGalleryCapped({ photos: [1, 2, 3, 4, 5, 6] }), false);
  console.log("[4] totalPhotoCount parser ignores photo arrays... PASS");
}

async function testCappedClientDropsExtraUrls() {
  store.clear();
  const extraUrl = "https://cdn.example/restricted-6.jpg";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        photos: [
          { id: "p1", url: "https://cdn.example/1.jpg" },
          { id: "p2", url: "https://cdn.example/2.jpg" },
          { id: "p3", url: "https://cdn.example/3.jpg" },
          { id: "p4", url: "https://cdn.example/4.jpg" },
          { id: "p5", url: "https://cdn.example/5.jpg" },
          { id: "p6", url: extraUrl },
        ],
        galleryCapped: true,
        totalPhotoCount: 16,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await fetchListingGalleryPayload("C13777390", undefined, {
    ignoreSessionCache: true,
  });
  globalThis.fetch = originalFetch;

  assert.equal(result.photos.length, NEON_LISTING_MEDIA_CAP);
  assert.equal(
    result.photos.some((photo) => photo.url === extraUrl),
    false,
  );
  assert.equal(result.totalPhotoCount, 16);
  assert.equal(result.galleryCapped, true);
  assert.equal(store.size, 0);
  store.clear();
  console.log("[5] capped client fetch drops extra URLs and skips session... PASS");
}

function testBothListingSurfaces() {
  const detail = read("src/components/listings/ListingDetailView.tsx");
  assert.ok(detail.includes("<ListingGalleryLive"));
  assert.ok(detail.includes("needsEmailVerification={verifyLocked}"));

  const overlay = read("src/components/listings/SearchMapListingOverlay.tsx");
  assert.ok(overlay.includes("<ListingGalleryLive"));
  assert.ok(
    overlay.includes("needsEmailVerification={access.needsEmailVerification}"),
  );
  assert.ok(overlay.includes("photos={photos}"));

  const live = read("src/components/listings/ListingGalleryLive.tsx");
  const enrichStart = live.indexOf("async function enrich()");
  const lockedIdx = live.indexOf("if (needsEmailVerification)", enrichStart);
  const cachedIdx = live.indexOf("readListingGallerySession(mls)");
  assert.ok(enrichStart > 0 && lockedIdx > enrichStart && lockedIdx < cachedIdx);
  assert.ok(live.includes("ignoreSessionCache: true"));
  assert.ok(live.includes("photos.slice(0, NEON_LISTING_MEDIA_CAP)"));
  assert.ok(live.includes("totalPhotoCount={totalPhotoCount}"));
  const page = read("src/app/(marketing)/listing/[...parts]/page.tsx");
  assert.ok(page.includes("verifyLocked ? null : clientLivePhotosPromise"));
  console.log("[6] listing detail + Search overlay lock wiring... PASS");
}

async function main() {
  console.log("\n=== GALLERY VERIFY LOCK UX ===\n");
  testAccessKindsDoNotChangeLockRules();
  testShowAllLabel();
  testCopyAndSharedVerifyUx();
  testGalleryRouteDoesNotLeakUrls();
  testParseCountIgnoresExtraPhotoPayload();
  await testCappedClientDropsExtraUrls();
  testBothListingSurfaces();
  console.log("\nGALLERY VERIFY LOCK SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
