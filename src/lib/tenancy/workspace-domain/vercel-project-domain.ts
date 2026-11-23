/**
 * One Vercel project serves every tenant. Custom hostnames are attached to that
 * project; the app still chooses the tenant from the Host header.
 * This client never edits DNS.
 */

import { connect as connectTls } from "node:tls";
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
  /** Failing Vercel request. Null when the check completed. */
  upstream: { path: string; status: number } | null;
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
  projectId?: string;
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
  /** When false, a project token could not read the team domain-config endpoint. */
  configReadable?: boolean;
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
      upstream: null,
    };
  }

  const verified = input.projectDomain.verified === true;
  const configReadable = input.configReadable ?? true;
  const misconfigured = configReadable ? input.config?.misconfigured !== false : false;
  const productionAssignment =
    !input.projectDomain.gitBranch && !input.projectDomain.customEnvironmentId;
  const tlsReady = input.certificates.some((cert) =>
    certificateCoversHostname(cert.cns ?? [], hostname, input.now, cert.expiresAt ?? 0),
  );

  if (!verified) {
    return { attached: true, verified: false, misconfigured, tlsReady: false, records, reason: "VERCEL_UNVERIFIED", upstream: null };
  }
  if (!productionAssignment) {
    return {
      attached: true,
      verified: true,
      misconfigured,
      tlsReady: false,
      records,
      reason: "VERCEL_NOT_PRODUCTION",
      upstream: null,
    };
  }
  if (misconfigured) {
    return { attached: true, verified: true, misconfigured: true, tlsReady: false, records, reason: "VERCEL_MISCONFIGURED", upstream: null };
  }
  if (!tlsReady) {
    return { attached: true, verified: true, misconfigured: false, tlsReady: false, records, reason: "TLS_NOT_READY", upstream: null };
  }
  return { attached: true, verified: true, misconfigured: false, tlsReady: true, records, reason: "READY", upstream: null };
}

function notConfigured(): VercelDomainReadiness {
  return {
    attached: false,
    verified: false,
    misconfigured: true,
    tlsReady: false,
    records: [],
    reason: "VERCEL_NOT_CONFIGURED",
    upstream: null,
  };
}

function apiError(upstream: { path: string; status: number } | null = null): VercelDomainReadiness {
  return {
    attached: false,
    verified: false,
    misconfigured: true,
    tlsReady: false,
    records: [],
    reason: "VERCEL_API_ERROR",
    upstream,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function presentedCertificateFromPeer(peer: {
  subjectaltname?: string;
  subject?: { CN?: string | string[] };
  valid_to?: string;
}): CertPayload {
  const cns: string[] = [];
  for (const part of (peer.subjectaltname ?? "").split(",")) {
    const piece = part.trim();
    if (piece.startsWith("DNS:")) cns.push(piece.slice(4).trim());
  }
  const commonName = peer.subject?.CN;
  if (typeof commonName === "string" && commonName) cns.push(commonName);
  if (Array.isArray(commonName)) cns.push(...commonName.filter((name) => name.length > 0));
  const expiresAt = peer.valid_to ? Date.parse(peer.valid_to) : Number.NaN;
  return { cns, expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0 };
}

export function readPresentedCertificate(hostname: string): Promise<CertPayload | null> {
  return new Promise((resolve) => {
    const socket = connectTls({ host: hostname, servername: hostname, port: 443 });
    let settled = false;
    const finish = (certificate: CertPayload | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(certificate);
    };
    socket.setTimeout(8_000);
    socket.once("secureConnect", () => {
      const peer = socket.getPeerCertificate();
      finish(Object.keys(peer).length > 0 ? presentedCertificateFromPeer(peer) : null);
    });
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

export function createVercelProjectDomainClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  readCertificate: (hostname: string) => Promise<CertPayload | null> = readPresentedCertificate,
): VercelProjectDomainClient {
  const configured = readVercelProjectDomainConfig(env);

  async function load(hostname: string): Promise<VercelDomainReadiness> {
    if (!configured.ok) return notConfigured();
    const { token, projectId, teamId } = configured.config;
    const headers = { Authorization: `Bearer ${token}` };
    const domain = encodeURIComponent(hostname);

    async function send(
      path: string,
      query: Record<string, string>,
      init?: RequestInit,
    ): Promise<{ path: string; response: Response }> {
      const url = new URL(`https://api.vercel.com${path}`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const extraHeaders =
        init?.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
          ? init.headers
          : {};
      const response = await fetchImpl(url, {
        ...init,
        headers: { ...headers, ...extraHeaders },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok && response.status !== 409) {
        console.info(JSON.stringify({ event: "vercel-domain-check", path: url.pathname, status: response.status }));
      }
      return { path: url.pathname, response };
    }

    async function sendForToken(path: string, query: Record<string, string>, init?: RequestInit) {
      const withTeam = await send(path, teamId ? { ...query, teamId } : query, init);
      if (withTeam.response.status !== 403 || !teamId) return withTeam;
      return send(path, query, init);
    }

    try {
      const project = await sendForToken(`/v9/projects/${projectId}/domains/${domain}`, {});
      if (project.response.status === 404) {
        return interpretVercelDomainStatus({
          hostname,
          projectDomain: null,
          config: null,
          certificates: [],
          now: Date.now(),
          attached: false,
        });
      }
      if (!project.response.ok) return apiError({ path: project.path, status: project.response.status });
      const projectDomain = (await readJson(project.response)) as ProjectDomainPayload | null;
      if (projectDomain?.projectId && projectDomain.projectId !== projectId) {
        return interpretVercelDomainStatus({
          hostname,
          projectDomain: null,
          config: null,
          certificates: [],
          now: Date.now(),
          attached: false,
        });
      }

      const configResult = await sendForToken(`/v6/domains/${domain}/config`, {});
      if (!configResult.response.ok && configResult.response.status !== 403) {
        return apiError({ path: configResult.path, status: configResult.response.status });
      }
      const configReadable = configResult.response.ok;
      const config = configReadable
        ? ((await readJson(configResult.response)) as DomainConfigPayload | null)
        : null;

      const certificates = await loadCertificates(hostname, sendForToken, readCertificate);
      if (!certificates.ok) return apiError(certificates.upstream);
      return interpretVercelDomainStatus({
        hostname,
        projectDomain,
        config,
        configReadable,
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
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains`);
        if (teamId) url.searchParams.set("teamId", teamId);
        let response = await fetchImpl(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: hostname }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 403 && teamId) {
          response = await fetchImpl(`https://api.vercel.com/v10/projects/${projectId}/domains`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ name: hostname }),
            signal: AbortSignal.timeout(10_000),
          });
        }
        if (!response.ok && response.status !== 409) {
          return apiError({ path: url.pathname, status: response.status });
        }
      } catch {
        return apiError();
      }
      return load(hostname);
    },
  };
}

async function loadCertificates(
  hostname: string,
  sendForToken: (
    path: string,
    query: Record<string, string>,
  ) => Promise<{ path: string; response: Response }>,
  readCertificate: (hostname: string) => Promise<CertPayload | null>,
): Promise<{ ok: true; certs: CertPayload[] } | { ok: false; upstream: { path: string; status: number } }> {
  for (const path of ["/v6/certs", "/v8/certs"]) {
    const result = await sendForToken(path, { limit: "100", domain: hostname });
    if (result.response.ok) {
      const body = (await readJson(result.response)) as { certs?: CertPayload[] } | null;
      const now = Date.now();
      return {
        ok: true,
        certs: (body?.certs ?? []).filter((cert) =>
          certificateCoversHostname(cert.cns ?? [], hostname, now, cert.expiresAt ?? 0),
        ),
      };
    }
    if (result.response.status !== 403 && result.response.status !== 410) {
      return { ok: false, upstream: { path: result.path, status: result.response.status } };
    }
  }
  const presented = await readCertificate(hostname);
  return { ok: true, certs: presented ? [presented] : [] };
}
