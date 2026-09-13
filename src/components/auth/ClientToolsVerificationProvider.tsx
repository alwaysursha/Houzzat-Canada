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
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { acquireScrollLock } from "@/lib/scroll-lock";

type OpenOptions = {
  callbackUrl?: string | null;
};

type ClientToolsVerificationContextValue = {
  openClientToolsVerification: (options?: OpenOptions) => void;
};

const ClientToolsVerificationContext =
  createContext<ClientToolsVerificationContextValue | null>(null);

export function useClientToolsVerification() {
  const ctx = useContext(ClientToolsVerificationContext);
  if (!ctx) {
    throw new Error(
      "useClientToolsVerification must be used within ClientToolsVerificationProvider",
    );
  }
  return ctx;
}

function ClientToolsVerificationPanel({
  open,
  callbackUrl,
  onClose,
}: {
  open: boolean;
  callbackUrl: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    return acquireScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
        aria-label="Close verification"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-tools-verify-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6"
      >
        <h2 id="client-tools-verify-title" className="sr-only">
          Please verify your email to continue
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink/50 transition hover:bg-mist hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
        <EmailVerificationRequired
          purpose="client-tools"
          variant="featured"
          compact
          icon="mail"
          eyebrow="Account access"
          callbackUrl={callbackUrl ?? undefined}
        />
      </div>
    </div>
  );
}

export function ClientToolsVerificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  const openClientToolsVerification = useCallback((options?: OpenOptions) => {
    setCallbackUrl(options?.callbackUrl ?? null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo(
    () => ({ openClientToolsVerification }),
    [openClientToolsVerification],
  );

  return (
    <ClientToolsVerificationContext.Provider value={value}>
      {children}
      <ClientToolsVerificationPanel
        open={open}
        callbackUrl={callbackUrl}
        onClose={close}
      />
    </ClientToolsVerificationContext.Provider>
  );
}
