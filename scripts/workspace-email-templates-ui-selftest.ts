/**
 * Phase 2B — Tenant Email Templates manager UI.
 * Run: pnpm workspace-email-templates-ui:selftest
 *
 * Does not send mail, apply prod migrations, or wire live senders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEmailTemplatePreviewHtml,
  EMAIL_TEMPLATE_PREVIEW_SAMPLE,
  canManageWorkspaceEmailTemplates,
  listMasterEmailTemplates,
} from "../src/lib/email/workspace-templates";
import { isTenantCommandCentrePathAllowed } from "../src/lib/admin/tenant-command-centre-auth";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testNavigationVisibility() {
  const shell = read("src/components/admin/AdminShell.tsx");
  assert.match(shell, /Email Templates/);
  assert.match(shell, /\/admin\/email-templates/);
  assert.match(shell, /const TENANT_NAV/);
  // Platform Master Admin nav must not advertise tenant template editing.
  const platformNavBlock = shell.slice(
    shell.indexOf("const PLATFORM_NAV"),
    shell.indexOf("const TENANT_NAV"),
  );
  assert.doesNotMatch(platformNavBlock, /Email Templates/);
  assert.doesNotMatch(platformNavBlock, /email-templates/);
  // Inserting Email Templates must not steal the CRM desk mobile tab slot.
  const mobileTabs = shell.slice(
    shell.indexOf("const TENANT_MOBILE_TABS"),
    shell.indexOf("function navActive"),
  );
  assert.match(mobileTabs, /TENANT_NAV\[6\]/);
  assert.doesNotMatch(mobileTabs, /TENANT_NAV\[5\]/);

  assert.equal(isTenantCommandCentrePathAllowed("/admin/email-templates"), true);
  assert.equal(
    isTenantCommandCentrePathAllowed("/admin/email-templates?type=NEWSLETTER"),
    true,
  );

  const mw = read("src/middleware.ts");
  assert.match(mw, /\/admin\/email-templates/);
  assert.match(mw, /startsWith\("\/admin\/email-templates\/"\)/);

  const page = read("src/app/(admin)/admin/email-templates/page.tsx");
  assert.match(page, /EmailTemplatesAdminClient/);
  assert.match(page, /Master Admin does not edit/);
  assert.match(page, /surface\.kind === "platform"/);
  assert.match(page, /listWorkspaceEmailTemplates/);
  assert.match(
    page,
    /tenancy\.workspaceId !== surface\.auth\.workspaceId/,
  );
  assert.match(
    page,
    /Published templates apply to outgoing emails only\s+when tenant email templates are enabled/,
  );
  assert.doesNotMatch(page, /live senders are not wired yet/);
  assert.match(page, /Newsletter\s+campaign sending is not wired yet/);
}

function testTenantScopedApiUsage() {
  const client = read("src/components/admin/EmailTemplatesAdminClient.tsx");
  assert.match(client, /\/api\/admin\/email-templates/);
  assert.match(
    client,
    /\/api\/admin\/email-templates\/\$\{encodeURIComponent\(selectedType\)\}/,
  );
  assert.match(client, /\/publish/);
  assert.match(client, /\/restore/);
  assert.match(client, /\/versions/);
  assert.match(client, /credentials:\s*"same-origin"/);
  // No cross-tenant or platform admin API hosts.
  assert.doesNotMatch(client, /houzzatpro\.com\/api/);
  assert.doesNotMatch(client, /\/api\/platform\//);

  const httpAuth = read("src/lib/email/workspace-templates/http-auth.ts");
  assert.match(httpAuth, /TENANT_SURFACE_REQUIRED/);
  assert.match(httpAuth, /authorizeTenantCommandCentre/);
}

function testOwnerAdminVsAgentPermissions() {
  assert.equal(canManageWorkspaceEmailTemplates("OWNER"), true);
  assert.equal(canManageWorkspaceEmailTemplates("ADMIN"), true);
  assert.equal(canManageWorkspaceEmailTemplates("AGENT"), false);

  const page = read("src/app/(admin)/admin/email-templates/page.tsx");
  // Page uses Command Centre surface — AGENT cannot access tenant /admin layout.
  assert.match(page, /resolveAdminPageSurface/);

  const client = read("src/components/admin/EmailTemplatesAdminClient.tsx");
  assert.match(client, /Save draft/);
  assert.match(client, /Publish/);
  assert.match(client, /Restore default/);
}

function testDraftPublishRestoreWorkflow() {
  const client = read("src/components/admin/EmailTemplatesAdminClient.tsx");
  assert.match(client, /method:\s*"PUT"/);
  assert.match(client, /method:\s*"POST"/);
  assert.match(client, /Publish template\?/);
  assert.match(client, /Restore system default\?/);
  assert.match(client, /Unsaved changes/);
  assert.match(client, /beforeunload/);
  assert.match(client, /Draft saved\. Live emails are unchanged/);
  assert.match(client, /Drafts never affect[\s\S]*outgoing mail/);
  assert.match(client, /Blank fields keep event-specific live wording/);
  assert.match(client, /formFromStoredContent/);
  assert.match(client, /formToDraftPayload/);
  assert.match(client, /contentFieldsFromForm/);
  assert.match(client, /Leave fields blank to keep event-specific/);
  assert.match(client, /Placeholders show registry defaults/);
  assert.match(client, /Illustrative preview only/);
}

function testVariableInsertion() {
  const client = read("src/components/admin/EmailTemplatesAdminClient.tsx");
  assert.match(client, /Insert variable/);
  assert.match(client, /insertVariable/);
  assert.match(client, /\{\{\$\{name\}\}\}/);
  assert.match(client, /allowedVariables/);
  assert.match(client, /Arbitrary HTML is\s+blocked/);

  const types = listMasterEmailTemplates();
  assert.equal(types.length, 8);
  for (const def of types) {
    assert.ok(def.allowedVariables.length > 0);
    assert.ok(def.editableFields.includes("subject"));
    assert.ok(def.editableFields.includes("introText"));
    assert.ok(def.editableFields.includes("bodySections"));
    assert.ok(def.editableFields.includes("ctaText"));
    assert.ok(def.editableFields.includes("style"));
  }
}

function testPreviewSafety() {
  const html = buildEmailTemplatePreviewHtml({
    templateType: "PROPERTY_WATCH",
    content: {
      subject: "Hello {{recipientName}}",
      introText: "Watching {{addressLine}}",
      bodySections: { paragraphs: ["City {{city}}"] },
      ctaText: "Open",
      style: { primaryColor: "#0F766E" },
    },
    brand: {
      displayName: "Acme Realty",
      logoUrl: null,
      primaryColor: "#0F766E",
      websiteUrl: "https://acme.example",
      footerNote: "Acme footer",
    },
    mode: "desktop",
    variant: "price_reduction",
  });

  assert.match(html, /Alex Sample/);
  assert.match(html, /123 Sample Street/);
  assert.match(html, /Sample preview data/);
  assert.match(html, /Acme Realty/);
  assert.match(html, /Jordan Sample/);
  assert.match(html, /Sample agent signature/);
  assert.match(html, /Price drop|Was/);
  assert.doesNotMatch(html, /SELECT\s+.*FROM/i);
  assert.doesNotMatch(html, /leadId/i);
  assert.doesNotMatch(html, /workspaceId/i);
  assert.equal(EMAIL_TEMPLATE_PREVIEW_SAMPLE.recipientName, "Alex Sample");
  assert.match(
    EMAIL_TEMPLATE_PREVIEW_SAMPLE.notice,
    /not a real lead/i,
  );

  const mobile = buildEmailTemplatePreviewHtml({
    templateType: "NEWSLETTER",
    content: null,
    brand: {
      displayName: "Acme Realty",
      logoUrl: "https://cdn.example/logo.png",
      primaryColor: "#111827",
      websiteUrl: "https://acme.example",
    },
    mode: "mobile",
  });
  assert.match(mobile, /max-width:390px/);
  assert.match(mobile, /Sample preview data/);

  const client = read("src/components/admin/EmailTemplatesAdminClient.tsx");
  assert.match(client, /Sample data only/);
  assert.match(client, /sandbox=""/);
  assert.match(client, /previewMode/);
  assert.match(client, /previewVariant/);
  assert.match(client, /listEmailTemplatePreviewVariants/);
  assert.match(client, /Live renderer preview/);
  assert.match(client, /Desktop/);
  assert.match(client, /Mobile/);
  assert.match(client, /max-w-\[390px\]/);
}

function testNoLiveSenderWiring() {
  const monitors = read("src/lib/account/monitors.ts");
  const buyer = read("src/lib/email/digests/buyer.ts");
  const seller = read("src/lib/email/digests/seller.ts");
  const agent = read("src/app/api/agent/email/route.ts");
  const shortlist = read("src/lib/agent/send-shortlist-email.ts");
  const cma = read("src/lib/cma/send-cma-email.ts");

  // Phase 2C wires watches, digests, agent/shortlist/CMA; newsletter stays unwired.
  assert.match(monitors, /loadPublishedPropertyWatchOverride/);
  assert.match(monitors, /loadPublishedAreaWatchOverride/);
  assert.match(buyer, /loadPublishedSavedSearchDigestOverride/);
  assert.match(seller, /loadPublishedSellerNeighbourhoodDigestOverride/);
  assert.match(agent, /loadPublishedAgentEmailOverride/);
  assert.match(shortlist, /loadPublishedShortlistOverride/);
  assert.match(cma, /loadPublishedCmaShareOverride/);
  assert.match(
    read("src/app/api/mobile/v2/leads/[leadId]/conversations/route.ts"),
    /loadPublishedAgentEmailOverride/,
  );

  const client = read("src/components/admin/EmailTemplatesAdminClient.tsx");
  assert.doesNotMatch(client, /resend|sendEmail|nodemailer/i);
  assert.doesNotMatch(client, /fetch\(["'`].*\/api\/.*email\/send/);
}

function main() {
  testNavigationVisibility();
  testTenantScopedApiUsage();
  testOwnerAdminVsAgentPermissions();
  testDraftPublishRestoreWorkflow();
  testVariableInsertion();
  testPreviewSafety();
  testNoLiveSenderWiring();
  console.log("workspace-email-templates-ui-selftest: ok");
}

main();
