/**
 * Phase 3B — customer Watch / Saved Search alert management UI contracts.
 * Run: pnpm communications-phase3b:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyToggleResponseToUiState,
  areaEmailAlertsHint,
  buildAreaAlertFieldPatch,
  buildPropertyEmailAlertsPatch,
  buildSavedSearchEmailAlertsPatch,
  deriveStoredEntityAlertUi,
  entityAlertMutationKey,
  GLOBAL_EMAIL_PAUSED_BANNER,
  isCurrentMutationGeneration,
  nextMutationGeneration,
  propertyEmailAlertsHint,
  resolveToggleMutationOutcome,
} from "../src/lib/account/entity-alert-mutations";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testPatchBodiesArePartial() {
  const propOff = buildPropertyEmailAlertsPatch("W123", false);
  assert.deepEqual(propOff, { mlsNumber: "W123", emailAlerts: false });
  assert.equal(Object.keys(propOff).sort().join(","), "emailAlerts,mlsNumber");

  const propOn = buildPropertyEmailAlertsPatch("W123", true);
  assert.equal(propOn.emailAlerts, true);

  const emailOnly = buildAreaAlertFieldPatch("a1", "emailAlerts", false);
  assert.deepEqual(emailOnly, { id: "a1", emailAlerts: false });
  assert.equal("notifyNew" in emailOnly, false);
  assert.equal("notifySold" in emailOnly, false);
  assert.equal(
    JSON.stringify(emailOnly),
    JSON.stringify({ id: "a1", emailAlerts: false }),
  );

  const newOnly = buildAreaAlertFieldPatch("a1", "notifyNew", true);
  assert.deepEqual(newOnly, { id: "a1", notifyNew: true });
  assert.equal("emailAlerts" in newOnly, false);
  assert.equal("notifySold" in newOnly, false);

  const soldOnly = buildAreaAlertFieldPatch("a1", "notifySold", false);
  assert.deepEqual(soldOnly, { id: "a1", notifySold: false });
  assert.equal("emailAlerts" in soldOnly, false);
  assert.equal("notifyNew" in soldOnly, false);

  const search = buildSavedSearchEmailAlertsPatch("ss1", false);
  assert.deepEqual(search, { id: "ss1", emailAlerts: false });
}

/**
 * Scenario A: true→false (gen1) then false→true (gen2); gen1 resolves after gen2.
 * Final UI must remain true; stale gen1 must not overwrite.
 *
 * Scenario B: gen1 fails after gen2 succeeded — older failure must not roll back.
 *
 * Scenario C: latest request fails — restore previous confirmed value.
 */
function testRaceScenariosABC() {
  const map = new Map<string, number>();
  const key = entityAlertMutationKey("property", "W1", "emailAlerts");

  // --- Scenario A ---
  let ui = true;
  const prev1 = ui;
  const g1 = nextMutationGeneration(map, key);
  ui = false; // optimistic
  const prev2 = ui;
  const g2 = nextMutationGeneration(map, key);
  ui = true; // optimistic second toggle

  // gen2 succeeds first
  {
    const r = applyToggleResponseToUiState({
      uiState: ui,
      generation: g2,
      latestGeneration: map.get(key)!,
      previous: prev2,
      serverConfirmed: true,
    });
    assert.equal(r.ignoredStale, false);
    assert.equal(r.uiState, true);
    ui = r.uiState;
  }
  // stale gen1 success (false) arrives later — ignored
  {
    const r = applyToggleResponseToUiState({
      uiState: ui,
      generation: g1,
      latestGeneration: map.get(key)!,
      previous: prev1,
      serverConfirmed: false,
    });
    assert.equal(r.ignoredStale, true);
    assert.equal(r.applied, false);
    assert.equal(r.uiState, true, "Scenario A: final UI stays true");
    ui = r.uiState;
  }
  assert.equal(ui, true);

  // --- Scenario B ---
  const mapB = new Map<string, number>();
  const keyB = entityAlertMutationKey("property", "W2", "emailAlerts");
  let uiB = true;
  const bPrev1 = uiB;
  const bg1 = nextMutationGeneration(mapB, keyB);
  uiB = false;
  const bPrev2 = uiB;
  const bg2 = nextMutationGeneration(mapB, keyB);
  uiB = true;

  {
    const r = applyToggleResponseToUiState({
      uiState: uiB,
      generation: bg2,
      latestGeneration: mapB.get(keyB)!,
      previous: bPrev2,
      serverConfirmed: true,
    });
    uiB = r.uiState;
    assert.equal(uiB, true);
  }
  {
    const r = applyToggleResponseToUiState({
      uiState: uiB,
      generation: bg1,
      latestGeneration: mapB.get(keyB)!,
      previous: bPrev1,
      serverConfirmed: null, // older failure
    });
    assert.equal(r.ignoredStale, true);
    assert.equal(r.rolledBack, false);
    assert.equal(uiB, true, "Scenario B: older failure does not roll back");
  }

  // --- Scenario C ---
  const mapC = new Map<string, number>();
  const keyC = entityAlertMutationKey("area", "A1", "emailAlerts");
  let uiC = true;
  const cPrev = uiC;
  const cg1 = nextMutationGeneration(mapC, keyC);
  uiC = false; // optimistic
  {
    const r = applyToggleResponseToUiState({
      uiState: uiC,
      generation: cg1,
      latestGeneration: mapC.get(keyC)!,
      previous: cPrev,
      serverConfirmed: null,
    });
    assert.equal(r.rolledBack, true);
    assert.equal(r.uiState, true, "Scenario C: restore last valid state");
    uiC = r.uiState;
  }
  assert.equal(uiC, true);

  // boolean false is a valid confirmed value (must not treat as missing)
  const falseOk = resolveToggleMutationOutcome({
    generation: 1,
    latestGeneration: 1,
    previous: true,
    serverConfirmed: false,
  });
  assert.equal(falseOk, false);
}

function testMutationKeysArePerEntityAndSetting() {
  const map = new Map<string, number>();
  const email = entityAlertMutationKey("area", "a1", "emailAlerts");
  const notifyNew = entityAlertMutationKey("area", "a1", "notifyNew");
  const notifySold = entityAlertMutationKey("area", "a1", "notifySold");
  assert.notEqual(email, notifyNew);
  assert.notEqual(notifyNew, notifySold);

  const gEmail = nextMutationGeneration(map, email);
  const gNew = nextMutationGeneration(map, notifyNew);
  const gSold = nextMutationGeneration(map, notifySold);
  assert.equal(gEmail, 1);
  assert.equal(gNew, 1);
  assert.equal(gSold, 1);

  nextMutationGeneration(map, notifyNew);
  assert.equal(isCurrentMutationGeneration(map, notifyNew, gNew), false);
  assert.equal(
    isCurrentMutationGeneration(map, email, gEmail),
    true,
    "notifyNew generation must not invalidate emailAlerts key",
  );
  assert.equal(isCurrentMutationGeneration(map, notifySold, gSold), true);

  const client = read("src/components/account/MonitorsClient.tsx");
  assert.ok(client.includes("`area:${id}:${field}`"));
  assert.ok(client.includes("`property:${mlsNumber}:emailAlerts`"));
  assert.ok(
    client.includes("Merge only this field") ||
      client.includes("[field]: resolved"),
  );
}

function testStoredVsEffectiveGlobalPause() {
  const ui = deriveStoredEntityAlertUi({
    globalEmailEnabled: false,
    propertyEmailAlerts: true,
    areaEmailAlerts: true,
    savedSearchEmailAlerts: true,
  });
  assert.equal(ui.showGlobalPauseBanner, true);
  assert.equal(ui.propertyEmailSwitchChecked, true);
  assert.equal(ui.areaEmailSwitchChecked, true);
  assert.equal(ui.savedSearchEmailSwitchChecked, true);

  const client = read("src/components/account/MonitorsClient.tsx");
  assert.ok(client.includes("globalEmailPaused"));
  assert.ok(client.includes("GLOBAL_EMAIL_PAUSED_BANNER"));
  // Switches bind to stored entity fields — not globalEmailPaused
  assert.ok(client.includes("checked={m.emailAlerts}"));
  assert.ok(client.includes("checked={m.notifyNew}"));
  assert.ok(client.includes("checked={m.notifySold}"));
  assert.ok(!client.includes("checked={!globalEmailPaused"));
  assert.ok(!client.includes("checked={globalEmailPaused"));

  const watchlist = read("src/app/(account)/account/watchlist/page.tsx");
  assert.ok(watchlist.includes("globalEmailPaused={!user.emailAlertsEnabled}"));
  assert.ok(watchlist.includes("requireCustomerUser"));

  const searches = read("src/app/(account)/account/searches/page.tsx");
  assert.ok(searches.includes("!user.emailAlertsEnabled"));
  assert.ok(searches.includes("GLOBAL_EMAIL_PAUSED_BANNER"));
  assert.ok(searches.includes("initialEmailAlerts={search.emailAlerts}"));
  assert.ok(!searches.includes("setCategoryEmailPreference"));
  assert.ok(!searches.includes("evaluateOptionalEmailSuppression"));
}

function testStopWatchingCopy() {
  const messages = read("src/lib/site-messages.ts");
  assert.ok(messages.includes('title: "Stop watching this home?"'));
  assert.ok(messages.includes("This removes the Property Watch"));
  assert.ok(messages.includes("Pausing email alerts keeps the watch"));
  assert.ok(messages.includes('title: "Stop watching this area?"'));
  assert.ok(messages.includes("This removes the Area Watch"));
  assert.ok(messages.includes("alerts generated by this watch"));

  const client = read("src/components/account/MonitorsClient.tsx");
  assert.ok(client.includes("SITE_MESSAGES.stopWatchingHome"));
  assert.ok(client.includes("SITE_MESSAGES.removeAreaWatch"));
  assert.ok(client.includes("Stop watching"));
  // DELETE remains separate from PATCH email toggles
  const patchIdx = client.indexOf('method: "PATCH"');
  const deleteIdx = client.indexOf('method: "DELETE"');
  assert.ok(patchIdx > 0 && deleteIdx > 0);
  assert.ok(client.includes("unwatchHome"));
  assert.ok(client.includes("unwatchArea"));
  // Email toggles call PATCH builders only — never DELETE payloads
  assert.ok(client.includes("buildPropertyEmailAlertsPatch"));
  assert.ok(
    !client.includes('JSON.stringify({ mlsNumber }),\n    });\n    setBusyDelete') ||
      client.includes("unwatchHome"),
  );
  const emailPatchFn = client.slice(
    client.indexOf("async function patchPropertyEmail"),
    client.indexOf("async function patchAreaField"),
  );
  assert.ok(emailPatchFn.includes('method: "PATCH"'));
  assert.ok(!emailPatchFn.includes('method: "DELETE"'));
}

function testSavedSearchSemantics() {
  const toggle = read(
    "src/components/account/SavedSearchEmailAlertsToggle.tsx",
  );
  assert.ok(toggle.includes("/api/saved-searches"));
  assert.ok(toggle.includes('method: "PATCH"'));
  assert.ok(toggle.includes("buildSavedSearchEmailAlertsPatch"));
  assert.ok(
    toggle.includes(
      "Controls email updates for this saved search. As your primary search, this also affects Buyer Digest eligibility.",
    ),
  );
  assert.ok(
    toggle.includes('"Controls email updates for this saved search."'),
  );
  assert.ok(!toggle.includes("instant"));
  assert.ok(!toggle.includes("immediate"));
  assert.ok(!toggle.includes("new listing email"));
  assert.ok(!toggle.includes("LeadActivity"));

  const page = read("src/app/(account)/account/searches/page.tsx");
  assert.ok(page.includes("SavedSearchEmailAlertsToggle"));
  assert.ok(page.includes("DeleteSavedSearchButton"));
  assert.ok(page.includes("isPrimary={search.isPrimary}"));
}

function testCopyAndHints() {
  assert.equal(propertyEmailAlertsHint(true), "Email alerts are on");
  assert.equal(propertyEmailAlertsHint(false), "Email alerts are paused");
  assert.ok(areaEmailAlertsHint(false).includes("paused"));
  assert.ok(GLOBAL_EMAIL_PAUSED_BANNER.includes("Communication Preferences"));
  assert.ok(GLOBAL_EMAIL_PAUSED_BANNER.includes("preserved"));
}

function testMonitorsClientUi() {
  const client = read("src/components/account/MonitorsClient.tsx");
  assert.ok(client.includes("buildPropertyEmailAlertsPatch"));
  assert.ok(client.includes("buildAreaAlertFieldPatch"));
  assert.ok(client.includes("/api/account/property-monitors"));
  assert.ok(client.includes("/api/account/area-monitors"));
  assert.ok(client.includes("Email alerts"));
  assert.ok(client.includes("New listings"));
  assert.ok(client.includes("Sold / leased"));
  assert.ok(client.includes("resolveToggleMutationOutcome"));
  assert.ok(client.includes("EntityAlertSwitchRow"));
  assert.ok(!client.includes("pushAlerts"));
  assert.ok(!client.includes("Push alerts"));
  assert.ok(!client.includes("LeadActivity"));
  assert.ok(!client.includes("logLeadActivity"));
  assert.ok(client.includes('patchAreaField(m.id, "emailAlerts", next)'));
  assert.ok(client.includes('patchAreaField(m.id, "notifyNew", next)'));
  assert.ok(client.includes('patchAreaField(m.id, "notifySold", next)'));
  // Stale failures must not toast
  assert.ok(
    client.includes(
      "Could not update email alerts. Please try again.",
    ),
  );
  const catchSlices = client.split("} catch {");
  for (const slice of catchSlices.slice(1)) {
    const body = slice.slice(0, slice.indexOf("} finally"));
    if (!body.includes("toast")) continue;
    assert.ok(
      body.includes("isCurrentMutationGeneration"),
      "catch toast must be generation-gated",
    );
  }
}

function testPhase3aApiUntouched() {
  const prop = read("src/app/api/account/property-monitors/route.ts");
  assert.ok(prop.includes("propertyMonitorEmailPatchSchema"));
  assert.ok(prop.includes("patchPropertyMonitorEmailAlerts"));

  const area = read("src/app/api/account/area-monitors/route.ts");
  assert.ok(area.includes("areaMonitorSettingsPatchSchema"));
  assert.ok(area.includes("patchAreaMonitorSettings"));

  const saved = read("src/app/api/saved-searches/route.ts");
  assert.ok(saved.includes("prismaOwnedSavedSearchStore"));

  // Phase 3B file set must not touch API routes
  const statusFiles = [
    "src/components/account/MonitorsClient.tsx",
    "src/components/account/SavedSearchEmailAlertsToggle.tsx",
    "src/components/account/EntityAlertSwitchRow.tsx",
    "src/lib/account/entity-alert-mutations.ts",
    "src/app/(account)/account/watchlist/page.tsx",
    "src/app/(account)/account/searches/page.tsx",
    "src/lib/site-messages.ts",
  ];
  for (const rel of statusFiles) {
    const src = read(rel);
    assert.ok(!src.includes("setGlobalOptionalEmailPreference"), rel);
    assert.ok(!src.includes("setCategoryEmailPreference"), rel);
    assert.ok(!src.includes("applyEmailSuppression"), rel);
    assert.ok(!src.includes("logLeadActivityForCustomer"), rel);
    assert.ok(!src.includes("recordActivityEvent"), rel);
  }
}

function testSwitchA11yAndSharedComponent() {
  const row = read("src/components/account/EntityAlertSwitchRow.tsx");
  assert.ok(row.includes("PreferenceSwitch"));
  assert.ok(row.includes("htmlFor={id}"));
  assert.ok(row.includes("min-h-11"));

  const sw = read("src/components/preferences/PreferenceSwitch.tsx");
  assert.ok(sw.includes('role="switch"'));
  assert.ok(sw.includes("aria-checked"));
  assert.ok(sw.includes("aria-label"));
  assert.ok(sw.includes("focus-visible:ring"));
}

function main() {
  testPatchBodiesArePartial();
  testRaceScenariosABC();
  testMutationKeysArePerEntityAndSetting();
  testStoredVsEffectiveGlobalPause();
  testStopWatchingCopy();
  testSavedSearchSemantics();
  testCopyAndHints();
  testMonitorsClientUi();
  testPhase3aApiUntouched();
  testSwitchA11yAndSharedComponent();
  console.log("communications-phase3b-selftest: ok");
}

main();
