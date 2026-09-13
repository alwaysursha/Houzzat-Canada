/**
 * V1 tenant-safe WhatsApp routing isolation.
 * Run: pnpm exec tsx scripts/tenant-whatsapp-routing-isolation-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_SIGNATURE_TEMPLATE_ID } from "../src/lib/tenancy/templates";
import { whatsappTemplateKind } from "../src/lib/tenancy/resolve-tenant-whatsapp";
import { resolveTenantWhatsAppNumber } from "../src/lib/whatsapp";
import { configHasKey, parseJsoncVar } from "./lib/canary-lead-cutover-config";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const HOUZZAT_ENV = "16472214949";
const TENANT_A_CELL = "14165550101";
const TENANT_A_CONTACT = "19055550100";
const TENANT_B_CONTACT = "14165550999";

function testHierarchyAndIsolation() {
  assert.equal(whatsappTemplateKind(AGENT_SIGNATURE_TEMPLATE_ID), "AGENT");

  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "AGENT",
      agentCellPhone: TENANT_A_CELL,
      contactPhone: TENANT_A_CONTACT,
      isHouzzatWorkspace: false,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    TENANT_A_CELL,
  );
  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "AGENT",
      agentCellPhone: null,
      contactPhone: TENANT_A_CONTACT,
      isHouzzatWorkspace: false,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    TENANT_A_CONTACT,
  );
  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "AGENT",
      agentCellPhone: null,
      contactPhone: null,
      isHouzzatWorkspace: false,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    null,
  );

  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "OTHER",
      agentCellPhone: TENANT_A_CELL,
      contactPhone: TENANT_A_CONTACT,
      isHouzzatWorkspace: false,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    TENANT_A_CONTACT,
  );
  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "OTHER",
      agentCellPhone: TENANT_A_CELL,
      contactPhone: null,
      isHouzzatWorkspace: false,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    null,
  );

  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "OTHER",
      contactPhone: TENANT_B_CONTACT,
      isHouzzatWorkspace: false,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    TENANT_B_CONTACT,
  );
  assert.notEqual(
    resolveTenantWhatsAppNumber({
      templateKind: "OTHER",
      contactPhone: TENANT_B_CONTACT,
      isHouzzatWorkspace: false,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    HOUZZAT_ENV,
  );

  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "OTHER",
      contactPhone: null,
      isHouzzatWorkspace: true,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    HOUZZAT_ENV,
  );
  assert.equal(
    resolveTenantWhatsAppNumber({
      templateKind: "AGENT",
      agentCellPhone: TENANT_A_CELL,
      contactPhone: TENANT_A_CONTACT,
      isHouzzatWorkspace: true,
      houzzatEnvFallback: HOUZZAT_ENV,
    }),
    TENANT_A_CELL,
  );
  console.log("[0] AGENT/other hierarchy + no Tenant A/B env leak... PASS");
}

function testPublicConfigIsHostnameBound() {
  const route = read("src/app/api/public-config/route.ts");
  assert.ok(route.includes("resolveWhatsAppNumberForRequest"));
  assert.ok(!route.includes("getExpertWhatsAppNumber"));
  assert.ok(route.includes("GET(request: Request)"));

  const resolver = read("src/lib/tenancy/resolve-tenant-whatsapp.ts");
  assert.ok(resolver.includes("resolveRequestTenancy(request)"));
  assert.ok(resolver.includes("tenancy.workspaceId"));
  assert.ok(resolver.includes("agentCellPhone"));
  assert.ok(resolver.includes("contactPhone"));
  assert.ok(resolver.includes("HOUZZAT_WORKSPACE_SLUG"));
  assert.ok(resolver.includes("isHouzzatWorkspace: tenancy.workspaceSlug === HOUZZAT_WORKSPACE_SLUG"));
  assert.ok(resolver.includes("houzzatOnlyWhatsAppEnvFallback"));
  console.log("[1] /api/public-config resolves hostname workspace... PASS");
}

function testClientNeverUsesGlobalEnv() {
  const whatsapp = read("src/lib/whatsapp.ts");
  assert.ok(!whatsapp.includes("process.env"));
  assert.ok(!whatsapp.includes("NEXT_PUBLIC_WHATSAPP"));
  assert.ok(!whatsapp.includes("getExpertWhatsAppNumber"));

  const hook = read("src/components/whatsapp/useExpertWhatsAppNumber.ts");
  assert.ok(!hook.includes("NEXT_PUBLIC_WHATSAPP"));
  assert.ok(!hook.includes("getExpertWhatsAppNumber"));
  assert.ok(hook.includes("/api/public-config"));

  const detail = read("src/components/listings/ListingDetailView.tsx");
  assert.ok(!detail.includes("NEXT_PUBLIC_WHATSAPP"));
  assert.ok(!detail.includes("getExpertWhatsAppNumber"));

  const layout = read("src/app/(marketing)/layout.tsx");
  assert.ok(layout.includes("whatsappNumberFromPresentationBrand"));
  assert.ok(!layout.includes("getExpertWhatsAppNumber"));
  console.log("[2] client/SSR never apply global WhatsApp env... PASS");
}

function testPublicUnavailableCopy() {
  const qa = read("src/components/listings/ListingQaPanel.tsx");
  const planner = read("src/components/route-planner/RoutePlannerClient.tsx");
  assert.ok(qa.includes("WHATSAPP_UNAVAILABLE_COPY"));
  assert.ok(planner.includes("WHATSAPP_UNAVAILABLE_COPY"));
  assert.ok(!qa.includes(".env.local"));
  assert.ok(!planner.includes(".env.local"));
  assert.ok(!qa.includes("NEXT_PUBLIC_WHATSAPP_EXPERT"));
  assert.ok(!planner.includes("NEXT_PUBLIC_WHATSAPP_EXPERT"));
  console.log("[3] public unavailable copy, no .env.local... PASS");
}

function testCanaryConfigDoesNotLeakHouzzatNumber() {
  const canary = read("wrangler.tenant-canary.jsonc");
  assert.equal(configHasKey(canary, "NEXT_PUBLIC_WHATSAPP_EXPERT"), false);
  assert.equal(parseJsoncVar(canary, "NEXT_PUBLIC_WHATSAPP_EXPERT"), null);
  assert.ok(
    !canary.includes("16472214949"),
    "tenant-canary must not ship the Houzzat WhatsApp number",
  );
  console.log("[4] tenant-canary wrangler has no Houzzat WhatsApp number... PASS");
}

function main() {
  console.log("\n=== TENANT WHATSAPP ROUTING ISOLATION ===\n");
  testHierarchyAndIsolation();
  testPublicConfigIsHostnameBound();
  testClientNeverUsesGlobalEnv();
  testPublicUnavailableCopy();
  testCanaryConfigDoesNotLeakHouzzatNumber();
  console.log("\nTENANT WHATSAPP ROUTING ISOLATION SELFTEST PASSED\n");
}

main();
