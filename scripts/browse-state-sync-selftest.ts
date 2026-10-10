/**
 * Phase 1 cross-device browse-state contracts + safety regressions.
 * Run: node --import tsx scripts/browse-state-sync-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  browseStateEquals,
  canonicalizeBrowseSearchHref,
  clampBrowseClientTime,
  computeBrowseStateNext,
  mergeBrowseRecentLists,
  normalizeBrowseRecentList,
  resolveActiveSearchConflict,
} from "../src/lib/listings/browse-state";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

// --- Canonical href validation ---
assert.equal(
  canonicalizeBrowseSearchHref("/search?city=Markham&view=cards"),
  "/search?city=Markham",
);
assert.equal(canonicalizeBrowseSearchHref("/search?view=map"), null);
assert.equal(canonicalizeBrowseSearchHref("/search"), null);
assert.equal(canonicalizeBrowseSearchHref("https://evil.com/search?city=X"), null);
assert.equal(canonicalizeBrowseSearchHref("//evil/search?city=X"), null);
assert.equal(canonicalizeBrowseSearchHref("/admin?city=X"), null);
assert.ok(
  canonicalizeBrowseSearchHref("/search?cities=Toronto%7CMississauga&minBeds=3"),
);

// --- Recent merge / dedupe (independent device entries preserved) ---
const merged = mergeBrowseRecentLists(
  [
    { label: "Account A", href: "/search?city=Oakville&minBeds=2", at: 100 },
    { label: "Account B", href: "/search?city=Milton", at: 90 },
  ],
  [
    { label: "Guest A newer", href: "/search?city=oakville&minBeds=2&view=cards", at: 200 },
    { label: "Guest C", href: "/search?city=Markham", at: 150 },
  ],
);
assert.equal(merged.length, 3);
assert.equal(merged[0]!.label, "Guest A newer");
assert.equal(merged[0]!.at, 200);
assert.ok(merged.some((r) => r.href.includes("Markham")));
assert.ok(merged.some((r) => r.href.includes("Milton")));

const normalized = normalizeBrowseRecentList([
  { label: "A", href: "/search?city=A&view=split", at: 3 },
  { label: "A2", href: "/search?city=a", at: 2 },
  { label: "bad", href: "/search", at: 1 },
]);
assert.equal(normalized.length, 1);

// --- Active conflict LWW (merge path) ---
assert.deepEqual(
  resolveActiveSearchConflict({
    accountHref: "/search?city=Markham",
    accountUpdatedAt: 100,
    incomingHref: "/search?city=Oakville",
    incomingUpdatedAt: 200,
  }),
  { href: "/search?city=Oakville", updatedAt: 200 },
);

assert.deepEqual(
  resolveActiveSearchConflict({
    accountHref: "/search?city=Markham",
    accountUpdatedAt: 200,
    incomingHref: "/search?city=Oakville",
    incomingUpdatedAt: 200,
  }),
  { href: "/search?city=Markham", updatedAt: 200 },
);

assert.deepEqual(
  resolveActiveSearchConflict({
    accountHref: null,
    accountUpdatedAt: null,
    incomingHref: "/search?city=Milton&minBeds=3",
    incomingUpdatedAt: 50,
  }),
  { href: "/search?city=Milton&minBeds=3", updatedAt: 50 },
);

// Intentional clear beats older offline retry.
assert.deepEqual(
  resolveActiveSearchConflict({
    accountHref: null,
    accountUpdatedAt: 200,
    incomingHref: "/search?city=StaleOffline",
    incomingUpdatedAt: 100,
  }),
  { href: null, updatedAt: 200 },
);

// Newer device after clear still wins.
assert.deepEqual(
  resolveActiveSearchConflict({
    accountHref: null,
    accountUpdatedAt: 200,
    incomingHref: "/search?city=AfterClear",
    incomingUpdatedAt: 300,
  }),
  { href: "/search?city=AfterClear", updatedAt: 300 },
);

assert.ok(
  browseStateEquals(
    {
      activeSearchHref: "/search?city=A&view=cards",
      recentSearches: [{ label: "A", href: "/search?city=A", at: 1 }],
    },
    {
      activeSearchHref: "/search?city=A",
      recentSearches: [{ label: "A", href: "/search?city=A", at: 1 }],
    },
  ),
);

// --- Clock skew: future client time cannot beat server ---
const serverNow = 1_000_000;
assert.equal(clampBrowseClientTime(serverNow + 60_000, serverNow), null);
assert.equal(clampBrowseClientTime(500, serverNow), 500);
assert.equal(clampBrowseClientTime(null, serverNow), null);

const account = {
  activeSearchHref: "/search?city=Markham",
  activeUpdatedAt: 900_000,
  recentSearches: [] as { label: string; href: string; at: number }[],
  revision: 3,
};

// Non-merge writer with skewed clock → server stamp, not client future.
const skewedWrite = computeBrowseStateNext({
  account,
  incomingActiveHref: "/search?city=Oakville",
  incomingActiveAt: serverNow + 999_999,
  incomingRecent: undefined,
  merge: false,
  serverNow,
});
assert.equal(skewedWrite.nextActiveHref, "/search?city=Oakville");
assert.equal(skewedWrite.nextActiveAt, serverNow);

// Explicit clear (intentional reset) stamps server time.
const cleared = computeBrowseStateNext({
  account,
  incomingActiveHref: null,
  incomingActiveAt: 1,
  incomingRecent: undefined,
  merge: false,
  serverNow,
});
assert.equal(cleared.nextActiveHref, null);
assert.equal(cleared.nextActiveAt, serverNow);

// Merge path clamps future guest clock so it cannot overwrite newer account.
const mergeSkew = computeBrowseStateNext({
  account: {
    ...account,
    activeUpdatedAt: serverNow - 10,
  },
  incomingActiveHref: "/search?city=EvilFuture",
  incomingActiveAt: serverNow + 50_000,
  incomingRecent: undefined,
  merge: true,
  serverNow,
});
assert.equal(mergeSkew.nextActiveHref, "/search?city=Markham");
assert.equal(mergeSkew.nextActiveAt, serverNow - 10);

// Offline retry after clear: stale older href loses to cleared account when merge LWW.
const afterClear = computeBrowseStateNext({
  account: {
    activeSearchHref: null,
    activeUpdatedAt: serverNow,
    recentSearches: [],
    revision: 4,
  },
  incomingActiveHref: "/search?city=StaleOffline",
  incomingActiveAt: serverNow - 100_000,
  incomingRecent: undefined,
  merge: true,
  serverNow,
});
assert.equal(afterClear.nextActiveHref, null);

// --- Schema / migration ---
const schema = read("prisma/schema.prisma");
assert.ok(schema.includes("model CustomerBrowseState"));
assert.ok(schema.includes("activeSearchHref"));
assert.ok(schema.includes("recentSearches"));
assert.ok(schema.includes("revision"));
assert.ok(schema.includes("customerBrowseState"));

const migration = read(
  "prisma/migrations/20261009180000_customer_browse_state/migration.sql",
);
assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS "CustomerBrowseState"'));
assert.ok(migration.includes("does not alter SavedSearch"));
assert.ok(!migration.includes("ALTER TABLE \"SavedSearch\""));
assert.ok(migration.includes("CustomerBrowseState_userId_fkey"));
assert.ok(migration.includes("CustomerBrowseState_workspaceId_fkey"));

// --- API auth / soft-fail / conflict ---
const api = read("src/app/api/account/browse-state/route.ts");
assert.ok(api.includes("requireCustomerUser"));
assert.ok(api.includes("email verification NOT required") || api.includes("NOT required"));
assert.equal(api.includes("prisma.savedSearch"), false);
assert.equal(api.includes("isHomepageActive"), false);
assert.equal(api.includes("isPrimary"), false);
assert.ok(api.includes("status: 409"));
assert.ok(api.includes("status: 503"));
assert.ok(api.includes("unavailable"));

const pure = read("src/lib/listings/browse-state.ts");
assert.ok(pure.includes("resolveActiveSearchConflict"));
assert.ok(pure.includes("mergeBrowseRecentLists"));
assert.ok(pure.includes("computeBrowseStateNext"));
assert.ok(pure.includes("clampBrowseClientTime"));

const server = read("src/lib/listings/browse-state-server.ts");
assert.ok(server.includes("computeBrowseStateNext"));
assert.ok(server.includes("user.workspaceId"));
assert.ok(server.includes("updateMany"));
assert.ok(server.includes("revision: expectedRevision") || server.includes("revision: raceRevision") || server.includes("revision:"));
assert.ok(server.includes("$transaction"));
assert.ok(server.includes("isBrowseStateTableMissing") || server.includes("P2021"));
assert.equal(server.includes("emailAlerts"), false);
assert.equal(server.includes("prisma.savedSearch"), false);

// Atomic concurrency: conditional UPDATE on revision (not check-then-update).
assert.ok(server.includes("tx.customerBrowseState.updateMany"));
assert.ok(server.includes("updated.count === 0"));
assert.ok(server.includes('code === "P2002"'));

// --- Client sync / logout isolation / no navigation ---
const sync = read("src/components/account/BrowseStateSync.tsx");
assert.ok(sync.includes("merge: true"));
assert.ok(sync.includes("visibilitychange"));
assert.ok(sync.includes("FOCUS_THROTTLE_MS"));
assert.ok(sync.includes("currentBrowseApplyGeneration"));
assert.ok(sync.includes("ACCOUNT_LOCAL_CLEARED_EVENT"));
assert.ok(sync.includes("stillValid") || sync.includes("stillSignedInValid"));
assert.equal(sync.includes("router."), false);
assert.equal(sync.includes("window.location"), false);

const client = read("src/lib/listings/browse-state-client.ts");
assert.ok(client.includes("applyBrowseStateToLocalCache"));
assert.ok(client.includes("browseStateEquals"));
assert.ok(client.includes("invalidateBrowseStateApplies"));
assert.ok(client.includes("browseApplyGeneration"));

// --- Logout cleanup ---
const cleanup = read("src/lib/auth/account-local-cleanup.ts");
assert.ok(cleanup.includes("clearActiveSearchMemory"));
assert.ok(cleanup.includes("clearLocalRecentSearches"));
assert.ok(cleanup.includes("clearLocalRecentViews"));
assert.ok(cleanup.includes("clearLocalRoutePlanner"));
assert.ok(cleanup.includes("CAPTURE_INTENT_STORAGE_KEY"));
assert.ok(cleanup.includes("invalidateBrowseStateApplies"));

const hardSignOut = read("src/lib/auth/hard-sign-out.ts");
assert.ok(hardSignOut.includes("clearAccountLocalBrowseCaches"));
assert.ok(hardSignOut.includes("shouldUseAuthJsSignOut"));
assert.ok(hardSignOut.includes("NEXT_PUBLIC_IS_VERCEL"));
// Cookie clear must run before local browse cleanup (avoids sync Set-Cookie race).
const firstLogoutClear = hardSignOut.indexOf("await postLogoutClear()");
const localClear = hardSignOut.indexOf("clearAccountLocalBrowseCaches()");
assert.ok(firstLogoutClear > 0 && localClear > firstLogoutClear);

const middleware = read("src/middleware.ts");
assert.ok(middleware.includes("api/account/browse-state"));

const providers = read("src/components/Providers.tsx");
assert.ok(providers.includes("BrowseStateSync"));

// --- Save as New vs Primary ---
const dropdown = read("src/components/listings/SearchesDropdown.tsx");
assert.ok(dropdown.includes("Current Search"));
assert.ok(dropdown.includes("Recent Searches"));
assert.ok(dropdown.includes("Saved Searches"));
assert.ok(dropdown.includes('label="Save as new"'));
assert.ok(dropdown.includes("saveAsNew"));

const saveBtn = read("src/components/account/SaveSearchButton.tsx");
assert.ok(saveBtn.includes("saveAsNew"));
assert.ok(saveBtn.includes("saveAsNewSearch"));
assert.ok(saveBtn.includes("withSaveAsNewCaptureFlag"));
assert.ok(saveBtn.includes("savedSearchDisplayNameFromQuery"));

const savePrimary = read("src/lib/listings/save-primary-search.ts");
assert.ok(savePrimary.includes("export async function saveAsNewSearch"));
assert.ok(savePrimary.includes("asPrimary: false"));
assert.ok(savePrimary.includes("applyToHomepage: false"));

const intent = read("src/lib/auth/save-search-intent.ts");
assert.ok(intent.includes("SAVE_AS_NEW_CAPTURE_PARAM"));
assert.ok(intent.includes("callbackRequestsSaveAsNew"));
assert.ok(intent.includes("HOMEPAGE_APPLY_CAPTURE_PARAM"));
assert.ok(intent.includes("applyToHomepage || saveAsNew ? false : true"));

const dialog = read("src/components/listings/UpdateSavedSearchDialog.tsx");
assert.ok(dialog.includes("Save as a new search?"));
assert.ok(dialog.includes("without changing your Primary"));

// Primary precedence unchanged
const homepage = read("src/components/home/use-homepage-search-source.ts");
assert.ok(homepage.includes("primary ?? active"));

console.log("browse-state-sync selftest: PASS");
