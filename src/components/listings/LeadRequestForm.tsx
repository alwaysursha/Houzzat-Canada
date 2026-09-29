"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { reportGa4LeadRequest } from "@/lib/ads/ga4-sign-up";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearLeadRequestContactPrefill,
  peekLeadRequestContactPrefill,
  rememberLeadRequestContactPrefill,
} from "@/lib/auth/lead-request-contact-prefill";
import { openGuestLeadRequestIntent } from "@/lib/auth/lead-request-intent";

type Kind = "inquiry" | "showing" | "virtual_viewing";

export function LeadRequestForm({
  mlsNumber,
  kind,
  callbackPath,
  defaults,
}: {
  mlsNumber: string;
  kind: Kind;
  /** Listing path the auth modal returns to. */
  callbackPath?: string;
  defaults?: {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
    focusNotes?: string;
  };
}) {
  const tenantName = useTenantDisplayName("Houzzat");
  const { status } = useSession();
  const { openAuth } = useAuthModal();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [message, setMessage] = useState(defaults?.message ?? "");
  const [focusNotes, setFocusNotes] = useState(defaults?.focusNotes ?? "");
  const [contactConsent, setContactConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn =
    status === "authenticated" ||
    (status === "loading" && Boolean(defaults?.email?.trim()));
  const name = signedIn
    ? (defaults?.name ?? "")
    : (nameDraft ?? defaults?.name ?? "");
  const email = signedIn
    ? (defaults?.email ?? "")
    : (emailDraft ?? defaults?.email ?? "");
  const phone = signedIn
    ? (defaults?.phone?.trim() ?? "")
    : (phoneDraft ?? defaults?.phone ?? "");

  useEffect(() => {
    if (status === "authenticated") {
      clearLeadRequestContactPrefill();
      return;
    }
    if (status !== "unauthenticated") return;
    if (phoneDraft !== null) return;
    const retained = peekLeadRequestContactPrefill(mlsNumber, kind);
    if (retained) setPhoneDraft(retained);
  }, [kind, mlsNumber, phoneDraft, status]);

  const isVirtual = kind === "virtual_viewing";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status !== "authenticated") {
      if (status === "loading") return;
      const trimmedPhone = phone.trim();
      rememberLeadRequestContactPrefill(
        trimmedPhone ? { mlsNumber, kind, phone: trimmedPhone } : null,
      );
      openGuestLeadRequestIntent({
        type: kind === "inquiry" ? "CONTACT_AGENT" : "REQUEST_VIEWING",
        kind,
        mlsNumber,
        callbackPath: callbackPath ?? `/listing/${mlsNumber}`,
        message,
        focusNotes: kind === "virtual_viewing" ? focusNotes : null,
        host: window.location.hostname,
        now: Date.now(),
        store: browserCaptureIntentStore(),
        openAuth,
        mode: "sign-up",
        signupPrefill: {
          name: name.trim(),
          email: email.trim(),
        },
      });
      return;
    }
    if (!contactConsent) {
      setError(`Please confirm you agree to be contacted by a ${tenantName} agent.`);
      return;
    }

    setPending(true);
    setError(null);

    const res = await fetch("/api/leads", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mlsNumber,
        kind,
        message: message || undefined,
        focusNotes: focusNotes || undefined,
        contactConsent: true,
        ...loadPersistedUtm(),
      }),
    });

    const data = (await res.json()) as { error?: string };
    setPending(false);

    if (!res.ok) {
      setError(data.error ?? "Could not submit.");
      return;
    }

    reportGa4LeadRequest(kind);
    clearLeadRequestContactPrefill();
    setDone(true);
  }

  if (done) {
    const label = isVirtual
      ? "Virtual Viewing request"
      : kind === "showing"
        ? "showing request"
        : "inquiry";
    return (
      <p className="rounded-xl border border-canopy/30 bg-canopy/5 px-4 py-3 text-sm text-canopy-deep">
        Thanks — your {label} was sent. An agent will follow up shortly
        {isVirtual ? " to schedule the live walkthrough" : ""}.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {isVirtual ? (
        <p className="rounded-lg bg-signal/10 px-3 py-2 text-xs text-ink/70">
          An agent goes to the property and walks you through live on video —
          {tenantName}&apos;s Virtual Viewing.
        </p>
      ) : null}
      {signedIn ? (
        <div className="rounded-lg border border-line bg-mist/40 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
            Requesting as
          </p>
          <div className="mt-1 space-y-0.5 text-sm text-ink">
            {name ? <p className="font-medium">{name}</p> : null}
            {email ? <p className="text-ink/70">{email}</p> : null}
            {phone ? <p className="text-ink/70">{phone}</p> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              required
              placeholder="Full name"
              value={name}
              onChange={(e) => setNameDraft(e.target.value)}
              autoComplete="name"
            />
            <Input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmailDraft(e.target.value)}
              autoComplete="email"
            />
          </div>
          <Input
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhoneDraft(e.target.value)}
            autoComplete="tel"
          />
        </>
      )}
      {isVirtual ? (
        <Input
          placeholder="What should we focus on? (basement, light, parking…)"
          value={focusNotes}
          onChange={(e) => setFocusNotes(e.target.value)}
        />
      ) : null}
      <textarea
        className="min-h-24 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        placeholder={
          isVirtual
            ? "Anything else before your Virtual Viewing?"
            : kind === "showing"
              ? "Anything we should know before the showing?"
              : "Ask a question about this home"
        }
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-mist/40 px-3 py-2.5 text-sm text-ink/80">
        <input
          type="checkbox"
          required
          checked={contactConsent}
          onChange={(e) => {
            setContactConsent(e.target.checked);
            if (e.target.checked) setError(null);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-canopy"
        />
        <span>
          I agree to be contacted by a {tenantName} agent about this request by
          phone, email, or text. I can unsubscribe anytime.
        </span>
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Sending…"
          : isVirtual
            ? "Request Virtual Viewing"
            : kind === "showing"
              ? "Request in-person showing"
              : "Send inquiry"}
      </Button>
    </form>
  );
}
