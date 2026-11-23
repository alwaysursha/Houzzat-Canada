"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION,
  ATTACH_CUSTOM_DOMAIN_CONFIRMATION,
} from "@/lib/tenancy/workspace-domain/custom-domain-dns-plan";

type DnsRecord = {
  type: "A" | "CNAME" | "TXT";
  host: string;
  value: string;
  purpose: "ownership" | "routing" | "vercel_verification";
};

type DomainRow = {
  id: string;
  hostname: string;
  role: string;
  status: string;
  verifiedAt: string | null;
  ownershipHost: string | null;
  ownershipValue: string | null;
};

type Plan = {
  domains: DomainRow[];
  records: DnsRecord[];
  constraints: string[];
  platformHostname: string | null;
};

type Readiness = {
  vercel: {
    attached: boolean;
    verified: boolean;
    misconfigured: boolean;
    tlsReady: boolean;
    reason: string | null;
    records: DnsRecord[];
  };
  routing: { isolated: boolean; live: boolean; reason: string | null };
};

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export function PlatformCustomDomain({
  workspaceId,
  existingHostnames,
}: {
  workspaceId: string;
  existingHostnames: { hostname: string; kind: string; role: string; status: string }[];
}) {
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [readiness, setReadiness] = useState<Record<string, Readiness>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}/custom-domain`;

  async function load() {
    const response = await fetch(base, { headers: { Accept: "application/json" } });
    const body = (await response.json()) as ApiEnvelope<Plan>;
    if (!response.ok || !body.ok) {
      setError(body.ok === false ? body.message : "Custom domain instructions could not be loaded.");
      return;
    }
    setPlan(body.data);
  }

  async function post<T>(action: string, path: string, payload: unknown): Promise<T | null> {
    setPending(action);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as ApiEnvelope<T>;
      if (!response.ok || !body.ok) {
        setError(body.ok === false ? body.message : "The action could not be completed.");
        return null;
      }
      return body.data;
    } catch {
      setError("Network error.");
      return null;
    } finally {
      setPending(null);
    }
  }

  async function onPrepare() {
    const data = await post<Plan & { idempotent: boolean }>("prepare", base, { hostname });
    if (!data) return;
    setPlan(data);
    setFeedback("Domain prepared as pending. DNS, Vercel, and activation were not changed.");
    router.refresh();
  }

  async function onVerify(domainId: string) {
    const data = await post<{
      outcome: string;
      reason: string | null;
      observedTxt: string[] | null;
    }>(`verify:${domainId}`, `${base}/verify`, { domainId });
    if (!data) return;
    const observed =
      data.reason === "TXT_MISMATCH" && data.observedTxt && data.observedTxt.length > 0
        ? ` Published TXT: ${data.observedTxt.join(" | ")}. It must match the saved token exactly, including 0 and O.`
        : "";
    setFeedback(
      data.outcome === "VERIFIED" || data.outcome === "ALREADY_VERIFIED"
        ? "Ownership verified. The domain is still pending."
        : `Ownership not verified${data.reason ? ` (${data.reason})` : ""}.${observed}`,
    );
    await load();
  }

  async function onReadiness(domainId: string) {
    const data = await post<Readiness>(`readiness:${domainId}`, `${base}/readiness`, { domainId });
    if (!data) return;
    setReadiness((current) => ({ ...current, [domainId]: data }));
    setFeedback(
      data.vercel.tlsReady
        ? "Certificate is ready. The domain stays pending until you activate it."
        : "Certificate is not ready. The domain stays pending.",
    );
  }

  async function onAttach(domainId: string) {
    const data = await post<{ status: string }>(`attach:${domainId}`, `${base}/attach`, {
      domainId,
      confirmation: ATTACH_CUSTOM_DOMAIN_CONFIRMATION,
    });
    if (!data) return;
    setFeedback("Domain attached to the shared Vercel project. It is still pending and DNS was not edited.");
    await load();
  }

  async function onActivate(domainId: string) {
    const data = await post<{ outcome: string; message?: string }>(
      `activate:${domainId}`,
      `${base}/activate`,
      { domainId, confirmation: ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION },
    );
    if (!data) return;
    setFeedback(
      data.outcome === "ACTIVATED"
        ? "Custom domain activated for this workspace. The platform hostname is unchanged."
        : data.message ?? "Activation did not complete.",
    );
    await load();
    router.refresh();
  }

  const records = plan?.records ?? [];

  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827]">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Custom domain</h2>
        <p className="mt-1 text-xs text-slate-500">
          Prepare a customer domain for this workspace without signing in as the owner.
          The existing platform hostname stays live. Nothing here changes nameservers,
          email DNS, invitations, or payments.
        </p>
      </div>
      <div className="space-y-4 p-4">
        {plan?.platformHostname ? (
          <p className="text-sm text-slate-300">
            Platform hostname <span className="font-medium text-slate-100">{plan.platformHostname}</span> stays active.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <input
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="highoctaneniagara.ca"
            className="min-w-64 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            aria-label="Custom domain"
          />
          <button
            type="button"
            disabled={pending != null || hostname.trim().length === 0}
            onClick={() => void onPrepare()}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "prepare" ? "Preparing…" : "Prepare domain"}
          </button>
          <button
            type="button"
            disabled={pending != null}
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            Show saved DNS instructions
          </button>
        </div>
        {plan == null && existingHostnames.length > 0 ? (
          <ul className="space-y-1 text-xs text-slate-400">
            {existingHostnames.map((domain) => (
              <li key={`${domain.kind}-${domain.hostname}`}>
                {domain.hostname} · {domain.kind} · {domain.status}
              </li>
            ))}
          </ul>
        ) : null}
        {feedback ? <p className="text-sm text-emerald-200">{feedback}</p> : null}
        {error ? <p className="text-sm text-red-200">{error}</p> : null}
        {plan?.constraints?.length ? (
          <ul className="space-y-1 text-xs text-slate-400">
            {plan.constraints.map((constraint) => (
              <li key={constraint}>{constraint}</li>
            ))}
          </ul>
        ) : null}
        {records.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Host</th>
                  <th className="py-1 pr-3">Value</th>
                  <th className="py-1">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={`${record.purpose}-${record.type}-${record.host}-${record.value}`}>
                    <td className="py-1 pr-3">{record.type}</td>
                    <td className="py-1 pr-3">{record.host}</td>
                    <td className="max-w-md break-all py-1 pr-3 font-mono">{record.value}</td>
                    <td className="py-1">{record.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              At the DNS host, the apex name may be entered as @. Add both A records. Do not replace MX.
            </p>
          </div>
        ) : null}
        <div className="space-y-3">
          {(plan?.domains ?? []).map((domain) => {
            const check = readiness[domain.id];
            const verified = Boolean(domain.verifiedAt);
            return (
              <div key={domain.id} className="rounded-lg border border-slate-800 px-3 py-3">
                <p className="text-sm text-slate-100">
                  {domain.hostname}{" "}
                  <span className="text-xs uppercase text-slate-500">
                    {domain.status} · {domain.role}
                  </span>
                </p>
                {domain.ownershipValue ? (
                  <p className="mt-1 break-all font-mono text-xs text-slate-300">
                    {domain.ownershipHost} = {domain.ownershipValue}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  {verified ? "Ownership verified." : "Ownership not verified."}{" "}
                  {check
                    ? `Vercel ${check.vercel.reason ?? "unknown"}. Routing ${
                        check.routing.live ? "live" : "not live"
                      }.`
                    : "Certificate not checked."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending != null || domain.status !== "PENDING"}
                    onClick={() => void onVerify(domain.id)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-60"
                  >
                    Check ownership
                  </button>
                  <button
                    type="button"
                    disabled={pending != null || !verified || domain.status !== "PENDING"}
                    onClick={() => void onAttach(domain.id)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-60"
                  >
                    Attach to Vercel
                  </button>
                  <button
                    type="button"
                    disabled={pending != null}
                    onClick={() => void onReadiness(domain.id)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-60"
                  >
                    Check certificate
                  </button>
                  <button
                    type="button"
                    disabled={pending != null || domain.status !== "PENDING" || !check?.vercel.tlsReady}
                    onClick={() => void onActivate(domain.id)}
                    className="rounded-lg border border-amber-800/70 px-3 py-1.5 text-xs text-amber-100 disabled:opacity-60"
                  >
                    Activate domain
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
