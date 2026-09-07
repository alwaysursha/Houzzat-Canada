"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

type DnsInstructions = {
  purpose: "ownership_verification";
  verified: false;
  live: false;
  recordType: "TXT";
  host: string;
  value: string;
  summary: string;
};

type WebsiteDomain = {
  id: string;
  hostname: string;
  kind: "PLATFORM" | "CUSTOM";
  role: "PRIMARY" | "ALIAS";
  status: "PENDING" | "ACTIVE" | "DISABLED";
  verifiedAt: string | null;
  dnsInstructions: DnsInstructions | null;
};

type VerifyOutcome =
  | "VERIFIED"
  | "ALREADY_VERIFIED"
  | "NOT_VERIFIED"
  | "DNS_RETRYABLE_ERROR";

type WebsiteDomainSectionProps = {
  workspaceId: string;
};

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stage 6.11F.1 / F.2A — Custom Website Domain claim + ownership TXT verify.
 * Ownership verification does not connect or activate the website.
 */
export function WebsiteDomainSection({
  workspaceId,
}: WebsiteDomainSectionProps) {
  const [domains, setDomains] = useState<WebsiteDomain[]>([]);
  const [hostnameInput, setHostnameInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/onboarding/website-domains?workspaceId=${encodeURIComponent(workspaceId)}`,
        { method: "GET", credentials: "same-origin" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { domains?: WebsiteDomain[] };
        message?: string;
      };
      if (!res.ok || !json.ok || !json.data?.domains) {
        throw new Error(json.message ?? "Unable to load website domains");
      }
      setDomains(json.data.domains);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load website domains");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // Initial fetch for host-bound OWNER domains (same pattern as TeamRosterSection).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount load
    void load();
  }, [load]);

  const platformDomains = domains.filter((d) => d.kind === "PLATFORM");
  const pendingCustom = domains.find(
    (d) => d.kind === "CUSTOM" && d.status === "PENDING",
  );
  const activeCustom = domains.filter(
    (d) => d.kind === "CUSTOM" && d.status === "ACTIVE",
  );
  const ownershipVerified = Boolean(pendingCustom?.verifiedAt);

  async function onClaim(e: FormEvent) {
    e.preventDefault();
    if (busy || verifying) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/onboarding/website-domains", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, hostname: hostnameInput }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { domain?: WebsiteDomain; idempotent?: boolean };
        message?: string;
      };
      if (!res.ok || !json.ok || !json.data?.domain) {
        throw new Error(json.message ?? "Unable to claim website domain");
      }
      setHostnameInput("");
      setMessage(
        json.data.idempotent
          ? "Existing pending claim loaded. Domain is not connected yet."
          : "Pending claim created. Add the TXT record below — ownership is not verified yet, and the website is not connected.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyOwnership(domainId: string) {
    if (busy || verifying) return;
    setVerifying(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/onboarding/website-domains/${encodeURIComponent(domainId)}/verify`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: {
          outcome?: VerifyOutcome;
          domain?: WebsiteDomain;
          reason?: string;
        };
        message?: string;
        code?: string;
      };
      if (!res.ok || !json.ok || !json.data?.outcome) {
        throw new Error(json.message ?? "Unable to verify ownership");
      }

      const outcome = json.data.outcome;
      if (json.data.domain) {
        setDomains((prev) =>
          prev.map((d) => (d.id === json.data!.domain!.id ? json.data!.domain! : d)),
        );
      }

      if (outcome === "VERIFIED" || outcome === "ALREADY_VERIFIED") {
        setMessage(
          "Ownership verified. Website connection is not live yet — activation comes later.",
        );
        await load();
        return;
      }
      if (outcome === "NOT_VERIFIED") {
        setError(
          "We couldn't find the verification record yet. DNS changes can take some time to appear.",
        );
        return;
      }
      if (outcome === "DNS_RETRYABLE_ERROR") {
        setError(
          json.data.reason === "DNS_TIMEOUT"
            ? "DNS lookup timed out. Please try again shortly."
            : "DNS lookup failed temporarily. Please try again shortly.",
        );
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setVerifying(false);
    }
  }

  async function onRemovePending(domainId: string) {
    if (busy || verifying) return;
    if (
      !window.confirm(
        "Remove this pending website domain claim? DNS records are not changed.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/onboarding/website-domains/${encodeURIComponent(domainId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? "Unable to remove pending claim");
      }
      setMessage("Pending claim removed. Platform hostname remains active.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy(key: string, value: string) {
    const ok = await copyText(value);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-medium text-slate-900">
          Custom Website Domain
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Claim a customer hostname and prove ownership with a TXT record. This
          is separate from email sending domains. Ownership verification does
          not make the site live.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading domains…</p>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-900">
              Platform website hostname
            </h3>
            {platformDomains.length === 0 ? (
              <p className="text-sm text-slate-500">
                No platform hostname on this workspace yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {platformDomains.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  >
                    <span className="font-medium">{d.hostname}</span>
                    <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {d.status === "ACTIVE" ? "Active" : d.status}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      Remains the live tenant hostname until a custom domain is
                      connected in a later step.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {activeCustom.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-900">
                Active custom website domains
              </h3>
              <ul className="space-y-2">
                {activeCustom.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  >
                    <span className="font-medium">{d.hostname}</span>
                    <span className="ml-2 text-xs uppercase text-slate-500">
                      {d.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {pendingCustom ? (
            <div
              className={
                ownershipVerified
                  ? "space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"
                  : "space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4"
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-slate-900">
                    {ownershipVerified
                      ? "Pending claim — ownership verified"
                      : "Pending claim — ownership not verified"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-800">
                    <span className="font-medium">{pendingCustom.hostname}</span>
                    <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                      PENDING
                    </span>
                  </p>
                  {ownershipVerified ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      <li>✓ Domain ownership verified</li>
                      <li>○ Website not connected yet</li>
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-600">
                      Ownership not verified. Website is not connected. DNS
                      changes may take time to propagate.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!ownershipVerified ? (
                    <button
                      type="button"
                      disabled={busy || verifying}
                      onClick={() => void onVerifyOwnership(pendingCustom.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      style={{ backgroundColor: "var(--canopy, #0F6B4C)" }}
                    >
                      {verifying ? "Checking DNS…" : "Verify DNS"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || verifying}
                    onClick={() => void onRemovePending(pendingCustom.id)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-60"
                  >
                    Remove pending claim
                  </button>
                </div>
              </div>

              {pendingCustom.dnsInstructions ? (
                <div
                  className={
                    ownershipVerified
                      ? "space-y-3 border-t border-emerald-200/80 pt-3"
                      : "space-y-3 border-t border-amber-200/80 pt-3"
                  }
                >
                  <p className="text-xs text-slate-700">
                    {ownershipVerified
                      ? "TXT challenge (kept for reference). Ownership is verified; website connection is still pending."
                      : pendingCustom.dnsInstructions.summary}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        TXT host
                      </p>
                      <div className="mt-1 flex items-start gap-2">
                        <code className="block flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-slate-800">
                          {pendingCustom.dnsInstructions.host}
                        </code>
                        <button
                          type="button"
                          className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                          onClick={() =>
                            void onCopy(
                              "host",
                              pendingCustom.dnsInstructions!.host,
                            )
                          }
                        >
                          {copiedKey === "host" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        TXT value
                      </p>
                      <div className="mt-1 flex items-start gap-2">
                        <code className="block flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-slate-800">
                          {pendingCustom.dnsInstructions.value}
                        </code>
                        <button
                          type="button"
                          className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                          onClick={() =>
                            void onCopy(
                              "value",
                              pendingCustom.dnsInstructions!.value,
                            )
                          }
                        >
                          {copiedKey === "value" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <form onSubmit={(e) => void onClaim(e)} className="space-y-3">
              <h3 className="text-sm font-medium text-slate-900">
                Claim a custom website hostname
              </h3>
              <p className="text-xs text-slate-500">
                Enter something like{" "}
                <span className="font-mono">example.com</span>. We will create a
                pending claim and show TXT ownership instructions.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={hostnameInput}
                  onChange={(e) => setHostnameInput(e.target.value)}
                  placeholder="example.com"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy || verifying}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:opacity-60 sm:max-w-md"
                />
                <button
                  type="submit"
                  disabled={busy || verifying || !hostnameInput.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: "var(--canopy, #0F6B4C)" }}
                >
                  {busy ? "Claiming…" : "Claim hostname"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
