"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AlertRequest = {
  kind: "alert";
  title: string;
  message?: string;
  confirmLabel?: string;
  resolve: () => void;
};

type ConfirmRequest = {
  kind: "confirm";
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (value: boolean) => void;
};

type SiteAlertRequest = AlertRequest | ConfirmRequest;

export type SiteToastTone = "success" | "error" | "info";

type SiteToast = {
  id: number;
  message: string;
  title?: string;
  tone: SiteToastTone;
};

type SiteAlertContextValue = {
  alert: (options: {
    title: string;
    message?: string;
    confirmLabel?: string;
  }) => Promise<void>;
  confirm: (options: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  toast: (options: {
    message: string;
    title?: string;
    tone?: SiteToastTone;
    durationMs?: number;
  }) => void;
};

const SiteAlertContext = createContext<SiteAlertContextValue | null>(null);

export function useSiteAlert() {
  const ctx = useContext(SiteAlertContext);
  if (!ctx) {
    throw new Error("useSiteAlert must be used within SiteAlertProvider");
  }
  return ctx;
}

function SiteAlertPanel({
  request,
  onClose,
}: {
  request: SiteAlertRequest;
  onClose: (confirmed: boolean) => void;
}) {
  const titleId = "site-alert-title";
  const destructive = request.kind === "confirm" && request.destructive;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
        aria-label="Dismiss"
        onClick={() => onClose(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-display text-2xl text-ink">
            {request.title}
          </h2>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink/70 transition hover:bg-mist"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {request.message ? (
          <p className="px-5 pt-4 text-sm leading-relaxed text-ink/70">
            {request.message}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 px-5 py-5">
          {request.kind === "confirm" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onClose(false)}
            >
              {request.cancelLabel ?? "Not now"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={destructive ? "danger" : "default"}
            onClick={() => onClose(true)}
          >
            {request.confirmLabel ??
              (request.kind === "confirm" ? "Continue" : "OK")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SiteToastStack({
  toasts,
  onDismiss,
}: {
  toasts: SiteToast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[115] flex flex-col items-center gap-2 px-4 pb-2 pt-2 bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.5rem))] md:bottom-6 md:pb-0"
      aria-live="polite"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-3.5 py-3 shadow-lg backdrop-blur-md transition",
            item.tone === "success" &&
              "border-canopy/35 bg-surface text-canopy-deep",
            item.tone === "error" &&
              "border-danger/35 bg-surface text-danger",
            item.tone === "info" && "border-line bg-ink text-white",
          )}
        >
          <div className="min-w-0 flex-1">
            {item.title ? (
              <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70">
                {item.title}
              </p>
            ) : null}
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                item.title && "mt-0.5",
              )}
            >
              {item.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition",
              item.tone === "info"
                ? "text-white/70 hover:bg-white/10 hover:text-white"
                : "text-ink/45 hover:bg-mist hover:text-ink",
            )}
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SiteAlertProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<SiteAlertRequest | null>(null);
  const [toasts, setToasts] = useState<SiteToast[]>([]);
  const queueRef = useRef<SiteAlertRequest[]>([]);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef<Map<number, number>>(new Map());

  const showNext = useCallback(() => {
    setRequest(queueRef.current[0] ?? null);
  }, []);

  const enqueue = useCallback(
    (next: SiteAlertRequest) => {
      queueRef.current.push(next);
      if (queueRef.current.length === 1) showNext();
    },
    [showNext],
  );

  const finish = useCallback(
    (confirmed: boolean) => {
      const current = queueRef.current.shift();
      if (!current) return;
      if (current.kind === "confirm") current.resolve(confirmed);
      else current.resolve();
      showNext();
    },
    [showNext],
  );

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const alert = useCallback(
    (options: {
      title: string;
      message?: string;
      confirmLabel?: string;
    }) =>
      new Promise<void>((resolve) => {
        enqueue({
          kind: "alert",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel,
          resolve,
        });
      }),
    [enqueue],
  );

  const confirm = useCallback(
    (options: {
      title: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
    }) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          kind: "confirm",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel,
          cancelLabel: options.cancelLabel,
          destructive: options.destructive,
          resolve,
        });
      }),
    [enqueue],
  );

  const toast = useCallback(
    (options: {
      message: string;
      title?: string;
      tone?: SiteToastTone;
      durationMs?: number;
    }) => {
      const id = ++toastIdRef.current;
      const tone = options.tone ?? "info";
      const durationMs = options.durationMs ?? 3200;
      setToasts((prev) => [
        ...prev.slice(-2),
        {
          id,
          message: options.message,
          title: options.title,
          tone,
        },
      ]);
      const timer = window.setTimeout(() => dismissToast(id), durationMs);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    if (!request) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [request, finish]);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ alert, confirm, toast }),
    [alert, confirm, toast],
  );

  return (
    <SiteAlertContext.Provider value={value}>
      {children}
      {request ? (
        <SiteAlertPanel request={request} onClose={finish} />
      ) : null}
      <SiteToastStack toasts={toasts} onDismiss={dismissToast} />
    </SiteAlertContext.Provider>
  );
}
