"use client";

import { useState } from "react";
import { prepareSendingDomain } from "@/lib/email/custom-sending-policy";

type DnsRecord = {
  type: string;
  host: string;
  value: string;
  priority: number | null;
  purpose: string;
};

type CustomSending = {
  sendingDomain: string | null;
  returnPathHost: string | null;
  senderDisplayName: string | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  domainStatus: string;
  customSendingEnabled: boolean;
  records: DnsRecord[];
  constraints: string[];
  providerConfigured: boolean;
  activeFrom: string | null;
};

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export function PlatformCustomSending({ workspaceId }: { workspaceId: string }) {
  const [sendingDomain, setSendingDomain] = useState("");
  const [returnPathHost, setReturnPathHost] = useState("");
  const [senderDisplayName, setSenderDisplayName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [testTo, setTestTo] = useState("");
  const [view, setView] = useState<CustomSending | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}/custom-sending`;

  function apply(data: CustomSending) {
    setView(data);
    setSendingDomain(data.sendingDomain ?? "");
    setReturnPathHost(data.returnPathHost ?? "");
    setSenderDisplayName(data.senderDisplayName ?? "");
    setFromEmail(data.fromEmail ?? "");
    setReplyToEmail(data.replyToEmail ?? "");
  }

  async function load() {
    setPending("load");
    setError(null);
    try {
      const response = await fetch(base, { headers: { Accept: "application/json" } });
      const body = (await response.json()) as ApiEnvelope<CustomSending>;
      if (!response.ok || !body.ok) {
        setError(body.ok === false ? body.message : "Custom sending could not be loaded.");
        return;
      }
      apply(body.data);
    } catch {
      setError("Network error.");
    } finally {
      setPending(null);
    }
  }

  async function post(action: string, payload: Record<string, string>) {
    setPending(action);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = (await response.json()) as ApiEnvelope<CustomSending & { from?: string }>;
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

  const requirement = (() => {
    if (!sendingDomain.trim() || !fromEmail.trim() || !returnPathHost.trim()) return null;
    try {
      prepareSendingDomain({
        sendingDomain,
        returnPathHost,
        senderDisplayName: senderDisplayName || "Sender",
        fromEmail,
        replyToEmail: replyToEmail || "reply@example.com",
      });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : null;
    }
  })();

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-100">Custom sending</h2>
        <p className="mt-1 text-xs text-slate-400">
          Verify the domain of the From address. The return-path subdomain is added beside the
          existing mailbox records. Sending stays on the HouzzatPRO sender until you enable it.
        </p>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-400">
            Sending domain
            <input
              value={sendingDomain}
              onChange={(event) => setSendingDomain(event.target.value)}
              placeholder="example.com"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Return-path host
            <input
              value={returnPathHost}
              onChange={(event) => setReturnPathHost(event.target.value)}
              placeholder="send.example.com"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Sender name
            <input
              value={senderDisplayName}
              onChange={(event) => setSenderDisplayName(event.target.value)}
              placeholder="Brokerage name"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            From email
            <input
              value={fromEmail}
              onChange={(event) => setFromEmail(event.target.value)}
              placeholder="alerts@example.com"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Reply-To
            <input
              value={replyToEmail}
              onChange={(event) => setReplyToEmail(event.target.value)}
              placeholder="agent@example.com"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>
        {requirement ? <p className="text-sm text-amber-200">{requirement}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending != null}
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "load" ? "Loading…" : "Show saved sending"}
          </button>
          <button
            type="button"
            disabled={pending != null}
            onClick={() =>
              void post("prepare", {
                sendingDomain,
                returnPathHost,
                senderDisplayName,
                fromEmail,
                replyToEmail,
              }).then((data) => {
                if (!data) return;
                apply(data);
                setFeedback("Sending domain saved. Custom sending is not enabled.");
              })
            }
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "prepare" ? "Saving…" : "Save sending domain"}
          </button>
          <button
            type="button"
            disabled={pending != null}
            onClick={() =>
              void post("check", {}).then((data) => {
                if (!data) return;
                apply(data);
                setFeedback(
                  data.domainStatus === "VERIFIED"
                    ? "The sending domain is verified. Custom sending stays off until you enable it."
                    : `Verification status: ${data.domainStatus}. Custom sending stays off.`,
                );
              })
            }
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "check" ? "Checking…" : "Check verification"}
          </button>
          <button
            type="button"
            disabled={pending != null || view?.domainStatus !== "VERIFIED"}
            onClick={() =>
              void post("enable", {}).then((data) => {
                if (!data) return;
                apply(data);
                setFeedback("Custom sending is enabled for this workspace.");
              })
            }
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "enable" ? "Enabling…" : "Enable custom sending"}
          </button>
          <button
            type="button"
            disabled={pending != null || !view?.customSendingEnabled}
            onClick={() =>
              void post("disable", {}).then((data) => {
                if (!data) return;
                apply(data);
                setFeedback("Custom sending is off. The HouzzatPRO sender is in use.");
              })
            }
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            Turn off
          </button>
        </div>
        {view ? (
          <p className="text-sm text-slate-300">
            Status {view.domainStatus}.{" "}
            {view.activeFrom
              ? `Production From is ${view.activeFrom}.`
              : "Production mail still uses the HouzzatPRO sender."}{" "}
            {view.providerConfigured
              ? "The email provider key is available."
              : "The email provider key is not configured."}
          </p>
        ) : null}
        {view?.constraints.length ? (
          <ul className="space-y-1 text-xs text-slate-400">
            {view.constraints.map((constraint) => (
              <li key={constraint}>{constraint}</li>
            ))}
          </ul>
        ) : null}
        {view && view.records.length > 0 ? (
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
                {view.records.map((record) => (
                  <tr key={`${record.purpose}-${record.type}-${record.host}`}>
                    <td className="py-1 pr-3">{record.type}</td>
                    <td className="py-1 pr-3 font-mono">{record.host}</td>
                    <td className="max-w-md break-all py-1 pr-3 font-mono">
                      {record.priority != null ? `${record.priority} ` : ""}
                      {record.value}
                    </td>
                    <td className="py-1">{record.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Add these records. Do not change the existing mailbox MX, SPF, DKIM, or DMARC.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            DNS records appear after the sending domain is saved. The provider issues a unique
            value for each domain, so the records are not guessed in advance.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            value={testTo}
            onChange={(event) => setTestTo(event.target.value)}
            placeholder="test recipient"
            aria-label="Test recipient"
            className="min-w-64 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <button
            type="button"
            disabled={pending != null || view?.domainStatus !== "VERIFIED" || testTo.trim().length === 0}
            onClick={() =>
              void post("test", { to: testTo }).then((data) => {
                if (!data) return;
                setFeedback("Test email accepted. This did not enable custom sending.");
              })
            }
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "test" ? "Sending…" : "Send test email"}
          </button>
        </div>
        {feedback ? <p className="text-sm text-emerald-200">{feedback}</p> : null}
        {error ? <p className="text-sm text-red-200">{error}</p> : null}
      </div>
    </section>
  );
}
