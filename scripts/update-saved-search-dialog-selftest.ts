/**
 * Saved-search confirmation lifecycle, scroll-lock nesting, and dialog chrome.
 * Run: node --import tsx scripts/update-saved-search-dialog-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planSavedSearchApplyUi } from "../src/lib/listings/saved-search-confirm-flow";
import {
  __resetScrollLockForTests,
  acquireScrollLock,
  hasActiveScrollLock,
} from "../src/lib/scroll-lock";
import { visualViewportOverlayStyle } from "../src/lib/visual-viewport-overlay-style";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const dialog = read("src/components/listings/UpdateSavedSearchDialog.tsx");
const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
const menu = read("src/components/listings/SearchFiltersMenu.tsx");
const scrollLockSrc = read("src/lib/scroll-lock.ts");

// --- Behavioral: apply UI plan (not string-only) ---
assert.deepEqual(planSavedSearchApplyUi("needs_confirm"), {
  openConfirm: true,
  closeFilters: true,
  toastSuccess: false,
  awaitsUserConfirm: true,
});
assert.deepEqual(planSavedSearchApplyUi("saved"), {
  openConfirm: false,
  closeFilters: true,
  toastSuccess: true,
  awaitsUserConfirm: false,
});
assert.deepEqual(planSavedSearchApplyUi("auth"), {
  openConfirm: false,
  closeFilters: false,
  toastSuccess: false,
  awaitsUserConfirm: false,
});
assert.deepEqual(planSavedSearchApplyUi("error"), {
  openConfirm: false,
  closeFilters: false,
  toastSuccess: false,
  awaitsUserConfirm: false,
});

// --- Behavioral: nested scroll locks keep overflow-x until last release ---
__resetScrollLockForTests();
const html = { style: { overflow: "", overflowX: "" } };
const body = {
  style: {
    overflow: "",
    overflowX: "",
    position: "",
    top: "",
    left: "",
    right: "",
    width: "",
    overscrollBehaviorY: "",
  },
};
const doc = {
  documentElement: html,
  body,
};
let scrolledTo: number | null = null;
const previousDocument = (globalThis as { document?: unknown }).document;
const previousWindow = (globalThis as { window?: unknown }).window;
(globalThis as { document: unknown }).document = doc;
(globalThis as { window: unknown }).window = {
  addEventListener() {},
  scrollY: 120,
  pageYOffset: 120,
  scrollTo(_x: number, y: number) {
    scrolledTo = y;
  },
};

try {
  __resetScrollLockForTests();
  assert.equal(hasActiveScrollLock(), false);

  const releaseFilters = acquireScrollLock();
  assert.equal(hasActiveScrollLock(), true);
  assert.equal(body.style.overflow, "hidden");
  assert.equal(html.style.overflowX, "hidden");
  assert.equal(body.style.overflowX, "hidden");
  assert.equal(body.style.position, "fixed");
  assert.equal(body.style.top, "-120px");

  // Filters → confirmation: second lock acquires while first still held
  const releaseConfirm = acquireScrollLock();
  assert.equal(hasActiveScrollLock(), true);
  assert.equal(body.style.position, "fixed");

  // Filters cleanup must NOT clear overflow while confirmation is locked
  releaseFilters();
  assert.equal(hasActiveScrollLock(), true);
  assert.equal(body.style.overflow, "hidden");
  assert.equal(html.style.overflowX, "hidden");
  assert.equal(body.style.overflowX, "hidden");
  assert.equal(body.style.position, "fixed");

  releaseConfirm();
  assert.equal(hasActiveScrollLock(), false);
  assert.equal(body.style.overflow, "");
  assert.equal(html.style.overflowX, "");
  assert.equal(body.style.overflowX, "");
  assert.equal(body.style.position, "");
  assert.equal(body.style.top, "");
  assert.equal(scrolledTo, 120);

  // Interrupted / double-release safety
  const once = acquireScrollLock();
  once();
  once();
  assert.equal(hasActiveScrollLock(), false);
  assert.equal(body.style.overflow, "");
  assert.equal(body.style.position, "");
} finally {
  __resetScrollLockForTests();
  if (previousDocument === undefined) {
    delete (globalThis as { document?: unknown }).document;
  } else {
    (globalThis as { document: unknown }).document = previousDocument;
  }
  if (previousWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = previousWindow;
  }
}

// Scroll-lock owns overflow-x (components must not stomp nested restores)
assert.match(scrollLockSrc, /overflowX = "hidden"/);
assert.match(scrollLockSrc, /lockCount === 1/);
assert.match(scrollLockSrc, /position = "fixed"/);
assert.match(scrollLockSrc, /scrollTo/);
assert.doesNotMatch(sheet, /prevHtmlOverflowX/);
assert.doesNotMatch(dialog, /prevHtmlOverflowX/);

// Dialog chrome + Back history + VV pin
assert.match(dialog, /data-update-saved-search-dialog=""/);
assert.match(dialog, /visualViewportOverlayStyle/);
assert.match(dialog, /houzzatUpdateSavedSearch/);
assert.match(dialog, /history\.back\(\)/);
assert.match(dialog, /stopImmediatePropagation/);
assert.match(dialog, /acquireScrollLock/);
assert.match(dialog, /safe-area-inset-top/);
assert.match(dialog, /safe-area-inset-bottom/);
assert.match(dialog, /max-h-full/);
assert.match(dialog, /min-w-0/);
assert.match(dialog, /touch-none/);
assert.doesNotMatch(dialog, /fixed inset-0/);

// Mobile sheet uses shared plan + keeps dialog mounted after Filters closes
assert.match(sheet, /planSavedSearchApplyUi/);
assert.match(sheet, /if \(!open && !confirmOpen\) return null/);
assert.match(sheet, /\{open \? \(/);
const portal = sheet.slice(
  sheet.indexOf("return createPortal("),
  sheet.lastIndexOf("document.body"),
);
assert.ok(
  portal.indexOf("UpdateSavedSearchDialog") > portal.indexOf(") : null}"),
  "UpdateSavedSearchDialog must render outside the Filters overlay branch",
);

// Desktop flyout closes before confirm; dialog remains a sibling
assert.match(menu, /planSavedSearchApplyUi/);
assert.match(menu, /UpdateSavedSearchDialog/);

// CaptureIntent / save path still present (business logic preserved)
assert.match(sheet, /savePrimarySearch/);
assert.match(sheet, /openGuestSaveSearchIntent/);
assert.match(menu, /savePrimarySearch/);
assert.match(menu, /openGuestSaveSearchIntent/);

// Only one confirm dialog instance in the sheet tree
assert.equal(
  (sheet.match(/<UpdateSavedSearchDialog/g) ?? []).length,
  1,
);

// Narrow / keyboard VV metrics keep dialog inside the visible frame
const keyboard = visualViewportOverlayStyle({
  offsetLeft: 0,
  offsetTop: 48,
  width: 360,
  height: 400,
});
assert.equal(keyboard.width, "360px");
assert.equal(keyboard.height, "400px");
assert.equal(keyboard.left, "0px");

console.log("update-saved-search-dialog-selftest: ok");
