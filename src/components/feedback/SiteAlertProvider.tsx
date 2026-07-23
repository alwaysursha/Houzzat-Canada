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
  resolve: (value: boolean) => void;
};

type SiteAlertRequest = AlertRequest | ConfirmRequest;

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
  }) => Promise<boolean>;
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
          <Button type="button" onClick={() => onClose(true)}>
            {request.confirmLabel ??
              (request.kind === "confirm" ? "Continue" : "OK")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SiteAlertProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<SiteAlertRequest | null>(null);
  const queueRef = useRef<SiteAlertRequest[]>([]);

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
      else if (confirmed) current.resolve();
      else current.resolve();
      showNext();
    },
    [showNext],
  );

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
    }) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          kind: "confirm",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel,
          cancelLabel: options.cancelLabel,
          resolve,
        });
      }),
    [enqueue],
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

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return (
    <SiteAlertContext.Provider value={value}>
      {children}
      {request ? (
        <SiteAlertPanel request={request} onClose={finish} />
      ) : null}
    </SiteAlertContext.Provider>
  );
}
