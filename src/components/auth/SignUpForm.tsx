"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { reportGa4SignUp } from "@/lib/ads/ga4-sign-up";
import {
  buildCaptureContext,
  loadPersistedClickIds,
  persistClickIds,
  readClickIdsFromSearchParams,
} from "@/lib/auth/capture-attribution";
import {
  loadBrowseSearchUrl,
  searchFiltersFromSearchUrl,
} from "@/lib/auth/browse-search-context";
import { reportLeadCaptured, reportLeadCaptureStarted } from "@/lib/auth/funnel-analytics";
import type { CaptureIntentType } from "@/lib/auth/capture-intent";
import { peekPendingIntent } from "@/lib/auth/capture-intent";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXISTING_ACCOUNT_SIGN_IN_MESSAGE } from "@/lib/auth/existing-account-message";
import { rememberLoginCredentials } from "@/lib/auth/remembered-login";
import { authSuccessReturnPath } from "@/lib/auth/safe-callback-url";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";
import { offerBiometricsAfterCredentialsSignIn } from "@/lib/mobile/offer-biometrics-opt-in";
import { cn } from "@/lib/utils";

export type SignUpSuccessResult = {
  needsQualification: boolean;
};

function readVisitorKeys(): { visitorKey: string | null; sessionKey: string | null } {
  if (typeof window === "undefined") {
    return { visitorKey: null, sessionKey: null };
  }
  try {
    return {
      visitorKey: localStorage.getItem("houzzat:visitorKey"),
      sessionKey: sessionStorage.getItem("houzzat:sessionKey"),
    };
  } catch {
    return { visitorKey: null, sessionKey: null };
  }
}

function resolveSearchUrl(): string | null {
  if (typeof window === "undefined") return null;
  const browsed = loadBrowseSearchUrl();
  if (browsed) return browsed;
  try {
    const ref = document.referrer;
    if (ref && /\/search/.test(ref)) return ref.slice(0, 800);
    if (window.location.pathname.startsWith("/search")) {
      return window.location.href.slice(0, 800);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function resolveSearchFilters(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const fromBrowse = searchFiltersFromSearchUrl(loadBrowseSearchUrl());
  if (fromBrowse) return fromBrowse;
  try {
    const fromReferrer = searchFiltersFromSearchUrl(document.referrer);
    if (fromReferrer) return fromReferrer;
    if (window.location.pathname.startsWith("/search")) {
      return searchFiltersFromSearchUrl(window.location.href);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function SignUpForm({
  callbackUrl = null,
  displayName = "your team",
  initialName = "",
  initialEmail = "",
  intent = null,
  ctaLabel = "Continue",
  compact = false,
  onIdentityChange,
  onSuccess,
  onSwitchMode,
  onExistingAccount,
  afterConsent = null,
}: {
  callbackUrl?: string | null;
  displayName?: string;
  initialName?: string;
  initialEmail?: string;
  intent?: CaptureIntentType | null;
  ctaLabel?: string;
  /** Tighter vertical rhythm for mobile listing-access capture. */
  compact?: boolean;
  onIdentityChange?: (next: { name: string; email: string }) => void;
  onSuccess?: (result: SignUpSuccessResult) => void;
  onSwitchMode?: () => void;
  onExistingAccount?: (email: string) => void;
  afterConsent?: ReactNode;
}) {
  const router = useRouter();
  const { confirm } = useSiteAlert();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const startedRef = useRef(false);

  if (!startedRef.current) {
    startedRef.current = true;
    reportLeadCaptureStarted();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setPending(false);
      setError("Enter your full name.");
      return;
    }
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setPending(false);
      setError("Enter a valid email address.");
      return;
    }
    if (!trimmedPhone) {
      setPending(false);
      setError("Enter your mobile number.");
      return;
    }

    try {
      persistClickIds(readClickIdsFromSearchParams(new URLSearchParams(window.location.search)));
    } catch {
      /* ignore */
    }
    const clickIds = loadPersistedClickIds();
    const utm = loadPersistedUtm();
    const { visitorKey, sessionKey } = readVisitorKeys();
    const peeked = peekPendingIntent(browserCaptureIntentStore(), {
      host: window.location.hostname,
      now: Date.now(),
    });
    const pendingIntent = peeked.ok ? peeked.intent : null;
    const captureIntent = intent ?? pendingIntent?.type ?? null;
    const mlsNumber =
      pendingIntent && "mlsNumber" in pendingIntent
        ? pendingIntent.mlsNumber
        : null;

    const captureContext = buildCaptureContext({
      intent: captureIntent,
      mlsNumber,
      pathname: window.location.pathname,
      callbackUrl: callbackUrl ?? pendingIntent?.callbackPath ?? null,
      searchUrl: resolveSearchUrl(),
      searchFilters: resolveSearchFilters(),
      visitorKey,
      sessionKey,
      utmSource: utm.utmSource ?? null,
      utmMedium: utm.utmMedium ?? null,
      utmCampaign: utm.utmCampaign ?? null,
      utmContent: utm.utmContent ?? null,
      referrer: typeof document !== "undefined" ? document.referrer : null,
      gclid: clickIds.gclid ?? null,
      gbraid: clickIds.gbraid ?? null,
      wbraid: clickIds.wbraid ?? null,
    });

    let response: Response;
    try {
      response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: normalizedEmail,
          phone: trimmedPhone,
          acceptTerms: true,
          credentialMode: "phone_e164",
          captureContext,
          ...utm,
          ...clickIds,
        }),
      });
    } catch {
      setPending(false);
      setError("Could not reach Houzzat. Check your connection and try again.");
      return;
    }

    let data: { error?: string; needsQualification?: boolean } = {};
    try {
      const raw = await response.text();
      data = raw
        ? (JSON.parse(raw) as {
            error?: string;
            needsQualification?: boolean;
          })
        : {};
    } catch {
      setPending(false);
      if (response.status === 409) {
        if (onExistingAccount) {
          onExistingAccount(normalizedEmail);
          return;
        }
        setError(EXISTING_ACCOUNT_SIGN_IN_MESSAGE);
        return;
      }
      setError("Something went wrong. Please try again.");
      return;
    }

    if (!response.ok) {
      setPending(false);
      if (response.status === 409) {
        if (onExistingAccount) {
          onExistingAccount(normalizedEmail);
          return;
        }
        setError(data.error ?? EXISTING_ACCOUNT_SIGN_IN_MESSAGE);
        return;
      }
      if (response.status === 400) {
        setError(data.error ?? "Please check your name, email, and mobile number.");
        return;
      }
      if (response.status === 403) {
        setError(
          data.error ??
            "This account cannot be created. Contact Houzzat support.",
        );
        return;
      }
      setError(
        data.error ??
          "We couldn't create your account right now. Please try again.",
      );
      return;
    }

    // Paid conversion boundary: User + Lead persisted — fire once.
    reportGa4SignUp();
    reportLeadCaptured();

    await rememberLoginCredentials({
      email: normalizedEmail,
      password: trimmedPhone,
    });

    const result = await signIn("credentials", {
      email: normalizedEmail,
      password: trimmedPhone,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      onSwitchMode?.();
      setError(
        "Account created — please sign in with your email and mobile number.",
      );
      return;
    }

    const session = await getSession();
    await clearIntentionalSignOut({ userId: session?.user?.id });
    await offerBiometricsAfterCredentialsSignIn({
      email: normalizedEmail,
      password: trimmedPhone,
      confirm,
      userId: session?.user?.id,
    });

    const needsQualification = data.needsQualification !== false;
    onSuccess?.({ needsQualification });

    if (needsQualification) {
      window.dispatchEvent(new Event("houzzat:lead-captured"));
      router.refresh();
      return;
    }

    const dest = authSuccessReturnPath(callbackUrl);
    if (dest && dest !== window.location.pathname) {
      router.push(dest);
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(compact ? "space-y-2.5" : "space-y-3.5")}
      autoComplete="on"
      name="houzzat-signup"
    >
      <div className={cn(compact ? "space-y-1" : "space-y-1.5")}>
        <label className="text-sm font-medium" htmlFor="auth-signup-name">
          Full Name
        </label>
        <Input
          id="auth-signup-name"
          name="name"
          autoComplete="name"
          required
          className={compact ? "h-10" : undefined}
          value={name}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            onIdentityChange?.({ name: next, email });
          }}
        />
      </div>
      <div className={cn(compact ? "space-y-1" : "space-y-1.5")}>
        <label className="text-sm font-medium" htmlFor="auth-signup-email">
          Email
        </label>
        <Input
          id="auth-signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={compact ? "h-10" : undefined}
          value={email}
          onChange={(event) => {
            const next = event.target.value;
            setEmail(next);
            onIdentityChange?.({ name, email: next });
          }}
        />
      </div>
      <div className={cn(compact ? "space-y-1" : "space-y-1.5")}>
        <label className="text-sm font-medium" htmlFor="auth-signup-phone">
          Phone
          <span className="ml-1 font-normal text-ink/50">
            (also used as your password)
          </span>
        </label>
        <Input
          id="auth-signup-phone"
          name="tel"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          placeholder="(647) 555-1234"
          className={compact ? "h-10" : undefined}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button
        type="submit"
        className={cn("w-full", compact && "h-11")}
        disabled={pending}
        ref={submitRef}
      >
        {pending ? "Continuing…" : `${ctaLabel} →`}
      </Button>
      <p
        className={cn(
          "text-center leading-snug text-ink/50",
          compact ? "text-[10px]" : "text-[11px] leading-relaxed",
        )}
      >
        By continuing you agree to our{" "}
        <Link
          href="/terms"
          className="underline underline-offset-2 hover:text-ink/70"
        >
          Terms
        </Link>
        ,{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-ink/70"
        >
          Privacy Policy
        </Link>
        , PropTx / VOW client agreement, and to receive email alerts and phone
        contact from {displayName} about your home search.
      </p>
      {afterConsent}
      {onSwitchMode ? (
        <p className="text-center text-sm text-ink/60">
          Already registered?{" "}
          <button
            type="button"
            onClick={onSwitchMode}
            className="font-semibold text-canopy hover:underline"
          >
            Sign in
          </button>
        </p>
      ) : null}
    </form>
  );
}
