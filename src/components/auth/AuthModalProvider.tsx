"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { X } from "lucide-react";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { cn } from "@/lib/utils";

export type AuthMode = "sign-in" | "sign-up";

type OpenAuthOptions = {
  mode?: AuthMode;
  callbackUrl?: string | null;
};

type AuthModalContextValue = {
  open: boolean;
  mode: AuthMode;
  callbackUrl: string | null;
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

function AuthModalPanel() {
  const { open, mode, callbackUrl, closeAuth, setMode } = useAuthModal();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
        aria-label="Close sign in"
        onClick={closeAuth}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative z-10 flex h-[min(78vh,38rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <h2 id="auth-modal-title" className="sr-only">
          {mode === "sign-in" ? "Sign in" : "Sign up"}
        </h2>
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div
            className="grid min-w-0 flex-1 grid-cols-2 rounded-xl bg-mist p-1"
            role="tablist"
            aria-label="Account"
          >
            {(
              [
                ["sign-in", "Sign in"],
                ["sign-up", "Sign up"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
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
              onSuccess={closeAuth}
              onSwitchMode={() => setMode("sign-up")}
            />
          ) : (
            <SignUpForm
              callbackUrl={callbackUrl}
              onSuccess={closeAuth}
              onSwitchMode={() => setMode("sign-in")}
            />
          )}
          <p className="mt-5 text-xs text-ink/45">
            Demo: admin@houzzat.ca / agent@houzzat.ca / customer@houzzat.ca —
            password123
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  const openAuth = useCallback((options?: OpenAuthOptions) => {
    setMode(options?.mode ?? "sign-in");
    setCallbackUrl(options?.callbackUrl ?? null);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeAuth();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeAuth]);

  const value = useMemo(
    () => ({
      open,
      mode,
      callbackUrl,
      openAuth,
      closeAuth,
      setMode,
    }),
    [open, mode, callbackUrl, openAuth, closeAuth],
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModalPanel />
    </AuthModalContext.Provider>
  );
}
