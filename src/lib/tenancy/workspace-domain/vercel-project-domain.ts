/**
 * One Vercel project serves every tenant. Custom hostnames are attached to that
 * project; the app still chooses the tenant from the Host header.
 * This client never edits DNS.
 */

import {
  SHARED_PROJECT_APEX_A_RECORDS,
  SHARED_PROJECT_CNAME_TARGET,
  type DnsRecordInstruction,
} from "@/lib/tenancy/workspace-domain/custom-domain-dns-plan";

export type VercelDomainReadiness = {
  attached: boolean;
  verified: boolean;
  misconfigured: boolean;
  tlsReady: boolean;
  records: DnsRecordInstruction[];
  reason:
    | "READY"
    | "VERCEL_NOT_CONFIGURED"
    | "VERCEL_NOT_ATTACHED"
    | "VERCEL_UNVERIFIED"
    | "VERCEL_MISCONFIGURED"
    | "TLS_NOT_READY"
    | "VERCEL_NOT_PRODUCTION"
    | "VERCEL_API_ERROR"
    | null;
};

export type VercelProjectDomainClient = {
  attach(hostname: string): Promise<VercelDomainReadiness>;
  inspect(hostname: string): Promise<VercelDomainReadiness>;
};

type VercelConfig = {
  token: string;
  projectId: string;
  teamId: string;
};

type ProjectDomainPayload = {
  name?: string;
  verified?: boolean;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
  redirect?: string | null;
  redirectStatusCode?: number | null;
  verification?: Array<{ type?: string; domain?: string; value?: string }> | null;
};

type DomainConfigPayload = {
  misconfigured?: boolean;
  recommendedIPv4?: Array<{ rank?: number; value?: string[] }>;
  recommendedCNAME?: Array<{ rank?: number; value?: string }>;
};

type CertPayload = {
  cns?: string[];
  expiresAt?: number;
  createdAt?: number;
};

export function readVercelProjectDomainConfig(
  env: NodeJS.ProcessEnv,
): { ok: true; config: VercelConfig } | { ok: false; reason: "VERCEL_NOT_CONFIGURED" } {
  const token = env.VERCEL_API_TOKEN?.trim() || env.VERCEL_TOKEN?.trim() || "";
  const projectId = env.VERCEL_PROJECT_ID?.trim() || "";
  const teamId = env.VERCEL_TEAM_ID?.trim() || env.VERCEL_ORG_ID?.trim() || "";
  if (!token || !projectId || !teamId) {
    return { ok: false, reason: "VERCEL_NOT_CONFIGURED" };
  }
  return { ok: true, config: { token, projectId, teamId } };
}

export function certificateCoversHostname(
  cns: readonly string[],
  hostname: string,
  now: number,
  expiresAt: number,
): boolean {
  if (expiresAt <= now) return false;
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return cns.some((cn) => {
    const name = cn.trim().toLowerCase().replace(/\.$/, "");
    if (name === host) return true;
    if (!name.startsWith("*.")) return false;
    const parent = name.slice(2);
    if (!host.endsWith(`.${parent}`)) return false;
    const left = host.slice(0, host.length - parent.length - 1);
    return left.length > 0 && !left.includes(".");
  });
}

function rankOneValues(entries: Array<{ rank?: number; value?: string[] }> | undefined): string[] {
  const ranked = [...(entries ?? [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const values = ranked[0]?.value?.map((value) => value.replace(/\.$/, "")).filter(Boolean) ?? [];
  return values.length > 0 ? values : [...SHARED_PROJECT_APEX_A_RECORDS];
}

function rankOneCname(entries: Array<{ rank?: number; value?: string }> | undefined): string {
  const ranked = [...(entries ?? [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return (ranked[0]?.value ?? SHARED_PROJECT_CNAME_TARGET).replace(/\.$/, "");
}

export function interpretVercelDomainStatus(input: {
  hostname: string;
  projectDomain: ProjectDomainPayload | null;
  config: DomainConfigPayload | null;
  certificates: readonly CertPayload[];
  now: number;
  attached: boolean;
}): VercelDomainReadiness {
  const hostname = input.hostname.trim().toLowerCase();
  const apexARecords = rankOneValues(input.config?.recommendedIPv4);
  const cnameTarget = rankOneCname(input.config?.recommendedCNAME);
  const records: DnsRecordInstruction[] = [];
  const labels = hostname.split(".");
  if (labels.length === 2) {
    for (const ip of apexARecords) {
      records.push({ type: "A", host: hostname, value: ip, purpose: "routing" });
    }
    records.push({
      type: "CNAME",
      host: `www.${hostname}`,
      value: cnameTarget,
      purpose: "routing",
    });
  } else {
    records.push({ type: "CNAME", host: hostname, value: cnameTarget, purpose: "routing" });
  }
  for (const challenge of input.projectDomain?.verification ?? []) {
    if (!challenge.domain || !challenge.value) continue;
    const type = challenge.type === "A" || challenge.type === "CNAME" ? challenge.type : "TXT";
    records.push({
      type,
      host: challenge.domain,
      value: challenge.value,
      purpose: "vercel_verification",
    });
  }

  if (!input.attached || !input.projectDomain) {
    return {
      attached: false,
      verified: false,
      misconfigured: true,
      tlsReady: false,
      records,
      reason: "VERCEL_NOT_ATTACHED",
    };
  }

  const verified = input.projectDomain.verified === true;
  const misconfigured = input.config?.misconfigured !== false;
  const productionAssignment =
    !input.projectDomain.gitBranch && !input.projectDomain.customEnvironmentId;
  const tlsReady = input.certificates.some((cert) =>
    certificateCoversHostname(cert.cns ?? [], hostname, input.now, cert.expiresAt ?? 0),
  );

  if (!verified) {
    return { attached: true, verified: false, misconfigured, tlsReady: false, records, reason: "VERCEL_UNVERIFIED" };
  }
  if (!productionAssignment) {
    return {
      attached: true,
      verified: true,
      misconfigured,
      tlsReady: false,
      records,
      reason: "VERCEL_NOT_PRODUCTION",
    };
  }
  if (misconfigured) {
    return { attached: true, verified: true, misconfigured: true, tlsReady: false, records, reason: "VERCEL_MISCONFIGURED" };
  }
  if (!tlsReady) {
    return { attached: true, verified: true, misconfigured: false, tlsReady: false, records, reason: "TLS_NOT_READY" };
  }
  return { attached: true, verified: true, misconfigured: false, tlsReady: true, records, reason: "READY" };
}

function notConfigured(): VercelDomainReadiness {
  return {
    attached: false,
    verified: false,
    misconfigured: true,
    tlsReady: false,
    records: [],
    reason: "VERCEL_NOT_CONFIGURED",
  };
}

function apiError(): VercelDomainReadiness {
  return {
    attached: false,
    verified: false,
    misconfigured: true,
    tlsReady: false,
    records: [],
    reason: "VERCEL_API_ERROR",
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createVercelProjectDomainClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): VercelProjectDomainClient {
  const configured = readVercelProjectDomainConfig(env);

  async function load(hostname: string): Promise<VercelDomainReadiness> {
    if (!configured.ok) return notConfigured();
    const { token, projectId, teamId } = configured.config;
    const headers = { Authorization: `Bearer ${token}` };
    const domain = encodeURIComponent(hostname);
    try {
      const projectResponse = await fetchImpl(
        `https://api.vercel.com/v9/projects/${projectId}/domains/${domain}?teamId=${encodeURIComponent(teamId)}`,
        { headers, signal: AbortSignal.timeout(10_000) },
      );
      if (projectResponse.status === 404) {
        return interpretVercelDomainStatus({
          hostname,
          projectDomain: null,
          config: null,
          certificates: [],
          now: Date.now(),
          attached: false,
        });
      }
      if (!projectResponse.ok) return apiError();
      const projectDomain = (await readJson(projectResponse)) as ProjectDomainPayload | null;
      const configResponse = await fetchImpl(
        `https://api.vercel.com/v6/domains/${domain}/config?teamId=${encodeURIComponent(teamId)}`,
        { headers, signal: AbortSignal.timeout(10_000) },
      );
      if (!configResponse.ok) return apiError();
      const config = (await readJson(configResponse)) as DomainConfigPayload | null;
      const certificates = await loadMatchingCertificates(hostname, teamId, headers, fetchImpl);
      if (!certificates.ok) return apiError();
      return interpretVercelDomainStatus({
        hostname,
        projectDomain,
        config,
        certificates: certificates.certs,
        now: Date.now(),
        attached: true,
      });
    } catch {
      return apiError();
    }
  }

  return {
    async inspect(hostname) {
      return load(hostname);
    },
    async attach(hostname) {
      if (!configured.ok) return notConfigured();
      const { token, projectId, teamId } = configured.config;
      try {
        const response = await fetchImpl(
          `https://api.vercel.com/v10/projects/${projectId}/domains?teamId=${encodeURIComponent(teamId)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: hostname }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!response.ok && response.status !== 409) return apiError();
      } catch {
        return apiError();
      }
      return load(hostname);
    },
  };
}

async function loadMatchingCertificates(
  hostname: string,
  teamId: string,
  headers: { Authorization: string },
  fetchImpl: typeof fetch,
): Promise<{ ok: true; certs: CertPayload[] } | { ok: false }> {
  const url = new URL("https://api.vercel.com/v6/certs");
  url.searchParams.set("limit", "100");
  url.searchParams.set("teamId", teamId);
  url.searchParams.set("domain", hostname);
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return { ok: false };
  const body = (await readJson(response)) as { certs?: CertPayload[] } | null;
  const now = Date.now();
  const certs = (body?.certs ?? []).filter((cert) =>
    certificateCoversHostname(cert.cns ?? [], hostname, now, cert.expiresAt ?? 0),
  );
  return { ok: true, certs };
}
