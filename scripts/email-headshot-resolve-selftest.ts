/**
 * Phase 3D.4.2 — verified email headshot resolution + signature preference.
 * Run: pnpm email-headshot-resolve:selftest
 *
 * Hermetic. No Neon. No real R2. No email sends. No DB writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  WorkspaceBranding,
  WorkspaceEmailIdentity,
} from "@prisma/client";
import {
  assembleTenantEmailBrand,
  buildAgentEmailSignature,
  resolveTenantEmailBrand,
  type TenantEmailAgentIdentity,
  type TenantEmailBrandDeps,
} from "@/lib/email/tenant-email-brand";
import { verifiedActiveMembership } from "@/lib/tenancy/agent-photo";
import {
  buildAgentEmailHeadshotObjectKey,
  resolveVerifiedAgentEmailSignaturePhoto,
  setEmailHeadshotStorageTestDeps,
  type AgentEmailHeadshotAssociationView,
} from "@/lib/tenancy/branding-assets";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_WORKSPACE_ID,
} from "@/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = TENANT_B_TEST_WORKSPACE_ID;
const WS_B = "ws_other_tenant";
const AGENT = "agent_a";
const AGENT_B = "agent_b";
const UNIQUE = "abc123def456abc123def456";
const UNIQUE_STALE = "ffffffffffffffffffffffff";
const CDN = "https://branding-assets.houzzatpro.com";

const CANONICAL_URL = `${CDN}/workspaces/${WS}/agents/${AGENT}/profile/${UNIQUE}.jpg`;
const THUMB_KEY = buildAgentEmailHeadshotObjectKey({
  workspaceId: WS,
  userId: AGENT,
  uniqueId: UNIQUE,
})!;
const THUMB_URL = `${CDN}/${THUMB_KEY}`;

const LEGACY_URL =
  "https://branding-assets.houzzatpro.com/workspaces/ws_a/agent-user/agent_a.jpg";

function section(name: string) {
  console.log(`  ✓ ${name}`);
}

function membership(workspaceId: string, userId: string) {
  return verifiedActiveMembership(
    { workspaceId, userId, status: "ACTIVE" },
    { workspaceId, userId },
  );
}

function assoc(
  overrides: Partial<AgentEmailHeadshotAssociationView> = {},
): AgentEmailHeadshotAssociationView {
  return {
    workspaceId: WS,
    userId: AGENT,
    sourceUniqueId: UNIQUE,
    emailHeadshotObjectKey: THUMB_KEY,
    ...overrides,
  };
}

function agent(
  overrides: Partial<TenantEmailAgentIdentity> = {},
): TenantEmailAgentIdentity {
  return {
    userId: AGENT,
    name: "Ali Syed",
    email: "ali@example.com",
    phone: "647-221-4949",
    image: CANONICAL_URL,
    designation: null,
    ...overrides,
  };
}

function identity(
  workspaceId: string,
  overrides: Partial<WorkspaceEmailIdentity> = {},
): WorkspaceEmailIdentity {
  return {
    workspaceId,
    contactEmail: null,
    replyToEmail: null,
    senderDisplayName: null,
    customDomain: null,
    domainStatus: "NONE",
    dnsRecordsJson: null,
    fallbackFrom: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeDeps(input: {
  agentsByKey: Map<string, TenantEmailAgentIdentity>;
  membership: Set<string>;
  associations?: Map<string, AgentEmailHeadshotAssociationView>;
  /** When set, association loader throws (simulates DB / missing-table). */
  associationThrow?: Error;
  associationLookupCount?: { count: number };
  branding?: WorkspaceBranding | null;
  senderDisplayName?: string | null;
}): TenantEmailBrandDeps {
  return {
    loadBranding: async () => input.branding ?? TENANT_B_TEST_BRANDING_ROW,
    loadEmailIdentity: async () =>
      identity(WS, {
        senderDisplayName: input.senderDisplayName ?? null,
        replyToEmail: "desk@canary.test",
      }),
    loadProfessionalIdentity: async () => ({
      brokerageRegisteredName: "Royal LePage Signature Realty",
    }),
    loadAgentInWorkspace: async (workspaceId, userId) => {
      if (!input.membership.has(`${workspaceId}:${userId}`)) return null;
      return input.agentsByKey.get(`${workspaceId}:${userId}`) ?? null;
    },
    loadAssignedAgentForLead: async (workspaceId, leadId) => {
      const a = input.agentsByKey.get(`lead:${workspaceId}:${leadId}`);
      if (!a) return null;
      if (!input.membership.has(`${workspaceId}:${a.userId}`)) return null;
      return a;
    },
    loadAssignedAgentForCustomer: async (workspaceId, customerId) => {
      const a = input.agentsByKey.get(`customer:${workspaceId}:${customerId}`);
      if (!a) return null;
      if (!input.membership.has(`${workspaceId}:${a.userId}`)) return null;
      return a;
    },
    loadAgentEmailHeadshotAssociation: async (workspaceId, userId) => {
      if (input.associationLookupCount) {
        input.associationLookupCount.count += 1;
      }
      if (input.associationThrow) throw input.associationThrow;
      return input.associations?.get(`${workspaceId}:${userId}`) ?? null;
    },
    resolveWebsiteUrl: async () => "https://tenant-canary.houzzatpro.com",
  };
}

function prismaMissingTableError(): Error {
  const err = new Error(
    'The table `public.AgentEmailHeadshot` does not exist in the current database.',
  );
  (err as Error & { code: string }).code = "P2021";
  err.name = "PrismaClientKnownRequestError";
  return err;
}

const brandingOn = {
  TENANT_EMAIL_BRANDING: "on",
  TENANT_EMAIL_BRANDING_WORKSPACE_IDS: WS,
} as NodeJS.ProcessEnv;

async function main() {
  console.log("\n=== PHASE 3D.4.2 — VERIFIED EMAIL HEADSHOT RESOLUTION ===\n");

  setEmailHeadshotStorageTestDeps({
    isProduction: () => true,
    trustedPublicBase: CDN,
  });

  {
    const src = read(
      "src/lib/tenancy/branding-assets/email-headshot-resolve.ts",
    );
    const brand = read("src/lib/email/tenant-email-brand.ts");
    assert.ok(src.includes("resolveVerifiedAgentEmailSignaturePhoto"));
    assert.ok(src.includes("Never derive"));
    assert.ok(brand.includes("resolveVerifiedAgentEmailSignaturePhoto"));
    assert.ok(brand.includes("loadAgentEmailHeadshotAssociation"));
    assert.ok(brand.includes("loadAgentEmailHeadshotAssociationBestEffort"));
    assert.ok(brand.includes("object-position:center 30%"));
    assert.ok(!src.includes("$executeRaw"));
    assert.ok(!src.includes("putBrandingAssetObject"));
    assert.ok(!src.includes(".head("));
    section("Source invariants (no R2 / no writes in resolver)");
  }

  // Verified thumbnail selected
  {
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: assoc(),
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, "email-headshot");
    assert.equal(resolved.url, THUMB_URL);

    const sig = buildAgentEmailSignature({
      workspaceId: WS,
      agent: agent(),
      displayName: "Canary",
      contactPhone: null,
      senderDisplayName: null,
      brokerageRegisteredName: "Brokerage",
      primaryColor: "#0F6B4C",
      emailHeadshotAssociation: assoc(),
    });
    assert.match(sig.html, new RegExp(THUMB_KEY.replace(/\./g, "\\.")));
    assert.doesNotMatch(sig.html, /object-position/);
    assert.match(sig.html, /border-radius:50%/);
    assert.match(sig.html, /data-houzzat-agent-signature="1"/);
    assert.match(sig.html, /role="presentation"/);
    section("Verified thumbnail selected (no object-position)");
  }

  // Legacy / missing association → User.image + CSS framing
  {
    const legacy = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: LEGACY_URL,
      association: null,
    });
    assert.ok(legacy);
    assert.equal(legacy.kind, "canonical");
    assert.equal(legacy.url, LEGACY_URL);

    const sig = buildAgentEmailSignature({
      workspaceId: WS,
      agent: agent({ image: LEGACY_URL }),
      displayName: "Canary",
      contactPhone: null,
      senderDisplayName: null,
      brokerageRegisteredName: null,
      primaryColor: "#0F6B4C",
      emailHeadshotAssociation: null,
    });
    assert.match(sig.html, /object-fit:cover/);
    assert.match(sig.html, /object-position:center 30%/);
    section("Legacy agent falls back to User.image + CSS crop");
  }

  // Missing association with managed canonical → canonical
  {
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: null,
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, "canonical");
    assert.equal(resolved.url, CANONICAL_URL);
    section("Missing association → canonical User.image");
  }

  // Stale association after photo replacement (assoc uniqueId ≠ current image)
  {
    const staleKey = buildAgentEmailHeadshotObjectKey({
      workspaceId: WS,
      userId: AGENT,
      uniqueId: UNIQUE_STALE,
    })!;
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: assoc({
        sourceUniqueId: UNIQUE_STALE,
        emailHeadshotObjectKey: staleKey,
      }),
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, "canonical");
    assert.equal(resolved.url, CANONICAL_URL);
    assert.doesNotMatch(resolved.url, new RegExp(UNIQUE_STALE));
    section("Stale association after replacement → canonical");
  }

  // Wrong workspace association
  {
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: assoc({
        workspaceId: WS_B,
        emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
          workspaceId: WS_B,
          userId: AGENT,
          uniqueId: UNIQUE,
        })!,
      }),
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, "canonical");
    section("Wrong workspace association rejected");
  }

  // Wrong user association
  {
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: assoc({
        userId: AGENT_B,
        emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
          workspaceId: WS,
          userId: AGENT_B,
          uniqueId: UNIQUE,
        })!,
      }),
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, "canonical");
    section("Wrong user association rejected");
  }

  // Malformed object key
  {
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: assoc({
        emailHeadshotObjectKey: "not/a/valid/key.png",
      }),
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, "canonical");
    section("Malformed object key rejected");
  }

  // Untrusted CDN (production unset base → no thumb URL)
  {
    setEmailHeadshotStorageTestDeps({
      isProduction: () => true,
      trustedPublicBase: null,
    });
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: assoc(),
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, "canonical");
    setEmailHeadshotStorageTestDeps({
      isProduction: () => true,
      trustedPublicBase: CDN,
    });
    section("Untrusted / unset CDN → no thumb preference");
  }

  // Inactive membership (forged plain object is not minted)
  {
    const forged = {
      workspaceId: WS,
      userId: AGENT,
      status: "ACTIVE" as const,
    };
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      // Cast: intentionally unminted — must be rejected at runtime.
      membership: forged as ReturnType<typeof membership>,
      userImage: CANONICAL_URL,
      association: assoc(),
    });
    assert.equal(resolved, null);
    section("Inactive / unminted membership → no photo");
  }

  // No usable photo
  {
    const resolved = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: "javascript:alert(1)",
      association: null,
    });
    assert.equal(resolved, null);
    section("No usable photo");
  }

  // Manual agent identity (preferred) uses verified thumb
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT, leadId: "lead_1" },
      makeDeps({
        agentsByKey: new Map([
          [`${WS}:${AGENT}`, agent()],
          [
            `lead:${WS}:lead_1`,
            agent({ userId: AGENT_B, name: "Blake Other", image: LEGACY_URL }),
          ],
        ]),
        membership: new Set([`${WS}:${AGENT}`, `${WS}:${AGENT_B}`]),
        associations: new Map([[`${WS}:${AGENT}`, assoc()]]),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.match(brand.signatureHtml, new RegExp(THUMB_KEY.replace(/\./g, "\\.")));
    assert.doesNotMatch(brand.signatureHtml, /Blake Other/);
    section("Manual sending agent identity + verified thumb");
  }

  // Automated assigned-agent identity
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, leadId: "lead_1" },
      makeDeps({
        agentsByKey: new Map([[`lead:${WS}:lead_1`, agent()]]),
        membership: new Set([`${WS}:${AGENT}`]),
        associations: new Map([[`${WS}:${AGENT}`, assoc()]]),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.match(brand.signatureHtml, new RegExp(THUMB_KEY.replace(/\./g, "\\.")));
    section("Automated assigned-agent identity + verified thumb");
  }

  // Company fallback
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS },
      makeDeps({
        agentsByKey: new Map(),
        membership: new Set(),
        senderDisplayName: "Canary Desk",
        associations: new Map([[`${WS}:${AGENT}`, assoc()]]),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent, null);
    assert.match(brand.signatureHtml, /Canary Desk/);
    assert.doesNotMatch(brand.signatureHtml, /<img /i);
    assert.doesNotMatch(
      brand.signatureHtml,
      new RegExp(THUMB_KEY.replace(/\./g, "\\.")),
    );
    section("Company fallback (no agent / no thumb)");
  }

  // assemble path email-safe + no writes
  {
    const assembled = assembleTenantEmailBrand({
      workspaceId: WS,
      branding: TENANT_B_TEST_BRANDING_ROW,
      identity: identity(WS),
      agent: agent(),
      websiteUrl: "https://tenant-canary.houzzatpro.com",
      brokerageRegisteredName: "Brokerage Co",
      emailHeadshotAssociation: assoc(),
    });
    assert.match(assembled.signatureHtml, /mso-table-lspace/);
    assert.match(assembled.signatureHtml, /cellpadding="0"/);
    assert.doesNotMatch(assembled.signatureHtml, /object-position/);
    assert.match(assembled.signatureText, /Ali Syed/);
    section("Signature HTML remains email-safe");
  }

  // Never derive without association (source invariant already; behavioral)
  {
    const derivedOnly = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: WS,
      userId: AGENT,
      membership: membership(WS, AGENT),
      userImage: CANONICAL_URL,
      association: undefined,
    });
    assert.ok(derivedOnly);
    assert.equal(derivedOnly.kind, "canonical");
    assert.notEqual(derivedOnly.url, THUMB_URL);
    section("No association → never prefer derived thumb URL");
  }

  // Association not found via resolveTenantEmailBrand (null row)
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT },
      makeDeps({
        agentsByKey: new Map([[`${WS}:${AGENT}`, agent()]]),
        membership: new Set([`${WS}:${AGENT}`]),
        associations: new Map(),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.match(
      brand.signatureHtml,
      new RegExp(CANONICAL_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(
      brand.signatureHtml,
      new RegExp(THUMB_KEY.replace(/\./g, "\\.")),
    );
    assert.match(brand.signatureHtml, /object-position:center 30%/);
    section("Association not found → canonical User.image");
  }

  // Generic DB error on association lookup — soft-fail to canonical
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT },
      makeDeps({
        agentsByKey: new Map([[`${WS}:${AGENT}`, agent()]]),
        membership: new Set([`${WS}:${AGENT}`]),
        associations: new Map([[`${WS}:${AGENT}`, assoc()]]),
        associationThrow: new Error("connection reset"),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.match(brand.signatureHtml, /Ali Syed/);
    assert.match(
      brand.signatureHtml,
      new RegExp(CANONICAL_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(
      brand.signatureHtml,
      new RegExp(THUMB_KEY.replace(/\./g, "\\.")),
    );
    section("Association lookup generic DB error → canonical fallback");
  }

  // Prisma missing-table (P2021) — soft-fail; agent identity preserved
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT },
      makeDeps({
        agentsByKey: new Map([[`${WS}:${AGENT}`, agent()]]),
        membership: new Set([`${WS}:${AGENT}`]),
        associations: new Map([[`${WS}:${AGENT}`, assoc()]]),
        associationThrow: prismaMissingTableError(),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.equal(brand.agent?.name, "Ali Syed");
    assert.match(
      brand.signatureHtml,
      new RegExp(CANONICAL_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(
      brand.signatureHtml,
      new RegExp(THUMB_KEY.replace(/\./g, "\\.")),
    );
    section("Association lookup missing-table P2021 → canonical fallback");
  }

  // Lookup failure + unusable User.image → omit photo, keep agent
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT },
      makeDeps({
        agentsByKey: new Map([
          [`${WS}:${AGENT}`, agent({ image: "not-a-url" })],
        ]),
        membership: new Set([`${WS}:${AGENT}`]),
        associationThrow: prismaMissingTableError(),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.match(brand.signatureHtml, /Ali Syed/);
    assert.doesNotMatch(brand.signatureHtml, /<img /i);
    section("Lookup failure + bad image → omit photo, keep agent");
  }

  // Manual identity unchanged when association throws
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT, leadId: "lead_1" },
      makeDeps({
        agentsByKey: new Map([
          [`${WS}:${AGENT}`, agent()],
          [
            `lead:${WS}:lead_1`,
            agent({ userId: AGENT_B, name: "Blake Other", image: LEGACY_URL }),
          ],
        ]),
        membership: new Set([`${WS}:${AGENT}`, `${WS}:${AGENT_B}`]),
        associationThrow: new Error("forced_assoc_fail"),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.doesNotMatch(brand.signatureHtml, /Blake Other/);
    section("Manual sender identity unchanged on assoc lookup failure");
  }

  // Automated assignee identity unchanged when association throws
  {
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, leadId: "lead_1" },
      makeDeps({
        agentsByKey: new Map([[`lead:${WS}:lead_1`, agent()]]),
        membership: new Set([`${WS}:${AGENT}`]),
        associationThrow: prismaMissingTableError(),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent?.userId, AGENT);
    assert.match(brand.signatureHtml, /Ali Syed/);
    section("Automated assignee identity unchanged on assoc lookup failure");
  }

  // Company fallback unchanged (no agent → no association query)
  {
    const lookupCount = { count: 0 };
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS },
      makeDeps({
        agentsByKey: new Map(),
        membership: new Set(),
        senderDisplayName: "Canary Desk",
        associationLookupCount: lookupCount,
        associationThrow: new Error("must_not_run"),
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(brand.agent, null);
    assert.equal(lookupCount.count, 0);
    assert.match(brand.signatureHtml, /Canary Desk/);
    assert.doesNotMatch(brand.signatureHtml, /<img /i);
    section("Company fallback — no association query");
  }

  // No association query when branding disabled
  {
    const lookupCount = { count: 0 };
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT },
      makeDeps({
        agentsByKey: new Map([[`${WS}:${AGENT}`, agent()]]),
        membership: new Set([`${WS}:${AGENT}`]),
        associations: new Map([[`${WS}:${AGENT}`, assoc()]]),
        associationLookupCount: lookupCount,
      }),
      {
        TENANT_EMAIL_BRANDING: "off",
        TENANT_EMAIL_BRANDING_WORKSPACE_IDS: WS,
      } as NodeJS.ProcessEnv,
    );
    assert.equal(brand, null);
    assert.equal(lookupCount.count, 0);
    section("No association query when branding disabled");
  }

  // Successful association via resolveTenantEmailBrand (end-to-end deps)
  {
    const lookupCount = { count: 0 };
    const brand = await resolveTenantEmailBrand(
      { workspaceId: WS, preferredAgentUserId: AGENT },
      makeDeps({
        agentsByKey: new Map([[`${WS}:${AGENT}`, agent()]]),
        membership: new Set([`${WS}:${AGENT}`]),
        associations: new Map([[`${WS}:${AGENT}`, assoc()]]),
        associationLookupCount: lookupCount,
      }),
      brandingOn,
    );
    assert.ok(brand);
    assert.equal(lookupCount.count, 1);
    assert.match(
      brand.signatureHtml,
      new RegExp(THUMB_KEY.replace(/\./g, "\\.")),
    );
    assert.doesNotMatch(brand.signatureHtml, /object-position/);
    section("Successful association lookup → verified thumbnail");
  }

  // Unrelated branding dep failure still propagates (not swallowed)
  {
    const deps = makeDeps({
      agentsByKey: new Map([[`${WS}:${AGENT}`, agent()]]),
      membership: new Set([`${WS}:${AGENT}`]),
    });
    deps.loadBranding = async () => {
      throw new Error("branding_load_must_propagate");
    };
    await assert.rejects(
      () =>
        resolveTenantEmailBrand(
          { workspaceId: WS, preferredAgentUserId: AGENT },
          deps,
          brandingOn,
        ),
      /branding_load_must_propagate/,
    );
    section("Unrelated brand-dep errors still propagate");
  }

  setEmailHeadshotStorageTestDeps(null);
  console.log("\nAll email-headshot-resolve selftests passed.\n");
}

main().catch((err) => {
  console.error(err);
  setEmailHeadshotStorageTestDeps(null);
  process.exitCode = 1;
});
