"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  BOOK_DEMO_TURNSTILE_ACTION,
  BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
} from "@/lib/platform/public/turnstile-constants";

type TurnstileApi = {
  render: (
    element: string | HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-api";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script")), {
        once: true,
      });
      if (window.turnstile) resolve();
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script"));
    document.head.appendChild(script);
  });
}

type BookDemoTurnstileProps = {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
  resetSignal: number;
  /** Defaults to Book a Demo action. Pass form-specific actions for other public flows. */
  action?: string;
  errorMessage?: string;
};

export function BookDemoTurnstile({
  siteKey,
  onTokenChange,
  resetSignal,
  action = BOOK_DEMO_TURNSTILE_ACTION,
  errorMessage = BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
}: BookDemoTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reactId = useId();
  const containerId = `book-demo-turnstile-${reactId.replace(/:/g, "")}`;

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  const resetWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // ignore
      }
    }
    onTokenChangeRef.current(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      setLoadError(null);
      try {
        await loadTurnstileScript();
        if (cancelled || !containerRef.current || !window.turnstile) return;

        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore
          }
          widgetIdRef.current = null;
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          callback: (token: string) => {
            onTokenChangeRef.current(token);
          },
          "error-callback": () => {
            onTokenChangeRef.current(null);
            setLoadError(errorMessage);
          },
          "expired-callback": () => {
            onTokenChangeRef.current(null);
          },
        });
      } catch {
        if (!cancelled) {
          setLoadError(errorMessage);
        }
      }
    }

    void mount();

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action, errorMessage]);

  useEffect(() => {
    if (resetSignal > 0) {
      resetWidget();
    }
  }, [resetSignal, resetWidget]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Security verification</p>
      <div
        id={containerId}
        ref={containerRef}
        className="min-h-[65px] overflow-x-auto"
      />
      {loadError ? (
        <p className="text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
