/**
 * Stage 6.11F.2A — CUSTOM website domain ownership TXT verification.
 * Run: pnpm stage-6.11f2a-custom-domain-ownership:selftest
 * No ACTIVE transition / Cloudflare Custom Hostname / DNS mutation / deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OwnerActivationError } from "@/lib/platform/activation";
import { selectCanonicalHostname } from "@/lib/tenancy/canonical-public-origin";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import { resolveAuthoritativeWorkspaceFromHostname } from "@/lib/tenancy/resolve-authoritative-workspace-host";
import {
  CLOUDFLARE_DOH_JSON_URL,
  createCloudflareDohTxtLookup,
  deleteOwnerPendingWebsiteDomain,
  normalizeDnsTxtAnswer,
  ownershipTokensEqual,
  txtAnswersMatchOwnershipToken,
  verifyOwnerWebsiteDomainOwnership,
  type DnsTxtLookup,
} from "@/lib/tenancy/workspace-domain";

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
  memberRole?: "OWNER" | "AGENT";
  memberStatus?: "ACTIVE" | "SUSPENDED";
  domains: Map<string, DomainRow>;
}) {
  const memberRole = opts.memberRole ?? "OWNER";
  const memberStatus = opts.memberStatus ?? "ACTIVE";

  return {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== opts.workspaceId) return null;
        return {
          id: opts.workspaceId,
          slug: "tenant-a",
          status: "ACTIVE",
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
      findMany: async ({
        where,
      }: {
        where: { workspaceId: string };
      }) =>
        [...opts.domains.values()]
          .filter((d) => d.workspaceId === where.workspaceId)
          .map((d) => ({ ...d })),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { verifiedAt?: Date; status?: "PENDING" };
        select?: unknown;
      }) => {
        const row = opts.domains.get(where.id);
        if (!row) throw new Error("missing");
        if (data.verifiedAt !== undefined) row.verifiedAt = data.verifiedAt;
        if (data.status !== undefined) row.status = data.status;
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
    "https://tenant-a.houzzatpro.com/api/onboarding/website-domains/x/verify",
    {
      method: "POST",
      headers: { host: "tenant-a.houzzatpro.com" },
    },
  );
}

function seedPending(opts?: {
  verifiedAt?: Date | null;
  token?: string;
}): Map<string, DomainRow> {
  const domains = new Map<string, DomainRow>();
  domains.set("dom_platform", {
    id: "dom_platform",
    workspaceId: "ws_a",
    hostname: "tenant-a.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    status: "ACTIVE",
    verificationToken: null,
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  domains.set("dom_pending", {
    id: "dom_pending",
    workspaceId: "ws_a",
    hostname: "brokerage.example",
    kind: "CUSTOM",
    role: "PRIMARY",
    status: "PENDING",
    verificationToken: opts?.token ?? "tok_exact_value_32chars_abcdef",
    verifiedAt: opts?.verifiedAt === undefined ? null : opts.verifiedAt,
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
  console.log("\n=== STAGE 6.11F.2A — OWNERSHIP TXT VERIFICATION ===\n");

  const prevScope = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  clearHostResolutionCacheForTests();

  try {
    console.log("[0] TXT normalize + exact matching...");
    {
      assert.equal(normalizeDnsTxtAnswer('"hello"'), "hello");
      assert.equal(normalizeDnsTxtAnswer('"ab" "cd"'), "abcd");
      assert.equal(normalizeDnsTxtAnswer("  plain  "), "plain");

      const token = "tok_exact_value_32chars_abcdef";
      assert.equal(ownershipTokensEqual(token, token), true);
      assert.equal(ownershipTokensEqual(token, "TOK_EXACT_VALUE_32CHARS_ABCDEF"), false);
      assert.equal(ownershipTokensEqual(token, "tok_exact"), false);
      assert.equal(
        txtAnswersMatchOwnershipToken([`"unrelated"`, `"${token}"`], token),
        true,
      );
      assert.equal(
        txtAnswersMatchOwnershipToken([`prefix${token}`], token),
        false,
      );
      assert.equal(
        txtAnswersMatchOwnershipToken([token.slice(0, 8)], token),
        false,
      );
    }
    console.log("PASS");

    console.log("[1] DoH adapter + injectable lookup outcomes...");
    {
      assert.equal(
        CLOUDFLARE_DOH_JSON_URL,
        "https://cloudflare-dns.com/dns-query",
      );

      const doh = createCloudflareDohTxtLookup({
        timeoutMs: 50,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              Status: 0,
              Answer: [{ type: 16, data: '"tok_from_doh"' }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/dns-json" },
            },
          ),
      });
      const ok = await doh({ name: "_houzzatpro-challenge.example.com" });
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.deepEqual(ok.answers, ['"tok_from_doh"']);
        assert.equal(ok.empty, false);
      }

      const nx = createCloudflareDohTxtLookup({
        fetchImpl: async () =>
          new Response(JSON.stringify({ Status: 3 }), { status: 200 }),
      });
      const nxResult = await nx({ name: "_houzzatpro-challenge.missing.test" });
      assert.equal(nxResult.ok, true);
      if (nxResult.ok) assert.equal(nxResult.empty, true);

      const httpFail = createCloudflareDohTxtLookup({
        fetchImpl: async () => new Response("nope", { status: 500 }),
      });
      const httpResult = await httpFail({ name: "x.test" });
      assert.equal(httpResult.ok, false);
      if (!httpResult.ok) assert.equal(httpResult.reason, "http_error");

      const timeout = createCloudflareDohTxtLookup({
        timeoutMs: 10,
        fetchImpl: async (_url, init) =>
          await new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      });
      const timeoutResult = await timeout({ name: "slow.test" });
      assert.equal(timeoutResult.ok, false);
      if (!timeoutResult.ok) assert.equal(timeoutResult.reason, "timeout");
    }
    console.log("PASS");

    console.log("[2] verify match / mismatch / empty / resolver...");
    {
      const token = "tok_exact_value_32chars_abcdef";
      const base = {
        request: ownerRequest(),
        hostDeps: hostDeps("ws_a"),
        userId: "user_owner",
        domainId: "dom_pending",
      };

      const matchLookup: DnsTxtLookup = async () => ({
        ok: true,
        answers: [`"${token}"`, '"noise"'],
        empty: false,
      });
      const domains = seedPending({ token });
      const verified = await verifyOwnerWebsiteDomainOwnership({
        ...base,
        prisma: makeFakePrisma({ workspaceId: "ws_a", domains }) as never,
        dnsTxtLookup: matchLookup,
        now: new Date("2026-09-07T12:00:00.000Z"),
      });
      assert.equal(verified.outcome, "VERIFIED");
      if (verified.outcome === "VERIFIED") {
        assert.equal(verified.domain.status, "PENDING");
        assert.equal(verified.domain.verifiedAt, "2026-09-07T12:00:00.000Z");
        assert.equal(
          domains.get("dom_pending")!.verificationToken,
          token,
        );
        assert.equal(domains.get("dom_pending")!.status, "PENDING");
      }

      const already = await verifyOwnerWebsiteDomainOwnership({
        ...base,
        prisma: makeFakePrisma({ workspaceId: "ws_a", domains }) as never,
        dnsTxtLookup: async () => {
          throw new Error("must not DNS lookup when already verified");
        },
      });
      assert.equal(already.outcome, "ALREADY_VERIFIED");

      const mismatchDomains = seedPending({ token });
      const mismatch = await verifyOwnerWebsiteDomainOwnership({
        ...base,
        prisma: makeFakePrisma({
          workspaceId: "ws_a",
          domains: mismatchDomains,
        }) as never,
        dnsTxtLookup: async () => ({
          ok: true,
          answers: ["wrong-token"],
          empty: false,
        }),
      });
      assert.equal(mismatch.outcome, "NOT_VERIFIED");
      if (mismatch.outcome === "NOT_VERIFIED") {
        assert.equal(mismatch.reason, "TXT_MISMATCH");
        assert.equal(mismatchDomains.get("dom_pending")!.verifiedAt, null);
      }

      const emptyDomains = seedPending({ token });
      const empty = await verifyOwnerWebsiteDomainOwnership({
        ...base,
        prisma: makeFakePrisma({
          workspaceId: "ws_a",
          domains: emptyDomains,
        }) as never,
        dnsTxtLookup: async () => ({ ok: true, answers: [], empty: true }),
      });
      assert.equal(empty.outcome, "NOT_VERIFIED");
      if (empty.outcome === "NOT_VERIFIED") {
        assert.equal(empty.reason, "TXT_NOT_FOUND");
      }

      const failDomains = seedPending({ token });
      const fail = await verifyOwnerWebsiteDomainOwnership({
        ...base,
        prisma: makeFakePrisma({
          workspaceId: "ws_a",
          domains: failDomains,
        }) as never,
        dnsTxtLookup: async () => ({
          ok: false,
          reason: "timeout",
          message: "timeout",
        }),
      });
      assert.equal(fail.outcome, "DNS_RETRYABLE_ERROR");
      if (fail.outcome === "DNS_RETRYABLE_ERROR") {
        assert.equal(fail.reason, "DNS_TIMEOUT");
        assert.equal(failDomains.get("dom_pending")!.verifiedAt, null);
      }
    }
    console.log("PASS");

    console.log("[3] domain state guards...");
    {
      const domains = seedPending();
      domains.set("dom_active", {
        id: "dom_active",
        workspaceId: "ws_a",
        hostname: "live.example",
        kind: "CUSTOM",
        role: "ALIAS",
        status: "ACTIVE",
        verificationToken: "x",
        verifiedAt: new Date(),
      });
      domains.set("dom_disabled", {
        id: "dom_disabled",
        workspaceId: "ws_a",
        hostname: "off.example",
        kind: "CUSTOM",
        role: "ALIAS",
        status: "DISABLED",
        verificationToken: "x",
        verifiedAt: null,
      });
      domains.set("dom_foreign", {
        id: "dom_foreign",
        workspaceId: "ws_other",
        hostname: "other.example",
        kind: "CUSTOM",
        role: "PRIMARY",
        status: "PENDING",
        verificationToken: "x",
        verifiedAt: null,
      });

      const prisma = makeFakePrisma({ workspaceId: "ws_a", domains });
      const base = {
        request: ownerRequest(),
        prisma: prisma as never,
        hostDeps: hostDeps("ws_a"),
        userId: "user_owner",
        dnsTxtLookup: async () => ({
          ok: true,
          answers: ["x"],
          empty: false,
        }),
      };

      await expectError(
        () =>
          verifyOwnerWebsiteDomainOwnership({
            ...base,
            domainId: "dom_platform",
          }),
        "PLATFORM_DOMAIN_PROTECTED",
      );
      await expectError(
        () =>
          verifyOwnerWebsiteDomainOwnership({
            ...base,
            domainId: "dom_active",
          }),
        "DOMAIN_NOT_PENDING",
      );
      await expectError(
        () =>
          verifyOwnerWebsiteDomainOwnership({
            ...base,
            domainId: "dom_disabled",
          }),
        "DOMAIN_NOT_PENDING",
      );
      await expectError(
        () =>
          verifyOwnerWebsiteDomainOwnership({
            ...base,
            domainId: "dom_foreign",
          }),
        "DOMAIN_NOT_FOUND",
      );
      await expectError(
        () =>
          verifyOwnerWebsiteDomainOwnership({
            ...base,
            domainId: "dom_pending",
            prisma: makeFakePrisma({
              workspaceId: "ws_a",
              memberRole: "AGENT",
              domains: seedPending(),
            }) as never,
          }),
        "FORBIDDEN",
      );
    }
    console.log("PASS");

    console.log("[4] verified PENDING cannot resolve / canonical...");
    {
      const denied = await resolveAuthoritativeWorkspaceFromHostname(
        "brokerage.example",
        {
          lookupActiveDomain: async (hostname) =>
            hostname === "brokerage.example"
              ? {
                  hostname,
                  kind: "CUSTOM",
                  role: "PRIMARY",
                  workspaceId: "ws_a",
                  workspaceSlug: "tenant-a",
                  domainStatus: "PENDING",
                  workspaceStatus: "ACTIVE",
                }
              : null,
        },
      );
      assert.equal(denied.ok, false);
      if (!denied.ok) assert.equal(denied.reason, "domain_inactive");

      const platformOk = await resolveAuthoritativeWorkspaceFromHostname(
        "tenant-a.houzzatpro.com",
        {
          lookupActiveDomain: async (hostname) =>
            hostname === "tenant-a.houzzatpro.com"
              ? {
                  hostname,
                  kind: "PLATFORM",
                  role: "PRIMARY",
                  workspaceId: "ws_a",
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
            hostname: "brokerage.example",
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

    console.log("[5] verified PENDING still deletable...");
    {
      const domains = seedPending({
        verifiedAt: new Date("2026-09-07T12:00:00.000Z"),
      });
      const deleted = await deleteOwnerPendingWebsiteDomain({
        request: ownerRequest(),
        prisma: makeFakePrisma({ workspaceId: "ws_a", domains }) as never,
        hostDeps: hostDeps("ws_a"),
        userId: "user_owner",
        domainId: "dom_pending",
      });
      assert.equal(deleted.deleted, true);
      assert.equal(domains.has("dom_pending"), false);
      assert.ok(domains.has("dom_platform"));
    }
    console.log("PASS");

    console.log("[6] architecture...");
    {
      const verify = read("src/lib/tenancy/workspace-domain/verify-ownership.ts");
      const doh = read("src/lib/tenancy/workspace-domain/dns-txt-lookup.ts");
      const route = read(
        "src/app/api/onboarding/website-domains/[domainId]/verify/route.ts",
      );
      const ui = read("src/components/onboarding/WebsiteDomainSection.tsx");

      assert.ok(!/\$transaction\s*\(/.test(verify));
      assert.ok(!/updateMany\s*\(/.test(verify));
      assert.ok(!/node:dns|dns\.promises|resolveTxt/.test(verify + doh));
      assert.ok(!/custom_hostname|ssl for saas|Custom Hostname API/i.test(verify));
      assert.ok(/status:\s*"PENDING"/.test(verify));
      assert.ok(!/status:\s*"ACTIVE"/.test(verify));
      assert.ok(/cloudflare-dns\.com\/dns-query/.test(doh));
      assert.ok(/verifyOwnerWebsiteDomainOwnership/.test(route));
      assert.ok(/Verify DNS/.test(ui));
      assert.ok(/Website not connected yet/.test(ui));
      assert.ok(!/\bActivate\b/.test(ui));
      assert.ok(!/typesense|proptx/i.test(verify));
    }
    console.log("PASS");

    console.log("\nstage-6.11f2a-custom-domain-ownership:selftest ok\n");
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
