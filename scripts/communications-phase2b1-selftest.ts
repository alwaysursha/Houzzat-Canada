/**
 * Phase 2B-1 — secure preference tokens, public backend, footer, one-click.
 * Run: pnpm communications-phase2b1:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GET as oneClickGet } from "../src/app/api/preferences/email/one-click/route";
import { classifyEmailKind } from "../src/lib/communications/classification";
import { getCustomerCommunicationPreferences } from "../src/lib/communications/customer-preferences";
import { evaluateCommunicationPolicy } from "../src/lib/communications/policy";
import { memoryPreferenceAuditStore } from "../src/lib/communications/preference-audit";
import {
  setCategoryEmailPreference,
  setGlobalOptionalEmailPreference,
  type PreferenceCommandContext,
  type PreferenceUserRecord,
  type PreferenceUserStore,
} from "../src/lib/communications/preference-commands";
import {
  buildCustomerPreferenceEmailChrome,
  optionalEmailEligibleForPreferenceChrome,
  toPublicPreferenceCenterPayload,
} from "../src/lib/communications/preference-email-chrome";
import { memoryCommunicationPreferenceStore } from "../src/lib/communications/preference-store";
import {
  PREFERENCE_TOKEN_TTL_MS,
  hashPreferenceToken,
} from "../src/lib/communications/preference-token-crypto";
import {
  issuePreferenceAccessToken,
  listUnsubscribeHeaders,
  resolvePreferenceAccessToken,
  revokePreferenceTokensForEmailChange,
} from "../src/lib/communications/preference-token-service";
import { memoryCommunicationPreferenceTokenStore } from "../src/lib/communications/preference-token-store";
import {
  applyEmailSuppression,
  memoryEmailSuppressionStore,
} from "../src/lib/communications/suppression";
import { isPushTypeEnabled } from "../src/lib/notifications/catalog";

process.env.AUTH_SECRET ??= "phase2b1-test-secret";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function memoryUserStore(
  users: PreferenceUserRecord[],
): PreferenceUserStore & { users: PreferenceUserRecord[] } {
  return {
    users,
    async findById(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async updateEmailAlertsEnabled(input) {
      const user = users.find((row) => row.id === input.userId);
      if (!user) throw new Error("missing user");
      user.emailAlertsEnabled = input.emailAlertsEnabled;
      if (input.caslConsentAt !== undefined) {
        user.caslConsentAt = input.caslConsentAt ?? null;
      }
      return { ...user };
    },
  };
}

function ctxFor(users: PreferenceUserRecord[]): PreferenceCommandContext & {
  preferenceStore: ReturnType<typeof memoryCommunicationPreferenceStore>;
  suppressionStore: ReturnType<typeof memoryEmailSuppressionStore>;
  auditStore: ReturnType<typeof memoryPreferenceAuditStore>;
} {
  const userStore = memoryUserStore(users);
  const preferenceStore = memoryCommunicationPreferenceStore();
  const suppressionStore = memoryEmailSuppressionStore();
  const auditStore = memoryPreferenceAuditStore();
  return {
    userStore,
    preferenceStore,
    suppressionStore,
    auditStore,
    async runCanonicalTransaction(work) {
      const usersSnap = userStore.users.map((row) => ({ ...row }));
      const suppressionSnap = suppressionStore.rows.map((row) => ({ ...row }));
      const auditSnap = auditStore.rows.map((row) => ({ ...row }));
      try {
        return await work({ userStore, suppressionStore, auditStore });
      } catch (error) {
        userStore.users.splice(0, userStore.users.length, ...usersSnap);
        suppressionStore.rows.splice(0, suppressionStore.rows.length, ...suppressionSnap);
        auditStore.rows.splice(0, auditStore.rows.length, ...auditSnap);
        throw error;
      }
    },
  };
}

const userA: PreferenceUserRecord = {
  id: "user_a",
  email: "a@example.com",
  workspaceId: "ws_a",
  emailAlertsEnabled: true,
  caslConsentAt: new Date("2026-01-01T00:00:00.000Z"),
};

function tokenUsers(users: PreferenceUserRecord[]) {
  return {
    async findById(id: string) {
      const user = users.find((row) => row.id === id) ?? null;
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        workspaceId: user.workspaceId,
        emailAlertsEnabled: user.emailAlertsEnabled,
        disabledAt: null as Date | null,
      };
    },
  };
}

function assertNoRecoverableSecret(
  rows: Array<Record<string, unknown>>,
  rawTokens: string[],
) {
  const serialized = JSON.stringify(rows);
  for (const raw of rawTokens) {
    assert.equal(serialized.includes(raw), false);
  }
  for (const row of rows) {
    assert.equal("secretCipher" in row, false);
    assert.equal("rawToken" in row, false);
    assert.equal(typeof row.tokenHash, "string");
    assert.ok(String(row.tokenHash).length === 64);
    for (const raw of rawTokens) {
      assert.notEqual(row.tokenHash, raw);
    }
  }
}

async function testTokenSecurity() {
  const store = memoryCommunicationPreferenceTokenStore();
  const users = [{ ...userA }];
  const minted = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "test",
    store,
  });
  assertNoRecoverableSecret(store.rows, [minted.rawToken]);
  assert.equal(store.rows[0]?.tokenHash, hashPreferenceToken(minted.rawToken));

  const ok = await resolvePreferenceAccessToken(minted.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.resolved.user.id, "user_a");
    assert.equal(ok.resolved.user.workspaceId, "ws_a");
  }

  const invalid = await resolvePreferenceAccessToken("not-a-real-token-value", {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
  });
  assert.equal(invalid.ok, false);

  const expired = await resolvePreferenceAccessToken(minted.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
    now: new Date(Date.now() + PREFERENCE_TOKEN_TTL_MS + 1),
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.error, "expired");

  store.rows[0]!.revokedAt = new Date();
  const revoked = await resolvePreferenceAccessToken(minted.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
  });
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.equal(revoked.error, "revoked");
}

async function testIndependentTokensRemainValid() {
  const store = memoryCommunicationPreferenceTokenStore();
  const users = [{ ...userA }];
  const manageA = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "email_1",
    store,
  });
  const manageB = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "email_2",
    store,
  });
  const clickA = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "one_click",
    source: "email_1",
    store,
  });
  const clickB = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "one_click",
    source: "email_2",
    store,
  });
  assert.equal(store.rows.length, 4);
  assert.notEqual(manageA.rawToken, manageB.rawToken);
  assert.notEqual(clickA.rawToken, clickB.rawToken);

  for (const raw of [manageA.rawToken, manageB.rawToken]) {
    const resolved = await resolvePreferenceAccessToken(raw, {
      expectedPurpose: "manage",
      store,
      users: tokenUsers(users),
    });
    assert.equal(resolved.ok, true);
  }
  for (const raw of [clickA.rawToken, clickB.rawToken]) {
    const resolved = await resolvePreferenceAccessToken(raw, {
      expectedPurpose: "one_click",
      store,
      users: tokenUsers(users),
    });
    assert.equal(resolved.ok, true);
  }

  const chrome1 = await buildCustomerPreferenceEmailChrome({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    origin: "https://tenant.example",
    store,
  });
  const chrome2 = await buildCustomerPreferenceEmailChrome({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    origin: "https://tenant.example",
    store,
  });
  assert.ok(chrome1 && chrome2);
  assert.notEqual(chrome1.manageUrl, chrome2.manageUrl);
  const stillOld = await resolvePreferenceAccessToken(manageA.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
  });
  assert.equal(stillOld.ok, true);
}

async function testCrossWorkspaceAndPurpose() {
  const store = memoryCommunicationPreferenceTokenStore();
  const users = [
    { ...userA },
    {
      ...userA,
      id: "user_b",
      workspaceId: "ws_b",
      email: "b@example.com",
    },
  ];
  const manage = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "test",
    store,
  });
  const oneClick = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "one_click",
    source: "test",
    store,
  });
  const asOneClick = await resolvePreferenceAccessToken(manage.rawToken, {
    expectedPurpose: "one_click",
    store,
    users: tokenUsers(users),
  });
  assert.equal(asOneClick.ok, false);
  if (!asOneClick.ok) assert.equal(asOneClick.error, "purpose_mismatch");

  const asManage = await resolvePreferenceAccessToken(oneClick.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
  });
  assert.equal(asManage.ok, false);

  users[0]!.workspaceId = "ws_b";
  const cross = await resolvePreferenceAccessToken(manage.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
  });
  assert.equal(cross.ok, false);
  if (!cross.ok) assert.equal(cross.error, "workspace_mismatch");
}

async function testEmailChangeRevokesAllActiveTokens() {
  const store = memoryCommunicationPreferenceTokenStore();
  const users = [{ ...userA }];
  const manageA = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "test",
    store,
  });
  const manageB = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "test",
    store,
  });
  const clickA = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "one_click",
    source: "test",
    store,
  });
  const clickB = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "one_click",
    source: "test",
    store,
  });
  users[0]!.email = "new@example.com";
  const beforeRevoke = await resolvePreferenceAccessToken(manageA.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers(users),
  });
  assert.equal(beforeRevoke.ok, false);
  if (!beforeRevoke.ok) assert.equal(beforeRevoke.error, "email_mismatch");

  const revokedCount = await revokePreferenceTokensForEmailChange({
    userId: "user_a",
    store,
  });
  assert.equal(revokedCount, 4);
  assert.equal(store.rows.every((row) => row.revokedAt != null), true);

  const originalIdentity = [{ ...userA }];
  for (const [raw, purpose] of [
    [manageA.rawToken, "manage"],
    [manageB.rawToken, "manage"],
    [clickA.rawToken, "one_click"],
    [clickB.rawToken, "one_click"],
  ] as const) {
    const after = await resolvePreferenceAccessToken(raw, {
      expectedPurpose: purpose,
      store,
      users: tokenUsers(originalIdentity),
    });
    assert.equal(after.ok, false);
    if (!after.ok) assert.equal(after.error, "revoked");
  }
}

async function testDeletedUserFails() {
  const store = memoryCommunicationPreferenceTokenStore();
  const minted = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "test",
    store,
  });
  const gone = await resolvePreferenceAccessToken(minted.rawToken, {
    expectedPurpose: "manage",
    store,
    users: tokenUsers([]),
  });
  assert.equal(gone.ok, false);
  if (!gone.ok) assert.equal(gone.error, "user_unavailable");
}

async function testGetDoesNotMutate() {
  const ctx = ctxFor([{ ...userA }]);
  const store = memoryCommunicationPreferenceTokenStore();
  const minted = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "manage",
    source: "test",
    store,
  });
  const oneClick = await issuePreferenceAccessToken({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    purpose: "one_click",
    source: "test",
    store,
  });
  const before = JSON.stringify({
    user: await ctx.userStore.findById("user_a"),
    suppression: ctx.suppressionStore.rows,
    prefs: ctx.preferenceStore.rows,
    audit: ctx.auditStore.rows,
    tokens: store.rows.map((row) => ({
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
    })),
  });
  for (let i = 0; i < 3; i += 1) {
    const resolved = await resolvePreferenceAccessToken(minted.rawToken, {
      expectedPurpose: "manage",
      store,
      users: tokenUsers([
        {
          ...userA,
          emailAlertsEnabled: (await ctx.userStore.findById("user_a"))!
            .emailAlertsEnabled,
        },
      ]),
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) continue;
    await getCustomerCommunicationPreferences({
      userId: resolved.resolved.user.id,
      workspaceId: resolved.resolved.user.workspaceId,
      email: resolved.resolved.user.email,
      emailAlertsEnabled: resolved.resolved.user.emailAlertsEnabled,
      preferenceStore: ctx.preferenceStore,
      suppressionStore: ctx.suppressionStore,
    });
    const clickResolved = await resolvePreferenceAccessToken(oneClick.rawToken, {
      expectedPurpose: "one_click",
      store,
      users: tokenUsers([{ ...userA }]),
    });
    assert.equal(clickResolved.ok, true);
  }
  const getResponse = await oneClickGet();
  assert.equal(getResponse.status, 405);
  assert.equal(
    JSON.stringify({
      user: await ctx.userStore.findById("user_a"),
      suppression: ctx.suppressionStore.rows,
      prefs: ctx.preferenceStore.rows,
      audit: ctx.auditStore.rows,
      tokens: store.rows.map((row) => ({
        revokedAt: row.revokedAt,
        lastUsedAt: row.lastUsedAt,
      })),
    }),
    before,
  );
}

async function testPublicReadShape() {
  const ctx = ctxFor([{ ...userA }]);
  const prefs = await getCustomerCommunicationPreferences({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "a@example.com",
    emailAlertsEnabled: true,
    preferenceStore: ctx.preferenceStore,
    suppressionStore: ctx.suppressionStore,
  });
  const publicPrefs = toPublicPreferenceCenterPayload(prefs);
  assert.equal(typeof publicPrefs.optionalEmailMismatch, "boolean");
  assert.equal(publicPrefs.optionalEmailMismatch, false);
  assert.equal(publicPrefs.optionalEmailMismatchReason, null);
  assert.equal("userId" in publicPrefs, false);
  assert.equal("leadId" in publicPrefs, false);
}

async function testCategoryAndGlobalViaCanonical() {
  const ctx = ctxFor([{ ...userA }]);
  const denied = await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "account_security",
    channel: "email",
    enabled: false,
    source: "preference_center_token",
  });
  assert.equal(denied.ok, false);

  const push = await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "property_watch",
    channel: "push",
    enabled: false,
    source: "preference_center_token",
  });
  assert.equal(push.ok, false);

  const off = await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "property_watch",
    channel: "email",
    enabled: false,
    source: "preference_center_token",
  });
  assert.equal(off.ok, true);

  const mailboxBefore = await applyEmailSuppression(ctx.suppressionStore, {
    workspaceId: "ws_a",
    userId: "user_a",
    emailNormalized: "a@example.com",
    reason: "HARD_BOUNCE",
    source: "resend",
    providerId: "x",
    leadEmailLogId: null,
    meta: null,
  });
  assert.equal(mailboxBefore.created, true);

  const unsub = await setGlobalOptionalEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "one_click_unsubscribe",
  });
  assert.equal(unsub.ok, true);
  assert.equal((await ctx.userStore.findById("user_a"))?.emailAlertsEnabled, false);
  assert.equal(
    ctx.suppressionStore.rows.some(
      (row) => row.scope === "CUSTOMER" && row.reason === "GLOBAL_UNSUBSCRIBE",
    ),
    true,
  );
  const again = await setGlobalOptionalEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "one_click_unsubscribe",
  });
  assert.equal(again.ok, true);

  const auditDump = JSON.stringify(ctx.auditStore.rows);
  assert.equal(auditDump.includes("rawToken"), false);
  assert.equal(auditDump.includes("secretCipher"), false);

  const casl = userA.caslConsentAt;
  const resub = await setGlobalOptionalEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: true,
    source: "preference_center_token",
  });
  assert.equal(resub.ok, true);
  assert.equal((await ctx.userStore.findById("user_a"))?.caslConsentAt, casl);
  assert.equal(
    ctx.suppressionStore.rows.some((row) => row.scope === "CUSTOMER"),
    false,
  );
  assert.equal(
    ctx.suppressionStore.rows.find((row) => row.scope === "MAILBOX")?.reason,
    "HARD_BOUNCE",
  );
  assert.equal(
    ctx.preferenceStore.rows.find((row) => row.category === "property_watch")
      ?.enabled,
    false,
  );
  assert.equal(isPushTypeEnabled(null, "price_drop"), true);
  assert.equal(
    evaluateCommunicationPolicy({
      class: "transactional",
      category: "account_security",
      channel: "email",
      emailAlertsEnabled: false,
      emailSuppressed: true,
    }).reason,
    "transactional_exempt",
  );
}

function testHeadersAndEligibility() {
  assert.equal(optionalEmailEligibleForPreferenceChrome("price_reduction"), true);
  assert.equal(optionalEmailEligibleForPreferenceChrome("shortlist"), true);
  assert.equal(optionalEmailEligibleForPreferenceChrome("cma_share"), true);
  assert.equal(optionalEmailEligibleForPreferenceChrome("password_reset"), false);
  assert.equal(optionalEmailEligibleForPreferenceChrome("verify_email"), false);
  assert.equal(optionalEmailEligibleForPreferenceChrome("verify_email_nudge"), false);
  assert.equal(optionalEmailEligibleForPreferenceChrome("welcome"), false);
  assert.equal(classifyEmailKind("welcome").class, "transactional");

  const headers = listUnsubscribeHeaders(
    "https://tenant.example/api/preferences/email/one-click?token=abc",
  );
  assert.equal(
    headers["List-Unsubscribe"],
    "<https://tenant.example/api/preferences/email/one-click?token=abc>",
  );
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(headers["List-Unsubscribe"].includes("userId"), false);
  assert.equal(headers["List-Unsubscribe"].includes("workspaceId"), false);
}

function testSourceContracts() {
  const send = read("src/lib/email/send.ts");
  assert.ok(send.includes("headers: input.headers"));
  const oneClick = read("src/app/api/preferences/email/one-click/route.ts");
  assert.ok(oneClick.includes("Method Not Allowed"));
  assert.ok(oneClick.includes('expectedPurpose: "one_click"'));
  assert.ok(oneClick.includes("enabled: false"));
  const manage = read("src/app/api/preferences/email/route.ts");
  assert.ok(manage.includes('expectedPurpose: "manage"'));
  assert.ok(manage.includes("setCategoryEmailPreference"));
  assert.ok(manage.includes("setGlobalOptionalEmailPreference"));
  assert.ok(manage.includes("parsed.data.userId"));
  const page = read("src/app/preferences/email/page.tsx");
  assert.ok(page.includes("did not change"));
  assert.ok(!page.includes("setGlobalOptionalEmailPreference"));
  const layout = read("src/lib/email/layout.ts");
  assert.ok(layout.includes("Manage email preferences"));
  assert.ok(layout.includes("Unsubscribe"));
  const crypto = read("src/lib/communications/preference-token-crypto.ts");
  assert.ok(crypto.includes('createHash("sha256")'));
  assert.ok(crypto.includes("PREFERENCE_TOKEN_TTL_MS"));
  assert.ok(!crypto.includes("createCipheriv"));
  assert.ok(!crypto.includes("secretCipher"));
  assert.ok(
    !read("src/lib/communications/preference-token-service.ts").includes(
      "console.log(rawToken",
    ),
  );
  const change = read("src/lib/agent/lead-info-change.ts");
  assert.ok(change.includes("revokePreferenceTokensForEmailChange"));
  const migration = read(
    "prisma/migrations/20261005180000_communication_preference_tokens/migration.sql",
  );
  assert.ok(migration.includes("CommunicationPreferenceToken"));
  assert.ok(!migration.includes("secretCipher"));
  assert.ok(!migration.includes("active_user_ws_purpose"));
  assert.ok(
    !read(
      "prisma/migrations/20261005010000_communication_preference_foundation/migration.sql",
    ).includes("CommunicationPreferenceToken"),
  );
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("model CommunicationPreferenceToken"));
  assert.ok(!schema.includes("secretCipher"));
}

async function main() {
  await testTokenSecurity();
  await testIndependentTokensRemainValid();
  await testCrossWorkspaceAndPurpose();
  await testEmailChangeRevokesAllActiveTokens();
  await testDeletedUserFails();
  await testGetDoesNotMutate();
  await testPublicReadShape();
  await testCategoryAndGlobalViaCanonical();
  testHeadersAndEligibility();
  testSourceContracts();
  console.log("communications-phase2b1-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
