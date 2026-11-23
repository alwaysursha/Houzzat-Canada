import {
  qualifyDnsHost,
  type CustomSendingDnsRecord,
} from "@/lib/email/custom-sending-policy";

export type ResendDomainSnapshot = {
  id: string;
  name: string;
  status: string;
  records: CustomSendingDnsRecord[];
};

type ResendRecord = {
  record?: unknown;
  name?: unknown;
  value?: unknown;
  type?: unknown;
  priority?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseResendDomain(
  payload: unknown,
  fallbackDomain: string,
): ResendDomainSnapshot | null {
  const body = asRecord(payload);
  if (!body || typeof body.id !== "string" || typeof body.name !== "string") return null;
  const records = Array.isArray(body.records) ? body.records : [];
  return {
    id: body.id,
    name: body.name.trim().toLowerCase(),
    status: typeof body.status === "string" ? body.status : "not_started",
    records: records.flatMap((item) => {
      const record = asRecord(item) as ResendRecord | null;
      if (!record) return [];
      if (typeof record.name !== "string" || typeof record.value !== "string") return [];
      if (typeof record.type !== "string") return [];
      const priority = typeof record.priority === "number" ? record.priority : null;
      return [
        {
          type: record.type,
          host: qualifyDnsHost(record.name, fallbackDomain),
          value: record.value,
          priority,
          purpose: typeof record.record === "string" ? record.record : record.type,
        },
      ];
    }),
  };
}

export type ResendDomainClient = {
  create(input: {
    name: string;
    returnPathLabel: string;
  }): Promise<{ status: number; body: unknown }>;
  get(id: string): Promise<{ status: number; body: unknown }>;
  list(): Promise<{ status: number; body: unknown }>;
};

export function createResendDomainClient(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): ResendDomainClient {
  async function send(path: string, init?: RequestInit) {
    const response = await fetchImpl(`https://api.resend.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok && response.status !== 409) {
      console.info(
        JSON.stringify({ event: "resend-domain", path, status: response.status }),
      );
    }
    return { status: response.status, body };
  }

  return {
    create(input) {
      return send("/domains", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          region: "us-east-1",
          custom_return_path: input.returnPathLabel,
          open_tracking: false,
          click_tracking: false,
          capabilities: { sending: "enabled", receiving: "disabled" },
        }),
      });
    },
    get(id) {
      return send(`/domains/${encodeURIComponent(id)}`);
    },
    list() {
      return send("/domains");
    },
  };
}

export function findListedDomain(
  payload: unknown,
  name: string,
): ResendDomainSnapshot | null {
  const body = asRecord(payload);
  const data = body && Array.isArray(body.data) ? body.data : Array.isArray(payload) ? payload : [];
  for (const item of data) {
    const parsed = parseResendDomain(item, name);
    if (parsed && parsed.name === name) return parsed;
  }
  return null;
}
