/**
 * Vercel listing gallery client enrichment: do not skip /gallery on Neon-cap results.
 * Run: node --import tsx scripts/vercel-gallery-enrich-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchListingGalleryClient } from "../src/lib/listings/gallery-client";
import { NEON_LISTING_MEDIA_CAP } from "../src/lib/listings/gallery-constants";
import {
  galleryIsRicherThanNeon,
  mergeListingGalleryPhotos,
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

async function main() {
  console.log("\n=== VERCEL GALLERY CLIENT ENRICH ===\n");

  const live = read("src/components/listings/ListingGalleryLive.tsx");
  assert.ok(live.includes("galleryIsRicherThanNeon"));
  assert.ok(live.includes("fetchListingGalleryPayload"));
  assert.ok(live.includes("LIVE_PHOTOS_CLIENT_FALLBACK_MS"));
  const applyIdx = live.indexOf("applyLive(live)");
  const returnIfRicher = live.indexOf("if (galleryIsRicherThanNeon(live)) return");
  const fetchIdx = live.indexOf("applyLive(fetched.photos)");
  assert.ok(applyIdx > 0 && returnIfRicher > applyIdx && fetchIdx > returnIfRicher);
  assert.ok(!live.includes("applyLive(live);\n          return;"));
  const page = read("src/app/(marketing)/listing/[...parts]/page.tsx");
  const vercelGate = page.indexOf("const clientLivePhotosPromise = process.env.VERCEL");
  const propTxFetchIdx = page.indexOf("fetchListingPhotosFromPropTx(");
  assert.ok(vercelGate >= 0);
  assert.ok(propTxFetchIdx > vercelGate);
  assert.ok(!page.includes("const livePhotosPromise ="));
  assert.ok(page.includes("verifyLocked ? null : clientLivePhotosPromise"));
  assert.ok(live.includes("fetchListingGalleryPayload"));
  console.log("[0] ListingGalleryLive falls through unless richer than Neon... PASS");
  console.log("[0b] Vercel SSR does not start PropTx; client uses /gallery... PASS");

  const overlay = read("src/components/listings/SearchMapListingOverlay.tsx");
  const searchExperience = read("src/components/listings/SearchExperience.tsx");
  assert.ok(overlay.includes('from "@/components/listings/ListingGalleryLive"'));
  assert.ok(overlay.includes("<ListingGalleryLive"));
  assert.ok(overlay.includes("photos={photos}"));
  assert.ok(overlay.includes("needsEmailVerification={access.needsEmailVerification}"));
  assert.ok(!overlay.includes('from "@/components/listings/ListingGallery"'));
  assert.ok(!/\bListingGallery\b/.test(overlay.replaceAll("ListingGalleryLive", "")));
  assert.ok(!overlay.includes("livePhotosPromise"));
  assert.ok(searchExperience.includes("onOpenListing={!isNarrow ? openListingDetail : undefined}"));
  assert.ok(searchExperience.includes("<SearchMapListingOverlay"));
  assert.ok(overlay.includes("<ListingNotesPanel"));
  assert.ok(overlay.includes("authCallbackUrl={listingPath(listing)}"));
  assert.ok(overlay.includes("signedIn={signedIn}"));
  assert.ok(!overlay.includes("ListingMobileNotes"));
  console.log("[0c] Search overlay uses ListingGalleryLive with Neon photos... PASS");
  console.log("[0d] Desktop Search overlay navigation is unchanged... PASS");
  console.log("[0e] Search overlay includes ListingNotesPanel (no mobile FAB)... PASS");

  assert.equal(galleryIsRicherThanNeon([]), false);
  assert.equal(galleryIsRicherThanNeon(Array.from({ length: 5 })), false);
  assert.equal(galleryIsRicherThanNeon(Array.from({ length: 6 })), true);

  const neon = [
    { id: "n1", url: "https://cdn.example/a.jpg" },
    { id: "n2", url: "https://cdn.example/b.jpg" },
    { id: "n3", url: "https://cdn.example/c.jpg" },
    { id: "n4", url: "https://cdn.example/d.jpg" },
    { id: "n5", url: "https://cdn.example/e.jpg" },
  ];
  const livePhotos = [
    ...neon,
    { id: "p6", url: "https://cdn.example/f.jpg" },
  ];
  const merged = mergeListingGalleryPhotos(neon, livePhotos);
  assert.equal(merged.length, 6);
  assert.equal(merged[0]?.url, neon[0]?.url);
  assert.equal(merged[5]?.url, "https://cdn.example/f.jpg");
  console.log("[1] Merge still keeps Neon head + extras... PASS");

  {
    store.clear();
    const key = "houzzat:listing-gallery:E13770102";
    store.set(
      key,
      JSON.stringify({
        photos: Array.from({ length: NEON_LISTING_MEDIA_CAP }, (_, i) => ({
          id: `n${i}`,
          url: `https://cdn.example/${i}.jpg`,
        })),
      }),
    );
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          photos: [
            { id: "p1", url: "https://cdn.example/a.jpg" },
            { id: "p2", url: "https://cdn.example/b.jpg" },
            { id: "p3", url: "https://cdn.example/c.jpg" },
            { id: "p4", url: "https://cdn.example/d.jpg" },
            { id: "p5", url: "https://cdn.example/e.jpg" },
            { id: "p6", url: "https://cdn.example/f.jpg" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const photos = await fetchListingGalleryClient("E13770102");
    assert.equal(fetchCalls, 1);
    assert.equal(photos.length, 6);
    globalThis.fetch = originalFetch;
    store.clear();
    console.log("[2] Neon-cap session cache does not skip /gallery... PASS");
  }

  {
    store.clear();
    const key = "houzzat:listing-gallery:E13770102";
    const full = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      url: `https://cdn.example/${i}.jpg`,
    }));
    store.set(key, JSON.stringify({ photos: full }));
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const photos = await fetchListingGalleryClient("E13770102");
    assert.equal(fetchCalls, 0);
    assert.equal(photos.length, 8);
    globalThis.fetch = originalFetch;
    store.clear();
    console.log("[3] Full-gallery session cache still skips /gallery... PASS");
  }

  console.log("\nVERCEL GALLERY ENRICH SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
