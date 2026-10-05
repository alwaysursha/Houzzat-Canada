/**
 * Phase 2B-2 — Preference Center UI contracts + integration guards.
 * Run: pnpm communications-phase2b2:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPreferenceCenterCatalogComplete,
  PREFERENCE_CENTER_EMAIL_CATEGORIES,
} from "../src/lib/communications/preference-center-catalog";
import { CUSTOMER_OPTIONAL_EMAIL_CATEGORIES } from "../src/lib/communications/classification";
import {
  derivePreferenceCenterUiState,
  isCustomerOptionalEmailPaused,
} from "../src/lib/communications/preference-center-ui-state";
import { CONSUMER_PUSH_TYPES } from "../src/lib/notifications/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testCatalog() {
  assert.equal(assertPreferenceCenterCatalogComplete(), true);
  assert.equal(
    PREFERENCE_CENTER_EMAIL_CATEGORIES.length,
    CUSTOMER_OPTIONAL_EMAIL_CATEGORIES.length,
  );
  assert.equal(PREFERENCE_CENTER_EMAIL_CATEGORIES.length, 7);
  const titles = PREFERENCE_CENTER_EMAIL_CATEGORIES.map((c) => c.title);
  assert.ok(titles.includes("Property Watch"));
  assert.ok(titles.includes("Area Watch"));
  assert.ok(titles.includes("Saved Search Alerts"));
  assert.ok(titles.includes("Daily Home Digest"));
  assert.ok(titles.includes("Seller & Market Updates"));
  assert.ok(titles.includes("Updates From Your Agent"));
  assert.ok(titles.includes("Houzzat News & Updates"));
  const saved = PREFERENCE_CENTER_EMAIL_CATEGORIES.find(
    (c) => c.category === "saved_search",
  );
  const marketing = PREFERENCE_CENTER_EMAIL_CATEGORIES.find(
    (c) => c.category === "marketing",
  );
  assert.ok(saved?.footnote);
  assert.ok(marketing?.footnote);
}

function testMailboxGlobalCombinations() {
  // A. global ON + mailbox suppressed
  const a = derivePreferenceCenterUiState({
    customerUnsubscribed: false,
    globalEmailEnabled: true,
    mailboxSuppressed: true,
    hasManageToken: false,
    sessionAuthenticated: true,
  });
  assert.equal(a.showMailboxWarning, true);
  assert.equal(a.showGlobalPause, false);
  assert.equal(a.showResume, false);
  assert.equal(a.resumeHasDeliveryCaveat, false);
  assert.equal(a.showUnsubscribeCta, true);

  // B. global OFF + mailbox clear
  const b = derivePreferenceCenterUiState({
    customerUnsubscribed: true,
    globalEmailEnabled: false,
    mailboxSuppressed: false,
    hasManageToken: false,
    sessionAuthenticated: true,
  });
  assert.equal(b.showMailboxWarning, false);
  assert.equal(b.showGlobalPause, true);
  assert.equal(b.showResume, true);
  assert.equal(b.resumeHasDeliveryCaveat, false);
  assert.equal(b.showUnsubscribeCta, false);

  // C. global OFF + mailbox suppressed
  const c = derivePreferenceCenterUiState({
    customerUnsubscribed: true,
    globalEmailEnabled: false,
    mailboxSuppressed: true,
    hasManageToken: false,
    sessionAuthenticated: true,
  });
  assert.equal(c.showMailboxWarning, true);
  assert.equal(c.showGlobalPause, true);
  assert.equal(c.showResume, true);
  assert.equal(c.resumeHasDeliveryCaveat, true);
  assert.equal(c.showUnsubscribeCta, false);

  // Mailbox alone never equals customer unsubscribe
  assert.equal(
    isCustomerOptionalEmailPaused({
      customerUnsubscribed: false,
      globalEmailEnabled: true,
    }),
    false,
  );

  const client = read("src/components/preferences/PreferenceCenterClient.tsx");
  assert.ok(client.includes("derivePreferenceCenterUiState"));
  assert.ok(client.includes("resume-delivery-caveat"));
  assert.ok(
    client.includes(
      "You can resume your email preferences, but delivery will remain paused",
    ),
  );
  assert.ok(!client.includes("HARD_BOUNCE"));
  assert.ok(!client.includes("COMPLAINT"));
  // Resume must not be gated on !mailboxSuppressed anymore
  assert.ok(!client.includes("!preferences.mailboxSuppressed"));
  assert.ok(
    !client.includes(
      "!optionalEmailEffective && !preferences.mailboxSuppressed",
    ),
  );
  assert.ok(!client.includes("!optionalEmailEffective && !mailboxSuppressed"));

  // Canonical Resume path still global ON only; mailbox cleared nowhere in UI
  assert.ok(client.includes("globalOptionalEmail: true"));
  const resumeFn = client.slice(
    client.indexOf("async function onResume"),
    client.indexOf("if (loadState.status === \"loading\""),
  );
  assert.ok(resumeFn.includes("globalOptionalEmail: true"));
  assert.ok(!resumeFn.includes("mailbox"));
  assert.ok(!resumeFn.includes("HARD_BOUNCE"));
}

function testIdentityModes() {
  // 5. no token + authenticated → push allowed
  assert.equal(
    derivePreferenceCenterUiState({
      customerUnsubscribed: false,
      globalEmailEnabled: true,
      mailboxSuppressed: false,
      hasManageToken: false,
      sessionAuthenticated: true,
    }).showAuthenticatedPush,
    true,
  );

  // 6. token + signed out → push not mounted
  assert.equal(
    derivePreferenceCenterUiState({
      customerUnsubscribed: false,
      globalEmailEnabled: true,
      mailboxSuppressed: false,
      hasManageToken: true,
      sessionAuthenticated: false,
    }).showAuthenticatedPush,
    false,
  );

  // 7. token + authenticated same customer → push not mounted
  assert.equal(
    derivePreferenceCenterUiState({
      customerUnsubscribed: false,
      globalEmailEnabled: true,
      mailboxSuppressed: false,
      hasManageToken: true,
      sessionAuthenticated: true,
    }).showAuthenticatedPush,
    false,
  );

  // 8. token + authenticated different customer → push not mounted
  // (same rule: any token mode suppresses session push)
  assert.equal(
    derivePreferenceCenterUiState({
      customerUnsubscribed: true,
      globalEmailEnabled: false,
      mailboxSuppressed: true,
      hasManageToken: true,
      sessionAuthenticated: true,
    }).showAuthenticatedPush,
    false,
  );

  const client = read("src/components/preferences/PreferenceCenterClient.tsx");
  assert.ok(client.includes('mode !== "authenticated"'));
  assert.ok(client.includes("ui.showAuthenticatedPush"));
  assert.ok(client.includes("authenticated-push-controls"));
  assert.ok(client.includes("push-signin-prompt"));
  assert.ok(client.includes("Token mode never loads session push"));

  // 9. invalid token + authenticated → invalid UI, no session fallback
  assert.ok(client.includes('status: "invalid_token"'));
  const invalidBlock = client.slice(
    client.indexOf('if (loadState.status === "invalid_token")'),
    client.indexOf('if (loadState.status === "signin_required")'),
  );
  assert.ok(invalidBlock.includes("This preference link is no longer valid"));
  assert.ok(!invalidBlock.includes("loadPreferences"));
  assert.ok(!invalidBlock.includes("/api/account/communication-preferences"));
  assert.ok(!invalidBlock.includes("NotificationPreferencesForm"));
}

function testPageAndClient() {
  const page = read("src/app/preferences/email/page.tsx");
  assert.ok(page.includes("PreferenceCenterClient"));
  assert.ok(page.includes("GET is always non-mutating"));
  assert.ok(!page.includes("setGlobalOptionalEmailPreference"));
  assert.ok(!page.includes("localStorage"));

  const client = read("src/components/preferences/PreferenceCenterClient.tsx");
  assert.ok(client.includes("Communication Preferences"));
  assert.ok(client.includes("PREFERENCE_CENTER_EMAIL_CATEGORIES"));
  assert.ok(client.includes("/api/preferences/email"));
  assert.ok(client.includes("/api/account/communication-preferences"));
  assert.ok(client.includes("globalOptionalEmail: false"));
  assert.ok(client.includes("globalOptionalEmail: true"));
  assert.ok(client.includes("Unsubscribe from all emails?"));
  assert.ok(client.includes("Keep emails"));
  assert.ok(client.includes("Resume email notifications"));
  assert.ok(client.includes("Optional emails are turned off"));
  assert.ok(client.includes("currently deliver email to this address"));
  assert.ok(client.includes("Your email preferences are being updated"));
  assert.ok(client.includes("Please refresh and try"));
  assert.ok(client.includes("This preference link is no longer valid"));
  assert.ok(client.includes("Sign in to manage push"));
  assert.ok(client.includes("Preference updated"));
  assert.ok(client.includes("Email notifications paused"));
  assert.ok(client.includes("Email notifications resumed"));
  assert.ok(client.includes("inFlightRef"));
  assert.ok(client.includes('initialAction === "unsubscribe"'));
  assert.ok(
    client.includes('role="switch"') ||
      read("src/components/preferences/PreferenceSwitch.tsx").includes(
        'role="switch"',
      ),
  );
  assert.ok(!client.includes("localStorage"));
  assert.ok(!client.includes("sessionStorage"));
  assert.ok(!client.includes("document.cookie"));
  assert.ok(!client.includes("analytics"));
  assert.ok(!client.includes("Raw token"));
  assert.ok(!client.includes("SMS alerts"));
  assert.ok(!client.includes("smsAlertsEnabled"));
  for (const id of CONSUMER_PUSH_TYPES) {
    assert.ok(
      read("src/lib/notifications/catalog.ts").includes(`"${id}"`),
      `missing push id ${id}`,
    );
  }
}

function testAuthenticatedApi() {
  const api = read("src/app/api/account/communication-preferences/route.ts");
  assert.ok(api.includes("toPublicPreferenceCenterPayload"));
  assert.ok(api.includes("setCategoryEmailPreference"));
  assert.ok(api.includes("setGlobalOptionalEmailPreference"));
  assert.ok(api.includes("preference_center_authenticated"));
  assert.ok(!api.includes("caslConsentAt"));
  assert.ok(!api.includes("token"));
  assert.ok(!api.includes("List-Unsubscribe"));
  assert.ok(!api.includes("pushNotificationPrefs"));
}

function testAccountIntegration() {
  const form = read("src/components/account/AlertPreferencesForm.tsx");
  assert.ok(form.includes("Communication Preferences"));
  assert.ok(form.includes("/preferences/email"));
  assert.ok(form.includes("smsAlertsEnabled"));
  assert.ok(!form.includes("emailAlertsEnabled"));
  assert.ok(!form.includes("Email alerts for saved searches"));
  assert.ok(
    form.includes("smsAlertsEnabled: smsOn") &&
      form.includes("phone: phoneValue || undefined"),
  );
  assert.ok(!form.includes("emailAlertsEnabled:"));

  const account = read("src/app/(account)/account/page.tsx");
  assert.ok(account.includes("AlertPreferencesForm"));
  assert.ok(!account.includes("emailAlertsEnabled={user.emailAlertsEnabled}"));

  const notifications = read(
    "src/app/(account)/account/notifications/page.tsx",
  );
  assert.ok(notifications.includes("/preferences/email"));
  assert.ok(notifications.includes("Communication Preferences"));
  assert.ok(notifications.includes("NotificationPreferencesForm"));
}

function testSwitchA11y() {
  const sw = read("src/components/preferences/PreferenceSwitch.tsx");
  assert.ok(sw.includes('role="switch"'));
  assert.ok(sw.includes("aria-checked"));
  assert.ok(sw.includes("aria-label"));
  assert.ok(sw.includes("focus-visible:ring"));
}

function testNoMigration() {
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("model CommunicationPreferenceToken"));
  assert.ok(!schema.includes("PreferenceCenter"));
  assert.ok(
    !read(
      "prisma/migrations/20261005180000_communication_preference_tokens/migration.sql",
    ).includes("PreferenceCenter"),
  );
}

function testPhase2b1GetSafetyStillPresent() {
  const oneClick = read("src/app/api/preferences/email/one-click/route.ts");
  assert.ok(oneClick.includes("Method Not Allowed"));
  const manage = read("src/app/api/preferences/email/route.ts");
  assert.ok(manage.includes("export async function GET"));
  const getSlice = manage.slice(
    manage.indexOf("export async function GET"),
    manage.indexOf("export async function PATCH"),
  );
  assert.ok(!getSlice.includes("setGlobalOptionalEmailPreference"));
  assert.ok(!getSlice.includes("setCategoryEmailPreference"));
}

function main() {
  testCatalog();
  testMailboxGlobalCombinations();
  testIdentityModes();
  testPageAndClient();
  testAuthenticatedApi();
  testAccountIntegration();
  testSwitchA11y();
  testNoMigration();
  testPhase2b1GetSafetyStillPresent();
  console.log("communications-phase2b2-selftest: ok");
}

main();
