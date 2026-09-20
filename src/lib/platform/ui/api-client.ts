import { cookies, headers } from "next/headers";
import type {
  PlatformApiEnvelope,
  PlatformListPage,
  PlatformMeData,
  PlatformSummaryData,
  PlatformWorkspaceListItem,
} from "@/lib/platform/ui/types";

export class PlatformApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "PlatformApiClientError";
    this.status = status;
    this.code = code;
  }
}

async function resolvePlatformApiOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://127.0.0.1:3000"
  );
}

async function buildCookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export async function platformApiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const origin = await resolvePlatformApiOrigin();
  const cookieHeader = await buildCookieHeader();
  const url = `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader,
      ...(init?.headers ?? {}),
    },
  });

  let body: PlatformApiEnvelope<T> | null = null;
  try {
    body = (await response.json()) as PlatformApiEnvelope<T>;
  } catch {
    throw new PlatformApiClientError(
      "Invalid platform API response",
      response.status,
      "INVALID_RESPONSE",
    );
  }

  if (!body || body.ok !== true) {
    const failure = body as { ok: false; code?: string; message?: string };
    throw new PlatformApiClientError(
      failure.message ?? "Platform API request failed",
      response.status,
      failure.code ?? "PLATFORM_API_ERROR",
    );
  }

  return body.data;
}

export async function getPlatformMe(): Promise<PlatformMeData> {
  return platformApiFetch<PlatformMeData>("/api/platform/v1/me");
}

export async function getPlatformSummary(): Promise<PlatformSummaryData> {
  return platformApiFetch<PlatformSummaryData>("/api/platform/v1/summary");
}

export async function listPlatformWorkspaces(query?: {
  limit?: number;
  cursor?: string | null;
  status?: string | null;
}): Promise<PlatformListPage<PlatformWorkspaceListItem>> {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.status) params.set("status", query.status);
  const qs = params.toString();
  return platformApiFetch<PlatformListPage<PlatformWorkspaceListItem>>(
    `/api/platform/v1/workspaces${qs ? `?${qs}` : ""}`,
  );
}

export async function getPlatformWorkspace(workspaceId: string) {
  return platformApiFetch<Record<string, unknown>>(
    `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}`,
  );
}

export async function listPlatformProspects(query?: {
  limit?: number;
  cursor?: string | null;
  status?: string | null;
}) {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.status) params.set("status", query.status);
  const qs = params.toString();
  return platformApiFetch<PlatformListPage<Record<string, unknown>>>(
    `/api/platform/v1/prospects${qs ? `?${qs}` : ""}`,
  );
}

export async function getPlatformProspect(prospectId: string) {
  return platformApiFetch<Record<string, unknown>>(
    `/api/platform/v1/prospects/${encodeURIComponent(prospectId)}`,
  );
}

export async function listPlatformOffers(query?: {
  limit?: number;
  cursor?: string | null;
  status?: string | null;
}) {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.status) params.set("status", query.status);
  const qs = params.toString();
  return platformApiFetch<PlatformListPage<Record<string, unknown>>>(
    `/api/platform/v1/offers${qs ? `?${qs}` : ""}`,
  );
}

export async function getPlatformOffer(offerId: string) {
  return platformApiFetch<Record<string, unknown>>(
    `/api/platform/v1/offers/${encodeURIComponent(offerId)}`,
  );
}

export async function listPlatformSubscriptions(query?: {
  limit?: number;
  cursor?: string | null;
  status?: string | null;
  source?: string | null;
  workspaceId?: string | null;
}) {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.status) params.set("status", query.status);
  if (query?.source) params.set("source", query.source);
  if (query?.workspaceId) params.set("workspaceId", query.workspaceId);
  const qs = params.toString();
  return platformApiFetch<PlatformListPage<Record<string, unknown>>>(
    `/api/platform/v1/subscriptions${qs ? `?${qs}` : ""}`,
  );
}

export async function getPlatformSubscription(subscriptionId: string) {
  return platformApiFetch<Record<string, unknown>>(
    `/api/platform/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export async function listPlatformProvisioningRuns(query?: {
  limit?: number;
  cursor?: string | null;
  status?: string | null;
}) {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.status) params.set("status", query.status);
  const qs = params.toString();
  return platformApiFetch<PlatformListPage<Record<string, unknown>>>(
    `/api/platform/v1/provisioning${qs ? `?${qs}` : ""}`,
  );
}

export async function getPlatformProvisioningRun(runId: string) {
  return platformApiFetch<Record<string, unknown>>(
    `/api/platform/v1/provisioning/${encodeURIComponent(runId)}`,
  );
}

export async function listPlatformAuditEvents(query?: {
  limit?: number;
  cursor?: string | null;
  entityType?: string | null;
  action?: string | null;
}) {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.entityType) params.set("entityType", query.entityType);
  if (query?.action) params.set("action", query.action);
  const qs = params.toString();
  return platformApiFetch<PlatformListPage<Record<string, unknown>>>(
    `/api/platform/v1/audit${qs ? `?${qs}` : ""}`,
  );
}

export async function listPlatformSmsAutomations() {
  return platformApiFetch<{
    protectionCopy: string;
    items: Record<string, unknown>[];
  }>("/api/platform/v1/sms-automations");
}

export async function getPlatformSmsAutomation(key: string) {
  return platformApiFetch<Record<string, unknown>>(
    `/api/platform/v1/sms-automations/${encodeURIComponent(key)}`,
  );
}

export async function listPlatformSmsQuickTexts() {
  return platformApiFetch<{
    protectionCopy: string;
    items: Record<string, unknown>[];
  }>("/api/platform/v1/sms-quick-texts");
}

export async function getPlatformSmsQuickText(id: string) {
  return platformApiFetch<Record<string, unknown>>(
    `/api/platform/v1/sms-quick-texts/${encodeURIComponent(id)}`,
  );
}
