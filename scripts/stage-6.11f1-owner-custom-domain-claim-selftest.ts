/**
 * Stage 6.11F.1 — OWNER custom website domain claim + DNS instructions.
 * Run: pnpm stage-6.11f1-owner-custom-domain-claim:selftest
 * No activation / Cloudflare / DNS verify / deploy / MLS / Typesense.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OwnerActivationError } from "@/lib/platform/activation";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import { resolveAuthoritativeWorkspaceFromHostname } from "@/lib/tenancy/resolve-authoritative-workspace-host";
import { selectCanonicalHostname } from "@/lib/tenancy/canonical-public-origin";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { assertHostnameClaimable } from "@/lib/tenancy/reserved-domains";
import {
  WEBSITE_DOMAIN_TXT_OWNERSHIP_LABEL,
  assertSafeCustomWebsiteClaimHostname,
  buildWebsiteDomainDnsInstructions,
  claimOwnerWebsiteDomain,
  deleteOwnerPendingWebsiteDomain,
  listOwnerWebsiteDomains,
} from "@/lib/tenancy/workspace-domain";
import { resolveTrustedRequestOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type DomainRow = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "PLATFORM" | "CUSTOM";
  role: "PRIMARY" | "ALIAS";
  status: "PENDING" | "ACTIVE" | "DISABLED";
  verificationToken: string | null;
  verifiedAt: Date | null;
};

function makeFakePrisma(opts: {
  workspaceId: string;
  workspaceStatus?: "ACTIVE" | "SUSPENDED";
  memberRole?: "OWNER" | "AGENT";
  memberStatus?: "ACTIVE" | "SUSPENDED" | "INVITED";
  domains: Map<string, DomainRow>;
}) {
  const workspaceStatus = opts.workspaceStatus ?? "ACTIVE";
  const memberRole = opts.memberRole ?? "OWNER";
  const memberStatus = opts.memberStatus ?? "ACTIVE";
  let seq = 0;

  return {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== opts.workspaceId) return null;
        return {
          id: opts.workspaceId,
          slug: "tenant-a",
          status: workspaceStatus,
        };
      },
    },
    workspaceMember: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        if (where.workspaceId_userId.workspaceId !== opts.workspaceId) {
          return null;
        }
        return { role: memberRole, status: memberStatus };
      },
    },
    workspaceDomain: {
      findMany: async ({
        where,
      }: {
        where: { workspaceId: string };
        orderBy?: unknown;
        select?: unknown;
      }) => {
        return [...opts.domains.values()]
          .filter((d) => d.workspaceId === where.workspaceId)
          .map((d) => ({ ...d }));
      },
      findUnique: async ({
        where,
      }: {
        where: { hostname: string };
        select?: unknown;
      }) => {
        const row = [...opts.domains.values()].find(
          (d) => d.hostname === where.hostname,
        );
        return row ? { ...row } : null;
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; workspaceId: string };
        select?: unknown;
      }) => {
        const row = opts.domains.get(where.id);
        if (!row || row.workspaceId !== where.workspaceId) return null;
        return { ...row };
      },
      create: async ({
        data,
      }: {
        data: Omit<DomainRow, "id">;
        select?: unknown;
      }) => {
        const clash = [...opts.domains.values()].find(
          (d) => d.hostname === data.hostname,
        );
        if (clash) {
          const err = Object.assign(new Error("Unique constraint"), {
            code: "P2002",
          });
          throw err;
        }
        seq += 1;
        const row: DomainRow = {
          id: `dom_${seq}`,
          ...data,
        };
        opts.domains.set(row.id, row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const row = opts.domains.get(where.id);
        if (!row) throw new Error("missing");
        opts.domains.delete(where.id);
        return { ...row };
      },
    },
  };
}

function hostDeps(workspaceId: string) {
  return createFixtureHostResolutionDeps([
    {
      hostname: "tenant-a.houzzatpro.com",
      workspaceId,
      workspaceSlug: "tenant-a",
      kind: "PLATFORM",
      role: "PRIMARY",
      domainStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
    },
  ]);
}

function ownerRequest(): Request {
  return new Request(
    "https://tenant-a.houzzatpro.com/api/onboarding/website-domains",
    {
      method: "GET",
      headers: { host: "tenant-a.houzzatpro.com" },
    },
  );
}

function seedPlatform(workspaceId: string): Map<string, DomainRow> {
  const domains = new Map<string, DomainRow>();
  domains.set("dom_platform", {
    id: "dom_platform",
    workspaceId,
    hostname: "tenant-a.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    status: "ACTIVE",
    verificationToken: null,
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  return domains;
}

async function expectError(
  fn: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await fn();
    assert.fail(`expected ${code}`);
  } catch (error) {
    assert.ok(error instanceof OwnerActivationError);
    assert.equal(error.code, code);
  }
}

async function main() {
  console.log("\n=== STAGE 6.11F.1 — OWNER CUSTOM DOMAIN CLAIM ===\n");

  const prevScope = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  clearHostResolutionCacheForTests();

  try {
  // --- Hostname safety ---
  console.log("[0] hostname safety...");
  {
    const ok = normalizeWorkspaceHostname("Example.COM.");
    assert.ok(ok.ok);
    assert.equal(ok.hostname, "example.com");

    const idn = normalizeWorkspaceHostname("bücher.example");
    assert.ok(idn.ok);
    assert.equal(idn.hostname, "xn--bcher-kva.example");

    // Shared normalizer preserves local-dev Host parsing.
    assert.equal(normalizeWorkspaceHostname("localhost:3000").ok, true);
    assert.equal(normalizeWorkspaceHostname("127.0.0.1:3000").ok, true);
    assert.equal(
      extractTrustedRequestHostname(
        new Request("http://x/", { headers: { host: "127.0.0.1:3000" } }),
      ),
      "127.0.0.1",
    );
    assert.equal(
      resolveTrustedRequestOrigin(
        new Request("http://127.0.0.1:3000/", {
          headers: { host: "127.0.0.1:3000" },
        }),
      ).ok,
      true,
    );

    // CUSTOM claim layer rejects localhost / IP / wildcard / single-label.
    assert.equal(assertSafeCustomWebsiteClaimHostname("localhost").ok, false);
    assert.equal(
      assertSafeCustomWebsiteClaimHostname("foo.localhost").ok,
      false,
    );
    assert.equal(assertSafeCustomWebsiteClaimHostname("127.0.0.1").ok, false);
    assert.equal(assertSafeCustomWebsiteClaimHostname("192.168.1.1").ok, false);
    assert.equal(
      assertSafeCustomWebsiteClaimHostname("*.example.com").ok,
      false,
    );
    assert.equal(assertSafeCustomWebsiteClaimHostname("intranet").ok, false);
    assert.equal(
      assertSafeCustomWebsiteClaimHostname("brokerage.example").ok,
      true,
    );

    // IPv6 / wildcard fail shared syntactic normalize (labels), then claim.
    assert.equal(normalizeWorkspaceHostname("[::1]").ok, false);
    assert.equal(normalizeWorkspaceHostname("::1").ok, false);
    assert.equal(normalizeWorkspaceHostname("*.example.com").ok, false);
    assert.equal(normalizeWorkspaceHostname("https://example.com").ok, false);
    assert.equal(normalizeWorkspaceHostname("example.com/path").ok, false);
    assert.equal(normalizeWorkspaceHostname("example.com?x=1").ok, false);
    assert.equal(normalizeWorkspaceHostname("example.com#frag").ok, false);
    assert.equal(normalizeWorkspaceHostname("user@example.com").ok, false);
    assert.ok(normalizeWorkspaceHostname("example.com:443").ok);

    assert.ok(assertHostnameClaimable({ hostname: "houzzatpro.com", kind: "CUSTOM" }));
    assert.ok(
      assertHostnameClaimable({
        hostname: "www.houzzatpro.com",
        kind: "CUSTOM",
      }),
    );
    assert.ok(
      assertHostnameClaimable({
        hostname: "app.houzzatpro.com",
        kind: "CUSTOM",
      }),
    );
    assert.ok(
      assertHostnameClaimable({
        hostname: "tenant-a.houzzatpro.com",
        kind: "CUSTOM",
      }),
    );
    assert.ok(
      assertHostnameClaimable({ hostname: "houzzat.com", kind: "CUSTOM" }),
    );
    assert.ok(
      assertHostnameClaimable({
        hostname: "x.workers.dev",
        kind: "CUSTOM",
      }),
    );
    assert.equal(
      assertHostnameClaimable({ hostname: "brokerage.example", kind: "CUSTOM" }),
      null,
    );

    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: makeFakePrisma({
            workspaceId: "ws_tenant_a",
            domains: seedPlatform("ws_tenant_a"),
          }) as never,
          hostDeps: hostDeps("ws_tenant_a"),
          userId: "user_owner",
          hostname: "localhost",
        }),
      "INVALID_HOSTNAME",
    );
    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: makeFakePrisma({
            workspaceId: "ws_tenant_a",
            domains: seedPlatform("ws_tenant_a"),
          }) as never,
          hostDeps: hostDeps("ws_tenant_a"),
          userId: "user_owner",
          hostname: "127.0.0.1",
        }),
      "INVALID_HOSTNAME",
    );
  }
  console.log("PASS");

  const WS = "ws_tenant_a";
  const WS_OTHER = "ws_other";

  // --- Claim happy path + DNS ---
  console.log("[1] claim CUSTOM PENDING + DNS instructions...");
  {
    const domains = seedPlatform(WS);
    const prisma = makeFakePrisma({ workspaceId: WS, domains });
    const result = await claimOwnerWebsiteDomain({
      request: ownerRequest(),
      prisma: prisma as never,
      hostDeps: hostDeps(WS),
      userId: "user_owner",
      hostname: "Brokerage.Example.",
    });
    assert.equal(result.idempotent, false);
    assert.equal(result.domain.hostname, "brokerage.example");
    assert.equal(result.domain.kind, "CUSTOM");
    assert.equal(result.domain.role, "PRIMARY");
    assert.equal(result.domain.status, "PENDING");
    assert.equal(result.domain.verifiedAt, null);
    assert.ok(result.domain.dnsInstructions);
    assert.equal(result.domain.dnsInstructions!.verified, false);
    assert.equal(result.domain.dnsInstructions!.live, false);
    assert.equal(result.domain.dnsInstructions!.recordType, "TXT");
    assert.equal(
      result.domain.dnsInstructions!.host,
      `${WEBSITE_DOMAIN_TXT_OWNERSHIP_LABEL}.brokerage.example`,
    );
    assert.ok(result.domain.dnsInstructions!.value.length >= 32);
    assert.match(
      result.domain.dnsInstructions!.summary,
      /not live|not.*activate/i,
    );

    const listed = await listOwnerWebsiteDomains({
      request: ownerRequest(),
      prisma: prisma as never,
      hostDeps: hostDeps(WS),
      userId: "user_owner",
    });
    assert.equal(listed.domains.length, 2);
    const pending = listed.domains.find((d) => d.status === "PENDING");
    assert.ok(pending?.dnsInstructions);
  }
  console.log("PASS");

  // --- Idempotency ---
  console.log("[2] idempotent same-workspace pending claim...");
  {
    const domains = seedPlatform(WS);
    const prisma = makeFakePrisma({ workspaceId: WS, domains });
    const first = await claimOwnerWebsiteDomain({
      request: ownerRequest(),
      prisma: prisma as never,
      hostDeps: hostDeps(WS),
      userId: "user_owner",
      hostname: "same.example",
    });
    const token = first.domain.dnsInstructions!.value;
    const second = await claimOwnerWebsiteDomain({
      request: ownerRequest(),
      prisma: prisma as never,
      hostDeps: hostDeps(WS),
      userId: "user_owner",
      hostname: "SAME.EXAMPLE",
    });
    assert.equal(second.idempotent, true);
    assert.equal(second.domain.id, first.domain.id);
    assert.equal(second.domain.dnsInstructions!.value, token);
    assert.equal(
      [...domains.values()].filter((d) => d.kind === "CUSTOM").length,
      1,
    );
  }
  console.log("PASS");

  // --- Authority + conflicts ---
  console.log("[3] authority + conflicts...");
  {
    const domains = seedPlatform(WS);
    domains.set("dom_other", {
      id: "dom_other",
      workspaceId: WS_OTHER,
      hostname: "taken.example",
      kind: "CUSTOM",
      role: "PRIMARY",
      status: "PENDING",
      verificationToken: "tok_other",
      verifiedAt: null,
    });
    const prisma = makeFakePrisma({ workspaceId: WS, domains });

    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: makeFakePrisma({
            workspaceId: WS,
            memberRole: "AGENT",
            domains: seedPlatform(WS),
          }) as never,
          hostDeps: hostDeps(WS),
          userId: "user_agent",
          hostname: "agent-try.example",
        }),
      "FORBIDDEN",
    );

    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: makeFakePrisma({
            workspaceId: WS,
            memberStatus: "SUSPENDED",
            domains: seedPlatform(WS),
          }) as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          hostname: "suspended-try.example",
        }),
      "FORBIDDEN",
    );

    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          clientWorkspaceId: WS_OTHER,
          hostname: "mismatch.example",
        }),
      "WORKSPACE_HOST_MISMATCH",
    );

    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          hostname: "taken.example",
        }),
      "HOSTNAME_TAKEN",
    );

    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          hostname: "tenant-a.houzzatpro.com",
        }),
      "HOSTNAME_RESERVED",
    );

    // PLATFORM row on same workspace cannot be reclassified
    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          hostname: "Tenant-A.Houzzatpro.Com",
        }),
      "HOSTNAME_RESERVED",
    );
  }
  console.log("PASS");

  // --- One pending + ACTIVE conflict ---
  console.log("[4] pending limit + ACTIVE conflict...");
  {
    const domains = seedPlatform(WS);
    const prisma = makeFakePrisma({ workspaceId: WS, domains });
    await claimOwnerWebsiteDomain({
      request: ownerRequest(),
      prisma: prisma as never,
      hostDeps: hostDeps(WS),
      userId: "user_owner",
      hostname: "first.example",
    });
    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          hostname: "second.example",
        }),
      "PENDING_CLAIM_EXISTS",
    );

    domains.set("dom_active_custom", {
      id: "dom_active_custom",
      workspaceId: WS,
      hostname: "live.example",
      kind: "CUSTOM",
      role: "PRIMARY",
      status: "ACTIVE",
      verificationToken: null,
      verifiedAt: new Date(),
    });
    // Clear pending first so ACTIVE conflict path is exercised alone
    for (const [id, row] of [...domains.entries()]) {
      if (row.status === "PENDING") domains.delete(id);
    }
    await expectError(
      () =>
        claimOwnerWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          hostname: "live.example",
        }),
      "HOSTNAME_ALREADY_ACTIVE",
    );
  }
  console.log("PASS");

  // --- Delete restrictions ---
  console.log("[5] delete PENDING only...");
  {
    const domains = seedPlatform(WS);
    const prisma = makeFakePrisma({ workspaceId: WS, domains });
    const claimed = await claimOwnerWebsiteDomain({
      request: ownerRequest(),
      prisma: prisma as never,
      hostDeps: hostDeps(WS),
      userId: "user_owner",
      hostname: "remove-me.example",
    });

    await expectError(
      () =>
        deleteOwnerPendingWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          domainId: "dom_platform",
        }),
      "PLATFORM_DOMAIN_PROTECTED",
    );

    domains.set("dom_active_custom", {
      id: "dom_active_custom",
      workspaceId: WS,
      hostname: "active-custom.example",
      kind: "CUSTOM",
      role: "ALIAS",
      status: "ACTIVE",
      verificationToken: null,
      verifiedAt: new Date(),
    });
    await expectError(
      () =>
        deleteOwnerPendingWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          domainId: "dom_active_custom",
        }),
      "DOMAIN_NOT_PENDING",
    );

    domains.set("dom_foreign", {
      id: "dom_foreign",
      workspaceId: WS_OTHER,
      hostname: "foreign.example",
      kind: "CUSTOM",
      role: "PRIMARY",
      status: "PENDING",
      verificationToken: "x",
      verifiedAt: null,
    });
    await expectError(
      () =>
        deleteOwnerPendingWebsiteDomain({
          request: ownerRequest(),
          prisma: prisma as never,
          hostDeps: hostDeps(WS),
          userId: "user_owner",
          domainId: "dom_foreign",
        }),
      "DOMAIN_NOT_FOUND",
    );

    const deleted = await deleteOwnerPendingWebsiteDomain({
      request: ownerRequest(),
      prisma: prisma as never,
      hostDeps: hostDeps(WS),
      userId: "user_owner",
      domainId: claimed.domain.id,
    });
    assert.equal(deleted.deleted, true);
    assert.ok(domains.has("dom_platform"));
    assert.equal(domains.has(claimed.domain.id), false);
  }
  console.log("PASS");

  // --- Authoritative resolution + canonical ---
  console.log("[6] PENDING cannot resolve; canonical ignores PENDING...");
  {
    const pendingDenied = await resolveAuthoritativeWorkspaceFromHostname(
      "pending.example",
      {
        lookupActiveDomain: async (hostname) =>
          hostname === "pending.example"
            ? {
                hostname,
                kind: "CUSTOM",
                role: "PRIMARY",
                workspaceId: WS,
                workspaceSlug: "tenant-a",
                domainStatus: "PENDING",
                workspaceStatus: "ACTIVE",
              }
            : null,
      },
    );
    assert.equal(pendingDenied.ok, false);
    if (!pendingDenied.ok) {
      assert.equal(pendingDenied.reason, "domain_inactive");
    }

    const platformOk = await resolveAuthoritativeWorkspaceFromHostname(
      "tenant-a.houzzatpro.com",
      {
        lookupActiveDomain: async (hostname) =>
          hostname === "tenant-a.houzzatpro.com"
            ? {
                hostname,
                kind: "PLATFORM",
                role: "PRIMARY",
                workspaceId: WS,
                workspaceSlug: "tenant-a",
                domainStatus: "ACTIVE",
                workspaceStatus: "ACTIVE",
              }
            : null,
      },
    );
    assert.equal(platformOk.ok, true);

    const canonical = selectCanonicalHostname(
      [
        {
          hostname: "tenant-a.houzzatpro.com",
          kind: "PLATFORM",
          role: "PRIMARY",
          status: "ACTIVE",
        },
        {
          hostname: "pending.example",
          kind: "CUSTOM",
          role: "PRIMARY",
          status: "PENDING",
        },
      ],
      "tenant-a.houzzatpro.com",
    );
    assert.equal(canonical, "tenant-a.houzzatpro.com");
  }
  console.log("PASS");

  // --- DNS builder deterministic ---
  console.log("[7] DNS instruction format...");
  {
    const instr = buildWebsiteDomainDnsInstructions({
      hostname: "demo.example",
      verificationToken: "token_abc",
    });
    assert.equal(instr.host, "_houzzatpro-challenge.demo.example");
    assert.equal(instr.value, "token_abc");
    assert.equal(instr.verified, false);
    assert.equal(instr.live, false);
  }
  console.log("PASS");

  // --- Architecture ---
  console.log("[8] architecture / no activation / no CF / no MLS...");
  {
    const manage = read("src/lib/tenancy/workspace-domain/manage-custom.ts");
    const route = read("src/app/api/onboarding/website-domains/route.ts");
    const del = read(
      "src/app/api/onboarding/website-domains/[domainId]/route.ts",
    );
    const ui = read("src/components/onboarding/WebsiteDomainSection.tsx");
    const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");

    assert.ok(!/\$transaction\s*\(/.test(manage));
    assert.ok(!/updateMany\s*\(/.test(manage));
    assert.ok(!/fetch\(["'`]https:\/\/api\.cloudflare/i.test(manage));
    assert.ok(!/dns\.promises|promises\.dns|resolveTxt|resolveCname/i.test(manage));
    assert.ok(!/status:\s*"ACTIVE"/.test(manage));
    assert.ok(/status:\s*"PENDING"/.test(manage));
    assert.ok(/Does NOT activate/i.test(manage));
    assert.ok(/requireHostBoundOwnerOnboardingContext/.test(manage));
    assert.ok(/assertSafeCustomWebsiteClaimHostname/.test(manage));
    assert.ok(/assertHostnameClaimable/.test(manage));
    const claimSafety = read(
      "src/lib/tenancy/workspace-domain/claim-hostname-safety.ts",
    );
    assert.ok(/localhost is not allowed/.test(claimSafety));
    assert.ok(/IPv4 literals are not allowed/.test(claimSafety));
    assert.ok(/WebsiteDomainSection/.test(client));
    assert.ok(/Custom Website Domain/.test(ui));
    assert.ok(!/\bActivate\b/.test(ui));
    assert.ok(/Not active|not active|PENDING/i.test(ui));
    assert.ok(/claimOwnerWebsiteDomain/.test(route));
    assert.ok(/deleteOwnerPendingWebsiteDomain/.test(del));
    assert.ok(!/typesense|proptx/i.test(manage));
  }
  console.log("PASS");

  console.log("\nstage-6.11f1-owner-custom-domain-claim:selftest ok\n");
  } finally {
    if (prevScope === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevScope;
    clearHostResolutionCacheForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
