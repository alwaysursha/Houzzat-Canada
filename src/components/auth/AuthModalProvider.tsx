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
import { AuthBenefitsPanel } from "@/components/auth/AuthBenefitsPanel";
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

function AuthModalPanel() {
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
  const compactBenefits = <AuthBenefitsPanel variant="compact" />;

  function selectMode(next: AuthMode) {
    if (next === "sign-up") setAuthNotice(null);
    if (next === "sign-in" && signupEmail.trim()) {
      setPrefillEmail(signupEmail.trim());
    }
    setMode(next);
  }

  const forms = (
    <>
      {mode === "sign-in" ? (
        <SignInForm
          callbackUrl={callbackUrl}
          initialEmail={prefillEmail}
          notice={authNotice}
          onSuccess={closeAuth}
          onSwitchMode={() => setMode("sign-up")}
          afterConsent={copy ? <div className="lg:hidden">{compactBenefits}</div> : compactBenefits}
        />
      ) : (
        <SignUpForm
          callbackUrl={callbackUrl}
          displayName={displayName}
          initialName={signupName}
          initialEmail={signupEmail}
          focusPassword={Boolean(signupPrefill)}
          onIdentityChange={(next) => {
            setSignupName(next.name);
            setSignupEmail(next.email);
          }}
          onSuccess={closeAuth}
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
          afterConsent={copy ? <div className="lg:hidden">{compactBenefits}</div> : compactBenefits}
        />
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-4 sm:py-8">
      {listingGate ? (
        <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" />
      ) : (
        <button
          type="button"
          className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
          aria-label="Close sign in"
          onClick={closeAuth}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl",
          copy ? "max-w-4xl" : "max-h-[min(78vh,38rem)] max-w-md",
        )}
        style={
          copy
            ? { maxWidth: 880, maxHeight: "min(78vh, calc(100dvh - 2rem))" }
            : undefined
        }
      >
        {copy ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="lg:grid lg:min-h-full lg:grid-cols-2">
              <div className="border-b border-line bg-mist px-5 py-5 lg:border-b-0 lg:border-r lg:px-8 lg:py-8">
                <TenantHeaderBrand
                  displayName={brand?.displayName?.trim() || ""}
                  logoUrl={brand?.logoUrl ?? null}
                  primaryColor={brand?.colors.primary}
                  showLogoMark={Boolean(brand && !brand.isHouzzatWorkspace)}
                />
                <h2
                  id="auth-modal-title"
                  className="mt-4 font-display text-xl leading-tight text-ink lg:mt-6 lg:text-3xl"
                >
                  {copy.headline}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/70">{copy.subhead}</p>
                <div className="mt-6 hidden lg:block">
                  <AuthBenefitsPanel />
                </div>
              </div>
              <div className="flex flex-col">
                <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3.5 sm:px-5">
                  <AuthModalTabs mode={mode} signInLabel={signInLabel} onMode={selectMode} />
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
                <div className="px-5 py-5">{forms}</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <h2 id="auth-modal-title" className="sr-only">
              {mode === "sign-in" ? signInLabel : "Sign up"}
            </h2>
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <AuthModalTabs mode={mode} signInLabel={signInLabel} onMode={selectMode} />
              <button
                type="button"
                onClick={closeAuth}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink/70 transition hover:bg-mist"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{forms}</div>
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

  const openAuth = useCallback((options?: OpenAuthOptions) => {
    setMode(options?.mode ?? "sign-in");
    setCallbackUrl(options?.callbackUrl ?? null);
    setIntent(options?.intent ?? null);
    setSignupPrefill(options?.signupPrefill ?? null);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    return acquireScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open || intent === "VIEW_LISTING") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeAuth();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeAuth, intent]);

  useEffect(() => {
    function onOpenSignIn() {
      openAuth({ mode: "sign-in" });
    }
    window.addEventListener("houzzat:open-sign-in", onOpenSignIn);
    return () => window.removeEventListener("houzzat:open-sign-in", onOpenSignIn);
  }, [openAuth]);

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
      <AuthModalPanel />
    </AuthModalContext.Provider>
  );
}
