/**
 * Phase 2A — workspace email template foundation selftest.
 * Run: pnpm workspace-email-templates:selftest
 *
 * No real sends. No production migration apply. Uses in-memory store.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAllowedTemplateVariables,
  assertTenantScopedEmailTemplateMutation,
  canManageWorkspaceEmailTemplates,
  getWorkspaceEmailTemplate,
  listMasterEmailTemplates,
  listWorkspaceEmailTemplateVersions,
  listWorkspaceEmailTemplates,
  memoryWorkspaceEmailTemplateStore,
  publishWorkspaceEmailTemplate,
  resolvePublishedEmailTemplate,
  restoreWorkspaceEmailTemplateDefault,
  saveWorkspaceEmailTemplateDraft,
  validateWorkspaceEmailTemplateDraft,
} from "../src/lib/email/workspace-templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_houzzat_templates";
const WS_B = "ws_canary_templates";

function testRegistryCoverage() {
  const types = listMasterEmailTemplates().map((t) => t.type);
  for (const required of [
    "PROPERTY_WATCH",
    "AREA_WATCH",
    "SAVED_SEARCH_DIGEST",
    "SELLER_NEIGHBOURHOOD_DIGEST",
    "AGENT_EMAIL",
    "SHORTLIST",
    "CMA_SHARE",
    "NEWSLETTER",
  ] as const) {
    assert.ok(types.includes(required), `missing ${required}`);
  }
  for (const def of listMasterEmailTemplates()) {
    assert.ok(def.protectedElements.includes("unsubscribe_link"));
    assert.ok(def.protectedElements.includes("mls_listing_facts"));
    assert.ok(def.rendererKinds.length > 0);
  }
}

function testVariableValidation() {
  const ok = validateWorkspaceEmailTemplateDraft("PROPERTY_WATCH", {
    subject: "Update for {{recipientName}} at {{addressLine}}",
    introText: "Hello {{tenantName}}",
    ctaText: "View listing",
    bodySections: { paragraphs: ["See {{mlsNumber}}"] },
    style: { primaryColor: "#2563EB" },
  });
  assert.equal(ok.ok, true);

  const badVar = validateWorkspaceEmailTemplateDraft("PROPERTY_WATCH", {
    subject: "Leak {{passwordHash}}",
  });
  assert.equal(badVar.ok, false);
  if (!badVar.ok) assert.equal(badVar.code, "UNKNOWN_VARIABLE");

  const badStyle = validateWorkspaceEmailTemplateDraft("PROPERTY_WATCH", {
    style: { primaryColor: "url(https://evil.test)" } as {
      primaryColor: string;
    },
  });
  assert.equal(badStyle.ok, false);

  for (const payload of [
    { bodySections: { paragraphs: ["<script>alert(1)</script>"] } },
    { introText: '<img src=x onerror="alert(1)">' },
    { subject: "Click <a href='javascript:alert(1)'>here</a>" },
    { ctaText: "Go &#60;script&#62;" },
  ]) {
    const bad = validateWorkspaceEmailTemplateDraft("PROPERTY_WATCH", payload);
    assert.equal(bad.ok, false, JSON.stringify(payload));
    if (!bad.ok) assert.equal(bad.code, "FORBIDDEN_CONTENT");
  }

  const applied = applyAllowedTemplateVariables(
    "PROPERTY_WATCH",
    "Hi {{recipientName}} — {{passwordHash}} {{mlsNumber}}",
    { recipientName: "Alex", mlsNumber: "X123", passwordHash: "SECRET" },
  );
  assert.equal(applied, "Hi Alex —  X123");
  assert.doesNotMatch(applied, /SECRET/);
}

function testProtectedElementsNotOverridable() {
  for (const def of listMasterEmailTemplates()) {
    assert.ok(def.protectedElements.includes("unsubscribe_link"));
    assert.ok(def.protectedElements.includes("preference_manage_link"));
    assert.ok(def.protectedElements.includes("legal_sender_identification"));
    assert.ok(def.protectedElements.includes("mls_listing_facts"));
    // Overrides cannot express protected blocks — only approved editable fields.
    for (const field of def.editableFields) {
      assert.ok(
        ["subject", "introText", "bodySections", "ctaText", "style"].includes(
          field,
        ),
      );
    }
    assert.ok(!def.editableFields.includes("unsubscribe_link" as never));
  }
}

function testRbac() {
  assert.equal(canManageWorkspaceEmailTemplates("OWNER"), true);
  assert.equal(canManageWorkspaceEmailTemplates("ADMIN"), true);
  assert.equal(canManageWorkspaceEmailTemplates("AGENT"), false);

  const platform = assertTenantScopedEmailTemplateMutation({
    surface: "platform",
    workspaceId: WS_A,
  });
  assert.equal(platform.ok, false);
  if (!platform.ok) assert.equal(platform.code, "TENANT_SURFACE_REQUIRED");
}

async function testIsolationDraftPublishHistory() {
  const store = memoryWorkspaceEmailTemplateStore();

  const agentDenied = await saveWorkspaceEmailTemplateDraft({
    workspaceId: WS_A,
    role: "AGENT",
    actorUserId: "agent_a",
    templateType: "PROPERTY_WATCH",
    draft: { subject: "Should not save" },
    store,
  });
  assert.equal(agentDenied.ok, false);
  if (!agentDenied.ok) assert.equal(agentDenied.status, 403);

  const draftA = await saveWorkspaceEmailTemplateDraft({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "PROPERTY_WATCH",
    draft: {
      subject: "Houzzat watch · {{addressLine}}",
      introText: "Houzzat intro",
      ctaText: "Open Houzzat listing",
    },
    store,
  });
  assert.equal(draftA.ok, true);

  const draftB = await saveWorkspaceEmailTemplateDraft({
    workspaceId: WS_B,
    role: "ADMIN",
    actorUserId: "admin_b",
    templateType: "PROPERTY_WATCH",
    draft: {
      subject: "Canary watch · {{addressLine}}",
      introText: "Canary intro",
      ctaText: "Open Canary listing",
      style: { primaryColor: "#2563EB" },
    },
    store,
  });
  assert.equal(draftB.ok, true);

  // Draft must not affect live resolution.
  const draftResolveA = await resolvePublishedEmailTemplate(
    { workspaceId: WS_A, templateType: "PROPERTY_WATCH" },
    store,
  );
  assert.equal(draftResolveA.source, "system");
  assert.match(draftResolveA.content.subject ?? "", /watching|Update/i);
  assert.doesNotMatch(draftResolveA.content.subject ?? "", /Houzzat watch/);

  const pubA = await publishWorkspaceEmailTemplate({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "PROPERTY_WATCH",
    store,
  });
  assert.equal(pubA.ok, true);

  const pubB = await publishWorkspaceEmailTemplate({
    workspaceId: WS_B,
    role: "ADMIN",
    actorUserId: "admin_b",
    templateType: "PROPERTY_WATCH",
    store,
  });
  assert.equal(pubB.ok, true);

  const liveA = await resolvePublishedEmailTemplate(
    { workspaceId: WS_A, templateType: "PROPERTY_WATCH" },
    store,
  );
  const liveB = await resolvePublishedEmailTemplate(
    { workspaceId: WS_B, templateType: "PROPERTY_WATCH" },
    store,
  );
  assert.equal(liveA.source, "workspace_published");
  assert.equal(liveB.source, "workspace_published");
  assert.match(liveA.content.subject ?? "", /Houzzat watch/);
  assert.match(liveB.content.subject ?? "", /Canary watch/);
  assert.notEqual(liveA.content.subject, liveB.content.subject);
  assert.equal(liveB.content.style.primaryColor, "#2563EB");
  assert.equal(liveA.content.style.primaryColor ?? null, null);

  // Second publish creates version history.
  await saveWorkspaceEmailTemplateDraft({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "PROPERTY_WATCH",
    draft: { subject: "Houzzat watch v2 · {{addressLine}}" },
    store,
  });
  const pubA2 = await publishWorkspaceEmailTemplate({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "PROPERTY_WATCH",
    store,
  });
  assert.equal(pubA2.ok, true);
  if (pubA2.ok) assert.equal(pubA2.data.publishedVersionNumber, 2);

  const versions = await listWorkspaceEmailTemplateVersions({
    workspaceId: WS_A,
    role: "OWNER",
    templateType: "PROPERTY_WATCH",
    store,
  });
  assert.equal(versions.ok, true);
  if (versions.ok) {
    assert.equal(versions.data.length, 2);
    assert.equal(versions.data[0]?.versionNumber, 2);
    assert.equal(versions.data[1]?.versionNumber, 1);
  }

  // Tenant B history stays isolated.
  const versionsB = await listWorkspaceEmailTemplateVersions({
    workspaceId: WS_B,
    role: "ADMIN",
    templateType: "PROPERTY_WATCH",
    store,
  });
  assert.equal(versionsB.ok, true);
  if (versionsB.ok) {
    assert.equal(versionsB.data.length, 1);
    assert.match(versionsB.data[0]?.content.subject ?? "", /Canary/);
  }

  // Restore default for A — B unchanged.
  const restored = await restoreWorkspaceEmailTemplateDefault({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "PROPERTY_WATCH",
    store,
  });
  assert.equal(restored.ok, true);
  if (restored.ok) assert.equal(restored.data.resolved.source, "system");

  const liveBAfter = await resolvePublishedEmailTemplate(
    { workspaceId: WS_B, templateType: "PROPERTY_WATCH" },
    store,
  );
  assert.equal(liveBAfter.source, "workspace_published");
  assert.match(liveBAfter.content.subject ?? "", /Canary/);
}

async function testInvalidOverrideFailsToSystem() {
  const store = memoryWorkspaceEmailTemplateStore();
  await saveWorkspaceEmailTemplateDraft({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "SHORTLIST",
    draft: { subject: "Shortlist for {{recipientName}}" },
    store,
  });
  await publishWorkspaceEmailTemplate({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "SHORTLIST",
    store,
  });

  // Corrupt published content after the fact.
  const row = await store.findTemplate(WS_A, "SHORTLIST");
  assert.ok(row?.published);
  if (row?.published) {
    row.published.subject = "Steal {{ssn}} and {{bankAccount}}";
  }

  const resolved = await resolvePublishedEmailTemplate(
    { workspaceId: WS_A, templateType: "SHORTLIST" },
    store,
  );
  // Corrupt published override fails closed to system defaults.
  assert.equal(resolved.source, "system");
  assert.match(resolved.content.subject ?? "", /Homes selected|selected for you/i);
  assert.doesNotMatch(resolved.content.subject ?? "", /ssn|bankAccount/);
}

async function testConcurrentPublishSerialization() {
  const store = memoryWorkspaceEmailTemplateStore();
  await saveWorkspaceEmailTemplateDraft({
    workspaceId: WS_A,
    role: "OWNER",
    actorUserId: "owner_a",
    templateType: "NEWSLETTER",
    draft: { subject: "Market notes {{tenantName}}" },
    store,
  });

  const results = await Promise.all([
    publishWorkspaceEmailTemplate({
      workspaceId: WS_A,
      role: "OWNER",
      actorUserId: "owner_a",
      templateType: "NEWSLETTER",
      store,
    }),
    publishWorkspaceEmailTemplate({
      workspaceId: WS_A,
      role: "ADMIN",
      actorUserId: "admin_a",
      templateType: "NEWSLETTER",
      store,
    }),
  ]);
  assert.ok(results.every((r) => r.ok));

  const versions = await listWorkspaceEmailTemplateVersions({
    workspaceId: WS_A,
    role: "OWNER",
    templateType: "NEWSLETTER",
    store,
  });
  assert.equal(versions.ok, true);
  if (versions.ok) {
    assert.equal(versions.data.length, 2);
    const numbers = versions.data.map((v) => v.versionNumber).sort();
    assert.deepEqual(numbers, [1, 2]);
    // Exactly one published pointer — latest version wins after serialized publishes.
    const live = await resolvePublishedEmailTemplate(
      { workspaceId: WS_A, templateType: "NEWSLETTER" },
      store,
    );
    assert.equal(live.source, "workspace_published");
    assert.ok(
      live.versionNumber === 1 || live.versionNumber === 2,
    );
    assert.equal(
      new Set(versions.data.map((v) => v.versionNumber)).size,
      2,
      "version numbers must be unique",
    );
  }
}

async function testCatalogListsAllTypes() {
  const store = memoryWorkspaceEmailTemplateStore();
  const list = await listWorkspaceEmailTemplates({
    workspaceId: WS_A,
    role: "OWNER",
    store,
  });
  assert.equal(list.ok, true);
  if (list.ok) {
    assert.equal(list.data.length, 8);
    assert.ok(list.data.every((t) => t.resolved.source === "system"));
  }

  const one = await getWorkspaceEmailTemplate({
    workspaceId: WS_A,
    role: "AGENT",
    templateType: "NEWSLETTER",
    store,
  });
  assert.equal(one.ok, false);
}

function testNoLiveSenderWiring() {
  const monitors = read("src/lib/account/monitors.ts");
  const buyer = read("src/lib/email/digests/buyer.ts");
  const seller = read("src/lib/email/digests/seller.ts");
  const agent = read("src/app/api/agent/email/route.ts");
  const shortlist = read("src/lib/agent/send-shortlist-email.ts");
  const cma = read("src/lib/cma/send-cma-email.ts");
  const brand = read("src/lib/email/tenant-email-brand.ts");

  // Phase 2C: watches, digests, agent email, shortlist, CMA.
  assert.match(monitors, /loadPublishedPropertyWatchOverride/);
  assert.match(monitors, /loadPublishedAreaWatchOverride/);
  assert.match(monitors, /watchCategory === "property_watch"/);
  assert.match(monitors, /watchCategory === "area_watch"/);
  assert.doesNotMatch(monitors, /SAVED_SEARCH_DIGEST|NEWSLETTER|SHORTLIST|CMA_SHARE/);
  assert.match(buyer, /loadPublishedSavedSearchDigestOverride/);
  assert.match(seller, /loadPublishedSellerNeighbourhoodDigestOverride/);
  assert.doesNotMatch(buyer, /loadPublishedSellerNeighbourhoodDigestOverride/);
  assert.doesNotMatch(seller, /loadPublishedSavedSearchDigestOverride/);
  assert.match(agent, /loadPublishedAgentEmailOverride/);
  assert.match(shortlist, /loadPublishedShortlistOverride/);
  assert.match(cma, /loadPublishedCmaShareOverride/);
  assert.doesNotMatch(agent, /loadPublishedShortlistOverride|loadPublishedCmaShareOverride/);
  assert.doesNotMatch(shortlist, /loadPublishedAgentEmailOverride|loadPublishedCmaShareOverride/);
  assert.doesNotMatch(cma, /loadPublishedAgentEmailOverride|loadPublishedShortlistOverride/);

  const mobileAgent = read(
    "src/app/api/mobile/v2/leads/[leadId]/conversations/route.ts",
  );
  assert.match(mobileAgent, /loadPublishedAgentEmailOverride/);

  const newsletterUnwired = [
    ["agent", agent],
    ["shortlist", shortlist],
    ["cma", cma],
    ["buyer", buyer],
    ["seller", seller],
    ["monitors", monitors],
  ] as const;
  for (const [name, src] of newsletterUnwired) {
    assert.doesNotMatch(
      src,
      /loadPublishedNewsletter|NEWSLETTER/,
      `${name} must not wire NEWSLETTER`,
    );
  }
  assert.match(brand, /TENANT_EMAIL_BRANDING/);
  assert.match(
    read("src/lib/email/workspace-templates/resolve.ts"),
    /Phase 2C/,
  );
  assert.match(
    read("src/lib/email/workspace-templates/feature-flag.ts"),
    /TENANT_EMAIL_TEMPLATES/,
  );

  const migration = read(
    "prisma/migrations/20261016010000_workspace_email_template_foundation/migration.sql",
  );
  assert.match(migration, /WorkspaceEmailTemplate/);
  assert.match(migration, /DO NOT apply to production/);
  assert.match(
    migration,
    /UNIQUE INDEX "WorkspaceEmailTemplate_workspaceId_templateType_key"/,
  );
  assert.match(
    migration,
    /UNIQUE INDEX "WorkspaceEmailTemplateVersion_templateId_versionNumber_key"/,
  );
  assert.match(
    migration,
    /WorkspaceEmailTemplate_workspaceId_fkey/,
  );
  assert.match(
    migration,
    /WorkspaceEmailTemplateVersion_workspaceId_fkey/,
  );
  assert.match(read("prisma/schema.prisma"), /model WorkspaceEmailTemplate/);
  assert.match(
    read("src/lib/email/workspace-templates/store.ts"),
    /FOR UPDATE/,
  );
  assert.match(
    read("src/lib/email/workspace-templates/http-auth.ts"),
    /TENANT_SURFACE_REQUIRED/,
  );
}

async function main() {
  testRegistryCoverage();
  testVariableValidation();
  testProtectedElementsNotOverridable();
  testRbac();
  await testIsolationDraftPublishHistory();
  await testInvalidOverrideFailsToSystem();
  await testConcurrentPublishSerialization();
  await testCatalogListsAllTypes();
  testNoLiveSenderWiring();
  console.log("workspace-email-templates-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
