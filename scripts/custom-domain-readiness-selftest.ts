/**
 * Master Admin custom domains: isolation, TXT verification, duplicate claims,
 * TLS readiness, and activation that leaves the platform hostname in place.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { ProvisioningActionError } from "@/lib/platform/provisioning/errors";
import {
  ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION,
  ATTACH_CUSTOM_DOMAIN_AUTHORIZATION,
  PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
  VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
  activateMasterCustomDomain,
  attachMasterCustomDomain,
  checkHostnameTenantRouting,
  prepareMasterCustomDomain,
  verifyMasterCustomDomainOwnership,
} from "@/lib/platform/domains/master-custom-domain";
import { clearHostResolutionCacheForTests } from "@/lib/tenancy/resolve-workspace-host";
import { createCloudflareDohTxtLookup } from "@/lib/tenancy/workspace-domain/dns-txt-lookup";
import { buildWebsiteDomainTxtOwnershipHost } from "@/lib/tenancy/workspace-domain/dns-instructions";
import {
  normalizeDnsTxtAnswer,
  txtAnswersMatchOwnershipToken,
} from "@/lib/tenancy/workspace-domain/txt-match";
import type { HostResolutionDeps } from "@/lib/tenancy/resolve-workspace-host";
import {
  SHARED_PROJECT_APEX_A_RECORDS,
  SHARED_PROJECT_CNAME_TARGET,
  buildCustomDomainDnsPlan,
} from "@/lib/tenancy/workspace-domain/custom-domain-dns-plan";
import {
  ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION,
  ATTACH_CUSTOM_DOMAIN_CONFIRMATION,
} from "@/lib/tenancy/workspace-domain/custom-domain-dns-plan";
import {
  certificateCoversHostname,
  interpretVercelDomainStatus,
  type VercelDomainReadiness,
  type VercelProjectDomainClient,
} from "@/lib/tenancy/workspace-domain/vercel-project-domain";

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

type WorkspaceRow = {
  id: string;
  slug: string;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED";
};

const previousScope = process.env.TENANT_DOMAIN_SCOPE;
process.env.TENANT_DOMAIN_SCOPE = "workspace";

function createStore() {
  const domains: DomainRow[] = [];
  const workspaces: WorkspaceRow[] = [
    { id: "ws_high_octane", slug: "high-octane-real-estate", status: "ACTIVE" },
    { id: "ws_other", slug: "other-brokerage", status: "ACTIVE" },
  ];
  let sequence = 0;
  const audits: string[] = [];
  const prisma = {
    platformOperator: {
      findUnique: async () => ({ role: "MASTER_ADMIN", status: "ACTIVE" }),
    },
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        workspaces.find((workspace) => workspace.id === where.id) ?? null,
    },
    workspaceDomain: {
      findUnique: async ({ where }: { where: { hostname: string } }) =>
        domains.find((domain) => domain.hostname === where.hostname) ?? null,
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) =>
        domains.find(
          (domain) => domain.id === where.id && domain.workspaceId === where.workspaceId,
        ) ?? null,
      findMany: async ({ where }: { where: { workspaceId: string } }) =>
        domains.filter((domain) => domain.workspaceId === where.workspaceId),
      create: async ({ data }: { data: Omit<DomainRow, "id"> }) => {
        const row: DomainRow = { id: `dom_${++sequence}`, ...data };
        domains.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<DomainRow>;
      }) => {
        const row = domains.find((domain) => domain.id === where.id);
        if (!row) throw new Error("missing domain");
        Object.assign(row, data);
        return row;
      },
    },
    platformAuditEvent: {
      create: async ({ data }: { data: { action: string } }) => {
        audits.push(data.action);
        return { id: `audit_${audits.length}` };
      },
    },
  };
  return { domains, workspaces, audits, prisma: prisma as unknown as PrismaClient };
}

function seedPlatform(store: ReturnType<typeof createStore>) {
  store.domains.push(
    {
      id: "platform_high_octane",
      workspaceId: "ws_high_octane",
      hostname: "high-octane-real-estate.houzzatpro.com",
      kind: "PLATFORM",
      role: "PRIMARY",
      status: "ACTIVE",
      verificationToken: null,
      verifiedAt: new Date("2026-10-23T00:00:00.000Z"),
    },
    {
      id: "platform_other",
      workspaceId: "ws_other",
      hostname: "other-brokerage.houzzatpro.com",
      kind: "PLATFORM",
      role: "PRIMARY",
      status: "ACTIVE",
      verificationToken: null,
      verifiedAt: new Date("2026-10-23T00:00:00.000Z"),
    },
  );
}

function hostDeps(store: ReturnType<typeof createStore>): HostResolutionDeps {
  return {
    lookupActiveDomain: async (hostname) => {
      const row = store.domains.find((domain) => domain.hostname === hostname);
      if (!row) return null;
      const workspace = store.workspaces.find((item) => item.id === row.workspaceId);
      if (!workspace) return null;
      return {
        hostname: row.hostname,
        kind: row.kind,
        role: row.role,
        workspaceId: row.workspaceId,
        workspaceSlug: workspace.slug,
        domainStatus: row.status,
        workspaceStatus: workspace.status,
      };
    },
    resolveLegacyHouzzatWorkspace: async () => null,
  };
}

function readyClient(calls: { attach: number; inspect: number }): VercelProjectDomainClient {
  const readiness: VercelDomainReadiness = {
    attached: true,
    verified: true,
    misconfigured: false,
    tlsReady: true,
    records: [],
    reason: "READY",
  };
  return {
    attach: async () => {
      calls.attach += 1;
      return readiness;
    },
    inspect: async () => {
      calls.inspect += 1;
      return readiness;
    },
  };
}

async function main() {
  clearHostResolutionCacheForTests();
  const store = createStore();
  seedPlatform(store);
  const prepared = await prepareMasterCustomDomain({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    hostname: "HighOctaneNiagara.ca",
  });

  assert.equal(prepared.idempotent, false);
  assert.deepEqual(
    prepared.domains.map((domain) => domain.hostname).sort(),
    ["highoctaneniagara.ca", "www.highoctaneniagara.ca"],
  );
  assert.equal(prepared.platformHostname, "high-octane-real-estate.houzzatpro.com");
  assert.equal(
    store.domains.find((domain) => domain.hostname === "high-octane-real-estate.houzzatpro.com")
      ?.status,
    "ACTIVE",
  );
  const apex = prepared.domains.find((domain) => domain.hostname === "highoctaneniagara.ca");
  const www = prepared.domains.find((domain) => domain.hostname === "www.highoctaneniagara.ca");
  assert.ok(apex && www);
  assert.equal(apex.role, "PRIMARY");
  assert.equal(www.role, "ALIAS");
  assert.equal(apex.status, "PENDING");
  assert.notEqual(apex.ownershipValue, www.ownershipValue);
  const txtHosts = prepared.records.filter((record) => record.purpose === "ownership");
  assert.deepEqual(
    txtHosts.map((record) => record.host).sort(),
    [
      "_houzzatpro-challenge.highoctaneniagara.ca",
      "_houzzatpro-challenge.www.highoctaneniagara.ca",
    ],
  );
  const addresses = prepared.records.filter((record) => record.type === "A").map((record) => record.value);
  assert.deepEqual(addresses, [...SHARED_PROJECT_APEX_A_RECORDS]);
  const cname = prepared.records.find((record) => record.type === "CNAME");
  assert.equal(cname?.host, "www.highoctaneniagara.ca");
  assert.equal(cname?.value, SHARED_PROJECT_CNAME_TARGET);
  assert.ok(prepared.constraints.some((line) => line.includes("nameservers")));
  assert.ok(prepared.constraints.some((line) => line.includes("MX")));

  const again = await prepareMasterCustomDomain({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    hostname: "highoctaneniagara.ca",
  });
  assert.equal(again.idempotent, true);
  assert.equal(again.domains.find((domain) => domain.id === apex.id)?.ownershipValue, apex.ownershipValue);
  assert.equal(store.domains.filter((domain) => domain.kind === "CUSTOM").length, 2);

  await assert.rejects(
    prepareMasterCustomDomain({
      prisma: store.prisma,
      operatorId: "op_master",
      authorization: PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
      workspaceId: "ws_other",
      hostname: "highoctaneniagara.ca",
    }),
    (error: unknown) => error instanceof ProvisioningActionError && error.code === "HOSTNAME_TAKEN",
  );
  assert.equal(store.domains.filter((domain) => domain.workspaceId === "ws_other" && domain.kind === "CUSTOM").length, 0);

  await assert.rejects(
    prepareMasterCustomDomain({
      prisma: store.prisma,
      operatorId: "op_master",
      authorization: PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
      workspaceId: "ws_other",
      hostname: "other-brokerage.houzzatpro.com",
    }),
    (error: unknown) =>
      error instanceof ProvisioningActionError && error.code === "HOSTNAME_RESERVED",
  );

  const pendingRouting = await checkHostnameTenantRouting({
    hostname: "highoctaneniagara.ca",
    expectedWorkspaceId: "ws_high_octane",
    deps: hostDeps(store),
  });
  assert.equal(pendingRouting.live, false);
  assert.equal(pendingRouting.isolated, true);
  assert.equal(pendingRouting.reason, "domain_inactive");

  const otherStill = await checkHostnameTenantRouting({
    hostname: "other-brokerage.houzzatpro.com",
    expectedWorkspaceId: "ws_other",
    deps: hostDeps(store),
  });
  assert.equal(otherStill.live, true);
  assert.equal(otherStill.workspaceId, "ws_other");

  const mismatch = await verifyMasterCustomDomainOwnership({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    domainId: apex.id,
    dnsTxtLookup: async () => ({ ok: true, answers: ["someone-else"], empty: false }),
  });
  assert.equal(mismatch.outcome, "NOT_VERIFIED");
  assert.equal(mismatch.reason, "TXT_MISMATCH");
  assert.equal(store.domains.find((domain) => domain.id === apex.id)?.status, "PENDING");
  assert.equal(store.domains.find((domain) => domain.id === apex.id)?.verifiedAt, null);

  const verified = await verifyMasterCustomDomainOwnership({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    domainId: apex.id,
    dnsTxtLookup: async () => ({ ok: true, answers: [apex.ownershipValue!], empty: false }),
    now: new Date("2026-11-22T18:00:00.000Z"),
  });
  assert.equal(verified.outcome, "VERIFIED");
  assert.equal(verified.domain.status, "PENDING");
  assert.equal(verified.domain.verifiedAt, "2026-11-22T18:00:00.000Z");

  const calls = { attach: 0, inspect: 0 };
  const notReady = await activateMasterCustomDomain({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION,
    confirmation: ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION,
    workspaceId: "ws_high_octane",
    domainId: apex.id,
    dnsTxtLookup: async () => ({ ok: true, answers: [apex.ownershipValue!], empty: false }),
    vercel: {
      attach: async () => {
        throw new Error("activate must not attach");
      },
      inspect: async () => ({
        attached: true,
        verified: true,
        misconfigured: false,
        tlsReady: false,
        records: [],
        reason: "TLS_NOT_READY",
      }),
    },
    hostDeps: hostDeps(store),
  });
  assert.equal(notReady.outcome, "NOT_READY");
  if (notReady.outcome === "NOT_READY") assert.equal(notReady.reason, "TLS_NOT_READY");
  assert.equal(store.domains.find((domain) => domain.id === apex.id)?.status, "PENDING");

  await assert.rejects(
    activateMasterCustomDomain({
      prisma: store.prisma,
      operatorId: "op_master",
      authorization: ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION,
      confirmation: "no",
      workspaceId: "ws_high_octane",
      domainId: apex.id,
      dnsTxtLookup: async () => ({ ok: true, answers: [apex.ownershipValue!], empty: false }),
      vercel: readyClient(calls),
      hostDeps: hostDeps(store),
    }),
    (error: unknown) =>
      error instanceof ProvisioningActionError && error.code === "CONFIRMATION_REQUIRED",
  );
  assert.equal(calls.attach, 0);
  assert.equal(calls.inspect, 0);
  assert.equal(store.domains.find((domain) => domain.id === apex.id)?.status, "PENDING");

  const attached = await attachMasterCustomDomain({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: ATTACH_CUSTOM_DOMAIN_AUTHORIZATION,
    confirmation: ATTACH_CUSTOM_DOMAIN_CONFIRMATION,
    workspaceId: "ws_high_octane",
    domainId: apex.id,
    vercel: readyClient(calls),
  });
  assert.equal(attached.status, "PENDING");
  assert.equal(calls.attach, 1);
  assert.equal(store.domains.find((domain) => domain.id === apex.id)?.status, "PENDING");

  const crossed = await activateMasterCustomDomain({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION,
    confirmation: ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION,
    workspaceId: "ws_high_octane",
    domainId: apex.id,
    dnsTxtLookup: async () => ({ ok: true, answers: [apex.ownershipValue!], empty: false }),
    vercel: readyClient(calls),
    hostDeps: {
      lookupActiveDomain: async () => ({
        hostname: "highoctaneniagara.ca",
        kind: "CUSTOM",
        role: "PRIMARY",
        workspaceId: "ws_other",
        workspaceSlug: "other-brokerage",
        domainStatus: "ACTIVE",
        workspaceStatus: "ACTIVE",
      }),
      resolveLegacyHouzzatWorkspace: async () => null,
    },
  });
  assert.equal(crossed.outcome, "NOT_READY");
  if (crossed.outcome === "NOT_READY") assert.equal(crossed.reason, "HOSTNAME_ROUTING_MISMATCH");
  assert.equal(store.domains.find((domain) => domain.id === apex.id)?.status, "PENDING");
  assert.equal(calls.attach, 1);

  const activated = await activateMasterCustomDomain({
    prisma: store.prisma,
    operatorId: "op_master",
    authorization: ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION,
    confirmation: ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION,
    workspaceId: "ws_high_octane",
    domainId: apex.id,
    dnsTxtLookup: async () => ({ ok: true, answers: [apex.ownershipValue!], empty: false }),
    vercel: readyClient(calls),
    hostDeps: hostDeps(store),
  });
  assert.equal(activated.outcome, "ACTIVATED");
  if (activated.outcome === "ACTIVATED") {
    assert.equal(activated.domain.hostname, "highoctaneniagara.ca");
    assert.equal(activated.platformHostname, "high-octane-real-estate.houzzatpro.com");
  }
  assert.equal(store.domains.find((domain) => domain.id === apex.id)?.status, "ACTIVE");
  assert.equal(store.domains.find((domain) => domain.id === www.id)?.status, "PENDING");
  assert.equal(
    store.domains.find((domain) => domain.hostname === "high-octane-real-estate.houzzatpro.com")
      ?.status,
    "ACTIVE",
  );
  const live = await checkHostnameTenantRouting({
    hostname: "highoctaneniagara.ca",
    expectedWorkspaceId: "ws_high_octane",
    deps: hostDeps(store),
  });
  assert.equal(live.isolated, true);
  assert.equal(live.live, true);
  assert.equal(live.workspaceId, "ws_high_octane");
  const notOther = await checkHostnameTenantRouting({
    hostname: "highoctaneniagara.ca",
    expectedWorkspaceId: "ws_other",
    deps: hostDeps(store),
  });
  assert.equal(notOther.isolated, false);
  assert.equal(notOther.workspaceId, "ws_high_octane");

  const now = Date.parse("2026-11-22T18:00:00.000Z");
  assert.equal(
    certificateCoversHostname(["*.houzzatpro.com"], "highoctaneniagara.ca", now, now + 1000),
    false,
  );
  assert.equal(
    certificateCoversHostname(["highoctaneniagara.ca"], "highoctaneniagara.ca", now, now),
    false,
  );
  const ready = interpretVercelDomainStatus({
    hostname: "highoctaneniagara.ca",
    projectDomain: { name: "highoctaneniagara.ca", verified: true, verification: [] },
    config: { misconfigured: false, recommendedIPv4: [{ rank: 1, value: ["216.150.1.1", "216.150.16.1"] }] },
    certificates: [{ cns: ["highoctaneniagara.ca"], expiresAt: now + 1000 }],
    now,
    attached: true,
  });
  assert.equal(ready.tlsReady, true);
  const missingCert = interpretVercelDomainStatus({
    hostname: "highoctaneniagara.ca",
    projectDomain: { name: "highoctaneniagara.ca", verified: true, verification: [] },
    config: { misconfigured: false },
    certificates: [{ cns: ["*.houzzatpro.com"], expiresAt: now + 1000 }],
    now,
    attached: true,
  });
  assert.equal(missingCert.tlsReady, false);
  assert.equal(missingCert.reason, "TLS_NOT_READY");

  const savedApex = "xQPzF8FeUosRvRIk6HMKt7y9ZnddNVo907ebRUmco_E";
  const publishedApex = "xQPzF8FeUosRvRIk6HMKt7y9ZnddNVo9O7ebRUmco_E";
  const savedWww = "WEwcBer4vHMSp8BXw-C5Gm80J0ELpG7zWFdtbQASQYQ";
  const publishedWww = "WEwcBer4vHMSp8BXw-C5Gm8OJOELpG7zWFdtbQASQYQ";
  assert.equal(savedApex === publishedApex, false);
  assert.equal(savedWww === publishedWww, false);
  assert.equal(
    txtAnswersMatchOwnershipToken([`"${publishedApex}"`], savedApex),
    false,
  );
  assert.equal(
    txtAnswersMatchOwnershipToken([publishedApex], publishedApex),
    true,
  );
  assert.equal(
    txtAnswersMatchOwnershipToken([`"${publishedWww}"`], savedWww),
    false,
  );
  assert.equal(normalizeDnsTxtAnswer(`"${publishedApex}"`), publishedApex);
  assert.equal(normalizeDnsTxtAnswer('"chunk-a" "chunk-b"'), "chunk-achunk-b");
  assert.equal(
    buildWebsiteDomainTxtOwnershipHost("highoctaneniagara.ca"),
    "_houzzatpro-challenge.highoctaneniagara.ca",
  );
  assert.equal(
    buildWebsiteDomainTxtOwnershipHost("www.highoctaneniagara.ca"),
    "_houzzatpro-challenge.www.highoctaneniagara.ca",
  );
  assert.notEqual(
    buildWebsiteDomainTxtOwnershipHost("highoctaneniagara.ca"),
    "_houzzatpro-challenge.highoctaneniagara.ca.highoctaneniagara.ca",
  );

  const fresh = createStore();
  const preparedFresh = await prepareMasterCustomDomain({
    prisma: fresh.prisma,
    operatorId: "op_master",
    authorization: PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    hostname: "highoctaneniagara.ca",
  });
  const freshApex = preparedFresh.domains.find((domain) => domain.hostname === "highoctaneniagara.ca");
  const freshWww = preparedFresh.domains.find((domain) => domain.hostname === "www.highoctaneniagara.ca");
  assert.ok(freshApex?.ownershipValue && freshWww?.ownershipValue);
  const lookedUp: string[] = [];
  const lookalike = await verifyMasterCustomDomainOwnership({
    prisma: fresh.prisma,
    operatorId: "op_master",
    authorization: VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    domainId: freshApex.id,
    dnsTxtLookup: async ({ name }) => {
      lookedUp.push(name);
      return { ok: true, answers: [`"${publishedApex}"`], empty: false };
    },
  });
  assert.deepEqual(lookedUp, ["_houzzatpro-challenge.highoctaneniagara.ca"]);
  assert.equal(lookalike.outcome, "NOT_VERIFIED");
  assert.equal(lookalike.reason, "TXT_MISMATCH");
  assert.deepEqual(lookalike.observedTxt, [publishedApex]);
  assert.equal(fresh.domains.find((domain) => domain.id === freshApex.id)?.verifiedAt, null);
  assert.equal(fresh.domains.find((domain) => domain.id === freshApex.id)?.status, "PENDING");

  const wwwLookalike = await verifyMasterCustomDomainOwnership({
    prisma: fresh.prisma,
    operatorId: "op_master",
    authorization: VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    domainId: freshWww.id,
    dnsTxtLookup: async ({ name }) => {
      assert.equal(name, "_houzzatpro-challenge.www.highoctaneniagara.ca");
      return { ok: true, answers: [publishedWww], empty: false };
    },
  });
  assert.equal(wwwLookalike.outcome, "NOT_VERIFIED");
  assert.equal(wwwLookalike.reason, "TXT_MISMATCH");
  assert.equal(fresh.domains.find((domain) => domain.id === freshWww.id)?.verifiedAt, null);

  const quoted = await verifyMasterCustomDomainOwnership({
    prisma: fresh.prisma,
    operatorId: "op_master",
    authorization: VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    domainId: freshApex.id,
    dnsTxtLookup: async ({ name }) => {
      assert.equal(name, "_houzzatpro-challenge.highoctaneniagara.ca");
      return { ok: true, answers: [`"${freshApex.ownershipValue}"`], empty: false };
    },
  });
  assert.equal(quoted.outcome, "VERIFIED");
  assert.equal(quoted.domain.status, "PENDING");
  assert.equal(quoted.observedTxt, null);

  const unquoted = await verifyMasterCustomDomainOwnership({
    prisma: fresh.prisma,
    operatorId: "op_master",
    authorization: VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
    workspaceId: "ws_high_octane",
    domainId: freshWww.id,
    dnsTxtLookup: async ({ name }) => {
      assert.equal(name, "_houzzatpro-challenge.www.highoctaneniagara.ca");
      return {
        ok: true,
        answers: [freshWww.ownershipValue!, `"other-record"`],
        empty: false,
      };
    },
  });
  assert.equal(unquoted.outcome, "VERIFIED");
  assert.equal(unquoted.domain.status, "PENDING");

  const resolver = createCloudflareDohTxtLookup({
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("type"), "TXT");
      assert.equal(url.searchParams.get("name"), "_houzzatpro-challenge.cached.example");
      return new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ type: 16, data: `"${publishedApex}"` }],
        }),
        { status: 200, headers: { "content-type": "application/dns-json" } },
      );
    },
  });
  const parsed = await resolver({ name: "_houzzatpro-challenge.cached.example" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(txtAnswersMatchOwnershipToken(parsed.answers, savedApex), false);
    assert.equal(txtAnswersMatchOwnershipToken(parsed.answers, publishedApex), true);
  }

  const plan = buildCustomDomainDnsPlan({
    claims: [{ hostname: "highoctaneniagara.ca", verificationToken: "token" }],
  });
  assert.equal(plan.records.some((record) => record.value === "token"), true);
  assert.equal(plan.records.some((record) => record.type === "MX"), false);

  const source = readFileSync(
    new URL("../src/lib/platform/domains/master-custom-domain.ts", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("workspaceEmailIdentity"), false);
  assert.equal(source.includes("sendCommercialOffer"), false);
  assert.equal(source.includes("proptx"), false);
  const activateFn = source.slice(source.indexOf("export async function activateMasterCustomDomain"));
  assert.equal(activateFn.includes(".attach("), false);
  assert.equal(activateFn.includes(".inspect("), true);

  console.log("custom-domain-readiness-selftest: ok");
  if (previousScope === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
  else process.env.TENANT_DOMAIN_SCOPE = previousScope;
}

void main();
