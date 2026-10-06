"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { authModalCopy } from "@/components/auth/auth-modal-copy";
import { LeadCaptureFunnel } from "@/components/auth/lead-funnel/LeadCaptureFunnel";
import { TourThisHomePrompt } from "@/components/auth/lead-funnel/TourThisHomePrompt";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { TenantHeaderBrand } from "@/components/tenancy/TenantHeaderBrand";
import {
  getPresentedTenantBrand,
  getPresentedTenantBrandServerSnapshot,
  subscribePresentedTenantBrand,
} from "@/components/tenancy/presented-tenant-brand";
import { EXISTING_ACCOUNT_SIGN_IN_MESSAGE } from "@/lib/auth/existing-account-message";
import type { CaptureIntentType } from "@/lib/auth/capture-intent";
import { hadClientSession } from "@/lib/auth/remembered-login";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { cn } from "@/lib/utils";

export type AuthMode = "sign-in" | "sign-up";

export type AuthSignupPrefill = {
  name: string;
  email: string;
};

type OpenAuthOptions = {
  mode?: AuthMode;
  callbackUrl?: string | null;
  /** Presentation only. Never sent to signup or credentials APIs. */
  intent?: CaptureIntentType | null;
  /** Signup form convenience only. Never stored and never sent as identity. */
  signupPrefill?: AuthSignupPrefill | null;
};

type AuthModalContextValue = {
  open: boolean;
  mode: AuthMode;
  callbackUrl: string | null;
  intent: CaptureIntentType | null;
  signupPrefill: AuthSignupPrefill | null;
  openAuth: (options?: OpenAuthOptions) => void;
  closeAuth: () => void;
  setMode: (mode: AuthMode) => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error("useAuthModal must be used within AuthModalProvider");
  }
  return ctx;
}

function AuthModalTabs({
  mode,
  signInLabel,
  onMode,
}: {
  mode: AuthMode;
  signInLabel: string;
  onMode: (mode: AuthMode) => void;
}) {
  return (
    <div
      className="grid min-w-0 flex-1 grid-cols-2 rounded-xl bg-mist p-1"
      role="tablist"
      aria-label="Account"
    >
      {(
        [
          ["sign-in", signInLabel],
          ["sign-up", "Sign up"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onMode(value)}
          className={cn(
            "rounded-lg px-3 py-2.5 text-sm transition",
            mode === value
              ? "bg-surface font-semibold text-canopy shadow-sm ring-1 ring-canopy/20"
              : "font-medium text-ink/50 hover:text-ink/75",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type PanelPhase = "auth" | "funnel";

function AuthModalPanel({
  phase,
  onFunnelComplete,
}: {
  phase: PanelPhase;
  onFunnelComplete: (result: {
    showTour: boolean;
    mlsNumber: string | null;
  }) => void;
}) {
  const { open, mode, callbackUrl, intent, signupPrefill, closeAuth, setMode } =
    useAuthModal();
  const [loginAgain, setLoginAgain] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [appliedPrefillKey, setAppliedPrefillKey] = useState<string | null>(
    null,
  );
  const prefillKey = signupPrefill
    ? `${signupPrefill.name}\0${signupPrefill.email}`
    : "";
  if (open) {
    if (prefillKey !== appliedPrefillKey) {
      setAppliedPrefillKey(prefillKey);
      setSignupName(signupPrefill?.name ?? "");
      setSignupEmail(signupPrefill?.email ?? "");
      if (signupPrefill?.email) setPrefillEmail(signupPrefill.email);
    }
  } else if (appliedPrefillKey !== null) {
    setAppliedPrefillKey(null);
    setSignupName("");
    setSignupEmail("");
  }
  const brand = useSyncExternalStore(
    subscribePresentedTenantBrand,
    getPresentedTenantBrand,
    getPresentedTenantBrandServerSnapshot,
  );

  useEffect(() => {
    if (!open) {
      setPrefillEmail(null);
      setAuthNotice(null);
      return;
    }
    setLoginAgain(hadClientSession());
  }, [open]);

  if (!open) return null;

  const signInLabel = loginAgain ? "Login again" : "Sign in";
  const displayName = brand?.displayName?.trim() || "your team";
  const copy = intent ? authModalCopy(intent, mode, displayName) : null;
  const listingGate = intent === "VIEW_LISTING";
  const captureCompact = Boolean(intent);

  function selectMode(next: AuthMode) {
    if (next === "sign-up") setAuthNotice(null);
    if (next === "sign-in" && signupEmail.trim()) {
      setPrefillEmail(signupEmail.trim());
    }
    setMode(next);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-4 sm:px-4 sm:py-8">
      {listingGate || phase === "funnel" ? (
        <div className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" />
      ) : (
        <button
          type="button"
          className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
          aria-label="Close sign in"
          onClick={closeAuth}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl",
          captureCompact || phase === "funnel"
            ? "max-h-[min(85vh,calc(100dvh-1.5rem))]"
            : "max-h-[min(78vh,38rem)] max-w-md",
        )}
        style={
          captureCompact || phase === "funnel"
            ? {
                maxWidth: phase === "funnel" ? 400 : 440,
              }
            : undefined
        }
      >
        {phase === "funnel" ? (
          <>
            <h2 id="auth-modal-title" className="sr-only">
              Continue your registration
            </h2>
            <LeadCaptureFunnel onComplete={onFunnelComplete} />
          </>
        ) : copy ? (
          <>
            <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <TenantHeaderBrand
                  displayName={brand?.displayName?.trim() || ""}
                  logoUrl={brand?.logoUrl ?? null}
                  primaryColor={brand?.colors.primary}
                  showLogoMark={Boolean(brand && !brand.isHouzzatWorkspace)}
                />
                <h2
                  id="auth-modal-title"
                  className="mt-2 font-display text-lg leading-tight text-ink sm:text-xl"
                >
                  {copy.headline}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink/65">
                  {copy.subhead}
                </p>
              </div>
              {listingGate ? null : (
                <button
                  type="button"
                  onClick={closeAuth}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink/70 transition hover:bg-mist"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5 sm:px-5">
              <AuthModalTabs
                mode={mode}
                signInLabel={signInLabel}
                onMode={selectMode}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {mode === "sign-in" ? (
                <SignInForm
                  callbackUrl={callbackUrl}
                  initialEmail={prefillEmail}
                  notice={authNotice}
                  onSuccess={closeAuth}
                  onSwitchMode={() => setMode("sign-up")}
                />
              ) : (
                <SignUpForm
                  callbackUrl={callbackUrl}
                  displayName={displayName}
                  initialName={signupName}
                  initialEmail={signupEmail}
                  intent={intent}
                  ctaLabel={copy.cta}
                  onIdentityChange={(next) => {
                    setSignupName(next.name);
                    setSignupEmail(next.email);
                  }}
                  onSuccess={() => {
                    /* funnel phase handled by provider */
                  }}
                  onSwitchMode={() => {
                    if (signupEmail.trim()) setPrefillEmail(signupEmail.trim());
                    setMode("sign-in");
                  }}
                  onExistingAccount={(email) => {
                    setSignupEmail(email);
                    setPrefillEmail(email);
                    setAuthNotice(EXISTING_ACCOUNT_SIGN_IN_MESSAGE);
                    setMode("sign-in");
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <h2 id="auth-modal-title" className="sr-only">
              {mode === "sign-in" ? signInLabel : "Sign up"}
            </h2>
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <AuthModalTabs
                mode={mode}
                signInLabel={signInLabel}
                onMode={selectMode}
              />
              <button
                type="button"
                onClick={closeAuth}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink/70 transition hover:bg-mist"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {mode === "sign-in" ? (
                <SignInForm
                  callbackUrl={callbackUrl}
                  initialEmail={prefillEmail}
                  notice={authNotice}
                  onSuccess={closeAuth}
                  onSwitchMode={() => setMode("sign-up")}
                />
              ) : (
                <SignUpForm
                  callbackUrl={callbackUrl}
                  displayName={displayName}
                  initialName={signupName}
                  initialEmail={signupEmail}
                  intent={intent}
                  ctaLabel="Create Free Account"
                  onIdentityChange={(next) => {
                    setSignupName(next.name);
                    setSignupEmail(next.email);
                  }}
                  onSuccess={() => {
                    /* funnel handled by provider */
                  }}
                  onSwitchMode={() => {
                    if (signupEmail.trim()) setPrefillEmail(signupEmail.trim());
                    setMode("sign-in");
                  }}
                  onExistingAccount={(email) => {
                    setSignupEmail(email);
                    setPrefillEmail(email);
                    setAuthNotice(EXISTING_ACCOUNT_SIGN_IN_MESSAGE);
                    setMode("sign-in");
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [intent, setIntent] = useState<CaptureIntentType | null>(null);
  const [signupPrefill, setSignupPrefill] = useState<AuthSignupPrefill | null>(
    null,
  );
  const [phase, setPhase] = useState<PanelPhase>("auth");
  const [tourPrompt, setTourPrompt] = useState<{
    mlsNumber: string;
  } | null>(null);

  const openAuth = useCallback((options?: OpenAuthOptions) => {
    setMode(options?.mode ?? "sign-in");
    setCallbackUrl(options?.callbackUrl ?? null);
    setIntent(options?.intent ?? null);
    setSignupPrefill(options?.signupPrefill ?? null);
    setPhase("auth");
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setOpen(false);
    setPhase("auth");
  }, []);

  const onFunnelComplete = useCallback(
    (result: { showTour: boolean; mlsNumber: string | null }) => {
      const viewListing = intent === "VIEW_LISTING";
      setOpen(false);
      setPhase("auth");
      if (viewListing && result.showTour && result.mlsNumber) {
        setTourPrompt({ mlsNumber: result.mlsNumber });
      }
    },
    [intent],
  );

  useEffect(() => {
    if (!open) return;
    return acquireScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open || intent === "VIEW_LISTING" || phase === "funnel") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeAuth();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeAuth, intent, phase]);

  useEffect(() => {
    function onOpenSignIn() {
      openAuth({ mode: "sign-in" });
    }
    window.addEventListener("houzzat:open-sign-in", onOpenSignIn);
    return () => window.removeEventListener("houzzat:open-sign-in", onOpenSignIn);
  }, [openAuth]);

  // Bridge SignUpForm success → funnel without prop drilling phase setter into form.
  useEffect(() => {
    function onCaptured() {
      setPhase("funnel");
      setOpen(true);
    }
    window.addEventListener("houzzat:lead-captured", onCaptured);
    return () => window.removeEventListener("houzzat:lead-captured", onCaptured);
  }, []);

  const value = useMemo(
    () => ({
      open,
      mode,
      callbackUrl,
      intent,
      signupPrefill,
      openAuth,
      closeAuth,
      setMode,
    }),
    [open, mode, callbackUrl, intent, signupPrefill, openAuth, closeAuth],
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModalPanel phase={phase} onFunnelComplete={onFunnelComplete} />
      {tourPrompt ? (
        <TourThisHomePrompt mlsNumber={tourPrompt.mlsNumber} />
      ) : null}
    </AuthModalContext.Provider>
  );
}
